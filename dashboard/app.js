import { initializeApp } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-app.js";
import { getDatabase, ref, get, child, remove, update, onValue, push } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-database.js";

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
const currentUser = "محمد عمرو";

// ==========================================
// القائمة الجانبية (تصغير وتكبير)
// ==========================================
document.getElementById('sidebarToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
});

// ==========================================
// دوال مساعدة (Helper Functions)
// ==========================================
window.closeModal = (id) => {
    document.getElementById(id).style.display = 'none';
};

function logAction(actionName, details) {
    push(ref(db, 'logs'), { 
        action: actionName, 
        details: details, 
        user: currentUser, 
        timestamp: Date.now() 
    });
}

function formatDateTime(ms) {
    if (!ms) {
        return "";
    }
    return new Date(ms).toLocaleString('ar-EG', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
    });
}

function formatDateOnly(ms) {
    if (!ms) {
        return "";
    }
    return new Date(ms).toLocaleDateString('ar-EG');
}

// ==========================================
// التنقل بين الشاشات
// ==========================================
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        if (!item.dataset.target) {
            return;
        }
        document.querySelectorAll('.nav-item').forEach(nav => {
            nav.classList.remove('active');
        });
        item.classList.add('active');
        
        document.querySelectorAll('.view-section').forEach(view => {
            view.classList.remove('active');
        });
        document.getElementById(item.dataset.target).classList.add('active');
    });
});

window.goToOrdersTab = () => {
    document.querySelector('[data-target="orders-view"]').click();
    window.switchOrderTab('active');
};

// ==========================================
// تقارير المبيعات
// ==========================================
let productCatalog = {}; 

onValue(ref(db, 'products'), (snapshot) => {
    let activeCount = 0;
    if (snapshot.exists()) {
        snapshot.forEach(child => {
            productCatalog[child.val().name] = child.val().imageUrl;
            if (child.val().isActive) {
                activeCount++;
            }
        });
    }
    document.getElementById('statTotalProducts').innerText = activeCount;
});

window.openSalesReport = () => {
    document.getElementById("salesReportModal").style.display = "flex";
    document.getElementById("btnFilterToday").click(); 
};

window.generateReport = (filterType, btn) => {
    document.querySelectorAll('.report-filters button').forEach(b => {
        b.classList.remove('active');
    });
    btn.classList.add('active');

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    let filteredTotal = 0;
    let paymentStats = { 
        "الدفع عند الاستلام (COD)": 0, 
        "محفظة إلكترونية": 0, 
        "إنستا باي (InstaPay)": 0, 
        "فيزا / بطاقة ائتمان": 0 
    };
    let productSales = {};

    allOrders.forEach(order => {
        if (order.status === 'ملغي') {
            return;
        }

        let includeOrder = false;
        
        if (filterType === 'today' && order.createdAt >= startOfToday) {
            includeOrder = true;
        } else if (filterType === 'month' && order.createdAt >= startOfMonth) {
            includeOrder = true;
        } else if (filterType === 'all') {
            includeOrder = true;
        }

        if (includeOrder) {
            filteredTotal += order.total;
            
            const pMethod = order.paymentMethod;
            if (pMethod && pMethod.includes("محفظة")) {
                paymentStats["محفظة إلكترونية"] += order.total;
            } else if (pMethod && pMethod.includes("إنستا")) {
                paymentStats["إنستا باي (InstaPay)"] += order.total;
            } else if (pMethod && pMethod.includes("فيزا")) {
                paymentStats["فيزا / بطاقة ائتمان"] += order.total;
            } else {
                paymentStats["الدفع عند الاستلام (COD)"] += order.total;
            }

            order.items.forEach(item => {
                if (!productSales[item.name]) {
                    productSales[item.name] = { 
                        qty: 0, 
                        revenue: 0, 
                        img: productCatalog[item.name] || 'https://via.placeholder.com/50' 
                    };
                }
                productSales[item.name].qty += item.qty;
                productSales[item.name].revenue += (item.qty * item.price);
            });
        }
    });

    document.getElementById("reportTotalSales").innerText = Math.round(filteredTotal) + " ج.م";

    const paymentDiv = document.getElementById("reportPaymentBreakdown");
    paymentDiv.innerHTML = `
        <div class="payment-row">
            <span><i class="fas fa-hand-holding-usd" style="color:var(--accent); margin-left:8px;"></i> دفع عند الاستلام</span> 
            <span class="amount">${Math.round(paymentStats["الدفع عند الاستلام (COD)"])} ج</span>
        </div>
        <div class="payment-row">
            <span><i class="fas fa-mobile-alt" style="color:#8b5cf6; margin-left:8px;"></i> محفظة إلكترونية</span> 
            <span class="amount">${Math.round(paymentStats["محفظة إلكترونية"])} ج</span>
        </div>
        <div class="payment-row">
            <span><i class="fas fa-bolt" style="color:#0ea5e9; margin-left:8px;"></i> إنستا باي</span> 
            <span class="amount">${Math.round(paymentStats["إنستا باي (InstaPay)"])} ج</span>
        </div>
        <div class="payment-row">
            <span><i class="fas fa-credit-card" style="color:var(--primary); margin-left:8px;"></i> فيزا</span> 
            <span class="amount">${Math.round(paymentStats["فيزا / بطاقة ائتمان"])} ج</span>
        </div>
    `;

    const productsDiv = document.getElementById("reportTopProducts");
    productsDiv.innerHTML = "";
    
    const sortedProducts = Object.values(productSales).sort((a, b) => b.qty - a.qty); 
    
    if (sortedProducts.length === 0) {
        productsDiv.innerHTML = "<div style='text-align:center; padding:20px; color:var(--text-light);'>لا توجد مبيعات في هذه الفترة.</div>";
    } else {
        sortedProducts.slice(0, 10).forEach(p => {
            const pName = Object.keys(productSales).find(key => productSales[key] === p);
            productsDiv.innerHTML += `
                <div class="top-product-item">
                    <img src="${p.img}" class="top-product-img">
                    <div class="top-product-details">
                        <div class="top-product-title">${pName}</div>
                        <div class="top-product-stats">تم بيع ${p.qty} قطعة</div>
                    </div>
                    <div class="top-product-revenue">${Math.round(p.revenue)} ج.م</div>
                </div>`;
        });
    }
};

// ==========================================
// إدارة الطلبات
// ==========================================
let allOrders = [];
let currentOrderTab = 'active';

window.switchOrderTab = (tab) => {
    currentOrderTab = tab;
    document.getElementById('tabActiveOrders').classList.toggle('active', tab === 'active');
    document.getElementById('tabArchivedOrders').classList.toggle('active', tab === 'archived');
    renderOrdersTable();
};

window.updateOrderStatus = (orderId, selectElement) => {
    const newStatus = selectElement.value;
    const updates = { status: newStatus };
    const now = Date.now();

    if (newStatus === 'جاري التجهيز') updates.processedAt = now;
    if (newStatus === 'تم الشحن') updates.shippedAt = now;
    if (newStatus === 'تم الاستلام') updates.deliveredAt = now;
    if (newStatus === 'ملغي') updates.cancelledAt = now;

    selectElement.className = "status-select"; 
    
    if (newStatus === 'قيد المراجعة') {
        selectElement.classList.add('status-pending');
    } else if (newStatus === 'جاري التجهيز') {
        selectElement.classList.add('status-processing');
    } else if (newStatus === 'تم الشحن') {
        selectElement.classList.add('status-shipped');
    } else if (newStatus === 'تم الاستلام') {
        selectElement.classList.add('status-delivered');
    } else if (newStatus === 'ملغي') {
        selectElement.classList.add('status-cancelled');
    }

    update(ref(db, `orders/${orderId}`), updates).then(() => {
        logAction("تحديث حالة طلب", `تغيير حالة الطلب لـ ${newStatus}`);
    });
};

window.viewOrderDetails = (orderDbId) => {
    const order = allOrders.find(o => o.dbId === orderDbId);
    if (!order) {
        return;
    }

    // بيانات الفاتورة
    document.getElementById("orderModalTitle").innerText = `تفاصيل الطلب: #${order.orderId}`;
    document.getElementById("oName").innerText = order.customer.name;
    document.getElementById("oPhone").innerText = order.customer.phone;
    document.getElementById("oAddress").innerText = order.customer.address;
    document.getElementById("oPayment").innerText = order.paymentMethod || "دفع عند الاستلام";

    // بيانات بوليصة الشحن المخفية للطباعة
    document.getElementById("wbOrderId").innerText = `#${order.orderId}`;
    document.getElementById("wbName").innerText = order.customer.name;
    document.getElementById("wbPhone").innerText = order.customer.phone;
    document.getElementById("wbAddress").innerText = order.customer.address;
    
    if (order.paymentMethod && order.paymentMethod !== "الدفع عند الاستلام (COD)") {
        document.getElementById("wbTotal").innerText = "مدفوع مسبقاً (0 ج.م)";
        document.getElementById("wbTotal").style.color = "var(--success)";
    } else {
        document.getElementById("wbTotal").innerText = `${Math.round(order.total)} ج.م`;
        document.getElementById("wbTotal").style.color = "black";
    }

    const list = document.getElementById("oItemsList");
    list.innerHTML = "";
    order.items.forEach(item => {
        list.innerHTML += `
            <div class="order-item-row">
                <span>${item.qty}x ${item.name}</span>
                <span>${item.qty * item.price} ج.م</span>
            </div>`;
    });

    document.getElementById("oSubtotal").innerText = `${order.subtotal} ج.م`;
    
    if (order.discount > 0) {
        document.getElementById("oDiscountDiv").style.display = "block";
        document.getElementById("oDiscount").innerText = `-${Math.round(order.discount)} ج.م`;
    } else {
        document.getElementById("oDiscountDiv").style.display = "none";
    }
    
    document.getElementById("oTotal").innerText = `${Math.round(order.total)} ج.م`;

    let tlHtml = `
        <div class="tl-step done">
            <div class="tl-title">تم استلام الطلب</div>
            <div class="tl-date">${formatDateTime(order.createdAt)}</div>
        </div>`;
    
    if (order.status === 'ملغي') {
        tlHtml += `
            <div class="tl-step cancel">
                <div class="tl-title" style="color:var(--accent);">تم إلغاء الطلب</div>
                <div class="tl-date">${formatDateTime(order.cancelledAt || Date.now())}</div>
            </div>`;
    } else {
        tlHtml += `
            <div class="tl-step ${order.processedAt ? 'done' : ''}">
                <div class="tl-title">جاري التجهيز</div>
                <div class="tl-date">${formatDateTime(order.processedAt)}</div>
            </div>`;
        tlHtml += `
            <div class="tl-step ${order.shippedAt ? 'done' : ''}">
                <div class="tl-title">تم الشحن</div>
                <div class="tl-date">${formatDateTime(order.shippedAt)}</div>
            </div>`;
        tlHtml += `
            <div class="tl-step ${order.deliveredAt ? 'done' : ''}">
                <div class="tl-title">تم الاستلام</div>
                <div class="tl-date">${formatDateTime(order.deliveredAt)}</div>
            </div>`;
    }
    document.getElementById("oTimeline").innerHTML = tlHtml;

    document.getElementById("orderDetailsModal").style.display = "flex";
};

// دالة الطباعة للفاتورة أو البوليصة
window.printDocument = (type) => {
    if (type === 'invoice') {
        document.body.className = 'print-mode-invoice';
    } else if (type === 'waybill') {
        document.body.className = 'print-mode-waybill';
    }
    
    window.print();
    
    setTimeout(() => { 
        document.body.className = ''; 
    }, 500); 
};

function renderOrdersTable() {
    const table = document.getElementById("ordersTableBody");
    table.innerHTML = "";
    
    const filteredOrders = allOrders.filter(order => {
        if (currentOrderTab === 'active') {
            return ['قيد المراجعة', 'جاري التجهيز', 'تم الشحن'].includes(order.status);
        } else {
            return ['تم الاستلام', 'ملغي'].includes(order.status);
        }
    });

    if (filteredOrders.length === 0) {
        table.innerHTML = "<tr><td colspan='6' style='text-align:center; padding: 20px;'>لا توجد طلبات في هذا القسم.</td></tr>";
        return;
    }

    filteredOrders.forEach(order => {
        const statusClass = order.status === 'قيد المراجعة' ? 'status-pending' : 
                            order.status === 'جاري التجهيز' ? 'status-processing' : 
                            order.status === 'تم الشحن' ? 'status-shipped' : 
                            order.status === 'تم الاستلام' ? 'status-delivered' : 'status-cancelled';
        
        table.innerHTML += `
            <tr>
                <td style="font-weight:900; color:var(--primary);">#${order.orderId}</td>
                <td>
                    <b>${order.customer.name}</b><br>
                    <span class="meta-info">${order.paymentMethod || "الدفع عند الاستلام"}</span>
                </td>
                <td dir="ltr" class="meta-info">${formatDateTime(order.createdAt)}</td>
                <td style="font-weight:bold; color:var(--secondary);">${Math.round(order.total)} ج.م</td>
                <td>
                    <select class="status-select ${statusClass}" onchange="updateOrderStatus('${order.dbId}', this)">
                        <option value="قيد المراجعة" ${order.status === 'قيد المراجعة' ? 'selected' : ''}>⏳ قيد المراجعة</option>
                        <option value="جاري التجهيز" ${order.status === 'جاري التجهيز' ? 'selected' : ''}>📦 جاري التجهيز</option>
                        <option value="تم الشحن" ${order.status === 'تم الشحن' ? 'selected' : ''}>🚚 تم الشحن</option>
                        <option value="تم الاستلام" ${order.status === 'تم الاستلام' ? 'selected' : ''}>✅ تم الاستلام</option>
                        <option value="ملغي" ${order.status === 'ملغي' ? 'selected' : ''}>❌ ملغي</option>
                    </select>
                </td>
                <td>
                    <button class="btn-action btn-view" onclick="viewOrderDetails('${order.dbId}')"><i class="fas fa-eye"></i></button>
                </td>
            </tr>
        `;
    });
}

onValue(ref(db, 'orders'), (snapshot) => {
    allOrders = [];
    let totalRev = 0;
    let pending = 0;
    let ordersCount = 0;
    
    if (snapshot.exists()) {
        snapshot.forEach(child => {
            let o = child.val();
            o.dbId = child.key;
            allOrders.push(o);
            ordersCount++;
            
            if (o.status !== 'ملغي') {
                totalRev += o.total;
            }
            if (o.status === 'قيد المراجعة') {
                pending++;
            }
        });
        allOrders.reverse();
    }
    
    document.getElementById('statTotalOrders').innerText = ordersCount;
    document.getElementById('statTotalRevenue').innerText = Math.round(totalRev) + " ج.م";
    document.getElementById('statPendingOrders').innerText = pending;
    
    renderOrdersTable();
});

// ==========================================
// إدارة المنتجات
// ==========================================
let editingProductId = null;

window.openProductModal = () => {
    editingProductId = null; 
    document.getElementById("productModalTitle").innerText = "إضافة منتج جديد";
    document.getElementById("prodName").value = "";
    document.getElementById("prodPrice").value = "";
    document.getElementById("prodDiscountPrice").value = ""; 
    document.getElementById("prodDesc").value = ""; 
    document.getElementById("prodImage").value = "";
    document.getElementById("productModal").style.display = "flex";
};

window.saveProduct = () => {
    const name = document.getElementById("prodName").value;
    const price = document.getElementById("prodPrice").value;
    const discountPrice = document.getElementById("prodDiscountPrice").value;
    const category = document.getElementById("prodCategory").value;
    const description = document.getElementById("prodDesc").value; 
    const image = document.getElementById("prodImage").value;

    if (!name || !price || !category) {
        return alert("الاسم والسعر والقسم مطلوبين!");
    }

    const productData = { 
        name, 
        price: Number(price), 
        discountPrice: discountPrice ? Number(discountPrice) : null,
        category, 
        description, 
        imageUrl: image || "https://via.placeholder.com/300x300?text=صورة+المنتج"
    };

    if (editingProductId) {
        productData.updatedAt = Date.now();
        productData.updatedBy = currentUser;
        
        update(ref(db, `products/${editingProductId}`), productData).then(() => {
            logAction("تعديل منتج", `تعديل (${name})`);
            closeModal('productModal');
        });
    } else {
        productData.isActive = true;
        productData.createdAt = Date.now();
        productData.createdBy = currentUser;
        
        push(ref(db, 'products'), productData).then(() => {
            logAction("إضافة منتج", `تم إضافة منتج جديد: ${name}`);
            closeModal('productModal');
        });
    }
};

onValue(ref(db, 'products'), (snapshot) => {
    const table = document.getElementById("productsTableBody");
    table.innerHTML = ""; 

    if (snapshot.exists()) {
        snapshot.forEach(child => {
            const id = child.key;
            const p = child.val();
            
            const badgeClass = p.isActive ? "badge-active" : "badge-inactive";
            const hideIcon = p.isActive ? "fa-eye-slash" : "fa-eye";
            const hideBg = p.isActive ? "#64748b" : "#22c55e";

            let priceDisplay = p.discountPrice 
                ? `<del style="color:#94a3b8; font-size:13px;">${p.price}</del> <span style="color:var(--accent); font-weight:bold;">${p.discountPrice} ج.م</span>` 
                : `${p.price} ج.م`;

            table.innerHTML += `
                <tr>
                    <td>
                        <div class="product-info">
                            <img src="${p.imageUrl}" class="product-img">
                            <span>${p.name}</span>
                        </div>
                    </td>
                    <td>${priceDisplay}</td>
                    <td>${p.category}</td>
                    <td><span class="badge ${badgeClass}">${p.isActive ? 'معروض' : 'مخفي'}</span></td>
                    <td>
                        <div class="actions">
                            <button class="btn-action btn-edit" onclick="editProduct('${id}')"><i class="fas fa-pen"></i></button>
                            <button class="btn-action btn-hide" style="background-color: ${hideBg}" onclick="toggleProduct('${id}', ${p.isActive}, '${p.name}')"><i class="fas ${hideIcon}"></i></button>
                            <button class="btn-action btn-delete" onclick="deleteProduct('${id}', '${p.name}')"><i class="fas fa-trash"></i></button>
                        </div>
                    </td>
                </tr>`;
        });
    }
});

window.deleteProduct = (id, name) => {
    if (confirm("حذف المنتج؟")) {
        remove(ref(db, `products/${id}`)).then(() => {
            logAction("حذف منتج", `حذف المنتج: ${name}`);
        });
    }
};

window.toggleProduct = (id, status, name) => {
    update(ref(db, `products/${id}`), { isActive: !status }).then(() => {
        logAction(status ? "إخفاء منتج" : "إظهار منتج", `تغيير حالة المنتج: ${name}`);
    });
};

window.editProduct = (id) => {
    editingProductId = id; 
    get(child(ref(db), `products/${id}`)).then(s => {
        const p = s.val();
        document.getElementById("prodName").value = p.name;
        document.getElementById("prodPrice").value = p.price;
        document.getElementById("prodDiscountPrice").value = p.discountPrice || ""; 
        document.getElementById("prodDesc").value = p.description || ""; 
        document.getElementById("prodImage").value = p.imageUrl || "";
        setTimeout(() => document.getElementById("prodCategory").value = p.category, 100);
        document.getElementById("productModalTitle").innerText = "تعديل المنتج";
        document.getElementById('productModal').style.display = "flex";
    });
};

// ==========================================
// إدارة الأقسام
// ==========================================
let editingCatId = null;

window.openCategoryModal = () => { 
    editingCatId = null; 
    document.getElementById("catModalTitle").innerText = "إضافة قسم"; 
    document.getElementById("catNameInput").value = ""; 
    document.getElementById('categoryModal').style.display = "flex"; 
};

window.saveCategory = () => { 
    const name = document.getElementById("catNameInput").value.trim(); 
    if (!name) {
        return;
    }
    
    if (editingCatId) {
        update(ref(db, `categories/${editingCatId}`), { name }).then(() => {
            closeModal('categoryModal');
        });
    } else {
        push(ref(db, 'categories'), { name, isActive: true }).then(() => {
            closeModal('categoryModal');
        }); 
    }
};

window.editCategory = (id, name) => {
    editingCatId = id; 
    document.getElementById("catModalTitle").innerText = "تعديل القسم"; 
    document.getElementById("catNameInput").value = name; 
    document.getElementById('categoryModal').style.display = "flex"; 
};

onValue(ref(db, 'categories'), (snapshot) => { 
    const table = document.getElementById("categoriesTableBody");
    const select = document.getElementById("prodCategory"); 
    table.innerHTML = ""; 
    select.innerHTML = ""; 
    
    if (snapshot.exists()) { 
        snapshot.forEach(child => { 
            const c = child.val(); 
            table.innerHTML += `
                <tr>
                    <td><b>${c.name}</b></td>
                    <td><span class="badge ${c.isActive ? 'badge-active' : 'badge-inactive'}">${c.isActive ? 'مفعل' : 'مخفي'}</span></td>
                    <td>
                        <div class="actions">
                            <button class="btn-action btn-edit" onclick="editCategory('${child.key}', '${c.name}')"><i class="fas fa-pen"></i></button>
                            <button class="btn-action btn-delete" onclick="remove(ref(db, 'categories/${child.key}'))"><i class="fas fa-trash"></i></button>
                        </div>
                    </td>
                </tr>`; 
            select.innerHTML += `<option value="${c.name}">${c.name}</option>`; 
        }); 
    } 
});

// ==========================================
// إدارة الكوبونات
// ==========================================
let editingVoucherId = null; 
let allVouchers = [];

window.openVoucherModal = () => { 
    editingVoucherId = null; 
    document.getElementById("voucherModalTitle").innerText = "إنشاء كود"; 
    document.getElementById("voucherCode").value = ""; 
    document.getElementById("voucherValue").value = ""; 
    document.getElementById("voucherLimit").value = "1"; 
    document.getElementById('voucherModal').style.display = "flex"; 
};

window.saveVoucher = () => { 
    const code = document.getElementById("voucherCode").value.trim().toUpperCase();
    const type = document.getElementById("voucherType").value;
    const value = document.getElementById("voucherValue").value; 
    const limit = document.getElementById("voucherLimit").value; 
    
    if (!code || !value) {
        return;
    }
    
    if (editingVoucherId) {
        update(ref(db, `vouchers/${editingVoucherId}`), { 
            code, 
            type, 
            value: Number(value), 
            usageLimit: Number(limit) 
        }).then(() => closeModal('voucherModal'));
    } else {
        push(ref(db, 'vouchers'), { 
            code, 
            type, 
            value: Number(value), 
            usageLimit: Number(limit), 
            usedBy: [], 
            isActive: true 
        }).then(() => closeModal('voucherModal')); 
    }
};

window.editVoucher = (id) => {
    editingVoucherId = id; 
    const v = allVouchers.find(x => x.id === id); 
    if (!v) {
        return;
    }
    
    document.getElementById("voucherModalTitle").innerText = "تعديل الكود"; 
    document.getElementById("voucherCode").value = v.code; 
    document.getElementById("voucherType").value = v.type; 
    document.getElementById("voucherValue").value = v.value; 
    document.getElementById("voucherLimit").value = v.usageLimit || 1; 
    document.getElementById('voucherModal').style.display = "flex";
};

window.toggleVoucher = (id, status) => {
    update(ref(db, `vouchers/${id}`), { isActive: !status });
};

window.showVoucherUsers = (id) => {
    const v = allVouchers.find(x => x.id === id); 
    if (!v) {
        return;
    }
    
    const list = document.getElementById("vuList"); 
    list.innerHTML = "";
    
    if (!v.usedBy || v.usedBy.length === 0) { 
        list.innerHTML = "<div style='text-align:center; padding: 20px; color:#666;'>لم يستخدمه أحد بعد.</div>"; 
    } else { 
        Object.values(v.usedBy).forEach(u => { 
            list.innerHTML += `
                <div style="padding:15px; border-bottom:1px solid #eee;">
                    <b>${u.name}</b><br>
                    <span style="color:#666; font-size:13px;" dir="ltr">${u.phone}</span>
                </div>`; 
        }); 
    }
    document.getElementById("voucherUsersModal").style.display = "flex";
};

onValue(ref(db, 'vouchers'), (snapshot) => { 
    const table = document.getElementById("vouchersTableBody"); 
    table.innerHTML = ""; 
    allVouchers = [];
    
    if (snapshot.exists()) { 
        snapshot.forEach(child => { 
            const v = child.val(); 
            v.id = child.key; 
            allVouchers.push(v);
            
            let usedCount = v.usedBy ? Object.keys(v.usedBy).length : 0;
            let limitText = v.usageLimit ? `${usedCount} / ${v.usageLimit}` : `${usedCount}`;
            
            table.innerHTML += `
                <tr>
                    <td><b>${v.code}</b></td>
                    <td>${v.value} ${v.type === 'percentage' ? '%' : 'ج.م'}</td>
                    <td dir="ltr" style="font-weight:bold; color:var(--secondary);">${limitText}</td>
                    <td><span class="badge ${v.isActive ? 'badge-active' : 'badge-inactive'}">${v.isActive ? 'مفعل' : 'معطل'}</span></td>
                    <td>
                        <div class="actions">
                            <button class="btn-action btn-users" onclick="showVoucherUsers('${v.id}')" title="عرض المستخدمين"><i class="fas fa-users"></i></button>
                            <button class="btn-action btn-edit" onclick="editVoucher('${v.id}')" title="تعديل الكود"><i class="fas fa-pen"></i></button>
                            <button class="btn-action btn-hide" style="background-color: ${v.isActive ? '#64748b' : '#22c55e'}" onclick="toggleVoucher('${v.id}', ${v.isActive})" title="${v.isActive ? 'تعطيل' : 'تفعيل'}"><i class="fas ${v.isActive ? 'fa-ban' : 'fa-check'}"></i></button>
                            <button class="btn-action btn-delete" onclick="remove(ref(db, 'vouchers/${child.key}'))"><i class="fas fa-trash"></i></button>
                        </div>
                    </td>
                </tr>`; 
        }); 
    } 
});

// ==========================================
// إدارة الموظفين
// ==========================================
let editingEmpId = null;

window.openEmployeeModal = () => { 
    editingEmpId = null;
    document.getElementById("empModalTitle").innerText = "إضافة موظف";
    document.getElementById("empName").value = ""; 
    document.getElementById("empPhone").value = ""; 
    document.getElementById("empDob").value = ""; 
    document.getElementById("empNationalId").value = ""; 
    document.getElementById("empArea").value = ""; 
    document.getElementById("empRole").value = "Admin"; 
    document.getElementById("empNotes").value = ""; 
    document.getElementById('employeeModal').style.display = "flex"; 
};

window.saveEmployee = () => { 
    const name = document.getElementById("empName").value;
    const phone = document.getElementById("empPhone").value;
    const role = document.getElementById("empRole").value;
    const dob = document.getElementById("empDob").value;
    const nationalId = document.getElementById("empNationalId").value;
    const area = document.getElementById("empArea").value;
    const notes = document.getElementById("empNotes").value;
    
    if (!name) {
        return;
    }
    
    const data = { name, phone, role, dob, nationalId, area, notes };
    
    if (editingEmpId) { 
        update(ref(db, `employees/${editingEmpId}`), data).then(() => {
            closeModal('employeeModal');
        }); 
    } else { 
        data.isActive = true; 
        data.createdAt = Date.now(); 
        push(ref(db, 'employees'), data).then(() => {
            closeModal('employeeModal');
        }); 
    }
};

window.editEmployee = (id) => {
    editingEmpId = id; 
    get(child(ref(db), `employees/${id}`)).then(s => {
        const e = s.val(); 
        document.getElementById("empModalTitle").innerText = "تعديل الموظف"; 
        document.getElementById("empName").value = e.name; 
        document.getElementById("empPhone").value = e.phone || ""; 
        document.getElementById("empDob").value = e.dob || ""; 
        document.getElementById("empNationalId").value = e.nationalId || ""; 
        document.getElementById("empArea").value = e.area || ""; 
        document.getElementById("empRole").value = e.role || "Support"; 
        document.getElementById("empNotes").value = e.notes || ""; 
        document.getElementById('employeeModal').style.display = "flex";
    });
};

onValue(ref(db, 'employees'), (snapshot) => { 
    const table = document.getElementById("employeesTableBody"); 
    table.innerHTML = ""; 
    
    if (snapshot.exists()) { 
        snapshot.forEach(child => { 
            const e = child.val(); 
            table.innerHTML += `
                <tr>
                    <td>
                        <b>${e.name}</b>
                        <div class="emp-details">${formatDateOnly(e.createdAt)}</div>
                    </td>
                    <td>${e.phone}</td>
                    <td>${e.role}</td>
                    <td><span class="badge badge-active">نشط</span></td>
                    <td>
                        <div class="actions">
                            <button class="btn-action btn-edit" onclick="editEmployee('${child.key}')"><i class="fas fa-pen"></i></button>
                            <button class="btn-action btn-delete" onclick="remove(ref(db, 'employees/${child.key}'))"><i class="fas fa-trash"></i></button>
                        </div>
                    </td>
                </tr>`; 
        }); 
    } 
});

// ==========================================
// سجل النشاطات (Audit Trail) والأرشفة
// ==========================================
onValue(ref(db, 'logs'), (snapshot) => { 
    const table = document.getElementById("logsTableBody"); 
    table.innerHTML = ""; 
    
    if (snapshot.exists()) { 
        const logs = []; 
        snapshot.forEach(child => {
            logs.push({ id: child.key, ...child.val() });
        }); 
        
        logs.reverse().forEach(log => { 
            table.innerHTML += `
                <tr>
                    <td style="font-weight:bold; color:var(--primary);">${log.action}</td>
                    <td>${log.details}</td>
                    <td>${log.user}</td>
                    <td dir="ltr" style="font-size:12px;">${formatDateTime(log.timestamp)}</td>
                </tr>`; 
        }); 
    } 
});

window.archiveLogs = () => {
    if (!confirm("هل أنت متأكد من أرشفة سجلات الشهر الماضي وحذفها من السجل الحالي؟")) {
        return;
    }
    
    // حساب الوقت من 30 يوم
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    
    get(ref(db, 'logs')).then(snapshot => {
        if (snapshot.exists()) {
            let updates = {};
            
            snapshot.forEach(child => {
                if (child.val().timestamp < thirtyDaysAgo) {
                    updates[`archived_logs/${child.key}`] = child.val();
                    updates[`logs/${child.key}`] = null; 
                }
            });
            
            if (Object.keys(updates).length > 0) {
                update(ref(db), updates).then(() => {
                    alert("تمت أرشفة السجلات القديمة بنجاح! السجل الآن نظيف.");
                });
            } else {
                alert("لا توجد سجلات أقدم من شهر لأرشفتها.");
            }
        }
    });
};
