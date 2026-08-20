import { initializeApp } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-app.js";
import { getDatabase, ref, onValue, get, push, update } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-database.js";

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

const TELEGRAM_BOT_TOKEN = "8578331488:AAG8XHQBN7TSduQ1ip5Fd8pHggSrf_kIn90"; 
const TELEGRAM_CHAT_ID = "5664540316";     

let allActiveProducts = [];
let cart = [];
let appliedVoucher = null; 

function formatDateTime(ms) {
    if(!ms) return "";
    return new Date(ms).toLocaleString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

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

window.openCheckoutModal = () => {
    if(cart.length === 0) return alert("سلة المشتريات فارغة!");
    document.getElementById("checkoutModal").style.display = "block";
    document.getElementById("cartSidebar").classList.remove("open");
};

window.sendOrder = async () => {
    const name = document.getElementById("custName").value;
    const phone = document.getElementById("custPhone").value;
    const phone2 = document.getElementById("custPhone2").value;
    const city = document.getElementById("custCity").value;
    const region = document.getElementById("custRegion").value;
    const building = document.getElementById("custBuilding").value;
    const floor = document.getElementById("custFloor").value;
    const apartment = document.getElementById("custAppt").value;
    const landmark = document.getElementById("custLandmark").value;
    const address = document.getElementById("custAddress").value;
    const paymentMethod = document.getElementById("paymentMethod").value;
    const btn = document.getElementById("submitOrderBtn");

    if(!name || !phone || !city || !region || !address) {
        return alert("الرجاء إكمال البيانات الأساسية للتوصيل (الاسم، رقم الموبايل، المحافظة، المنطقة، العنوان)!");
    }

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

    const orderId = Math.floor(10000000 + Math.random() * 90000000).toString(); 

    const telegramMessage = `
🛍️ *طلب جديد #${orderId}*

👤 *الاسم:* ${name}
📞 *التليفون:* ${phone} ${phone2 ? ' / ' + phone2 : ''}
📍 *العنوان:* ${city} - ${region} - مبنى ${building || '-'} دور ${floor || '-'} شقة ${apartment || '-'}
🔖 *علامة مميزة:* ${landmark || '-'}
📝 *تفاصيل للوصول:* ${address}
💳 *الدفع:* ${paymentMethod}

📦 *المنتجات:*
${orderItemsText}
💰 *الإجمالي الفرعي:* ${subtotal} ج.م${discountText}
🔥 *الإجمالي النهائي: ${Math.round(finalTotal)} ج.م*
    `;

    const orderData = {
        orderId: orderId,
        customer: { name, phone, phone2, city, region, building, floor, apartment, landmark, address },
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

        if(paymentMethod !== "الدفع عند الاستلام (COD)") {
            alert("تم تسجيل طلبك بنجاح. سيتم توجيهك لبوابة الدفع الإلكتروني (Paymob).");
        }

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

window.openTrackingModal = () => {
    document.getElementById('trackingModal').style.display = 'block';
    document.getElementById('overlay').classList.add('show'); // لإظهار الشاشة الرمادية
    document.getElementById('trackingResult').style.display = 'none';
    document.getElementById('trackOrderId').value = '';
    document.getElementById('trackPhone').value = '';
};

window.trackOrder = () => {
    const orderIdInput = document.getElementById('trackOrderId').value.trim();
    const phoneInput = document.getElementById('trackPhone').value.trim();
    const resultBox = document.getElementById('trackingResult');
    const statusText = document.getElementById('trackingStatusText');
    const detailsBox = document.getElementById('trackingOrderDetails');

    if(!orderIdInput || !phoneInput) return alert("الرجاء إدخال رقم الطلب ورقم الموبايل");

    get(ref(db, 'orders')).then((snapshot) => {
        let foundOrder = null;
        let foundDbId = null;
        
        if(snapshot.exists()) {
            snapshot.forEach(child => {
                const order = child.val();
                if(order.orderId === orderIdInput && order.customer.phone === phoneInput) {
                    foundOrder = order;
                    foundDbId = child.key;
                }
            });
        }

        resultBox.style.display = "block";

        if(foundOrder) {
            let statusColor = "var(--secondary)";
            if(foundOrder.status === "تم تسليمه") statusColor = "var(--success)";
            if(foundOrder.status === "ملغي") statusColor = "var(--accent)";
            
            statusText.style.color = statusColor;
            statusText.innerText = foundOrder.status;

            let itemsHtml = '<ul style="list-style:none; margin: 15px 0; padding:0; border-top:1px solid #e2e8f0; padding-top:10px;">';
            foundOrder.items.forEach(item => {
                itemsHtml += `<li style="display:flex; justify-content:space-between; margin-bottom:8px; border-bottom:1px dashed #e2e8f0; padding-bottom:8px;">
                    <span style="font-weight:bold;">${item.qty}x ${item.name}</span>
                    <span style="color:var(--secondary); font-weight:bold;">${item.price * item.qty} ج.م</span>
                </li>`;
            });
            itemsHtml += '</ul>';

            const orderDate = new Date(foundOrder.createdAt).toLocaleDateString('ar-EG');
            let discountHtml = foundOrder.discount > 0 ? `<div style="color:var(--accent); display:flex; justify-content:space-between; margin-bottom:5px;"><span>الخصم:</span> <span>-${Math.round(foundOrder.discount)} ج.م</span></div>` : "";

            let actionsHtml = '';
            if (foundOrder.status === 'قيد المراجعة') {
                actionsHtml = `
                    <div style="display: flex; gap: 10px; margin-top: 20px; padding-top: 15px; border-top: 2px dashed var(--border);">
                        <button onclick="editCustomerOrder('${foundDbId}')" style="flex:1; background:var(--secondary); color:white; border:none; padding:12px; border-radius:8px; cursor:pointer; font-family:'Cairo'; font-weight:bold; font-size:15px; transition:0.3s;">تعديل الطلب <i class="fas fa-edit"></i></button>
                        <button onclick="cancelCustomerOrder('${foundDbId}')" style="flex:1; background:var(--accent); color:white; border:none; padding:12px; border-radius:8px; cursor:pointer; font-family:'Cairo'; font-weight:bold; font-size:15px; transition:0.3s;">إلغاء الطلب <i class="fas fa-times"></i></button>
                    </div>
                `;
            }

            detailsBox.innerHTML = `
                <div style="margin-bottom: 5px; color: var(--text-light); text-align: right;"><strong>تاريخ الطلب:</strong> ${orderDate}</div>
                <div style="margin-bottom: 5px; color: var(--text-light); text-align: right;"><strong>طريقة الدفع:</strong> ${foundOrder.paymentMethod || 'الدفع عند الاستلام'}</div>
                ${itemsHtml}
                <div style="display:flex; justify-content:space-between; margin-bottom:5px; color:var(--text-light);"><span>الإجمالي الفرعي:</span> <span>${foundOrder.subtotal} ج.م</span></div>
                ${discountHtml}
                <div style="display:flex; justify-content:space-between; margin-top:15px; font-size:18px; font-weight:900; color:var(--primary); background:#e2e8f0; padding:10px; border-radius:8px;">
                    <span>الإجمالي النهائي:</span> <span>${Math.round(foundOrder.total)} ج.م</span>
                </div>
                ${actionsHtml}
            `;
        } else {
            statusText.style.color = "var(--accent)";
            statusText.innerText = "لم يتم العثور على طلب بهذه البيانات.";
            detailsBox.innerHTML = "";
        }
    });
};

window.cancelCustomerOrder = (dbId) => {
    if(confirm("هل أنت متأكد من إلغاء هذا الطلب بشكل نهائي؟")) {
        update(ref(db, `orders/${dbId}`), { 
            status: 'ملغي', 
            cancelledAt: Date.now() 
        }).then(() => {
            alert("تم إلغاء الطلب بنجاح.");
            document.getElementById('trackingModal').style.display = 'none';
            document.getElementById('overlay').classList.remove('show');
        });
    }
};

window.editCustomerOrder = (dbId) => {
    if(confirm("سيتم إلغاء هذا الطلب وإرجاع المنتجات لسلة التسوق لتتمكن من إضافة أو إزالة منتجات براحتك. هل توافق؟")) {
        get(ref(db, `orders/${dbId}`)).then(snapshot => {
            if(snapshot.exists()) {
                const orderData = snapshot.val();
                
                cart = []; 
                orderData.items.forEach(item => {
                    const fullProd = allActiveProducts.find(p => p.id === item.id) || {};
                    cart.push({
                        id: item.id,
                        name: item.name,
                        price: item.price,
                        qty: item.qty,
                        img: fullProd.imageUrl || 'https://via.placeholder.com/100'
                    });
                });
                
                if(orderData.customer) {
                    document.getElementById("custName").value = orderData.customer.name || '';
                    document.getElementById("custPhone").value = orderData.customer.phone || '';
                    document.getElementById("custPhone2").value = orderData.customer.phone2 || '';
                    document.getElementById("custCity").value = orderData.customer.city || '';
                    document.getElementById("custRegion").value = orderData.customer.region || '';
                    document.getElementById("custBuilding").value = orderData.customer.building || '';
                    document.getElementById("custFloor").value = orderData.customer.floor || '';
                    document.getElementById("custAppt").value = orderData.customer.apartment || '';
                    document.getElementById("custLandmark").value = orderData.customer.landmark || '';
                    document.getElementById("custAddress").value = orderData.customer.address || '';
                }
                
                update(ref(db, `orders/${dbId}`), { 
                    status: 'ملغي', 
                    cancelledAt: Date.now(),
                    editNote: 'تم الإلغاء بواسطة العميل بغرض التعديل'
                }).then(() => {
                    updateCartUI();
                    document.getElementById('trackingModal').style.display = 'none';
                    document.getElementById('cartSidebar').classList.add('open');
                });
            }
        });
    }
};
