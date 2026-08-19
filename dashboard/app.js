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

// Helper Functions
window.closeModal = (id) => document.getElementById(id).style.display = 'none';

function logAction(actionName, details) {
    push(ref(db, 'logs'), { action: actionName, details: details, user: currentUser, timestamp: Date.now() });
}

function formatDateTime(ms) {
    if(!ms) return "";
    return new Date(ms).toLocaleString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function formatDateOnly(ms) {
    if(!ms) return "";
    return new Date(ms).toLocaleDateString('ar-EG');
}

// Navigation
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        if(!item.dataset.target) return;
        document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        document.querySelectorAll('.view-section').forEach(view => view.classList.remove('active'));
        document.getElementById(item.dataset.target).classList.add('active');
    });
});

// ==========================================
// إدارة الطلبات (Orders Management)
// ==========================================
let allOrders = [];

window.updateOrderStatus = (orderId, selectElement) => {
    const newStatus = selectElement.value;
    selectElement.className = "status-select"; 
    if(newStatus === 'قيد المراجعة') selectElement.classList.add('status-pending');
    else if(newStatus === 'جاري التجهيز') selectElement.classList.add('status-processing');
    else if(newStatus === 'تم الشحن') selectElement.classList.add('status-shipped');
    else if(newStatus === 'تم الاستلام') selectElement.classList.add('status-delivered');
    else if(newStatus === 'ملغي') selectElement.classList.add('status-cancelled');

    update(ref(db, `orders/${orderId}`), { status: newStatus }).then(() => {
        logAction("تحديث حالة طلب", `تغيير حالة الطلب لـ ${newStatus}`);
    });
};

window.viewOrderDetails = (orderDbId) => {
    const order = allOrders.find(o => o.dbId === orderDbId);
    if(!order) return;

    document.getElementById("orderModalTitle").innerText = `تفاصيل الطلب: ${order.orderId}`;
    document.getElementById("oName").innerText = order.customer.name;
    document.getElementById("oPhone").innerText = order.customer.phone;
    document.getElementById("oAddress").innerText = order.customer.address;
    document.getElementById("oPayment").innerText = order.paymentMethod || "غير محدد";

    const list = document.getElementById("oItemsList");
    list.innerHTML = "";
    order.items.forEach(item => {
        list.innerHTML += `<div class="order-item-row">
            <span>${item.qty}x ${item.name}</span>
            <span>${item.qty * item.price} ج.م</span>
        </div>`;
    });

    document.getElementById("oSubtotal").innerText = `${order.subtotal} ج.م`;
    if(order.discount && order.discount > 0) {
        document.getElementById("oDiscountDiv").style.display = "block";
        document.getElementById("oDiscount").innerText = `-${order.discount} ج.م`;
    } else {
        document.getElementById("oDiscountDiv").style.display = "none";
    }
    document.getElementById("oTotal").innerText = `${order.total} ج.م`;

    document.getElementById("orderDetailsModal").style.display = "flex";
};

onValue(ref(db, 'orders'), (snapshot) => {
    const table = document.getElementById("ordersTableBody");
    table.innerHTML = "";
    allOrders = [];

    if (snapshot.exists()) {
        snapshot.forEach(child => {
            let order = child.val();
            order.dbId = child.key;
            allOrders.push(order);
        });
        
        allOrders.reverse(); 

        allOrders.forEach(order => {
            const statusClass = order.status === 'قيد المراجعة' ? 'status-pending' : 
                                order.status === 'جاري التجهيز' ? 'status-processing' : 
                                order.status === 'تم الشحن' ? 'status-shipped' : 
                                order.status === 'تم الاستلام' ? 'status-delivered' : 'status-cancelled';
            
            table.innerHTML += `
                <tr>
                    <td style="font-weight:900; color:var(--primary);">${order.orderId}</td>
                    <td>
                        <b>${order.customer.name}</b><br>
                        <span class="meta-info">${order.paymentMethod || "دفع عند الاستلام"}</span>
                    </td>
                    <td dir="ltr" class="meta-info">${formatDateTime(order.createdAt)}</td>
                    <td style="font-weight:bold; color:var(--secondary);">${order.total} ج.م</td>
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
    } else {
        table.innerHTML = "<tr><td colspan='6' style='text-align:center;'>لا توجد طلبات حتى الآن.</td></tr>";
    }
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

    if(!name || !price || !category) return alert("الاسم والسعر والقسم مطلوبين!");

    const productData = { 
        name, price: Number(price), 
        discountPrice: discountPrice ? Number(discountPrice) : null,
        category, description, 
        imageUrl: image || "https://via.placeholder.com/300x300?text=صورة+المنتج",
    };

    if (editingProductId) {
        productData.updatedAt = Date.now();
        productData.updatedBy = currentUser;
        update(ref(db, `products/${editingProductId}`), productData).then(() => {
            logAction("تعديل منتج", `تم تعديل المنتج: ${name}`);
            closeModal('productModal');
        });
    } else {
        productData.isActive = true;
        productData.createdAt = Date.now();
        productData.createdBy = currentUser;
        push(ref(db, 'products'), productData).then(() => {
            logAction("إضافة منتج", `تم إضافة منتج: ${name}`);
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

            let priceDisplay = `${p.price} ج.م`;
            if (p.discountPrice) {
                priceDisplay = `<del style="color:#94a3b8; font-size:13px;">${p.price}</del> <span style="color:var(--accent); font-weight:bold;">${p.discountPrice} ج.م</span> <span class="badge badge-discount">عرض</span>`;
            }

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
    } else {
        table.innerHTML = "<tr><td colspan='5' style='text-align:center;'>لا توجد منتجات</td></tr>";
    }
});

window.deleteProduct = (id, name) => confirm("حذف المنتج؟") && remove(ref(db, `products/${id}`)).then(() => logAction("حذف منتج", `حذف المنتج: ${name}`));
window.toggleProduct = (id, status, name) => update(ref(db, `products/${id}`), { isActive: !status }).then(() => logAction(status ? "إخفاء منتج" : "إظهار منتج", `تغيير حالة المنتج: ${name}`));
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
// باقي الأقسام والكوبونات والموظفين والسجل
// ==========================================
let editingCatId = null;
window.openCategoryModal = () => { editingCatId = null; document.getElementById("catNameInput").value = ""; document.getElementById('categoryModal').style.display = "flex"; };
window.saveCategory = () => {
    const name = document.getElementById("catNameInput").value.trim();
    if(!name) return;
    if(editingCatId) update(ref(db, `categories/${editingCatId}`), { name }).then(() => closeModal('categoryModal'));
    else push(ref(db, 'categories'), { name, isActive: true }).then(() => closeModal('categoryModal'));
};
onValue(ref(db, 'categories'), (snapshot) => {
    const table = document.getElementById("categoriesTableBody");
    const select = document.getElementById("prodCategory");
    table.innerHTML = ""; select.innerHTML = "";
    if (snapshot.exists()) {
        snapshot.forEach(child => {
            const c = child.val();
            table.innerHTML += `<tr><td><b>${c.name}</b></td><td><span class="badge ${c.isActive ? 'badge-active' : 'badge-inactive'}">${c.isActive ? 'مفعل' : 'مخفي'}</span></td><td><button class="btn-action btn-delete" onclick="remove(ref(db, 'categories/${child.key}'))"><i class="fas fa-trash"></i></button></td></tr>`;
            select.innerHTML += `<option value="${c.name}">${c.name}</option>`;
        });
    }
});

let editingVoucherId = null;
window.openVoucherModal = () => { editingVoucherId = null; document.getElementById("voucherCode").value = ""; document.getElementById("voucherValue").value = ""; document.getElementById('voucherModal').style.display = "flex"; };
window.saveVoucher = () => {
    const code = document.getElementById("voucherCode").value.trim().toUpperCase();
    const type = document.getElementById("voucherType").value;
    const value = document.getElementById("voucherValue").value;
    if(!code || !value) return;
    if(editingVoucherId) update(ref(db, `vouchers/${editingVoucherId}`), { code, type, value: Number(value) }).then(() => closeModal('voucherModal'));
    else push(ref(db, 'vouchers'), { code, type, value: Number(value), isActive: true }).then(() => closeModal('voucherModal'));
};
onValue(ref(db, 'vouchers'), (snapshot) => {
    const table = document.getElementById("vouchersTableBody");
    table.innerHTML = "";
    if (snapshot.exists()) {
        snapshot.forEach(child => {
            const v = child.val();
            table.innerHTML += `<tr><td><b>${v.code}</b></td><td>${v.value} ${v.type==='percentage'?'%':'ج.م'}</td><td><span class="badge ${v.isActive ? 'badge-active' : 'badge-inactive'}">${v.isActive ? 'مفعل' : 'مخفي'}</span></td><td><button class="btn-action btn-delete" onclick="remove(ref(db, 'vouchers/${child.key}'))"><i class="fas fa-trash"></i></button></td></tr>`;
        });
    }
});

window.openEmployeeModal = () => { document.getElementById("empName").value = ""; document.getElementById('employeeModal').style.display = "flex"; };
window.saveEmployee = () => {
    const name = document.getElementById("empName").value;
    if(!name) return;
    push(ref(db, 'employees'), { name, phone: document.getElementById("empPhone").value, role: document.getElementById("empRole").value, isActive: true, createdAt: Date.now() }).then(() => closeModal('employeeModal'));
};
onValue(ref(db, 'employees'), (snapshot) => {
    const table = document.getElementById("employeesTableBody");
    table.innerHTML = "";
    if (snapshot.exists()) {
        snapshot.forEach(child => {
            const e = child.val();
            table.innerHTML += `<tr><td><b>${e.name}</b><div class="emp-details">${formatDateOnly(e.createdAt)}</div></td><td>${e.phone}</td><td>${e.role}</td><td><span class="badge badge-active">نشط</span></td><td><button class="btn-action btn-delete" onclick="remove(ref(db, 'employees/${child.key}'))"><i class="fas fa-trash"></i></button></td></tr>`;
        });
    }
});

onValue(ref(db, 'logs'), (snapshot) => {
    const table = document.getElementById("logsTableBody");
    table.innerHTML = "";
    if (snapshot.exists()) {
        const logs = [];
        snapshot.forEach(child => logs.push(child.val()));
        logs.reverse().forEach(log => {
            table.innerHTML += `<tr><td style="font-weight:bold; color:var(--primary);">${log.action}</td><td>${log.details}</td><td>${log.user}</td><td dir="ltr" style="font-size:12px;">${formatDateTime(log.timestamp)}</td></tr>`;
        });
    }
});
