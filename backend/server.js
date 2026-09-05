require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
const admin = require('firebase-admin');
let whatsappConfirmationRouter = null;
try {
    whatsappConfirmationRouter = require('../whatsapp-confirmation-route.example');
} catch (error) {
    console.warn('WhatsApp confirmation route is unavailable; bridge disabled.', error.message);
}

const app = express();
const PORT = Number(process.env.PORT || 3000);
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
const PAYMOB_BASE_URL = (process.env.PAYMOB_BASE_URL || 'https://accept.paymob.com').replace(/\/$/, '');
const PAYMOB_SECRET_KEY = process.env.PAYMOB_SECRET_KEY || '';
const PAYMOB_PUBLIC_KEY = process.env.PAYMOB_PUBLIC_KEY || '';
const PAYMOB_HMAC_SECRET = process.env.PAYMOB_HMAC_SECRET || '';
const PAYMOB_INTEGRATION_IDS = (process.env.PAYMOB_INTEGRATION_IDS || '')
    .split(',').map(v => Number(v.trim())).filter(Number.isFinite);
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

function initFirebase() {
    if (admin.apps.length) return admin.app();
    let credential;
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON));
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        credential = admin.credential.applicationDefault();
    } else {
        throw new Error('Firebase Admin credentials are missing. Set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS.');
    }
    admin.initializeApp({
        credential,
        databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://modytech-850c2-default-rtdb.firebaseio.com'
    });
    return admin.app();
}

initFirebase();
const db = admin.database();

app.use(cors({ origin: true, methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type'] }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
// Optional WhatsApp confirmation bridge used by the dashboard settings.
// It remains inert until META_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID are configured.
if (whatsappConfirmationRouter) app.use('/whatsapp', whatsappConfirmationRouter);

function clean(value, fallback = '') {
    return String(value ?? fallback).trim();
}

function makeOrderId() {
    return Math.floor(10000000 + Math.random() * 90000000).toString();
}

function splitName(fullName) {
    const parts = clean(fullName).split(/\s+/).filter(Boolean);
    const first_name = parts.shift() || 'Customer';
    const last_name = parts.join(' ') || 'NA';
    return { first_name, last_name };
}

function normalizePhone(phone) {
    const raw = clean(phone).replace(/[^0-9+]/g, '');
    if (raw.startsWith('+20')) return raw;
    if (raw.startsWith('20')) return `+${raw}`;
    if (raw.startsWith('0')) return `+20${raw.slice(1)}`;
    return raw ? `+${raw}` : '+20000000000';
}

function safeEqualHex(a, b) {
    if (!a || !b) return false;
    const aa = Buffer.from(String(a).toLowerCase(), 'utf8');
    const bb = Buffer.from(String(b).toLowerCase(), 'utf8');
    return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function validatePaymobTransactionHmac(obj, receivedHmac) {
    if (!PAYMOB_HMAC_SECRET) return false;
    const fields = [
        obj.amount_cents,
        obj.created_at,
        obj.currency,
        obj.error_occured,
        obj.has_parent_transaction,
        obj.id,
        obj.integration_id,
        obj.is_3d_secure,
        obj.is_auth,
        obj.is_capture,
        obj.is_refunded,
        obj.is_standalone_payment,
        obj.is_voided,
        obj.order && obj.order.id,
        obj.owner,
        obj.pending,
        obj.source_data && obj.source_data.pan,
        obj.source_data && obj.source_data.sub_type,
        obj.source_data && obj.source_data.type,
        obj.success
    ];
    if (fields.some(v => v === undefined || v === null)) return false;
    const message = fields.map(v => typeof v === 'boolean' ? String(v).toLowerCase() : String(v)).join('');
    const computed = crypto.createHmac('sha512', PAYMOB_HMAC_SECRET).update(message).digest('hex');
    return safeEqualHex(computed, receivedHmac);
}

async function sendTelegram(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'Markdown' })
    });
    if (!response.ok) {
        const body = await response.text().catch(() => '');
        console.error('Telegram error:', response.status, body);
    }
}

async function getShippingCost(city) {
    const snapshot = await db.ref('shipping').once('value');
    if (!snapshot.exists()) throw new Error('بيانات الشحن غير متاحة حالياً.');
    let found = null;
    snapshot.forEach(child => {
        const value = child.val() || {};
        if (value.isActive !== false && clean(value.name) === clean(city)) found = Number(value.price) || 0;
    });
    if (found === null) throw new Error('المحافظة/المدينة المختارة غير متاحة حالياً.');
    return found;
}

async function calculateOrder(body) {
    const itemsInput = Array.isArray(body.items) ? body.items : [];
    if (!itemsInput.length) throw new Error('السلة فارغة.');

    const productsSnap = await db.ref('products').once('value');
    if (!productsSnap.exists()) throw new Error('المنتجات غير متاحة حالياً.');
    const products = productsSnap.val() || {};

    const items = [];
    let subtotal = 0;
    for (const raw of itemsInput) {
        const id = clean(raw.id);
        const qty = Math.max(1, Math.floor(Number(raw.qty) || 0));
        const product = products[id];
        if (!product || product.isActive === false) throw new Error('أحد المنتجات لم يعد متاحاً.');
        const stock = Number(product.stock) || 0;
        if (qty > stock) throw new Error(`الكمية المطلوبة من ${product.name || 'المنتج'} أكبر من المخزون المتاح.`);
        // Timed offers are authoritative in the dashboard. Once offerEndAt
        // passes, both the storefront and backend must fall back to base price.
        const discountPrice = Number(product.discountPrice || 0);
        const offerEndAt = Number(product.offerEndAt || 0);
        const hasActiveOffer = discountPrice > 0 && (!offerEndAt || offerEndAt > Date.now());
        const price = hasActiveOffer ? discountPrice : Number(product.price || 0);
        if (price < 0) throw new Error('سعر منتج غير صالح.');
        items.push({ id, name: clean(product.name, 'منتج'), price, qty, imageUrl: product.imageUrl || '' });
        subtotal += price * qty;
    }

    const customer = body.customer || {};
    const shippingCost = await getShippingCost(customer.city);

    let discount = 0;
    let voucher = null;
    const voucherCode = clean(body.voucherCode).toUpperCase();
    if (voucherCode) {
        const vouchersSnap = await db.ref('vouchers').once('value');
        if (vouchersSnap.exists()) {
            vouchersSnap.forEach(child => {
                const v = child.val() || {};
                if (!voucher && v.isActive && clean(v.code).toUpperCase() === voucherCode) voucher = { id: child.key, ...v };
            });
        }
        if (!voucher) throw new Error('كود الخصم غير صالح أو منتهي.');
        discount = voucher.type === 'percentage' ? subtotal * ((Number(voucher.value) || 0) / 100) : Number(voucher.value) || 0;
        discount = Math.min(Math.max(discount, 0), subtotal);
    }

    const total = Math.max(0, subtotal + shippingCost - discount);
    return { items, subtotal, shippingCost, discount, total, voucher };
}

async function decrementStock(items) {
    for (const item of items) {
        const result = await db.ref(`products/${item.id}/stock`).transaction(current => {
            const stock = Number(current) || 0;
            if (stock < item.qty) return;
            return stock - item.qty;
        });
        if (!result.committed) throw new Error(`المخزون لم يعد كافياً للمنتج: ${item.name}`);
    }
}

async function addVoucherUsage(voucher, customer, orderId) {
    if (!voucher) return;
    await db.ref(`vouchers/${voucher.id}/usedBy`).push({
        name: customer.name,
        phone: customer.phone,
        orderId,
        timestamp: Date.now()
    });
}

function telegramOrderMessage(order) {
    const itemsText = order.items.map(item => `🔹 ${item.qty}x ${item.name} (${Math.round(item.price * item.qty)} ج)`).join('\n');
    const discountText = order.discount > 0 ? `\n🎁 *الخصم:* -${Math.round(order.discount)} ج.م` : '';
    return `🛍️ *طلب جديد #${order.orderId}*\n\n👤 *الاسم:* ${order.customer.name}\n📞 *التليفون:* ${order.customer.phone}${order.customer.phone2 ? ` / ${order.customer.phone2}` : ''}\n📍 *العنوان:* ${order.customer.city} - ${order.customer.region} - مبنى ${order.customer.building || '-'} دور ${order.customer.floor || '-'} شقة ${order.customer.apartment || '-'}\n🔖 *علامة مميزة:* ${order.customer.landmark || '-'}\n📝 *تفاصيل للوصول:* ${order.customer.address}\n💳 *الدفع:* ${order.paymentMethod}\n📦 *المنتجات:*\n${itemsText}\n💰 *الإجمالي الفرعي:* ${Math.round(order.subtotal)} ج.م\n🚚 *رسوم الشحن:* ${Math.round(order.shippingCost)} ج.م${discountText}\n🔥 *الإجمالي النهائي:* ${Math.round(order.total)} ج.م`;
}

app.use(express.static(path.join(__dirname, '..')));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'mody-store-backend', time: Date.now() }));

app.post('/api/orders', async (req, res) => {
    try {
        const body = req.body || {};
        const paymentMethod = clean(body.paymentMethod);
        const customer = body.customer || {};
        if (!clean(customer.name) || !clean(customer.phone) || !clean(customer.city) || !clean(customer.region) || !clean(customer.address)) {
            return res.status(400).json({ message: 'بيانات العميل الأساسية غير مكتملة.' });
        }
        if (!['كاش', 'Paymob', 'محفظة إلكترونية', 'إنستا باي', 'فيزا'].includes(paymentMethod)) {
            return res.status(400).json({ message: 'طريقة الدفع غير مدعومة.' });
        }
        const settingsSnap = await db.ref('storeSettings').once('value');
        if (settingsSnap.exists()) {
            const settings = settingsSnap.val() || {};
            const methods = settings.paymentMethods;
            if (methods && typeof methods === 'object') {
                const paymobEnabled = settings.paymob?.enabled === true;
                const allowed = paymentMethod === 'كاش' ? methods.cod !== false
                    : paymentMethod === 'محفظة إلكترونية' ? methods.wallet === true
                    : paymentMethod === 'إنستا باي' ? methods.instapay === true
                    : paymentMethod === 'فيزا' ? (methods.visa === true || paymobEnabled)
                    : paymobEnabled;
                if (!allowed) return res.status(400).json({ message: 'طريقة الدفع غير متاحة حالياً.' });
            }
        }

        const calculated = await calculateOrder(body);
        const orderId = makeOrderId();
        const isPaymob = paymentMethod === 'Paymob' || paymentMethod === 'فيزا' || paymentMethod === 'محفظة إلكترونية' || paymentMethod === 'إنستا باي';
        const order = {
            orderId,
            secretCode: orderId,
            source: 'الموقع الإلكتروني',
            customer: {
                name: clean(customer.name), phone: clean(customer.phone), phone2: clean(customer.phone2),
                city: clean(customer.city), region: clean(customer.region), building: clean(customer.building),
                floor: clean(customer.floor), apartment: clean(customer.apartment), landmark: clean(customer.landmark), address: clean(customer.address)
            },
            paymentMethod,
            paymentStatus: isPaymob ? 'pending' : 'cod_pending',
            items: calculated.items,
            subtotal: calculated.subtotal,
            shippingCost: calculated.shippingCost,
            discount: calculated.discount,
            total: calculated.total,
            status: 'قيد المراجعة',
            voucher: calculated.voucher ? { id: calculated.voucher.id, code: calculated.voucher.code } : null,
            createdAt: Date.now()
        };

        await db.ref(`orders/${orderId}`).set(order);

        if (!isPaymob) {
            await decrementStock(calculated.items);
            await addVoucherUsage(calculated.voucher, order.customer, orderId);
            order.stockDeducted = true;
            order.status = 'قيد المراجعة';
            await db.ref(`orders/${orderId}`).update({ stockDeducted: true, paymentStatus: 'cod_pending' });
            await sendTelegram(telegramOrderMessage(order));
            return res.json({ ok: true, orderId, paymentRequired: false });
        }

        if (!PAYMOB_SECRET_KEY || !PAYMOB_PUBLIC_KEY || !PAYMOB_INTEGRATION_IDS.length) {
            await db.ref(`orders/${orderId}`).update({ paymentStatus: 'configuration_error', status: 'ملغي' });
            return res.status(503).json({ message: 'Paymob غير مكتمل الإعداد على السيرفر. أضف مفاتيح Paymob و Integration ID في ملف البيئة.' });
        }

        const { first_name, last_name } = splitName(order.customer.name);
        const amountCents = Math.round(calculated.total * 100);
        const intentionPayload = {
            amount: amountCents,
            currency: 'EGP',
            payment_methods: PAYMOB_INTEGRATION_IDS,
            items: calculated.items.map(item => ({
                name: item.name.slice(0, 50),
                amount: Math.round(item.price * 100),
                description: 'Mody Store product',
                quantity: item.qty
            })),
            billing_data: {
                first_name, last_name,
                email: clean(customer.email, 'customer@example.com'),
                phone_number: normalizePhone(order.customer.phone),
                apartment: clean(customer.apartment, 'NA'),
                floor: clean(customer.floor, 'NA'),
                street: clean(customer.address, 'NA'),
                building: clean(customer.building, 'NA'),
                shipping_method: 'NA',
                postal_code: 'NA',
                city: clean(customer.city, 'NA'),
                country: 'EG',
                state: clean(customer.region, 'NA')
            },
            customer: { first_name, last_name, email: clean(customer.email, 'customer@example.com') },
            special_reference: orderId,
            notification_url: `${process.env.APP_URL || FRONTEND_URL}/api/paymob/webhook`,
            redirection_url: `${process.env.APP_URL || FRONTEND_URL}/payment/complete?orderId=${encodeURIComponent(orderId)}`
        };

        const paymobResponse = await fetch(`${PAYMOB_BASE_URL}/v1/intention/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Token ${PAYMOB_SECRET_KEY}` },
            body: JSON.stringify(intentionPayload)
        });
        const paymobData = await paymobResponse.json().catch(() => ({}));
        if (!paymobResponse.ok || !paymobData.client_secret) {
            console.error('Paymob intention error:', paymobResponse.status, paymobData);
            await db.ref(`orders/${orderId}`).update({ paymentStatus: 'failed_to_initialize', status: 'ملغي' });
            return res.status(502).json({ message: 'تعذر بدء عملية الدفع مع Paymob. تحقق من إعدادات Paymob وIntegration ID.' });
        }

        const checkoutUrl = `${PAYMOB_BASE_URL}/unifiedcheckout/?publicKey=${encodeURIComponent(PAYMOB_PUBLIC_KEY)}&clientSecret=${encodeURIComponent(paymobData.client_secret)}`;
        await db.ref(`orders/${orderId}`).update({
            paymentStatus: 'pending',
            paymob: { intentionId: paymobData.id || null, clientSecret: paymobData.client_secret, amountCents, checkoutUrl }
        });
        return res.json({ ok: true, orderId, paymentRequired: true, checkoutUrl });
    } catch (error) {
        console.error('Create order error:', error);
        return res.status(500).json({ message: error.message || 'حدث خطأ أثناء إنشاء الطلب.' });
    }
});

app.post('/api/paymob/webhook', async (req, res) => {
    try {
        const obj = req.body && req.body.obj;
        const receivedHmac = clean(req.query.hmac || req.body.hmac);
        if (!obj || !validatePaymobTransactionHmac(obj, receivedHmac)) {
            return res.status(401).json({ ok: false, message: 'Invalid HMAC' });
        }

        const orderId = clean(obj.order && obj.order.merchant_order_id);
        if (!orderId) return res.status(400).json({ ok: false, message: 'Missing merchant order id' });

        const orderRef = db.ref(`orders/${orderId}`);
        const orderSnap = await orderRef.once('value');
        if (!orderSnap.exists()) return res.status(404).json({ ok: false, message: 'Order not found' });
        const order = orderSnap.val();

        if (order.paymentStatus === 'paid' && order.stockDeducted) {
            return res.json({ ok: true, duplicate: true });
        }

        const claim = await orderRef.child('paymentStatus').transaction(current => {
            if (current !== 'pending') return;
            return 'processing';
        });
        if (!claim.committed) {
            return res.json({ ok: true, duplicate: true });
        }

        const success = obj.success === true || String(obj.success).toLowerCase() === 'true';
        const pending = obj.pending === true || String(obj.pending).toLowerCase() === 'true';
        const amountCents = Number(obj.amount_cents);
        if (amountCents !== Math.round(Number(order.total) * 100)) {
            await orderRef.update({ paymentStatus: 'amount_mismatch', status: 'ملغي', paymobTransactionId: obj.id || null });
            return res.status(400).json({ ok: false, message: 'Amount mismatch' });
        }

        if (!success || pending) {
            await orderRef.update({ paymentStatus: 'failed', status: 'ملغي', paymobTransactionId: obj.id || null, paymentUpdatedAt: Date.now() });
            return res.json({ ok: true, paid: false });
        }

        await decrementStock(order.items || []);
        await addVoucherUsage(order.voucher || null, order.customer || {}, orderId);
        await orderRef.update({
            paymentStatus: 'paid',
            paymentTransactionId: String(obj.id || ''),
            paymentUpdatedAt: Date.now(),
            stockDeducted: true,
            status: 'قيد المراجعة'
        });
        await sendTelegram(telegramOrderMessage({ ...order, paymentMethod: 'Paymob - تم الدفع', paymentStatus: 'paid' }));
        return res.json({ ok: true, paid: true });
    } catch (error) {
        console.error('Paymob webhook error:', error);
        return res.status(500).json({ ok: false });
    }
});

app.get('/api/orders/status/:orderId', async (req, res) => {
    try {
        const orderId = clean(req.params.orderId);
        const snap = await db.ref(`orders/${orderId}`).once('value');
        if (!snap.exists()) return res.status(404).json({ message: 'الطلب غير موجود.' });
        const order = snap.val();
        return res.json({ orderId, status: order.status, paymentStatus: order.paymentStatus || null, total: order.total });
    } catch (error) {
        return res.status(500).json({ message: 'تعذر قراءة حالة الطلب.' });
    }
});

app.get('/payment/complete', (req, res) => {
    const orderId = clean(req.query.orderId);
    const target = `${FRONTEND_URL}/?payment_return=1&orderId=${encodeURIComponent(orderId)}`;
    res.redirect(302, target);
});

app.listen(PORT, () => {
    console.log(`Mody Store backend running on port ${PORT}`);
});
