const CACHE_VERSION = '2026-02-12';
const CACHE_NAME = 'todayboard-' + CACHE_VERSION;

const STATIC_ASSETS = [
  './app.js',
  './styles-v2.css',
  './styles-enhanced.css',
  './assets/bg/bg_blackboard_main.webp',
  './assets/bg/bg_blackboard_main_lite.webp',
  './assets/ui/badge_version.webp',
  './assets/ui/btn_circle_chalk_base.webp',
  './assets/ui/btn_console_add.webp.webp',
  './assets/ui/btn_console_delete.webp',
  './assets/ui/btn_console_submit.webp',
  './assets/ui/divider_chalk_horizontal.webp',
  './assets/ui/frame_chalk_dashed.webp',
  './assets/ui/icon_chalk_back.webp',
  './assets/ui/icon_chalk_camera.webp',
  './assets/ui/icon_chalk_confirm.webp',
  './assets/ui/icon_chalk_gallery.webp',
  './assets/ui/icon_chalk_grid.webp',
  './assets/ui/icon_chalk_mic.webp',
  './assets/ui/icon_chalk_redo.webp',
  './assets/ui/icon_chalk_text.webp',
  './assets/ui/icon_chalk_undo.webp',
  './assets/ui/icon_check_circle_64.webp',
  './assets/ui/icon_check_circle_96.webp',
  './assets/ui/title_today_board.webp'
];

function isHtmlRequest(request) {
  return request.mode === 'navigate' || request.destination === 'document';
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((c) => c.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => {})
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      ),
      self.clients.claim()
    ])
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

    if (isHtmlRequest(e.request)) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(e.request, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cached) =>
      cached || fetch(e.request).then((res) => {
        if (!res || res.status !== 200 || res.type !== 'basic') return res;
        const clone = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(e.request, clone)).catch(() => {});
        return res;
      })
    )
  );
});
