import { initializeApp } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-app.js";
import { getDatabase, ref, onValue, get, push } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyBzXZ-olKlD76cCw5dtp8IU1qZMSKSTi1g",
    authDomain: "modytech-850c2.firebaseapp.com",
    projectId: "modytech-850c2",
    storageBucket: "modytech-850c2.firebasestorage.app",
    messagingSenderId: "909293461306",
    appId: "1:909293461306:web:48e5492107ad32ceec7a03"
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// بيانات التليجرام بتاعتك
const TELEGRAM_BOT_TOKEN = "8578331488:AAG8XHQBN7TSduQ1ip5Fd8pHggSrf_kIn90"; 
const TELEGRAM_CHAT_ID = "5664540316";     

let allActiveProducts = [];
let cart = [];
let appliedVoucher = null; 

// 1. الأقسام
onValue(ref(db, 'categories'), (snapshot) => {
    const catBar = document.getElementById("catBar");
    catBar.innerHTML = `
        <button class="cat-btn active" onclick="filterBy('الكل', this)">الكل</button>
        <button class="cat-btn offers-btn" onclick="filterBy('عروض', this)"><i class="fas fa-fire"></i> عروض حصرية</button>
    `;
    if(snapshot.exists()){
        snapshot.forEach(child => {
            const c = child.val();
            if(c.isActive) {
                catBar.innerHTML += `<button class="cat-btn" onclick="filterBy('${c.name}', this)">${c.name}</button>`;
            }
        });
    }
});

// 2. المنتجات
onValue(ref(db, 'products'), (snapshot) => {
    allActiveProducts = [];
    if (snapshot.exists()) {
        snapshot.forEach(child => {
            const p = child.val();
            if (p.isActive) {
                p.id = child.key;
                p.effectivePrice = p.discountPrice ? p.discountPrice : p.price;
                allActiveProducts.push(p);
            }
        });
    }
    renderProducts("الكل");
});

window.renderProducts = (filterType) => {
    const grid = document.getElementById("productsGrid");
    grid.innerHTML = "";
    let filtered = [];

    if (filterType === "الكل") filtered = allActiveProducts;
    else if (filterType === "عروض") filtered = allActiveProducts.filter(p => p.discountPrice != null && p.discountPrice > 0);
    else filtered = allActiveProducts.filter(p => p.category === filterType);

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align:center; padding:60px 20px;">
                <i class="fas fa-box-open" style="font-size: 60px; color: var(--gray); margin-bottom: 20px;"></i>
                <h3 style="color: var(--text-light); font-weight: 800;">لا توجد منتجات في هذا القسم حالياً</h3>
            </div>`;
        return;
    }

    filtered.forEach(p => {
        let priceHtml = `<span class="product-price">${p.effectivePrice} <span>ج.م</span></span>`;
        let badgeHtml = "";
        
        if (p.discountPrice) {
            priceHtml = `<span class="product-price"><span class="old-price" style="font-size:16px;">${p.price}</span> ${p.discountPrice} <span>ج.م</span></span>`;
            badgeHtml = `<div class="discount-badge">خصم ${p.price - p.discountPrice} ج.م</div>`;
        }

        grid.innerHTML += `
            <div class="product-card" onclick="openProductDetails('${p.id}')">
                ${badgeHtml}
                <div class="product-img-wrapper">
                    <img src="${p.imageUrl}" class="product-img" onerror="this.src='https://via.placeholder.com/300x300?text=صورة+المنتج'">
                </div>
                <div class="product-details">
                    <div class="product-cat">${p.category}</div>
                    <h3 class="product-title">${p.name}</h3>
                    <div class="price-wrapper">${priceHtml}</div>
                    <button class="add-to-cart" onclick="event.stopPropagation(); addToCart('${p.id}', '${p.name}', ${p.effectivePrice}, '${p.imageUrl}')">
                        إضافة للسلة <i class="fas fa-cart-plus"></i>
                    </button>
                </div>
            </div>
        `;
    });
};

window.filterBy = (catName, btn) => {
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderProducts(catName);
};

// تفاصيل المنتج
window.openProductDetails = (id) => {
    const p = allActiveProducts.find(prod => prod.id === id);
    if(!p) return;

    document.getElementById('modalProductImg').src = p.imageUrl;
    document.getElementById('modalProductCat').innerText = p.category;
    document.getElementById('modalProductTitle').innerText = p.name;
    document.getElementById('modalProductDesc').innerText = p.description || 'لا توجد تفاصيل إضافية مسجلة لهذا المنتج.';

    let priceHtml = `<span class="product-price" style="font-size: 30px;">${p.effectivePrice} <span>ج.م</span></span>`;
    if (p.discountPrice) {
        priceHtml = `
            <span class="product-price" style="font-size: 30px;">${p.discountPrice} <span>ج.م</span></span>
            <span class="old-price" style="font-size: 20px; color: #94a3b8; margin-right: 15px;">${p.price} ج.م</span>
            <span style="background: var(--accent); color: white; padding: 4px 10px; border-radius: 6px; font-weight: bold; font-size: 13px; margin-right: 15px;">توفير ${p.price - p.discountPrice} ج.م</span>
        `;
    }
    document.getElementById('modalProductPriceWrapper').innerHTML = priceHtml;

    const addBtn = document.getElementById('modalAddBtn');
    addBtn.onclick = () => {
        addToCart(p.id, p.name, p.effectivePrice, p.imageUrl);
        closeProductModal();
    };

    document.getElementById('productDetailsModal').style.display = 'flex';
};

window.closeProductModal = () => {
    document.getElementById('productDetailsModal').style.display = 'none';
};

// 3. السلة
window.toggleCart = () => {
    document.getElementById("cartSidebar").classList.toggle("open");
    document.getElementById("overlay").classList.toggle("show");
};

window.addToCart = (id, name, price, img) => {
    const existingItem = cart.find(item => item.id === id);
    if (existingItem) existingItem.qty++;
    else cart.push({ id, name, price, img, qty: 1 });
    
    updateCartUI();
    document.getElementById("cartSidebar").classList.add("open");
    document.getElementById("overlay").classList.add("show");
};

window.updateQty = (id, change) => {
    const item = cart.find(item => item.id === id);
    if(item) {
        item.qty += change;
        if(item.qty <= 0) cart = cart.filter(i => i.id !== id);
        updateCartUI();
    }
};

window.removeFromCart = (id) => {
    cart = cart.filter(item => item.id !== id);
    updateCartUI();
};

function updateCartUI() {
    const container = document.getElementById("cartItemsContainer");
    container.innerHTML = "";
    let subtotal = 0; let count = 0;

    if(cart.length === 0) {
        container.innerHTML = `
            <div style='text-align:center; padding:60px 20px; color:var(--text-light);'>
                <i class="fas fa-shopping-basket" style="font-size: 60px; margin-bottom:20px; color: var(--gray);"></i>
                <p style="font-weight: 800; font-size:18px; color: var(--primary);">سلة مشترياتك فارغة</p>
                <p style="font-size:14px; margin-top:5px;">أضف بعض المنتجات للبدء</p>
            </div>`;
    } else {
        cart.forEach(item => {
            subtotal += (item.price * item.qty);
            count += item.qty;
            container.innerHTML += `
                <div class="cart-item">
                    <i class="fas fa-times remove-item" onclick="removeFromCart('${item.id}')"></i>
                    <img src="${item.img}" onerror="this.src='https://via.placeholder.com/100'">
                    <div class="cart-item-details">
                        <div class="cart-item-title">${item.name}</div>
                        <div class="cart-item-price">${item.price} ج.م</div>
                        <div class="qty-controls">
                            <button class="qty-btn" onclick="updateQty('${item.id}', 1)"><i class="fas fa-plus" style="font-size:10px;"></i></button>
                            <span class="qty-num">${item.qty}</span>
                            <button class="qty-btn" onclick="updateQty('${item.id}', -1)"><i class="fas fa-minus" style="font-size:10px;"></i></button>
                        </div>
                    </div>
                </div>
            `;
        });
    }
    document.getElementById("cartCountBadge").innerText = count;
    document.getElementById("subtotalPrice").innerText = subtotal + " ج.م";
    calculateFinalTotal(subtotal);
}

window.applyPromo = () => {
    const codeInput = document.getElementById("promoInput").value.trim().toUpperCase();
    const msgBox = document.getElementById("promoMessage");
    if(!codeInput) return;

    get(ref(db, 'vouchers')).then((snapshot) => {
        let foundVoucher = null;
        if(snapshot.exists()){
            snapshot.forEach(child => {
                const v = child.val();
                if(v.code === codeInput && v.isActive) foundVoucher = v;
            });
        }
        if(foundVoucher) {
            appliedVoucher = foundVoucher;
            msgBox.style.color = "var(--success)";
            msgBox.innerHTML = `<i class="fas fa-check-circle"></i> تم تطبيق الخصم بنجاح!`;
        } else {
            appliedVoucher = null;
            msgBox.style.color = "var(--accent)";
            msgBox.innerHTML = `<i class="fas fa-exclamation-circle"></i> الكود غير صحيح أو منتهي.`;
        }
        updateCartUI();
    });
};

function calculateFinalTotal(subtotal) {
    let discount = 0;
    const discountRow = document.getElementById("discountRow");

    if (appliedVoucher && subtotal > 0) {
        if (appliedVoucher.type === "percentage") discount = subtotal * (appliedVoucher.value / 100);
        else discount = appliedVoucher.value;
        if(discount > subtotal) discount = subtotal;

        document.getElementById("discountValue").innerText = `-${Math.round(discount)} ج.م`;
        discountRow.style.display = "flex";
    } else {
        discountRow.style.display = "none";
    }
    document.getElementById("finalTotalPrice").innerText = Math.round(subtotal - discount) + " ج.م";
}

// 4. الإرسال للـ Firebase والتليجرام
window.openCheckoutModal = () => {
    if(cart.length === 0) return alert("سلة المشتريات فارغة!");
    document.getElementById("checkoutModal").style.display = "block";
    document.getElementById("cartSidebar").classList.remove("open");
};

window.sendOrder = async () => {
    const name = document.getElementById("custName").value;
    const phone = document.getElementById("custPhone").value;
    const address = document.getElementById("custAddress").value;
    const paymentMethod = document.getElementById("paymentMethod").value;
    const btn = document.getElementById("submitOrderBtn");

    if(!name || !phone || !address) return alert("الرجاء إكمال بيانات التوصيل!");

    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> جاري الإرسال...`;
    btn.disabled = true;

    let subtotal = 0;
    let orderItemsText = "";
    let orderItemsForDb = [];
    
    cart.forEach(item => {
        orderItemsText += `🔹 ${item.qty}x ${item.name} (${item.price * item.qty} ج)\n`;
        subtotal += (item.price * item.qty);
        orderItemsForDb.push({ id: item.id, name: item.name, price: item.price, qty: item.qty });
    });

    let finalTotal = subtotal;
    let discountText = "";
    let discountVal = 0;

    if(appliedVoucher) {
        discountVal = appliedVoucher.type === "percentage" ? subtotal * (appliedVoucher.value/100) : appliedVoucher.value;
        if(discountVal > subtotal) discountVal = subtotal;
        finalTotal -= discountVal;
        discountText = `\n🎁 *كود الخصم (${appliedVoucher.code}):* -${Math.round(discountVal)} ج.م`;
    }

    const orderId = "ORD-" + Math.floor(1000 + Math.random() * 9000); 

    const telegramMessage = `
🛍️ *طلب جديد #${orderId}*

👤 *الاسم:* ${name}
📞 *التليفون:* ${phone}
📍 *العنوان:* ${address}
💳 *طريقة الدفع:* ${paymentMethod}

📦 *المنتجات:*
${orderItemsText}
💰 *الإجمالي الفرعي:* ${subtotal} ج.م${discountText}
🔥 *الإجمالي النهائي: ${Math.round(finalTotal)} ج.م*
    `;

    const orderData = {
        orderId: orderId,
        customer: { name, phone, address },
        paymentMethod: paymentMethod,
        items: orderItemsForDb,
        subtotal: subtotal,
        discount: discountVal,
        total: finalTotal,
        status: "قيد المراجعة", 
        createdAt: Date.now()
    };

    try {
        await push(ref(db, 'orders'), orderData);

        const tgUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        await fetch(tgUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: telegramMessage,
                parse_mode: "Markdown"
            })
        });

        document.getElementById("checkoutForm").style.display = "none";
        document.getElementById("successScreen").style.display = "block";
        document.getElementById("successOrderId").innerText = orderId;
        
        cart = [];
        updateCartUI();

    } catch (error) {
        alert("حدث خطأ أثناء إرسال الطلب، يرجى المحاولة مرة أخرى.");
        btn.innerHTML = `تأكيد وإرسال الطلب <i class="fas fa-check-circle"></i>`;
        btn.disabled = false;
    }
};

// ==========================================
// 5. ميزة تتبع الطلب للعميل
// ==========================================
window.openTrackingModal = () => {
    document.getElementById('trackingModal').style.display = 'block';
    document.getElementById('trackingResult').style.display = 'none';
    document.getElementById('trackOrderId').value = '';
    document.getElementById('trackPhone').value = '';
};

window.trackOrder = () => {
    const orderIdInput = document.getElementById('trackOrderId').value.trim();
    const phoneInput = document.getElementById('trackPhone').value.trim();
    const resultBox = document.getElementById('trackingResult');
    const statusText = document.getElementById('trackingStatusText');

    if(!orderIdInput || !phoneInput) return alert("الرجاء إدخال رقم الطلب ورقم الموبايل");

    get(ref(db, 'orders')).then((snapshot) => {
        let foundOrder = null;
        if(snapshot.exists()) {
            snapshot.forEach(child => {
                const order = child.val();
                if(order.orderId === orderIdInput && order.customer.phone === phoneInput) {
                    foundOrder = order;
                }
            });
        }

        resultBox.style.display = "block";

        if(foundOrder) {
            let statusColor = "var(--secondary)";
            if(foundOrder.status === "تم الاستلام") statusColor = "var(--success)";
            if(foundOrder.status === "ملغي") statusColor = "var(--accent)";
            
            statusText.style.color = statusColor;
            statusText.innerText = foundOrder.status;
        } else {
            statusText.style.color = "var(--accent)";
            statusText.innerText = "لم يتم العثور على طلب بهذه البيانات.";
        }
    });
};
