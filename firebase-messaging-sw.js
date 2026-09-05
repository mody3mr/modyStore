importScripts('https://www.gstatic.com/firebasejs/10.1.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.1.0/firebase-messaging-compat.js');
firebase.initializeApp({apiKey:'AIzaSyBzXZ-olKlD76cCw5dtp8IU1qZMSKSTi1g',authDomain:'modytech-850c2.firebaseapp.com',projectId:'modytech-850c2',storageBucket:'modytech-850c2.firebasestorage.app',messagingSenderId:'909293461306',appId:'1:909293461306:web:48e5492107ad32ceec7a03'});
const messaging=firebase.messaging();
messaging.onBackgroundMessage(payload=>self.registration.showNotification(payload.notification?.title||'ModyStore',{body:payload.notification?.body||'لديك تحديث جديد',data:payload.data||{}}));
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>list[0]?.focus()||clients.openWindow('./index.html')))});
