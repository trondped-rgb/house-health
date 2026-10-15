// House Health service worker: Web Share Target receiver + minimal offline shell.
const SCOPE = new URL('./', self.location).pathname; // "/house-health/"
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open('hh-shell').then((c) => c.addAll([SCOPE, SCOPE + 'sample-thermal.png']).catch(() => {}))); });
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method === 'POST' && url.pathname === SCOPE + 'share-target') {
    e.respondWith((async () => {
      try {
        const form = await e.request.formData();
        const file = form.getAll('image').find((f) => f && typeof f !== 'string');
        if (file) { const c = await caches.open('hh-share'); await c.put('shared-image', new Response(file, { headers: { 'Content-Type': file.type || 'image/jpeg' } })); }
      } catch (_) { /* fall through; the page shows an error if nothing arrived */ }
      return Response.redirect(SCOPE + '?shared=1#thermal', 303);
    })());
    return;
  }
  // network-first for navigations so deploys show up; fall back to cached shell when offline
  if (e.request.mode === 'navigate') e.respondWith(fetch(e.request).catch(() => caches.match(SCOPE)));
});
