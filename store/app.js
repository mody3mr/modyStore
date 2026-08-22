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
let storeSettings = {}; 
let currentShippingCost = 0; 

const Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true
});

// ==== الدارك مود ====
const savedTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);
updateThemeIcon(savedTheme);

window.toggleTheme = () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
};

function updateThemeIcon(theme) {
    const icon = document.getElementById('themeIcon');
    if(icon) {
        icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }
}

// ==== جلب الإعدادات (الشريط الإخباري، طرق الدفع، الفوتر) ====
onValue(ref(db, 'storeSettings'), (snapshot) => {
    if (snapshot.exists()) {
        storeSettings = snapshot.val();
        
        // الشريط الإخباري
        const ticker = document.getElementById("newsTicker");
        if (ticker) {
            if (storeSettings.newsTicker) {
                ticker.innerHTML = `<div class="scrolling-text"><i class="fas fa-bullhorn"></i> ${storeSettings.newsTicker}</div>`;
                ticker.style.display = "block";
            } else {
                ticker.style.display = "none";
            }
        }

        // طرق الدفع
        const pmSelect = document.getElementById("paymentMethod");
        if (pmSelect && storeSettings.paymentMethods) {
            pmSelect.innerHTML = "";
            if (storeSettings.paymentMethods.cod) pmSelect.innerHTML += '<option value="الدفع عند الاستلام (COD)">💵 الدفع عند الاستلام (COD)</option>';
            if (storeSettings.paymentMethods.wallet) pmSelect.innerHTML += '<option value="محفظة إلكترونية">📱 محفظة إلكترونية (فودافون كاش، الخ)</option>';
            if (storeSettings.paymentMethods.instapay) pmSelect.innerHTML += '<option value="إنستا باي (InstaPay)">⚡ إنستا باي (InstaPay)</option>';
            if (storeSettings.paymentMethods.visa) pmSelect.innerHTML += '<option value="فيزا / بطاقة ائتمان">💳 فيزا / بطاقة ائتمان</option>';
        }

        // بيانات الفوتر
        if (storeSettings.name) document.getElementById("footerName").innerText = storeSettings.name;
        
        // الإيميل
        if (storeSettings.email) {
            document.getElementById("footerEmail").innerHTML = `<i class="far fa-envelope"></i> <span class="info-text" dir="ltr">${storeSettings.email}</span>`;
            document.getElementById("footerEmail").style.display = "flex";
        } else {
            document.getElementById("footerEmail").style.display = "none";
        }

        // التليفون
        if (storeSettings.phone) {
            document.getElementById("footerPhone").innerHTML = `<i class="fas fa-mobile-alt"></i> <span class="info-text" dir="ltr">${storeSettings.phone}</span>`;
            document.getElementById("footerPhone").style.display = "flex";
        } else {
            document.getElementById("footerPhone").style.display = "none";
        }

        // العنوان
        if (storeSettings.address) {
            document.getElementById("footerAddress").innerHTML = `<i class="fas fa-map-marker-alt"></i> <span class="info-text">${storeSettings.address}</span>`;
            document.getElementById("footerAddress").style.display = "flex";
        } else {
            document.getElementById("footerAddress").style.display = "none";
        }

        // السوشيال ميديا
        if (storeSettings.social) {
            const fb = document.getElementById("socFb"), ig = document.getElementById("socInsta"), tg = document.getElementById("socTg"), wa = document.getElementById("socWa");
            if(storeSettings.social.facebook) { fb.href = storeSettings.social.facebook; fb.style.display = "flex"; } else { fb.style.display = "none"; }
            if(storeSettings.social.instagram) { ig.href = storeSettings.social.instagram; ig.style.display = "flex"; } else { ig.style.display = "none"; }
            if(storeSettings.social.telegram) { tg.href = storeSettings.social.telegram; tg.style.display = "flex"; } else { tg.style.display = "none"; }
            if(storeSettings.social.whatsapp) { wa.href = `https://wa.me/${storeSettings.social.whatsapp.replace(/\D/g,'')}`; wa.style.display = "flex"; } else { wa.style.display = "none"; }
        }
    }
});

// ==== أسعار الشحن ====
onValue(ref(db, 'shipping'), (snapshot) => {
    const citySelect = document.getElementById("custCity");
    if (citySelect) {
        citySelect.innerHTML = '<option value="">اختر المحافظة / المدينة...</option>';
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                const s = child.val();
                if (s.isActive) {
                    citySelect.innerHTML += `<option value="${s.name}" data-price="${s.price}">${s.name} (شحن: ${s.price} ج.م)</option>`;
                }
            });
        }
    }
});

window.updateShippingCost = () => {
    const citySelect = document.getElementById("custCity");
    if (citySelect && citySelect.value) {
        const selectedOption = citySelect.options[citySelect.selectedIndex];
        currentShippingCost = Number(selectedOption.getAttribute('data-price')) || 0;
    } else {
        currentShippingCost = 0;
    }
    updateCartUI();
};

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

    filtered.forEach((p, index) => {
        let priceHtml = `<span class="product-price">${p.effectivePrice} <span>ج.م</span></span>`;
        let badgeHtml = "";
        let countdownHtml = "";
        
        if (p.discountPrice) {
            priceHtml = `<span class="product-price"><span class="old-price" style="font-size:16px;">${p.price}</span> ${p.discountPrice} <span>ج.م</span></span>`;
            badgeHtml = `<div class="discount-badge">خصم ${p.price - p.discountPrice} ج.م</div>`;
            
            if(p.offerDays) {
                countdownHtml = `<div class="offer-countdown"><i class="fas fa-stopwatch"></i> ينتهي العرض خلال: <span>${p.offerDays} أيام</span></div>`;
            }
        }
        
        let btnHtml = '';
        if (p.stock === 0) {
            badgeHtml += `<div class="discount-badge" style="background:var(--accent); color:white; left:15px; right:auto;">نفذت الكمية</div>`;
            btnHtml = `<button class="add-to-cart out-of-stock" disabled onclick="event.stopPropagation();">نفذ المخزون <i class="fas fa-ban"></i></button>`;
        } else {
            btnHtml = `<button class="add-to-cart" onclick="event.stopPropagation(); addToCart('${p.id}', '${p.name}', ${p.effectivePrice}, '${p.imageUrl}', ${p.stock || 0})">إضافة للسلة <i class="fas fa-cart-plus"></i></button>`;
        }

        grid.innerHTML += `
            <div class="product-card" style="animation-delay: ${index * 0.05}s" onclick="openProductDetails('${p.id}')">
                ${badgeHtml}
                <div class="product-img-wrapper">
                    <img src="${p.imageUrl}" class="product-img" onerror="this.src='https://via.placeholder.com/300x300?text=صورة+المنتج'">
                </div>
                <div class="product-details">
                    <div class="product-cat">${p.category}</div>
                    <h3 class="product-title">${p.name}</h3>
                    ${countdownHtml}
                    <div class="price-wrapper">${priceHtml}</div>
                    ${btnHtml}
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
    let timerHtml = '';
    
    if (p.discountPrice) {
        priceHtml = `
            <span class="product-price" style="font-size: 30px;">${p.discountPrice} <span>ج.م</span></span>
            <span class="old-price" style="font-size: 20px; color: #94a3b8; margin-right: 15px;">${p.price} ج.م</span>
            <span style="background: var(--accent); color: white; padding: 4px 10px; border-radius: 6px; font-weight: bold; font-size: 13px; margin-right: 15px;">توفير ${p.price - p.discountPrice} ج.م</span>
        `;
        if (p.offerDays) {
            timerHtml = `<div class="offer-countdown" style="margin-bottom:15px; font-size:14px;"><i class="fas fa-stopwatch"></i> ينتهي العرض خلال: <span>${p.offerDays} أيام</span></div>`;
        }
    }
    document.getElementById('modalProductPriceWrapper').innerHTML = priceHtml;
    
    const timerDiv = document.getElementById('modalOfferTimer');
    if(timerHtml) { timerDiv.innerHTML = timerHtml; timerDiv.style.display = 'block'; }
    else { timerDiv.style.display = 'none'; }

    const btnContainer = document.getElementById('modalBtnContainer');
    if (p.stock === 0) {
        btnContainer.innerHTML = `<button class="modal-add-btn out-of-stock" disabled>نفذ المخزون <i class="fas fa-ban"></i></button>`;
    } else {
        btnContainer.innerHTML = `<button class="modal-add-btn" id="modalAddBtn">إضافة للسلة <i class="fas fa-cart-plus"></i></button>`;
        document.getElementById('modalAddBtn').onclick = () => {
            addToCart(p.id, p.name, p.effectivePrice, p.imageUrl, p.stock || 0);
            closeProductModal();
        };
    }

    document.getElementById('productDetailsModal').style.display = 'flex';
};

window.closeProductModal = () => {
    document.getElementById('productDetailsModal').style.display = 'none';
};

window.toggleCart = () => {
    document.getElementById("cartSidebar").classList.toggle("open");
    document.getElementById("overlay").classList.toggle("show");
};

window.addToCart = (id, name, price, img, stock) => {
    if (storeSettings.isOpen === false) {
        return Swal.fire({icon: 'error', title: 'المتجر مغلق', text: 'نعتذر، المتجر مغلق حالياً ولا يمكننا استقبال طلبات جديدة.', confirmButtonColor: 'var(--primary)'});
    }

    const existingItem = cart.find(item => item.id === id);
    const currentQty = existingItem ? existingItem.qty : 0;
    
    if ((currentQty + 1) > stock) {
        return Toast.fire({icon: 'warning', title: `عفواً، الكمية المتاحة في المخزون هي ${stock} فقط`});
    }

    if (existingItem) existingItem.qty++;
    else cart.push({ id, name, price, img, stock, qty: 1 });
    
    Toast.fire({icon: 'success', title: 'تمت الإضافة للسلة'});
    updateCartUI();
    document.getElementById("cartSidebar").classList.add("open");
    document.getElementById("overlay").classList.add("show");
};

window.updateQty = (id, change) => {
    const item = cart.find(item => item.id === id);
    if(item) {
        if(change > 0 && (item.qty + change) > item.stock) {
            return Toast.fire({icon: 'warning', title: `أقصى كمية متاحة هي ${item.stock}`});
        }
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
                <p style="font-weight: 800; font-size:18px; color: var(--title-color);">سلة مشترياتك فارغة</p>
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
    if (document.getElementById("shippingCostValue")) {
        document.getElementById("shippingCostValue").innerText = `+${currentShippingCost} ج.م`;
    }
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
                if(v.code === codeInput && v.isActive) {
                    foundVoucher = v;
                    foundVoucher.id = child.key; 
                }
            });
        }
        if(foundVoucher) {
            appliedVoucher = foundVoucher;
            msgBox.style.color = "var(--success)";
            msgBox.innerHTML = `<i class="fas fa-check-circle"></i> تم تطبيق الخصم بنجاح!`;
            Toast.fire({icon: 'success', title: 'تم تفعيل الكوبون'});
        } else {
            appliedVoucher = null;
            msgBox.style.color = "var(--accent)";
            msgBox.innerHTML = `<i class="fas fa-exclamation-circle"></i> الكود غير صحيح أو منتهي.`;
            Toast.fire({icon: 'error', title: 'كوبون غير صالح'});
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
    
    document.getElementById("finalTotalPrice").innerText = Math.round(subtotal - discount + currentShippingCost) + " ج.م";
}

window.openCheckoutModal = () => {
    if(cart.length === 0) {
        Swal.fire({icon: 'warning', title: 'عفواً', text: 'سلة المشتريات فارغة!', confirmButtonColor: 'var(--title-color)'});
        return;
    }
    if (storeSettings.isOpen === false) {
        return Swal.fire({icon: 'error', title: 'المتجر مغلق', text: 'نعتذر، المتجر مغلق حالياً ولا يمكننا إتمام الطلب.', confirmButtonColor: 'var(--title-color)'});
    }
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
        Swal.fire({icon: 'error', title: 'بيانات ناقصة', text: 'الرجاء إكمال البيانات الأساسية للتوصيل (الاسم، الموبايل، المحافظة، المنطقة، العنوان)', confirmButtonColor: 'var(--title-color)'});
        return;
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

    let finalTotal = subtotal + currentShippingCost;
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
💰 *الإجمالي الفرعي:* ${subtotal} ج.م
🚚 *رسوم الشحن:* ${currentShippingCost} ج.م${discountText}
🔥 *الإجمالي النهائي: ${Math.round(finalTotal)} ج.م*
    `;

    const orderData = {
        orderId: orderId,
        secretCode: orderId,
        customer: { name, phone, phone2, city, region, building, floor, apartment, landmark, address },
        paymentMethod: paymentMethod,
        items: orderItemsForDb,
        subtotal: subtotal,
        shippingCost: currentShippingCost,
        discount: discountVal,
        total: finalTotal,
        status: "قيد المراجعة", 
        createdAt: Date.now()
    };

    try {
        await push(ref(db, 'orders'), orderData);
        
        if (appliedVoucher) {
            await push(ref(db, `vouchers/${appliedVoucher.id}/usedBy`), {
                name: name,
                phone: phone,
                orderId: orderId,
                timestamp: Date.now()
            });
        }
        
        for (const item of cart) {
            const productRef = ref(db, `products/${item.id}`);
            const snapshot = await get(productRef);
            if (snapshot.exists()) {
                const p = snapshot.val();
                let newStock = (p.stock || 0) - item.qty;
                if (newStock < 0) newStock = 0;
                await update(productRef, { stock: newStock });
            }
        }

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
            Swal.fire({icon: 'info', title: 'توجيه للدفع', text: 'تم تسجيل طلبك بنجاح. سيتم توجيهك لبوابة الدفع الإلكتروني.', confirmButtonColor: 'var(--title-color)'});
        }

        document.getElementById("checkoutForm").style.display = "none";
        document.getElementById("successScreen").style.display = "block";
        document.getElementById("successOrderId").innerText = orderId;
        
        cart = [];
        appliedVoucher = null;
        updateCartUI();

    } catch (error) {
        Swal.fire({icon: 'error', title: 'خطأ', text: 'حدث خطأ أثناء إرسال الطلب، يرجى المحاولة مرة أخرى.', confirmButtonColor: 'var(--title-color)'});
        btn.innerHTML = `تأكيد وإرسال الطلب <i class="fas fa-check-circle"></i>`;
        btn.disabled = false;
    }
};

window.openTrackingModal = () => {
    document.getElementById('trackingModal').style.display = 'block';
    document.getElementById('overlay').classList.add('show');
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

    if(!orderIdInput || !phoneInput) {
        Toast.fire({icon: 'warning', title: 'الرجاء إدخال بيانات التتبع بالكامل'});
        return;
    }

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

            let itemsHtml = '<ul style="list-style:none; margin: 15px 0; padding:0; border-top:1px solid var(--border); padding-top:10px;">';
            foundOrder.items.forEach(item => {
                itemsHtml += `<li style="display:flex; justify-content:space-between; margin-bottom:8px; border-bottom:1px dashed var(--border); padding-bottom:8px;">
                    <span style="font-weight:bold;">${item.qty}x ${item.name}</span>
                    <span style="color:var(--secondary); font-weight:bold;">${item.price * item.qty} ج.م</span>
                </li>`;
            });
            itemsHtml += '</ul>';

            const orderDate = new Date(foundOrder.createdAt).toLocaleDateString('ar-EG');
            let discountHtml = foundOrder.discount > 0 ? `<div style="color:var(--accent); display:flex; justify-content:space-between; margin-bottom:5px;"><span>الخصم:</span> <span>-${Math.round(foundOrder.discount)} ج.م</span></div>` : "";
            let shippingHtml = `<div style="display:flex; justify-content:space-between; margin-bottom:5px; color:var(--text-light);"><span>الشحن:</span> <span>${foundOrder.shippingCost || 0} ج.م</span></div>`;

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
                ${shippingHtml}
                ${discountHtml}
                <div style="display:flex; justify-content:space-between; margin-top:15px; font-size:18px; font-weight:900; color:var(--title-color); background:var(--gray); padding:10px; border-radius:8px;">
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
    Swal.fire({
        title: 'إلغاء الطلب؟',
        text: "هل أنت متأكد من إلغاء هذا الطلب بشكل نهائي؟",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: 'var(--accent)',
        cancelButtonColor: 'var(--text-light)',
        confirmButtonText: 'نعم، إلغاء الطلب',
        cancelButtonText: 'تراجع'
    }).then((result) => {
        if (result.isConfirmed) {
            update(ref(db, `orders/${dbId}`), { 
                status: 'ملغي', 
                cancelledAt: Date.now() 
            }).then(() => {
                Swal.fire({icon: 'success', title: 'تم', text: 'تم إلغاء الطلب بنجاح.', confirmButtonColor: 'var(--title-color)'});
                document.getElementById('trackingModal').style.display = 'none';
                document.getElementById('overlay').classList.remove('show');
            });
        }
    });
};

window.editCustomerOrder = (dbId) => {
    Swal.fire({
        title: 'تعديل الطلب؟',
        text: "سيتم إلغاء هذا الطلب وإرجاع المنتجات لسلة التسوق لتتمكن من إضافة أو إزالة منتجات. هل توافق؟",
        icon: 'info',
        showCancelButton: true,
        confirmButtonColor: 'var(--secondary)',
        cancelButtonColor: 'var(--text-light)',
        confirmButtonText: 'نعم، موافق',
        cancelButtonText: 'تراجع'
    }).then((result) => {
        if (result.isConfirmed) {
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
                            stock: fullProd.stock || 0,
                            img: fullProd.imageUrl || 'https://via.placeholder.com/100'
                        });
                    });
                    
                    if(orderData.customer) {
                        document.getElementById("custName").value = orderData.customer.name || '';
                        document.getElementById("custPhone").value = orderData.customer.phone || '';
                        document.getElementById("custPhone2").value = orderData.customer.phone2 || '';
                        document.getElementById("custRegion").value = orderData.customer.region || '';
                        document.getElementById("custBuilding").value = orderData.customer.building || '';
                        document.getElementById("custFloor").value = orderData.customer.floor || '';
                        document.getElementById("custAppt").value = orderData.customer.apartment || '';
                        document.getElementById("custLandmark").value = orderData.customer.landmark || '';
                        document.getElementById("custAddress").value = orderData.customer.address || '';
                        const citySelect = document.getElementById("custCity");
                        if(citySelect && orderData.customer.city) {
                            citySelect.value = orderData.customer.city;
                            updateShippingCost();
                        }
                    }
                    
                    update(ref(db, `orders/${dbId}`), { 
                        status: 'ملغي', 
                        cancelledAt: Date.now(),
                        editNote: 'تم الإلغاء بواسطة العميل بغرض التعديل'
                    }).then(() => {
                        updateCartUI();
                        document.getElementById('trackingModal').style.display = 'none';
                        document.getElementById('cartSidebar').classList.add('open');
                        Toast.fire({icon: 'success', title: 'تم تجهيز السلة للتعديل'});
                    });
                }
            });
        }
    });
};

// حقوق الملكية المشفرة (لا يمكن تعديلها برمجياً بسهولة)
const cArr = [169, 32, 50, 48, 50, 54, 32, 1578, 1605, 32, 1575, 1604, 1573, 1606, 1588, 1575, 1569, 32, 1576, 1608, 1575, 1587, 1591, 1577, 32, 124, 32, 1605, 1581, 1605, 1583, 32, 1593, 1605, 1585, 1608, 32, 1575, 1576, 1585, 1575, 1607, 1610, 1605, 32, 124, 32, 1605, 1608, 1583, 1610, 32, 1587, 1578, 1608, 1585];
const lArr = [104, 116, 116, 112, 115, 58, 47, 47, 119, 97, 46, 109, 101, 47, 43, 50, 48, 49, 48, 57, 52, 50, 54, 52, 50, 48, 54];
const devCopy = document.getElementById("devCopyLink");
if(devCopy) {
    devCopy.innerText = String.fromCharCode(...cArr);
    devCopy.href = String.fromCharCode(...lArr);
}
