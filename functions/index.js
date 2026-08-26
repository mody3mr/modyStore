const { onValueCreated } = require('firebase-functions/v2/database');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const crypto = require('crypto');

admin.initializeApp();
const db = admin.database();
const messaging = admin.messaging();

const PAYMOB_SECRET_KEY = defineSecret('PAYMOB_SECRET_KEY');
const PAYMOB_HMAC_SECRET = defineSecret('PAYMOB_HMAC_SECRET');
const PAYMOB_PUBLIC_KEY = defineSecret('PAYMOB_PUBLIC_KEY');
const PAYMOB_INTEGRATION_ID_CARD = defineSecret('PAYMOB_INTEGRATION_ID_CARD');
const PAYMOB_BASE_URL = defineSecret('PAYMOB_BASE_URL');
const PAYMOB_WEBHOOK_URL = defineSecret('PAYMOB_WEBHOOK_URL');
const PAYMOB_REDIRECT_URL = defineSecret('PAYMOB_REDIRECT_URL');

exports.notifyNewOrder = onValueCreated('/orders/{orderId}', async (event) => {
  const order = event.data.val();
  if (!order) return null;

  const snap = await db.ref('pushTokens').get();
  if (!snap.exists()) return null;

  const tokens = [];
  snap.forEach(userNode => {
    userNode.forEach(tokenNode => {
      const value = tokenNode.val();
      if (value?.token) tokens.push(value.token);
    });
  });

  const uniqueTokens = [...new Set(tokens)];
  if (!uniqueTokens.length) return null;

  const title = `طلب جديد #${order.displayId || order.orderId || event.params.orderId}`;
  const itemCount = Array.isArray(order.items)
    ? order.items.reduce((sum, item) => sum + Number(item.qty || 0), 0)
    : 0;
  const body = `${order.customer?.name || 'عميل'} — ${itemCount} قطعة — ${Math.round(Number(order.total || 0))} ج.م`;

  const response = await messaging.sendEachForMulticast({
    tokens: uniqueTokens,
    notification: { title, body },
    data: {
      type: 'new_order',
      orderDbId: String(event.params.orderId),
      orderId: String(order.orderId || order.displayId || event.params.orderId),
      url: './index.html'
    },
    webpush: {
      fcmOptions: { link: './index.html' }
    }
  });

  const invalid = [];
  response.responses.forEach((r, i) => {
    if (!r.success && [
      'messaging/registration-token-not-registered',
      'messaging/invalid-registration-token'
    ].includes(r.error?.code)) invalid.push(uniqueTokens[i]);
  });

  if (invalid.length) {
    const tokenRoot = await db.ref('pushTokens').get();
    const updates = {};
    tokenRoot.forEach(userNode => {
      userNode.forEach(tokenNode => {
        if (invalid.includes(tokenNode.val()?.token)) {
          updates[`pushTokens/${userNode.key}/${tokenNode.key}`] = null;
        }
      });
    });
    if (Object.keys(updates).length) await db.ref().update(updates);
  }
  return null;
});

exports.expireProductOffers = onSchedule(
  { schedule: 'every 5 minutes', timeZone: 'Africa/Cairo', region: 'us-central1' },
  async () => {
    const snap = await db.ref('products').get();
    if (!snap.exists()) return null;
    const updates = {};
    const now = Date.now();
    snap.forEach(node => {
      const p = node.val() || {};
      if (p.offerEndAt && Number(p.offerEndAt) <= now) {
        updates[`products/${node.key}/discountPrice`] = null;
        updates[`products/${node.key}/offerEndAt`] = null;
        updates[`products/${node.key}/offerStartAt`] = null;
        updates[`products/${node.key}/offerDuration`] = null;
        updates[`products/${node.key}/offerUnit`] = null;
      }
    });
    if (Object.keys(updates).length) await db.ref().update(updates);
    return null;
  }
);

function paymobBaseUrl() {
  return (PAYMOB_BASE_URL.value() || 'https://accept.paymob.com').replace(/\/+$/, '');
}

function paymobString(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object' && value.id !== undefined) return String(value.id);
  return String(value);
}

function verifyPaymobHmac(obj, received) {
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
    obj.order?.id,
    obj.owner,
    obj.pending,
    obj.source_data?.pan,
    obj.source_data?.sub_type,
    obj.source_data?.type,
    obj.success
  ];
  const computed = crypto
    .createHmac('sha512', PAYMOB_HMAC_SECRET.value())
    .update(fields.map(paymobString).join(''))
    .digest('hex');

  const a = Buffer.from(computed, 'utf8');
  const b = Buffer.from(String(received || ''), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

exports.createPaymobCheckout = onRequest(
  {
    cors: true,
    region: 'us-central1',
    secrets: [
      PAYMOB_SECRET_KEY,
      PAYMOB_PUBLIC_KEY,
      PAYMOB_INTEGRATION_ID_CARD,
      PAYMOB_BASE_URL,
      PAYMOB_WEBHOOK_URL,
      PAYMOB_REDIRECT_URL
    ]
  },
  async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    try {
      const body = req.body || {};
      const orderId = String(body.orderId || '').trim();
      const customer = body.customer || {};
      const items = Array.isArray(body.items) ? body.items : [];
      const amount = Math.round(Number(body.amount || 0) * 100);

      if (!orderId || !amount || !customer.phone || !items.length) {
        return res.status(400).json({ error: 'orderId, amount, customer.phone and items are required' });
      }

      const integrationId = Number(PAYMOB_INTEGRATION_ID_CARD.value());
      if (!integrationId) return res.status(500).json({ error: 'Missing PAYMOB_INTEGRATION_ID_CARD secret' });

      const payload = {
        amount,
        currency: 'EGP',
        payment_methods: [integrationId],
        items: items.map(i => ({
          name: String(i.name || 'Product'),
          amount: Math.round(Number(i.price || 0) * 100),
          description: String(i.description || i.name || 'Product'),
          quantity: Math.max(1, Number(i.quantity || i.qty || 1))
        })),
        billing_data: {
          first_name: String(customer.firstName || customer.name || 'Customer').split(' ')[0] || 'Customer',
          last_name: String(customer.lastName || 'NA'),
          email: String(customer.email || 'noemail@example.com'),
          phone_number: String(customer.phone),
          apartment: String(customer.apartment || 'NA'),
          floor: String(customer.floor || 'NA'),
          street: String(customer.street || customer.address || 'NA'),
          building: String(customer.building || 'NA'),
          shipping_method: 'NA',
          postal_code: String(customer.postalCode || 'NA'),
          city: String(customer.city || 'NA'),
          country: 'EG',
          state: String(customer.state || customer.city || 'NA')
        },
        customer: {
          first_name: String(customer.firstName || customer.name || 'Customer').split(' ')[0] || 'Customer',
          last_name: String(customer.lastName || 'NA'),
          email: String(customer.email || 'noemail@example.com')
        },
        special_reference: orderId,
        notification_url: PAYMOB_WEBHOOK_URL.value(),
        redirection_url: PAYMOB_REDIRECT_URL.value()
      };

      const response = await fetch(`${paymobBaseUrl()}/v1/intention/`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${PAYMOB_SECRET_KEY.value()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.error('Paymob intention failed', response.status, data);
        return res.status(response.status).json({ error: 'Paymob intention failed', details: data });
      }

      const checkoutUrl =
        `${paymobBaseUrl()}/unifiedcheckout/?publicKey=${encodeURIComponent(PAYMOB_PUBLIC_KEY.value())}` +
        `&clientSecret=${encodeURIComponent(data.client_secret)}`;

      // Correlate the payment attempt with the local order.
      const orderSnap = await db.ref('orders').get();
      if (orderSnap.exists()) {
        let matchedKey = null;
        orderSnap.forEach(node => {
          const o = node.val() || {};
          if (String(o.orderId || o.displayId || '') === orderId) matchedKey = node.key;
        });
        if (matchedKey) {
          await db.ref(`orders/${matchedKey}`).update({
            paymentMethod: 'Paymob',
            paymentStatus: 'pending',
            paymobIntentionId: data.id || null,
            paymobUpdatedAt: Date.now()
          });
        }
      }

      return res.json({
        id: data.id,
        clientSecret: data.client_secret,
        checkoutUrl
      });
    } catch (error) {
      console.error('createPaymobCheckout error', error);
      return res.status(500).json({ error: error.message || 'Paymob integration error' });
    }
  }
);

exports.paymobWebhook = onRequest(
  { cors: false, region: 'us-central1', secrets: [PAYMOB_HMAC_SECRET] },
  async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    try {
      const obj = req.body?.obj;
      const receivedHmac = String(req.query?.hmac || '');
      if (!obj || !verifyPaymobHmac(obj, receivedHmac)) {
        console.warn('Invalid Paymob HMAC');
        return res.status(401).json({ error: 'Invalid HMAC' });
      }

      const transactionId = String(obj.id);
      const merchantReference = String(
        obj.order?.merchant_order_id ||
        obj.order?.merchant_order_id?.toString?.() ||
        ''
      );

      const orderSnap = await db.ref('orders').get();
      if (orderSnap.exists()) {
        let matchedKey = null;
        orderSnap.forEach(node => {
          const o = node.val() || {};
          if (
            (merchantReference && String(o.orderId || o.displayId || '') === merchantReference) ||
            String(o.paymobTransactionId || '') === transactionId
          ) matchedKey = node.key;
        });

        if (matchedKey) {
          const paid = obj.success === true && obj.pending === false && obj.error_occured === false;
          const updates = {
            paymobTransactionId: transactionId,
            paymentStatus: paid ? 'paid' : (obj.is_refunded ? 'refunded' : 'failed'),
            paymobLastCallbackAt: Date.now(),
            paymobSuccess: !!obj.success
          };
          if (paid) updates.status = 'جاري التجهيز';
          await db.ref(`orders/${matchedKey}`).update(updates);
        }
      }

      return res.status(200).json({ received: true });
    } catch (error) {
      console.error('paymobWebhook error', error);
      return res.status(500).json({ error: 'Webhook processing failed' });
    }
  }
);
