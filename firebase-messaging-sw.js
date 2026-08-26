/* ModyStore Firebase Cloud Messaging service worker */
importScripts('https://www.gstatic.com/firebasejs/10.1.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.1.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBzXZ-olKlD76cCw5dtp8IU1qZMSKSTi1g",
  authDomain: "modytech-850c2.firebaseapp.com",
  projectId: "modytech-850c2",
  storageBucket: "modytech-850c2.firebasestorage.app",
  messagingSenderId: "909293461306",
  appId: "1:909293461306:web:48e5492107ad32ceec7a03"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || 'ModyStore';
  const body = payload.notification?.body || payload.data?.body || 'لديك طلب جديد';
  self.registration.showNotification(title, {
    body,
    icon: './favicon.svg',
    badge: './favicon.svg',
    dir: 'rtl',
    lang: 'ar',
    data: payload.data || {}
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification?.data?.url || './index.html';
  event.waitUntil(clients.matchAll({type:'window', includeUncontrolled:true}).then(list => {
    for (const client of list) {
      if ('focus' in client) { client.focus(); client.navigate(target); return; }
    }
    return clients.openWindow(target);
  }));
});
