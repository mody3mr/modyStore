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
// القائمة الجانبية 
// ==========================================
document.getElementById('sidebarToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
});

// ==========================================
// النوافذ الاحترافية (Custom Popups)
// ==========================================
window.closeModal = (id) => {
    document.getElementById(id).style.display = 'none';
};

window.showAlert = (msg) => {
    document.getElementById("alertMsg").innerText = msg;
    document.getElementById("customAlert").style.display = "flex";
};

window.closeAlert = () => {
    document.getElementById("customAlert").style.display = "none";
};

let confirmCallback = null;

window.showConfirm = (msg, callback) => {
    document.getElementById("confirmMsg").innerText = msg;
    confirmCallback = callback;
    document.getElementById("customConfirm").style.display = "flex";
};

window.closeConfirm = () => {
    document.getElementById("customConfirm").style.display = "none";
};

document.getElementById("confirmBtn").addEventListener("click", () => {
    if (confirmCallback) {
        confirmCallback();
    }
    closeConfirm();
});

// ==========================================
// دوال مساعدة
// ==========================================
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

window.goToOrdersTab = (tab = 'active') => {
    document.querySelector('[data-target="orders-view"]').click();
    window.switchOrderTab(tab);
};

// ==========================================
// تقارير المبيعات (مع البحث بيوم محدد والمنتجات)
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

let currentReportProducts = [];

window.generateReport = (filterType, element) => {
    if (element.tagName === "BUTTON") {
        document.querySelectorAll('.report-filters button').forEach(b => {
            b.classList.remove('active');
        });
        element.classList.add('active');
        document.getElementById("reportSpecificDate").value = ""; 
    } else {
        document.querySelectorAll('.report-filters button').forEach(b => {
            b.classList.remove('active');
        });
    }

    const now = new Date();
    let start, end;

    if (filterType === 'today') {
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        end = Date.now();
    } else if (filterType === 'month') {
        start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        end = Date.now();
    } else if (filterType === 'specific') {
        if (!element.value) {
            return;
        }
        const d = new Date(element.value);
        start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        end = start + (24 * 60 * 60 * 1000) - 1;
    } else {
        start = 0; 
        end = Date.now();
    }

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
        
        if (order.createdAt >= start && order.createdAt <= end) {
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
                        name: item.name, 
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
    
    document.getElementById("reportPaymentBreakdown").innerHTML = `
        <div class="payment-row">
            <span><i class="fas fa-hand-holding-usd text-accent"></i> كاش</span> 
            <span class="amount">${Math.round(paymentStats["الدفع عند الاستلام (COD)"])} ج</span>
        </div>
        <div class="payment-row">
            <span><i class="fas fa-mobile-alt" style="color:#8b5cf6;"></i> محفظة</span> 
            <span class="amount">${Math.round(paymentStats["محفظة إلكترونية"])} ج</span>
        </div>
        <div class="payment-row">
            <span><i class="fas fa-bolt" style="color:#0ea5e9;"></i> إنستا</span> 
            <span class="amount">${Math.round(paymentStats["إنستا باي (InstaPay)"])} ج</span>
        </div>
        <div class="payment-row">
            <span><i class="fas fa-credit-card text-primary"></i> فيزا</span> 
            <span class="amount">${Math.round(paymentStats["فيزا / بطاقة ائتمان"])} ج</span>
        </div>
    `;

    currentReportProducts = Object.values(productSales).sort((a, b) => {
        return b.qty - a.qty;
    }); 
    
    window.filterReportProducts();
};

window.filterReportProducts = () => {
    const term = document.getElementById("searchReportProducts").value.toLowerCase();
    const div = document.getElementById("reportTopProducts");
    div.innerHTML = "";
    
    let filtered = currentReportProducts.filter(p => {
        return p.name.toLowerCase().includes(term);
    });
    
    if (filtered.length === 0) {
        div.innerHTML = "<div style='text-align:center; padding:20px;'>لا توجد مبيعات.</div>";
    }
    
    filtered.slice(0, 15).forEach(p => {
        div.innerHTML += `
            <div class="top-product-item">
                <img src="${p.img}" class="top-product-img">
                <div class="top-product-details">
                    <div class="top-product-title">${p.name}</div>
                    <div class="top-product-stats">تم بيع ${p.qty} قطعة</div>
                </div>
                <div class="top-product-revenue">${Math.round(p.revenue)} ج.م</div>
            </div>`;
    });
};

// ==========================================
// إدارة الطلبات (مع إصلاح الفلاتر والبحث لتظهر كل الطلبات)
// ==========================================
let allOrders = [];
let currentOrderTab = 'active';

window.switchOrderTab = (tab) => {
    currentOrderTab = tab;
    document.getElementById('tabActiveOrders').classList.toggle('active', tab === 'active');
    document.getElementById('tabArchivedOrders').classList.toggle('active', tab === 'archived');
    window.renderOrdersTable();
};

window.renderOrdersTable = () => {
    const table = document.getElementById("ordersTableBody");
    table.innerHTML = "";
    
    const searchInput = document.getElementById("searchOrders");
    const search = searchInput ? searchInput.value.toLowerCase() : "";
    
    const dateInput = document.getElementById("filterOrderDate");
    const dateFilter = dateInput ? dateInput.value : "";
    
    const paymentInput = document.getElementById("filterOrderPayment");
    const paymentFilter = paymentInput ? paymentInput.value : "";

    let filteredOrders = allOrders.filter(order => {
        let tabMatch = false;
        
        // دمج "تم الاستلام" القديمة مع "تم تسليمه" الجديدة عشان مفيش حاجة تختفي
        if (currentOrderTab === 'active') {
            tabMatch = ['قيد المراجعة', 'جاري التجهيز', 'تم الشحن'].includes(order.status);
        } else {
            tabMatch = ['تم تسليمه', 'تم الاستلام', 'ملغي'].includes(order.status);
        }
            
        // حماية المتغيرات لو הדاتا قديمة ومفيهاش اسم أو رقم عشان ميعملش Error
        let orderIdStr = order.orderId ? String(order.orderId).toLowerCase() : "";
        let custName = (order.customer && order.customer.name) ? String(order.customer.name).toLowerCase() : "";
        let custPhone = (order.customer && order.customer.phone) ? String(order.customer.phone).toLowerCase() : "";

        let searchMatch = orderIdStr.includes(search) || custName.includes(search) || custPhone.includes(search);
                          
        let dateMatch = true;
        if (dateFilter && order.createdAt) {
            let oDateObj = new Date(order.createdAt);
            let y = oDateObj.getFullYear();
            let m = String(oDateObj.getMonth() + 1).padStart(2, '0');
            let d = String(oDateObj.getDate()).padStart(2, '0');
            let formattedDate = `${y}-${m}-${d}`;
            
            if (formattedDate !== dateFilter) {
                dateMatch = false;
            }
        }

        let payMatch = true;
        if (paymentFilter) {
            let pMethod = order.paymentMethod ? String(order.paymentMethod) : "";
            if (!pMethod.includes(paymentFilter)) {
                payMatch = false;
            }
        }

        return tabMatch && searchMatch && dateMatch && payMatch;
    });

    if (filteredOrders.length === 0) {
        table.innerHTML = "<tr><td colspan='6' style='text-align:center; padding: 20px;'>لا توجد طلبات مطابقة للبحث.</td></tr>";
        return;
    }

    filteredOrders.forEach(order => {
        let statusClass = 'status-cancelled';
        if (order.status === 'قيد المراجعة') {
            statusClass = 'status-pending';
        } else if (order.status === 'جاري التجهيز') {
            statusClass = 'status-processing';
        } else if (order.status === 'تم الشحن') {
            statusClass = 'status-shipped';
        } else if (order.status === 'تم تسليمه' || order.status === 'تم الاستلام') {
            statusClass = 'status-delivered';
        }
        
        let displayStatus = (order.status === 'تم الاستلام') ? 'تم تسليمه' : order.status;

        table.innerHTML += `
            <tr>
                <td style="font-weight:900; color:var(--primary);">#${order.orderId || "غير محدد"}</td>
                <td>
                    <b>${(order.customer && order.customer.name) ? order.customer.name : "غير معروف"}</b><br>
                    <span class="meta-info">${order.paymentMethod || "الدفع عند الاستلام"}</span>
                </td>
                <td dir="ltr" class="meta-info">${formatDateTime(order.createdAt)}</td>
                <td style="font-weight:bold; color:var(--secondary);">${Math.round(order.total || 0)} ج.م</td>
                <td>
                    <select class="status-select ${statusClass}" onchange="updateOrderStatus('${order.dbId}', this)">
                        <option value="قيد المراجعة" ${displayStatus === 'قيد المراجعة' ? 'selected' : ''}>⏳ قيد المراجعة</option>
                        <option value="جاري التجهيز" ${displayStatus === 'جاري التجهيز' ? 'selected' : ''}>📦 جاري التجهيز</option>
                        <option value="تم الشحن" ${displayStatus === 'تم الشحن' ? 'selected' : ''}>🚚 تم الشحن</option>
                        <option value="تم تسليمه" ${displayStatus === 'تم تسليمه' ? 'selected' : ''}>✅ تم تسليمه</option>
                        <option value="ملغي" ${displayStatus === 'ملغي' ? 'selected' : ''}>❌ ملغي</option>
                    </select>
                </td>
                <td>
                    <button class="btn-action btn-view" onclick="viewOrderDetails('${order.dbId}')">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>`;
    });
};

window.updateOrderStatus = (orderId, selectElement) => {
    const newStatus = selectElement.value;
    const updates = { status: newStatus };
    const now = Date.now();

    if (newStatus === 'جاري التجهيز') {
        updates.processedAt = now;
    }
    if (newStatus === 'تم الشحن') {
        updates.shippedAt = now;
    }
    if (newStatus === 'تم تسليمه') {
        updates.deliveredAt = now;
    }
    if (newStatus === 'ملغي') {
        updates.cancelledAt = now;
    }

    update(ref(db, `orders/${orderId}`), updates).then(() => {
        logAction("تحديث حالة طلب", `تغيير حالة الطلب لـ ${newStatus}`);
    });
};

// ==========================================
// تجهيز بوليصة الشحن Bosta
// ==========================================
let currentPrintOrder = null;

window.viewOrderDetails = (orderDbId) => {
    const order = allOrders.find(o => o.dbId === orderDbId);
    if (!order) {
        return;
    }
    
    currentPrintOrder = order;

    document.getElementById("orderModalTitle").innerText = `تفاصيل الطلب: #${order.orderId}`;
    document.getElementById("oName").innerText = (order.customer && order.customer.name) ? order.customer.name : "غير معروف";
    document.getElementById("oPhone").innerText = (order.customer && order.customer.phone) ? order.customer.phone : "";
    document.getElementById("oAddress").innerText = (order.customer && order.customer.address) ? order.customer.address : "";
    document.getElementById("oPayment").innerText = order.paymentMethod || "دفع عند الاستلام";

    const list = document.getElementById("oItemsList");
    list.innerHTML = "";
    
    if (order.items && Array.isArray(order.items)) {
        order.items.forEach(item => {
            list.innerHTML += `
                <div class="order-item-row">
                    <span>${item.qty}x ${item.name}</span>
                    <span>${item.qty * item.price} ج.م</span>
                </div>`;
        });
    }

    document.getElementById("oSubtotal").innerText = `${order.subtotal || 0} ج.م`;
    
    if (order.discount && order.discount > 0) {
        document.getElementById("oDiscountDiv").style.display = "block";
        document.getElementById("oDiscount").innerText = `-${Math.round(order.discount)} ج.م`;
    } else {
        document.getElementById("oDiscountDiv").style.display = "none";
    }
    
    document.getElementById("oTotal").innerText = `${Math.round(order.total || 0)} ج.م`;

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
        let procClass = order.processedAt ? 'done' : '';
        tlHtml += `
            <div class="tl-step ${procClass}">
                <div class="tl-title">جاري التجهيز</div>
                <div class="tl-date">${formatDateTime(order.processedAt)}</div>
            </div>`;
            
        let shipClass = order.shippedAt ? 'done' : '';
        tlHtml += `
            <div class="tl-step ${shipClass}">
                <div class="tl-title">تم الشحن</div>
                <div class="tl-date">${formatDateTime(order.shippedAt)}</div>
            </div>`;
            
        let delClass = order.deliveredAt ? 'done' : '';
        tlHtml += `
            <div class="tl-step ${delClass}">
                <div class="tl-title">تم تسليمه</div>
                <div class="tl-date">${formatDateTime(order.deliveredAt)}</div>
            </div>`;
    }
    
    document.getElementById("oTimeline").innerHTML = tlHtml;
    document.getElementById("orderDetailsModal").style.display = "flex";
};

window.printDocument = (type) => {
    if (type === 'waybill') {
        const order = currentPrintOrder;
        
        JsBarcode("#topBarcode", order.orderId, { 
            format: "CODE128", 
            width: 2, 
            height: 50, 
            displayValue: true 
        });
        
        document.getElementById("qrCodeBox").innerHTML = "";
        new QRCode(document.getElementById("qrCodeBox"), { 
            text: "https://mody3mr.github.io/modytech/store", 
            width: 80, 
            height: 80 
        });

        const allowOpenSelect = document.getElementById("wbAllowOpen");
        if (allowOpenSelect) {
             document.getElementById("printAllowOpen").innerText = allowOpenSelect.value;
        }
       
        document.getElementById("printCustName").innerText = (order.customer && order.customer.name) ? order.customer.name : "";
        
        let addrParts = [];
        if (order.customer && order.customer.address) {
             addrParts = order.customer.address.split('-');
        }
        
        document.getElementById("printCity").innerText = addrParts[0] || "غير محدد";
        document.getElementById("printRegion").innerText = addrParts[1] || "";
        document.getElementById("printAddress").innerText = (order.customer && order.customer.address) ? order.customer.address : "";
        document.getElementById("printPhone1").innerText = (order.customer && order.customer.phone) ? order.customer.phone : "";
        
        let descParts = [];
        if (order.items && Array.isArray(order.items)) {
            order.items.forEach(i => {
                descParts.push(`${i.qty}x ${i.name}`);
            });
        }
        document.getElementById("printProductsDesc").innerText = descParts.join(' ، ');
        
        const notesInput = document.getElementById("wbNotes");
        let notesText = notesInput ? notesInput.value : "";
        if (!notesText) {
            notesText = "لا يوجد";
        }
        document.getElementById("printNotes").innerText = notesText;
        document.getElementById("printOrderRef").innerText = order.orderId;
        
        let cod = 0;
        if (order.paymentMethod && order.paymentMethod !== "الدفع عند الاستلام (COD)") {
            cod = 0;
        } else {
            cod = Math.round(order.total || 0);
        }
        document.getElementById("printCodAmount").innerText = cod + " EGP";

        document.body.className = 'print-mode-waybill';
    } else {
        document.body.className = 'print-mode-invoice';
    }
    
    window.print();
    
    setTimeout(() => { 
        document.body.className = ''; 
    }, 500); 
};

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
                totalRev += (o.total || 0);
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
    
    window.renderOrdersTable();
});

// ==========================================
// إدارة المنتجات (مع البحث)
// ==========================================
let editingProductId = null;
let allProducts = [];

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
        return window.showAlert("الاسم والسعر والقسم مطلوبين!");
    }
    
    let parsedDiscount = null;
    if (discountPrice) {
        parsedDiscount = Number(discountPrice);
    }

    const data = { 
        name: name, 
        price: Number(price), 
        discountPrice: parsedDiscount, 
        category: category, 
        description: description, 
        imageUrl: image || "https://via.placeholder.com/300" 
    };

    if (editingProductId) {
        update(ref(db, `products/${editingProductId}`), data).then(() => {
            window.closeModal('productModal');
        });
    } else {
        data.isActive = true; 
        push(ref(db, 'products'), data).then(() => {
            window.closeModal('productModal');
        });
    }
};

window.filterProducts = () => {
    const term = document.getElementById("searchProducts").value.toLowerCase();
    const table = document.getElementById("productsTableBody"); 
    table.innerHTML = "";
    
    let filtered = allProducts.filter(p => {
        return p.name.toLowerCase().includes(term);
    });
    
    filtered.forEach(p => {
        let priceDisplay = `${p.price} ج.م`;
        if (p.discountPrice) {
            priceDisplay = `<del style="color:#94a3b8;">${p.price}</del> <span style="color:var(--accent); font-weight:bold;">${p.discountPrice} ج.م</span>`;
        }
        
        let badgeClass = p.isActive ? 'badge-active' : 'badge-inactive';
        let badgeText = p.isActive ? 'معروض' : 'مخفي';
        let toggleIcon = p.isActive ? 'fa-eye-slash' : 'fa-eye';
        let toggleBg = p.isActive ? '#64748b' : '#22c55e';
        
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
                <td><span class="badge ${badgeClass}">${badgeText}</span></td>
                <td>
                    <div class="actions">
                        <button class="btn-action btn-edit" onclick="editProduct('${p.id}')">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button class="btn-action btn-hide" style="background-color: ${toggleBg}" onclick="toggleProduct('${p.id}', ${p.isActive})">
                            <i class="fas ${toggleIcon}"></i>
                        </button>
                        <button class="btn-action btn-delete" onclick="deleteProduct('${p.id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
    });
};

onValue(ref(db, 'products'), (snapshot) => {
    allProducts = [];
    if (snapshot.exists()) {
        snapshot.forEach(child => { 
            allProducts.push({ id: child.key, ...child.val() }); 
        });
    }
    window.filterProducts();
});

window.deleteProduct = (id) => {
    window.showConfirm("هل تريد حذف هذا المنتج نهائياً؟", () => {
        remove(ref(db, `products/${id}`));
    });
};

window.toggleProduct = (id, status) => {
    update(ref(db, `products/${id}`), { isActive: !status });
};

window.editProduct = (id) => {
    editingProductId = id; 
    const p = allProducts.find(x => x.id === id);
    
    document.getElementById("prodName").value = p.name; 
    document.getElementById("prodPrice").value = p.price;
    document.getElementById("prodDiscountPrice").value = p.discountPrice || ""; 
    document.getElementById("prodDesc").value = p.description || "";
    document.getElementById("prodImage").value = p.imageUrl || ""; 
    
    setTimeout(() => {
        document.getElementById("prodCategory").value = p.category;
    }, 100);
    
    document.getElementById("productModalTitle").innerText = "تعديل المنتج"; 
    document.getElementById('productModal').style.display = "flex";
};

// ==========================================
// الأقسام (مع البحث والحذف الجديد)
// ==========================================
let editingCatId = null; 
let allCategories = [];

window.openCategoryModal = () => { 
    editingCatId = null; 
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
            window.closeModal('categoryModal');
        });
    } else {
        push(ref(db, 'categories'), { name: name, isActive: true }).then(() => {
            window.closeModal('categoryModal');
        });
    }
};

window.editCategory = (id, name) => { 
    editingCatId = id; 
    document.getElementById("catNameInput").value = name; 
    document.getElementById('categoryModal').style.display = "flex"; 
};

window.deleteCategory = (id) => {
    window.showConfirm("هل متأكد من حذف القسم؟", () => {
        remove(ref(db, `categories/${id}`));
    });
};

window.filterCategories = () => {
    const term = document.getElementById("searchCategories").value.toLowerCase();
    const table = document.getElementById("categoriesTableBody"); 
    const select = document.getElementById("prodCategory");
    
    table.innerHTML = ""; 
    select.innerHTML = "";
    
    let filtered = allCategories.filter(c => {
        return c.name.toLowerCase().includes(term);
    });
    
    filtered.forEach(c => {
        let badgeClass = c.isActive ? 'badge-active' : 'badge-inactive';
        let badgeText = c.isActive ? 'مفعل' : 'مخفي';
        
        table.innerHTML += `
            <tr>
                <td><b>${c.name}</b></td>
                <td><span class="badge ${badgeClass}">${badgeText}</span></td>
                <td>
                    <div class="actions">
                        <button class="btn-action btn-edit" onclick="editCategory('${c.id}', '${c.name}')">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button class="btn-action btn-delete" onclick="deleteCategory('${c.id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
            
        select.innerHTML += `<option value="${c.name}">${c.name}</option>`;
    });
};

onValue(ref(db, 'categories'), (snapshot) => { 
    allCategories = []; 
    if (snapshot.exists()) {
        snapshot.forEach(child => {
            allCategories.push({ id: child.key, ...child.val() });
        });
    }
    window.filterCategories();
});

// ==========================================
// الكوبونات (مع الحذف وتغيير الحالة التلقائي)
// ==========================================
let editingVoucherId = null; 
let allVouchers = [];

window.openVoucherModal = () => { 
    editingVoucherId = null; 
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
    
    let data = { 
        code: code, 
        type: type, 
        value: Number(value), 
        usageLimit: Number(limit) 
    };
    
    if (editingVoucherId) {
        update(ref(db, `vouchers/${editingVoucherId}`), data).then(() => {
            window.closeModal('voucherModal');
        });
    } else {
        data.usedBy = [];
        data.isActive = true;
        push(ref(db, 'vouchers'), data).then(() => {
            window.closeModal('voucherModal');
        });
    }
};

window.editVoucher = (id) => { 
    editingVoucherId = id; 
    const v = allVouchers.find(x => x.id === id); 
    
    document.getElementById("voucherCode").value = v.code; 
    document.getElementById("voucherType").value = v.type; 
    document.getElementById("voucherValue").value = v.value; 
    document.getElementById("voucherLimit").value = v.usageLimit || 1; 
    document.getElementById('voucherModal').style.display = "flex"; 
};

window.toggleVoucher = (id, status) => {
    update(ref(db, `vouchers/${id}`), { isActive: !status });
};

window.deleteVoucher = (id) => {
    window.showConfirm("حذف الكوبون نهائياً؟", () => {
        remove(ref(db, `vouchers/${id}`));
    });
};

window.showVoucherUsers = (id) => {
    const v = allVouchers.find(x => x.id === id); 
    if (!v) {
        return;
    }
    
    const list = document.getElementById("vuList"); 
    list.innerHTML = "";
    
    if (!v.usedBy || Object.keys(v.usedBy).length === 0) {
        list.innerHTML = "<div style='text-align:center; padding: 20px; color:#666;'>لم يستخدمه أحد بعد.</div>"; 
    } else {
        Object.values(v.usedBy).forEach(u => { 
            list.innerHTML += `
                <div style="padding:15px; border-bottom:1px solid #eee;">
                    <b>${u.name}</b><br>
                    <span style="color:var(--secondary); font-weight:bold;" dir="ltr">${u.phone}</span>
                </div>`; 
        });
    }
    
    document.getElementById("voucherUsersModal").style.display = "flex";
};

window.filterVouchers = () => {
    const term = document.getElementById("searchVouchers").value.toLowerCase();
    const table = document.getElementById("vouchersTableBody"); 
    table.innerHTML = "";
    
    let filtered = allVouchers.filter(v => {
        return v.code.toLowerCase().includes(term);
    });
    
    filtered.forEach(v => {
        let usedCount = 0;
        if (v.usedBy) {
            usedCount = Object.keys(v.usedBy).length;
        }
        
        let limitText = usedCount;
        if (v.usageLimit) {
            limitText = `${usedCount} / ${v.usageLimit}`;
        }
        
        if (v.usageLimit && usedCount >= v.usageLimit && v.isActive) {
            update(ref(db, `vouchers/${v.id}`), { isActive: false }); 
            v.isActive = false;
        }

        let typeText = v.type === 'percentage' ? '%' : 'ج.م';
        let badgeClass = v.isActive ? 'badge-active' : 'badge-inactive';
        let badgeText = v.isActive ? 'مفعل' : 'معطل';
        let toggleIcon = v.isActive ? 'fa-ban' : 'fa-check';
        let toggleBg = v.isActive ? '#64748b' : '#22c55e';
        let toggleTitle = v.isActive ? 'تعطيل' : 'تفعيل';

        table.innerHTML += `
            <tr>
                <td><b>${v.code}</b></td>
                <td>${v.value} ${typeText}</td>
                <td dir="ltr" style="font-weight:bold;">${limitText}</td>
                <td><span class="badge ${badgeClass}">${badgeText}</span></td>
                <td>
                    <div class="actions">
                        <button class="btn-action btn-users" onclick="showVoucherUsers('${v.id}')"><i class="fas fa-users"></i></button>
                        <button class="btn-action btn-edit" onclick="editVoucher('${v.id}')"><i class="fas fa-pen"></i></button>
                        <button class="btn-action btn-hide" style="background-color: ${toggleBg}" onclick="toggleVoucher('${v.id}', ${v.isActive})" title="${toggleTitle}"><i class="fas ${toggleIcon}"></i></button>
                        <button class="btn-action btn-delete" onclick="deleteVoucher('${v.id}')"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>`; 
    });
};

onValue(ref(db, 'vouchers'), (snapshot) => { 
    allVouchers = []; 
    if (snapshot.exists()) {
        snapshot.forEach(child => {
            allVouchers.push({ id: child.key, ...child.val() });
        });
    }
    window.filterVouchers();
});

// ==========================================
// إدارة الموظفين (مع الحذف والبحث)
// ==========================================
let editingEmpId = null; 
let allEmployees = [];

window.openEmployeeModal = () => { 
    editingEmpId = null; 
    document.getElementById("empName").value = ""; 
    document.getElementById("empPhone").value = ""; 
    document.getElementById("empDob").value = ""; 
    document.getElementById("empNationalId").value = ""; 
    document.getElementById("empArea").value = ""; 
    document.getElementById("empNotes").value = ""; 
    document.getElementById('employeeModal').style.display = "flex"; 
};

window.saveEmployee = () => { 
    const data = { 
        name: document.getElementById("empName").value, 
        phone: document.getElementById("empPhone").value, 
        role: document.getElementById("empRole").value, 
        dob: document.getElementById("empDob").value, 
        nationalId: document.getElementById("empNationalId").value, 
        area: document.getElementById("empArea").value, 
        notes: document.getElementById("empNotes").value 
    };
    
    if (!data.name) {
        return window.showAlert("اسم الموظف مطلوب!");
    }
    
    if (editingEmpId) {
        update(ref(db, `employees/${editingEmpId}`), data).then(() => {
            window.closeModal('employeeModal');
        }); 
    } else { 
        data.isActive = true; 
        data.createdAt = Date.now(); 
        push(ref(db, 'employees'), data).then(() => {
            window.closeModal('employeeModal');
        }); 
    }
};

window.editEmployee = (id) => {
    editingEmpId = id; 
    const e = allEmployees.find(x => x.id === id);
    
    document.getElementById("empName").value = e.name; 
    document.getElementById("empPhone").value = e.phone || ""; 
    document.getElementById("empDob").value = e.dob || ""; 
    document.getElementById("empNationalId").value = e.nationalId || ""; 
    document.getElementById("empArea").value = e.area || ""; 
    document.getElementById("empRole").value = e.role || "Support"; 
    document.getElementById("empNotes").value = e.notes || ""; 
    document.getElementById('employeeModal').style.display = "flex";
};

window.deleteEmployee = (id) => {
    window.showConfirm("حذف بيانات الموظف نهائياً؟", () => {
        remove(ref(db, `employees/${id}`));
    });
};

window.filterEmployees = () => {
    const term = document.getElementById("searchEmployees").value.toLowerCase();
    const table = document.getElementById("employeesTableBody"); 
    table.innerHTML = ""; 
    
    let filtered = allEmployees.filter(e => {
        let nameMatch = e.name.toLowerCase().includes(term);
        let phoneMatch = false;
        if (e.phone) {
            phoneMatch = e.phone.includes(term);
        }
        return nameMatch || phoneMatch;
    });
    
    filtered.forEach(e => {
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
                        <button class="btn-action btn-edit" onclick="editEmployee('${e.id}')">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button class="btn-action btn-delete" onclick="deleteEmployee('${e.id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>`; 
    });
};

onValue(ref(db, 'employees'), (snapshot) => { 
    allEmployees = []; 
    if (snapshot.exists()) {
        snapshot.forEach(child => {
            allEmployees.push({ id: child.key, ...child.val() });
        });
    }
    window.filterEmployees();
});

// ==========================================
// سجل النشاطات والأرشفة
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
    window.showConfirm("هل أنت متأكد من أرشفة سجلات الشهر الماضي وحذفها من السجل الحالي؟", () => {
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
                        window.showAlert("تمت أرشفة السجلات القديمة بنجاح! السجل الآن نظيف.");
                    });
                } else {
                    window.showAlert("لا توجد سجلات أقدم من شهر لأرشفتها.");
                }
            }
        });
    });
};
