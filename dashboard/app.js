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
// نظام الصلاحيات المبدئي (لو فيه نظام Login هيتغير من هنا)
window.currentUserRole = "Admin"; // خيارات: "Admin" أو "Supervisor"

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

window.showAlert = (msg, icon = 'success') => {
    // --- التعديلات التفاعلية الجديدة ---
    if(typeof Swal !== 'undefined') {
        Swal.fire({
            text: msg,
            icon: icon,
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3000,
            timerProgressBar: true,
        });
    } else {
        // --- الكود القديم الخاص بك (احتياطي) ---
        document.getElementById("alertMsg").innerText = msg;
        document.getElementById("customAlert").style.display = "flex";
    }
};

window.closeAlert = () => {
    document.getElementById("customAlert").style.display = "none";
};

let confirmCallback = null;

window.showConfirm = (msg, callback) => {
    // --- التعديلات التفاعلية الجديدة ---
    if(typeof Swal !== 'undefined') {
        Swal.fire({
            title: 'هل أنت متأكد؟',
            text: msg,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#94a3b8',
            confirmButtonText: 'نعم، تأكيد',
            cancelButtonText: 'إلغاء'
        }).then((result) => {
            if (result.isConfirmed) {
                callback();
            }
        });
    } else {
        // --- الكود القديم الخاص بك (احتياطي) ---
        document.getElementById("confirmMsg").innerText = msg;
        confirmCallback = callback;
        document.getElementById("customConfirm").style.display = "flex";
    }
};

window.closeConfirm = () => {
    document.getElementById("customConfirm").style.display = "none";
};

const confirmBtnEl = document.getElementById("confirmBtn");
if (confirmBtnEl) {
    confirmBtnEl.addEventListener("click", () => {
        if (confirmCallback) {
            confirmCallback();
        }
        closeConfirm();
    });
}

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

        // التعديل: إغلاق القائمة الجانبية تلقائياً عند اختيار أي تاب
        document.getElementById('sidebar').classList.add('collapsed');
    });
});

window.goToOrdersTab = (tab = 'active') => {
    document.querySelector('[data-target="orders-view"]').click();
    window.switchOrderTab(tab);
};

// التعديل: دالة التوجيه لكارت قيد المراجعة مع تأخير زمني عشان الفلتر يشتغل صح
window.goToPendingOrders = () => {
    document.querySelector('[data-target="orders-view"]').click();
    setTimeout(() => {
        if(document.getElementById('filterOrderStatus')) {
            document.getElementById('filterOrderStatus').value = 'قيد المراجعة';
        }
        if(window.switchOrderTab) window.switchOrderTab('active');
        if(window.renderOrdersTable) window.renderOrdersTable();
    }, 50); 
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
// إدارة الطلبات (شاملة فلاتر البحث)
// ==========================================
let allOrders = [];
let currentOrderTab = 'active';

window.switchOrderTab = (tab) => {
    currentOrderTab = tab;
    
    // التعديل: التأكد إن الزراير موجودة عشان ميعملش Error
    const btnActive = document.getElementById('tabActiveOrders');
    const btnArchived = document.getElementById('tabArchivedOrders');
    if(btnActive) btnActive.classList.toggle('active', tab === 'active');
    if(btnArchived) btnArchived.classList.toggle('active', tab === 'archived');
    
    renderOrdersTable();
};

window.renderOrdersTable = () => {
    const table = document.getElementById("ordersTableBody");
    table.innerHTML = "";
    
    const search = document.getElementById("searchOrders") ? document.getElementById("searchOrders").value.toLowerCase() : "";
    const dateFilter = document.getElementById("filterOrderDate") ? document.getElementById("filterOrderDate").value : "";
    const paymentFilter = document.getElementById("filterOrderPayment") ? document.getElementById("filterOrderPayment").value : "";
    const statusFilter = document.getElementById("filterOrderStatus") ? document.getElementById("filterOrderStatus").value : "";

    let filteredOrders = allOrders.filter(order => {
        let tabMatch = false;
        if (currentOrderTab === 'active') {
            tabMatch = ['قيد المراجعة', 'جاري التجهيز', 'تم الشحن'].includes(order.status);
        } else {
            tabMatch = ['تم تسليمه', 'ملغي'].includes(order.status);
        }
            
        let searchMatch = (order.displayId || order.orderId).includes(search) || 
                          order.customer.name.toLowerCase().includes(search) || 
                          order.customer.phone.includes(search);
                          
        let dateMatch = true;
        if (dateFilter) {
            let oDate = new Date(order.createdAt).toISOString().split('T')[0];
            if (oDate !== dateFilter) {
                dateMatch = false;
            }
        }

        let payMatch = true;
        if (paymentFilter) {
            if (!(order.paymentMethod || "").includes(paymentFilter)) {
                payMatch = false;
            }
        }
        
        let statMatch = true;
        if (statusFilter) {
            if (order.status !== statusFilter) {
                statMatch = false;
            }
        }

        return tabMatch && searchMatch && dateMatch && payMatch && statMatch;
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
        } else if (order.status === 'تم تسليمه') {
            statusClass = 'status-delivered';
        }
        
        table.innerHTML += `
            <tr>
                <td style="font-weight:900; color:var(--primary);">#${order.displayId || order.orderId}</td>
                <td>
                    <b>${order.customer.name}</b><br>
                    <span class="meta-info">${order.paymentMethod || "الدفع عند الاستلام"}</span>
                </td>
                <td dir="ltr" class="meta-info">${formatDateTime(order.createdAt)}</td>
                <td style="font-weight:bold; color:var(--secondary);">${Math.round(order.total)} ج.م</td>
                <td>
                    <!-- التعديل الجديد: تحديد الصلاحيات والتسلسل -->
                    ${(() => {
                        let availableStatuses = [];
                        
                        if (window.currentUserRole === 'Admin') {
                            availableStatuses = ['قيد المراجعة', 'جاري التجهيز', 'تم الشحن', 'تم تسليمه', 'ملغي'];
                        } else {
                            if (order.status === 'قيد المراجعة') availableStatuses = ['قيد المراجعة', 'جاري التجهيز', 'ملغي'];
                            else if (order.status === 'جاري التجهيز') availableStatuses = ['جاري التجهيز', 'تم الشحن', 'ملغي'];
                            else if (order.status === 'تم الشحن') availableStatuses = ['تم الشحن', 'تم تسليمه'];
                            else availableStatuses = [order.status]; // مقفولة
                        }
                        
                        let sHtml = `<select class="status-select ${statusClass}" onchange="requestOrderStatusUpdate('${order.dbId}', this, '${order.status}')" ${availableStatuses.length === 1 ? 'disabled' : ''}>`;
                        ['قيد المراجعة', 'جاري التجهيز', 'تم الشحن', 'تم تسليمه', 'ملغي'].forEach(st => {
                            if (availableStatuses.includes(st) || st === order.status) {
                                let icon = st==='قيد المراجعة'?'⏳':st==='جاري التجهيز'?'📦':st==='تم الشحن'?'🚚':st==='تم تسليمه'?'✅':'❌';
                                sHtml += `<option value="${st}" ${order.status === st ? 'selected' : ''}>${icon} ${st}</option>`;
                            }
                        });
                        sHtml += `</select>`;
                        return sHtml;
                    })()}
                </td>
                <td>
                    <button class="btn-action btn-view" onclick="viewOrderDetails('${order.dbId}')">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>`;
    });
};

window.requestOrderStatusUpdate = (orderId, selectElement, oldStatus) => {
    const newStatus = selectElement.value;
    
    // التعديل: إجبار كتابة سبب الإلغاء
    if (newStatus === 'ملغي') {
        if(typeof Swal !== 'undefined') {
            Swal.fire({
                title: 'إلغاء الطلب',
                text: 'اكتب سبب الإلغاء ليظهر للعميل:',
                input: 'text',
                inputPlaceholder: 'السبب...',
                showCancelButton: true,
                confirmButtonText: 'تأكيد',
                cancelButtonText: 'تراجع',
                inputValidator: (value) => {
                    if (!value) return 'يجب كتابة سبب الإلغاء!';
                }
            }).then((result) => {
                if (result.isConfirmed) {
                    update(ref(db, `orders/${orderId}`), { 
                        status: newStatus, 
                        cancelledAt: Date.now(), 
                        cancelReason: result.value 
                    }).then(() => {
                        logAction("تحديث حالة طلب", `إلغاء طلب لسبب: ${result.value}`);
                        window.showAlert("تم التحديث بنجاح", "success");
                    });
                } else {
                    selectElement.value = oldStatus;
                }
            });
        } else {
            let r = prompt("سبب الإلغاء:");
            if(r) {
                update(ref(db, `orders/${orderId}`), { status: newStatus, cancelledAt: Date.now(), cancelReason: r });
                logAction("تحديث حالة طلب", `إلغاء طلب لسبب: ${r}`);
            } else {
                selectElement.value = oldStatus;
            }
        }
        return;
    }

    if (window.currentUserRole === 'Supervisor') {
        window.showConfirm(`هل تريد إرسال طلب للمدير لتغيير حالة الطلب إلى "${newStatus}"؟`, () => {
            push(ref(db, 'order_requests'), { orderId, requestedStatus: newStatus, requestedBy: currentUser, timestamp: Date.now() });
            window.showAlert("تم إرسال الطلب للمدير بنجاح!", "success");
            selectElement.value = oldStatus; 
        });
        selectElement.value = oldStatus; 
    } else {
        window.updateOrderStatus(orderId, selectElement); 
    }
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

    update(ref(db, `orders/${orderId}`), updates).then(() => {
        logAction("تحديث حالة طلب", `تغيير حالة الطلب لـ ${newStatus}`);
        window.showAlert("تم تحديث الحالة بنجاح", "success");
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
    document.getElementById("oName").innerText = order.customer.name;
    document.getElementById("oPhone").innerText = order.customer.phone;
    document.getElementById("oAddress").innerText = order.customer.address;
    document.getElementById("oPayment").innerText = order.paymentMethod || "دفع عند الاستلام";

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
        
        JsBarcode("#topBarcode", order.displayId || order.orderId, { 
            format: "CODE128", 
            width: 2, 
            height: 50, 
            displayValue: true 
        });
        
        document.getElementById("qrCodeBox").innerHTML = "";
        new QRCode(document.getElementById("qrCodeBox"), { 
            text: "https://mody3mr.github.io/modytech/store", 
            width: 55, 
            height: 55 
        });

        const allowOpenSelect = document.getElementById("wbAllowOpen");
        if (allowOpenSelect) {
            document.getElementById("printAllowOpen").innerText = allowOpenSelect.value;
        }
        
        document.getElementById("printCustName").innerText = order.customer.name;
        
        let addrParts = [];
        if (order.customer && order.customer.address) {
            addrParts = order.customer.address.split('-');
        }
        document.getElementById("printCity").innerText = order.customer.city || addrParts[0] || "غير محدد";
        document.getElementById("printRegion").innerText = order.customer.region || addrParts[1] || "";
        document.getElementById("printAddress").innerText = order.customer.address || "-";
        
        // البيانات من المتجر مباشرة
        if(document.getElementById("printBuilding")) document.getElementById("printBuilding").innerText = order.customer.building || "-";
        if(document.getElementById("printFloor")) document.getElementById("printFloor").innerText = order.customer.floor || "-";
        if(document.getElementById("printApartment")) document.getElementById("printApartment").innerText = order.customer.apartment || "-";
        if(document.getElementById("printLandmark")) document.getElementById("printLandmark").innerText = order.customer.landmark || "-";
        
        document.getElementById("printPhone1").innerText = order.customer.phone || "-";
        if(document.getElementById("printPhone2")) document.getElementById("printPhone2").innerText = order.customer.phone2 || "-";
        
        let descParts = [];
        order.items.forEach(i => {
            descParts.push(`${i.qty}x ${i.name}`);
        });
        document.getElementById("printProductsDesc").innerText = descParts.join(' ، ');
        
        let notesText = document.getElementById("wbNotes").value;
        if (!notesText) {
            notesText = "لا يوجد";
        }
        document.getElementById("printNotes").innerText = notesText;

        // التحكم في ظهور المبلغ (كاش ولا مدفوع إلكتروني)
        const codContainer = document.getElementById("codAmountContainer");
        const paidContainer = document.getElementById("paidAmountContainer");
        let payMethod = order.paymentMethod || "الدفع عند الاستلام (COD)";
        
        if (payMethod.includes("عند الاستلام") || payMethod.includes("COD")) {
            if (codContainer) codContainer.style.display = "block";
            if (paidContainer) paidContainer.style.display = "none";
            let codAmountEl = document.getElementById("printCodAmount");
            if (codAmountEl) codAmountEl.innerText = Math.round(order.total) + " ج.م";
        } else {
            if (codContainer) codContainer.style.display = "none";
            if (paidContainer) paidContainer.style.display = "block";
            let payMethodLabel = document.getElementById("printPaymentMethodLabel");
            if (payMethodLabel) payMethodLabel.innerText = payMethod;
            let paidAmountEl = document.getElementById("printPaidAmount");
            if (paidAmountEl) paidAmountEl.innerText = Math.round(order.total) + " ج.م (مدفوع)";
        }

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
                totalRev += o.total;
            }
            if (o.status === 'قيد المراجعة') {
                pending++;
            }
        });
        
        // --- تعديل: إعطاء رقم أوردر تسلسلي 0001 ---
        allOrders.sort((a, b) => a.createdAt - b.createdAt);
        allOrders.forEach((order, index) => {
            order.displayId = String(index + 1).padStart(4, '0');
        });
        
        allOrders.reverse();
    }
    
    document.getElementById('statTotalOrders').innerText = ordersCount;
    document.getElementById('statTotalRevenue').innerText = Math.round(totalRev) + " ج.م";
    document.getElementById('statPendingOrders').innerText = pending;
    
    if(typeof initCharts !== 'undefined') {
        initCharts();
        updateChartsData();
    }
    
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
            window.showAlert("تم التعديل بنجاح!", "success");
            logAction("تعديل منتج", data.name);
        });
    } else {
        data.isActive = true; 
        push(ref(db, 'products'), data).then(() => {
            window.closeModal('productModal');
            window.showAlert("تمت الإضافة بنجاح!", "success");
            logAction("إضافة منتج", data.name);
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
        remove(ref(db, `products/${id}`)).then(() => window.showAlert("تم الحذف", "success"));
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
            window.showAlert("تم التعديل", "success");
        });
    } else {
        push(ref(db, 'categories'), { name: name, isActive: true }).then(() => {
            window.closeModal('categoryModal');
            window.showAlert("تم إضافة القسم", "success");
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
// الكوبونات (التعديل لسحب الاستخدام من الطلبات)
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
            window.showAlert("تم تعديل الكوبون بنجاح!", "success");
        });
    } else {
        data.usedBy = [];
        data.isActive = true;
        push(ref(db, 'vouchers'), data).then(() => {
            window.closeModal('voucherModal');
            window.showAlert("تم إنشاء الكوبون بنجاح!", "success");
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
    
    // --- التعديل: قراءة الاستخدامات من جدول الطلبات وميزة عرض الفاتورة ---
    let usages = [];
    allOrders.forEach(o => {
        if (o.status !== 'ملغي' && (o.coupon === v.code || o.discountCode === v.code || o.voucherCode === v.code)) {
            usages.push(o);
        }
    });

    if (usages.length === 0) {
        list.innerHTML = "<div style='text-align:center; padding: 20px; color:#666;'>لم يستخدمه أحد بعد أو الطلبات ملغية.</div>"; 
    } else {
        usages.forEach(u => { 
            list.innerHTML += `
                <div style="padding:15px; border-bottom:1px solid #eee; display:flex; justify-content: space-between; align-items:center;">
                    <div>
                        <b>${u.customer.name}</b><br>
                        <span style="color:var(--secondary); font-weight:bold;" dir="ltr">${u.customer.phone}</span><br>
                        <small>رقم الطلب: #${u.displayId || u.orderId}</small>
                    </div>
                    <button class="btn-action btn-view" onclick="viewOrderDetails('${u.dbId}'); closeModal('voucherUsersModal');" style="width: auto; padding: 5px 15px; border-radius: 6px;">
                        <i class="fas fa-file-invoice"></i> عرض الفاتورة
                    </button>
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
        // --- التعديل: حساب الاستخدامات أوتوماتيك من الطلبات وحساب الحد ---
        let usedCount = 0;
        allOrders.forEach(o => {
            if (o.status !== 'ملغي' && (o.coupon === v.code || o.discountCode === v.code || o.voucherCode === v.code)) {
                usedCount++;
            }
        });
        
        let limitText = `${usedCount}`;
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
// إدارة الموظفين (مع الإيميل والباسورد والصلاحيات)
// ==========================================
let editingEmpId = null; 
let allEmployees = [];

window.toggleEmployeePermissionsUI = () => {
    if (document.getElementById("permissionsUI")) {
        document.getElementById("permissionsUI").style.display = document.getElementById("empRole").value === 'Supervisor' ? 'block' : 'none';
    }
};

window.openEmployeeModal = () => { 
    editingEmpId = null; 
    document.getElementById("empName").value = ""; 
    document.getElementById("empPhone").value = ""; 
    document.getElementById("empDob").value = ""; 
    document.getElementById("empNationalId").value = ""; 
    document.getElementById("empArea").value = ""; 
    document.getElementById("empNotes").value = ""; 
    if (document.getElementById("empEmail")) document.getElementById("empEmail").value = "";
    if (document.getElementById("empPass")) document.getElementById("empPass").value = "";
    document.getElementById('employeeModal').style.display = "flex"; 
};

window.saveEmployee = () => { 
    // --- التعديل: جمع الصلاحيات لو كان مشرف ---
    let permissions = { tabs: [], canChangeStatus: false };
    if (document.getElementById("empRole").value === 'Supervisor') {
        if (document.querySelectorAll('.perm-tab')) {
            document.querySelectorAll('.perm-tab:checked').forEach(cb => permissions.tabs.push(cb.value));
        }
        if (document.getElementById("permChangeOrderStatus")) {
            permissions.canChangeStatus = document.getElementById("permChangeOrderStatus").checked;
        }
        if (document.getElementById("permAdd")) permissions.canAdd = document.getElementById("permAdd").checked;
        if (document.getElementById("permEdit")) permissions.canEdit = document.getElementById("permEdit").checked;
        if (document.getElementById("permDelete")) permissions.canDelete = document.getElementById("permDelete").checked;
    } else {
        permissions = null; // المدير يقدر يعمل كل حاجة
    }

    const data = { 
        name: document.getElementById("empName").value, 
        phone: document.getElementById("empPhone").value, 
        email: document.getElementById("empEmail") ? document.getElementById("empEmail").value : "",
        password: document.getElementById("empPass") ? document.getElementById("empPass").value : "",
        role: document.getElementById("empRole").value, 
        permissions: permissions, 
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
            window.showAlert("تم التعديل بنجاح!", "success");
            logAction("تعديل موظف", `تعديل بيانات حساب: ${data.name}`);
        }); 
    } else { 
        data.isActive = true; 
        data.createdAt = Date.now(); 
        push(ref(db, 'employees'), data).then(() => {
            window.closeModal('employeeModal');
            window.showAlert("تم إضافة الموظف بنجاح!", "success");
            logAction("إضافة موظف", `إنشاء حساب موظف جديد: ${data.name}`);
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
    document.getElementById("empRole").value = e.role || "Admin"; 
    document.getElementById("empNotes").value = e.notes || ""; 
    if (document.getElementById("empEmail")) document.getElementById("empEmail").value = e.email || "";
    if (document.getElementById("empPass")) document.getElementById("empPass").value = e.password || "";
    
    // --- استرجاع وعرض الصلاحيات لو مشرف ---
    if (e.role === 'Supervisor' && e.permissions) {
        if(document.querySelectorAll('.perm-tab')) {
            document.querySelectorAll('.perm-tab').forEach(cb => {
                cb.checked = e.permissions.tabs?.includes(cb.value) || false;
            });
        }
        if (document.getElementById("permChangeOrderStatus")) {
            document.getElementById("permChangeOrderStatus").checked = e.permissions.canChangeStatus || false;
        }
        if (document.getElementById("permAdd")) document.getElementById("permAdd").checked = e.permissions.canAdd || false;
        if (document.getElementById("permEdit")) document.getElementById("permEdit").checked = e.permissions.canEdit || false;
        if (document.getElementById("permDelete")) document.getElementById("permDelete").checked = e.permissions.canDelete || false;

        if (document.getElementById('permissionsUI')) {
            document.getElementById('permissionsUI').style.display = 'block';
        }
    } else {
        if (document.getElementById('permissionsUI')) {
            document.getElementById('permissionsUI').style.display = 'none';
        }
    }
    
    document.getElementById('employeeModal').style.display = "flex";
};

window.deleteEmployee = (id, name) => {
    window.showConfirm("حذف بيانات الموظف نهائياً؟", () => {
        remove(ref(db, `employees/${id}`)).then(() => {
            logAction("حذف موظف", `تم حذف حساب: ${name}`);
            window.showAlert("تم حذف الموظف", "success");
        });
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
        let emailText = e.email ? `<br><small style="color:var(--text-light);">${e.email}</small>` : "";
        table.innerHTML += `
            <tr>
                <td>
                    <b>${e.name}</b>${emailText}
                    <div class="emp-details">${formatDateOnly(e.createdAt)}</div>
                </td>
                <td>${e.phone}</td>
                <td>${e.role === 'Admin' ? 'مدير' : 'مشرف'}</td>
                <td><span class="badge badge-active">نشط</span></td>
                <td>
                    <div class="actions">
                        <button class="btn-action btn-edit" onclick="editEmployee('${e.id}')">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button class="btn-action btn-delete" onclick="deleteEmployee('${e.id}', '${e.name}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>`; 
    });
};

onValue(ref(db, 'employees'), (snapshot) => { 
    allEmployees = []; 
    const filterUserDropdown = document.getElementById("filterLogUser");
    if(filterUserDropdown) filterUserDropdown.innerHTML = "<option value=''>كل الموظفين</option>";

    if (snapshot.exists()) {
        snapshot.forEach(child => {
            let e = { id: child.key, ...child.val() };
            allEmployees.push(e);
            if(filterUserDropdown) filterUserDropdown.innerHTML += `<option value="${e.name}">${e.name}</option>`;
        });
    }
    window.filterEmployees();
});

// ==========================================
// سجل النشاطات والأرشفة (بالإكسيل)
// ==========================================

let allLogs = [];
let allArchivedLogs = [];
let currentLogTab = 'current';

window.switchLogTab = (tab, btn) => {
    currentLogTab = tab;
    document.querySelectorAll('#logs-view .custom-tab-btn').forEach(b => b.classList.remove('active'));
    if(btn) btn.classList.add('active');
    window.filterLogs();
};

window.filterLogs = () => {
    const term = document.getElementById("searchLogs") ? document.getElementById("searchLogs").value.toLowerCase() : "";
    const userF = document.getElementById("filterLogUser") ? document.getElementById("filterLogUser").value : "";
    const dateFrom = document.getElementById("filterLogDateFrom") ? document.getElementById("filterLogDateFrom").value : "";
    const dateTo = document.getElementById("filterLogDateTo") ? document.getElementById("filterLogDateTo").value : "";
    const table = document.getElementById("logsTableBody"); 
    table.innerHTML = "";
    
    let dataset = currentLogTab === 'current' ? allLogs : allArchivedLogs;

    dataset.filter(log => {
        let textMatch = (log.action && log.action.toLowerCase().includes(term)) || 
                        (log.details && log.details.toLowerCase().includes(term));
        let userMatch = userF ? log.user === userF : true;
        let dateMatch = true;
        if (dateFrom && dateTo) {
            let t = new Date(log.timestamp);
            dateMatch = t >= new Date(dateFrom) && t <= new Date(dateTo + 'T23:59:59');
        }
        return textMatch && userMatch && dateMatch;
    }).forEach(log => {
        table.innerHTML += `
            <tr>
                <td style="font-weight:bold; color:var(--primary);">${log.action}</td>
                <td>${log.details}</td>
                <td><span class="badge" style="background:#e2e8f0; color:#475569;">${log.user}</span></td>
                <td dir="ltr" style="font-size:12px;">${formatDateTime(log.timestamp)}</td>
            </tr>`; 
    });
};

window.exportLogsToExcel = () => {
    if (typeof XLSX === 'undefined') {
        return window.showAlert("برجاء التأكد من إضافة مكتبة Excel في HTML");
    }
    
    let dataset = currentLogTab === 'current' ? allLogs : allArchivedLogs;
    if(dataset.length === 0) return window.showAlert("لا توجد بيانات للتصدير", "warning");

    let formattedData = dataset.map(l => ({
        "الحدث": l.action,
        "التفاصيل": l.details,
        "بواسطة": l.user,
        "التاريخ والوقت": new Date(l.timestamp).toLocaleString('ar-EG')
    }));

    let worksheet = XLSX.utils.json_to_sheet(formattedData);
    let workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Activity Logs");
    XLSX.writeFile(workbook, `Activity_Logs_${new Date().getTime()}.xlsx`);
    logAction("تصدير سجل", `تم تصدير سجل النشاطات إلى إكسيل`);
};

onValue(ref(db, 'logs'), (snapshot) => { 
    allLogs = [];
    if (snapshot.exists()) { 
        snapshot.forEach(child => {
            allLogs.push({ id: child.key, ...child.val() });
        }); 
        allLogs.reverse();
    }
    
    if (window.currentUserRole === 'Admin' && document.getElementById("btnDeleteAllLogs")) {
        document.getElementById("btnDeleteAllLogs").style.display = "inline-block";
    }
    
    if(currentLogTab === 'current') window.filterLogs();
});

onValue(ref(db, 'archived_logs'), (snapshot) => { 
    allArchivedLogs = [];
    if (snapshot.exists()) { 
        snapshot.forEach(child => {
            allArchivedLogs.push({ id: child.key, ...child.val() });
        }); 
        allArchivedLogs.reverse();
    }
    if(currentLogTab === 'archived') window.filterLogs();
});

// --- الأرشفة ---
window.archiveLogsAll = () => {
    if(allLogs.length === 0) return window.showAlert("السجل الحالي فارغ بالفعل");
    window.showConfirm("سيتم نقل السجل الحالي بالكامل إلى الأرشيف. هل أنت متأكد؟", () => {
        let updates = {};
        allLogs.forEach(l => { 
            updates[`archived_logs/${l.id}`] = l; 
            updates[`logs/${l.id}`] = null; 
        });
        update(ref(db), updates).then(() => {
            logAction("أرشفة سجل", "تمت أرشفة السجل الحالي بالكامل");
            window.showAlert("تمت الأرشفة بنجاح!");
        });
    });
};

window.archiveLogsByMonth = () => {
    const monthInput = document.getElementById("archiveMonthInput") ? document.getElementById("archiveMonthInput").value : null;
    if (!monthInput) {
        return window.archiveLogs();
    }
    
    window.showConfirm(`هل أنت متأكد من أرشفة سجلات شهر ${monthInput} وحذفها من السجل الحالي؟`, () => {
        get(ref(db, 'logs')).then(snapshot => {
            if (snapshot.exists()) {
                let updates = {};
                let count = 0;
                
                snapshot.forEach(child => { 
                    const logDate = new Date(child.val().timestamp);
                    const logMonth = `${logDate.getFullYear()}-${String(logDate.getMonth() + 1).padStart(2, '0')}`;
                    if (logMonth === monthInput) { 
                        updates[`archived_logs/${child.key}`] = child.val(); 
                        updates[`logs/${child.key}`] = null; 
                        count++;
                    } 
                });
                
                if (count > 0) {
                    update(ref(db), updates).then(() => {
                        window.showAlert(`تمت أرشفة ${count} سجل بنجاح!`, "success");
                        logAction("أرشفة سجل", `تمت أرشفة سجلات شهر ${monthInput}`);
                    });
                } else {
                    window.showAlert("لا توجد سجلات في هذا الشهر لأرشفتها.");
                }
            }
        });
    });
};

window.deleteAllLogs = () => {
    if (window.currentUserRole !== 'Admin') {
        return window.showAlert("ليس لديك صلاحية لحذف جميع السجلات!");
    }
    window.showConfirm("تحذير: سيتم مسح جميع سجلات النشاطات نهائياً. هل أنت متأكد؟", () => {
        remove(ref(db, 'logs')).then(() => {
            window.showAlert("تم تنظيف السجل بالكامل!", "success");
            logAction("حذف السجل", "تم مسح السجل بالكامل من قبل المدير");
        });
    });
};

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
                        logAction("أرشفة سجل", "أرشفة السجلات الأقدم من 30 يوم");
                    });
                } else {
                    window.showAlert("لا توجد سجلات أقدم من شهر لأرشفتها.");
                }
            }
        });
    });
};

// ==========================================
// إعدادات المتجر الأساسية (الإضافة الجديدة)
// ==========================================
window.saveSettings = () => {
    const data = {
        name: document.getElementById("setStoreName") ? document.getElementById("setStoreName").value : "",
        newsTicker: document.getElementById("setNewsTicker") ? document.getElementById("setNewsTicker").value : "",
        isOpen: document.getElementById("setStoreStatus") ? document.getElementById("setStoreStatus").checked : true,
        phone: document.getElementById("setPhone") ? document.getElementById("setPhone").value : "",
        email: document.getElementById("setEmail") ? document.getElementById("setEmail").value : "",
        address: document.getElementById("setAddress") ? document.getElementById("setAddress").value : "",
        copyright: document.getElementById("setCopyright") ? document.getElementById("setCopyright").value : "",
        social: {
            facebook: document.getElementById("setFb") ? document.getElementById("setFb").value : "",
            instagram: document.getElementById("setInsta") ? document.getElementById("setInsta").value : "",
            telegram: document.getElementById("setTelegram") ? document.getElementById("setTelegram").value : "",
            whatsapp: document.getElementById("setWhatsapp") ? document.getElementById("setWhatsapp").value : ""
        }
    };

    update(ref(db, 'storeSettings'), data).then(() => {
        logAction("تحديث الإعدادات", "تم تحديث بيانات المتجر الأساسية بنجاح");
        window.showAlert("تم حفظ الإعدادات بنجاح!", "success");
    });
};

onValue(ref(db, 'storeSettings'), (snapshot) => {
    if (snapshot.exists()) {
        const d = snapshot.val();
        if(document.getElementById("setStoreName")) document.getElementById("setStoreName").value = d.name || "";
        if(document.getElementById("setNewsTicker")) document.getElementById("setNewsTicker").value = d.newsTicker || "";
        if(document.getElementById("setStoreStatus")) document.getElementById("setStoreStatus").checked = d.isOpen !== undefined ? d.isOpen : true;
        if(document.getElementById("setPhone")) document.getElementById("setPhone").value = d.phone || "";
        if(document.getElementById("setEmail")) document.getElementById("setEmail").value = d.email || "";
        if(document.getElementById("setAddress")) document.getElementById("setAddress").value = d.address || "";
        if(document.getElementById("setCopyright")) document.getElementById("setCopyright").value = d.copyright || "";
        
        if(d.social) {
            if(document.getElementById("setFb")) document.getElementById("setFb").value = d.social.facebook || "";
            if(document.getElementById("setInsta")) document.getElementById("setInsta").value = d.social.instagram || "";
            if(document.getElementById("setTelegram")) document.getElementById("setTelegram").value = d.social.telegram || "";
            if(document.getElementById("setWhatsapp")) document.getElementById("setWhatsapp").value = d.social.whatsapp || "";
        }
    }
});
