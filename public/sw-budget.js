// Production build injects the complete release precache into these declarations.
const CACHE_NAME = 'spendsmart-offline-development'; // BUILD_CACHE_NAME
const PRECACHE_ASSETS = ['index.html', 'manifest.json', 'favicon.ico', 'logo192.png', 'logo512.png', 'splash.mp4']; // BUILD_PRECACHE
const scope = self.registration.scope;
const assetEntries = PRECACHE_ASSETS.map(item => typeof item === 'string' ? { url: item } : item);
const assetURLs = assetEntries.map(item => new URL(item.url, scope).href);
const shellURL = new URL('index.html', scope).href;

self.addEventListener('install', event => {
  // Fail installation if a required file is missing. Keep the previous release active.
  // The new worker waits for existing app windows to close to avoid mixed releases.
  const requests = assetEntries.map(item => new Request(new URL(item.url, scope).href, { cache: 'reload', ...(item.integrity ? { integrity: item.integrity } : {}) }));
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(requests)));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('spendsmart-offline-') && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function videoRange(request, response) {
  const bytes = await response.arrayBuffer();
  const size = bytes.byteLength;
  const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('Range') || '');
  let start, end;
  if (match && (match[1] || match[2])) {
    start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start || (!match[1] && Number(match[2]) === 0)) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  const headers = new Headers(response.headers);
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Length', String(end - start + 1));
  headers.set('Accept-Ranges', 'bytes');
  return new Response(bytes.slice(start, end + 1), { status: 206, headers });
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== new URL(scope).origin) return;
  const isNavigation = request.mode === 'navigate';
  const isAsset = assetURLs.includes(request.url) || ['script', 'style', 'image', 'font', 'video'].includes(request.destination);
  if (!isNavigation && !isAsset) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(isNavigation ? shellURL : request.url);
    if (cached) return request.headers.has('Range') ? videoRange(request, cached) : cached;
    try {
      const response = await fetch(request);
      if (response.ok && response.status === 200 && response.type === 'basic' && !request.headers.has('Range')) {
        event.waitUntil(cache.put(request.url, response.clone()));
      }
      return response;
    } catch { return Response.error(); }
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'BUDGET_ALERT') {
    event.waitUntil(self.registration.showNotification(event.data.title, {
      body: event.data.body,
      icon: new URL('logo192.png', scope).href,
      badge: new URL('logo192.png', scope).href,
      tag: 'budget-alert', renotify: true, vibrate: [200, 100, 200],
    }));
  }
});
