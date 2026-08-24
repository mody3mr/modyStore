import { initializeApp } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-app.js";
import { getDatabase, ref, get, child, remove, update, onValue, push, set } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-database.js";
import { getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword, setPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-auth.js";

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
const auth = getAuth(app);

// تأمين الجلسة: إجبار الموقع على طلب تسجيل الدخول عند فتح المتصفح من جديد
setPersistence(auth, browserSessionPersistence).catch((error) => console.error(error));

let currentUser = "جاري التحميل...";
window.currentUserRole = "Supervisor"; 
window.currentEmpPermissions = null;
window.currentEmpUid = null;

// ==========================================
// طلب صلاحية الإشعارات (Push Notifications)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
    }
});

function sendPushNotification(title, body) {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
        new Notification(title, { 
            body: body, 
            icon: "https://cdn-icons-png.flaticon.com/512/3500/3500833.png" 
        });
    }
}

// ==========================================
// أدوات مساعدة (تنظيف البيانات + الطباعة + إشعار العميل)
// ==========================================
function cleanData(value) {
    if (Array.isArray(value)) {
        return value.map(v => cleanData(v)).filter(v => v !== undefined);
    }
    if (value && typeof value === 'object') {
        const out = {};
        Object.keys(value).forEach(k => {
            const cleaned = cleanData(value[k]);
            if (cleaned !== undefined) out[k] = cleaned;
        });
        return out;
    }
    if (value === undefined) return undefined;
    if (typeof value === 'number' && isNaN(value)) return 0;
    return value;
}
window.cleanData = cleanData;

// طباعة عنصر واحد داخل حاوية الطباعة (printRoot) لمنع الصفحات البيضاء
window.printNode = (node) => {
    const root = document.getElementById('printRoot');
    if (!node || !root) return;
    const placeholder = document.createComment('print-placeholder');
    node.parentNode.insertBefore(placeholder, node);
    const prevDisplay = node.style.display;
    node.style.display = 'block';
    root.innerHTML = '';
    root.appendChild(node);
    window.print();
    setTimeout(() => {
        node.style.display = prevDisplay;
        if (placeholder.parentNode) {
            placeholder.parentNode.insertBefore(node, placeholder);
            placeholder.remove();
        }
        root.innerHTML = '';
    }, 800);
};

// إشعار العميل (يظهر في حسابه على الموقع)
window.notifyCustomer = (order, title, message) => {
    if (!order) return Promise.resolve();
    const payload = cleanData({
        orderDbId: order.dbId || null,
        orderId: order.displayId || order.orderId || null,
        phone: (order.customer && order.customer.phone) || null,
        uid: order.userId || order.uid || null,
        title: title,
        message: message,
        read: false,
        timestamp: Date.now()
    });
    return push(ref(db, 'customerNotifications'), payload).catch(e => console.error(e));
};

// ==========================================
// تسجيل الدخول الصارم وحماية الصلاحيات (Strict Auth)
// ==========================================
onAuthStateChanged(auth, (user) => {
    if (user) {
        window.currentEmpUid = user.uid;
        get(ref(db, 'employees')).then((snapshot) => {
            let found = false;
            if (snapshot.exists()) {
                snapshot.forEach(child => {
                    if (child.val().email === user.email && child.val().isActive) {
                        currentUser = child.val().name;
                        window.currentUserRole = child.val().role;
                        const empData = child.val();
                        window.currentEmpPermissions = empData.permissions || null; 
                        
                        // --- تطبيق الصلاحيات للمشرفين وحماية الواجهة أمنياً ---
                        if (window.currentUserRole === 'Supervisor' && window.currentEmpPermissions) {
                            const allowedTabs = window.currentEmpPermissions.tabs || [];
                            
                            // إزالة التابات غير المسموح بها من القائمة الجانبية تماماً
                            document.querySelectorAll('.nav-links .nav-item').forEach(nav => {
                                const target = nav.getAttribute('data-target');
                                if (target && target !== 'analytics-view' && !allowedTabs.includes(target)) {
                                    nav.style.display = 'none';
                                    nav.remove();
                                }
                            });

                            // إخفاء وحماية الأزرار الحساسة (إضافة / تعديل / حذف) للمشرفين
                            if (!window.currentEmpPermissions.canAdd) {
                                document.querySelectorAll('.btn-add, #btnAddProduct, #btnOpenCategoryModal, #btnAddVoucher, #btnOpenEmployeeModal, #btnAddShipping').forEach(btn => {
                                    if(btn) btn.style.display = 'none';
                                });
                            }

                            // إذا كانت شاشة الإحصائيات غير مسموح بها، يتم نقله تلقائياً لأول شاشة مسموحة
                            if (!allowedTabs.includes('analytics-view') && allowedTabs.length > 0) {
                                const firstAllowedTab = allowedTabs[0];
                                document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
                                const firstViewEl = document.getElementById(firstAllowedTab);
                                if (firstViewEl) firstViewEl.classList.add('active');
                                
                                document.querySelectorAll('.nav-item').forEach(nav => {
                                    nav.classList.remove('active');
                                    if (nav.dataset.target === firstAllowedTab) nav.classList.add('active');
                                });
                            }
                        }
                        // -------------------------------------------------------------

                        // --- تحديث بيانات الهيدر ---
                        const nameDisplay = document.getElementById("currentUserNameDisplay");
                        const avatar = document.getElementById("currentUserAvatar");
                        const dropName = document.getElementById("dropdownName");
                        const dropRole = document.getElementById("dropdownRole");
                        
                        if (nameDisplay) nameDisplay.innerText = currentUser;
                        if (dropName) dropName.innerText = currentUser;
                        if (dropRole) dropRole.innerText = window.currentUserRole === 'Admin' ? 'مدير النظام' : 'مشرف';
                        
                        if (avatar) {
                            let apiName = currentUser.split(' ').join('+');
                            avatar.src = `https://ui-avatars.com/api/?name=${apiName}&background=3b82f6&color=fff`;
                        }
                        // ---------------------------
                        
                        found = true;
                    }
                });
            }
            if (!found) {
                signOut(auth).then(() => {
                    window.location.href = "login.html"; 
                });
            }
        }).catch((err) => {
            console.error(err);
        });
    } else {
        window.location.href = "login.html"; 
    }
});

window.logout = () => {
    signOut(auth).then(() => {
        window.location.href = "login.html";
    });
};

// ==========================================
// القائمة الجانبية (ومشكلة الموبايل)
// ==========================================
document.getElementById('sidebarToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
});

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        const targetView = item.dataset.target;
        if (!targetView) return;
        
        // التحقق الأمني المانع للمشرفين
        if (window.currentUserRole === 'Supervisor' && window.currentEmpPermissions) {
            const allowedTabs = window.currentEmpPermissions.tabs || [];
            if (targetView !== 'analytics-view' && !allowedTabs.includes(targetView)) {
                window.showAlert("عفواً، ليس لديك صلاحية لعرض هذه الصفحة!", "error");
                return; 
            }
        }
        
        document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        
        document.querySelectorAll('.view-section').forEach(view => view.classList.remove('active'));
        const targetEl = document.getElementById(targetView);
        if (targetEl) targetEl.classList.add('active');

        // قفل القائمة أوتوماتيك في الموبايل
        if (window.innerWidth <= 768) {
            document.getElementById('sidebar').classList.remove('collapsed');
        } else {
            document.getElementById('sidebar').classList.add('collapsed');
        }
    });
});

// ==========================================
// الإشعارات والنواقص
// ==========================================
const notifBtn = document.getElementById('notifBtn');
const notifDropdown = document.getElementById('notifDropdown');

if (notifBtn && notifDropdown) {
    notifBtn.addEventListener('click', (e) => {
        notifDropdown.classList.toggle('show');
        e.stopPropagation();
    });
    document.addEventListener('click', (e) => {
        if (!notifBtn.contains(e.target)) notifDropdown.classList.remove('show');
    });
}

// تعليم الإشعارات كمقروءة
window.markNotificationsAsRead = (e) => {
    e.stopPropagation();
    document.getElementById('notifCount').style.display = 'none';
};

function updateNotifications() {
    const list = document.getElementById('notifList');
    const badge = document.getElementById('notifCount');
    if(!list || !badge) return;

    let lowStockProds = allProducts.filter(p => (p.stock || 0) <= 5 && p.isActive);
    
    if (lowStockProds.length > 0) {
        if (badge.style.display !== 'none') badge.style.display = 'block';
        badge.innerText = lowStockProds.length;
        list.innerHTML = '';
        lowStockProds.forEach(p => {
            list.innerHTML += `
                <div style="border-bottom: 1px solid var(--border); padding: 8px 0; display:flex; align-items:center; gap:10px;">
                    <img src="${p.imageUrl}" style="width:30px; height:30px; border-radius:4px; object-fit:cover;">
                    <div>
                        <strong style="color:var(--text-dark); display:block;">${p.name}</strong>
                        <span style="color:var(--danger); font-weight:bold;">الكمية المتبقية: ${p.stock || 0}</span>
                    </div>
                </div>
            `;
        });
    } else {
        badge.style.display = 'none';
        list.innerHTML = '<div style="text-align:center; color:#94a3b8;">لا توجد نواقص حالياً</div>';
    }
}

// ==========================================
// النوافذ الاحترافية (Custom Popups)
// ==========================================
window.closeModal = (id) => {
    document.getElementById(id).style.display = 'none';
};

window.showAlert = (msg, icon = 'success') => {
    if (typeof Swal !== 'undefined') {
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
        document.getElementById("alertMsg").innerText = msg;
        document.getElementById("customAlert").style.display = "flex";
    }
};

window.closeAlert = () => {
    document.getElementById("customAlert").style.display = "none";
};

let confirmCallback = null;

window.showConfirm = (msg, callback) => {
    if (typeof Swal !== 'undefined') {
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
        if (confirmCallback) confirmCallback();
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
    if (!ms) return "";
    return new Date(ms).toLocaleString('ar-EG', { 
        year: 'numeric', month: 'short', day: 'numeric', 
        hour: '2-digit', minute: '2-digit' 
    });
}

function formatDateOnly(ms) {
    if (!ms) return "";
    return new Date(ms).toLocaleDateString('ar-EG');
}

window.goToOrdersTab = (tab = 'active') => {
    if (window.currentUserRole === 'Supervisor' && window.currentEmpPermissions) {
        const allowedTabs = window.currentEmpPermissions.tabs || [];
        if (!allowedTabs.includes('orders-view')) {
            return window.showAlert("عفواً، ليس لديك صلاحية لعرض صفحة الطلبات!", "error");
        }
    }
    const orderNav = document.querySelector('[data-target="orders-view"]');
    if (orderNav) orderNav.click();
    window.switchOrderTab(tab);
};

window.goToPendingOrders = () => {
    if (window.currentUserRole === 'Supervisor' && window.currentEmpPermissions) {
        const allowedTabs = window.currentEmpPermissions.tabs || [];
        if (!allowedTabs.includes('orders-view')) {
            return window.showAlert("عفواً، ليس لديك صلاحية لعرض صفحة الطلبات!", "error");
        }
    }
    const orderNav = document.querySelector('[data-target="orders-view"]');
    if (orderNav) orderNav.click();
    window.switchOrderTab('active');
    setTimeout(() => {
        const filterStatus = document.getElementById('filterOrderStatus');
        if(filterStatus) {
            filterStatus.value = 'قيد المراجعة';
            window.renderOrdersTable();
        }
    }, 100);
};

// ==========================================
// تقارير المبيعات
// ==========================================
let productCatalog = {}; 

window.openSalesReport = () => {
    document.getElementById("salesReportModal").style.display = "flex";
    const btnToday = document.getElementById("btnFilterToday");
    if (btnToday) btnToday.click(); 
};

let currentReportProducts = [];

window.generateReport = (filterType, element) => {
    if (element && element.tagName === "BUTTON") {
        document.querySelectorAll('.report-filters button').forEach(b => {
            b.classList.remove('active');
        });
        element.classList.add('active');
        if (document.getElementById("reportSpecificDate")) document.getElementById("reportSpecificDate").value = ""; 
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
    } else if (filterType === 'week') {
        start = Date.now() - (7 * 24 * 60 * 60 * 1000);
        end = Date.now();
    } else if (filterType === 'month') {
        start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        end = Date.now();
    } else if (filterType === 'specific') {
        if (!element.value) return;
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
        if (order.status === 'ملغي' || order.status === 'مرتجع') return;
        
        if (order.createdAt >= start && order.createdAt <= end) {
            filteredTotal += (order.total || 0); 
            const pMethod = order.paymentMethod || "";
            
            if (pMethod.includes("محفظة")) {
                paymentStats["محفظة إلكترونية"] += order.total;
            } else if (pMethod.includes("إنستا")) {
                paymentStats["إنستا باي (InstaPay)"] += order.total;
            } else if (pMethod.includes("فيزا")) {
                paymentStats["فيزا / بطاقة ائتمان"] += order.total;
            } else {
                paymentStats["الدفع عند الاستلام (COD)"] += order.total;
            }

            if (order.items && Array.isArray(order.items)) {
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
        }
    });

    if (document.getElementById("reportTotalSales")) {
        document.getElementById("reportTotalSales").innerText = Math.round(filteredTotal) + " ج.م";
    }
    
    if (document.getElementById("reportPaymentBreakdown")) {
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
            <div style="font-size:11px; color:#94a3b8; text-align:center; margin-top:5px;">* الصافي بعد الشحن والخصومات</div>
        `;
    }

    currentReportProducts = Object.values(productSales).sort((a, b) => b.qty - a.qty); 
    window.filterReportProducts();
};

window.filterReportProducts = () => {
    const termEl = document.getElementById("searchReportProducts");
    const term = termEl ? termEl.value.toLowerCase() : "";
    const div = document.getElementById("reportTopProducts");
    if (!div) return;
    div.innerHTML = "";
    
    let filtered = currentReportProducts.filter(p => p.name.toLowerCase().includes(term));
    
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
                <div class="top-product-revenue" title="مبيعات المنتج الخام">${Math.round(p.revenue)} ج.م</div>
            </div>`;
    });
};

window.exportReportToExcel = () => {
    if (typeof XLSX === 'undefined') {
        return window.showAlert("برجاء إضافة مكتبة Excel في ملف HTML لتصدير الإحصائيات");
    }
    let formattedData = currentReportProducts.map(p => ({
        "اسم المنتج": p.name,
        "الكمية المباعة": p.qty,
        "إيراد المنتج (قبل الخصم)": Math.round(p.revenue)
    }));
    let worksheet = XLSX.utils.json_to_sheet(formattedData);
    let workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sales Report");
    XLSX.writeFile(workbook, `Sales_Report_${new Date().getTime()}.xlsx`);
    logAction("تصدير تقرير", `تم تصدير تقرير المبيعات إلى إكسيل`);
};

window.exportReportToPDF = () => {
    document.body.classList.add('print-mode-report');
    window.print();
    setTimeout(() => { document.body.classList.remove('print-mode-report'); }, 500);
};

// ==========================================
// الرسوم البيانية (Bar Chart)
// ==========================================
let salesChart = null;
let ordersChart = null;

function initCharts() {
    const ctxSales = document.getElementById('salesChart');
    const ctxOrders = document.getElementById('ordersChart');
    
    if (ctxSales && !salesChart) {
        salesChart = new Chart(ctxSales, {
            type: 'bar', 
            data: { labels: [], datasets: [{ label: 'المبيعات (ج.م)', data: [], backgroundColor: '#3b82f6', borderRadius: 4 }] },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
    
    if (ctxOrders && !ordersChart) {
        ordersChart = new Chart(ctxOrders, {
            type: 'doughnut',
            data: { labels: ['قيد المراجعة', 'جاري التجهيز', 'تم الشحن', 'تم تسليمه'], datasets: [{ data: [0,0,0,0], backgroundColor: ['#f59e0b', '#3b82f6', '#8b5cf6', '#10b981'] }] },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
}

function updateChartsData() {
    if (!salesChart || !ordersChart || typeof allOrders === 'undefined') return;
    let counts = { pending: 0, processing: 0, shipped: 0, delivered: 0 };
    
    let daysStats = {};
    for (let i = 6; i >= 0; i--) {
        let d = new Date();
        d.setDate(d.getDate() - i);
        let dateStr = d.toLocaleDateString('ar-EG');
        daysStats[dateStr] = { count: 0, revenue: 0 };
    }

    allOrders.forEach(o => {
        if (o.status === 'قيد المراجعة') counts.pending++;
        if (o.status === 'جاري التجهيز') counts.processing++;
        if (o.status === 'تم الشحن') counts.shipped++;
        if (o.status === 'تم تسليمه') counts.delivered++;
        
        if (o.status !== 'ملغي' && o.status !== 'مرتجع') {
            let orderDate = new Date(o.createdAt).toLocaleDateString('ar-EG');
            if (daysStats[orderDate]) {
                daysStats[orderDate].count++;
                daysStats[orderDate].revenue += o.total;
            }
        }
    });

    ordersChart.data.datasets[0].data = [counts.pending, counts.processing, counts.shipped, counts.delivered];
    ordersChart.update();

    salesChart.data.labels = Object.keys(daysStats);
    salesChart.data.datasets[0].data = Object.values(daysStats).map(d => Math.round(d.revenue));
    salesChart.update();

    const tableBody = document.getElementById('last7DaysTableBody');
    if (tableBody) {
        tableBody.innerHTML = "";
        Object.keys(daysStats).reverse().forEach(date => {
            tableBody.innerHTML += `
                <tr>
                    <td>${date}</td>
                    <td>${daysStats[date].count}</td>
                    <td style="font-weight:bold; color:var(--primary);">${Math.round(daysStats[date].revenue)} ج.م</td>
                </tr>
            `;
        });
    }
}

// ==========================================
// إدارة الطلبات
// ==========================================
let allOrders = [];
let currentOrderTab = 'active';
let isFirstLoadOrders = true;
let latestKnownOrderTime = Date.now();

window.switchOrderTab = (tab) => {
    currentOrderTab = tab;
    
    const btnActive = document.getElementById('tabActiveOrders');
    const btnArchived = document.getElementById('tabArchivedOrders');
    if (btnActive) btnActive.classList.toggle('active', tab === 'active');
    if (btnArchived) btnArchived.classList.toggle('active', tab === 'archived');
    
    const statusF = document.getElementById('filterOrderStatus');
    if (statusF) statusF.value = '';
    
    renderOrdersTable();
};

window.renderOrdersTable = () => {
    const table = document.getElementById("ordersTableBody");
    if (!table) return;
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
            tabMatch = ['تم تسليمه', 'ملغي', 'مرتجع'].includes(order.status);
        }
            
        let searchMatch = (order.displayId || order.orderId || "").includes(search) || 
                          (order.customer && order.customer.name && order.customer.name.toLowerCase().includes(search)) || 
                          (order.customer && order.customer.phone && order.customer.phone.includes(search));
                          
        let dateMatch = true;
        if (dateFilter) {
            let oDate = new Date(order.createdAt).toISOString().split('T')[0];
            if (oDate !== dateFilter) dateMatch = false;
        }

        let payMatch = true;
        if (paymentFilter) {
            if (!(order.paymentMethod || "").includes(paymentFilter)) payMatch = false;
        }
        
        let statMatch = true;
        if (statusFilter) {
            if (order.status !== statusFilter) statMatch = false;
        }

        return tabMatch && searchMatch && dateMatch && payMatch && statMatch;
    });

    const countEl = document.getElementById("filteredOrdersCount");
    if (countEl) countEl.innerText = filteredOrders.length;

    if (filteredOrders.length === 0) {
        table.innerHTML = "<tr><td colspan='6' style='text-align:center; padding: 20px;'>لا توجد طلبات مطابقة للبحث.</td></tr>";
        return;
    }

    filteredOrders.forEach(order => {
        let statusClass = 'status-cancelled';
        if (order.status === 'قيد المراجعة') statusClass = 'status-pending';
        else if (order.status === 'جاري التجهيز') statusClass = 'status-processing';
        else if (order.status === 'تم الشحن') statusClass = 'status-shipped';
        else if (order.status === 'تم تسليمه') statusClass = 'status-delivered';
        
        let canChangeStatus = true;
        let isFreeChange = false;
        
        if (window.currentUserRole === 'Supervisor' && window.currentEmpPermissions) {
            canChangeStatus = window.currentEmpPermissions.canChangeStatus !== undefined ? window.currentEmpPermissions.canChangeStatus : true;
            isFreeChange = !!window.currentEmpPermissions.canChangeStatus; 
        }

        let availableStatuses = [];
        if (window.currentUserRole === 'Admin' || isFreeChange) {
            // المرتجع مقفول هنا: بيتم فقط من تاب المرتجعات
            availableStatuses = ['قيد المراجعة', 'جاري التجهيز', 'تم الشحن', 'تم تسليمه', 'ملغي'];
        } else {
            if (order.status === 'قيد المراجعة') availableStatuses = ['قيد المراجعة', 'جاري التجهيز', 'ملغي'];
            else if (order.status === 'جاري التجهيز') availableStatuses = ['جاري التجهيز', 'تم الشحن', 'ملغي'];
            else if (order.status === 'تم الشحن') availableStatuses = ['تم الشحن', 'تم تسليمه', 'ملغي'];
            else availableStatuses = [order.status];
        }

        let sHtml = `<select class="status-select ${statusClass}" onchange="requestOrderStatusUpdate('${order.dbId}', this, '${order.status}', '${order.displayId || order.orderId}')" ${(!canChangeStatus || order.status === 'مرتجع') ? 'disabled' : ''}>`;
        
        ['قيد المراجعة', 'جاري التجهيز', 'تم الشحن', 'تم تسليمه', 'ملغي'].forEach(st => {
            if (availableStatuses.includes(st) || st === order.status) {
                let icon = st==='قيد المراجعة'?'⏳':st==='جاري التجهيز'?'📦':st==='تم الشحن'?'🚚':st==='تم تسليمه'?'✅':'❌';
                sHtml += `<option value="${st}" ${order.status === st ? 'selected' : ''}>${icon} ${st}</option>`;
            }
        });
        
        // إظهار المرتجع فقط إذا كانت حالة الطلب بالفعل مرتجع ويكون مقفول
        if(order.status === 'مرتجع') {
            sHtml += `<option value="مرتجع" selected disabled>↩️ مرتجع (شحن / عميل)</option>`;
        }
        sHtml += `</select>`;
        table.innerHTML += `
            <tr>
                <td style="font-weight:900; color:var(--primary);">#${order.displayId || order.orderId}</td>
                <td>
                    <b>${order.customer ? order.customer.name : 'بدون اسم'}</b><br>
                    <span class="meta-info">${order.paymentMethod || "الدفع عند الاستلام"}</span>
                </td>
                <td dir="ltr" class="meta-info">${formatDateTime(order.createdAt)}</td>
                <td style="font-weight:bold; color:var(--secondary);">${Math.round(order.total || 0)} ج.م</td>
                <td>${sHtml}</td>
                <td>
                    <button class="btn-action btn-view" onclick="viewOrderDetails('${order.dbId}')">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>`;
    });
};

window.requestOrderStatusUpdate = (orderId, selectElement, oldStatus, displayId) => {
    const newStatus = selectElement.value;
    
    if (newStatus === 'ملغي' && oldStatus !== 'ملغي') {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: 'إلغاء الطلب وإرجاع المخزون؟',
                text: 'سيتم إلغاء الطلب وإعادة المنتجات إلى المخزون (Stock). اكتب سبب الإلغاء (سيظهر للعميل):',
                input: 'text',
                inputPlaceholder: 'سبب الإلغاء...',
                showCancelButton: true,
                confirmButtonText: 'إلغاء وتحديث المخزون',
                cancelButtonText: 'تراجع',
                inputValidator: (value) => {
                    if (!value) return 'يجب كتابة سبب للإلغاء!';
                }
            }).then((result) => {
                if (result.isConfirmed) {
                    const order = allOrders.find(o => o.dbId === orderId);
                    if(order && order.items) {
                        order.items.forEach(item => {
                            let pRef = ref(db, `products/${item.id}`);
                            get(pRef).then(snap => {
                                if(snap.exists()) {
                                    update(pRef, { stock: (snap.val().stock || 0) + item.qty });
                                }
                            });
                        });
                    }
                    update(ref(db, `orders/${orderId}`), { 
                        status: newStatus, 
                        cancelledAt: Date.now(),
                        cancelReason: result.value,
                        customerNotice: `تم إلغاء طلبك #${displayId} - السبب: ${result.value}`
                    }).then(() => {
                        window.notifyCustomer(order, 'تم إلغاء طلبك', `تم إلغاء الطلب #${displayId} - السبب: ${result.value}`);
                        logAction("تحديث حالة طلب", `تغيير حالة الطلب #${displayId} لـ ملغي واسترداد المخزون بسبب: ${result.value}`);
                        window.showAlert("تم الإلغاء واسترداد المخزون وإشعار العميل", "success");
                    });
                } else {
                    selectElement.value = oldStatus; 
                }
            });
        } else {
            let reason = prompt("اكتب سبب الإلغاء لـ تحديث المخزون وإلغاء الطلب:");
            if (reason) {
                const order = allOrders.find(o => o.dbId === orderId);
                if(order && order.items) {
                    order.items.forEach(item => {
                        let pRef = ref(db, `products/${item.id}`);
                        get(pRef).then(snap => {
                            if(snap.exists()) {
                                update(pRef, { stock: (snap.val().stock || 0) + item.qty });
                            }
                        });
                    });
                }
                update(ref(db, `orders/${orderId}`), { status: newStatus, cancelledAt: Date.now(), cancelReason: reason, customerNotice: `تم إلغاء طلبك #${displayId} - السبب: ${reason}` });
                window.notifyCustomer(order, 'تم إلغاء طلبك', `تم إلغاء الطلب #${displayId} - السبب: ${reason}`);
                logAction("تحديث حالة طلب", `إلغاء طلب #${displayId} واسترداد المخزون بسبب: ${reason}`);
            } else {
                selectElement.value = oldStatus;
            }
        }
    } else {
        window.updateOrderStatus(orderId, selectElement, displayId, oldStatus); 
    }
};

window.updateOrderStatus = (orderId, selectElement, displayId, oldStatus) => {
    const newStatus = selectElement.value;
    const updates = { status: newStatus };
    const now = Date.now();

    if (newStatus === 'جاري التجهيز') updates.processedAt = now;
    if (newStatus === 'تم الشحن') updates.shippedAt = now;
    if (newStatus === 'تم تسليمه') updates.deliveredAt = now;

    update(ref(db, `orders/${orderId}`), updates).then(() => {
        logAction("تحديث حالة طلب", `تغيير حالة الطلب #${displayId} لـ ${newStatus}`);
        
        // تصفير الفلتر عشان الطلب ميختفيش
        const statusFilter = document.getElementById("filterOrderStatus");
        if (statusFilter && statusFilter.value !== '') {
            statusFilter.value = '';
        }
        
        window.showAlert("تم تحديث الحالة بنجاح", "success");
    });
};
// ==========================================
// عرض تفاصيل الطلب والطباعة (الدوال التي كانت ناقصة)
// ==========================================
window.viewOrderDetails = (orderId) => {
    const order = allOrders.find(o => o.dbId === orderId);
    if (!order) return window.showAlert('لم يتم العثور على الطلب!', 'error');

    // تعبئة البيانات في المودال
    document.getElementById('orderModalTitle').innerText = `تفاصيل الطلب #${order.displayId || order.orderId}`;
    document.getElementById('oName').innerText = order.customer ? order.customer.name : '-';
    document.getElementById('oPhone').innerText = order.customer ? order.customer.phone : '-';
    document.getElementById('oAddress').innerText = order.customer ? order.customer.address : '-';
    document.getElementById('oCity').innerText = order.customer ? order.customer.city : '-';
    document.getElementById('oPayment').innerText = order.paymentMethod || 'الدفع عند الاستلام';
    document.getElementById('oSecretCode').innerText = order.secretCode || '-';

    // قائمة المنتجات
    const itemsList = document.getElementById('oItemsList');
    itemsList.innerHTML = '';
    let subtotal = 0;
    if (order.items && Array.isArray(order.items)) {
        order.items.forEach(item => {
            itemsList.innerHTML += `
                <div class="order-item-row">
                    <span>${item.qty}x ${item.name}</span>
                    <span>${item.qty * item.price} ج.م</span>
                </div>`;
            subtotal += (item.qty * item.price);
        });
    }

    // الإجماليات
    document.getElementById('oSubtotal').innerText = `${subtotal} ج.م`;
    document.getElementById('oShipping').innerText = `${order.shippingCost || 0} ج.م`;
    
    const discountDiv = document.getElementById('oDiscountDiv');
    if (order.discount && order.discount > 0) {
        discountDiv.style.display = 'block';
        document.getElementById('oDiscount').innerText = `${order.discount} ج.م`;
    } else {
        discountDiv.style.display = 'none';
    }
    
    document.getElementById('oTotal').innerText = `${Math.round(order.total || 0)} ج.م`;

    // سبب الإلغاء إن وجد
    const cancelBox = document.getElementById('oCancelReasonBox');
    if (order.status === 'ملغي' && order.cancelReason) {
        cancelBox.style.display = 'block';
        document.getElementById('oCancelReasonText').innerText = order.cancelReason;
    } else {
        cancelBox.style.display = 'none';
    }

    // مسار الطلب (التايم لاين)
    const timeline = document.getElementById('oTimeline');
    timeline.innerHTML = '';
    const steps = [
        { label: 'تم الطلب', time: order.createdAt, done: true },
        { label: 'جاري التجهيز', time: order.processedAt, done: !!order.processedAt },
        { label: 'تم الشحن', time: order.shippedAt, done: !!order.shippedAt },
        { label: 'تم التسليم', time: order.deliveredAt, done: !!order.deliveredAt }
    ];

    if (order.status === 'ملغي') {
        steps.push({ label: 'تم الإلغاء', time: order.cancelledAt, done: true, cancel: true });
    } else if (order.status === 'مرتجع') {
        steps.push({ label: 'تم الاسترجاع', time: order.returnedAt, done: true, cancel: true });
    }

    steps.forEach(step => {
        if (step.done) {
            let stepClass = step.cancel ? 'cancel' : 'done';
            timeline.innerHTML += `
                <div class="tl-step ${stepClass}">
                    <div class="tl-title">${step.label}</div>
                    <div class="tl-date">${formatDateTime(step.time)}</div>
                </div>`;
        } else {
            timeline.innerHTML += `
                <div class="tl-step">
                    <div class="tl-title" style="color: #94a3b8;">${step.label}</div>
                </div>`;
        }
    });

    // تجهيز بيانات الطباعة (الفاتورة)
    document.getElementById('invCustName').innerText = order.customer ? order.customer.name : '-';
    document.getElementById('invCustPhone').innerText = order.customer ? order.customer.phone : '-';
    document.getElementById('invCustAddress').innerText = `${order.customer ? order.customer.city : ''} - ${order.customer ? order.customer.address : ''}`;
    document.getElementById('invOrderId').innerText = `#${order.displayId || order.orderId}`;
    document.getElementById('invDate').innerText = formatDateOnly(order.createdAt);
    
    const invItemsList = document.getElementById('invItemsList');
    invItemsList.innerHTML = '';
    if (order.items && Array.isArray(order.items)) {
        order.items.forEach(item => {
            invItemsList.innerHTML += `
                <tr>
                    <td style="padding: 10px; border: 1px solid black; text-align: right;">${item.name}</td>
                    <td style="padding: 10px; border: 1px solid black;">${item.qty}</td>
                    <td style="padding: 10px; border: 1px solid black;">${item.price} ج</td>
                    <td style="padding: 10px; border: 1px solid black;">${item.qty * item.price} ج</td>
                </tr>`;
        });
    }
    document.getElementById('invSubtotal').innerText = `${subtotal} ج.م`;
    document.getElementById('invDiscount').innerText = order.discount ? `${order.discount} ج.م` : '0 ج.م';
    document.getElementById('invTotal').innerText = `${Math.round(order.total || 0)} ج.م`;

    // تجهيز بيانات الطباعة (بوليصة الشحن)
    const c = order.customer || {};
    const val = (...keys) => {
        for (const k of keys) {
            if (c[k] !== undefined && c[k] !== null && String(c[k]).trim() !== '') return String(c[k]);
            if (c.address && typeof c.address === 'object' && c.address[k]) return String(c.address[k]);
        }
        return '-';
    };
    const addressText = (typeof c.address === 'object' && c.address) ? (c.address.street || c.address.details || '-') : (c.address || '-');

    document.getElementById('printCustName').innerText = c.name || '-';
    document.getElementById('printCity').innerText = val('city', 'governorate', 'محافظة');
    document.getElementById('printRegion').innerText = val('region', 'area', 'zone');
    document.getElementById('printAddress').innerText = addressText;
    document.getElementById('printBuilding').innerText = val('building', 'buildingNo', 'mabna', 'مبنى');
    document.getElementById('printFloor').innerText = val('floor', 'floorNo', 'dor', 'دور');
    document.getElementById('printApartment').innerText = val('apartment', 'apartmentNo', 'flat', 'shaka', 'شقة');
    document.getElementById('printLandmark').innerText = val('landmark', 'mark', 'nearest', 'علامة مميزة');
    document.getElementById('printPhone1').innerText = c.phone || '-';
    document.getElementById('printPhone2').innerText = c.phone2 || c.altPhone || '-';
    
    
    const descParts = order.items ? order.items.map(i => `${i.qty}x ${i.name}`).join(' ، ') : '';
    document.getElementById('printProductsDesc').innerText = descParts;

    if (order.paymentMethod && !order.paymentMethod.includes("كاش") && !order.paymentMethod.includes("استلام")) {
        document.getElementById('codAmountContainer').style.display = 'none';
        document.getElementById('paidAmountContainer').style.display = 'block';
        document.getElementById('printPaymentMethodLabel').innerText = order.paymentMethod;
        document.getElementById('printPaidAmount').innerText = `${Math.round(order.total || 0)} ج.م (مدفوع)`;
    } else {
        document.getElementById('codAmountContainer').style.display = 'block';
        document.getElementById('paidAmountContainer').style.display = 'none';
        document.getElementById('printCodAmount').innerText = `${Math.round(order.total || 0)} ج.م`;
    }

    // باركود شريطي كبير مالي عرض البوليصة يمين وشمال
    if (typeof JsBarcode !== 'undefined') {
        JsBarcode("#topBarcode", order.displayId || order.orderId, {
            format: "CODE128", width: 5, height: 120, displayValue: true, fontSize: 28, margin: 0
        });
        const bcSvg = document.getElementById('topBarcode');
        if (bcSvg) {
            bcSvg.setAttribute('preserveAspectRatio', 'none');
            bcSvg.style.width = '100%';
            bcSvg.style.maxWidth = 'none';
            bcSvg.style.height = '120px';
        }
    }

    // QR كود لينك الموقع بحجم أكبر مالي مكانه
    const qrBox = document.getElementById('qrCodeBox');
    qrBox.innerHTML = '';
    if (typeof QRCode !== 'undefined') {
        const qrLink = `https://mody3mr.github.io/modytech/?order=${order.displayId || order.orderId}`;
        new QRCode(qrBox, { text: qrLink, width: 160, height: 160 });
        const qrImg = qrBox.querySelector('img, canvas');
        if (qrImg) { qrImg.style.width = '160px'; qrImg.style.height = '160px'; }
    }

    // الوضع الافتراضي للسماح بفتح الشحنة = لا
    const allowSel = document.getElementById('wbAllowOpen');
    if (allowSel) allowSel.value = 'لا';
    document.getElementById('printAllowOpen').innerText = 'لا';

    document.getElementById('orderDetailsModal').style.display = 'flex';
};

window.printDocument = (type) => {
    if (type === 'waybill') {
        document.getElementById('printAllowOpen').innerText = document.getElementById('wbAllowOpen').value || 'لا';
        document.getElementById('printNotes').innerText = document.getElementById('wbNotes').value || 'لا يوجد';
        window.printNode(document.getElementById('waybillPrintArea'));
    } else if (type === 'invoice') {
        window.printNode(document.getElementById('invoicePrintContainer'));
    }
};

// ==========================================
// استكمال جلب الطلبات
// ==========================================
onValue(ref(db, 'orders'), (snapshot) => {
    try {
        allOrders = [];
        let totalRev = 0;
        let pending = 0;
        let ordersCount = 0;
        let currentMaxTime = 0;
        
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                let o = child.val(); 
                o.dbId = child.key; 
                allOrders.push(o);
                
                if (o.status !== 'ملغي' && o.status !== 'مرتجع') {
                    ordersCount++;
                    totalRev += (o.total || 0);
                }
                if (o.status === 'قيد المراجعة') {
                    pending++;
                }

                if (o.createdAt > currentMaxTime) {
                    currentMaxTime = o.createdAt;
                }
                
                if (!isFirstLoadOrders && o.createdAt > latestKnownOrderTime) {
                    let itemsCount = o.items ? o.items.reduce((acc, i) => acc + i.qty, 0) : 0;
                    sendPushNotification(`طلب جديد #${o.displayId || o.orderId}`, `عدد المنتجات: ${itemsCount}\nالتكلفة: ${Math.round(o.total)} ج.م`);
                }
            });
            
            latestKnownOrderTime = Math.max(latestKnownOrderTime, currentMaxTime);
            
            allOrders.sort((a, b) => a.createdAt - b.createdAt);
            allOrders.forEach((order, index) => {
                order.displayId = String(index + 1).padStart(4, '0');
            });
            
            allOrders.reverse();
        }
        
        isFirstLoadOrders = false;
        
        if (document.getElementById('statTotalOrders')) document.getElementById('statTotalOrders').innerText = ordersCount;
        if (document.getElementById('statTotalRevenue')) document.getElementById('statTotalRevenue').innerText = Math.round(totalRev) + " ج.م";
        if (document.getElementById('statPendingOrders')) document.getElementById('statPendingOrders').innerText = pending;
        
        if (typeof initCharts !== 'undefined') {
            initCharts();
            updateChartsData();
        }
        
        window.renderOrdersTable();
    } catch(err) {
        console.error(err);
    }
});

// ==========================================
// الإسكانر (بفاصل زمني وصوت)
// ==========================================
let html5QrcodeScanner = null;
let lastScanTime = 0;

window.processManualScan = () => {
    let code = document.getElementById('manualBarcode').value.trim();
    if (!code) return window.showAlert("أدخل رقم الطلب أولاً", "error");
    processScannedCode(code); // افصل لوجيك السكانر في دالة مساعدة
    document.getElementById('manualBarcode').value = '';
};

function processScannedCode(decodedText) {
    let beep = document.getElementById('barcodeBeep');
    if (beep) { beep.currentTime = 0; beep.play().catch(e=>console.log(e)); }

    let order = allOrders.find(o => o.displayId === decodedText || o.orderId === decodedText || o.secretCode === decodedText);
    if(order) {
        if(order.status === 'تم الشحن' || order.status === 'تم تسليمه' || order.status === 'ملغي' || order.status === 'مرتجع') {
            window.showAlert(`الطلب حالته الحالية: ${order.status}`, 'warning');
        } else {
            update(ref(db, `orders/${order.dbId}`), { status: 'تم الشحن', shippedAt: Date.now() });
            window.showAlert('تم تحويل الطلب لـ تم الشحن!', 'success');
            logAction("سكانر شحن", `تأكيد شحن طلب #${order.displayId}`);
        }
    } else {
        window.showAlert('لم يتم العثور على الطلب!', 'error');
    }
}
        (error) => { /* ignore */ }
    ).catch(err => {
        console.error(err);
        window.showAlert('لم نتمكن من الوصول للكاميرا!', 'error');
    });
};

window.stopScanner = () => {
    if(html5QrcodeScanner) { 
        html5QrcodeScanner.stop().catch(err => console.log(err)); 
        html5QrcodeScanner = null; 
    }
};

// ==========================================
// الطباعة 
// ==========================================
window.bulkPrintWaybills = () => {
    let processingOrders = allOrders.filter(o => o.status === 'جاري التجهيز');
    if (processingOrders.length === 0) return window.showAlert("لا توجد طلبات (جاري التجهيز) لطباعتها!", "warning");
    
    let container = document.getElementById("bulkPrintContainer");
    if(!container) return;
    container.innerHTML = "";
    
    processingOrders.forEach(order => {
        let descParts = order.items ? order.items.map(i => `${i.qty}x ${i.name}`).join(' ، ') : '';
        
        let html = `
        <div style="page-break-after: always; width: 100%; height: 100%; margin: 0; padding: 0;">
            <div class="bosta-waybill" style="width: 100%; height: 100%; border: 3px solid black; font-family: 'Cairo', sans-serif; direction: rtl; background: white; color: black; padding: 20px; box-sizing: border-box;">
                <div style="text-align: center; border-bottom: 3px solid black; padding-bottom: 15px; margin-bottom: 15px;">
                    <div style="font-size: 32px; font-weight: 900; margin-bottom: 10px;">ModyStore <i class="fas fa-bolt"></i></div>
                    <svg id="bulk-bc-${order.displayId || order.orderId}" style="width: 100%; height: 120px; max-width: none; margin: 0 auto;"></svg>
                </div>

                <div style="display: flex; border-bottom: 3px solid black; padding-bottom: 15px; margin-bottom: 15px;">
                    <div style="flex: 1; border-left: 2px solid black; padding-left: 10px; font-size: 18px;">
                        <strong>من:</strong> مودي ستور<br>
                        <strong>السماح بالفتح:</strong> لا
                    </div>
                </div>

                <div style="border-bottom: 3px solid black; padding-bottom: 15px; margin-bottom: 15px; font-size: 20px;">
                    <strong>إلى:</strong> <span style="font-weight:bold; font-size:24px;">${order.customer ? order.customer.name : '-'}</span><br>
                    <strong>المحافظة:</strong> <span>${order.customer ? order.customer.city : '-'}</span> | <strong>المنطقة:</strong> <span>${order.customer ? order.customer.region || '' : ''}</span><br>
                    <strong>العنوان:</strong> <span>${order.customer ? order.customer.address : '-'}</span><br>
                    <strong>مبنى:</strong> <span>-</span> | <strong>دور:</strong> <span>-</span> | <strong>شقة:</strong> <span>-</span><br>
                    <strong>علامة مميزة:</strong> <span>-</span>
                </div>

                <div style="display: flex; border-bottom: 3px solid black; padding-bottom: 15px; margin-bottom: 15px; font-size: 20px;">
                    <div style="flex: 1; border-left: 2px solid black;">
                        <strong>تليفون:</strong> <span dir="ltr" style="font-weight:bold; font-size:22px;">${order.customer ? order.customer.phone : '-'}</span>
                    </div>
                    <div style="flex: 1; padding-right: 10px;">
                        <strong>تليفون آخر:</strong> <span dir="ltr">${order.customer ? order.customer.phone2 || '-' : '-'}</span>
                    </div>
                </div>

                <div style="border-bottom: 3px solid black; padding-bottom: 15px; margin-bottom: 15px; font-size: 18px;">
                    <strong>الوصف:</strong> <span>${descParts}</span><br>
                    <strong>ملاحظات:</strong> <span>لا يوجد</span>
                </div>

                ${(order.paymentMethod && !order.paymentMethod.includes("كاش") && !order.paymentMethod.includes("استلام")) ? 
                `<div style="text-align: center; font-size: 20px; background-color: #f8fafc; padding: 20px; border: 3px solid black; border-radius: 12px; margin-bottom: 15px;">
                    <strong>طريقة الدفع:</strong> <span style="font-weight:bold;">${order.paymentMethod}</span> <br>
                    <strong>القيمة:</strong> <span style="font-weight:bold;">${Math.round(order.total || 0)} ج.م (مدفوع)</span>
                </div>` : 
                `<div style="text-align: center; border: 3px solid black; padding: 20px; margin-bottom: 15px; border-radius: 12px;">
                    <strong style="font-size:20px;">المبلغ المطلوب تحصيله (COD)</strong><br>
                    <span style="font-size:40px; font-weight:900;">${Math.round(order.total || 0)} ج.م</span>
                </div>`}

                <div style="text-align: center; font-weight: bold; margin-top: 20px; font-size: 20px;">
                    شكراً لثقتكم بنا <span style="color: red; font-size: 24px;">❤️</span>
                </div>
            </div>
        </div>`;
        container.innerHTML += html;
    });

    processingOrders.forEach(order => {
        if (typeof JsBarcode !== 'undefined') {
            JsBarcode(`#bulk-bc-${order.displayId || order.orderId}`, order.displayId || order.orderId, { format: "CODE128", width: 5, height: 120, displayValue: true, fontSize: 28, margin: 0 });
            const bulkSvg = document.getElementById(`bulk-bc-${order.displayId || order.orderId}`);
            if (bulkSvg) { bulkSvg.setAttribute('preserveAspectRatio', 'none'); bulkSvg.style.width = '100%'; bulkSvg.style.maxWidth = 'none'; }
        }
    });
    
    window.printNode(container);
};

// ==========================================
// الماليات (المشتريات والمصروفات)
// ==========================================
let allFinance = [];
let currentFinanceTab = 'all';
let purItems = [];

window.switchFinanceTab = (tab, btn) => {
    currentFinanceTab = tab;
    document.querySelectorAll('#finance-view .custom-tab-btn').forEach(b => {
        b.classList.remove('active');
    });
    if(btn) btn.classList.add('active');
    renderFinanceTable();
};

window.openPurchaseModal = () => {
    purItems = [];
    document.getElementById('purSupplier').value = '';
    document.getElementById('purInvoiceNo').value = '';
    document.getElementById('purQty').value = '1';
    document.getElementById('purCost').value = '0';
    document.getElementById('purShipping').value = '0';
    renderPurItems();
    
    const select = document.getElementById('purProductSelect');
    select.innerHTML = '<option value="">اختر المنتج...</option>';
    allProducts.forEach(p => { 
        select.innerHTML += `<option value="${p.id}" data-name="${p.name}">${p.name}</option>`; 
    });
    
    document.getElementById('purchaseModal').style.display = 'flex';
};

window.addPurchaseItem = () => {
    const select = document.getElementById('purProductSelect');
    const qty = parseInt(document.getElementById('purQty').value);
    const cost = parseFloat(document.getElementById('purCost').value);
    if(!select.value || qty <= 0 || cost < 0) {
        return window.showAlert('برجاء إدخال بيانات منتج صحيحة');
    }
    
    const name = select.options[select.selectedIndex].getAttribute('data-name');
    purItems.push({ 
        id: select.value, 
        name: name, 
        qty: qty, 
        cost: cost, 
        total: qty * cost 
    });
    renderPurItems();
};

window.removePurItem = (index) => { 
    purItems.splice(index, 1); 
    renderPurItems(); 
};

function renderPurItems() {
    const list = document.getElementById('purItemsList');
    list.innerHTML = '';
    purItems.forEach((item, index) => {
        list.innerHTML += `
            <tr>
                <td>${item.name}</td>
                <td>${item.qty}</td>
                <td>${item.cost}</td>
                <td>${item.total}</td>
                <td><i class="fas fa-trash text-danger" style="cursor:pointer;" onclick="removePurItem(${index})"></i></td>
            </tr>`;
    });
    calculatePurTotal();
}

window.calculatePurTotal = () => {
    const shipping = parseFloat(document.getElementById('purShipping').value) || 0;
    const totalItems = purItems.reduce((acc, curr) => acc + curr.total, 0);
    document.getElementById('purTotalAmount').innerText = totalItems + shipping;
};

// الدالة المسئولة عن حفظ المشتريات وتسميعها في الـ DB
window.savePurchaseInvoice = () => {
    const supplier = document.getElementById('purSupplier').value.trim() || 'مورد عام';
    const invoiceNo = document.getElementById('purInvoiceNo').value.trim() || 'بدون رقم';
    const shipping = parseFloat(document.getElementById('purShipping').value) || 0;
    const totalAmount = purItems.reduce((acc, curr) => acc + curr.total, 0) + shipping;

    if(purItems.length === 0) return window.showAlert('الفاتورة فارغة!');

    // تم التأكد من عدم وجود بيانات فارغة (Undefined) تمنع الحفظ
    const data = cleanData({
        type: 'purchase',
        title: `فاتورة مشتريات (مورد: ${supplier})`,
        supplier: supplier,
        invoiceNo: invoiceNo,
        items: purItems.map(i => ({ id: i.id || '', name: i.name || 'منتج', qty: i.qty || 0, cost: i.cost || 0, total: i.total || 0 })),
        shipping: shipping,
        amount: totalAmount,
        timestamp: Date.now(),
        user: currentUser || "مدير"
    });

    // نحفظ الفاتورة الأول، وبعد نجاح الحفظ نحدث المخزون
    push(ref(db, 'finance'), data).then(() => {
        purItems.forEach(item => {
            if (!item.id) return;
            const pRef = ref(db, `products/${item.id}`);
            get(pRef).then(snap => { if(snap.exists()) { update(pRef, { stock: (snap.val().stock || 0) + item.qty }); } });
        });
        logAction("مشتريات", `إدخال فاتورة مشتريات رقم ${invoiceNo} بقيمة ${totalAmount} ج.م وتحديث المخزون`);
        window.showAlert('تم إنشاء فاتورة المشتريات وتحديث المخزون', 'success');
        purItems = [];
        closeModal('purchaseModal');
    }).catch(err => {
        console.error(err);
        window.showAlert('تعذر حفظ الفاتورة: ' + (err && err.message ? err.message : err), 'error');
    });
};
window.openExpenseModal = () => {
    document.getElementById('expTitle').value = '';
    document.getElementById('expAmount').value = '';
    document.getElementById('expNotes').value = '';
    document.getElementById('expenseModal').style.display = 'flex';
};

window.saveExpense = () => {
    const title = document.getElementById('expTitle').value.trim();
    const amount = parseFloat(document.getElementById('expAmount').value);
    const notes = document.getElementById('expNotes').value.trim();
    
    if(!title || !amount || amount <= 0) {
        return window.showAlert('برجاء استكمال بيانات المصروف بشكل صحيح');
    }

    push(ref(db, 'finance'), cleanData({
        type: 'expense',
        title: title,
        amount: amount,
        notes: notes || 'بدون ملاحظات',
        timestamp: Date.now(),
        user: currentUser || 'مدير'
    })).then(() => {
        logAction("مصروفات", `تسجيل مصروف (${title}) بقيمة ${amount} ج.م`);
        window.showAlert('تم تسجيل المصروف وإضافته للسجل', 'success');
        closeModal('expenseModal');
    }).catch(err => {
        console.error(err);
        window.showAlert('تعذر حفظ المصروف: ' + (err && err.message ? err.message : err), 'error');
    });
};

onValue(ref(db, 'finance'), (snapshot) => {
    allFinance = [];
    let totalPur = 0;
    let totalExp = 0;
    if(snapshot.exists()){
        snapshot.forEach(child => {
            let f = child.val();
            f.id = child.key;
            allFinance.push(f);
            if (f.type === 'purchase') totalPur += f.amount;
            if (f.type === 'expense') totalExp += f.amount;
        });
    }
    allFinance.reverse();
    if(document.getElementById('statTotalPurchases')) document.getElementById('statTotalPurchases').innerText = totalPur + " ج.م";
    if(document.getElementById('statTotalExpenses')) document.getElementById('statTotalExpenses').innerText = totalExp + " ج.م";
    renderFinanceTable();
});
window.renderFinanceTable = () => {
    const table = document.getElementById('financeTableBody');
    if(!table) return;
    table.innerHTML = "";
    
    const search = document.getElementById('searchFinance') ? document.getElementById('searchFinance').value.toLowerCase() : "";
    const month = document.getElementById('filterFinanceMonth') ? document.getElementById('filterFinanceMonth').value : "";

    let filtered = allFinance.filter(f => {
        let textMatch = (f.title || "").toLowerCase().includes(search) || (f.supplier || "").toLowerCase().includes(search);
        let tabMatch = (currentFinanceTab === 'all') || (currentFinanceTab === 'purchases' && f.type === 'purchase') || (currentFinanceTab === 'expenses' && f.type === 'expense');
        let monthMatch = true;
        if(month) {
            let fMonth = new Date(f.timestamp).toISOString().substring(0, 7);
            if(fMonth !== month) monthMatch = false;
        }
        return textMatch && tabMatch && monthMatch;
    });

    filtered.forEach(f => {
        let typeBadge = f.type === 'purchase' ? '<span class="badge" style="background:#dcfce7; color:#166534;">مشتريات بضاعة</span>' : '<span class="badge" style="background:#fee2e2; color:#991b1b;">مصروف خارجي</span>';
        table.innerHTML += `
            <tr>
                <td dir="ltr">${formatDateOnly(f.timestamp)}</td>
                <td>${typeBadge}</td>
                <td><b>${f.title}</b></td>
                <td style="font-weight:bold; color:var(--danger);">${f.amount} ج.م</td>
                <td>${f.user || '-'}</td>
                <td><button class="btn-action btn-delete" onclick="deleteFinance('${f.id}')"><i class="fas fa-trash"></i></button></td>
            </tr>`;
    });
};

window.deleteFinance = (id) => {
    if(window.currentUserRole !== 'Admin') {
        return window.showAlert("غير مصرح لك بالحذف!", "error");
    }
    window.showConfirm("حذف العملية المالية من السجل؟", () => {
        remove(ref(db, `finance/${id}`));
    });
};

// ==========================================
// إدارة المرتجعات (Returns)
// ==========================================
let allReturns = [];
let currentReturnOrderTemp = null;
let currentReturnsTab = 'current';

window.switchReturnsTab = (tab, btn) => {
    currentReturnsTab = tab;
    document.querySelectorAll('#returns-view .custom-tab-btn').forEach(b => {
        b.classList.remove('active');
    });
    if(btn) btn.classList.add('active');
    renderReturnsTable();
};

window.openNewReturnModal = () => {
    document.getElementById('returnSearchOrderInput').value = '';
    document.getElementById('returnOrderDetailsDiv').style.display = 'none';
    document.getElementById('btnConfirmReturn').style.display = 'none';
    document.getElementById('newReturnModal').style.display = 'flex';
};

window.searchOrderForReturn = () => {
    const term = document.getElementById('returnSearchOrderInput').value.trim();
    if(!term) return window.showAlert('أدخل رقم الطلب للبحث');
    
    let order = allOrders.find(o => o.displayId === term || o.orderId === term);
    if(!order) return window.showAlert('لم يتم العثور على طلب بهذا الرقم!', 'error');
    if(order.status === 'مرتجع') return window.showAlert('هذا الطلب مسجل كمرتجع بالفعل!', 'warning');

    currentReturnOrderTemp = order;
    document.getElementById('retCustName').innerText = order.customer.name;
    document.getElementById('retCustPhone').innerText = order.customer.phone;
    
    const list = document.getElementById('retOrderItemsList');
    list.innerHTML = "";
    order.items.forEach((item, index) => {
        list.innerHTML += `
            <div style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:14px;">
                <label><input type="checkbox" checked class="ret-item-cb" data-index="${index}"> ${item.qty}x ${item.name}</label>
                <span>${item.qty * item.price} ج</span>
            </div>`;
    });

    document.getElementById('returnOrderDetailsDiv').style.display = 'block';
    document.getElementById('btnConfirmReturn').style.display = 'block';
};

// الدالة المسئولة عن حفظ المرتجعات وتسميعها في الـ DB وإرجاع المخزون
window.confirmReturnOrder = () => {
    const reason = document.getElementById('returnReasonSelect').value;
    const notes = document.getElementById('returnNotes').value || 'بدون ملاحظات';
    const restoreStock = document.getElementById('returnStockToggle').checked;
    
    if(!reason) return window.showAlert('برجاء اختيار سبب المرتجع');
    const checkboxes = document.querySelectorAll('.ret-item-cb:checked');
    if(checkboxes.length === 0) return window.showAlert('برجاء اختيار منتج واحد على الأقل للاسترجاع');

    let itemsToReturn = []; let returnAmount = 0;
    checkboxes.forEach(cb => {
        let item = currentReturnOrderTemp.items[cb.getAttribute('data-index')];
        itemsToReturn.push(item); returnAmount += (item.qty * item.price);
    });

    // تأمين البيانات عشان الـ Push ميترفضش
    const retData = {
        orderDbId: currentReturnOrderTemp.dbId,
        orderId: currentReturnOrderTemp.orderId || currentReturnOrderTemp.displayId,
        displayId: currentReturnOrderTemp.displayId || '0000',
        customer: currentReturnOrderTemp.customer || {name: 'غير مسجل', phone: '-'},
        items: itemsToReturn, amount: returnAmount, reason: reason, notes: notes, status: 'تم استلام المرتجع', timestamp: Date.now(), user: currentUser || 'مدير'
    };

    if(restoreStock) {
        itemsToReturn.forEach(item => {
            const pRef = ref(db, `products/${item.id}`);
            get(pRef).then(snap => { if(snap.exists()) update(pRef, { stock: (snap.val().stock || 0) + item.qty }); });
        });
    }

    const orderRefTemp = currentReturnOrderTemp;
    push(ref(db, 'returns'), cleanData(retData)).then(() => {
        return update(ref(db, `orders/${orderRefTemp.dbId}`), { status: 'مرتجع', returnedAt: Date.now() });
    }).then(() => {
        window.notifyCustomer(orderRefTemp, 'تم استلام مرتجع طلبك', `تم تسجيل مرتجع للطلب #${orderRefTemp.displayId} بقيمة ${returnAmount} ج.م - السبب: ${reason}`);
        logAction('مرتجع', `استلام مرتجع لطلب #${orderRefTemp.displayId} بقيمة ${returnAmount} ج.م`);
        window.showAlert('تم تسجيل المرتجع وتحديث حالة الطلب والمخزون', 'success');
        closeModal('newReturnModal');
        currentReturnOrderTemp = null;
    }).catch(err => {
        console.error(err);
        window.showAlert('حدث خطأ أثناء حفظ المرتجع: ' + (err && err.message ? err.message : err), 'error');
    });
};
onValue(ref(db, 'returns'), (snapshot) => {
    allReturns = [];
    if(snapshot.exists()) {
        snapshot.forEach(child => { 
            allReturns.push({ id: child.key, ...child.val() }); 
        });
    }
    allReturns.reverse();
    renderReturnsTable();
});

window.renderReturnsTable = () => {
    const table = document.getElementById('returnsTableBody');
    if(!table) return;
    table.innerHTML = "";
    
    const search = document.getElementById('searchReturns') ? document.getElementById('searchReturns').value.toLowerCase() : "";
    const dateF = document.getElementById('filterReturnDate') ? document.getElementById('filterReturnDate').value : "";
    const statusF = document.getElementById('filterReturnStatus') ? document.getElementById('filterReturnStatus').value : "";

    let filtered = allReturns.filter(r => {
        let textMatch = (r.displayId || "").includes(search) || (r.customer && r.customer.phone && r.customer.phone.includes(search));
        let tabMatch = (currentReturnsTab === 'current' && r.status !== 'مؤرشف') || (currentReturnsTab === 'archived' && r.status === 'مؤرشف');
        let dateMatch = true;
        if(dateF) { 
            if(new Date(r.timestamp).toISOString().substring(0,10) !== dateF) dateMatch = false; 
        }
        let statMatch = statusF ? r.status === statusF : true;
        return textMatch && tabMatch && dateMatch && statMatch;
    });

    filtered.forEach(r => {
        table.innerHTML += `
            <tr>
                <td style="font-weight:bold; color:var(--primary);">#${r.displayId}</td>
                <td dir="ltr">${formatDateOnly(r.timestamp)}</td>
                <td>${r.reason}</td>
                <td style="font-weight:bold; color:var(--danger);">${r.amount} ج.م</td>
                <td><span class="badge badge-inactive">${r.status}</span></td>
                <td><button class="btn-action btn-view" onclick="viewReturnDetails('${r.id}')"><i class="fas fa-eye"></i></button></td>
            </tr>`;
    });
};

window.viewReturnDetails = (id) => {
    const r = allReturns.find(x => x.id === id);
    if(!r) return;
    let itemsStr = r.items.map(i => `${i.qty}x ${i.name}`).join('<br>');
    document.getElementById('viewReturnContent').innerHTML = `
        <div style="font-size:14px; line-height:1.8;">
            <strong>العميل:</strong> ${r.customer.name} - <span dir="ltr">${r.customer.phone}</span><br>
            <strong>المنتجات المستردة:</strong><br><div style="background:#f8fafc; padding:10px; border-radius:6px;">${itemsStr}</div>
            <strong>القيمة:</strong> <span style="color:var(--danger); font-weight:bold;">${r.amount} ج.م</span><br>
            <strong>السبب:</strong> ${r.reason}<br>
            <strong>ملاحظات:</strong> ${r.notes || 'لا يوجد'}<br>
            <strong>بواسطة:</strong> ${r.user}
        </div>
    `;
    document.getElementById('viewReturnModal').style.display = 'flex';
};

// ==========================================
// إدارة المنتجات
// ==========================================
let editingProductId = null;
let allProducts = [];
let currentProductTab = 'active';

window.switchProductTab = (tab, btn) => {
    currentProductTab = tab;
    document.querySelectorAll('#products-view .custom-tab-btn').forEach(b => {
        b.classList.remove('active');
    });
    if (btn) btn.classList.add('active');
    filterProducts();
};

window.openProductModal = () => {
    const isSup = window.currentUserRole === 'Supervisor';
    const canAdd = window.currentEmpPermissions ? !!window.currentEmpPermissions.canAdd : false;
    
    if (isSup && !canAdd) {
        return window.showAlert("ليس لديك صلاحية لإضافة منتجات جديدة!", "error");
    }
    editingProductId = null; 
    document.getElementById("productModalTitle").innerText = "إضافة منتج جديد";
    document.getElementById("prodName").value = ""; 
    document.getElementById("prodPrice").value = "";
    if (document.getElementById("prodDiscountPrice")) document.getElementById("prodDiscountPrice").value = ""; 
    if (document.getElementById("prodStock")) document.getElementById("prodStock").value = "10";
    if (document.getElementById("prodOfferDays")) document.getElementById("prodOfferDays").value = "";
    document.getElementById("prodDesc").value = ""; 
    document.getElementById("prodImage").value = ""; 

    if (document.getElementById('stockOnlyAlert')) document.getElementById('stockOnlyAlert').style.display = 'none';
    if (document.getElementById('addStockDiv')) document.getElementById('addStockDiv').style.display = 'none';
    
    document.getElementById("prodName").disabled = false;
    document.getElementById("prodPrice").disabled = false;
    if (document.getElementById("prodStock")) document.getElementById("prodStock").disabled = false;
    document.getElementById("prodCategory").disabled = false;

    document.getElementById("productModal").style.display = "flex";
};

window.saveProduct = () => {
    const isSup = window.currentUserRole === 'Supervisor';
    const canAdd = window.currentEmpPermissions ? !!window.currentEmpPermissions.canAdd : false;
    const canEditFull = window.currentEmpPermissions ? !!window.currentEmpPermissions.canEdit : false;

    if (editingProductId && isSup && !canEditFull) {
        let addStockVal = document.getElementById("prodAddStockOnly") ? document.getElementById("prodAddStockOnly").value : 0;
        if(!addStockVal || addStockVal < 1) {
            return window.showAlert("برجاء كتابة رقم صحيح للإضافة");
        }
        
        const p = allProducts.find(x => x.id === editingProductId);
        let newStock = (p.stock || 0) + parseInt(addStockVal);
        
        update(ref(db, `products/${editingProductId}`), { stock: newStock }).then(() => {
            window.closeModal('productModal');
            window.showAlert("تم زيادة المخزون بنجاح!", "success");
            logAction("زيادة مخزون", `إضافة ${addStockVal} قطعة لمنتج: ${p.name}`);
        });
        return;
    }

    const name = document.getElementById("prodName").value.trim();
    const price = document.getElementById("prodPrice").value;
    const discountPrice = document.getElementById("prodDiscountPrice") ? document.getElementById("prodDiscountPrice").value : "";
    const category = document.getElementById("prodCategory").value;
    const description = document.getElementById("prodDesc").value;
    const image = document.getElementById("prodImage").value;
    const stock = document.getElementById("prodStock") ? document.getElementById("prodStock").value : 0;
    const offerDays = document.getElementById("prodOfferDays") ? document.getElementById("prodOfferDays").value : "";
    
    if (!name || !price || !category) {
        return window.showAlert("الاسم والسعر والقسم مطلوبين!");
    }
    
    let parsedDiscount = discountPrice ? Number(discountPrice) : null;

    const data = { 
        name: name, 
        price: Number(price), 
        discountPrice: parsedDiscount, 
        stock: Number(stock) || 0,
        offerDays: offerDays ? Number(offerDays) : null,
        category: category, 
        description: description, 
        imageUrl: image || "https://via.placeholder.com/300" 
    };

    if (editingProductId) {
        if (isSup && !canEditFull) {
            return window.showAlert("ليس لديك صلاحية لتعديل المنتجات!", "error");
        }
        update(ref(db, `products/${editingProductId}`), data).then(() => {
            window.closeModal('productModal');
            window.showAlert("تم التعديل بنجاح!", "success");
            logAction("تعديل منتج", `تعديل بيانات المنتج: ${data.name}`);
        });
    } else {
        if (isSup && !canAdd) {
            return window.showAlert("ليس لديك صلاحية لإضافة منتجات جديدة!", "error");
        }
        data.isActive = true; 
        push(ref(db, 'products'), data).then(() => {
            window.closeModal('productModal');
            window.showAlert("تمت الإضافة بنجاح!", "success");
            logAction("إضافة منتج", `إنشاء منتج جديد: ${data.name}`);
        });
    }
};

window.filterProducts = () => {
    const searchInput = document.getElementById("searchProducts");
    const term = searchInput ? searchInput.value.toLowerCase() : "";
    const catF = document.getElementById("filterProductCat") ? document.getElementById("filterProductCat").value : "";
    const offerF = document.getElementById("filterProductOffers") ? document.getElementById("filterProductOffers").checked : false;
    const table = document.getElementById("productsTableBody"); 
    if (!table) return;
    table.innerHTML = "";
    
    let filtered = allProducts.filter(p => {
        let textMatch = (p.name || "").toLowerCase().includes(term);
        let catMatch = catF ? p.category === catF : true;
        let offerMatch = offerF ? !!p.discountPrice : true;
        
        let tabMatch = true;
        if (currentProductTab === 'active') tabMatch = p.isActive;
        else if (currentProductTab === 'inactive') tabMatch = !p.isActive;
        else if (currentProductTab === 'lowstock') tabMatch = (p.stock || 0) <= 5;
        
        return textMatch && catMatch && offerMatch && tabMatch;
    });

    const isSup = window.currentUserRole === 'Supervisor';
    const canEdit = isSup && window.currentEmpPermissions ? !!window.currentEmpPermissions.canEdit : true;
    const canDelete = isSup && window.currentEmpPermissions ? !!window.currentEmpPermissions.canDelete : true;
    
    filtered.forEach(p => {
        let priceDisplay = `${p.price} ج.م`;
        if (p.discountPrice) {
            priceDisplay = `<del style="color:#94a3b8;">${p.price}</del> <span style="color:var(--accent); font-weight:bold;">${p.discountPrice} ج.م</span>`;
        }
        
        let stockDisplay = (p.stock || 0) <= 5 ? `<span style="color:var(--danger); font-weight:bold;">${p.stock || 0} (نواقص)</span>` : p.stock;
        
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
                <td style="font-weight:bold;">${stockDisplay}</td>
                <td>${p.category}</td>
                <td><span class="badge ${badgeClass}">${badgeText}</span></td>
                <td>
                    <div class="actions">
                        <button class="btn-action btn-edit" onclick="editProduct('${p.id}')">
                            <i class="fas fa-pen"></i>
                        </button>
                        ${(!isSup || canEdit) ? `
                        <button class="btn-action btn-hide" style="background-color: ${toggleBg}" onclick="toggleProduct('${p.id}', ${p.isActive}, '${p.name}')">
                            <i class="fas ${toggleIcon}"></i>
                        </button>` : ''}
                        ${(!isSup || canDelete) ? `
                        <button class="btn-action btn-delete" onclick="deleteProduct('${p.id}', '${p.name}')">
                            <i class="fas fa-trash"></i>
                        </button>` : ''}
                    </div>
                </td>
            </tr>`;
    });
};

onValue(ref(db, 'products'), (snapshot) => {
    try {
        allProducts = [];
        productCatalog = {};
        if (snapshot.exists()) {
            snapshot.forEach(child => { 
                let p = { id: child.key, ...child.val() };
                allProducts.push(p); 
                productCatalog[p.name] = p.imageUrl;
            });
        }
        if(document.getElementById('statTotalProducts')) {
            document.getElementById('statTotalProducts').innerText = allProducts.filter(p=>p.isActive).length;
        }
        window.filterProducts();
        updateNotifications();
        if(typeof window.filterCategories !== 'undefined') window.filterCategories();
    } catch(err) {
        console.error(err);
    }
});

window.deleteProduct = (id, name) => {
    const isSup = window.currentUserRole === 'Supervisor';
    const canDelete = window.currentEmpPermissions ? !!window.currentEmpPermissions.canDelete : false;

    if (isSup && !canDelete) {
        return window.showAlert("ليس لديك صلاحية لحذف المنتجات!", "error");
    }
    window.showConfirm("هل تريد حذف هذا المنتج نهائياً؟", () => {
        remove(ref(db, `products/${id}`)).then(() => {
            window.showAlert("تم الحذف", "success");
            logAction("حذف منتج", `تم حذف المنتج: ${name}`);
        });
    });
};

window.toggleProduct = (id, status, name) => {
    const isSup = window.currentUserRole === 'Supervisor';
    const canEditFull = window.currentEmpPermissions ? !!window.currentEmpPermissions.canEdit : false;

    if (isSup && !canEditFull) {
        return window.showAlert("ليس لديك صلاحية لتعديل حالة المنتجات!", "error");
    }
    update(ref(db, `products/${id}`), { isActive: !status }).then(() => {
        logAction("حالة منتج", `تغيير حالة المنتج ${name} إلى ${!status ? 'معروض' : 'مخفي'}`);
    });
};

window.editProduct = (id) => {
    editingProductId = id; 
    const p = allProducts.find(x => x.id === id);
    if (!p) return;
    
    document.getElementById("prodName").value = p.name; 
    document.getElementById("prodPrice").value = p.price;
    if (document.getElementById("prodDiscountPrice")) document.getElementById("prodDiscountPrice").value = p.discountPrice || ""; 
    if (document.getElementById("prodStock")) document.getElementById("prodStock").value = p.stock || 0;
    if (document.getElementById("prodOfferDays")) document.getElementById("prodOfferDays").value = p.offerDays || "";
    document.getElementById("prodDesc").value = p.description || "";
    document.getElementById("prodImage").value = p.imageUrl || ""; 
    
    setTimeout(() => {
        if (document.getElementById("prodCategory")) document.getElementById("prodCategory").value = p.category;
    }, 100);
    
    const isSup = window.currentUserRole === 'Supervisor';
    const canEditFull = window.currentEmpPermissions ? !!window.currentEmpPermissions.canEdit : false;
    
    if (isSup && !canEditFull) {
        if (document.getElementById('stockOnlyAlert')) document.getElementById('stockOnlyAlert').style.display = 'block';
        if (document.getElementById('addStockDiv')) document.getElementById('addStockDiv').style.display = 'block';
        if (document.getElementById("prodAddStockOnly")) document.getElementById("prodAddStockOnly").value = "";
        
        document.getElementById("prodName").disabled = true;
        document.getElementById("prodPrice").disabled = true;
        if (document.getElementById("prodStock")) document.getElementById("prodStock").disabled = true;
        document.getElementById("prodCategory").disabled = true;
    } else {
        if (document.getElementById('stockOnlyAlert')) document.getElementById('stockOnlyAlert').style.display = 'none';
        if (document.getElementById('addStockDiv')) document.getElementById('addStockDiv').style.display = 'none';
        
        document.getElementById("prodName").disabled = false;
        document.getElementById("prodPrice").disabled = false;
        if (document.getElementById("prodStock")) document.getElementById("prodStock").disabled = false;
        document.getElementById("prodCategory").disabled = false;
    }

    document.getElementById("productModalTitle").innerText = "تعديل المنتج"; 
    document.getElementById('productModal').style.display = "flex";
};

// ==========================================
// الأقسام
// ==========================================
let editingCatId = null; 
let allCategories = [];

window.openCategoryModal = () => { 
    const isSup = window.currentUserRole === 'Supervisor';
    const canAdd = window.currentEmpPermissions ? !!window.currentEmpPermissions.canAdd : false;

    if (isSup && !canAdd) {
        return window.showAlert("ليس لديك صلاحية لإضافة أقسام جديدة!", "error");
    }
    editingCatId = null; 
    document.getElementById("catNameInput").value = ""; 
    document.getElementById('categoryModal').style.display = "flex"; 
};

window.saveCategory = () => { 
    const name = document.getElementById("catNameInput").value.trim(); 
    if (!name) return;
    
    const isSup = window.currentUserRole === 'Supervisor';
    const canEditFull = window.currentEmpPermissions ? !!window.currentEmpPermissions.canEdit : false;
    const canAdd = window.currentEmpPermissions ? !!window.currentEmpPermissions.canAdd : false;

    if (editingCatId) {
        if (isSup && !canEditFull) {
            return window.showAlert("ليس لديك صلاحية لتعديل الأقسام!", "error");
        }
        update(ref(db, `categories/${editingCatId}`), { name }).then(() => {
            window.closeModal('categoryModal');
            window.showAlert("تم التعديل", "success");
            logAction("تعديل قسم", `تعديل اسم القسم إلى: ${name}`);
        });
    } else {
        if (isSup && !canAdd) {
            return window.showAlert("ليس لديك صلاحية لإضافة أقسام جديدة!", "error");
        }
        push(ref(db, 'categories'), { name: name, isActive: true }).then(() => {
            window.closeModal('categoryModal');
            window.showAlert("تم إضافة القسم", "success");
            logAction("إضافة قسم", `إنشاء قسم جديد: ${name}`);
        });
    }
};

window.editCategory = (id, name) => { 
    const isSup = window.currentUserRole === 'Supervisor';
    const canEditFull = window.currentEmpPermissions ? !!window.currentEmpPermissions.canEdit : false;

    if (isSup && !canEditFull) {
        return window.showAlert("ليس لديك صلاحية لتعديل الأقسام!", "error");
    }
    editingCatId = id; 
    document.getElementById("catNameInput").value = name; 
    document.getElementById('categoryModal').style.display = "flex"; 
};

window.deleteCategory = (id, name) => {
    const isSup = window.currentUserRole === 'Supervisor';
    const canDelete = window.currentEmpPermissions ? !!window.currentEmpPermissions.canDelete : false;

    if (isSup && !canDelete) {
        return window.showAlert("ليس لديك صلاحية لحذف الأقسام!", "error");
    }
    window.showConfirm("هل متأكد من حذف القسم؟", () => {
        remove(ref(db, `categories/${id}`)).then(() => {
            logAction("حذف قسم", `حذف القسم: ${name}`);
        });
    });
};

window.filterCategories = () => {
    const searchInput = document.getElementById("searchCategories");
    const term = searchInput ? searchInput.value.toLowerCase() : "";
    const table = document.getElementById("categoriesTableBody"); 
    const select1 = document.getElementById("prodCategory");
    const select2 = document.getElementById("filterProductCat");
    
    if (!table) return;
    table.innerHTML = ""; 
    if (select1) select1.innerHTML = "";
    if (select2) select2.innerHTML = "<option value=''>كل الأقسام</option>";
    
    let filtered = allCategories.filter(c => (c.name || "").toLowerCase().includes(term));

    const isSup = window.currentUserRole === 'Supervisor';
    const canEdit = isSup && window.currentEmpPermissions ? !!window.currentEmpPermissions.canEdit : true;
    const canDelete = isSup && window.currentEmpPermissions ? !!window.currentEmpPermissions.canDelete : true;
    
    filtered.forEach(c => {
        let badgeClass = c.isActive ? 'badge-active' : 'badge-inactive';
        let badgeText = c.isActive ? 'مفعل' : 'مخفي';
        
        let prodCount = allProducts.filter(p => p.category === c.name).length; 
        
        table.innerHTML += `
            <tr>
                <td><b>${c.name}</b></td>
                <td style="color:var(--secondary); font-weight:bold;">${prodCount} منتج</td>
                <td><span class="badge ${badgeClass}">${badgeText}</span></td>
                <td>
                    <div class="actions">
                        ${(!isSup || canEdit) ? `
                        <button class="btn-action btn-edit" onclick="editCategory('${c.id}', '${c.name}')">
                            <i class="fas fa-pen"></i>
                        </button>` : ''}
                        ${(!isSup || canDelete) ? `
                        <button class="btn-action btn-delete" onclick="deleteCategory('${c.id}', '${c.name}')">
                            <i class="fas fa-trash"></i>
                        </button>` : ''}
                    </div>
                </td>
            </tr>`;
            
        let opt = `<option value="${c.name}">${c.name}</option>`;
        if (select1) select1.innerHTML += opt;
        if (select2) select2.innerHTML += opt;
    });
};

onValue(ref(db, 'categories'), (snapshot) => { 
    try {
        allCategories = []; 
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                allCategories.push({ id: child.key, ...child.val() });
            });
        }
        window.filterCategories();
    } catch(err) {
        console.error(err);
    }
});

// ==========================================
// أسعار الشحن 
// ==========================================
let allShipping = [];
let editingShippingId = null;

window.openShippingModal = () => { 
    const isSup = window.currentUserRole === 'Supervisor';
    const canAdd = window.currentEmpPermissions ? !!window.currentEmpPermissions.canAdd : false;

    if (isSup && !canAdd) {
        return window.showAlert("ليس لديك صلاحية للإضافة!", "error");
    }
    editingShippingId = null;
    document.getElementById('shipModalTitle').innerText = "إضافة محافظة";
    document.getElementById('shipGovName').value = "";
    document.getElementById('shipPrice').value = "";
    document.getElementById('shippingModal').style.display = "flex"; 
};

window.saveShipping = () => {
    const name = document.getElementById("shipGovName").value.trim();
    const price = document.getElementById("shipPrice").value;
    if(!name || !price) {
        return window.showAlert("الاسم والسعر مطلوبين!");
    }
    
    if(editingShippingId) {
        update(ref(db, `shipping/${editingShippingId}`), { name: name, price: Number(price) }).then(() => { 
            window.closeModal('shippingModal'); 
            window.showAlert("تم تعديل المحافظة بنجاح"); 
        });
    } else {
        push(ref(db, 'shipping'), { name: name, price: Number(price), isActive: true }).then(() => { 
            window.closeModal('shippingModal'); 
            window.showAlert("تم إضافة المحافظة بنجاح"); 
        });
    }
};

window.editShipping = (id, name, price) => {
    const isSup = window.currentUserRole === 'Supervisor';
    const canEdit = window.currentEmpPermissions ? !!window.currentEmpPermissions.canEdit : false;
    if (isSup && !canEdit) {
        return window.showAlert("ليس لديك صلاحية للتعديل!", "error");
    }
    editingShippingId = id;
    document.getElementById('shipModalTitle').innerText = "تعديل المحافظة";
    document.getElementById('shipGovName').value = name;
    document.getElementById('shipPrice').value = price;
    document.getElementById('shippingModal').style.display = "flex";
};

window.toggleShipping = (id, status) => {
    const isSup = window.currentUserRole === 'Supervisor';
    const canEdit = window.currentEmpPermissions ? !!window.currentEmpPermissions.canEdit : false;
    if (isSup && !canEdit) {
        return window.showAlert("ليس لديك صلاحية للتعديل!", "error");
    }
    update(ref(db, `shipping/${id}`), { isActive: !status });
};

window.deleteShipping = (id) => { 
    const isSup = window.currentUserRole === 'Supervisor';
    const canDelete = window.currentEmpPermissions ? !!window.currentEmpPermissions.canDelete : false;

    if (isSup && !canDelete) {
        return window.showAlert("ليس لديك صلاحية للحذف!", "error");
    }
    window.showConfirm("هل أنت متأكد من حذف هذه المحافظة؟", () => { 
        remove(ref(db, `shipping/${id}`)); 
    });
};

onValue(ref(db, 'shipping'), (snapshot) => {
    const table = document.getElementById('shippingTableBody');
    if(!table) return; 
    table.innerHTML = "";
    
    if (snapshot.exists()) {
        const isSup = window.currentUserRole === 'Supervisor';
        const canEdit = isSup && window.currentEmpPermissions ? !!window.currentEmpPermissions.canEdit : true;
        const canDelete = isSup && window.currentEmpPermissions ? !!window.currentEmpPermissions.canDelete : true;

        snapshot.forEach(child => {
            let s = {id: child.key, ...child.val()};
            let badgeClass = s.isActive ? 'badge-active' : 'badge-inactive';
            let badgeText = s.isActive ? 'مفعل' : 'مخفي';
            let toggleBg = s.isActive ? '#64748b' : '#22c55e';
            let toggleIcon = s.isActive ? 'fa-eye-slash' : 'fa-eye';

            table.innerHTML += `
                <tr>
                    <td><b>${s.name}</b></td>
                    <td style="color:var(--secondary); font-weight:bold;">${s.price} ج.م</td>
                    <td><span class="badge ${badgeClass}">${badgeText}</span></td>
                    <td>
                        <div class="actions">
                            ${(!isSup || canEdit) ? `<button class="btn-action btn-edit" onclick="editShipping('${s.id}', '${s.name}', ${s.price})"><i class="fas fa-pen"></i></button>` : ''}
                            ${(!isSup || canEdit) ? `<button class="btn-action btn-hide" style="background-color:${toggleBg}" onclick="toggleShipping('${s.id}', ${s.isActive})"><i class="fas ${toggleIcon}"></i></button>` : ''}
                            ${(!isSup || canDelete) ? `<button class="btn-action btn-delete" onclick="deleteShipping('${s.id}')"><i class="fas fa-trash"></i></button>` : ''}
                        </div>
                    </td>
                </tr>`;
        });
    }
});

// ==========================================
// الكوبونات
// ==========================================
let editingVoucherId = null; 
let allVouchers = [];
let currentVoucherTab = 'active';

window.switchVoucherTab = (tab, btn) => {
    currentVoucherTab = tab;
    document.querySelectorAll('#vouchers-view .custom-tab-btn').forEach(b => {
        b.classList.remove('active');
    });
    if (btn) btn.classList.add('active');
    filterVouchers();
};

window.openVoucherModal = () => { 
    const isSup = window.currentUserRole === 'Supervisor';
    const canAdd = window.currentEmpPermissions ? !!window.currentEmpPermissions.canAdd : false;

    if (isSup && !canAdd) {
        return window.showAlert("ليس لديك صلاحية لإضافة كوبونات جديدة!", "error");
    }
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
    
    if (!code || !value) return;
    
    let data = { 
        code: code, 
        type: type, 
        value: Number(value), 
        usageLimit: Number(limit) 
    };

    const isSup = window.currentUserRole === 'Supervisor';
    const canEditFull = window.currentEmpPermissions ? !!window.currentEmpPermissions.canEdit : false;
    const canAdd = window.currentEmpPermissions ? !!window.currentEmpPermissions.canAdd : false;
    
    if (editingVoucherId) {
        if (isSup && !canEditFull) {
            return window.showAlert("ليس لديك صلاحية لتعديل الكوبونات!", "error");
        }
        update(ref(db, `vouchers/${editingVoucherId}`), data).then(() => {
            window.closeModal('voucherModal');
            window.showAlert("تم تعديل الكوبون بنجاح!", "success");
            logAction("تعديل كوبون", `تعديل الكود: ${code}`);
        });
    } else {
        if (isSup && !canAdd) {
            return window.showAlert("ليس لديك صلاحية لإنشاء كوبونات جديدة!", "error");
        }
        data.usedBy = [];
        data.isActive = true;
        push(ref(db, 'vouchers'), data).then(() => {
            window.closeModal('voucherModal');
            window.showAlert("تم إنشاء الكوبون بنجاح!", "success");
            logAction("إنشاء كوبون", `إضافة كود جديد: ${code}`);
        });
    }
};

window.editVoucher = (id) => { 
    const isSup = window.currentUserRole === 'Supervisor';
    const canEditFull = window.currentEmpPermissions ? !!window.currentEmpPermissions.canEdit : false;

    if (isSup && !canEditFull) {
        return window.showAlert("ليس لديك صلاحية لتعديل الكوبونات!", "error");
    }
    editingVoucherId = id; 
    const v = allVouchers.find(x => x.id === id); 
    if (!v) return;
    
    document.getElementById("voucherCode").value = v.code; 
    document.getElementById("voucherType").value = v.type; 
    document.getElementById("voucherValue").value = v.value; 
    document.getElementById("voucherLimit").value = v.usageLimit || 1; 
    document.getElementById('voucherModal').style.display = "flex"; 
};

window.toggleVoucher = (id, status, code) => {
    const isSup = window.currentUserRole === 'Supervisor';
    const canEditFull = window.currentEmpPermissions ? !!window.currentEmpPermissions.canEdit : false;

    if (isSup && !canEditFull) {
        return window.showAlert("ليس لديك صلاحية لتغيير حالة الكوبونات!", "error");
    }
    update(ref(db, `vouchers/${id}`), { isActive: !status }).then(() => {
        logAction("حالة كوبون", `تغيير حالة الكود ${code} إلى ${!status ? 'مفعل' : 'معطل'}`);
    });
};

window.deleteVoucher = (id, code) => {
    const isSup = window.currentUserRole === 'Supervisor';
    const canDelete = window.currentEmpPermissions ? !!window.currentEmpPermissions.canDelete : false;

    if (isSup && !canDelete) {
        return window.showAlert("ليس لديك صلاحية لحذف الكوبونات!", "error");
    }
    window.showConfirm("حذف الكوبون نهائياً؟", () => {
        remove(ref(db, `vouchers/${id}`)).then(() => {
            logAction("حذف كوبون", `تم حذف الكود: ${code}`);
        });
    });
};

window.showVoucherUsers = (id) => {
    const v = allVouchers.find(x => x.id === id); 
    if (!v) return;
    
    const list = document.getElementById("vuList"); 
    list.innerHTML = "";
    
    if (!v.usedBy || Object.keys(v.usedBy).length === 0) {
        list.innerHTML = "<div style='text-align:center; padding: 20px; color:#666;'>لم يستخدمه أحد بعد.</div>"; 
    } else {
        Object.values(v.usedBy).forEach(u => { 
            let viewOrderBtn = u.orderId ? `<button onclick="closeModal('voucherUsersModal'); viewOrderDetails('${u.orderId}')" style="margin-top:8px; background:var(--secondary); color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; font-size:12px;"><i class="fas fa-file-invoice"></i> معاينة الطلب</button>` : '';
            
            list.innerHTML += `
                <div style="padding:15px; border-bottom:1px solid #eee;">
                    <b>${u.name}</b><br>
                    <span style="color:var(--secondary); font-weight:bold;" dir="ltr">${u.phone}</span><br>
                    ${viewOrderBtn}
                </div>`; 
        });
    }
    
    document.getElementById("voucherUsersModal").style.display = "flex";
};    

window.filterVouchers = () => {
    const searchInput = document.getElementById("searchVouchers");
    const term = searchInput ? searchInput.value.toLowerCase() : "";
    const table = document.getElementById("vouchersTableBody"); 
    if (!table) return;
    table.innerHTML = "";
    
    let filtered = allVouchers.filter(v => {
        let textMatch = (v.code || "").toLowerCase().includes(term);
        let tabMatch = currentVoucherTab === 'active' ? v.isActive : !v.isActive;
        return textMatch && tabMatch;
    });

    const isSup = window.currentUserRole === 'Supervisor';
    const canEdit = isSup && window.currentEmpPermissions ? !!window.currentEmpPermissions.canEdit : true;
    const canDelete = isSup && window.currentEmpPermissions ? !!window.currentEmpPermissions.canDelete : true;
    
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
                        ${(!isSup || canEdit) ? `
                        <button class="btn-action btn-edit" onclick="editVoucher('${v.id}')"><i class="fas fa-pen"></i></button>
                        <button class="btn-action btn-hide" style="background-color: ${toggleBg}" onclick="toggleVoucher('${v.id}', ${v.isActive}, '${v.code}')" title="${toggleTitle}"><i class="fas ${toggleIcon}"></i></button>` : ''}
                        ${(!isSup || canDelete) ? `
                        <button class="btn-action btn-delete" onclick="deleteVoucher('${v.id}', '${v.code}')"><i class="fas fa-trash"></i></button>` : ''}
                    </div>
                </td>
            </tr>`; 
    });
};

onValue(ref(db, 'vouchers'), (snapshot) => { 
    try {
        allVouchers = []; 
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                allVouchers.push({ id: child.key, ...child.val() });
            });
        }
        window.filterVouchers();
    } catch(err) {
        console.error(err);
    }
});

// ==========================================
// إدارة الموظفين
// ==========================================
let editingEmpId = null; 
let allEmployees = [];

window.toggleEmployeePermissionsUI = () => {
    if (document.getElementById("permissionsUI")) {
        document.getElementById("permissionsUI").style.display = document.getElementById("empRole").value === 'Supervisor' ? 'block' : 'none';
    }
};

window.openEmployeeModal = () => { 
    if (window.currentUserRole !== 'Admin') {
        return window.showAlert("إدارة الموظفين مخصصة لمدير النظام فقط!", "error");
    }
    editingEmpId = null; 
    document.getElementById("empName").value = ""; 
    document.getElementById("empPhone").value = ""; 
    if (document.getElementById("empEmail")) document.getElementById("empEmail").value = "";
    if (document.getElementById("empPass")) document.getElementById("empPass").value = "";
    document.getElementById('employeeModal').style.display = "flex"; 
};

window.saveEmployee = async () => { 
    if (window.currentUserRole !== 'Admin') {
        return window.showAlert("إدارة الموظفين مخصصة لمدير النظام فقط!", "error");
    }

    let permissions = { tabs: [], canAdd: false, canEdit: false, canDelete: false, canChangeStatus: false };
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
        permissions = null; 
    }

    const nameVal = document.getElementById("empName").value.trim();
    const phoneVal = document.getElementById("empPhone").value.trim();
    const emailVal = document.getElementById("empEmail") ? document.getElementById("empEmail").value.trim() : "";
    const passVal = document.getElementById("empPass") ? document.getElementById("empPass").value.trim() : "";
    const roleVal = document.getElementById("empRole").value;
    
    if (!nameVal) {
        return window.showAlert("اسم الموظف مطلوب!");
    }
    
    if (editingEmpId) {
        const data = { 
            name: nameVal, 
            phone: phoneVal, 
            email: emailVal,
            password: passVal,
            role: roleVal, 
            permissions: permissions
        };

        update(ref(db, `employees/${editingEmpId}`), data).then(() => {
            window.closeModal('employeeModal');
            window.showAlert("تم التعديل بنجاح!", "success");
            logAction("تعديل موظف", `تعديل حساب: ${nameVal}`);
        }); 
    } else { 
        if (!emailVal || !passVal) {
            return window.showAlert("البريد الإلكتروني وكلمة المرور مطلوبين لإنشاء حساب تسجيل الدخول!");
        }

        try {
            const secondaryApp = initializeApp(firebaseConfig, "SecondaryAppInstance");
            const secondaryAuth = getAuth(secondaryApp);
            
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, emailVal, passVal);
            const newUid = userCredential.user.uid;
            
            await signOut(secondaryAuth);

            const newEmpData = { 
                name: nameVal, 
                phone: phoneVal, 
                email: emailVal,
                password: passVal,
                role: roleVal, 
                permissions: permissions,
                isActive: true, 
                createdAt: Date.now() 
            };
            
            await set(ref(db, `employees/${newUid}`), newEmpData);
            
            window.closeModal('employeeModal');
            window.showAlert("تم إضافة الموظف وإنشاء حساب الدخول بنجاح!", "success");
            logAction("إضافة موظف", `إنشاء حساب جديد: ${nameVal}`);
            
        } catch (error) {
            console.error("Error creating employee auth:", error);
            let errMsg = "حدث خطأ أثناء إنشاء الحساب.";
            if (error.code === 'auth/email-already-in-use') {
                errMsg = "البريد الإلكتروني مستخدم بالفعل لحساب آخر!";
            } else if (error.code === 'auth/weak-password') {
                errMsg = "كلمة المرور ضعيفة جداً (يجب أن تكون 6 أحرف على الأقل).";
            } else if (error.code === 'auth/invalid-email') {
                errMsg = "صيغة البريد الإلكتروني غير صحيحة.";
            }
            window.showAlert(errMsg, "error");
        }
    }
};

window.editEmployee = (id) => {
    if (window.currentUserRole !== 'Admin') {
        return window.showAlert("ليس لديك صلاحية لتعديل الموظفين!", "error");
    }
    editingEmpId = id; 
    const e = allEmployees.find(x => x.id === id);
    if (!e) return;
    
    document.getElementById("empName").value = e.name; 
    document.getElementById("empPhone").value = e.phone || ""; 
    if (document.getElementById("empEmail")) document.getElementById("empEmail").value = e.email || ""; 
    if (document.getElementById("empPass")) document.getElementById("empPass").value = e.password || ""; 
    document.getElementById("empRole").value = e.role || "Admin"; 
    
    if (e.role === 'Supervisor' && e.permissions) {
        if (document.querySelectorAll('.perm-tab')) {
            document.querySelectorAll('.perm-tab').forEach(cb => {
                cb.checked = (e.permissions.tabs || []).includes(cb.value);
            });
        }
        if (document.getElementById("permChangeOrderStatus")) {
            document.getElementById("permChangeOrderStatus").checked = e.permissions.canChangeStatus || false;
        }
        if (document.getElementById("permAdd")) document.getElementById("permAdd").checked = e.permissions.canAdd || false;
        if (document.getElementById("permEdit")) document.getElementById("permEdit").checked = e.permissions.canEdit || false;
        if (document.getElementById("permDelete")) document.getElementById("permDelete").checked = e.permissions.canDelete || false;
        
        window.toggleEmployeePermissionsUI();
    } else {
        if (document.getElementById('permissionsUI')) {
            document.getElementById('permissionsUI').style.display = 'none';
        }
    }
    
    document.getElementById('employeeModal').style.display = "flex";
};

window.deleteEmployee = (id, name) => {
    if (window.currentUserRole !== 'Admin') {
        return window.showAlert("ليس لديك صلاحية لحذف الموظفين!", "error");
    }
    window.showConfirm("حذف بيانات الموظف نهائياً؟", () => {
        remove(ref(db, `employees/${id}`)).then(() => {
            logAction("حذف موظف", `تم حذف حساب: ${name}`);
        });
    });
};

window.filterEmployees = () => {
    const searchInput = document.getElementById("searchEmployees");
    const term = searchInput ? searchInput.value.toLowerCase() : "";
    const table = document.getElementById("employeesTableBody"); 
    if (!table) return;
    table.innerHTML = ""; 
    
    let filtered = allEmployees.filter(e => {
        let nameMatch = (e.name || "").toLowerCase().includes(term);
        let phoneMatch = false;
        if (e.phone) phoneMatch = e.phone.includes(term);
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
                <td>${e.phone || '-'}</td>
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
    try {
        allEmployees = []; 
        const filterUserDropdown = document.getElementById("filterLogUser");
        if (filterUserDropdown) filterUserDropdown.innerHTML = "<option value=''>كل الموظفين</option>";
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                let e = { id: child.key, ...child.val() };
                allEmployees.push(e);
                if (filterUserDropdown) filterUserDropdown.innerHTML += `<option value="${e.name}">${e.name}</option>`;
            });
        }
        window.filterEmployees();
    } catch(err) {
        console.error(err);
    }
});

// ==========================================
// سجل النشاطات والأرشفة 
// ==========================================
let allLogs = [];
let allArchivedLogs = [];
let currentLogTab = 'current';

window.switchLogTab = (tab, btn) => {
    currentLogTab = tab;
    document.querySelectorAll('#logs-view .custom-tab-btn').forEach(b => {
        b.classList.remove('active');
    });
    if (btn) btn.classList.add('active');
    window.filterLogs();
};

window.filterLogs = () => {
    const term = document.getElementById("searchLogs") ? document.getElementById("searchLogs").value.toLowerCase() : "";
    const userF = document.getElementById("filterLogUser") ? document.getElementById("filterLogUser").value : "";
    const dateFrom = document.getElementById("filterLogDateFrom") ? document.getElementById("filterLogDateFrom").value : "";
    const dateTo = document.getElementById("filterLogDateTo") ? document.getElementById("filterLogDateTo").value : "";
    const table = document.getElementById("logsTableBody"); 
    if (!table) return;
    table.innerHTML = "";
    
    let dataset = currentLogTab === 'current' ? allLogs : allArchivedLogs;

    dataset.filter(log => {
        let textMatch = (log.action && log.action.toLowerCase().includes(term)) || (log.details && log.details.toLowerCase().includes(term));
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
                <td>${log.user}</td>
                <td dir="ltr" style="font-size:12px;">${formatDateTime(log.timestamp)}</td>
            </tr>`; 
    });
};

window.exportLogsToExcel = () => {
    if (typeof XLSX === 'undefined') {
        return window.showAlert("برجاء التأكد من إضافة مكتبة Excel في HTML");
    }
    
    let dataset = currentLogTab === 'current' ? allLogs : allArchivedLogs;
    if (dataset.length === 0) return window.showAlert("لا توجد بيانات للتصدير", "warning");

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
    try {
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
        
        if (currentLogTab === 'current') window.filterLogs();
    } catch(err) {
        console.error(err);
    }
});

onValue(ref(db, 'archived_logs'), (snapshot) => { 
    try {
        allArchivedLogs = [];
        if (snapshot.exists()) { 
            snapshot.forEach(child => {
                allArchivedLogs.push({ id: child.key, ...child.val() });
            }); 
            allArchivedLogs.reverse();
        }
        if (currentLogTab === 'archived') window.filterLogs();
    } catch(err) {
        console.error(err);
    }
});

window.archiveLogsAll = () => {
    if (allLogs.length === 0) return window.showAlert("السجل الحالي فارغ بالفعل");
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
                    });
                } else {
                    window.showAlert("لا توجد سجلات أقدم من شهر لأرشفتها.");
                }
            }
        });
    });
};

// ==========================================
// إعدادات المتجر الأساسية وطرق الدفع
// ==========================================
window.saveSettings = () => {
    if (window.currentUserRole !== 'Admin') {
        return window.showAlert("تعديل إعدادات المتجر مخصص للمدير فقط!", "error");
    }

    const data = {
        newsTicker: document.getElementById("setNewsTicker") ? document.getElementById("setNewsTicker").value : "",
        isOpen: document.getElementById("setStoreStatus") ? document.getElementById("setStoreStatus").checked : true,
        phone: document.getElementById("setPhone") ? document.getElementById("setPhone").value : "",
        email: document.getElementById("setEmail") ? document.getElementById("setEmail").value : "",
        address: document.getElementById("setAddress") ? document.getElementById("setAddress").value : "",
        social: {
            facebook: document.getElementById("setFb") ? document.getElementById("setFb").value : "",
            instagram: document.getElementById("setInsta") ? document.getElementById("setInsta").value : "",
            telegram: document.getElementById("setTelegram") ? document.getElementById("setTelegram").value : "",
            whatsapp: document.getElementById("setWhatsapp") ? document.getElementById("setWhatsapp").value : "",
            tiktok: document.getElementById("setTiktok") ? document.getElementById("setTiktok").value : ""
        },
        socialEnabled: {
            facebook: document.getElementById("enableFb") ? document.getElementById("enableFb").checked : true,
            instagram: document.getElementById("enableInsta") ? document.getElementById("enableInsta").checked : true,
            telegram: document.getElementById("enableTg") ? document.getElementById("enableTg").checked : true,
            whatsapp: document.getElementById("enableWa") ? document.getElementById("enableWa").checked : true,
            tiktok: document.getElementById("enableTiktok") ? document.getElementById("enableTiktok").checked : true
        },
        paymentMethods: {
            cod: document.getElementById("setPayCod") ? document.getElementById("setPayCod").checked : true,
            wallet: document.getElementById("setPayWallet") ? document.getElementById("setPayWallet").checked : false,
            instapay: document.getElementById("setPayInsta") ? document.getElementById("setPayInsta").checked : false,
            visa: document.getElementById("setPayVisa") ? document.getElementById("setPayVisa").checked : false
        }
    };

    update(ref(db, 'storeSettings'), data).then(() => {
        logAction("تحديث الإعدادات", "تم تحديث بيانات المتجر الأساسية بنجاح");
        window.showAlert("تم حفظ الإعدادات بنجاح!", "success");
    });
};

onValue(ref(db, 'storeSettings'), (snapshot) => {
    try {
        if (snapshot.exists()) {
            const d = snapshot.val();
            if (document.getElementById("setNewsTicker")) document.getElementById("setNewsTicker").value = d.newsTicker || "";
            if (document.getElementById("setStoreStatus")) document.getElementById("setStoreStatus").checked = d.isOpen !== undefined ? d.isOpen : true;
            if (document.getElementById("setPhone")) document.getElementById("setPhone").value = d.phone || "";
            if (document.getElementById("setEmail")) document.getElementById("setEmail").value = d.email || "";
            if (document.getElementById("setAddress")) document.getElementById("setAddress").value = d.address || "";
            
            if (d.social) {
                if (document.getElementById("setFb")) document.getElementById("setFb").value = d.social.facebook || "";
                if (document.getElementById("setInsta")) document.getElementById("setInsta").value = d.social.instagram || "";
                if (document.getElementById("setTelegram")) document.getElementById("setTelegram").value = d.social.telegram || "";
                if (document.getElementById("setWhatsapp")) document.getElementById("setWhatsapp").value = d.social.whatsapp || "";
                if (document.getElementById("setTiktok")) document.getElementById("setTiktok").value = d.social.tiktok || "";
            }

            if (d.socialEnabled) {
                if (document.getElementById("enableFb")) document.getElementById("enableFb").checked = d.socialEnabled.facebook;
                if (document.getElementById("enableInsta")) document.getElementById("enableInsta").checked = d.socialEnabled.instagram;
                if (document.getElementById("enableTg")) document.getElementById("enableTg").checked = d.socialEnabled.telegram;
                if (document.getElementById("enableWa")) document.getElementById("enableWa").checked = d.socialEnabled.whatsapp;
                if (document.getElementById("enableTiktok")) document.getElementById("enableTiktok").checked = d.socialEnabled.tiktok;
            }

            if (d.paymentMethods) {
                if (document.getElementById("setPayCod")) document.getElementById("setPayCod").checked = d.paymentMethods.cod;
                if (document.getElementById("setPayWallet")) document.getElementById("setPayWallet").checked = d.paymentMethods.wallet;
                if (document.getElementById("setPayInsta")) document.getElementById("setPayInsta").checked = d.paymentMethods.instapay;
                if (document.getElementById("setPayVisa")) document.getElementById("setPayVisa").checked = d.paymentMethods.visa;
            }
        }
    } catch(err) {
        console.error(err);
    }
});

// ==========================================
// تشغيل القائمة المنسدلة للملف الشخصي
// ==========================================
const myProfileBtn = document.getElementById('userProfileBtn');
const myProfileMenu = document.getElementById('profileDropdown');

if (myProfileBtn && myProfileMenu) {
    myProfileBtn.addEventListener('click', (e) => {
        myProfileMenu.classList.toggle('show');
        e.stopPropagation(); 
    });

    document.addEventListener('click', (e) => {
        if (!myProfileBtn.contains(e.target)) {
            myProfileMenu.classList.remove('show');
        }
    });
}
