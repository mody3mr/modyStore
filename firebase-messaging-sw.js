/* Firebase background notifications for the dashboard. */
importScripts('https://www.gstatic.com/firebasejs/10.1.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.1.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: 'AIzaSyBzXZ-olKlD76cCw5dtp8IU1qZMSKSTi1g',
    authDomain: 'modytech-850c2.firebaseapp.com',
    projectId: 'modytech-850c2',
    storageBucket: 'modytech-850c2.firebasestorage.app',
    messagingSenderId: '909293461306',
    appId: '1:909293461306:web:48e5492107ad32ceec7a03'
});

const messaging = firebase.messaging();
messaging.onBackgroundMessage(payload => {
    const title = payload.notification?.title || payload.data?.title || 'ModyStore';
    const options = {
        body: payload.notification?.body || payload.data?.body || 'لديك تحديث جديد',
        icon: payload.notification?.icon || './icon-192.png',
        data: payload.data || {}
    };
    self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
        const existing = list.find(client => 'focus' in client);
        return existing ? existing.focus() : clients.openWindow('./index.html');
    }));
});
