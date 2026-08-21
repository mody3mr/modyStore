import { initializeApp } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-app.js";
import { getDatabase, ref, get, child, remove, update, onValue, push } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-database.js";
import { getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-auth.js";

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

let currentUser = "جاري التحميل...";
window.currentUserRole = "Supervisor"; 

// ==========================================
// تسجيل الدخول الصارم (Strict Auth)
// ==========================================
onAuthStateChanged(auth, (user) => {
    if (user) {
        get(ref(db, 'employees')).then((snapshot) => {
            let found = false;
            if (snapshot.exists()) {
                snapshot.forEach(child => {
                    if (child.val().email === user.email && child.val().isActive) {
                        currentUser = child.val().name;
                        window.currentUserRole = child.val().role;
                        // --- تطبيق الصلاحيات للمشرفين ---
                        const empData = child.val();
                        if (empData.role === 'Supervisor' && empData.permissions) {
                            // 1. إخفاء التابات اللي ملهوش صلاحية عليها
                            const allowedTabs = empData.permissions.tabs || [];
                            document.querySelectorAll('.nav-links .nav-item').forEach(nav => {
                                const target = nav.getAttribute('data-target');
                                // دائماً بنسيب الإحصائيات أو بنديله إذن، وباقي التابات بنشيك عليها
                                if (target && target !== 'analytics-view' && !allowedTabs.includes(target)) {
                                    nav.style.display = 'none';
                                }
                            });
                        }
                        // ---------------------------------
                        // --- تحديث بيانات الهيدر ---
                        const nameDisplay = document.getElementById("currentUserNameDisplay");
                        const avatar = document.getElementById("currentUserAvatar");
                        const dropName = document.getElementById("dropdownName");
                        const dropRole = document.getElementById("dropdownRole");
                        
                        if(nameDisplay) nameDisplay.innerText = currentUser;
                        if(dropName) dropName.innerText = currentUser;
                        if(dropRole) dropRole.innerText = window.currentUserRole === 'Admin' ? 'مدير النظام' : 'مشرف';
                        
                        if(avatar) {
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
        document.getElementById("alertMsg").innerText = msg;
        document.getElementById("customAlert").style.display = "flex";
    }
};

window.closeAlert = () => {
    document.getElementById("customAlert").style.display = "none";
};

let confirmCallback = null;

window.showConfirm = (msg, callback) => {
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

        document.getElementById('sidebar').classList.add('collapsed');
    });
});

window.goToOrdersTab = (tab = 'active') => {
    document.querySelector('[data-target="orders-view"]').click();
    window.switchOrderTab(tab);
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

let currentReportProducts = [];

window.generateReport = (filterType, element) => {
    if (element && element.tagName === "BUTTON") {
        document.querySelectorAll('.report-filters button').forEach(b => {
            b.classList.remove('active');
        });
        element.classList.add('active');
        if(document.getElementById("reportSpecificDate")) document.getElementById("reportSpecificDate").value = ""; 
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

    if(document.getElementById("reportTotalSales")) document.getElementById("reportTotalSales").innerText = Math.round(filteredTotal) + " ج.م";
    
    if(document.getElementById("reportPaymentBreakdown")) {
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
    }

    currentReportProducts = Object.values(productSales).sort((a, b) => {
        return b.qty - a.qty;
    }); 
    
    window.filterReportProducts();
};

window.filterReportProducts = () => {
    const termEl = document.getElementById("searchReportProducts");
    const term = termEl ? termEl.value.toLowerCase() : "";
    const div = document.getElementById("reportTopProducts");
    if(!div) return;
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

window.exportReportToExcel = () => {
    if (typeof XLSX === 'undefined') {
        return window.showAlert("برجاء إضافة مكتبة Excel في ملف HTML لتصدير الإحصائيات");
    }
    let formattedData = currentReportProducts.map(p => ({
        "اسم المنتج": p.name,
        "الكمية المباعة": p.qty,
        "الإيرادات (ج.م)": Math.round(p.revenue)
    }));
    let worksheet = XLSX.utils.json_to_sheet(formattedData);
    let workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sales Report");
    XLSX.writeFile(workbook, `Sales_Report_${new Date().getTime()}.xlsx`);
    logAction("تصدير تقرير", `تم تصدير تقرير المبيعات إلى إكسيل`);
};

window.exportReportToPDF = () => {
    window.print();
};

// ==========================================
// الرسوم البيانية
// ==========================================
let salesChart = null;
let ordersChart = null;

function initCharts() {
    const ctxSales = document.getElementById('salesChart');
    const ctxOrders = document.getElementById('ordersChart');
    
    if(ctxSales && !salesChart) {
        salesChart = new Chart(ctxSales, {
            type: 'line',
            data: { labels: [], datasets: [{ label: 'المبيعات (ج.م)', data: [], borderColor: '#3b82f6', tension: 0.3, fill: true, backgroundColor: 'rgba(59, 130, 246, 0.1)' }] },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
    
    if(ctxOrders && !ordersChart) {
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
    allOrders.forEach(o => {
        if(o.status === 'قيد المراجعة') counts.pending++;
        if(o.status === 'جاري التجهيز') counts.processing++;
        if(o.status === 'تم الشحن') counts.shipped++;
        if(o.status === 'تم تسليمه') counts.delivered++;
    });
    ordersChart.data.datasets[0].data = [counts.pending, counts.processing, counts.shipped, counts.delivered];
    ordersChart.update();
    render7DaysSales();
}

function render7DaysSales() {
    const tableBody = document.getElementById('last7DaysTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = "";
    
    let daysStats = {};
    for (let i = 6; i >= 0; i--) {
        let d = new Date();
        d.setDate(d.getDate() - i);
        let dateStr = d.toLocaleDateString('ar-EG');
        daysStats[dateStr] = { count: 0, revenue: 0 };
    }

    allOrders.forEach(order => {
        if(order.status === 'ملغي') return;
        let orderDate = new Date(order.createdAt).toLocaleDateString('ar-EG');
        if (daysStats[orderDate]) {
            daysStats[orderDate].count++;
            daysStats[orderDate].revenue += order.total;
        }
    });

    Object.keys(daysStats).forEach(date => {
        tableBody.innerHTML += `
            <tr>
                <td>${date}</td>
                <td>${daysStats[date].count}</td>
                <td style="font-weight:bold; color:var(--primary);">${Math.round(daysStats[date].revenue)} ج.م</td>
            </tr>
        `;
    });
}

// ==========================================
// إدارة الطلبات
// ==========================================
let allOrders = [];
let currentOrderTab = 'active';

window.switchOrderTab = (tab) => {
    currentOrderTab = tab;
    
    const btnActive = document.getElementById('tabActiveOrders');
    const btnArchived = document.getElementById('tabArchivedOrders');
    if(btnActive) btnActive.classList.toggle('active', tab === 'active');
    if(btnArchived) btnArchived.classList.toggle('active', tab === 'archived');
    
    const statusF = document.getElementById('filterOrderStatus');
    if(statusF) statusF.value = '';
    
    renderOrdersTable();
};

window.renderOrdersTable = () => {
    const table = document.getElementById("ordersTableBody");
    if(!table) return;
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

    const countEl = document.getElementById("filteredOrdersCount");
    if(countEl) countEl.innerText = filteredOrders.length;

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
                    ${(() => {
                       let availableStatuses = [];
                        if (window.currentUserRole === 'Admin') {
                            availableStatuses = ['قيد المراجعة', 'جاري التجهيز', 'تم الشحن', 'تم تسليمه', 'ملغي'];
                        } else {
                            if (order.status === 'قيد المراجعة') availableStatuses = ['قيد المراجعة', 'جاري التجهيز', 'ملغي'];
                            else if (order.status === 'جاري التجهيز') availableStatuses = ['جاري التجهيز', 'تم الشحن', 'ملغي'];
                            else if (order.status === 'تم الشحن') availableStatuses = ['تم الشحن', 'تم تسليمه', 'ملغي'];
                            else availableStatuses = [order.status];
                        }
                        
                        let sHtml = `<select class="status-select ${statusClass}" onchange="requestOrderStatusUpdate('${order.dbId}', this, '${order.status}', '${order.displayId || order.orderId}')" ${availableStatuses.length === 1 ? 'disabled' : ''}>`;
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

window.requestOrderStatusUpdate = (orderId, selectElement, oldStatus, displayId) => {
    const newStatus = selectElement.value;
    
    if (newStatus === 'ملغي') {
        if(typeof Swal !== 'undefined') {
            Swal.fire({
                title: 'إلغاء الطلب',
                text: 'اكتب سبب الإلغاء (سيظهر للعميل):',
                input: 'text',
                inputPlaceholder: 'سبب الإلغاء...',
                showCancelButton: true,
                confirmButtonText: 'إلغاء الطلب',
                cancelButtonText: 'تراجع',
                inputValidator: (value) => {
                    if (!value) {
                        return 'يجب كتابة سبب للإلغاء!';
                    }
                }
            }).then((result) => {
                if (result.isConfirmed) {
                    update(ref(db, `orders/${orderId}`), { 
                        status: newStatus, 
                        cancelledAt: Date.now(),
                        cancelReason: result.value 
                    }).then(() => {
                        logAction("تحديث حالة طلب", `تغيير حالة الطلب #${displayId} لـ ملغي بسبب: ${result.value}`);
                        window.showAlert("تم إلغاء الطلب بنجاح", "success");
                    });
                } else {
                    selectElement.value = oldStatus; 
                }
            });
        } else {
            let reason = prompt("اكتب سبب الإلغاء:");
            if(reason) {
                update(ref(db, `orders/${orderId}`), { status: newStatus, cancelledAt: Date.now(), cancelReason: reason });
                logAction("تحديث حالة طلب", `إلغاء طلب #${displayId} بسبب: ${reason}`);
            } else {
                selectElement.value = oldStatus;
            }
        }
    } else {
        if (window.currentUserRole === 'Supervisor') {
            window.showConfirm(`هل تريد إرسال طلب للمدير لتغيير حالة الطلب إلى "${newStatus}"؟`, () => {
                push(ref(db, 'order_requests'), { orderId, requestedStatus: newStatus, requestedBy: currentUser, timestamp: Date.now() });
                window.showAlert("تم إرسال الطلب للمدير بنجاح!", "success");
                selectElement.value = oldStatus; 
            });
            selectElement.value = oldStatus; 
        } else {
            updateOrderStatus(orderId, selectElement, displayId); 
        }
    }
};

window.updateOrderStatus = (orderId, selectElement, displayId) => {
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
        logAction("تحديث حالة طلب", `تغيير حالة الطلب #${displayId} لـ ${newStatus}`);
        window.showAlert("تم تحديث الحالة بنجاح", "success");
    });
};

// ==========================================
// تجهيز بوليصة الشحن وتفاصيل الطلب
// ==========================================
let currentPrintOrder = null;

window.viewOrderDetails = (orderDbId) => {
    const order = allOrders.find(o => o.dbId === orderDbId);
    if (!order) {
        return;
    }
    
    currentPrintOrder = order;

    document.getElementById("orderModalTitle").innerText = `تفاصيل الطلب: #${order.displayId || order.orderId}`;
    document.getElementById("oName").innerText = order.customer.name;
    document.getElementById("oPhone").innerText = order.customer.phone;
    document.getElementById("oAddress").innerText = order.customer.address;
    document.getElementById("oPayment").innerText = order.paymentMethod || "دفع عند الاستلام";

    if(document.getElementById("oSecretCode")) {
        document.getElementById("oSecretCode").innerText = order.secretCode || "غير متوفر";
    }
    
    if(document.getElementById("oCancelReasonBox")) {
        if(order.status === 'ملغي' && order.cancelReason) {
            document.getElementById("oCancelReasonBox").style.display = 'block';
            document.getElementById("oCancelReasonText").innerText = order.cancelReason;
        } else {
            document.getElementById("oCancelReasonBox").style.display = 'none';
        }
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
    const order = currentPrintOrder;
    if (!order) return;

    if (type === 'waybill') {
        JsBarcode("#topBarcode", order.displayId || order.orderId, { format: "CODE128", width: 2, height: 50, displayValue: true });
        document.getElementById("qrCodeBox").innerHTML = "";
        new QRCode(document.getElementById("qrCodeBox"), { text: "https://mody3mr.github.io/modytech/store", width: 55, height: 55 });
        const allowOpenSelect = document.getElementById("wbAllowOpen");
        if (allowOpenSelect) document.getElementById("printAllowOpen").innerText = allowOpenSelect.value;
        document.getElementById("printCustName").innerText = order.customer.name;
        
        let addrParts = [];
        if (order.customer && order.customer.address) addrParts = order.customer.address.split('-');
        document.getElementById("printCity").innerText = order.customer.city || addrParts[0] || "غير محدد";
        document.getElementById("printRegion").innerText = order.customer.region || addrParts[1] || "";
        document.getElementById("printAddress").innerText = order.customer.address || "-";
        
        if(document.getElementById("printBuilding")) document.getElementById("printBuilding").innerText = order.customer.building || "-";
        if(document.getElementById("printFloor")) document.getElementById("printFloor").innerText = order.customer.floor || "-";
        if(document.getElementById("printApartment")) document.getElementById("printApartment").innerText = order.customer.apartment || "-";
        if(document.getElementById("printLandmark")) document.getElementById("printLandmark").innerText = order.customer.landmark || "-";
        
        document.getElementById("printPhone1").innerText = order.customer.phone || "-";
        if(document.getElementById("printPhone2")) document.getElementById("printPhone2").innerText = order.customer.phone2 || "-";
        
        let descParts = [];
        order.items.forEach(i => descParts.push(`${i.qty}x ${i.name}`));
        document.getElementById("printProductsDesc").innerText = descParts.join(' ، ');
        
        let notesText = document.getElementById("wbNotes").value;
        document.getElementById("printNotes").innerText = !notesText ? "لا يوجد" : notesText;

        const codContainer = document.getElementById("codAmountContainer");
        const paidContainer = document.getElementById("paidAmountContainer");
        let payMethod = order.paymentMethod || "الدفع عند الاستلام (COD)";
        
        if (payMethod.includes("عند الاستلام") || payMethod.includes("COD") || payMethod.includes("كاش")) {
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
        if(document.getElementById("invOrderId")) document.getElementById("invOrderId").innerText = "#" + (order.displayId || order.orderId);
        if(document.getElementById("invDate")) document.getElementById("invDate").innerText = formatDateTime(order.createdAt);
        if(document.getElementById("invCustName")) document.getElementById("invCustName").innerText = order.customer.name;
        if(document.getElementById("invCustPhone")) document.getElementById("invCustPhone").innerText = order.customer.phone;
        if(document.getElementById("invCustAddress")) document.getElementById("invCustAddress").innerText = order.customer.address;
        
        const invItemsList = document.getElementById("invItemsList");
        if (invItemsList) {
            invItemsList.innerHTML = "";
            order.items.forEach(item => {
                invItemsList.innerHTML += `
                    <tr>
                        <td style="padding: 8px; border: 1px solid #ddd;">${item.name}</td>
                        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${item.qty}</td>
                        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${item.price} ج.م</td>
                        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${item.qty * item.price} ج.م</td>
                    </tr>`;
            });
        }
        
        if(document.getElementById("invSubtotal")) document.getElementById("invSubtotal").innerText = order.subtotal + " ج.م";
        if(document.getElementById("invDiscount")) document.getElementById("invDiscount").innerText = order.discount > 0 ? `-${Math.round(order.discount)} ج.م` : "0 ج.م";
        if(document.getElementById("invTotal")) document.getElementById("invTotal").innerText = Math.round(order.total) + " ج.م";

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
        
        allOrders.sort((a, b) => a.createdAt - b.createdAt);
        allOrders.forEach((order, index) => {
            order.displayId = String(index + 1).padStart(4, '0');
        });
        
        allOrders.reverse();
    }
    
    if(document.getElementById('statTotalOrders')) document.getElementById('statTotalOrders').innerText = ordersCount;
    if(document.getElementById('statTotalRevenue')) document.getElementById('statTotalRevenue').innerText = Math.round(totalRev) + " ج.م";
    if(document.getElementById('statPendingOrders')) document.getElementById('statPendingOrders').innerText = pending;
    
    if(typeof initCharts !== 'undefined') {
        initCharts();
        updateChartsData();
    }
    
    window.renderOrdersTable();
});

// ==========================================
// إدارة المنتجات
// ==========================================
let editingProductId = null;
let allProducts = [];
let currentProductTab = 'active';

window.switchProductTab = (tab, btn) => {
    currentProductTab = tab;
    document.querySelectorAll('#products-view .custom-tab-btn').forEach(b => b.classList.remove('active'));
    if(btn) btn.classList.add('active');
    filterProducts();
};

window.openProductModal = () => {
    editingProductId = null; 
    document.getElementById("productModalTitle").innerText = "إضافة منتج جديد";
    document.getElementById("prodName").value = ""; 
    document.getElementById("prodPrice").value = "";
    document.getElementById("prodDiscountPrice").value = ""; 
    if(document.getElementById("prodStock")) document.getElementById("prodStock").value = "10";
    if(document.getElementById("prodOfferDays")) document.getElementById("prodOfferDays").value = "";
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
    const stock = document.getElementById("prodStock") ? document.getElementById("prodStock").value : 0;
    const offerDays = document.getElementById("prodOfferDays") ? document.getElementById("prodOfferDays").value : "";
    
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
        stock: Number(stock) || 0,
        offerDays: offerDays ? Number(offerDays) : null,
        category: category, 
        description: description, 
        imageUrl: image || "https://via.placeholder.com/300" 
    };

    if (editingProductId) {
        update(ref(db, `products/${editingProductId}`), data).then(() => {
            window.closeModal('productModal');
            window.showAlert("تم التعديل بنجاح!", "success");
            logAction("تعديل منتج", `تعديل بيانات المنتج: ${data.name}`);
        });
    } else {
        data.isActive = true; 
        push(ref(db, 'products'), data).then(() => {
            window.closeModal('productModal');
            window.showAlert("تمت الإضافة بنجاح!", "success");
            logAction("إضافة منتج", `إنشاء منتج جديد: ${data.name}`);
        });
    }
};

window.filterProducts = () => {
    const term = document.getElementById("searchProducts").value.toLowerCase();
    const catF = document.getElementById("filterProductCat") ? document.getElementById("filterProductCat").value : "";
    const offerF = document.getElementById("filterProductOffers") ? document.getElementById("filterProductOffers").checked : false;
    const table = document.getElementById("productsTableBody"); 
    if(!table) return;
    table.innerHTML = "";
    
    let filtered = allProducts.filter(p => {
        let textMatch = p.name.toLowerCase().includes(term);
        let catMatch = catF ? p.category === catF : true;
        let offerMatch = offerF ? !!p.discountPrice : true;
        
        let tabMatch = true;
        if (currentProductTab === 'active') tabMatch = p.isActive;
        else if (currentProductTab === 'inactive') tabMatch = !p.isActive;
        else if (currentProductTab === 'lowstock') tabMatch = (p.stock || 0) <= 5;
        
        return textMatch && catMatch && offerMatch && tabMatch;
    });
    
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
                        <button class="btn-action btn-hide" style="background-color: ${toggleBg}" onclick="toggleProduct('${p.id}', ${p.isActive}, '${p.name}')">
                            <i class="fas ${toggleIcon}"></i>
                        </button>
                        <button class="btn-action btn-delete" onclick="deleteProduct('${p.id}', '${p.name}')">
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

window.deleteProduct = (id, name) => {
    window.showConfirm("هل تريد حذف هذا المنتج نهائياً؟", () => {
        remove(ref(db, `products/${id}`)).then(() => {
            window.showAlert("تم الحذف", "success");
            logAction("حذف منتج", `تم حذف المنتج: ${name}`);
        });
    });
};

window.toggleProduct = (id, status, name) => {
    update(ref(db, `products/${id}`), { isActive: !status }).then(() => {
        logAction("حالة منتج", `تغيير حالة المنتج ${name} إلى ${!status ? 'معروض' : 'مخفي'}`);
    });
};

window.editProduct = (id) => {
    editingProductId = id; 
    const p = allProducts.find(x => x.id === id);
    
    document.getElementById("prodName").value = p.name; 
    document.getElementById("prodPrice").value = p.price;
    document.getElementById("prodDiscountPrice").value = p.discountPrice || ""; 
    if(document.getElementById("prodStock")) document.getElementById("prodStock").value = p.stock || 0;
    if(document.getElementById("prodOfferDays")) document.getElementById("prodOfferDays").value = p.offerDays || "";
    document.getElementById("prodDesc").value = p.description || "";
    document.getElementById("prodImage").value = p.imageUrl || ""; 
    
    setTimeout(() => {
        document.getElementById("prodCategory").value = p.category;
    }, 100);
    
    document.getElementById("productModalTitle").innerText = "تعديل المنتج"; 
    document.getElementById('productModal').style.display = "flex";
};

// ==========================================
// الأقسام
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
    if (!name) return;
    
    if (editingCatId) {
        update(ref(db, `categories/${editingCatId}`), { name }).then(() => {
            window.closeModal('categoryModal');
            window.showAlert("تم التعديل", "success");
            logAction("تعديل قسم", `تعديل اسم القسم إلى: ${name}`);
        });
    } else {
        push(ref(db, 'categories'), { name: name, isActive: true }).then(() => {
            window.closeModal('categoryModal');
            window.showAlert("تم إضافة القسم", "success");
            logAction("إضافة قسم", `إنشاء قسم جديد: ${name}`);
        });
    }
};

window.editCategory = (id, name) => { 
    editingCatId = id; 
    document.getElementById("catNameInput").value = name; 
    document.getElementById('categoryModal').style.display = "flex"; 
};

window.deleteCategory = (id, name) => {
    window.showConfirm("هل متأكد من حذف القسم؟", () => {
        remove(ref(db, `categories/${id}`)).then(() => {
            logAction("حذف قسم", `حذف القسم: ${name}`);
        });
    });
};

window.filterCategories = () => {
    const term = document.getElementById("searchCategories").value.toLowerCase();
    const table = document.getElementById("categoriesTableBody"); 
    const select1 = document.getElementById("prodCategory");
    const select2 = document.getElementById("filterProductCat");
    
    if(!table) return;
    table.innerHTML = ""; 
    if(select1) select1.innerHTML = "";
    if (select2) select2.innerHTML = "<option value=''>كل الأقسام</option>";
    
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
                        <button class="btn-action btn-delete" onclick="deleteCategory('${c.id}', '${c.name}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
            
        let opt = `<option value="${c.name}">${c.name}</option>`;
        if(select1) select1.innerHTML += opt;
        if (select2) select2.innerHTML += opt;
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
// الكوبونات
// ==========================================
let editingVoucherId = null; 
let allVouchers = [];
let currentVoucherTab = 'active';

window.switchVoucherTab = (tab, btn) => {
    currentVoucherTab = tab;
    document.querySelectorAll('#vouchers-view .custom-tab-btn').forEach(b => b.classList.remove('active'));
    if(btn) btn.classList.add('active');
    filterVouchers();
};

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
    
    if (!code || !value) return;
    
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
            logAction("تعديل كوبون", `تعديل الكود: ${code}`);
        });
    } else {
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
    editingVoucherId = id; 
    const v = allVouchers.find(x => x.id === id); 
    
    document.getElementById("voucherCode").value = v.code; 
    document.getElementById("voucherType").value = v.type; 
    document.getElementById("voucherValue").value = v.value; 
    document.getElementById("voucherLimit").value = v.usageLimit || 1; 
    document.getElementById('voucherModal').style.display = "flex"; 
};

window.toggleVoucher = (id, status, code) => {
    update(ref(db, `vouchers/${id}`), { isActive: !status }).then(() => {
        logAction("حالة كوبون", `تغيير حالة الكود ${code} إلى ${!status ? 'مفعل' : 'معطل'}`);
    });
};

window.deleteVoucher = (id, code) => {
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
    const term = document.getElementById("searchVouchers").value.toLowerCase();
    const table = document.getElementById("vouchersTableBody"); 
    if(!table) return;
    table.innerHTML = "";
    
    let filtered = allVouchers.filter(v => {
        let textMatch = v.code.toLowerCase().includes(term);
        let tabMatch = currentVoucherTab === 'active' ? v.isActive : !v.isActive;
        return textMatch && tabMatch;
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
                        <button class="btn-action btn-hide" style="background-color: ${toggleBg}" onclick="toggleVoucher('${v.id}', ${v.isActive}, '${v.code}')" title="${toggleTitle}"><i class="fas ${toggleIcon}"></i></button>
                        <button class="btn-action btn-delete" onclick="deleteVoucher('${v.id}', '${v.code}')"><i class="fas fa-trash"></i></button>
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
// إدارة الموظفين
// ==========================================
let editingEmpId = null; 
let allEmployees = [];

window.toggleEmployeePermissionsUI = () => {
    if(document.getElementById("permissionsUI")) {
        document.getElementById("permissionsUI").style.display = document.getElementById("empRole").value === 'Supervisor' ? 'block' : 'none';
    }
}

window.openEmployeeModal = () => { 
    editingEmpId = null; 
    document.getElementById("empName").value = ""; 
    document.getElementById("empPhone").value = ""; 
    if(document.getElementById("empEmail")) document.getElementById("empEmail").value = "";
    if(document.getElementById("empPass")) document.getElementById("empPass").value = "";
    document.getElementById('employeeModal').style.display = "flex"; 
};

// دالة حفظ موظف وتوليد حساب له في الـ Auth أوتوماتيك
window.saveEmployee = async () => { 
    let permissions = { tabs: [], canAdd: false, canEdit: false, canDelete: false, canChangeStatus: false };
    if (document.getElementById("empRole").value === 'Supervisor') {
        if (document.querySelectorAll('.perm-tab')) {
            document.querySelectorAll('.perm-tab:checked').forEach(cb => permissions.tabs.push(cb.value));
        }
        if (document.getElementById("permChangeOrderStatus")) {
            permissions.canChangeStatus = document.getElementById("permChangeOrderStatus").checked;
        }
        if(document.getElementById("permAdd")) permissions.canAdd = document.getElementById("permAdd").checked;
        if(document.getElementById("permEdit")) permissions.canEdit = document.getElementById("permEdit").checked;
        if(document.getElementById("permDelete")) permissions.canDelete = document.getElementById("permDelete").checked;
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
        if(!emailVal || !passVal) {
            return window.showAlert("البريد الإلكتروني وكلمة المرور مطلوبين لإنشاء حساب تسجيل الدخول!");
        }

        try {
            const secondaryApp = initializeApp(firebaseConfig, "SecondaryAppInstance");
            const secondaryAuth = getAuth(secondaryApp);
            
            await createUserWithEmailAndPassword(secondaryAuth, emailVal, passVal);
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
            
            await push(ref(db, 'employees'), newEmpData);
            
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
    editingEmpId = id; 
    const e = allEmployees.find(x => x.id === id);
    
    document.getElementById("empName").value = e.name; 
    document.getElementById("empPhone").value = e.phone || ""; 
    if(document.getElementById("empEmail")) document.getElementById("empEmail").value = e.email || ""; 
    if(document.getElementById("empPass")) document.getElementById("empPass").value = e.password || ""; 
    document.getElementById("empRole").value = e.role || "Admin"; 
    
    if (e.role === 'Supervisor' && e.permissions) {
        if(document.querySelectorAll('.perm-tab')) {
            document.querySelectorAll('.perm-tab').forEach(cb => {
                cb.checked = e.permissions.tabs.includes(cb.value);
            });
        }
        if (document.getElementById("permChangeOrderStatus")) {
            document.getElementById("permChangeOrderStatus").checked = e.permissions.canChangeStatus || false;
        }
        if(document.getElementById("permAdd")) document.getElementById("permAdd").checked = e.permissions.canAdd || false;
        if(document.getElementById("permEdit")) document.getElementById("permEdit").checked = e.permissions.canEdit || false;
        if(document.getElementById("permDelete")) document.getElementById("permDelete").checked = e.permissions.canDelete || false;
        
        window.toggleEmployeePermissionsUI();
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
        });
    });
};

window.filterEmployees = () => {
    const term = document.getElementById("searchEmployees").value.toLowerCase();
    const table = document.getElementById("employeesTableBody"); 
    if(!table) return;
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
// سجل النشاطات والأرشفة 
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
    if(!table) return;
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

        if(d.paymentMethods) {
            if(document.getElementById("setPayCod")) document.getElementById("setPayCod").checked = d.paymentMethods.cod;
            if(document.getElementById("setPayWallet")) document.getElementById("setPayWallet").checked = d.paymentMethods.wallet;
            if(document.getElementById("setPayInsta")) document.getElementById("setPayInsta").checked = d.paymentMethods.instapay;
            if(document.getElementById("setPayVisa")) document.getElementById("setPayVisa").checked = d.paymentMethods.visa;
        }
    }
});

window.goToPendingOrders = () => {
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
    const orderNavItem = document.querySelector('[data-target="orders-view"]');
    if(orderNavItem) orderNavItem.classList.add('active');

    document.querySelectorAll('.view-section').forEach(view => view.classList.remove('active'));
    const ordersView = document.getElementById('orders-view');
    if(ordersView) ordersView.classList.add('active');

    document.getElementById('sidebar').classList.add('collapsed');

    window.switchOrderTab('active');
    
    setTimeout(() => {
        const statusF = document.getElementById('filterOrderStatus');
        if (statusF) {
            statusF.value = 'قيد المراجعة';
            window.renderOrdersTable();
        }
    }, 50);
};

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
