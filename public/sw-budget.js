// SpendSmart Budget Alert Service Worker
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'BUDGET_ALERT') {
    self.registration.showNotification(e.data.title, {
      body: e.data.body,
      icon: '/logo192.png',
      badge: '/logo192.png',
      tag: 'budget-alert',
      renotify: true,
      vibrate: [200, 100, 200],
    });
  }
});
