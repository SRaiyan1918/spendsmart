const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { renderWorker } = require('./generate-offline-worker.cjs');

function workerHarness(corrupt = false) {
  const handlers = {};
  const entries = new Map();
  let fetchCount = 0;
  const fixture = url => url.endsWith('.mp4') ? '0123456789' : url.endsWith('.js') ? 'console.log("app")' : 'app shell';
  const cache = {
    async match(key) { return entries.get(typeof key === 'string' ? key : key.url)?.clone(); },
    async put(key, value) { entries.set(typeof key === 'string' ? key : key.url, value.clone()); },
    async addAll(requests) {
      const loaded = [];
      for (const request of requests) {
        const url = typeof request === 'string' ? request : request.url;
        const body = corrupt && url.endsWith('.js') ? 'SPA fallback HTML' : fixture(url);
        const digest = 'sha256-' + createHash('sha256').update(body).digest('base64');
        if (corrupt && !request.integrity) throw new Error('Missing integrity validation');
        if (request.integrity && request.integrity !== digest) throw new Error('Integrity mismatch');
        if (typeof request !== 'string') assert.equal(request.cache, 'reload');
        loaded.push([url, new Response(body, { headers: { 'Content-Type': url.endsWith('.mp4') ? 'video/mp4' : url.endsWith('.js') ? 'text/javascript' : 'text/html' } })]);
      }
      for (const [url, response] of loaded) entries.set(url, response);
    },
  };
  const deleted = [];
  const self = { registration: { scope: 'https://example.test/spend/' }, clients: { claim: async () => {} }, addEventListener: (name, handler) => { handlers[name] = handler; } };
  const assets = ['index.html', 'splash.mp4', 'static/js/main.hash.js', 'manifest.json'].map(url => ({ url, integrity: 'sha256-' + createHash('sha256').update(fixture(url)).digest('base64') }));
  const source = renderWorker(fs.readFileSync('public/sw-budget.js', 'utf8'), assets, 'test');
  vm.runInNewContext(source, { self, URL, Request, Response, Headers, caches: { open: async () => cache, keys: async () => ['another-app-cache', 'spendsmart-offline-old'], delete: async key => { deleted.push(key); } }, fetch: async () => { fetchCount++; throw new Error('offline'); } });
  async function install() { let pending; handlers.install({ waitUntil: value => { pending = value; } }); await pending; }
  async function request(path, options = {}) { let answer; const request = { url: `https://example.test/spend/${path}`, method: 'GET', headers: new Headers(options.headers), mode: options.mode || 'cors', destination: options.destination || '' }; handlers.fetch({ request, respondWith: promise => { answer = promise; }, waitUntil: () => {} }); return answer; }
  return { handlers, entries, deleted, install, request, fetchCount: () => fetchCount };
}

test('build worker precaches hashed JS and the unchanged splash at a subpath', async () => {
  const h = workerHarness(); await h.install();
  assert.ok(h.entries.has('https://example.test/spend/static/js/main.hash.js'));
  assert.ok(h.entries.has('https://example.test/spend/splash.mp4'));
});

test('offline navigation returns the cached shell for nested routes', async () => {
  const h = workerHarness(); await h.install();
  const response = await h.request('history', { mode: 'navigate' });
  assert.ok(response, 'navigation must be intercepted');
  assert.equal(await response.text(), 'app shell');
  assert.equal(h.fetchCount(), 0);
});

test('cached splash video supports partial and suffix ranges offline', async () => {
  const h = workerHarness(); await h.install();
  let response = await h.request('splash.mp4', { headers: { Range: 'bytes=2-5' }, destination: 'video' });
  assert.ok(response, 'video must be intercepted');
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('Content-Range'), 'bytes 2-5/10');
  assert.equal(await response.text(), '2345');
  response = await h.request('splash.mp4', { headers: { Range: 'bytes=-3' }, destination: 'video' });
  assert.equal(await response.text(), '789');
});

test('invalid video range returns 416 instead of broken media', async () => {
  const h = workerHarness(); await h.install();
  const response = await h.request('splash.mp4', { headers: { Range: 'bytes=50-' }, destination: 'video' });
  assert.ok(response);
  assert.equal(response.status, 416);
});

test('activation deletes only SpendSmart release caches', async () => {
  const h = workerHarness(); let pending;
  h.handlers.activate({ waitUntil: value => { pending = value; } }); await pending;
  assert.deepEqual(h.deleted, ['spendsmart-offline-old']);
});

test('external Firebase/auth requests and POST writes bypass the worker', () => {
  const h = workerHarness();
  let intercepted = false;
  const respondWith = () => { intercepted = true; };
  h.handlers.fetch({ request: { url: 'https://firestore.googleapis.com/api', method: 'GET' }, respondWith });
  h.handlers.fetch({ request: { url: 'https://example.test/spend/api', method: 'POST' }, respondWith });
  assert.equal(intercepted, false);
});

test('a partial deploy returning HTML for JavaScript fails installation atomically', async () => {
  const h = workerHarness(true);
  await assert.rejects(h.install(), /Integrity mismatch/);
  assert.equal(h.entries.size, 0);
  assert.deepEqual(h.deleted, []);
});
