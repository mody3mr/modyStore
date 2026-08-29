import { initializeApp } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-app.js";
import { getDatabase, ref, get, child, remove, update, onValue, push, set } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-database.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-storage.js";
import { getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-auth.js";
import { getMessaging, getToken, onMessage, isSupported as isMessagingSupported } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-messaging.js";

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
const storage = getStorage(app);
const auth = getAuth(app);

// تأمين الجلسة: إجبار الموقع على طلب تسجيل الدخول عند فتح المتصفح من جديد
setPersistence(auth, browserLocalPersistence).catch((error) => console.error(error));

let currentUser = "جاري التحميل...";
window.currentUserRole = null; // لا نفترض صلاحيات المشرف قبل اكتمال التحقق من تسجيل الدخول
window.currentEmpPermissions = null;
window.currentEmpUid = null;
window.__dashboardAuthReady = false;

// حماية من الشاشة البيضاء: أي خطأ غير متوقع يظهر في الـ console بدل ما يترك الصفحة
// في حالة غير مفهومة، مع محاولة إبقاء الواجهة ظاهرة.
window.addEventListener('error', (event) => {
    console.error('ModyStore Dashboard error:', event.error || event.message);
});
window.addEventListener('unhandledrejection', (event) => {
    console.error('ModyStore Dashboard promise error:', event.reason);
});

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
const authGate = document.getElementById('authGate');
let authFinished = false;
let authTimeout = null;

function finishAuthUI(ok, message='') {
    if (authFinished && ok) return;
    if (authTimeout) clearTimeout(authTimeout);
    const gate = document.getElementById('authGate');
    const body = document.body;
    if (ok) {
        authFinished = true;
        body.classList.remove('auth-pending');
        body.classList.add('auth-ready');
        if (gate) gate.style.display = 'none';
        return;
    }
    // لا نترك المستخدم عالقاً على شاشة التحميل إذا فشل Firebase/قاعدة البيانات.
    if (gate) {
        gate.innerHTML = `
            <div class="auth-gate-card auth-gate-error">
                <div class="auth-gate-logo"><i class="fas fa-triangle-exclamation"></i></div>
                <strong>تعذر تأمين لوحة التحكم</strong>
                <span>${message || 'تعذر التحقق من الحساب والصلاحيات.'}</span>
                <button type="button" class="btn-add" style="margin-top:16px" onclick="location.href='login.html'">
                    <i class="fas fa-right-to-bracket"></i> العودة لتسجيل الدخول
                </button>
            </div>`;
    }
}

// حماية من التعليق اللانهائي: إذا لم يرد Firebase خلال 15 ثانية نظهر سبباً واضحاً.
authTimeout = setTimeout(() => {
    if (!window.__dashboardAuthReady) {
        finishAuthUI(false, 'لم تصل استجابة من Firebase. تأكد من اتصال الإنترنت وقواعد Realtime Database ثم حاول مرة أخرى.');
    }
}, 15000);

onAuthStateChanged(auth, async (user) => {
    try {
        if (!user) {
            if (authTimeout) clearTimeout(authTimeout);
            window.location.href = "login.html";
            return;
        }

        window.currentEmpUid = user.uid;

        // الموظف يتم حفظه بمفتاح UID عند إنشاء الحساب، لذلك لا نحتاج قراءة
        // جدول employees بالكامل. هذا أسرع وأكثر أماناً ويمنع التعليق عند قواعد البيانات الكبيرة.
        const empSnap = await get(ref(db, `employees/${user.uid}`));
        if (!empSnap.exists()) {
            throw new Error('لم يتم العثور على بيانات الموظف لهذا الحساب.');
        }

        const empData = empSnap.val() || {};
        const emailMatches = !empData.email || String(empData.email).trim().toLowerCase() === String(user.email || '').trim().toLowerCase();
        const active = empData.isActive !== false;
        const role = empData.role || 'Supervisor';

        if (!emailMatches || !active) {
            await signOut(auth);
            window.location.href = "login.html";
            return;
        }

        currentUser = empData.name || user.email || 'المستخدم';
        window.currentUserRole = role;
        window.currentEmpPermissions = empData.permissions || null;

        // --- بيانات الهيدر ---
        const nameDisplay = document.getElementById("currentUserNameDisplay");
        const avatar = document.getElementById("currentUserAvatar");
        const dropName = document.getElementById("dropdownName");
        const dropRole = document.getElementById("dropdownRole");
        if (nameDisplay) nameDisplay.innerText = currentUser;
        if (dropName) dropName.innerText = currentUser;
        if (dropRole) dropRole.innerText = role === 'Admin' ? 'مدير النظام' : 'مشرف';
        if (avatar) {
            const apiName = encodeURIComponent(currentUser);
            avatar.src = `https://ui-avatars.com/api/?name=${apiName}&background=3b82f6&color=fff`;
        }

        // مهم: نطبق الصلاحيات قبل كشف أي جزء من الداشبورد.
        window.__dashboardAuthReady = true;
        try {
            window.applyDashboardPermissions?.();
            window.updateStatusSummary?.();
            window.renderOrdersTable?.();
            window.filterProducts?.();
            window.filterCategories?.();
            window.filterVouchers?.();
            window.renderFinanceTable?.();
            window.renderReturnsTable?.();
            window.renderInventoryTable?.();
            window.initMobilePushNotifications?.();
        } catch (e) {
            console.error('Dashboard post-auth refresh error:', e);
        }

        finishAuthUI(true);
    } catch (err) {
        console.error('Dashboard authentication failed:', err);
        window.__dashboardAuthReady = false;
        finishAuthUI(false, err?.message || 'تعذر الوصول إلى بيانات الموظف في Firebase.');
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
const sidebarToggleEl = document.getElementById('sidebarToggle');
const sidebarEl = document.getElementById('sidebar');
if (sidebarToggleEl && sidebarEl) {
    sidebarToggleEl.addEventListener('click', () => {
        sidebarEl.classList.toggle('collapsed');
    });
}

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        const targetView = item.dataset.target;
        if (!targetView) return;
        
        // التحقق الأمني المانع للمشرفين
        if (window.currentUserRole === 'Supervisor' && window.currentEmpPermissions) {
            const allowedTabs = window.currentEmpPermissions.tabs || [];
            if (!allowedTabs.includes(targetView)) {
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
    if (!salesChart || typeof allOrders === 'undefined') return;
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

    if (ordersChart) { ordersChart.data.datasets[0].data = [counts.pending, counts.processing, counts.shipped, counts.delivered]; ordersChart.update(); }

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
            format: "CODE128", width: 2.4, height: 82, displayValue: true, fontSize: 20, margin: 8
        });
        const bcSvg = document.getElementById('topBarcode');
        if (bcSvg) {
            bcSvg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
            bcSvg.style.width = 'min(100%, 620px)';
            bcSvg.style.maxWidth = '620px';
            bcSvg.style.height = '90px';
            bcSvg.style.display = 'block';
            bcSvg.style.margin = '0 auto';
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

window.openScannerModal = () => {
    document.getElementById('scannerModal').style.display = 'flex';
    html5QrcodeScanner = new Html5Qrcode("qr-reader");
    html5QrcodeScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 350, height: 150 } },
        (decodedText) => {
            let now = Date.now();
            if (now - lastScanTime < 1500) return; 
            lastScanTime = now;
            
            let beep = document.getElementById('barcodeBeep');
            if (beep) { beep.currentTime = 0; beep.play().catch(e=>console.log(e)); }

            let order = allOrders.find(o => o.displayId === decodedText || o.orderId === decodedText || o.secretCode === decodedText);
            if(order) {
                if(order.status === 'تم الشحن' || order.status === 'تم تسليمه' || order.status === 'ملغي' || order.status === 'مرتجع') {
                    window.showAlert(`الطلب حالته الحالية: ${order.status}`, 'warning');
                } else {
                    update(ref(db, `orders/${order.dbId}`), { status: 'تم الشحن', shippedAt: Date.now() });
                    window.showAlert('تم تحويل الطلب لـ تم الشحن!', 'success');
                    logAction("سكانر شحن", `تأكيد شحن طلب #${order.displayId} عبر السكانر`);
                }
            } else {
                window.showAlert('لم يتم العثور على الطلب!', 'error');
            }
        },
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
            JsBarcode(`#bulk-bc-${order.displayId || order.orderId}`, order.orderId || order.secretCode || order.displayId, { format: "CODE128", width: 2.2, height: 82, displayValue: true, fontSize: 20, margin: 8 });
            const bulkSvg = document.getElementById(`bulk-bc-${order.displayId || order.orderId}`);
            if (bulkSvg) { bulkSvg.setAttribute('preserveAspectRatio', 'xMidYMid meet'); bulkSvg.style.width = 'min(100%, 620px)'; bulkSvg.style.maxWidth = '620px'; bulkSvg.style.height = '90px'; bulkSvg.style.display='block'; bulkSvg.style.margin='0 auto'; }
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
    let total = 0;
    if(snapshot.exists()){
        snapshot.forEach(child => {
            let f = child.val();
            f.id = child.key;
            allFinance.push(f);
            total += f.amount;
        });
    }
    allFinance.reverse();
    if(document.getElementById('statTotalExpenses')) {
        document.getElementById('statTotalExpenses').innerText = total + " ج.م";
    }
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


// ================================================================
// ModyStore Dashboard V2 - requested production enhancements
// ================================================================
(() => {
    const MODULES = ['analytics','orders','finance','returns','products','categories','vouchers','shipping','employees','logs','inventory','reviews'];
    const ACTIONS = {
        analytics:['view','export'], orders:['view','create','changeStatus','details'],
        finance:['view','purchase','expense','history','export'], returns:['view','create','details','archive','export'],
        products:['view','add','edit','toggle','delete'], categories:['view','add','edit','toggle','delete'],
        vouchers:['view','add','edit','toggle','delete','users'], shipping:['view','edit','toggle','delete'],
        employees:['view','add','edit','delete'], logs:['view','export','archive'], inventory:['view','adjust','export'], reviews:['view','add','edit','toggle','delete']
    };
    const TAB_BY_MODULE = Object.fromEntries(MODULES.map(m => [m, `${m}-view`]));
    TAB_BY_MODULE.analytics = 'analytics-view';

    const esc = (v='') => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const n = v => Number(v || 0);
    const money = v => `${Math.round(n(v))} ج.م`;
    const reportDate = ms => new Date(ms).toLocaleDateString('ar-EG');

    function isAdmin(){ return window.currentUserRole === 'Admin'; }
    function modulePerm(module, action='view') {
        if (isAdmin()) return true;
        const p = window.currentEmpPermissions || {};
        if (p.modules && p.modules[module] && typeof p.modules[module][action] !== 'undefined') return !!p.modules[module][action];
        if (action === 'view') return (p.tabs || []).includes(TAB_BY_MODULE[module]);
        if (action === 'changeStatus') return !!p.canChangeStatus;
        if (action === 'add') return !!p.canAdd;
        if (action === 'edit') return !!p.canEdit;
        if (action === 'toggle') return false;
        if (action === 'create') return false;
        if (action === 'delete') return !!p.canDelete;
        return false;
    }
    window.hasDashboardPermission = modulePerm;
    function guard(module, action, msg='ليس لديك صلاحية لتنفيذ هذا الإجراء!') {
        if (modulePerm(module, action)) return true;
        window.showAlert(msg,'error');
        return false;
    }

    // --- permission UI + persistence ---
    function collectPermissions(){
        const modules = {};
        MODULES.forEach(m => { modules[m] = {}; ACTIONS[m].forEach(a => modules[m][a] = false); });
        document.querySelectorAll('[data-perm]').forEach(cb => {
            const [m,a] = cb.dataset.perm.split('.');
            if (modules[m] && a in modules[m]) modules[m][a] = cb.checked;
        });
        document.querySelectorAll('.perm-view').forEach(cb => { if(modules[cb.dataset.module]) modules[cb.dataset.module].view = cb.checked; });
        document.querySelectorAll('.perm-export').forEach(cb => { if(modules[cb.dataset.module]) modules[cb.dataset.module].export = cb.checked; });
        const tabs = MODULES.filter(m => modules[m].view).map(m => TAB_BY_MODULE[m]);
        return { modules, tabs, canAdd: MODULES.some(m => modules[m].add), canEdit: MODULES.some(m => modules[m].edit || modules[m].toggle), canDelete: MODULES.some(m => modules[m].delete), canChangeStatus: !!modules.orders.changeStatus };
    }
    function fillPermissions(perms){
        document.querySelectorAll('[data-perm]').forEach(cb => cb.checked = false);
        document.querySelectorAll('.perm-view,.perm-export').forEach(cb => cb.checked = false);
        const p = perms || {};
        if (p.modules) {
            Object.entries(p.modules).forEach(([m,vals]) => Object.entries(vals||{}).forEach(([a,v]) => {
                const el = document.querySelector(`[data-perm="${m}.${a}"]`);
                if (el) el.checked = !!v;
                const cls = a === 'view' ? '.perm-view' : a === 'export' ? '.perm-export' : null;
                if (cls) { const q=document.querySelector(`${cls}[data-module="${m}"]`); if(q) q.checked=!!v; }
            }));
        } else {
            (p.tabs||[]).forEach(tab => { const q=document.querySelector(`.perm-view[data-module="${MODULES.find(m=>TAB_BY_MODULE[m]===tab)}"]`); if(q) q.checked=true; });
            const oldMap={canChangeStatus:'orders.changeStatus',canAdd:'products.add',canEdit:'products.edit',canDelete:'products.delete'};
            Object.entries(oldMap).forEach(([k,sel])=>{const q=document.querySelector(`[data-perm="${sel}"]`);if(q)q.checked=!!p[k];});
        }
    }
    window.toggleEmployeePermissionsUI = () => { const ui=document.getElementById('permissionsUI'); if(ui) ui.style.display=document.getElementById('empRole')?.value==='Supervisor'?'block':'none'; };

    const originalSaveEmployee = window.saveEmployee;
    window.saveEmployee = async () => {
        if (!isAdmin()) return window.showAlert('إدارة الموظفين وتعديل الصلاحيات مخصصة للمدير فقط!','error');
        const nameVal=document.getElementById('empName')?.value.trim();
        const phoneVal=(document.getElementById('empPhone')?.value||'').replace(/\D/g,'');
        const emailVal=document.getElementById('empEmail')?.value.trim()||'';
        const passVal=document.getElementById('empPass')?.value.trim()||'';
        const roleVal=document.getElementById('empRole')?.value||'Admin';
        if(!nameVal) return window.showAlert('اسم الموظف مطلوب!','error');
        if(document.getElementById('empPhone')) document.getElementById('empPhone').value=phoneVal;
        const permissions = roleVal==='Supervisor' ? collectPermissions() : null;
        if (window.editingEmpId) { /* compatibility only; real variable is module scoped below */ }
        if (typeof editingEmpId !== 'undefined' && editingEmpId) {
            return update(ref(db,`employees/${editingEmpId}`),{name:nameVal,phone:phoneVal,email:emailVal,password:passVal,role:roleVal,permissions}).then(()=>{closeModal('employeeModal');showAlert('تم تعديل الموظف والصلاحيات بنجاح!','success');logAction('تعديل موظف',`تعديل حساب: ${nameVal} وتحديث الصلاحيات`);});
        }
        if(!emailVal || !passVal) return window.showAlert('البريد الإلكتروني وكلمة المرور مطلوبين لإنشاء الحساب!','error');
        try{
            const secondaryApp=initializeApp(firebaseConfig,'SecondaryAppInstanceV2');
            const secondaryAuth=getAuth(secondaryApp);
            const cred=await createUserWithEmailAndPassword(secondaryAuth,emailVal,passVal);
            const uid=cred.user.uid; await signOut(secondaryAuth);
            await set(ref(db,`employees/${uid}`),{name:nameVal,phone:phoneVal,email:emailVal,password:passVal,role:roleVal,permissions,isActive:true,createdAt:Date.now()});
            closeModal('employeeModal'); showAlert('تم إضافة الموظف والصلاحيات بنجاح!','success'); logAction('إضافة موظف',`إنشاء حساب: ${nameVal}`);
        }catch(e){ console.error(e); showAlert(e.code==='auth/email-already-in-use'?'البريد الإلكتروني مستخدم بالفعل!':(e.code==='auth/weak-password'?'كلمة المرور ضعيفة جداً!':'حدث خطأ أثناء إنشاء الحساب'),'error'); }
    };

    const originalEditEmployee = window.editEmployee;
    window.editEmployee = (id) => {
        if(!guard('employees','edit','ليس لديك صلاحية تعديل الموظفين!')) return;
        const e=allEmployees.find(x=>x.id===id); if(!e) return;
        editingEmpId=id;
        document.getElementById('empName').value=e.name||'';
        document.getElementById('empPhone').value=String(e.phone||'').replace(/\D/g,'');
        document.getElementById('empEmail').value=e.email||''; document.getElementById('empPass').value=e.password||'';
        document.getElementById('empRole').value=e.role||'Admin'; fillPermissions(e.permissions); toggleEmployeePermissionsUI();
        document.getElementById('employeeModal').style.display='flex';
    };
    window.openEmployeeModal = () => { if(!guard('employees','add','ليس لديك صلاحية إضافة موظفين!')) return; editingEmpId=null; ['empName','empPhone','empEmail','empPass'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';}); document.getElementById('empRole').value='Admin'; fillPermissions(null); toggleEmployeePermissionsUI(); document.getElementById('employeeModal').style.display='flex'; };
    const oldDeleteEmployee=window.deleteEmployee;
    window.deleteEmployee=(id,name)=>{ if(!guard('employees','delete','ليس لديك صلاحية حذف الموظفين!'))return; window.showConfirm(`حذف بيانات الموظف ${name} نهائياً؟`,()=>remove(ref(db,`employees/${id}`)).then(()=>logAction('حذف موظف',`حذف حساب: ${name}`))); };

    // --- numeric/alphanumeric restrictions ---
    function sanitizeInputs(){
        const invoice=document.getElementById('purInvoiceNo'); if(invoice) invoice.addEventListener('input',()=>invoice.value=invoice.value.replace(/\D/g,''));
        const voucher=document.getElementById('voucherCode'); if(voucher) voucher.addEventListener('input',()=>voucher.value=voucher.value.replace(/[^A-Za-z0-9]/g,'').toUpperCase());
        const phone=document.getElementById('empPhone'); if(phone) phone.addEventListener('input',()=>phone.value=phone.value.replace(/\D/g,''));
        const manual=document.getElementById('manualScanOrderInput'); if(manual) manual.addEventListener('input',()=>manual.value=manual.value.replace(/\D/g,''));
    }
    sanitizeInputs();

    // --- analytics real status cards ---
    function updateStatusSummary(){
        const counts={delivered:0,shipped:0,processing:0,pending:0};
        (allOrders||[]).forEach(o=>{ if(o.status==='تم تسليمه')counts.delivered++; else if(o.status==='تم الشحن')counts.shipped++; else if(o.status==='جاري التجهيز')counts.processing++; else if(o.status==='قيد المراجعة')counts.pending++; });
        ['Delivered','Shipped','Processing','Pending'].forEach(k=>{const el=document.getElementById(`stat${k}Orders`);if(el)el.innerText=counts[k.toLowerCase()];});
        const p2=document.getElementById('statPendingOrders2'); if(p2)p2.innerText=counts.pending;
    }
    const oldUpdateChartsData=window.updateChartsData;
    window.updateChartsData=function(){ if(typeof oldUpdateChartsData==='function') oldUpdateChartsData(); updateStatusSummary(); };

    // --- order status bug + permission enforcement ---
    const oldRenderOrders=window.renderOrdersTable;
    window.renderOrdersTable=function(){
        if(!modulePerm('orders','view')) return;
        if(typeof oldRenderOrders==='function') oldRenderOrders();
        // Hide details buttons when disallowed.
        if(!modulePerm('orders','details')) document.querySelectorAll('#ordersTableBody .btn-view').forEach(b=>b.style.display='none');
        if(!modulePerm('orders','changeStatus')) document.querySelectorAll('#ordersTableBody .status-select').forEach(s=>s.disabled=true);
    };
    const oldUpdateOrderStatus=window.updateOrderStatus;
    window.updateOrderStatus=async (orderId,selectElement,displayId,oldStatus)=>{
        if(!guard('orders','changeStatus','ليس لديك صلاحية لتغيير حالة الطلب!')){selectElement.value=oldStatus;return;}
        const newStatus=selectElement.value; const updates={status:newStatus}; const now=Date.now();
        if(newStatus==='جاري التجهيز')updates.processedAt=now;
        if(newStatus==='تم الشحن')updates.shippedAt=now;
        if(newStatus==='تم تسليمه')updates.deliveredAt=now;
        try{
            await update(ref(db,`orders/${orderId}`),updates);
            const filter=document.getElementById('filterOrderStatus'); if(filter && filter.value===oldStatus) filter.value='';
            logAction('تحديث حالة طلب',`تغيير حالة الطلب #${displayId} لـ ${newStatus}`); showAlert('تم تحديث الحالة بنجاح','success');
            setTimeout(()=>renderOrdersTable(),50);
        }catch(e){console.error(e);selectElement.value=oldStatus;showAlert('تعذر تحديث حالة الطلب','error');}
    };
    const oldViewOrderDetails=window.viewOrderDetails;
    window.viewOrderDetails=(id)=>{ if(!guard('orders','details','ليس لديك صلاحية عرض تفاصيل الطلب!'))return; return oldViewOrderDetails(id); };

    // --- scanner: global-style beep + manual code ---
    let lastV2Scan=0;
    function scannerBeep(){
        try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;const ctx=new AC();const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='square';osc.frequency.setValueAtTime(880,ctx.currentTime);osc.frequency.exponentialRampToValueAtTime(1320,ctx.currentTime+0.06);gain.gain.setValueAtTime(0.18,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.14);osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+0.14);}catch(e){}}
    function processScannedOrder(code){
        code=String(code||'').trim(); if(!code)return;
        const now=Date.now(); if(now-lastV2Scan<900)return; lastV2Scan=now; scannerBeep();
        let order=allOrders.find(o=>String(o.displayId||'')===code||String(o.orderId||'')===code||String(o.secretCode||'')===code);
        if(!order)return showAlert('لم يتم العثور على الطلب!','error');
        if(!modulePerm('orders','changeStatus')) return showAlert('ليس لديك صلاحية تأكيد الشحن!','error');
        if(['تم الشحن','تم تسليمه','ملغي','مرتجع'].includes(order.status))return showAlert(`الطلب حالته الحالية: ${order.status}`,'warning');
        update(ref(db,`orders/${order.dbId}`),{status:'تم الشحن',shippedAt:Date.now()}).then(()=>{showAlert('تم تحويل الطلب إلى تم الشحن!','success');logAction('سكانر شحن',`تأكيد شحن الطلب #${order.displayId} عبر السكانر`);});
    }
    window.manualScanOrder=()=>processScannedOrder(document.getElementById('manualScanOrderInput')?.value);
    window.openScannerModal=()=>{
        if(!guard('orders','changeStatus','ليس لديك صلاحية استخدام سكانر الشحن!'))return;
        document.getElementById('scannerModal').style.display='flex';
        const input=document.getElementById('manualScanOrderInput'); if(input){input.value='';setTimeout(()=>input.focus(),200);}
        if(typeof Html5Qrcode==='undefined')return showAlert('مكتبة السكانر غير متاحة!','error');
        try{html5QrcodeScanner=new Html5Qrcode('qr-reader');html5QrcodeScanner.start({facingMode:'environment'},{fps:10,qrbox:{width:350,height:150}},decodedText=>processScannedOrder(decodedText),()=>{}).catch(e=>showAlert('لم نتمكن من الوصول للكاميرا!','error'));}catch(e){console.error(e);}
    };

    // --- exact-looking waybill bulk printing based on the order-details template ---
    window.bulkPrintWaybills=()=>{
        if(!guard('orders','details','ليس لديك صلاحية طباعة البوليصات!'))return;
        const orders=(allOrders||[]).filter(o=>o.status==='جاري التجهيز');
        if(!orders.length)return showAlert('لا توجد طلبات جاري التجهيز لطباعتها!','warning');
        const container=document.getElementById('bulkPrintContainer'); if(!container)return;
        container.innerHTML='';
        orders.forEach((o,idx)=>{
            oldViewOrderDetails(o.dbId);
            const source=document.querySelector('#waybillPrintArea .bosta-waybill');
            if(!source)return;
            const wrap=document.createElement('div'); wrap.style.cssText='page-break-after:always;width:100%;background:white;';
            const clone=source.cloneNode(true); clone.id=`bulk-waybill-${idx}`;
            const bc=clone.querySelector('#topBarcode'); if(bc){bc.id=`bulk-bc-v2-${idx}`;}
            const qr=clone.querySelector('#qrCodeBox'); if(qr){qr.id=`bulk-qr-v2-${idx}`;qr.innerHTML='';}
            wrap.appendChild(clone); container.appendChild(wrap);
            if(typeof JsBarcode!=='undefined'&&bc) JsBarcode(`#bulk-bc-v2-${idx}`,o.displayId||o.orderId,{format:'CODE128',width:4,height:110,displayValue:true,fontSize:24,margin:0});
            if(typeof QRCode!=='undefined'&&qr) new QRCode(qr,{text:`https://mody3mr.github.io/modytech/?order=${o.displayId||o.orderId}`,width:140,height:140});
        });
        closeModal('orderDetailsModal'); window.printNode(container);
    };

    // --- sales report: discount total, per-product discount, export metadata ---
    let reportMeta={label:'اليوم',start:0,end:0,totalDiscount:0};
    function calcReportRange(type,el){
        const now=new Date();let start,end,label;
        if(type==='today'){start=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime();end=Date.now();label=`اليوم ${reportDate(start)}`;}
        else if(type==='week'){start=Date.now()-7*86400000;end=Date.now();label='آخر 7 أيام';}
        else if(type==='month'){start=new Date(now.getFullYear(),now.getMonth(),1).getTime();end=Date.now();label=`هذا الشهر - ${now.toLocaleDateString('ar-EG',{month:'long',year:'numeric'})}`;}
        else if(type==='specific'){if(!el?.value)return null;const d=new Date(el.value);start=new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime();end=start+86400000-1;label=`اليوم المحدد ${d.toLocaleDateString('ar-EG')}`;}
        else{start=0;end=Date.now();label='كل الأوقات';}
        return {start,end,label};
    }
    window.generateReport=(type,el)=>{
        const range=calcReportRange(type,el);if(!range)return;
        document.querySelectorAll('.report-filters button').forEach(b=>b.classList.remove('active'));if(el?.tagName==='BUTTON')el.classList.add('active');
        if(type!=='specific'&&document.getElementById('reportSpecificDate'))document.getElementById('reportSpecificDate').value='';
        let total=0,totalDiscount=0;const paymentStats={'كاش':0,'محفظة':0,'إنستا':0,'فيزا':0};const sales={};
        (allOrders||[]).forEach(order=>{
            if(['ملغي','مرتجع'].includes(order.status)||n(order.createdAt)<range.start||n(order.createdAt)>range.end)return;
            total+=n(order.total);totalDiscount+=n(order.discount);
            const pm=order.paymentMethod||'';if(pm.includes('محفظة'))paymentStats['محفظة']+=n(order.total);else if(pm.includes('إنستا'))paymentStats['إنستا']+=n(order.total);else if(pm.includes('فيزا'))paymentStats['فيزا']+=n(order.total);else paymentStats['كاش']+=n(order.total);
            const subtotal=(order.items||[]).reduce((s,i)=>s+n(i.qty)*n(i.price),0)||1;
            (order.items||[]).forEach(item=>{
                const gross=n(item.qty)*n(item.price);const itemDisc=n(item.discountAmount??item.discount??0)||n(order.discount)*(gross/subtotal);
                if(!sales[item.name])sales[item.name]={name:item.name,qty:0,revenue:0,discount:0,img:productCatalog[item.name]||'https://via.placeholder.com/50'};
                sales[item.name].qty+=n(item.qty);sales[item.name].revenue+=gross;sales[item.name].discount+=itemDisc;
            });
        });
        currentReportProducts=Object.values(sales).sort((a,b)=>b.qty-a.qty);reportMeta={...range,totalDiscount};
        const totalEl=document.getElementById('reportTotalSales');if(totalEl)totalEl.innerText=money(total);
        const discEl=document.getElementById('reportTotalDiscount');if(discEl)discEl.innerText=money(totalDiscount);
        const pd=document.getElementById('reportPaymentBreakdown');if(pd)pd.innerHTML=Object.entries(paymentStats).map(([k,v])=>`<div class="payment-row"><span>${k}</span><span class="amount">${money(v)}</span></div>`).join('')+'<div style="font-size:11px;color:#94a3b8;text-align:center;margin-top:5px;">الصافي بعد الشحن والخصومات</div>';
        window.filterReportProducts();
    };
    window.filterReportProducts=()=>{const term=(document.getElementById('searchReportProducts')?.value||'').toLowerCase();const div=document.getElementById('reportTopProducts');if(!div)return;const arr=(currentReportProducts||[]).filter(p=>p.name.toLowerCase().includes(term));div.innerHTML=arr.length?arr.slice(0,30).map(p=>`<div class="top-product-item"><img src="${esc(p.img)}" class="top-product-img"><div class="top-product-details"><div class="top-product-title">${esc(p.name)}</div><div class="top-product-stats">تم بيع ${p.qty} قطعة — خصم ${money(p.discount)}</div></div><div class="top-product-revenue">${money(p.revenue-p.discount)}</div></div>`).join(''):'<div style="text-align:center;padding:20px;">لا توجد مبيعات.</div>';};
    window.exportReportToExcel=()=>{
        if(!guard('analytics','export','ليس لديك صلاحية إصدار تقارير الإحصائيات!')||typeof XLSX==='undefined')return;
        const rows=[{"نوع التقرير":reportMeta.label,"اليوم المختار":reportMeta.label,"تاريخ استخراج التقرير":new Date().toLocaleString('ar-EG'),"إجمالي الخصومات":Math.round(reportMeta.totalDiscount)}];
        (currentReportProducts||[]).forEach(p=>rows.push({"نوع التقرير":reportMeta.label,"اليوم المختار":reportMeta.label,"تاريخ استخراج التقرير":new Date().toLocaleString('ar-EG'),"اسم المنتج":p.name,"الكمية المباعة":p.qty,"خصومات المنتج":Math.round(p.discount),"إيراد قبل الخصم":Math.round(p.revenue),"إيراد بعد الخصم":Math.round(p.revenue-p.discount)}));
        const ws=XLSX.utils.json_to_sheet(rows),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Sales Report');XLSX.writeFile(wb,`Sales_Report_${Date.now()}.xlsx`);logAction('تصدير تقرير إحصائيات','تم تصدير تقرير المبيعات إلى Excel - '+reportMeta.label);
    };
    window.exportReportToPDF=()=>{
        if(!guard('analytics','export','ليس لديك صلاحية إصدار تقارير الإحصائيات!'))return;
        const root=document.getElementById('printRoot');if(!root)return;
        const rows=(currentReportProducts||[]).map(p=>`<tr><td>${esc(p.name)}</td><td>${p.qty}</td><td>${money(p.discount)}</td><td>${money(p.revenue)}</td><td>${money(p.revenue-p.discount)}</td></tr>`).join('');
        root.innerHTML=`<div class="print-report-v2" dir="rtl" style="font-family:Cairo;padding:20px;color:#111;background:#fff;"><h1 style="text-align:center;margin:0 0 8px;">ModyStore — تقرير المبيعات</h1><p style="text-align:center;">الفترة: ${esc(reportMeta.label)} | تاريخ استخراج التقرير: ${new Date().toLocaleString('ar-EG')}</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:20px 0;"><div style="border:1px solid #ddd;padding:15px;text-align:center;"><b>إجمالي الخصومات</b><div style="font-size:24px;">${money(reportMeta.totalDiscount)}</div></div><div style="border:1px solid #ddd;padding:15px;text-align:center;"><b>إجمالي المبيعات</b><div style="font-size:24px;">${document.getElementById('reportTotalSales')?.innerText||'0 ج.م'}</div></div></div><table style="width:100%;border-collapse:collapse;text-align:center;"><thead><tr><th style="border:1px solid #111;padding:8px;">المنتج</th><th style="border:1px solid #111;padding:8px;">الكمية</th><th style="border:1px solid #111;padding:8px;">الخصم</th><th style="border:1px solid #111;padding:8px;">قبل الخصم</th><th style="border:1px solid #111;padding:8px;">بعد الخصم</th></tr></thead><tbody>${rows}</tbody></table></div>`;
        document.body.classList.add('dashboard-printing');window.print();setTimeout(()=>{document.body.classList.remove('dashboard-printing');root.innerHTML='';},700);logAction('تصدير تقرير إحصائيات','تم تصدير تقرير المبيعات إلى PDF - '+reportMeta.label);
    };

    // --- finance separate totals, invoice no column, exports ---
    function financeFiltered(){
        const search=(document.getElementById('searchFinance')?.value||'').toLowerCase(),month=document.getElementById('filterFinanceMonth')?.value||'',date=document.getElementById('filterFinanceDate')?.value||'';
        return (allFinance||[]).filter(f=>{
            const text=((f.title||'')+' '+(f.supplier||'')+' '+(f.invoiceNo||'')).toLowerCase().includes(search);
            const d=new Date(f.timestamp);const mm=d.toISOString().slice(0,7),dd=d.toISOString().slice(0,10);
            return text && (!month||mm===month) && (!date||dd===date) && (currentFinanceTab==='all'||(currentFinanceTab==='purchases'&&f.type==='purchase')||(currentFinanceTab==='expenses'&&f.type==='expense'));
        });
    }
    const oldFinanceRender=window.renderFinanceTable;
    window.renderFinanceTable=()=>{
        const list=financeFiltered();const table=document.getElementById('financeTableBody');if(!table)return;table.innerHTML='';
        const purchases=(allFinance||[]).filter(f=>f.type==='purchase').reduce((s,f)=>s+n(f.amount),0),expenses=(allFinance||[]).filter(f=>f.type==='expense').reduce((s,f)=>s+n(f.amount),0);
        const a=document.getElementById('statTotalPurchases'),b=document.getElementById('statTotalExpenses');if(a)a.innerText=money(purchases);if(b)b.innerText=money(expenses);
        if(!modulePerm('finance','history')){table.innerHTML='<tr><td colspan="7" style="text-align:center;padding:25px;">لا تملك صلاحية عرض البيانات السابقة.</td></tr>';return;}
        list.forEach(f=>{table.innerHTML+=`<tr><td dir="ltr">${reportDate(f.timestamp)}</td><td>${f.type==='purchase'?'<span class="badge badge-active">مشتريات</span>':'<span class="badge badge-inactive">مصروف</span>'}</td><td>${esc(f.invoiceNo||'-')}</td><td><b>${esc(f.title||'-')}</b>${f.supplier?`<div class="meta-info">المورد: ${esc(f.supplier)}</div>`:''}</td><td style="font-weight:bold;">${money(f.amount)}</td><td>${esc(f.user||'-')}</td><td>${isAdmin()?`<button class="btn-action btn-delete" onclick="deleteFinance('${f.id}')"><i class="fas fa-trash"></i></button>`:''}</td></tr>`;});
    };
    window.openPurchaseModal=()=>{if(!guard('finance','purchase','ليس لديك صلاحية إدخال فاتورة مشتريات!'))return;purItems=[];document.getElementById('purSupplier').value='';document.getElementById('purInvoiceNo').value='';document.getElementById('purQty').value='1';document.getElementById('purCost').value='0';document.getElementById('purShipping').value='0';renderPurItems();const s=document.getElementById('purProductSelect');s.innerHTML='<option value="">اختر المنتج...</option>';allProducts.forEach(p=>s.innerHTML+=`<option value="${p.id}" data-name="${esc(p.name)}">${esc(p.name)}</option>`);document.getElementById('purchaseModal').style.display='flex';};
    window.openExpenseModal=()=>{if(!guard('finance','expense','ليس لديك صلاحية إدخال مصروفات!'))return;document.getElementById('expTitle').value='';document.getElementById('expAmount').value='';document.getElementById('expNotes').value='';document.getElementById('expenseModal').style.display='flex';};
    window.exportFinanceToExcel=()=>{if(!guard('finance','export','ليس لديك صلاحية تصدير المشتريات والمصروفات!')||typeof XLSX==='undefined')return;const rows=financeFiltered().map(f=>({'التاريخ':reportDate(f.timestamp),'النوع':f.type==='purchase'?'مشتريات':'مصروفات','البيان':f.title||'-','المورد':f.supplier||'-','رقم الفاتورة':f.invoiceNo||'-','القيمة':n(f.amount),'بواسطة':f.user||'-'}));if(!rows.length)return showAlert('لا توجد بيانات مطابقة للتاريخ المحدد','warning');const ws=XLSX.utils.json_to_sheet(rows),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Finance');XLSX.writeFile(wb,`Finance_${Date.now()}.xlsx`);logAction('تصدير المشتريات والمصروفات','تم تصدير Excel للفترة المحددة');};
    window.exportFinanceToPDF=()=>{if(!guard('finance','export','ليس لديك صلاحية تصدير المشتريات والمصروفات!'))return;const rows=financeFiltered().map(f=>`<tr><td>${reportDate(f.timestamp)}</td><td>${f.type==='purchase'?'مشتريات':'مصروفات'}</td><td>${esc(f.title||'-')}</td><td>${esc(f.supplier||'-')}</td><td>${esc(f.invoiceNo||'-')}</td><td>${money(f.amount)}</td><td>${esc(f.user||'-')}</td></tr>`).join('');if(!rows)return showAlert('لا توجد بيانات مطابقة للتاريخ المحدد','warning');const root=document.getElementById('printRoot');root.innerHTML=`<div dir="rtl" style="font-family:Cairo;padding:20px"><h1 style="text-align:center">تقرير المشتريات والمصروفات</h1><p>تاريخ استخراج التقرير: ${new Date().toLocaleString('ar-EG')}</p><table style="width:100%;border-collapse:collapse;text-align:center"><thead><tr>${['التاريخ','النوع','البيان','المورد','رقم الفاتورة','القيمة','بواسطة'].map(x=>`<th style="border:1px solid #111;padding:7px">${x}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;document.body.classList.add('dashboard-printing');window.print();setTimeout(()=>{document.body.classList.remove('dashboard-printing');root.innerHTML='';},700);logAction('تصدير المشتريات والمصروفات','تم تصدير PDF للفترة المحددة');};

    // --- returns archive + export + user column + robust order preview ---
    window.searchOrderForReturn=()=>{
        if(!guard('returns','create','ليس لديك صلاحية إنشاء طلب مرتجع!'))return;
        const term=(document.getElementById('returnSearchOrderInput')?.value||'').trim();if(!term)return showAlert('أدخل رقم الطلب للبحث','warning');
        const order=allOrders.find(o=>String(o.displayId||'')===term||String(o.orderId||'')===term||String(o.dbId||'')===term);
        if(!order)return showAlert('لم يتم العثور على طلب بهذا الرقم!','error');
        if(order.status==='مرتجع')return showAlert('هذا الطلب مسجل كمرتجع بالفعل!','warning');
        currentReturnOrderTemp=order;document.getElementById('retCustName').innerText=order.customer?.name||'-';document.getElementById('retCustPhone').innerText=order.customer?.phone||'-';
        const list=document.getElementById('retOrderItemsList');list.innerHTML=(order.items||[]).map((item,i)=>`<div style="display:flex;justify-content:space-between;margin-bottom:5px;font-size:14px;"><label><input type="checkbox" checked class="ret-item-cb" data-index="${i}"> ${item.qty}x ${esc(item.name)}</label><span>${money(n(item.qty)*n(item.price))}</span></div>`).join('');document.getElementById('returnOrderDetailsDiv').style.display='block';document.getElementById('btnConfirmReturn').style.display='block';
    };
    window.viewReturnDetails=(id)=>{if(!guard('returns','details','ليس لديك صلاحية عرض تفاصيل المرتجع!'))return;const r=allReturns.find(x=>x.id===id);if(!r)return;document.getElementById('viewReturnContent').innerHTML=`<div style="font-size:14px;line-height:1.9"><strong>رقم الطلب:</strong> #${esc(r.displayId||r.orderId||'-')}<br><strong>العميل:</strong> ${esc(r.customer?.name||'-')} - <span dir="ltr">${esc(r.customer?.phone||'-')}</span><br><strong>المنتجات:</strong><div style="background:#f8fafc;padding:10px;border-radius:6px">${(r.items||[]).map(i=>`${i.qty}x ${esc(i.name)}`).join('<br>')}</div><strong>القيمة:</strong> ${money(r.amount)}<br><strong>السبب:</strong> ${esc(r.reason||'-')}<br><strong>الحالة:</strong> ${esc(r.status||'-')}<br><strong>بواسطة:</strong> ${esc(r.user||'-')}<br><strong>التاريخ:</strong> ${reportDate(r.timestamp)}</div>`;document.getElementById('viewReturnModal').style.display='flex';};
    window.renderReturnsTable=()=>{const table=document.getElementById('returnsTableBody');if(!table)return;table.innerHTML='';if(!modulePerm('returns','view')){table.innerHTML='<tr><td colspan="7" style="text-align:center;padding:25px">لا تملك صلاحية عرض المرتجعات.</td></tr>';return;}const search=(document.getElementById('searchReturns')?.value||'').toLowerCase(),date=document.getElementById('filterReturnDate')?.value||'',status=document.getElementById('filterReturnStatus')?.value||'';const filtered=(allReturns||[]).filter(r=>{const text=String(r.displayId||r.orderId||'').toLowerCase().includes(search)||(r.customer?.phone||'').includes(search);const d=new Date(r.timestamp).toISOString().slice(0,10);return text&&(!date||d===date)&&(!status||r.status===status)&&((currentReturnsTab==='current'&&r.status!=='مؤرشف')||(currentReturnsTab==='archived'&&r.status==='مؤرشف'));});filtered.forEach(r=>table.innerHTML+=`<tr><td><b>#${esc(r.displayId||r.orderId||'-')}</b></td><td dir="ltr">${reportDate(r.timestamp)}</td><td>${esc(r.reason||'-')}</td><td style="font-weight:bold;color:var(--danger)">${money(r.amount)}</td><td><span class="badge ${r.status==='مؤرشف'?'badge-inactive':'badge-active'}">${esc(r.status||'-')}</span></td><td>${esc(r.user||'-')}</td><td><button class="btn-action btn-view" onclick="viewReturnDetails('${r.id}')"><i class="fas fa-eye"></i></button></td></tr>`);};
    window.archiveCurrentReturns=()=>{if(!guard('returns','archive','ليس لديك صلاحية أرشفة المرتجعات!'))return;const current=(allReturns||[]).filter(r=>r.status!=='مؤرشف');if(!current.length)return showAlert('لا توجد مرتجعات حالية للأرشفة','warning');showConfirm(`سيتم أرشفة ${current.length} مرتجع حالياً. هل أنت متأكد؟`,()=>{const updates={};current.forEach(r=>updates[`returns/${r.id}/status`]='مؤرشف');update(ref(db),updates).then(()=>{logAction('أرشفة المرتجعات',`تم أرشفة ${current.length} مرتجع`);showAlert('تمت أرشفة المرتجعات الحالية','success');});});};
    function returnFiltered(){const search=(document.getElementById('searchReturns')?.value||'').toLowerCase(),date=document.getElementById('filterReturnDate')?.value||'',status=document.getElementById('filterReturnStatus')?.value||'';return(allReturns||[]).filter(r=>{const text=String(r.displayId||r.orderId||'').toLowerCase().includes(search)||(r.customer?.phone||'').includes(search);const d=new Date(r.timestamp).toISOString().slice(0,10);return text&&(!date||d===date)&&(!status||r.status===status)&&((currentReturnsTab==='current'&&r.status!=='مؤرشف')||(currentReturnsTab==='archived'&&r.status==='مؤرشف'));});}
    window.exportReturnsToExcel=()=>{if(!guard('returns','export','ليس لديك صلاحية تصدير المرتجعات!')||typeof XLSX==='undefined')return;const rows=returnFiltered().map(r=>({'رقم الطلب':r.displayId||r.orderId||'-','تاريخ المرتجع':reportDate(r.timestamp),'سبب الاسترجاع':r.reason||'-','قيمة المرتجع':n(r.amount),'حالة المرتجع':r.status||'-','المستخدم':r.user||'-'}));if(!rows.length)return showAlert('لا توجد مرتجعات مطابقة','warning');const ws=XLSX.utils.json_to_sheet(rows),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Returns');XLSX.writeFile(wb,`Returns_${Date.now()}.xlsx`);logAction('تصدير المرتجعات','تم تصدير Excel للمرتجعات المحددة');};
    window.exportReturnsToPDF=()=>{if(!guard('returns','export','ليس لديك صلاحية تصدير المرتجعات!'))return;const rows=returnFiltered().map(r=>`<tr><td>${esc(r.displayId||r.orderId||'-')}</td><td>${reportDate(r.timestamp)}</td><td>${esc(r.reason||'-')}</td><td>${money(r.amount)}</td><td>${esc(r.status||'-')}</td><td>${esc(r.user||'-')}</td></tr>`).join('');if(!rows)return showAlert('لا توجد مرتجعات مطابقة','warning');const root=document.getElementById('printRoot');root.innerHTML=`<div dir="rtl" style="font-family:Cairo;padding:20px"><h1 style="text-align:center">تقرير المرتجعات</h1><p>تاريخ استخراج التقرير: ${new Date().toLocaleString('ar-EG')}</p><table style="width:100%;border-collapse:collapse;text-align:center"><thead><tr>${['رقم الطلب','تاريخ المرتجع','سبب الاسترجاع','قيمة المرتجع','حالة المرتجع','المستخدم'].map(x=>`<th style="border:1px solid #111;padding:7px">${x}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;document.body.classList.add('dashboard-printing');window.print();setTimeout(()=>{document.body.classList.remove('dashboard-printing');root.innerHTML='';},700);logAction('تصدير المرتجعات','تم تصدير PDF للمرتجعات المحددة');};

    // --- categories status toggle + logging ---
    window.toggleCategory=(id,status,name)=>{if(!guard('categories','toggle','ليس لديك صلاحية تفعيل/تعطيل الأقسام!'))return;update(ref(db,`categories/${id}`),{isActive:!status}).then(()=>logAction(!status?'تفعيل قسم':'تعطيل قسم',`تغيير حالة القسم ${name||id} إلى ${!status?'مفعل':'معطل'}`));};
    const originalFilterCategories=window.filterCategories;
    window.filterCategories=()=>{if(!modulePerm('categories','view'))return;const table=document.getElementById('categoriesTableBody');if(!table)return;const term=(document.getElementById('searchCategories')?.value||'').toLowerCase();table.innerHTML='';(allCategories||[]).filter(c=>(c.name||'').toLowerCase().includes(term)).forEach(c=>{const count=(allProducts||[]).filter(p=>p.category===c.name).length;table.innerHTML+=`<tr><td><b>${esc(c.name)}</b></td><td>${count}</td><td><span class="badge ${c.isActive?'badge-active':'badge-inactive'}">${c.isActive?'مفعل':'معطل'}</span></td><td><div class="actions">${modulePerm('categories','edit')?`<button class="btn-action btn-edit" onclick="editCategory('${c.id}','${esc(c.name)}')"><i class="fas fa-pen"></i></button>`:''}${modulePerm('categories','toggle')?`<button class="btn-action btn-hide" style="background:${c.isActive?'#64748b':'#22c55e'}" onclick="toggleCategory('${c.id}',${!!c.isActive},'${esc(c.name)}')"><i class="fas ${c.isActive?'fa-ban':'fa-check'}"></i></button>`:''}${modulePerm('categories','delete')?`<button class="btn-action btn-delete" onclick="deleteCategory('${c.id}','${esc(c.name)}')"><i class="fas fa-trash"></i></button>`:''}</div></td></tr>`;});};
    window.openCategoryModal=()=>{if(!guard('categories','add','ليس لديك صلاحية إضافة أقسام!'))return;editingCatId=null;document.getElementById('catNameInput').value='';document.getElementById('categoryModal').style.display='flex';};
    const oldSaveCategory=window.saveCategory; window.saveCategory=()=>{if(editingCatId&&!guard('categories','edit','ليس لديك صلاحية تعديل الأقسام!'))return;if(!editingCatId&&!guard('categories','add','ليس لديك صلاحية إضافة أقسام!'))return;return oldSaveCategory();};
    const oldEditCategory=window.editCategory;window.editCategory=(id,name)=>{if(!guard('categories','edit','ليس لديك صلاحية تعديل الأقسام!'))return;return oldEditCategory(id,name);};
    const oldDeleteCategory=window.deleteCategory;window.deleteCategory=(id,name)=>{if(!guard('categories','delete','ليس لديك صلاحية حذف الأقسام!'))return;return oldDeleteCategory(id,name);};

    // --- shipping logs ---
    const oldSaveShipping=window.saveShipping;window.saveShipping=()=>{const id=typeof editingShippingId!=='undefined'?editingShippingId:null;const name=document.getElementById('shipGovName')?.value.trim()||'';const price=document.getElementById('shipPrice')?.value||0;if(id&&!guard('shipping','edit','ليس لديك صلاحية تعديل أسعار الشحن!'))return;if(!id&&!guard('shipping','edit','ليس لديك صلاحية إضافة أسعار الشحن!'))return;return oldSaveShipping().then?.(()=>{});};
    window.toggleShipping=(id,status)=>{if(!guard('shipping','toggle','ليس لديك صلاحية تفعيل/تعطيل أسعار الشحن!'))return;const item=(allShipping||[]).find(s=>String(s.id)===String(id));const name=item?.name||'غير معروف';const price=Number(item?.price||0);const next=!status;update(ref(db,`shipping/${id}`),{isActive:next}).then(()=>logAction(next?'تفعيل سعر شحن':'تعطيل سعر شحن',`${next?'تفعيل':'تعطيل'} سعر الشحن: ${name} — ${price} ج.م`));};
    window.deleteShipping=(id)=>{if(!guard('shipping','delete','ليس لديك صلاحية حذف أسعار الشحن!'))return;const item=(allShipping||[]).find(s=>String(s.id)===String(id));const name=item?.name||'غير معروف';const price=Number(item?.price||0);showConfirm('هل أنت متأكد من حذف سعر الشحن؟',()=>remove(ref(db,`shipping/${id}`)).then(()=>logAction('حذف سعر شحن',`حذف سعر الشحن: ${name} — ${price} ج.م`)));};
    window.editShipping=(id,name,price)=>{if(!guard('shipping','edit','ليس لديك صلاحية تعديل أسعار الشحن!'))return;editingShippingId=id;document.getElementById('shipModalTitle').innerText='تعديل المحافظة';document.getElementById('shipGovName').value=name;document.getElementById('shipPrice').value=price;document.getElementById('shippingModal').style.display='flex';};

    // --- vouchers: robust preview, discount amount, manual-disable status ---
    window.showVoucherUsers=(id)=>{if(!guard('vouchers','users','ليس لديك صلاحية رؤية مستخدمي الكوبون!'))return;const v=allVouchers.find(x=>x.id===id);if(!v)return;const list=document.getElementById('vuList');list.innerHTML='';const users=Array.isArray(v.usedBy)?v.usedBy:Object.values(v.usedBy||{});if(!users.length){list.innerHTML='<div style="text-align:center;padding:20px;color:#666">لم يستخدمه أحد بعد.</div>';}else users.forEach(u=>{const key=String(u.orderDbId||u.dbId||u.orderId||u.displayId||'');const order=allOrders.find(o=>String(o.dbId)===key||String(o.orderId)===key||String(o.displayId)===key);const disc=n(u.discountAmount??u.discount??order?.discount??0);list.innerHTML+=`<div style="padding:15px;border-bottom:1px solid #eee"><b>${esc(u.name||order?.customer?.name||'-')}</b><br><span dir="ltr">${esc(u.phone||order?.customer?.phone||'-')}</span><br><span style="color:#b45309;font-weight:bold">قيمة الخصم: ${money(disc)}</span><br><span style="font-size:12px;color:#64748b">رقم الطلب: #${esc(order?.displayId||u.displayId||u.orderId||'-')}</span><br>${order?`<button onclick="closeModal('voucherUsersModal'); viewOrderDetails('${order.dbId}')" style="margin-top:8px;background:var(--secondary);color:white;border:none;padding:5px 10px;border-radius:4px;cursor:pointer;font-size:12px"><i class="fas fa-file-invoice"></i> معاينة الطلب</button>`:'<span style="font-size:12px;color:#ef4444">الطلب المرتبط غير موجود حالياً</span>'}</div>`;});document.getElementById('voucherUsersModal').style.display='flex';};
    window.filterVouchers=()=>{if(!modulePerm('vouchers','view'))return;const table=document.getElementById('vouchersTableBody');if(!table)return;const term=(document.getElementById('searchVouchers')?.value||'').toLowerCase();table.innerHTML='';(allVouchers||[]).filter(v=>(v.code||'').toLowerCase().includes(term)&& (currentVoucherTab==='active'?v.isActive:!v.isActive)).forEach(v=>{const used=Array.isArray(v.usedBy)?v.usedBy.length:Object.keys(v.usedBy||{}).length;const autoExpired=v.usageLimit&&used>=v.usageLimit;const status=v.isActive?'مفعل':'معطل';table.innerHTML+=`<tr><td><b>${esc(v.code)}</b></td><td>${v.value} ${v.type==='percentage'?'%':'ج.م'}</td><td><button class="btn-action btn-users" title="${used} استخدام" onclick="showVoucherUsers('${v.id}')"><i class="fas fa-users"></i></button><span style="margin-right:8px">${used}/${v.usageLimit||'-'}</span></td><td><span class="badge ${v.isActive?'badge-active':'badge-inactive'}">${autoExpired&&!v.isActive?'منتهي':' '+status}</span></td><td><div class="actions">${modulePerm('vouchers','edit')?`<button class="btn-action btn-edit" onclick="editVoucher('${v.id}')"><i class="fas fa-pen"></i></button>`:''}${modulePerm('vouchers','toggle')?`<button class="btn-action btn-hide" style="background:${v.isActive?'#64748b':'#22c55e'}" onclick="toggleVoucher('${v.id}',${!!v.isActive},'${esc(v.code)}')"><i class="fas ${v.isActive?'fa-ban':'fa-check'}"></i></button>`:''}${modulePerm('vouchers','delete')?`<button class="btn-action btn-delete" onclick="deleteVoucher('${v.id}','${esc(v.code)}')"><i class="fas fa-trash"></i></button>`:''}</div></td></tr>`;});};

    // --- inventory ---
    let inventoryMovements=[];
    onValue(ref(db,'inventoryMovements'),snap=>{inventoryMovements=[];if(snap.exists())snap.forEach(c=>inventoryMovements.push({id:c.key,...c.val()}));inventoryMovements.sort((a,b)=>n(a.timestamp)-n(b.timestamp));renderInventoryTable();});
    function inventoryBeforeAfter(p){const moves=inventoryMovements.filter(m=>m.productId===p.id).sort((a,b)=>n(b.timestamp)-n(a.timestamp));const last=moves[0];return {before:last?last.before:p.stock||0,after:last?last.after:p.stock||0};}
    window.renderInventoryTable=()=>{if(!modulePerm('inventory','view'))return;const table=document.getElementById('inventoryTableBody');if(!table)return;const term=(document.getElementById('searchInventory')?.value||'').toLowerCase(),filter=document.getElementById('inventoryStockFilter')?.value||'';let units=0,short=0;const list=(allProducts||[]).filter(p=>p.isActive!==false).filter(p=>(p.name||'').toLowerCase().includes(term)).filter(p=>filter==='low'?(n(p.stock)<=5):filter==='out'?(n(p.stock)<=0):true);(allProducts||[]).forEach(p=>{if(p.isActive!==false){units+=n(p.stock);if(n(p.stock)<=5)short++;}});const c=document.getElementById('inventoryProductsCount'),s=document.getElementById('inventoryShortageCount'),u=document.getElementById('inventoryUnitsCount');if(c)c.innerText=(allProducts||[]).filter(p=>p.isActive!==false).length;if(s)s.innerText=short;if(u)u.innerText=units;table.innerHTML=list.map(p=>{const ba=inventoryBeforeAfter(p);return `<tr><td><b>${esc(p.name)}</b></td><td>${n(ba.before)}</td><td>${n(ba.after)}</td><td style="font-weight:900;color:${n(p.stock)<=5?'var(--danger)':'var(--success)'}">${n(p.stock)}</td><td>5</td><td><span class="badge ${n(p.stock)<=5?'badge-inactive':'badge-active'}">${n(p.stock)<=0?'نفد':n(p.stock)<=5?'ناقص':'متوفر'}</span></td></tr>`;}).join('');};
    window.exportInventoryShortages=()=>{if(!guard('inventory','export','ليس لديك صلاحية تصدير نواقص المخزون!')||typeof XLSX==='undefined')return;const rows=(allProducts||[]).filter(p=>p.isActive!==false&&n(p.stock)<=5).map(p=>({'اسم المنتج':p.name,'المخزون الحالي':n(p.stock),'الحد الأدنى':5,'الكمية المطلوبة':Math.max(0,5-n(p.stock)),'تاريخ استخراج التقرير':new Date().toLocaleString('ar-EG')}));if(!rows.length)return showAlert('لا توجد نواقص حالياً','success');const ws=XLSX.utils.json_to_sheet(rows),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Shortages');XLSX.writeFile(wb,`Inventory_Shortages_${Date.now()}.xlsx`);logAction('تصدير نواقص المخزون','تم استخراج شيت Excel بالنواقص');};
    window.exportInventoryShortagesPDF=()=>{if(!guard('inventory','export','ليس لديك صلاحية تصدير نواقص المخزون!'))return;const rows=(allProducts||[]).filter(p=>p.isActive!==false&&n(p.stock)<=5).map(p=>`<tr><td>${esc(p.name)}</td><td>${n(p.stock)}</td><td>5</td><td>${Math.max(0,5-n(p.stock))}</td></tr>`).join('');const root=document.getElementById('printRoot');root.innerHTML=`<div dir="rtl" style="font-family:Cairo;padding:20px"><h1 style="text-align:center">تقرير نواقص المخزون</h1><p>تاريخ استخراج التقرير: ${new Date().toLocaleString('ar-EG')}</p><table style="width:100%;border-collapse:collapse;text-align:center"><thead><tr>${['اسم المنتج','المخزون الحالي','الحد الأدنى','الكمية المطلوبة'].map(x=>`<th style="border:1px solid #111;padding:8px">${x}</th>`).join('')}</tr></thead><tbody>${rows||'<tr><td colspan="4">لا توجد نواقص</td></tr>'}</tbody></table></div>`;document.body.classList.add('dashboard-printing');window.print();setTimeout(()=>{document.body.classList.remove('dashboard-printing');root.innerHTML='';},700);logAction('تصدير نواقص المخزون','تم استخراج PDF بالنواقص');};
    function recordInventory(productId,productName,before,after,reason,extra={}){return push(ref(db,'inventoryMovements'),cleanData({productId,productName,before:n(before),after:n(after),reason,user:currentUser||'مدير',timestamp:Date.now(),...extra}));}
    window.recordInventoryMovement=recordInventory;

    // Record purchases/returns/cancellations by wrapping updates where possible.
    const originalSavePurchase=window.savePurchaseInvoice;
    window.savePurchaseInvoice=async()=>{
        if(!guard('finance','purchase','ليس لديك صلاحية إدخال فاتورة مشتريات!'))return;
        const beforeMap={};for(const item of purItems){const snap=await get(ref(db,`products/${item.id}`));beforeMap[item.id]=snap.exists()?n(snap.val().stock):0;}
        try{await originalSavePurchase();for(const item of purItems){const before=beforeMap[item.id]??0;recordInventory(item.id,item.name,before,before+n(item.qty),'شراء', {invoiceNo:document.getElementById('purInvoiceNo')?.value||''});}}catch(e){console.error(e);}
    };

    // --- logs: PDF + permissions ---
    const oldExportLogs=window.exportLogsToExcel;window.exportLogsToExcel=()=>{if(!guard('logs','export','ليس لديك صلاحية تصدير سجل النشاطات!'))return;return oldExportLogs();};
    const oldArchiveLogsAll=window.archiveLogsAll;window.archiveLogsAll=()=>{if(!guard('logs','archive','ليس لديك صلاحية أرشفة سجل النشاطات!'))return;return oldArchiveLogsAll();};
    window.exportLogsToPDF=()=>{if(!guard('logs','export','ليس لديك صلاحية تصدير سجل النشاطات!'))return;const dataset=currentLogTab==='current'?allLogs:allArchivedLogs;const root=document.getElementById('printRoot');root.innerHTML=`<div dir="rtl" style="font-family:Cairo;padding:20px"><h1 style="text-align:center">سجل النشاطات</h1><p>تاريخ استخراج التقرير: ${new Date().toLocaleString('ar-EG')}</p><table style="width:100%;border-collapse:collapse;text-align:center"><thead><tr>${['الحدث','التفاصيل','بواسطة','الوقت'].map(x=>`<th style="border:1px solid #111;padding:7px">${x}</th>`).join('')}</tr></thead><tbody>${dataset.map(l=>`<tr><td style="border:1px solid #111;padding:6px">${esc(l.action)}</td><td style="border:1px solid #111;padding:6px">${esc(l.details)}</td><td style="border:1px solid #111;padding:6px">${esc(l.user)}</td><td style="border:1px solid #111;padding:6px">${esc(formatDateTime(l.timestamp))}</td></tr>`).join('')}</tbody></table></div>`;document.body.classList.add('dashboard-printing');window.print();setTimeout(()=>{document.body.classList.remove('dashboard-printing');root.innerHTML='';},700);logAction('تصدير سجل','تم تصدير سجل النشاطات إلى PDF');};

    // --- settings: all saves already log; make accidental non-admin access impossible ---
    document.querySelector('[data-target="settings-view"]')?.addEventListener('click',e=>{if(!isAdmin()){e.stopImmediatePropagation();showAlert('الإعدادات متاحة للمدير فقط!','error');}} ,true);

    // --- apply UI permissions after auth/data is available ---
    window.applyDashboardPermissions=()=>{
        // لا تطبق أي صلاحيات أثناء مرحلة تحميل/تحقق Firebase.
        // هذه كانت سبب اختفاء الداشبورد بعد حوالي 1.2 ثانية.
        if (!window.__dashboardAuthReady && !isAdmin()) return;
        if(isAdmin()) return;
        MODULES.forEach(m=>{
            const tab=TAB_BY_MODULE[m];const nav=document.querySelector(`[data-target="${tab}"]`);const view=document.getElementById(tab);const allowed=modulePerm(m,'view');
            if(nav)nav.style.display=allowed?'flex':'none'; if(view&&!allowed)view.classList.remove('active');
        });
        const settingsNav=document.querySelector('[data-target="settings-view"]');if(settingsNav)settingsNav.style.display='none';
        if(!modulePerm('analytics','view')){const av=document.getElementById('analytics-view');if(av)av.classList.remove('active');const first=MODULES.find(m=>modulePerm(m,'view'));if(first){document.getElementById(TAB_BY_MODULE[first])?.classList.add('active');document.querySelector(`[data-target="${TAB_BY_MODULE[first]}"]`)?.classList.add('active');}}
        if(!modulePerm('analytics','export'))document.querySelectorAll('#analytics-view [onclick*="exportReport"]').forEach(b=>b.style.display='none');
        if(!modulePerm('finance','purchase'))document.querySelector('[onclick="openPurchaseModal()"]')?.style.setProperty('display','none');
        if(!modulePerm('finance','expense'))document.querySelector('[onclick="openExpenseModal()"]')?.style.setProperty('display','none');
        if(!modulePerm('finance','export'))document.querySelectorAll('#finance-view [onclick*="exportFinanceTo"]').forEach(b=>b.style.display='none');
        if(!modulePerm('returns','create'))document.querySelector('[onclick="openNewReturnModal()"]')?.style.setProperty('display','none');
        if(!modulePerm('returns','archive'))document.querySelector('[onclick="archiveCurrentReturns()"]')?.style.setProperty('display','none');
        if(!modulePerm('returns','export'))document.querySelectorAll('#returns-view [onclick*="exportReturnsTo"]').forEach(b=>b.style.display='none');
        if(!modulePerm('logs','export'))document.querySelectorAll('#logs-view [onclick*="exportLogsTo"]').forEach(b=>b.style.display='none');
        if(!modulePerm('logs','archive'))document.querySelector('[onclick="archiveLogsAll()"]')?.style.setProperty('display','none');
        if(!modulePerm('inventory','export'))document.querySelectorAll('#inventory-view [onclick*="exportInventoryShortages"]').forEach(b=>b.style.display='none');
    };
    setTimeout(()=>{sanitizeInputs();if(window.__dashboardAuthReady)window.applyDashboardPermissions();updateStatusSummary();if(window.__dashboardAuthReady)renderInventoryTable();},1200);
})();

// V2 corrective overrides (permissions, finance/shipping logs, inventory movements)
(() => {
    const esc2 = (v='') => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const num2 = v => Number(v||0);
    const money2 = v => `${Math.round(num2(v))} ج.م`;

    // Product permissions: view/add/edit/toggle/delete independently.
    const oldFilterProductsV2 = window.filterProducts;
    window.filterProducts = () => {
        if (!window.hasDashboardPermission('products','view')) return;
        const table=document.getElementById('productsTableBody'); if(!table)return;
        const term=(document.getElementById('searchProducts')?.value||'').toLowerCase();
        const cat=(document.getElementById('filterProductCat')?.value||'');
        const offers=!!document.getElementById('filterProductOffers')?.checked;
        let list=(allProducts||[]).filter(p=>(p.name||'').toLowerCase().includes(term)&&(!cat||p.category===cat)&&(!offers||!!p.discountPrice));
        if(currentProductTab==='active')list=list.filter(p=>p.isActive);else if(currentProductTab==='inactive')list=list.filter(p=>!p.isActive);else if(currentProductTab==='lowstock')list=list.filter(p=>num2(p.stock)<=5);
        table.innerHTML=list.map(p=>{
            const price=p.discountPrice?`<del style="color:#94a3b8">${p.price}</del> <span style="color:var(--accent);font-weight:bold">${p.discountPrice} ج.م</span>`:`${p.price} ج.م`;
            const stock=num2(p.stock)<=5?`<span style="color:var(--danger);font-weight:bold">${num2(p.stock)} (نواقص)</span>`:num2(p.stock);
            return `<tr><td><div class="product-info"><img src="${esc2(p.imageUrl||'https://via.placeholder.com/300')}" class="product-img"><span>${esc2(p.name)}</span></div></td><td>${price}</td><td style="font-weight:bold">${stock}</td><td>${esc2(p.category||'-')}</td><td><span class="badge ${p.isActive?'badge-active':'badge-inactive'}">${p.isActive?'معروض':'مخفي'}</span></td><td><div class="actions">${window.hasDashboardPermission('products','edit')?`<button class="btn-action btn-edit" onclick="editProduct('${p.id}')"><i class="fas fa-pen"></i></button>`:''}${window.hasDashboardPermission('products','toggle')?`<button class="btn-action btn-hide" style="background:${p.isActive?'#64748b':'#22c55e'}" onclick="toggleProduct('${p.id}',${!!p.isActive},'${esc2(p.name)}')"><i class="fas ${p.isActive?'fa-eye-slash':'fa-eye'}"></i></button>`:''}${window.hasDashboardPermission('products','delete')?`<button class="btn-action btn-delete" onclick="deleteProduct('${p.id}','${esc2(p.name)}')"><i class="fas fa-trash"></i></button>`:''}</div></td></tr>`;
        }).join('');
        setTimeout(()=>{if(typeof window.renderInventoryTable==='function')window.renderInventoryTable();},0);
    };
    window.openProductModal=()=>{
        if(!window.hasDashboardPermission('products','add'))return window.showAlert('ليس لديك صلاحية إضافة منتجات!','error');
        editingProductId=null;document.getElementById('productModalTitle').innerText='إضافة منتج جديد';
        ['prodName','prodPrice','prodDiscountPrice','prodOfferDays','prodDesc','prodImage','prodAddStockOnly'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
        document.getElementById('prodStock').value='10';document.getElementById('stockOnlyAlert').style.display='none';document.getElementById('addStockDiv').style.display='none';
        ['prodName','prodPrice','prodStock','prodCategory'].forEach(id=>{const e=document.getElementById(id);if(e)e.disabled=false;});
        document.getElementById('productModal').style.display='flex';
    };
    const oldSaveProductV2 = window.saveProduct;
    window.saveProduct = () => {
        if(editingProductId){ if(!window.hasDashboardPermission('products','edit') && !window.hasDashboardPermission('inventory','adjust'))return window.showAlert('ليس لديك صلاحية تعديل المنتج أو المخزون!','error'); }
        else if(!window.hasDashboardPermission('products','add'))return window.showAlert('ليس لديك صلاحية إضافة منتجات!','error');
        return oldSaveProductV2();
    };
    const oldEditProductV2=window.editProduct;
    window.editProduct=(id)=>{if(!window.hasDashboardPermission('products','edit')&&!window.hasDashboardPermission('inventory','adjust'))return window.showAlert('ليس لديك صلاحية تعديل المنتج!','error');return oldEditProductV2(id);};
    window.toggleProduct=(id,status,name)=>{if(!window.hasDashboardPermission('products','toggle'))return window.showAlert('ليس لديك صلاحية تعطيل/تفعيل المنتجات!','error');update(ref(db,`products/${id}`),{isActive:!status}).then(()=>{logAction(status?'تعطيل منتج':'تفعيل منتج',`تغيير حالة المنتج ${name} إلى ${!status?'مفعل':'معطل'}`);});};
    window.deleteProduct=(id,name)=>{if(!window.hasDashboardPermission('products','delete'))return window.showAlert('ليس لديك صلاحية حذف المنتجات!','error');showConfirm('هل تريد حذف هذا المنتج نهائياً؟',()=>remove(ref(db,`products/${id}`)).then(()=>logAction('حذف منتج',`تم حذف المنتج: ${name}`)));};

    // Vouchers: separate add/edit/toggle/delete/users + correct status wording.
    const oldOpenVoucherV2=window.openVoucherModal;
    window.openVoucherModal=()=>{if(!window.hasDashboardPermission('vouchers','add'))return window.showAlert('ليس لديك صلاحية إنشاء كوبونات!','error');return oldOpenVoucherV2();};
    const oldEditVoucherV2=window.editVoucher;window.editVoucher=(id)=>{if(!window.hasDashboardPermission('vouchers','edit'))return window.showAlert('ليس لديك صلاحية تعديل الكوبونات!','error');return oldEditVoucherV2(id);};
    window.toggleVoucher=(id,status,code)=>{if(!window.hasDashboardPermission('vouchers','toggle'))return window.showAlert('ليس لديك صلاحية تفعيل/تعطيل الكوبونات!','error');update(ref(db,`vouchers/${id}`),{isActive:!status}).then(()=>logAction(status?'تعطيل كوبون':'تفعيل كوبون',`تغيير حالة الكود ${code} إلى ${!status?'مفعل':'معطل'}`));};
    window.deleteVoucher=(id,code)=>{if(!window.hasDashboardPermission('vouchers','delete'))return window.showAlert('ليس لديك صلاحية حذف الكوبونات!','error');showConfirm('حذف الكوبون نهائياً؟',()=>remove(ref(db,`vouchers/${id}`)).then(()=>logAction('حذف كوبون',`تم حذف الكود: ${code}`)));};
    window.filterVouchers=()=>{if(!window.hasDashboardPermission('vouchers','view'))return;const table=document.getElementById('vouchersTableBody');if(!table)return;const term=(document.getElementById('searchVouchers')?.value||'').toLowerCase();const active=currentVoucherTab==='active';table.innerHTML=(allVouchers||[]).filter(v=>(v.code||'').toLowerCase().includes(term)&&(active?v.isActive:!v.isActive)).map(v=>{const used=Array.isArray(v.usedBy)?v.usedBy.length:Object.keys(v.usedBy||{}).length;const usedUp=!!v.usageLimit&&used>=Number(v.usageLimit);const status=usedUp?'مستخدم':(v.isActive?'مفعل':'معطل');return `<tr><td><b>${esc2(v.code)}</b></td><td>${v.value} ${v.type==='percentage'?'%':'ج.م'}</td><td><button class="btn-action btn-users" onclick="showVoucherUsers('${v.id}')"><i class="fas fa-users"></i></button> <span>${used}/${v.usageLimit||'-'}</span></td><td><span class="badge ${status==='مفعل'?'badge-active':'badge-inactive'}">${status}</span></td><td><div class="actions">${window.hasDashboardPermission('vouchers','edit')?`<button class="btn-action btn-edit" onclick="editVoucher('${v.id}')"><i class="fas fa-pen"></i></button>`:''}${window.hasDashboardPermission('vouchers','toggle')?`<button class="btn-action btn-hide" style="background:${v.isActive?'#64748b':'#22c55e'}" onclick="toggleVoucher('${v.id}',${!!v.isActive},'${esc2(v.code)}')"><i class="fas ${v.isActive?'fa-ban':'fa-check'}"></i></button>`:''}${window.hasDashboardPermission('vouchers','delete')?`<button class="btn-action btn-delete" onclick="deleteVoucher('${v.id}','${esc2(v.code)}')"><i class="fas fa-trash"></i></button>`:''}</div></td></tr>`;}).join('');};

    // Shipping full CRUD with audit logs.
    window.saveShipping=()=>{
        const name=document.getElementById('shipGovName').value.trim(),price=Number(document.getElementById('shipPrice').value);
        if(!name||!price)return showAlert('الاسم والسعر مطلوبين!','error');
        if(typeof editingShippingId!=='undefined'&&editingShippingId){if(!window.hasDashboardPermission('shipping','edit'))return showAlert('ليس لديك صلاحية تعديل أسعار الشحن!','error');const id=editingShippingId;return update(ref(db,`shipping/${id}`),{name,price}).then(()=>{closeModal('shippingModal');logAction('تعديل سعر شحن',`تعديل ${name} إلى ${price} ج.م`);showAlert('تم تعديل سعر الشحن','success');});}
        if(!window.hasDashboardPermission('shipping','edit'))return showAlert('ليس لديك صلاحية إضافة أسعار الشحن!','error');
        return push(ref(db,'shipping'),{name,price,isActive:true}).then(()=>{closeModal('shippingModal');logAction('إضافة سعر شحن',`إضافة ${name} بسعر ${price} ج.م`);showAlert('تم إضافة سعر الشحن','success');});
    };

    // Categories add/edit/delete/toggle permissions are already wrapped; enforce add button visibility.
    // Returns create confirmation guard.
    const oldConfirmReturnV2=window.confirmReturnOrder;window.confirmReturnOrder=()=>{if(!window.hasDashboardPermission('returns','create'))return window.showAlert('ليس لديك صلاحية إنشاء المرتجعات!','error');return oldConfirmReturnV2();};

    // Finance save purchase with before/after inventory movement records.
    window.savePurchaseInvoice=async()=>{
        if(!window.hasDashboardPermission('finance','purchase'))return showAlert('ليس لديك صلاحية إدخال فاتورة مشتريات!','error');
        const supplier=document.getElementById('purSupplier').value.trim()||'مورد عام';
        const invoiceNo=(document.getElementById('purInvoiceNo').value||'').replace(/\D/g,'');
        const shipping=num2(document.getElementById('purShipping').value);const itemsCopy=purItems.map(x=>({...x}));
        if(!itemsCopy.length)return showAlert('الفاتورة فارغة!','error');
        const before={};for(const item of itemsCopy){const snap=await get(ref(db,`products/${item.id}`));before[item.id]=snap.exists()?num2(snap.val().stock):0;}
        const amount=itemsCopy.reduce((s,i)=>s+num2(i.total),0)+shipping;
        const data=cleanData({type:'purchase',title:`فاتورة مشتريات (مورد: ${supplier})`,supplier,invoiceNo:invoiceNo||'بدون رقم',items:itemsCopy.map(i=>({id:i.id,name:i.name,qty:i.qty,cost:i.cost,total:i.total})),shipping,amount,timestamp:Date.now(),user:currentUser||'مدير'});
        try{
            await push(ref(db,'finance'),data);
            for(const item of itemsCopy){const pRef=ref(db,`products/${item.id}`);const snap=await get(pRef);if(snap.exists()){const after=num2(snap.val().stock)+num2(item.qty);await update(pRef,{stock:after});await push(ref(db,'inventoryMovements'),cleanData({productId:item.id,productName:item.name,before:before[item.id],after,reason:'شراء',invoiceNo:invoiceNo||'بدون رقم',user:currentUser||'مدير',timestamp:Date.now()}));}}
            logAction('مشتريات',`إدخال فاتورة مشتريات رقم ${invoiceNo||'بدون رقم'} بقيمة ${amount} ج.م وتحديث المخزون`);showAlert('تم إنشاء الفاتورة وتحديث المخزون','success');purItems=[];closeModal('purchaseModal');
        }catch(e){console.error(e);showAlert('تعذر حفظ الفاتورة: '+(e.message||e),'error');}
    };

    // Logs PDF button.
    if(!document.getElementById('btnExportLogsPDF')){const wrap=document.querySelector('#logs-view .page-header > div');if(wrap){const b=document.createElement('button');b.id='btnExportLogsPDF';b.className='btn-add';b.style.background='#ef4444';b.innerHTML='<i class="fas fa-file-pdf"></i> PDF';b.onclick=()=>exportLogsToPDF();wrap.appendChild(b);}}

    // Keep inventory table synchronized whenever products are refreshed.
    const oldFilterProductsV2b=window.filterProducts; // current function
    window.filterProducts=()=>{if(typeof oldFilterProductsV2b==='function')oldFilterProductsV2b();if(typeof window.renderInventoryTable==='function')setTimeout(window.renderInventoryTable,0);};

    // Settings: explicit admin-only logging on every save is already present; keep a guard at function boundary.
    const oldSaveSettingsV2=window.saveSettings;window.saveSettings=()=>{if(window.currentUserRole!=='Admin')return window.showAlert('الإعدادات متاحة للمدير فقط!','error');return oldSaveSettingsV2();};

    // Initial refresh after all overrides are installed.
    setTimeout(()=>{document.getElementById('purInvoiceNo')?.dispatchEvent(new Event('input'));document.getElementById('voucherCode')?.dispatchEvent(new Event('input'));document.getElementById('empPhone')?.dispatchEvent(new Event('input'));if(window.__dashboardAuthReady)window.applyDashboardPermissions?.();if(window.__dashboardAuthReady){window.filterProducts?.();window.filterCategories?.();window.filterVouchers?.();window.renderFinanceTable?.();window.renderReturnsTable?.();window.renderInventoryTable?.();}},1500);
})();

// V2 inventory movement for returns + stricter finance/returns permissions
(() => {
    const num = v => Number(v || 0);
    const safe = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    window.confirmReturnOrder = async () => {
        if(!window.hasDashboardPermission('returns','create')) return window.showAlert('ليس لديك صلاحية إنشاء المرتجعات!','error');
        const order=currentReturnOrderTemp;
        if(!order) return window.showAlert('اختر طلباً أولاً!','error');
        const reason=document.getElementById('returnReasonSelect').value;
        const notes=document.getElementById('returnNotes').value || 'بدون ملاحظات';
        const restore=document.getElementById('returnStockToggle').checked;
        if(!reason)return window.showAlert('برجاء اختيار سبب المرتجع','error');
        const checked=[...document.querySelectorAll('.ret-item-cb:checked')];
        if(!checked.length)return window.showAlert('برجاء اختيار منتج واحد على الأقل للاسترجاع','error');
        const items=checked.map(cb=>order.items[Number(cb.dataset.index)]).filter(Boolean);
        const amount=items.reduce((s,i)=>s+num(i.qty)*num(i.price),0);
        try{
            const before={};
            if(restore){for(const item of items){const snap=await get(ref(db,`products/${item.id}`));before[item.id]=snap.exists()?num(snap.val().stock):0;}}
            const retData=cleanData({orderDbId:order.dbId,orderId:order.orderId||order.displayId,displayId:order.displayId||order.orderId,customer:order.customer||{name:'غير مسجل',phone:'-'},items,amount,reason,notes,status:'تم استلام المرتجع',timestamp:Date.now(),user:currentUser||'مدير'});
            const retRef=await push(ref(db,'returns'),retData);
            await update(ref(db,`orders/${order.dbId}`),{status:'مرتجع',returnedAt:Date.now()});
            if(restore){for(const item of items){const pRef=ref(db,`products/${item.id}`);const snap=await get(pRef);if(snap.exists()){const after=num(snap.val().stock)+num(item.qty);await update(pRef,{stock:after});await push(ref(db,'inventoryMovements'),cleanData({productId:item.id,productName:item.name,before:before[item.id],after,reason:'مرتجع',returnId:retRef.key,orderId:order.displayId||order.orderId,user:currentUser||'مدير',timestamp:Date.now()}));}}}
            await window.notifyCustomer(order,'تم استلام مرتجع طلبك',`تم تسجيل مرتجع للطلب #${order.displayId} بقيمة ${amount} ج.م - السبب: ${reason}`);
            logAction('مرتجع',`استلام مرتجع لطلب #${order.displayId} بقيمة ${amount} ج.م`);
            showAlert('تم تسجيل المرتجع وتحديث حالة الطلب والمخزون','success');closeModal('newReturnModal');currentReturnOrderTemp=null;
        }catch(e){console.error(e);showAlert('حدث خطأ أثناء حفظ المرتجع: '+(e.message||e),'error');}
    };
})();

// Final input validation + report summary row
(() => {
    const oldSaveVoucherFinal = window.saveVoucher;
    window.saveVoucher = () => {
        const code = (document.getElementById('voucherCode')?.value || '').trim().toUpperCase();
        if(!/^[A-Z0-9]+$/.test(code)) return window.showAlert('كود الكوبون يجب أن يحتوي على حروف إنجليزية وأرقام فقط!','error');
        document.getElementById('voucherCode').value = code;
        return oldSaveVoucherFinal();
    };
    const oldExportSalesFinal = window.exportReportToExcel;
    window.exportReportToExcel = () => {
        if(!window.hasDashboardPermission('analytics','export')) return window.showAlert('ليس لديك صلاحية إصدار تقارير الإحصائيات!','error');
        if(typeof XLSX==='undefined') return window.showAlert('مكتبة Excel غير متاحة!','error');
        const summary = {
            'نوع التقرير': reportMeta.label,
            'اليوم المختار': reportMeta.label,
            'تاريخ استخراج التقرير': new Date().toLocaleString('ar-EG'),
            'إجمالي الخصومات': Math.round(reportMeta.totalDiscount || 0),
            'إجمالي المبيعات': Number(String(document.getElementById('reportTotalSales')?.innerText||'0').replace(/[^0-9.]/g,'')) || 0
        };
        const rows=[summary,...(currentReportProducts||[]).map(p=>({
            'نوع التقرير':reportMeta.label,'اليوم المختار':reportMeta.label,'تاريخ استخراج التقرير':new Date().toLocaleString('ar-EG'),
            'اسم المنتج':p.name,'الكمية المباعة':p.qty,'خصومات المنتج':Math.round(p.discount||0),
            'إيراد قبل الخصم':Math.round(p.revenue||0),'إيراد بعد الخصم':Math.round((p.revenue||0)-(p.discount||0))
        }))];
        const ws=XLSX.utils.json_to_sheet(rows),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Sales Report');XLSX.writeFile(wb,`Sales_Report_${Date.now()}.xlsx`);
        logAction('تصدير تقرير إحصائيات',`تم تصدير تقرير المبيعات إلى Excel - ${reportMeta.label}`);
    };
})();


// ===== FINAL STABILITY PATCH =====
// Keeps dashboard navigation/buttons responsive even if an earlier listener is replaced.
(() => {
    const bindDashboardInteractions = () => {
        document.querySelectorAll('.nav-links .nav-item').forEach(item => {
            if (item.dataset.stabilityBound === '1') return;
            item.dataset.stabilityBound = '1';
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const target = item.dataset.target;
                if (!target) return;
                if (window.currentUserRole === 'Supervisor' && window.currentEmpPermissions) {
                    const tabs = window.currentEmpPermissions.tabs || [];
                    if (!tabs.includes(target)) {
                        window.showAlert?.('عفواً، ليس لديك صلاحية لعرض هذه الصفحة!', 'error');
                        return;
                    }
                }
                document.querySelectorAll('.nav-links .nav-item').forEach(n => n.classList.remove('active'));
                item.classList.add('active');
                document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
                document.getElementById(target)?.classList.add('active');
            });
        });
    };
    bindDashboardInteractions();
    setTimeout(bindDashboardInteractions, 500);
    setTimeout(bindDashboardInteractions, 1500);

    // Excel loader + browser-compatible fallback.
    window.ensureExcelLibrary = async () => {
        if (window.XLSX) return true;
        try {
            await new Promise((resolve, reject) => {
                const existing = document.querySelector('script[data-xlsx-fallback]');
                if (existing) { existing.addEventListener('load', resolve, {once:true}); existing.addEventListener('error', reject, {once:true}); return; }
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
                script.dataset.xlsxFallback = '1';
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        } catch(e) { return false; }
        return !!window.XLSX;
    };

    // Excel-compatible .xls fallback when the XLSX CDN is unavailable.
    window.downloadExcelFallback = (rows, filename='Report.xls', sheetName='Report') => {
        const escHtml = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        const keys = rows.length ? Object.keys(rows[0]) : [];
        const table = `<html><head><meta charset="UTF-8"></head><body dir="rtl"><table border="1"><tr>${keys.map(k=>`<th>${escHtml(k)}</th>`).join('')}</tr>${rows.map(r=>`<tr>${keys.map(k=>`<td>${escHtml(r[k])}</td>`).join('')}</tr>`).join('')}</table></body></html>`;
        const blob = new Blob([table], {type:'application/vnd.ms-excel;charset=utf-8'});
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    };

    // Replace the sales Excel exporter with a guaranteed working implementation.
    window.exportReportToExcel = async () => {
        if (window.currentUserRole === 'Supervisor' && !window.hasDashboardPermission?.('analytics','export')) {
            return window.showAlert?.('ليس لديك صلاحية إصدار تقارير الإحصائيات!', 'error');
        }
        const rows = [
            {
                'نوع التقرير': reportMeta?.label || 'غير محدد',
                'اليوم المختار': reportMeta?.label || 'غير محدد',
                'تاريخ استخراج التقرير': new Date().toLocaleString('ar-EG'),
                'إجمالي الخصومات': Math.round(reportMeta?.totalDiscount || 0),
                'إجمالي المبيعات': Number(String(document.getElementById('reportTotalSales')?.innerText || '0').replace(/[^0-9.]/g,'')) || 0,
                'اسم المنتج':'', 'الكمية المباعة':'', 'خصومات المنتج':'', 'إيراد قبل الخصم':'', 'إيراد بعد الخصم':''
            },
            ...(currentReportProducts || []).map(p => ({
                'نوع التقرير':reportMeta?.label || '',
                'اليوم المختار':reportMeta?.label || '',
                'تاريخ استخراج التقرير':new Date().toLocaleString('ar-EG'),
                'إجمالي الخصومات':'', 'إجمالي المبيعات':'',
                'اسم المنتج':p.name, 'الكمية المباعة':p.qty,
                'خصومات المنتج':Math.round(p.discount || 0),
                'إيراد قبل الخصم':Math.round(p.revenue || 0),
                'إيراد بعد الخصم':Math.round((p.revenue || 0) - (p.discount || 0))
            }))
        ];
        const ok = await window.ensureExcelLibrary();
        try {
            if (ok && window.XLSX) {
                const ws = XLSX.utils.json_to_sheet(rows);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, 'Sales Report');
                XLSX.writeFile(wb, `Sales_Report_${Date.now()}.xlsx`);
            } else {
                window.downloadExcelFallback(rows, `Sales_Report_${Date.now()}.xls`, 'Sales Report');
            }
            logAction('تصدير تقرير إحصائيات', `تم تصدير تقرير المبيعات إلى Excel - ${reportMeta?.label || ''}`);
            window.showAlert?.('تم تصدير تقرير المبيعات بنجاح!', 'success');
        } catch(e) {
            console.error(e);
            window.showAlert?.('تعذر تصدير تقرير المبيعات: ' + (e.message || e), 'error');
        }
    };
})();


/* ================================================================
   ModyStore Production Patch — 2026-08
   ================================================================ */
(() => {
    const escP = (v='') => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const numP = v => Number(v || 0);
    const moneyP = v => `${Math.round(numP(v))} ج.م`;

    // -------------------- Exact permission enforcement --------------------
    const basePermission = window.hasDashboardPermission;
    window.hasDashboardPermission = (module, action='view') => {
        if (window.currentUserRole === 'Admin') return true;
        const p = window.currentEmpPermissions || {};
        if (p.modules?.[module] && Object.prototype.hasOwnProperty.call(p.modules[module], action)) {
            return !!p.modules[module][action];
        }
        if (action === 'view') return (p.tabs || []).includes(`${module}-view`);
        if (action === 'changeStatus') return !!p.canChangeStatus;
        if (action === 'add') return !!p.canAdd;
        if (action === 'edit') return !!p.canEdit;
        if (action === 'delete') return !!p.canDelete;
        // Legacy supervisors must NOT inherit "edit" into "toggle".
        if (action === 'toggle') return false;
        if (action === 'create') return false;
        return typeof basePermission === 'function' ? !!basePermission(module, action) : false;
    };

    const applyExactPermissions = () => {
        if (!window.__dashboardAuthReady) return;

        let firstAllowedTarget = null;

        document.querySelectorAll('.nav-links .nav-item').forEach(nav => {
            const target = nav.dataset.target;
            const module = target?.replace(/-view$/, '');
            if (!module || module === 'settings') return;

            const allowed = window.hasDashboardPermission(module, 'view');
            nav.style.display = allowed ? 'flex' : 'none';

            const view = document.getElementById(target);
            if (view && !allowed) view.classList.remove('active');
            if (allowed && !firstAllowedTarget) firstAllowedTarget = target;
        });

        // For Supervisors, always land on the first tab they are actually allowed to view.
        if (window.currentUserRole === 'Supervisor') {
            const activeView = document.querySelector('.view-section.active');
            const activeNav = document.querySelector('.nav-links .nav-item.active');
            const activeTarget = activeView?.id || activeNav?.dataset?.target;
            const activeModule = activeTarget?.replace(/-view$/, '');
            const activeAllowed = activeModule ? window.hasDashboardPermission(activeModule, 'view') : false;

            if (!activeTarget || !activeAllowed) {
                document.querySelectorAll('.view-section').forEach(view => view.classList.remove('active'));
                document.querySelectorAll('.nav-links .nav-item').forEach(nav => nav.classList.remove('active'));

                if (firstAllowedTarget) {
                    document.getElementById(firstAllowedTarget)?.classList.add('active');
                    document.querySelector(`.nav-links .nav-item[data-target=\"${firstAllowedTarget}\"]`)?.classList.add('active');
                }
            }
        }

        const actionSelectors = [
            ['products','add','#btnAddProduct'], ['products','edit','#products-view .btn-edit'],
            ['products','toggle','#products-view .btn-hide'], ['products','delete','#products-view .btn-delete'],
            ['orders','create','#btnCreateManualOrder'], ['orders','changeStatus','#orders-view .status-select'],
            ['orders','details','#orders-view .btn-view'], ['finance','purchase','[onclick=\"openPurchaseModal()\"]'],
            ['finance','expense','[onclick=\"openExpenseModal()\"]'], ['returns','create','[onclick=\"openNewReturnModal()\"]']
        ];
        actionSelectors.forEach(([module,action,selector]) => {
            const allowed = window.hasDashboardPermission(module, action);
            document.querySelectorAll(selector).forEach(el => {
                el.style.display = allowed ? '' : 'none';
                if (el.matches('select')) el.disabled = !allowed;
            });
        });

        if (window.currentUserRole !== 'Admin') {
            document.querySelector('[data-target=\"settings-view\"]')?.style.setProperty('display','none');
        }
    };
    window.applyDashboardPermissions = applyExactPermissions;

    // -------------------- Professional order scanner --------------------
    let scannerV3 = null;
    let lastScannerV3 = 0;
    const normalizeScanCode = raw => {
        let code = String(raw ?? '').trim();
        try {
            if (/^https?:\/\//i.test(code)) {
                const u = new URL(code);
                code = u.searchParams.get('order') || u.searchParams.get('code') || code;
            }
        } catch(e) {}
        return code.replace(/\s+/g,'').trim();
    };
    const findOrderByScanCode = code => {
        const c = normalizeScanCode(code);
        return (allOrders || []).find(o => [
            o.orderId, o.secretCode, o.displayId, o.barcode, o.trackingCode
        ].some(v => String(v ?? '').trim() === c));
    };
    const scannerFormats = () => {
        const F = window.Html5QrcodeSupportedFormats || {};
        return ['QR_CODE','CODE_128','CODE_39','CODE_93','EAN_13','EAN_8','UPC_A','UPC_E','ITF','CODABAR']
            .map(k => F[k]).filter(v => typeof v !== 'undefined');
    };

    window.processScannedOrder = async (rawCode) => {
        const code = normalizeScanCode(rawCode);
        if (!code) return;
        const now = Date.now();
        if (now - lastScannerV3 < 1000) return;
        lastScannerV3 = now;
        const beep = document.getElementById('barcodeBeep');
        try { if (beep) { beep.currentTime = 0; await beep.play(); } } catch(e) {}
        const order = findOrderByScanCode(code);
        if (!order) return window.showAlert(`الكود المقروء (${code}) غير مرتبط بأي طلب!`, 'error');
        if (!window.hasDashboardPermission('orders','changeStatus')) return window.showAlert('ليس لديك صلاحية تأكيد الشحن!', 'error');
        if (['تم الشحن','تم تسليمه','ملغي','مرتجع'].includes(order.status)) {
            return window.showAlert(`الطلب حالته الحالية: ${order.status}`, 'warning');
        }
        try {
            await update(ref(db, `orders/${order.dbId}`), {status:'تم الشحن', shippedAt:Date.now()});
            window.showAlert(`تم شحن الطلب #${order.displayId || order.orderId} بنجاح`, 'success');
            logAction('سكانر شحن', `تأكيد شحن الطلب #${order.displayId || order.orderId} عبر السكانر`);
        } catch(e) {
            console.error(e);
            window.showAlert('تعذر تحديث حالة الطلب بعد قراءة الكود.', 'error');
        }
    };
    window.openScannerModal = async () => {
        if (!window.hasDashboardPermission('orders','changeStatus')) return window.showAlert('ليس لديك صلاحية استخدام سكانر الشحن!','error');
        const modal = document.getElementById('scannerModal');
        if (modal) modal.style.display='flex';
        const input = document.getElementById('manualScanOrderInput');
        if (input) { input.value=''; setTimeout(()=>input.focus(),250); }
        if (typeof Html5Qrcode === 'undefined') return window.showAlert('مكتبة السكانر غير متاحة!','error');
        try {
            if (scannerV3) { try { await scannerV3.stop(); } catch(e) {} }
            scannerV3 = new Html5Qrcode('qr-reader', { verbose:false });
            const formats = scannerFormats();
            const config = { fps: 15, qrbox: { width: 330, height: 150 }, aspectRatio: 2.2, disableFlip: false };
            if (formats.length) config.formatsToSupport = formats;
            await scannerV3.start({facingMode:{exact:'environment'}}, config, decoded => window.processScannedOrder(decoded), () => {});
        } catch(err) {
            console.warn('Primary camera failed, retrying default environment camera', err);
            try {
                if (scannerV3) { try { await scannerV3.stop(); } catch(e) {} }
                scannerV3 = new Html5Qrcode('qr-reader', {verbose:false});
                const formats = scannerFormats();
                const config = {fps:12, qrbox:{width:300,height:150}, disableFlip:false};
                if (formats.length) config.formatsToSupport=formats;
                await scannerV3.start({facingMode:'environment'}, config, decoded => window.processScannedOrder(decoded), () => {});
            } catch(e) {
                console.error(e);
                window.showAlert('لم نتمكن من تشغيل الكاميرا. اسمح للمتصفح بالكاميرا وتأكد من استخدام HTTPS.', 'error');
            }
        }
    };
    window.stopScanner = async () => {
        if (scannerV3) { try { await scannerV3.stop(); } catch(e) {} scannerV3=null; }
        const oldScanner = typeof html5QrcodeScanner !== 'undefined' ? html5QrcodeScanner : null;
        if (oldScanner && oldScanner !== scannerV3) { try { await oldScanner.stop(); } catch(e) {} }
    };

    // -------------------- Stable, readable waybill barcode --------------------
    const renderStableBarcode = (order, svgSelector='#topBarcode') => {
        const svg = document.querySelector(svgSelector);
        if (!svg || typeof JsBarcode === 'undefined') return;
        const code = String(order.orderId || order.secretCode || order.displayId || '').trim();
        if (!code) return;
        try {
            JsBarcode(svg, code, {format:'CODE128', width:2.4, height:82, displayValue:true, fontSize:20, margin:8, lineColor:'#000', background:'#fff'});
            svg.setAttribute('preserveAspectRatio','xMidYMid meet');
            svg.style.width='min(100%, 620px)';
            svg.style.maxWidth='620px';
            svg.style.height='90px';
            svg.style.display='block';
            svg.style.margin='0 auto';
        } catch(e) { console.error('Barcode render error', e); }
    };

    const oldViewDetailsV3 = window.viewOrderDetails;
    window.viewOrderDetails = (id) => {
        const result = typeof oldViewDetailsV3 === 'function' ? oldViewDetailsV3(id) : null;
        const order = (allOrders || []).find(o => o.dbId === id);
        if (!order) return result;
        const source = document.getElementById('oSource');
        if (source) source.innerText = order.source || 'الموقع الإلكتروني';
        setTimeout(() => renderStableBarcode(order), 30);
        return result;
    };

    window.bulkPrintWaybills = () => {
        if (!window.hasDashboardPermission('orders','details')) return window.showAlert('ليس لديك صلاحية طباعة البوليصات!','error');
        const orders = (allOrders || []).filter(o => o.status === 'جاري التجهيز');
        if (!orders.length) return window.showAlert('لا توجد طلبات جاري التجهيز لطباعتها!','warning');
        const container = document.getElementById('bulkPrintContainer');
        if (!container) return;
        container.innerHTML='';
        orders.forEach((o,idx) => {
            const code = String(o.orderId || o.secretCode || o.displayId || '').trim();
            const desc = (o.items || []).map(i => `${i.qty}x ${escP(i.name)}`).join(' ، ');
            const wrap = document.createElement('div');
            wrap.className='bulk-waybill-page';
            wrap.style.cssText='page-break-after:always;width:100%;background:#fff;';
            wrap.innerHTML = `
                <div class="bosta-waybill bulk-waybill-card">
                    <div class="waybill-head">
                        <div class="waybill-brand">ModyStore <i class="fas fa-bolt"></i></div>
                        <svg class="bulk-stable-barcode"></svg>
                    </div>
                    <div class="waybill-grid">
                        <div><strong>من:</strong> مودي ستور<br><strong>السماح بالفتح:</strong> لا</div>
                        <div class="bulk-waybill-qr"></div>
                    </div>
                    <div class="waybill-recipient">
                        <strong>إلى:</strong> ${escP(o.customer?.name || '-')}<br>
                        <strong>المحافظة:</strong> ${escP(o.customer?.city || '-')} | <strong>المنطقة:</strong> ${escP(o.customer?.region || '')}<br>
                        <strong>العنوان:</strong> ${escP(typeof o.customer?.address === 'object' ? (o.customer.address.street || o.customer.address.details || '-') : (o.customer?.address || '-'))}<br>
                        <strong>تليفون:</strong> <span dir="ltr">${escP(o.customer?.phone || '-')}</span>
                    </div>
                    <div class="waybill-description"><strong>الوصف:</strong> ${desc || '-'}<br><strong>ملاحظات:</strong> ${escP(o.notes || 'لا يوجد')}</div>
                    <div class="waybill-amount"><strong>${o.paymentMethod && !String(o.paymentMethod).includes('كاش') && !String(o.paymentMethod).includes('استلام') ? 'القيمة المدفوعة' : 'المبلغ المطلوب تحصيله (COD)'}</strong><span>${Math.round(o.total || 0)} ج.م</span></div>
                    <div class="waybill-footer">كود التتبع: <b>${escP(code)}</b> — شكراً لثقتكم بنا ❤️</div>
                </div>`;
            container.appendChild(wrap);
            const svg=wrap.querySelector('.bulk-stable-barcode');
            if (svg && typeof JsBarcode !== 'undefined') JsBarcode(svg, code, {format:'CODE128',width:2.4,height:82,displayValue:true,fontSize:20,margin:8});
            const qr=wrap.querySelector('.bulk-waybill-qr');
            if (qr && typeof QRCode !== 'undefined') new QRCode(qr,{text:`${location.origin}${location.pathname}?order=${encodeURIComponent(code)}`,width:120,height:120});
        });
        closeModal('orderDetailsModal');
        window.printNode(container);
    };

    // -------------------- Manual order creation --------------------
    let manualOrderItems = [];
    const getActiveProductPrice = p => {
        const end = numP(p.offerEndAt);
        if (p.discountPrice && (!end || end > Date.now())) return numP(p.discountPrice);
        return numP(p.price);
    };
    const renderManualItems = () => {
        const list=document.getElementById('manualOrderItemsList');
        if(!list)return;
        if(!manualOrderItems.length){list.innerHTML='<div style="padding:25px;text-align:center;color:#94a3b8;">لم تتم إضافة منتجات بعد.</div>'; updateManualOrderTotals(); return;}
        list.innerHTML=manualOrderItems.map((it,i)=>`
            <div class="manual-item">
                <strong>${escP(it.name)}</strong>
                <span>× ${it.qty}</span>
                <span>${moneyP(it.qty*it.price)}</span>
                <button type="button" onclick="removeManualOrderItem(${i})"><i class="fas fa-times"></i></button>
            </div>`).join('');
        updateManualOrderTotals();
    };
    window.updateManualOrderTotals = () => {
        const subtotal=manualOrderItems.reduce((s,i)=>s+numP(i.qty)*numP(i.price),0);
        const shipping=Math.max(0,numP(document.getElementById('manualShippingCost')?.value));
        const discount=Math.max(0,numP(document.getElementById('manualDiscount')?.value));
        const total=Math.max(0,subtotal+shipping-discount);
        const el=document.getElementById('manualOrderTotal'); if(el)el.innerText=moneyP(total);
        return {subtotal,shipping,discount,total};
    };
    window.openManualOrderModal = () => {
        if(!window.hasDashboardPermission('orders','create')) return window.showAlert('ليس لديك صلاحية إنشاء طلبات يدوية!','error');
        manualOrderItems=[];
        ['manualCustName','manualCustPhone','manualCustPhone2','manualCustCity','manualCustRegion','manualCustAddress','manualOrderNotes'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
        document.getElementById('manualShippingCost').value='0';
        document.getElementById('manualDiscount').value='0';
        document.getElementById('manualOrderSource').value='واتساب';
        document.getElementById('manualPaymentMethod').value='كاش';
        const s=document.getElementById('manualProductSelect');
        if(s){s.innerHTML='<option value="">اختر المنتج...</option>';(allProducts||[]).filter(p=>p.isActive!==false).forEach(p=>s.innerHTML+=`<option value="${escP(p.id)}">${escP(p.name)} — ${moneyP(getActiveProductPrice(p))} — مخزون ${numP(p.stock)}</option>`);}
        document.getElementById('manualProductQty').value='1';
        renderManualItems();
        document.getElementById('manualOrderModal').style.display='flex';
    };
    window.addManualOrderItem = () => {
        if(!window.hasDashboardPermission('orders','create')) return;
        const s=document.getElementById('manualProductSelect');
        const qty=Math.max(1,parseInt(document.getElementById('manualProductQty')?.value,10)||1);
        const p=(allProducts||[]).find(x=>x.id===s?.value);
        if(!p)return window.showAlert('اختر المنتج أولاً!','warning');
        const existing=manualOrderItems.find(x=>x.id===p.id);
        const currentQty=existing?.qty||0;
        if(numP(p.stock)<currentQty+qty)return window.showAlert(`المخزون المتاح من ${p.name} هو ${numP(p.stock)} فقط.`,'warning');
        const price=getActiveProductPrice(p);
        if(existing)existing.qty+=qty; else manualOrderItems.push({id:p.id,name:p.name,qty,price});
        renderManualItems();
    };
    window.removeManualOrderItem = i => { manualOrderItems.splice(i,1); renderManualItems(); };
    window.saveManualOrder = async () => {
        if(!window.hasDashboardPermission('orders','create')) return window.showAlert('ليس لديك صلاحية إنشاء طلبات يدوية!','error');
        const name=document.getElementById('manualCustName')?.value.trim();
        const phone=document.getElementById('manualCustPhone')?.value.trim();
        const phone2=document.getElementById('manualCustPhone2')?.value.trim();
        const city=document.getElementById('manualCustCity')?.value.trim();
        const region=document.getElementById('manualCustRegion')?.value.trim();
        const address=document.getElementById('manualCustAddress')?.value.trim();
        const source=document.getElementById('manualOrderSource')?.value||'يدوي';
        const paymentMethod=document.getElementById('manualPaymentMethod')?.value||'كاش';
        const notes=document.getElementById('manualOrderNotes')?.value.trim()||'';
        if(!name||!phone||!city||!address)return window.showAlert('اسم العميل، الموبايل، المحافظة والعنوان بيانات مطلوبة.','warning');
        if(!manualOrderItems.length)return window.showAlert('أضف منتجاً واحداً على الأقل للطلب.','warning');
        const totals=window.updateManualOrderTotals();
        const orderId=`M-${Date.now().toString().slice(-10)}`;
        const secretCode=String(Math.floor(100000+Math.random()*900000));
        const order=cleanData({
            orderId, secretCode, source, manual:true, createdAt:Date.now(), createdBy:currentUser,
            customer:{name,phone,phone2,city,region,address},
            items:manualOrderItems.map(i=>({id:i.id,name:i.name,qty:i.qty,price:i.price})),
            shippingCost:totals.shipping, discount:totals.discount, subtotal:totals.subtotal,
            total:totals.total, paymentMethod, paymentStatus:paymentMethod==='كاش'?'pending':'pending',
            notes, status:'قيد المراجعة'
        });
        try{
            // Re-check stock immediately before writing.
            for(const item of manualOrderItems){
                const snap=await get(ref(db,`products/${item.id}`));
                const stock=snap.exists()?numP(snap.val().stock):0;
                if(stock<item.qty)throw new Error(`المخزون غير كافٍ للمنتج: ${item.name}`);
            }
            const newRef=await push(ref(db,'orders'),order);
            for(const item of manualOrderItems){
                const pRef=ref(db,`products/${item.id}`);
                const snap=await get(pRef);
                if(snap.exists()){
                    const before=numP(snap.val().stock), after=before-item.qty;
                    await update(pRef,{stock:after});
                    await push(ref(db,'inventoryMovements'),cleanData({productId:item.id,productName:item.name,before,after,reason:'طلب يدوي',orderId,source,user:currentUser,timestamp:Date.now()}));
                }
            }
            await push(ref(db,'logs'),cleanData({action:'إنشاء طلب يدوي',details:`إنشاء الطلب ${orderId} من مصدر ${source}`,user:currentUser,timestamp:Date.now()}));
            closeModal('manualOrderModal');
            window.showAlert(`تم إنشاء الطلب #${orderId} بنجاح`, 'success');
            window.switchOrderTab?.('active');
        }catch(e){
            console.error(e);
            window.showAlert(`تعذر إنشاء الطلب: ${e.message||e}`,'error');
        }
    };

    // -------------------- Source column + details permission --------------------
    const oldRenderOrdersV3 = window.renderOrdersTable;
    window.renderOrdersTable = () => {
        const table=document.getElementById('ordersTableBody'); if(!table)return;
        if(!window.hasDashboardPermission('orders','view')){table.innerHTML='<tr><td colspan="7" style="text-align:center;padding:25px;">لا تملك صلاحية عرض الطلبات.</td></tr>';return;}
        const search=(document.getElementById('searchOrders')?.value||'').toLowerCase();
        const dateFilter=document.getElementById('filterOrderDate')?.value||'';
        const paymentFilter=document.getElementById('filterOrderPayment')?.value||'';
        const statusFilter=document.getElementById('filterOrderStatus')?.value||'';
        const tab=currentOrderTab==='active';
        const filtered=(allOrders||[]).filter(o=>{
            const tabMatch=tab?['قيد المراجعة','جاري التجهيز','تم الشحن'].includes(o.status):['تم تسليمه','ملغي','مرتجع'].includes(o.status);
            const searchMatch=[o.displayId,o.orderId,o.customer?.name,o.customer?.phone,o.source].some(v=>String(v??'').toLowerCase().includes(search));
            const dateMatch=!dateFilter||new Date(o.createdAt).toISOString().slice(0,10)===dateFilter;
            const payMatch=!paymentFilter||String(o.paymentMethod||'').includes(paymentFilter);
            const statusMatch=!statusFilter||o.status===statusFilter;
            return tabMatch&&searchMatch&&dateMatch&&payMatch&&statusMatch;
        });
        const count=document.getElementById('filteredOrdersCount'); if(count)count.innerText=filtered.length;
        if(!filtered.length){table.innerHTML='<tr><td colspan="7" style="text-align:center;padding:25px;">لا توجد طلبات مطابقة للبحث.</td></tr>';return;}
        const canChange=window.hasDashboardPermission('orders','changeStatus');
        const canDetails=window.hasDashboardPermission('orders','details');
        filtered.forEach(order=>{
            const statuses=['قيد المراجعة','جاري التجهيز','تم الشحن','تم تسليمه','ملغي'];
            const options=statuses.map(st=>`<option value="${st}" ${order.status===st?'selected':''}>${st}</option>`).join('');
            const statusHtml=canChange?`<select class="status-select" onchange="requestOrderStatusUpdate('${order.dbId}',this,'${order.status}','${escP(order.displayId||order.orderId)}')">${options}</select>`:`<span class="badge ${order.status==='تم الشحن'?'badge-active':'badge-inactive'}">${escP(order.status)}</span>`;
            table.innerHTML+=`<tr>
                <td style="font-weight:900;color:var(--primary);">#${escP(order.displayId||order.orderId)}</td>
                <td><b>${escP(order.customer?.name||'بدون اسم')}</b><br><span class="meta-info">${escP(order.paymentMethod||'الدفع عند الاستلام')}</span></td>
                <td><span class="source-chip">${escP(order.source||'الموقع الإلكتروني')}</span></td>
                <td dir="ltr" class="meta-info">${escP(formatDateTime(order.createdAt))}</td>
                <td style="font-weight:bold;color:var(--secondary);">${Math.round(order.total||0)} ج.م</td>
                <td>${statusHtml}</td>
                <td>${canDetails?`<button class="btn-action btn-view" onclick="viewOrderDetails('${order.dbId}')"><i class="fas fa-eye"></i></button>`:'—'}</td>
            </tr>`;
        });
    };

    // -------------------- Product offer expiry --------------------
    const offerDurationMs = (value, unit) => {
        const n=Math.max(0,numP(value));
        if(unit==='minutes') return n*60*1000;
        if(unit==='days') return n*24*60*60*1000;
        return n*60*60*1000;
    };
    const expireOffer = async p => {
        if(!p?.id || !p.offerEndAt || numP(p.offerEndAt)>Date.now()) return;
        try {
            await update(ref(db,`products/${p.id}`),{discountPrice:null,offerEndAt:null,offerStartAt:null,offerDuration:null,offerUnit:null});
        } catch(e) { console.warn('offer expiry update failed',e); }
    };
    const refreshOfferExpiry = () => {
        (allProducts||[]).forEach(p=>{ if(p.offerEndAt && numP(p.offerEndAt)<=Date.now()) expireOffer(p); });
        window.filterProducts?.();
    };
    setInterval(refreshOfferExpiry, 30000);
    onValue(ref(db,'products'), snap => {
        const now=Date.now();
        if(snap.exists()) snap.forEach(c=>{const p={id:c.key,...c.val()}; if(p.offerEndAt && numP(p.offerEndAt)<=now) expireOffer(p);});
    });

    // Replace save product with duration-aware version (direct DB write).
    window.saveProduct = async () => {
        if (editingProductId) {
            if (window.hasDashboardPermission('products','edit')) {
                // Full edit path.
            } else if (window.hasDashboardPermission('inventory','adjust')) {
                const addStock = Math.max(0, parseInt(document.getElementById('prodAddStockOnly')?.value,10) || 0);
                if (!addStock) return window.showAlert('اكتب كمية صحيحة لإضافتها للمخزون.', 'warning');
                const p = (allProducts||[]).find(x=>x.id===editingProductId);
                if (!p) return window.showAlert('المنتج غير موجود.', 'error');
                await update(ref(db,`products/${editingProductId}`),{stock:numP(p.stock)+addStock});
                await push(ref(db,'inventoryMovements'),cleanData({
                    productId:p.id, productName:p.name, before:numP(p.stock), after:numP(p.stock)+addStock,
                    reason:'زيادة مخزون يدوية', user:currentUser, timestamp:Date.now()
                }));
                closeModal('productModal');
                return window.showAlert('تمت زيادة المخزون بنجاح.', 'success');
            } else {
                return window.showAlert('ليس لديك صلاحية تعديل المنتج.', 'error');
            }
        } else if (!window.hasDashboardPermission('products','add')) {
            return window.showAlert('ليس لديك صلاحية إضافة منتجات.', 'error');
        }

        const name=document.getElementById('prodName')?.value.trim()||'';
        const price=numP(document.getElementById('prodPrice')?.value);
        const discountRaw=document.getElementById('prodDiscountPrice')?.value;
        const discount=discountRaw==='' ? null : numP(discountRaw);
        const stock=Math.max(0,parseInt(document.getElementById('prodStock')?.value,10)||0);
        const category=document.getElementById('prodCategory')?.value||'';
        const description=document.getElementById('prodDesc')?.value||'';
        const image=document.getElementById('prodImage')?.value.trim()||'';
        const duration=numP(document.getElementById('prodOfferDuration')?.value);
        const unit=document.getElementById('prodOfferUnit')?.value||'hours';

        if(!name||!price||!category) return window.showAlert('الاسم والسعر والقسم مطلوبين!', 'warning');
        if(discount!==null && discount>0 && discount>=price) return window.showAlert('سعر العرض يجب أن يكون أقل من السعر الأساسي.', 'warning');

        const data=cleanData({
            name, price, discountPrice:discount && discount>0 ? discount : null, stock, category,
            description, imageUrl:image||'https://via.placeholder.com/300',
            createdAt:Date.now()
        });

        if(discount && discount>0) {
            if(duration>0) {
                const startAt=Date.now(), endAt=startAt+offerDurationMs(duration,unit);
                data.offerStartAt=startAt; data.offerEndAt=endAt; data.offerDuration=duration; data.offerUnit=unit;
            } else {
                data.offerStartAt=null; data.offerEndAt=null; data.offerDuration=null; data.offerUnit=null;
            }
        } else {
            data.offerStartAt=null; data.offerEndAt=null; data.offerDuration=null; data.offerUnit=null;
        }

        try {
            if(editingProductId) {
                delete data.createdAt;
                await update(ref(db,`products/${editingProductId}`),data);
                logAction('تعديل منتج',`تعديل بيانات المنتج: ${name}`);
                showAlert('تم تعديل المنتج بنجاح!', 'success');
            } else {
                data.isActive=true;
                const newRef=push(ref(db,'products'));
                await set(newRef,data);
                logAction('إضافة منتج',`إنشاء منتج جديد: ${name}`);
                showAlert('تمت إضافة المنتج بنجاح!', 'success');
            }
            closeModal('productModal');
        } catch(e) {
            console.error(e);
            showAlert('تعذر حفظ المنتج: '+(e.message||e),'error');
        }
    };

    // Offer controls when opening/editing products.
    const previousOpenProductModalV3 = window.openProductModal;
    window.openProductModal = () => {
        if(typeof previousOpenProductModalV3==='function') previousOpenProductModalV3();
        const d=document.getElementById('prodOfferDuration'); if(d)d.value='';
        const u=document.getElementById('prodOfferUnit'); if(u)u.value='hours';
        const days=document.getElementById('prodOfferDays'); if(days)days.value='';
    };
    const previousEditProductV3 = window.editProduct;
    window.editProduct = (id) => {
        if(typeof previousEditProductV3==='function') previousEditProductV3(id);
        const p=(allProducts||[]).find(x=>x.id===id);
        if(!p)return;
        const d=document.getElementById('prodOfferDuration'); if(d)d.value=p.offerDuration||'';
        const u=document.getElementById('prodOfferUnit'); if(u)u.value=p.offerUnit||'hours';
        const days=document.getElementById('prodOfferDays'); if(days)days.value=(p.offerUnit==='days'?p.offerDuration||'':'');
    };

    // Make product list use only active offers
    const baseFilterProductsV3 = window.filterProducts;
    window.filterProducts = () => {
        if(!window.hasDashboardPermission('products','view')) return;
        const table=document.getElementById('productsTableBody'); if(!table)return;
        const term=(document.getElementById('searchProducts')?.value||'').toLowerCase();
        const cat=document.getElementById('filterProductCat')?.value||'';
        const offers=!!document.getElementById('filterProductOffers')?.checked;
        const activeOffer = p => numP(p.discountPrice)>0 && (!p.offerEndAt || numP(p.offerEndAt)>Date.now());
        let list=(allProducts||[]).filter(p=>(p.name||'').toLowerCase().includes(term)&&(!cat||p.category===cat)&&(!offers||activeOffer(p)));
        if(currentProductTab==='active')list=list.filter(p=>p.isActive);
        else if(currentProductTab==='inactive')list=list.filter(p=>!p.isActive);
        else if(currentProductTab==='lowstock')list=list.filter(p=>numP(p.stock)<=5);
        table.innerHTML=list.map(p=>{
            const isOffer=activeOffer(p);
            const price=isOffer?`<del style="color:#94a3b8">${numP(p.price)}</del> <span style="color:var(--accent);font-weight:bold">${numP(p.discountPrice)} ج.م</span>`:`${numP(p.price)} ج.م`;
            const offerMeta=isOffer&&p.offerEndAt?`<div class="meta-info" style="color:#f97316;">ينتهي ${escP(formatDateTime(p.offerEndAt))}</div>`:'';
            const stock=numP(p.stock)<=5?`<span style="color:var(--danger);font-weight:bold">${numP(p.stock)} (نواقص)</span>`:numP(p.stock);
            return `<tr><td><div class="product-info"><img src="${escP(p.imageUrl||'https://via.placeholder.com/300')}" class="product-img"><span>${escP(p.name)}</span></div></td><td>${price}${offerMeta}</td><td style="font-weight:bold">${stock}</td><td>${escP(p.category||'-')}</td><td><span class="badge ${p.isActive?'badge-active':'badge-inactive'}">${p.isActive?'معروض':'مخفي'}</span></td><td><div class="actions">
                ${window.hasDashboardPermission('products','edit')?`<button class="btn-action btn-edit" onclick="editProduct('${p.id}')"><i class="fas fa-pen"></i></button>`:''}
                ${window.hasDashboardPermission('products','toggle')?`<button class="btn-action btn-hide" style="background:${p.isActive?'#64748b':'#22c55e'}" onclick="toggleProduct('${p.id}',${!!p.isActive},'${escP(p.name)}')"><i class="fas ${p.isActive?'fa-eye-slash':'fa-eye'}"></i></button>`:''}
                ${window.hasDashboardPermission('products','delete')?`<button class="btn-action btn-delete" onclick="deleteProduct('${p.id}','${escP(p.name)}')"><i class="fas fa-trash"></i></button>`:''}
            </div></td></tr>`;
        }).join('');
    };

    // -------------------- Real analytics cards + sources --------------------
    const refreshExtraAnalytics = () => {
        const orders=allOrders||[];
        const valid=orders.filter(o=>!['ملغي','مرتجع'].includes(o.status));
        const avg=valid.length ? valid.reduce((s,o)=>s+numP(o.total),0)/valid.length : 0;
        const pendingValue=orders.filter(o=>o.status==='قيد المراجعة').reduce((s,o)=>s+numP(o.total),0);
        const avgEl=document.getElementById('statAverageOrder'); if(avgEl)avgEl.innerText=moneyP(avg);
        const pv=document.getElementById('statPendingValue'); if(pv)pv.innerText=moneyP(pendingValue);

        const sourceCounts={};
        orders.forEach(o=>{const src=o.source||'الموقع الإلكتروني';sourceCounts[src]=(sourceCounts[src]||0)+1;});
        const total=Object.values(sourceCounts).reduce((a,b)=>a+b,0);
        const top=Object.entries(sourceCounts).sort((a,b)=>b[1]-a[1])[0];
        const topEl=document.getElementById('statTopOrderSource');if(topEl)topEl.innerText=top?.[0]||'-';
        const topMeta=document.getElementById('statTopOrderSourceMeta');if(topMeta)topMeta.innerText=top?`${top[1]} طلب من إجمالي ${total}`:'لا توجد طلبات بعد';
        const totalEl=document.getElementById('sourceOrdersTotal');if(totalEl)totalEl.innerText=`${total} طلب`;
        const box=document.getElementById('orderSourcesBreakdown');
        if(box){
            if(!total){box.innerHTML='<div class="source-empty">لا توجد بيانات كافية بعد.</div>';}
            else{
                const rows=Object.entries(sourceCounts).sort((a,b)=>b[1]-a[1]).slice(0,8);
                box.innerHTML=rows.map(([src,count])=>`<div class="source-row"><div class="source-label">${escP(src)}</div><div class="source-track"><div class="source-fill" style="width:${Math.max(4,(count/total)*100)}%"></div></div><div class="source-value">${count} طلب</div></div>`).join('');
            }
        }
    };
    window.refreshExtraAnalytics=refreshExtraAnalytics;
    onValue(ref(db,'orders'), () => setTimeout(refreshExtraAnalytics, 0));

    // -------------------- Paymob settings (safe frontend config) --------------------
    const oldSaveSettingsV3 = window.saveSettings;
    window.saveSettings = async () => {
        if(window.currentUserRole!=='Admin') return window.showAlert('الإعدادات متاحة للمدير فقط!','error');
        const before = await get(ref(db,'storeSettings')).catch(()=>null);
        if(typeof oldSaveSettingsV3==='function') await oldSaveSettingsV3();
        const patch = {
            paymob: {
                enabled: !!document.getElementById('setPaymobEnabled')?.checked,
                publicKey: document.getElementById('setPaymobPublicKey')?.value.trim() || '',
                integrationId: document.getElementById('setPaymobIntegrationId')?.value.trim() || '',
                backendEndpoint: document.getElementById('setPaymobBackendEndpoint')?.value.trim() || '',
                webhookEndpoint: document.getElementById('setPaymobWebhookEndpoint')?.value.trim() || ''
            },
            push: {
                vapidKey: document.getElementById('setFcmVapidKey')?.value.trim() || ''
            }
        };
        await update(ref(db,'storeSettings'),patch);
        logAction('إعدادات الدفع والإشعارات','تحديث إعدادات Paymob وإشعارات الموبايل');
        window.showAlert('تم حفظ إعدادات Paymob والإشعارات.', 'success');
    };
    onValue(ref(db,'storeSettings'), snap => {
        if(!snap.exists())return;
        const d=snap.val()||{};
        const p=d.paymob||{};
        const push=d.push||{};
        const set=(id,val)=>{const e=document.getElementById(id);if(e)e.value=val??'';};
        const check=(id,val)=>{const e=document.getElementById(id);if(e)e.checked=!!val;};
        check('setPaymobEnabled',p.enabled);
        set('setPaymobPublicKey',p.publicKey);
        set('setPaymobIntegrationId',p.integrationId);
        set('setPaymobBackendEndpoint',p.backendEndpoint);
        set('setPaymobWebhookEndpoint',p.webhookEndpoint);
        set('setFcmVapidKey',push.vapidKey);
    });

    // -------------------- Firebase Cloud Messaging registration --------------------
    let fcmRegistration = null;
    window.initMobilePushNotifications = async () => {
        try{
            if(!('Notification' in window) || !('serviceWorker' in navigator)) return;
            const supported=await isMessagingSupported();
            if(!supported)return;
            const settingsSnap=await get(ref(db,'storeSettings'));
            const vapidKey=settingsSnap.exists()?String(settingsSnap.val()?.push?.vapidKey||'').trim():'';
            if(!vapidKey){
                const s=document.getElementById('pushSetupStatus'); if(s)s.innerText='أدخل VAPID Key من إعدادات Firebase أولاً';
                return;
            }
            fcmRegistration=await navigator.serviceWorker.register('./firebase-messaging-sw.js');
            const messaging=getMessaging(app);
            const permission=Notification.permission==='granted'? 'granted' : await Notification.requestPermission();
            if(permission!=='granted')return;
            const token=await getToken(messaging,{vapidKey,serviceWorkerRegistration:fcmRegistration});
            if(!token)return;
            const uid=window.currentEmpUid||auth.currentUser?.uid;
            if(!uid)return;
            await set(ref(db,`pushTokens/${uid}/${encodeURIComponent(token)}`),{token,updatedAt:Date.now(),user:currentUser,role:window.currentUserRole});
            const status=document.getElementById('pushSetupStatus');if(status){status.innerText='الإشعارات مفعّلة على هذا الجهاز';status.classList.add('ok');}
            onMessage(messaging,payload=>{
                const title=payload.notification?.title||payload.data?.title||'ModyStore';
                const body=payload.notification?.body||payload.data?.body||'لديك تحديث جديد';
                if(document.visibilityState==='visible')window.showAlert(`${title} — ${body}`,'info');
            });
        }catch(e){
            console.warn('FCM init failed',e);
            const status=document.getElementById('pushSetupStatus');if(status)status.innerText='تعذر تفعيل إشعارات هذا الجهاز';
        }
    };
    window.enableMobilePush = async () => {
        await window.initMobilePushNotifications?.();
    };

    window.refreshManualOrderUI = () => {
        try {
            const list=document.getElementById('manualOrderItemsList');
            if(!list) return;
            if(!manualOrderItems.length){list.innerHTML='<div style="padding:25px;text-align:center;color:#94a3b8;">لم تتم إضافة منتجات بعد.</div>'; updateManualOrderTotals(); return;}
            list.innerHTML=manualOrderItems.map((it,i)=>`<div class="manual-item"><strong>${escP(it.name)}</strong><span>× ${it.qty}</span><span>${moneyP(it.qty*it.price)}</span><button type="button" onclick="removeManualOrderItem(${i})"><i class="fas fa-times"></i></button></div>`).join('');
            updateManualOrderTotals();
        } catch(e) {}
    };

    // -------------------- Final auth/UI sync --------------------
    const syncFinalUI = () => {
        if(!window.__dashboardAuthReady)return;
        applyExactPermissions();
        refreshExtraAnalytics();
        window.refreshManualOrderUI?.();
    };
    setTimeout(syncFinalUI, 50);
    setTimeout(syncFinalUI, 400);
    setTimeout(syncFinalUI, 1000);
})();


/* ================================================================
   ModyStore Final User Request Patch — 2026-08-28
   Orders realtime UI + mobile sidebar + inventory stocktake +
   customer reviews + product rating data + WhatsApp confirmation bridge.
   ================================================================ */
(() => {
    const escFinal = (v='') => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const numFinal = v => Number(v || 0);
    const moneyFinal = v => `${Math.round(numFinal(v))} ج.م`;

    // ---------------------------------------------------------------
    // Mobile sidebar: on mobile .collapsed means OPEN in the existing CSS.
    // Add a click-outside overlay and close the sidebar after navigation.
    // ---------------------------------------------------------------
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    let mobileSidebarOverlay = document.getElementById('mobileSidebarOverlay');
    if (!mobileSidebarOverlay) {
        mobileSidebarOverlay = document.createElement('div');
        mobileSidebarOverlay.id = 'mobileSidebarOverlay';
        mobileSidebarOverlay.className = 'mobile-sidebar-overlay';
        document.body.appendChild(mobileSidebarOverlay);
    }
    const isMobile = () => window.matchMedia('(max-width: 768px)').matches;
    const setSidebar = (open) => {
        if (!sidebar) return;
        if (isMobile()) {
            sidebar.classList.toggle('collapsed', !!open);
            mobileSidebarOverlay.classList.toggle('show', !!open);
            document.body.classList.toggle('sidebar-mobile-open', !!open);
        } else {
            sidebar.classList.toggle('collapsed', !open);
            mobileSidebarOverlay.classList.remove('show');
            document.body.classList.remove('sidebar-mobile-open');
        }
    };
    if (sidebarToggle) {
        sidebarToggle.onclick = (e) => {
            e.preventDefault();
            setSidebar(!(sidebar?.classList.contains('collapsed')));
        };
    }
    mobileSidebarOverlay.onclick = () => setSidebar(false);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isMobile()) setSidebar(false); });
    window.addEventListener('resize', () => { if (!isMobile()) setSidebar(false); });

    // Capture navigation in one place so the older listeners cannot leave
    // the mobile sidebar in the wrong state.
    document.querySelectorAll('.nav-links .nav-item').forEach(item => {
        item.addEventListener('click', () => {
            if (isMobile()) setSidebar(false);
        }, true);
    });
    if (isMobile()) setSidebar(false);

    // ---------------------------------------------------------------
    // Realtime order status: optimistic local update + Firebase source of truth.
    // This fixes the need to manually refresh.
    // ---------------------------------------------------------------
    const renderOrdersNow = () => {
        try { window.renderOrdersTable?.(); } catch (e) { console.error(e); }
        try { window.updateStatusSummary?.(); } catch (e) {}
        try { window.updateChartsData?.(); } catch (e) {}
        try { window.refreshExtraAnalytics?.(); } catch (e) {}
    };
    const previousUpdateOrderStatus = window.updateOrderStatus;
    window.updateOrderStatus = async (orderId, selectElement, displayId, oldStatus) => {
        const order = (window.allOrders || []).find?.(o => o.dbId === orderId) || (typeof allOrders !== 'undefined' ? allOrders.find(o => o.dbId === orderId) : null);
        const newStatus = selectElement?.value;
        if (!order || !newStatus) return previousUpdateOrderStatus?.(orderId, selectElement, displayId, oldStatus);
        if (typeof window.hasDashboardPermission === 'function' && !window.hasDashboardPermission('orders','changeStatus')) {
            if (selectElement) selectElement.value = oldStatus;
            return window.showAlert?.('ليس لديك صلاحية لتغيير حالة الطلب!','error');
        }
        if (newStatus === oldStatus) return;

        const before = { status: order.status, processedAt: order.processedAt, shippedAt: order.shippedAt, deliveredAt: order.deliveredAt, customerConfirmation: order.customerConfirmation };
        const now = Date.now();
        const updates = { status: newStatus };
        if (newStatus === 'جاري التجهيز') updates.processedAt = now;
        if (newStatus === 'تم الشحن') updates.shippedAt = now;
        if (newStatus === 'تم تسليمه') updates.deliveredAt = now;

        // Optimistic update: the row moves tabs immediately.
        Object.assign(order, updates);
        if (newStatus === 'جاري التجهيز' && oldStatus !== 'جاري التجهيز') {
            order.customerConfirmation = { status: 'sending', requestedAt: now };
        }
        renderOrdersNow();

        try {
            await update(ref(db, `orders/${orderId}`), updates);
            if (newStatus === 'جاري التجهيز' && oldStatus !== 'جاري التجهيز') {
                await window.sendOrderConfirmationWhatsApp?.(order);
            }
            const filter = document.getElementById('filterOrderStatus');
            if (filter && filter.value === oldStatus) filter.value = '';
            logAction('تحديث حالة طلب', `تغيير حالة الطلب #${displayId} لـ ${newStatus}`);
            window.showAlert?.(newStatus === 'جاري التجهيز' ? 'تم تحديث الحالة وإرسال طلب تأكيد العميل.' : 'تم تحديث الحالة بنجاح', 'success');
            renderOrdersNow();
        } catch (e) {
            console.error('Realtime status update failed', e);
            Object.assign(order, before);
            if (selectElement) selectElement.value = oldStatus;
            renderOrdersNow();
            window.showAlert?.('تعذر تحديث حالة الطلب. تم إرجاع الحالة السابقة.', 'error');
        }
    };

    // Make all-orders readable by this patch without changing existing globals.
    try { window.getAllOrdersForPatch = () => (typeof allOrders !== 'undefined' ? allOrders : []); } catch(e) {}

    // ---------------------------------------------------------------
    // Inventory stocktake module.
    // ---------------------------------------------------------------
    let inventoryTab = 'current';
    let inventoryAuditDraft = {};
    let inventoryAuditHistory = [];
    window.switchInventoryTab = (tab='current', btn) => {
        inventoryTab = tab;
        document.querySelectorAll('#inventory-view .custom-tab-btn').forEach(b => b.classList.remove('active'));
        (btn || document.getElementById(tab === 'current' ? 'inventoryCurrentTabBtn' : 'inventoryAuditTabBtn'))?.classList.add('active');
        const current = document.getElementById('inventory-current-panel');
        const audit = document.getElementById('inventory-audit-panel');
        if (current) current.style.display = tab === 'current' ? 'block' : 'none';
        if (audit) audit.style.display = tab === 'audit' ? 'block' : 'none';
        if (tab === 'audit') {
            initInventoryAuditDraft();
            renderInventoryAuditTable();
            renderInventoryAuditHistory();
        } else {
            window.renderInventoryTable?.();
        }
    };
    const activeProducts = () => (typeof allProducts !== 'undefined' ? allProducts : []).filter(p => p.isActive !== false);
    function initInventoryAuditDraft() {
        const products = activeProducts();
        products.forEach(p => {
            if (inventoryAuditDraft[p.id] === undefined) inventoryAuditDraft[p.id] = numFinal(p.stock);
        });
        Object.keys(inventoryAuditDraft).forEach(id => { if (!products.some(p => p.id === id)) delete inventoryAuditDraft[id]; });
    }
    window.fillInventoryAuditFromSystem = () => {
        inventoryAuditDraft = {};
        activeProducts().forEach(p => inventoryAuditDraft[p.id] = numFinal(p.stock));
        renderInventoryAuditTable();
        window.showAlert?.('تمت مطابقة كميات الجرد مع المخزون المسجل. عدّل الكميات الفعلية ثم احفظ.', 'success');
    };
    window.renderInventoryAuditTable = () => {
        const body = document.getElementById('inventoryAuditTableBody');
        if (!body) return;
        initInventoryAuditDraft();
        const term = (document.getElementById('searchInventoryAudit')?.value || '').toLowerCase();
        let increase = 0, decrease = 0, count = 0;
        const list = activeProducts().filter(p => String(p.name || '').toLowerCase().includes(term));
        body.innerHTML = list.map(p => {
            const system = numFinal(p.stock), actual = inventoryAuditDraft[p.id] === undefined ? system : numFinal(inventoryAuditDraft[p.id]);
            const diff = actual - system;
            count++;
            if (diff > 0) increase += diff;
            if (diff < 0) decrease += Math.abs(diff);
            const state = diff === 0 ? '<span class="badge badge-active">مطابق</span>' : diff > 0 ? `<span class="badge inventory-diff-plus">+${diff} زيادة</span>` : `<span class="badge badge-inactive">${diff} نقص</span>`;
            return `<tr><td><b>${escFinal(p.name)}</b></td><td>${system}</td><td><input class="inventory-audit-input" type="number" min="0" step="1" value="${actual}" data-product-id="${escFinal(p.id)}" onchange="window.updateInventoryAuditDraft(this)"></td><td class="inventory-diff-value ${diff>0?'plus':diff<0?'minus':''}">${diff>0?'+':''}${diff}</td><td>${state}</td></tr>`;
        }).join('') || '<tr><td colspan="5" style="text-align:center;padding:25px;color:#94a3b8">لا توجد منتجات مطابقة للبحث.</td></tr>';
        const itemsEl = document.getElementById('auditItemsCount'); if (itemsEl) itemsEl.innerText = count;
        const varianceEl = document.getElementById('auditVarianceCount'); if (varianceEl) varianceEl.innerText = `+${increase} / -${decrease}`;
    };
    window.updateInventoryAuditDraft = (input) => {
        const id = input?.dataset?.productId; if (!id) return;
        inventoryAuditDraft[id] = Math.max(0, Math.floor(numFinal(input.value)));
        renderInventoryAuditTable();
    };
    const renderInventoryAuditHistory = () => {
        const body = document.getElementById('inventoryAuditHistoryBody'); if (!body) return;
        const list = [...inventoryAuditHistory].sort((a,b) => numFinal(b.timestamp) - numFinal(a.timestamp)).slice(0, 12);
        const last = document.getElementById('auditLastDate'); if (last) last.innerText = list[0]?.timestamp ? formatDateTime(list[0].timestamp) : 'لم يتم بعد';
        body.innerHTML = list.map(a => `<tr><td dir="ltr">${escFinal(formatDateTime(a.timestamp))}</td><td>${numFinal(a.itemsCount)}</td><td style="color:#047857;font-weight:800">+${numFinal(a.increase)}</td><td style="color:#b91c1c;font-weight:800">-${numFinal(a.decrease)}</td><td>${escFinal(a.user || 'مدير')}</td></tr>`).join('') || '<tr><td colspan="5" style="text-align:center;padding:20px;color:#94a3b8">لا يوجد جرد سابق حتى الآن.</td></tr>';
    };
    window.saveInventoryAudit = async () => {
        if (typeof window.hasDashboardPermission === 'function' && !window.hasDashboardPermission('inventory','adjust')) return window.showAlert?.('ليس لديك صلاحية تعديل المخزون من خلال الجرد.','error');
        initInventoryAuditDraft();
        const products = activeProducts();
        const changes = products.map(p => ({ product: p, before: numFinal(p.stock), after: numFinal(inventoryAuditDraft[p.id]) })).filter(x => x.after !== x.before);
        const increase = changes.reduce((s,x)=>s + Math.max(0, x.after-x.before), 0);
        const decrease = changes.reduce((s,x)=>s + Math.max(0, x.before-x.after), 0);
        const auditId = `AUD-${Date.now()}`;
        const now = Date.now();
        try {
            for (const row of changes) {
                await update(ref(db, `products/${row.product.id}`), { stock: row.after });
                await push(ref(db,'inventoryMovements'), cleanData({
                    productId: row.product.id, productName: row.product.name,
                    before: row.before, after: row.after, reason: 'جرد مخزون', auditId,
                    difference: row.after-row.before, user: currentUser, timestamp: now
                }));
            }
            const audit = cleanData({ auditId, timestamp: now, itemsCount: products.length, changedItems: changes.length, increase, decrease, user: currentUser, status:'completed' });
            await set(ref(db, `inventoryAudits/${auditId}`), audit);
            inventoryAuditHistory.unshift(audit);
            inventoryAuditDraft = {};
            initInventoryAuditDraft();
            renderInventoryAuditTable();
            renderInventoryAuditHistory();
            logAction('جرد المخزون', `تم حفظ جرد للمخزون — ${changes.length} منتج متغير، زيادة ${increase} ونقص ${decrease}`);
            window.showAlert?.(changes.length ? `تم حفظ الجرد وتعديل ${changes.length} منتج.` : 'تم حفظ الجرد بدون فروقات.', 'success');
        } catch (e) {
            console.error('saveInventoryAudit', e);
            window.showAlert?.('تعذر حفظ الجرد: ' + (e.message || e), 'error');
        }
    };
    onValue(ref(db,'inventoryAudits'), snap => {
        inventoryAuditHistory = [];
        if (snap.exists()) snap.forEach(c => inventoryAuditHistory.push({id:c.key,...c.val()}));
        renderInventoryAuditHistory();
    });

    // ---------------------------------------------------------------
    // Customer reviews / trust gallery.
    // ---------------------------------------------------------------
    let allStoreReviews = [];
    let editingReviewId = null;
    window.openReviewModal = (id=null) => {
        if (id && typeof window.hasDashboardPermission === 'function' && !window.hasDashboardPermission('reviews','edit')) return window.showAlert?.('ليس لديك صلاحية تعديل آراء العملاء.','error');
        if (!id && typeof window.hasDashboardPermission === 'function' && !window.hasDashboardPermission('reviews','add')) return window.showAlert?.('ليس لديك صلاحية إضافة آراء العملاء.','error');
        editingReviewId = id;
        const r = id ? allStoreReviews.find(x=>x.id===id) : null;
        document.getElementById('reviewModalTitle').innerText = r ? 'تعديل رأي عميل' : 'إضافة رأي عميل';
        document.getElementById('reviewCustomerName').value = r?.customerName || '';
        document.getElementById('reviewRating').value = String(r?.rating || 5);
        document.getElementById('reviewText').value = r?.text || '';
        document.getElementById('reviewImageUrl').value = r?.imageUrl || '';
        document.getElementById('reviewIsActive').checked = r?.isActive !== false;
        const preview = document.getElementById('reviewImagePreview'); if (preview) preview.innerHTML = r?.imageUrl ? `<img src="${escFinal(r.imageUrl)}" alt="preview">` : '';
        const file = document.getElementById('reviewImageFile'); if (file) file.value = '';
        document.getElementById('reviewModal').style.display='flex';
    };
    document.getElementById('reviewImageFile')?.addEventListener('change', e => {
        const f = e.target.files?.[0];
        const box = document.getElementById('reviewImagePreview');
        if (!box) return;
        box.innerHTML = '';
        if (f) { const url = URL.createObjectURL(f); box.innerHTML = `<img src="${url}" alt="preview">`; }
    });
    window.saveReview = async () => {
        const name = document.getElementById('reviewCustomerName')?.value.trim() || 'عميل ModyStore';
        const text = document.getElementById('reviewText')?.value.trim() || '';
        const rating = Math.min(5, Math.max(1, Number(document.getElementById('reviewRating')?.value || 5)));
        const active = !!document.getElementById('reviewIsActive')?.checked;
        const file = document.getElementById('reviewImageFile')?.files?.[0];
        let imageUrl = document.getElementById('reviewImageUrl')?.value.trim() || '';
        if (!text) return window.showAlert?.('اكتب نص رأي العميل أولاً.','warning');
        if (editingReviewId ? !window.hasDashboardPermission?.('reviews','edit') : !window.hasDashboardPermission?.('reviews','add')) return window.showAlert?.('ليس لديك صلاحية حفظ آراء العملاء.','error');
        try {
            if (file) {
                const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
                const path = `storeReviews/${Date.now()}_${safeName}`;
                const sref = storageRef(storage, path);
                await uploadBytes(sref, file);
                imageUrl = await getDownloadURL(sref);
            }
            const data = cleanData({ customerName:name, text, rating, imageUrl:imageUrl||null, isActive:active, updatedAt:Date.now() });
            if (editingReviewId) {
                await update(ref(db,`storeReviews/${editingReviewId}`), data);
                logAction('تعديل رأي عميل', `تعديل رأي ${name}`);
            } else {
                data.createdAt=Date.now(); data.createdBy=currentUser;
                const newRef=push(ref(db,'storeReviews')); await set(newRef,data);
                logAction('إضافة رأي عميل', `إضافة رأي ${name}`);
            }
            closeModal('reviewModal');
            window.showAlert?.('تم حفظ رأي العميل بنجاح.', 'success');
        } catch(e) {
            console.error('saveReview', e);
            window.showAlert?.('تعذر حفظ الرأي أو رفع الصورة: ' + (e.message || e), 'error');
        }
    };
    window.toggleReview = async (id, active) => {
        if (!window.hasDashboardPermission?.('reviews','toggle')) return window.showAlert?.('ليس لديك صلاحية إظهار/إخفاء آراء العملاء.','error');
        try { await update(ref(db,`storeReviews/${id}`),{isActive:!active,updatedAt:Date.now()}); logAction('حالة رأي عميل', `${!active?'نشر':'إخفاء'} رأي عميل`); } catch(e) { window.showAlert?.('تعذر تغيير حالة الرأي.','error'); }
    };
    window.deleteReview = async (id) => {
        if (!window.hasDashboardPermission?.('reviews','delete')) return window.showAlert?.('ليس لديك صلاحية حذف آراء العملاء.','error');
        window.showConfirm?.('سيتم حذف الرأي نهائياً.', async () => { try { await remove(ref(db,`storeReviews/${id}`)); logAction('حذف رأي عميل','حذف رأي من معرض ثقة العملاء'); } catch(e) { window.showAlert?.('تعذر حذف الرأي.','error'); } });
    };
    window.renderReviews = () => {
        const grid = document.getElementById('reviewsGrid'); if (!grid) return;
        const term = (document.getElementById('searchReviews')?.value || '').toLowerCase();
        const status = document.getElementById('reviewStatusFilter')?.value || '';
        const list = allStoreReviews.filter(r => {
            const text = `${r.customerName||''} ${r.text||''}`.toLowerCase();
            const st = r.isActive === false ? 'inactive':'active';
            return text.includes(term) && (!status || status === st);
        }).sort((a,b)=>numFinal(b.createdAt)-numFinal(a.createdAt));
        grid.innerHTML = list.map(r => {
            const stars = '★'.repeat(Math.min(5,Math.max(1,numFinal(r.rating||5)))) + '☆'.repeat(5-Math.min(5,Math.max(1,numFinal(r.rating||5))));
            const image = r.imageUrl ? `<img src="${escFinal(r.imageUrl)}" alt="${escFinal(r.customerName||'Customer')}">` : `<div class="review-placeholder"><i class="fas fa-user"></i></div>`;
            return `<article class="review-admin-card ${r.isActive===false?'is-hidden':''}">\n                <div class="review-admin-image">${image}<span class="review-state-badge ${r.isActive===false?'hidden':'published'}">${r.isActive===false?'مخفي':'منشور'}</span></div>\n                <div class="review-admin-body"><div class="review-rating-stars">${stars}</div><h3>${escFinal(r.customerName||'عميل')}</h3><p>${escFinal(r.text||'')}</p><div class="review-admin-actions"><button class="btn-action btn-edit" onclick="openReviewModal('${escFinal(r.id)}')"><i class="fas fa-pen"></i></button><button class="btn-action btn-hide" onclick="toggleReview('${escFinal(r.id)}',${r.isActive!==false})"><i class="fas ${r.isActive===false?'fa-eye':'fa-eye-slash'}"></i></button><button class="btn-action btn-delete" onclick="deleteReview('${escFinal(r.id)}')"><i class="fas fa-trash"></i></button></div></div>\n            </article>`;
        }).join('') || '<div class="reviews-empty"><i class="fas fa-star"></i><h3>لا توجد آراء حتى الآن</h3><p>أضف أول رأي عميل لعرضه داخل المتجر.</p></div>';
        const published = allStoreReviews.filter(r=>r.isActive!==false);
        const named = published.filter(r=>String(r.customerName||'').trim());
        const avg = published.length ? published.reduce((s,r)=>s+numFinal(r.rating||0),0)/published.length : 0;
        const a=document.getElementById('reviewsAverageRating'); if(a)a.innerText=`${avg.toFixed(1)} / 5`;
        const pc=document.getElementById('reviewsPublishedCount'); if(pc)pc.innerText=published.length;
        const nc=document.getElementById('reviewsNamedCount'); if(nc)nc.innerText=named.length;
    };
    onValue(ref(db,'storeReviews'), snap => {
        allStoreReviews=[];
        if (snap.exists()) snap.forEach(c=>allStoreReviews.push({id:c.key,...c.val()}));
        renderReviews();
    });

    // ---------------------------------------------------------------
    // Product rating aggregation data.
    // ---------------------------------------------------------------
    let productRatings = {};
    onValue(ref(db,'productRatings'), snap => {
        productRatings = {};
        if (snap.exists()) snap.forEach(c => {
            const rows=[]; c.forEach(r=>rows.push(r.val()));
            const avg = rows.length ? rows.reduce((s,r)=>s+numFinal(r.rating),0)/rows.length : 0;
            productRatings[c.key] = { average: avg, count: rows.length };
            // Keep aggregate on the product itself so the storefront can read it directly.
            update(ref(db,`products/${c.key}`),{ratingAverage:Number(avg.toFixed(2)),ratingCount:rows.length}).catch(()=>{});
        });
        renderReviews();
    });

    // ---------------------------------------------------------------
    // WhatsApp confirmation bridge.
    // The browser never stores a WhatsApp secret; it calls a secure backend.
    // ---------------------------------------------------------------
    let whatsappConfirmationSettings = { enabled:false, endpoint:'', from:'' };
    const normalizeEgyptPhone = (phone='') => {
        let p = String(phone || '').replace(/[^0-9+]/g,'');
        if (p.startsWith('00')) p = '+' + p.slice(2);
        if (p.startsWith('+20')) return p.slice(1);
        if (p.startsWith('20')) return p;
        if (p.startsWith('0')) return '20' + p.slice(1);
        return p;
    };
    const buildWhatsAppMessage = (order) => {
        const id = order.displayId || order.orderId || order.dbId;
        const items = (order.items || []).map(i => `• ${i.name} × ${i.qty} — ${moneyFinal(i.qty * i.price)}`).join('\n');
        return `مرحباً ${order.customer?.name || ''} 👋\n\nتم تجهيز طلبك #${id} للمراجعة.\n\nالمنتجات:\n${items || 'لا توجد منتجات'}\n\nإجمالي الطلب: ${moneyFinal(order.total)}\n\nبرجاء تأكيد الطلب أو إلغائه من الأزرار الموجودة في رسالة WhatsApp.`;
    };
    window.sendOrderConfirmationWhatsApp = async (order) => {
        const phone = normalizeEgyptPhone(order?.customer?.phone);
        if (!phone) return;
        const payload = cleanData({
            orderDbId: order.dbId,
            orderId: order.displayId || order.orderId,
            customer: order.customer || {},
            phone,
            total: numFinal(order.total),
            items: (order.items||[]).map(i=>({id:i.id,name:i.name,qty:i.qty,price:i.price})),
            message: buildWhatsAppMessage(order),
            confirmationButtons: [
                {id:'confirm_order',title:'تأكيد الطلب'},
                {id:'cancel_order',title:'إلغاء الطلب'}
            ]
        });
        if (!whatsappConfirmationSettings.enabled || !whatsappConfirmationSettings.endpoint) {
            // Safe fallback: keep the dashboard state and offer a prefilled chat.
            const wa = `https://wa.me/${phone}?text=${encodeURIComponent(buildWhatsAppMessage(order))}`;
            order.customerConfirmation = { status:'manual', requestedAt:Date.now(), fallbackUrl:wa };
            try { await update(ref(db,`orders/${order.dbId}`),{customerConfirmation:order.customerConfirmation}); } catch(e) {}
            renderOrdersNow();
            return wa;
        }
        order.customerConfirmation = { status:'pending', requestedAt:Date.now() };
        renderOrdersNow();
        try {
            const res = await fetch(whatsappConfirmationSettings.endpoint, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
            if (!res.ok) throw new Error(`Backend ${res.status}`);
            const data = await res.json().catch(()=>({}));
            await update(ref(db,`orders/${order.dbId}`),{customerConfirmation:{status:'pending',requestedAt:payload.requestedAt||Date.now(),messageId:data.messageId||null}});
            return data;
        } catch(e) {
            console.error('WhatsApp confirmation send failed',e);
            const fallback = `https://wa.me/${phone}?text=${encodeURIComponent(buildWhatsAppMessage(order))}`;
            order.customerConfirmation = { status:'error', requestedAt:Date.now(), error:String(e.message||e), fallbackUrl:fallback };
            try { await update(ref(db,`orders/${order.dbId}`),{customerConfirmation:order.customerConfirmation}); } catch(ex) {}
            renderOrdersNow();
            window.showAlert?.('تعذر الإرسال التلقائي عبر WhatsApp. تم تجهيز رابط إرسال يدوي.', 'warning');
            return fallback;
        }
    };
    const syncWhatsAppSettings = d => {
        const w = d?.whatsappConfirmation || {};
        whatsappConfirmationSettings = { enabled:!!w.enabled, endpoint:String(w.endpoint||''), from:String(w.from||'') };
        const set=(id,val)=>{const e=document.getElementById(id);if(e)e.value=val||'';};
        const check=(id,val)=>{const e=document.getElementById(id);if(e)e.checked=!!val;};
        check('setWhatsappConfirmationEnabled',w.enabled); set('setWhatsappConfirmationEndpoint',w.endpoint); set('setWhatsappConfirmationFrom',w.from);
    };
    onValue(ref(db,'storeSettings'), snap => { if (snap.exists()) syncWhatsAppSettings(snap.val()||{}); });

    // Save WhatsApp fields together with the existing settings save by decorating it.
    const oldSaveSettingsFinal = window.saveSettings;
    window.saveSettings = async () => {
        if (window.currentUserRole !== 'Admin') return window.showAlert?.('الإعدادات متاحة للمدير فقط!','error');
        const result = await oldSaveSettingsFinal?.();
        const w = {
            enabled: !!document.getElementById('setWhatsappConfirmationEnabled')?.checked,
            endpoint: document.getElementById('setWhatsappConfirmationEndpoint')?.value.trim() || '',
            from: document.getElementById('setWhatsappConfirmationFrom')?.value.trim() || ''
        };
        await update(ref(db,'storeSettings'),{whatsappConfirmation:w});
        whatsappConfirmationSettings = w;
        return result;
    };

    // ---------------------------------------------------------------
    // Customer-confirmation realtime listener and dashboard notifications.
    // Backend/webhook should write: whatsappConfirmations/<orderDbId> = {status:'confirmed'|'cancelled',...}
    // ---------------------------------------------------------------
    let confirmationNotifications = [];
    onValue(ref(db,'whatsappConfirmations'), async snap => {
        confirmationNotifications=[];
        if (snap.exists()) snap.forEach(c => {
            const item={id:c.key,...c.val()};
            confirmationNotifications.push(item);
            const oid = item.orderDbId || c.key;
            const o = (typeof allOrders !== 'undefined' ? allOrders : []).find(x=>x.dbId===oid);
            if (o && ['confirmed','cancelled'].includes(item.status)) {
                const previous = o.customerConfirmation?.status;
                o.customerConfirmation = { ...o.customerConfirmation, ...item, status:item.status, updatedAt:item.updatedAt||Date.now() };
                if (previous !== item.status) {
                    push(ref(db,'dashboardNotifications'), cleanData({type:'order_confirmation',orderDbId:o.dbId,orderId:o.displayId||o.orderId,status:item.status,title:item.status==='confirmed'?'العميل أكد الطلب':'العميل ألغى الطلب',message:`الطلب #${o.displayId||o.orderId} — ${item.status==='confirmed'?'تم التأكيد من العميل':'تم الإلغاء من العميل'}`,read:false,timestamp:Date.now()})).catch(()=>{});
                    sendPushNotification(item.status==='confirmed'?'تم تأكيد طلب من العميل':'العميل ألغى طلباً', `الطلب #${o.displayId||o.orderId}`);
                }
            }
        });
        renderOrdersNow();
        renderDashboardNotifications();
    });
    let dashboardNotifications = [];
    onValue(ref(db,'dashboardNotifications'), snap => {
        dashboardNotifications=[];
        if (snap.exists()) snap.forEach(c=>dashboardNotifications.push({id:c.key,...c.val()}));
        renderDashboardNotifications();
    });
    const renderDashboardNotifications = () => {
        const list = document.getElementById('notifList');
        const badge = document.getElementById('notifCount');
        if (!list || !badge) return;
        const low = (typeof allProducts !== 'undefined' ? allProducts : []).filter(p=>(p.stock||0)<=5 && p.isActive);
        const confirmations = dashboardNotifications.filter(n=>n.type==='order_confirmation' && n.read!==true).sort((a,b)=>numFinal(b.timestamp)-numFinal(a.timestamp));
        const total = low.length + confirmations.length;
        badge.style.display = total ? 'block':'none';
        badge.innerText = total;
        list.innerHTML = `${confirmations.map(n=>`<div class="dashboard-notif-item confirmation-notif"><div class="dashboard-notif-icon"><i class="fas ${n.status==='confirmed'?'fa-check':'fa-xmark'}"></i></div><div><strong>${escFinal(n.title)}</strong><span>${escFinal(n.message)}</span></div></div>`).join('')}${confirmations.length && low.length ? '<div class="dashboard-notif-separator"></div>':''}${low.map(p=>`<div class="dashboard-notif-item"><img src="${escFinal(p.imageUrl||'https://via.placeholder.com/50')}" alt=""><div><strong>${escFinal(p.name)}</strong><span>الكمية المتبقية: ${numFinal(p.stock)}</span></div></div>`).join('')}${!total?'<div style="text-align:center;color:#94a3b8;padding:15px">لا توجد إشعارات حالياً</div>':''}`;
    };
    window.markNotificationsAsRead = async (e) => {
        e?.stopPropagation();
        const list = dashboardNotifications.filter(n=>n.type==='order_confirmation' && n.read!==true);
        await Promise.all(list.map(n=>update(ref(db,`dashboardNotifications/${n.id}`),{read:true}).catch(()=>{})));
        document.getElementById('notifCount').style.display='none';
        renderDashboardNotifications();
    };

    // ---------------------------------------------------------------
    // Order rendering override: adds customer confirmation state.
    // ---------------------------------------------------------------
    const baseRenderOrdersFinal = window.renderOrdersTable;
    window.renderOrdersTable = () => {
        const table = document.getElementById('ordersTableBody');
        if (!table) return baseRenderOrdersFinal?.();
        const allowed = typeof window.hasDashboardPermission === 'function' ? window.hasDashboardPermission('orders','view') : true;
        if (!allowed) { table.innerHTML='<tr><td colspan="8" style="text-align:center;padding:25px">لا تملك صلاحية عرض الطلبات.</td></tr>'; return; }
        const currentTab = typeof currentOrderTab !== 'undefined' ? currentOrderTab : 'active';
        const search = (document.getElementById('searchOrders')?.value||'').toLowerCase();
        const dateFilter = document.getElementById('filterOrderDate')?.value||'';
        const paymentFilter = document.getElementById('filterOrderPayment')?.value||'';
        const statusFilter = document.getElementById('filterOrderStatus')?.value||'';
        const orders = (typeof allOrders !== 'undefined' ? allOrders : []).filter(o=>{
            const tabMatch = currentTab==='active' ? ['قيد المراجعة','جاري التجهيز','تم الشحن'].includes(o.status) : ['تم تسليمه','ملغي','مرتجع'].includes(o.status);
            const searchMatch = [o.displayId,o.orderId,o.customer?.name,o.customer?.phone,o.source].some(v=>String(v??'').toLowerCase().includes(search));
            const dateMatch = !dateFilter || new Date(o.createdAt).toISOString().slice(0,10)===dateFilter;
            const payMatch = !paymentFilter || String(o.paymentMethod||'').includes(paymentFilter);
            const statusMatch = !statusFilter || o.status===statusFilter;
            return tabMatch && searchMatch && dateMatch && payMatch && statusMatch;
        });
        const count = document.getElementById('filteredOrdersCount'); if(count) count.innerText=orders.length;
        if(!orders.length){table.innerHTML='<tr><td colspan="8" style="text-align:center;padding:25px">لا توجد طلبات مطابقة للبحث.</td></tr>'; return;}
        const canChange = typeof window.hasDashboardPermission === 'function' ? window.hasDashboardPermission('orders','changeStatus') : true;
        const canDetails = typeof window.hasDashboardPermission === 'function' ? window.hasDashboardPermission('orders','details') : true;
        table.innerHTML = orders.map(order => {
            const statuses = ['قيد المراجعة','جاري التجهيز','تم الشحن','تم تسليمه','ملغي'];
            const options = statuses.map(st=>`<option value="${escFinal(st)}" ${order.status===st?'selected':''}>${st}</option>`).join('');
            const statusHtml = canChange ? `<select class="status-select" onchange="requestOrderStatusUpdate('${escFinal(order.dbId)}',this,'${escFinal(order.status)}','${escFinal(order.displayId||order.orderId)}')">${options}</select>` : `<span class="badge ${order.status==='تم الشحن'?'badge-active':'badge-inactive'}">${escFinal(order.status)}</span>`;
            const c = order.customerConfirmation || {};
            let confirmHtml = '<span class="order-confirmation-badge neutral">—</span>';
            if (order.status === 'جاري التجهيز' || c.status) {
                const st = c.status || 'pending';
                if (st === 'confirmed') confirmHtml='<span class="order-confirmation-badge confirmed"><i class="fas fa-circle-check"></i> تم التأكيد</span>';
                else if (st === 'cancelled') confirmHtml='<span class="order-confirmation-badge cancelled"><i class="fas fa-circle-xmark"></i> ألغاه العميل</span>';
                else if (st === 'error') confirmHtml=`<span class="order-confirmation-badge error"><i class="fas fa-triangle-exclamation"></i> فشل الإرسال</span>${c.fallbackUrl?`<a class="wa-fallback-link" href="${escFinal(c.fallbackUrl)}" target="_blank" rel="noopener">فتح WhatsApp</a>`:''}`;
                else if (st === 'manual') confirmHtml=`<span class="order-confirmation-badge manual"><i class="fab fa-whatsapp"></i> إرسال يدوي</span>${c.fallbackUrl?`<a class="wa-fallback-link" href="${escFinal(c.fallbackUrl)}" target="_blank" rel="noopener">فتح WhatsApp</a>`:''}`;
                else confirmHtml='<span class="order-confirmation-badge pending"><i class="fas fa-clock"></i> في انتظار العميل</span>';
            }
            return `<tr><td style="font-weight:900;color:var(--primary);">#${escFinal(order.displayId||order.orderId)}</td><td><b>${escFinal(order.customer?.name||'بدون اسم')}</b><br><span class="meta-info">${escFinal(order.paymentMethod||'الدفع عند الاستلام')}</span></td><td><span class="source-chip">${escFinal(order.source||'الموقع الإلكتروني')}</span></td><td dir="ltr" class="meta-info">${escFinal(formatDateTime(order.createdAt))}</td><td style="font-weight:bold;color:var(--secondary);">${Math.round(order.total||0)} ج.م</td><td>${statusHtml}</td><td>${confirmHtml}</td><td>${canDetails?`<button class="btn-action btn-view" onclick="viewOrderDetails('${escFinal(order.dbId)}')"><i class="fas fa-eye"></i></button>`:'—'}</td></tr>`;
        }).join('');
    };

    // Details modal: show confirmation state live.
    const oldViewDetailsFinal = window.viewOrderDetails;
    window.viewOrderDetails = id => {
        const result = oldViewDetailsFinal?.(id);
        const order = (typeof allOrders !== 'undefined' ? allOrders : []).find(o=>o.dbId===id);
        const box = document.getElementById('orderCustomerConfirmationBox');
        if (box) {
            const c=order?.customerConfirmation||{};
            const state = c.status==='confirmed' ? '<span class="order-confirmation-badge confirmed">✅ تم تأكيد الطلب من العميل</span>' : c.status==='cancelled' ? '<span class="order-confirmation-badge cancelled">❌ العميل ألغى الطلب</span>' : order?.status==='جاري التجهيز' ? '<span class="order-confirmation-badge pending">⏳ في انتظار تأكيد العميل</span>' : '';
            box.style.display=state?'block':'none'; box.innerHTML=state ? `<div><strong>حالة تأكيد العميل:</strong>${state}</div>` : '';
        }
        return result;
    };

    // Initialise audit + reviews visuals after DOM/auth are ready.
    setTimeout(() => {
        renderInventoryAuditHistory();
        if (window.__dashboardAuthReady) {
            try { window.applyDashboardPermissions?.(); } catch(e) {}
            try { renderReviews(); } catch(e) {}
            try { window.renderInventoryTable?.(); } catch(e) {}
        }
    }, 900);
})();
