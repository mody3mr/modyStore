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

const STORE_API_BASE_URL = "";

function apiUrl(path) {
    const base = STORE_API_BASE_URL.replace(/\/$/, "");
    return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

// Keep storefront pricing aligned with the dashboard's timed offers.
const isOfferActive = (product) => {
    const discount = Number(product?.discountPrice || 0);
    const endAt = Number(product?.offerEndAt || 0);
    return discount > 0 && (!endAt || endAt > Date.now());
};
const activeProductPrice = (product) => isOfferActive(product)
    ? Number(product.discountPrice)
    : Number(product?.price || 0);
const escapeHtml = (value = '') => String(value ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
const jsArg = (value = '') => String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/[\r\n]/g, ' ');
const offerRemaining = (product) => {
    const endAt = Number(product?.offerEndAt || 0);
    if (!endAt) return product?.offerDays ? `${product.offerDays} أيام` : '';
    const remaining = Math.max(0, endAt - Date.now());
    const minutes = Math.ceil(remaining / 60000);
    if (minutes <= 0) return 'انتهى العرض';
    if (minutes < 60) return `${minutes} دقيقة`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours < 24) return `${hours} ساعة${mins ? ` و${mins} دقيقة` : ''}`;
    const days = Math.floor(hours / 24);
    return `${days} يوم${days > 1 ? 'اً' : ''}`;
};

let allActiveProducts = [];
let cart = [];
let appliedVoucher = null; 
let storeSettings = {}; 
let currentShippingCost = 0; 
let currentFilterType = 'الكل';

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

// ==== جلب الإعدادات الخاصة بالمتجر ====
onValue(ref(db, 'storeSettings'), (snapshot) => {
    if (snapshot.exists()) {
        storeSettings = snapshot.val();
        
        // الشريط الإخباري
        const ticker = document.getElementById("newsTicker");
        if (ticker) {
            if (storeSettings.newsTicker) {
                ticker.innerHTML = `<div class="scrolling-text"><i class="fas fa-bullhorn"></i> ${escapeHtml(storeSettings.newsTicker)}</div>`;
                ticker.style.display = "block";
            } else {
                ticker.style.display = "none";
            }
        }

        // طرق الدفع
        const pmSelect = document.getElementById("paymentMethod");
        if (pmSelect) {
            pmSelect.innerHTML = "";
            const methods = storeSettings.paymentMethods || {};
            if (methods.cod) pmSelect.innerHTML += '<option value="كاش">💵 الدفع عند الاستلام</option>';
            if (storeSettings.paymob && storeSettings.paymob.enabled) {
                pmSelect.innerHTML += '<option value="Paymob">💳 الدفع الإلكتروني - Paymob</option>';
            }
            // الحفاظ على طرق الدفع القديمة إن كانت مفعلة من لوحة التحكم.
            if (methods.wallet) pmSelect.innerHTML += '<option value="محفظة إلكترونية">📱 محفظة إلكترونية</option>';
            if (methods.instapay) pmSelect.innerHTML += '<option value="إنستا باي">⚡ إنستا باي (InstaPay)</option>';
            if (methods.visa && !(storeSettings.paymob && storeSettings.paymob.enabled)) pmSelect.innerHTML += '<option value="فيزا">💳 فيزا / ماستركارد</option>';
        }

        // بيانات الفوتر
        if (storeSettings.email) {
            document.getElementById("footerEmail").innerHTML = `<i class="far fa-envelope"></i> <span class="info-text" dir="ltr">${escapeHtml(storeSettings.email)}</span>`;
            document.getElementById("footerEmail").style.display = "flex";
        }
        if (storeSettings.phone) {
            document.getElementById("footerPhone").innerHTML = `<i class="fas fa-mobile-alt"></i> <span class="info-text" dir="ltr">${escapeHtml(storeSettings.phone)}</span>`;
            document.getElementById("footerPhone").style.display = "flex";
        }
        if (storeSettings.address) {
            document.getElementById("footerAddress").innerHTML = `<i class="fas fa-map-marker-alt"></i> <span class="info-text">${escapeHtml(storeSettings.address)}</span>`;
            document.getElementById("footerAddress").style.display = "flex";
        }

        // السوشيال ميديا
        if (storeSettings.social && storeSettings.socialEnabled) {
            const fb = document.getElementById("socFb"), ig = document.getElementById("socInsta"), tg = document.getElementById("socTg"), wa = document.getElementById("socWa"), tiktok = document.getElementById("socTiktok");
            
            if(storeSettings.socialEnabled.facebook && storeSettings.social.facebook) { fb.href = storeSettings.social.facebook; fb.style.display = "flex"; } else { fb.style.display = "none"; }
            if(storeSettings.socialEnabled.instagram && storeSettings.social.instagram) { ig.href = storeSettings.social.instagram; ig.style.display = "flex"; } else { ig.style.display = "none"; }
            if(storeSettings.socialEnabled.telegram && storeSettings.social.telegram) { tg.href = storeSettings.social.telegram; tg.style.display = "flex"; } else { tg.style.display = "none"; }
            if(storeSettings.socialEnabled.whatsapp && storeSettings.social.whatsapp) { wa.href = `https://wa.me/${storeSettings.social.whatsapp.replace(/\D/g,'')}`; wa.style.display = "flex"; } else { wa.style.display = "none"; }
            if(storeSettings.socialEnabled.tiktok && storeSettings.social.tiktok) { tiktok.href = storeSettings.social.tiktok; tiktok.style.display = "flex"; } else { tiktok.style.display = "none"; }
        }
    }
});

// ==== جلب آراء العملاء ====
onValue(ref(db, 'storeReviews'), (snapshot) => {
    const container = document.getElementById("reviewsContainer");
    if(!container) return;
    container.innerHTML = "";
    let hasReviews = false;
    
    if (snapshot.exists()) {
        snapshot.forEach(child => {
            const r = child.val();
            // عرض المنشور فقط
            if (r.isActive !== false) {
                hasReviews = true;
                const starsHtml = '<i class="fas fa-star"></i>'.repeat(r.rating || 5) + '<i class="far fa-star"></i>'.repeat(5 - (r.rating || 5));
                const imgHtml = r.imageUrl ? `<img src="${escapeHtml(r.imageUrl)}" alt="صورة العميل">` : `<div class="review-placeholder"><i class="fas fa-user"></i></div>`;
                
                container.innerHTML += `
                    <div class="swiper-slide review-card">
                        ${imgHtml}
                        <h4>${escapeHtml(r.customerName || 'عميل مودي ستور')}</h4>
                        <p>"${escapeHtml(r.text || '')}"</p>
                        <div class="stars">${starsHtml}</div>
                    </div>
                `;
            }
        });
    }
    
    if(hasReviews) {
        document.getElementById("reviewsSection").style.display = "block";
    } else {
        document.getElementById("reviewsSection").style.display = "none";
    }
});

// ==== تهيئة السلايدر (Swiper) ====
document.addEventListener("DOMContentLoaded", () => {
    new Swiper('.heroSwiper', {
        loop: true,
        autoplay: { delay: 3000, disableOnInteraction: false },
        pagination: { el: '.swiper-pagination', clickable: true }
    });

    new Swiper('.reviewsSwiper', {
        slidesPerView: 1.2,
        spaceBetween: 15,
        breakpoints: {
            640: { slidesPerView: 2.2, spaceBetween: 20 },
            1024: { slidesPerView: 3.5, spaceBetween: 25 },
        },
        autoplay: { delay: 4000 }
    });
});

handlePaymentReturn();

// تفعيل شريط التنقل السفلي
window.setActiveNav = (element) => {
    document.querySelectorAll('.bottom-nav .nav-item').forEach(nav => nav.classList.remove('active'));
    element.classList.add('active');
};

// ==== أسعار الشحن ====
onValue(ref(db, 'shipping'), (snapshot) => {
    const citySelect = document.getElementById("custCity");
    if (citySelect) {
        citySelect.innerHTML = '<option value="">اختر المحافظة / المدينة...</option>';
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                const s = child.val();
                if (s.isActive !== false) {
                    citySelect.innerHTML += `<option value="${escapeHtml(s.name)}" data-price="${Number(s.price) || 0}">${escapeHtml(s.name)} (شحن: ${Number(s.price) || 0} ج.م)</option>`;
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
            if(c.isActive !== false) {
                catBar.innerHTML += `<button class="cat-btn" onclick="filterBy('${jsArg(c.name)}', this)">${escapeHtml(c.name)}</button>`;
            }
        });
    }
});

onValue(ref(db, 'products'), (snapshot) => {
    allActiveProducts = [];
    if (snapshot.exists()) {
        snapshot.forEach(child => {
            const p = child.val();
            if (p.isActive !== false) {
                p.id = child.key;
                p.effectivePrice = activeProductPrice(p);
                allActiveProducts.push(p);
            }
        });
    }
    renderProducts(currentFilterType);
});

window.renderProducts = (filterType) => {
    const grid = document.getElementById("productsGrid");
    grid.innerHTML = "";
    let filtered = [];

    if (filterType === "الكل") filtered = allActiveProducts;
    else if (filterType === "عروض") filtered = allActiveProducts.filter(isOfferActive);
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
        const offerActive = isOfferActive(p);
        const effectivePrice = activeProductPrice(p);
        p.effectivePrice = effectivePrice;
        let priceHtml = `<span class="product-price">${effectivePrice} <span>ج.م</span></span>`;
        let badgeHtml = "";
        let countdownHtml = "";
        
        if (offerActive) {
            priceHtml = `<span class="product-price"><span class="old-price" style="font-size:14px;">${Number(p.price || 0)}</span> ${effectivePrice} <span>ج.م</span></span>`;
            badgeHtml = `<div class="discount-badge">خصم ${Math.max(0, Number(p.price || 0) - effectivePrice)} ج.م</div>`;
            
            const remaining = offerRemaining(p);
            if (remaining) {
                countdownHtml = `<div class="offer-countdown"><i class="fas fa-stopwatch"></i> ينتهي العرض خلال: <span>${escapeHtml(remaining)}</span></div>`;
            }
        }
        
        let btnHtml = '';
        if (Number(p.stock || 0) <= 0) {
            badgeHtml += `<div class="discount-badge" style="background:var(--accent); color:white; left:15px; right:auto;">نفذت الكمية</div>`;
            btnHtml = `<button class="add-to-cart out-of-stock" disabled onclick="event.stopPropagation();">نفذ المخزون <i class="fas fa-ban"></i></button>`;
        } else {
            btnHtml = `<button class="add-to-cart" onclick="event.stopPropagation(); addToCart('${jsArg(p.id)}', '${jsArg(p.name)}', ${effectivePrice}, '${jsArg(p.imageUrl || '')}', ${Number(p.stock || 0)})">إضافة للسلة <i class="fas fa-cart-plus"></i></button>`;
        }

        grid.innerHTML += `
            <div class="product-card" data-product-id="${escapeHtml(p.id)}" style="animation-delay: ${index * 0.05}s" onclick="openProductDetails('${jsArg(p.id)}')">
                ${badgeHtml}
                <div class="product-img-wrapper">
                    <img src="${escapeHtml(p.imageUrl || 'https://via.placeholder.com/300x300?text=صورة+المنتج')}" class="product-img" onerror="this.src='https://via.placeholder.com/300x300?text=صورة+المنتج'">
                </div>
                <div class="product-details">
                    <div class="product-cat">${escapeHtml(p.category || '')}</div>
                    <h3 class="product-title">${escapeHtml(p.name || '')}</h3>
                    ${countdownHtml}
                    <div class="price-wrapper">${priceHtml}</div>
                    ${btnHtml}
                </div>
            </div>
        `;
    });
    window.ModyStoreProductRating?.autoAttachProductRatings?.(grid);
};

window.filterBy = (catName, btn) => {
    currentFilterType = catName;
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderProducts(catName);
};

window.openProductDetails = (id) => {
    const p = allActiveProducts.find(prod => prod.id === id);
    if(!p) return;

    document.getElementById('modalProductImg').src = p.imageUrl || 'https://via.placeholder.com/600x600?text=صورة+المنتج';
    document.getElementById('modalProductCat').innerText = p.category;
    document.getElementById('modalProductTitle').innerText = p.name;
    document.getElementById('modalProductDesc').innerText = p.description || 'لا توجد تفاصيل إضافية مسجلة لهذا المنتج.';
    const modalRating = document.getElementById('modalProductRating');
    if (modalRating) {
        modalRating.dataset.productId = p.id;
        modalRating.classList.remove('mody-product-rating');
        modalRating.innerHTML = '';
        window.ModyStoreProductRating?.attachProductRating?.(modalRating, p.id);
    }

    const offerActive = isOfferActive(p);
    const effectivePrice = activeProductPrice(p);
    p.effectivePrice = effectivePrice;
    let priceHtml = `<span class="product-price" style="font-size: 30px;">${effectivePrice} <span>ج.م</span></span>`;
    let timerHtml = '';

    if (offerActive) {
        priceHtml = `
            <span class="product-price" style="font-size: 30px;">${effectivePrice} <span>ج.م</span></span>
            <span class="old-price" style="font-size: 20px; color: #94a3b8; margin-right: 15px;">${Number(p.price || 0)} ج.م</span>
            <span style="background: var(--accent); color: white; padding: 4px 10px; border-radius: 6px; font-weight: bold; font-size: 13px; margin-right: 15px;">توفير ${Math.max(0, Number(p.price || 0) - effectivePrice)} ج.م</span>
        `;
        const remaining = offerRemaining(p);
        if (remaining) {
            timerHtml = `<div class="offer-countdown" style="margin-bottom:15px; font-size:14px;"><i class="fas fa-stopwatch"></i> ينتهي العرض خلال: <span>${escapeHtml(remaining)}</span></div>`;
        }
    }
    document.getElementById('modalProductPriceWrapper').innerHTML = priceHtml;
    
    const timerDiv = document.getElementById('modalOfferTimer');
    if(timerHtml) { timerDiv.innerHTML = timerHtml; timerDiv.style.display = 'block'; }
    else { timerDiv.style.display = 'none'; }

    const btnContainer = document.getElementById('modalBtnContainer');
    if (Number(p.stock || 0) <= 0) {
        btnContainer.innerHTML = `<button class="modal-add-btn out-of-stock" disabled>نفذ المخزون <i class="fas fa-ban"></i></button>`;
    } else {
        btnContainer.innerHTML = `<button class="modal-add-btn" id="modalAddBtn">إضافة للسلة <i class="fas fa-cart-plus"></i></button>`;
        document.getElementById('modalAddBtn').onclick = () => {
            addToCart(p.id, p.name, effectivePrice, p.imageUrl, Number(p.stock || 0));
            closeProductModal();
        };
    }

    document.getElementById('productDetailsModal').style.display = 'flex';
};

// Re-render when a timed offer crosses its expiry boundary.
setInterval(() => {
    if (allActiveProducts.some(p => p.offerEndAt && Number(p.offerEndAt) <= Date.now())) {
        renderProducts(currentFilterType);
    }
}, 60000);

window.closeProductModal = () => {
    document.getElementById('productDetailsModal').style.display = 'none';
};

window.closeOverlay = () => {
    document.getElementById("cartSidebar").classList.remove("open");
    const checkout = document.getElementById("checkoutModal");
    if (checkout) checkout.style.display = "none";
    const tracking = document.getElementById("trackingModal");
    if (tracking) tracking.style.display = "none";
    document.getElementById("overlay").classList.remove("show");
};

window.toggleCart = () => {
    const sidebar = document.getElementById("cartSidebar");
    const overlay = document.getElementById("overlay");
    sidebar.classList.toggle("open");
    if (sidebar.classList.contains("open")) {
        overlay.classList.add("show");
    } else {
        overlay.classList.remove("show");
    }
};

window.addToCart = (id, name, price, img, stock) => {
    if (storeSettings.isOpen === false) {
        return Swal.fire({icon: 'error', title: 'المتجر مغلق', text: 'نعتذر، المتجر مغلق حالياً ولا يمكننا استقبال طلبات جديدة.', confirmButtonColor: 'var(--title-color)'});
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
                    <i class="fas fa-times remove-item" onclick="removeFromCart('${jsArg(item.id)}')"></i>
                    <img src="${escapeHtml(item.img || 'https://via.placeholder.com/100')}" onerror="this.src='https://via.placeholder.com/100'">
                    <div class="cart-item-details">
                        <div class="cart-item-title">${escapeHtml(item.name || '')}</div>
                        <div class="cart-item-price">${Number(item.price || 0)} ج.م</div>
                        <div class="qty-controls">
                            <button class="qty-btn" onclick="updateQty('${jsArg(item.id)}', 1)"><i class="fas fa-plus" style="font-size:10px;"></i></button>
                            <span class="qty-num">${Number(item.qty || 0)}</span>
                            <button class="qty-btn" onclick="updateQty('${jsArg(item.id)}', -1)"><i class="fas fa-minus" style="font-size:10px;"></i></button>
                        </div>
                    </div>
                </div>
            `;
        });
    }
    
    document.getElementById("cartCountBadge").innerText = count;
    if(document.getElementById("bottomCartBadge")) {
        document.getElementById("bottomCartBadge").innerText = count;
    }
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

// ==== إرسال الطلب ومعالجة بوابات الدفع ====
window.sendOrder = async () => {
    const name = document.getElementById("custName").value.trim();
    const phone = document.getElementById("custPhone").value.trim();
    const phone2 = document.getElementById("custPhone2").value.trim();
    const city = document.getElementById("custCity").value;
    const region = document.getElementById("custRegion").value.trim();
    const building = document.getElementById("custBuilding").value.trim();
    const floor = document.getElementById("custFloor").value.trim();
    const apartment = document.getElementById("custAppt").value.trim();
    const landmark = document.getElementById("custLandmark").value.trim();
    const address = document.getElementById("custAddress").value.trim();
    const paymentMethod = document.getElementById("paymentMethod").value;
    const btn = document.getElementById("submitOrderBtn");

    if (!name || !phone || !city || !region || !address) {
        Swal.fire({icon: 'error', title: 'بيانات ناقصة', text: 'الرجاء إكمال البيانات الأساسية للتوصيل (الاسم، الموبايل، المحافظة، المنطقة، العنوان)', confirmButtonColor: 'var(--title-color)'});
        return;
    }

    if (!paymentMethod) {
        Swal.fire({icon: 'error', title: 'طريقة الدفع', text: 'الرجاء اختيار طريقة الدفع أولاً.', confirmButtonColor: 'var(--title-color)'});
        return;
    }

    if (!cart.length) {
        Swal.fire({icon: 'warning', title: 'السلة فارغة', text: 'أضف منتجات قبل إرسال الطلب.', confirmButtonColor: 'var(--title-color)'});
        return;
    }

    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> جاري تأكيد الطلب...`;
    btn.disabled = true;

    const payload = {
        customer: { name, phone, phone2, city, region, building, floor, apartment, landmark, address },
        paymentMethod,
        items: cart.map(item => ({ id: item.id, qty: item.qty })),
        voucherCode: appliedVoucher ? appliedVoucher.code : null
    };

    try {
        const response = await fetch(apiUrl('/api/orders'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.message || 'تعذر إنشاء الطلب.');

        if (result.paymentRequired && result.checkoutUrl) {
            sessionStorage.setItem('pendingPaymobOrderId', result.orderId);
            Swal.fire({
                icon: 'info',
                title: 'جاري فتح الدفع الآمن',
                html: `سيتم تحويلك الآن إلى صفحة الدفع الآمنة من Paymob.<br><small>رقم الطلب: <b>${result.orderId}</b></small>`,
                confirmButtonText: 'الدفع الآن',
                allowOutsideClick: false
            }).then(() => {
                window.location.href = result.checkoutUrl;
            });
            return;
        }

        completeOrderSuccess(result.orderId);
        Swal.fire({
            icon: 'success',
            title: 'تم استلام الطلب',
            text: 'تم تسجيل طلبك بنجاح وسيتم التواصل معك لتأكيده.',
            confirmButtonColor: 'var(--secondary)'
        });
    } catch (error) {
        console.error('Order submission error:', error);
        Swal.fire({icon: 'error', title: 'تعذر إرسال الطلب', text: error.message || 'حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى.', confirmButtonColor: 'var(--title-color)'});
    } finally {
        btn.innerHTML = `تأكيد وإرسال الطلب <i class="fas fa-check-circle"></i>`;
        btn.disabled = false;
    }
};

async function handlePaymentReturn() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment_return') !== '1') return;

    const orderId = params.get('orderId') || sessionStorage.getItem('pendingPaymobOrderId');
    if (!orderId) return;

    const cleanUrl = `${window.location.origin}${window.location.pathname}`;
    window.history.replaceState({}, document.title, cleanUrl);

    const checkoutForm = document.getElementById('checkoutForm');
    const successScreen = document.getElementById('successScreen');
    if (checkoutForm) checkoutForm.style.display = 'none';
    if (successScreen) successScreen.style.display = 'block';
    const successTitle = successScreen ? successScreen.querySelector('h3') : null;
    const successText = successScreen ? successScreen.querySelector('p') : null;
    const successId = document.getElementById('successOrderId');
    if (successId) successId.innerText = orderId;
    if (successTitle) successTitle.innerText = 'جاري تأكيد الدفع...';
    if (successText) successText.innerHTML = 'تم الرجوع من Paymob. نتحقق الآن من حالة الدفع بشكل آمن.';

    try {
        const response = await fetch(apiUrl(`/api/orders/status/${encodeURIComponent(orderId)}`), { cache: 'no-store' });
        const data = await response.json();
        if (data.paymentStatus === 'paid') {
            if (successTitle) successTitle.innerText = 'تم الدفع واستلام الطلب بنجاح!';
            if (successText) successText.innerHTML = `رقم الطلب: <strong>${orderId}</strong><br>تم تأكيد الدفع بنجاح.`;
            sessionStorage.removeItem('pendingPaymobOrderId');
            cart = [];
            appliedVoucher = null;
            updateCartUI();
        } else if (data.paymentStatus === 'failed') {
            if (successTitle) { successTitle.innerText = 'لم يتم الدفع'; successTitle.style.color = 'var(--accent)'; }
            if (successText) successText.innerHTML = `لم تكتمل عملية الدفع للطلب <strong>${orderId}</strong>. يمكنك المحاولة مرة أخرى.`;
        } else {
            if (successText) successText.innerHTML = `عملية الدفع ما زالت قيد التأكيد للطلب <strong>${orderId}</strong>. يمكنك الانتظار قليلاً ثم تحديث الصفحة.`;
        }
    } catch (error) {
        console.error('Payment status check failed:', error);
        if (successText) successText.innerHTML = `تم استلام الرجوع من Paymob، لكن تعذر قراءة الحالة حالياً. رقم الطلب: <strong>${orderId}</strong>`;
    }
}

function completeOrderSuccess(orderId) {
    const btn = document.getElementById("submitOrderBtn");
    btn.innerHTML = `تأكيد وإرسال الطلب <i class="fas fa-check-circle"></i>`;
    btn.disabled = false;
    
    document.getElementById("checkoutForm").style.display = "none";
    document.getElementById("successScreen").style.display = "block";
    document.getElementById("successOrderId").innerText = orderId;
    
    cart = [];
    appliedVoucher = null;
    updateCartUI();
}

// ==== التتبع والأوامر الأخرى ====
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
                if((order.orderId === orderIdInput || order.secretCode === orderIdInput) && order.customer?.phone === phoneInput) {
                    foundOrder = order;
                    foundDbId = child.key;
                }
            });
        }

        resultBox.style.display = "block";

        if(foundOrder) {
            let statusColor = "var(--secondary)";
            if(foundOrder.status === "تم تسليمه") statusColor = "var(--success)";
            if(foundOrder.status === "ملغي" || foundOrder.status === "مرتجع") statusColor = "var(--accent)";
            
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
            const confirmation = foundOrder.customerConfirmation?.status;
            const confirmationHtml = confirmation === 'confirmed'
                ? '<div style="color:var(--success);font-weight:800;margin:8px 0;"><i class="fas fa-circle-check"></i> تم تأكيد الطلب من العميل</div>'
                : confirmation === 'cancelled'
                    ? '<div style="color:var(--accent);font-weight:800;margin:8px 0;"><i class="fas fa-circle-xmark"></i> تم إلغاء الطلب بواسطة العميل</div>'
                    : '';

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
                <div style="margin-bottom: 5px; color: var(--text-light); text-align: right;"><strong>طريقة الدفع:</strong> ${foundOrder.paymentMethod || 'كاش'}</div>
                ${confirmationHtml}
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

const cArr = [169, 32, 50, 48, 50, 54, 32, 1578, 1605, 32, 1575, 1604, 1573, 1606, 1588, 1575, 1569, 32, 1576, 1608, 1575, 1587, 1591, 1577, 32, 124, 32, 1605, 1581, 1605, 1583, 32, 1593, 1605, 1585, 1608, 32, 1575, 1576, 1585, 1575, 1607, 1610, 1605, 32, 124, 32, 1605, 1608, 1583, 1610, 32, 1587, 1578, 1608, 1585];
const lArr = [104, 116, 116, 112, 115, 58, 47, 47, 119, 97, 46, 109, 101, 47, 43, 50, 48, 49, 48, 57, 52, 50, 54, 52, 50, 48, 54];
const devCopy = document.getElementById("devCopyLink");
if(devCopy) {
    devCopy.innerText = String.fromCharCode(...cArr);
    devCopy.href = String.fromCharCode(...lArr);
}
