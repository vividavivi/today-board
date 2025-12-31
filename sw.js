const CACHE = 'todayboard-v1-20260101';
const ASSETS = [
  '/today-board/mobile.html',
  '/today-board/app.js',
  '/today-board/styles-v2.css',
  '/today-board/styles-enhanced.css',
  '/today-board/assets/bg/bg_blackboard_main.webp',
  '/today-board/assets/bg/bg_blackboard_main_lite.webp',
  '/today-board/assets/ui/badge_version.webp',
  '/today-board/assets/ui/btn_circle_chalk_base.webp',
  '/today-board/assets/ui/btn_console_add.webp.webp',
  '/today-board/assets/ui/btn_console_delete.webp',
  '/today-board/assets/ui/btn_console_submit.webp',
  '/today-board/assets/ui/divider_chalk_horizontal.webp',
  '/today-board/assets/ui/frame_chalk_dashed.webp',
  '/today-board/assets/ui/icon_chalk_back.webp',
  '/today-board/assets/ui/icon_chalk_camera.webp',
  '/today-board/assets/ui/icon_chalk_confirm.webp',
  '/today-board/assets/ui/icon_chalk_gallery.webp',
  '/today-board/assets/ui/icon_chalk_grid.webp',
  '/today-board/assets/ui/icon_chalk_mic.webp',
  '/today-board/assets/ui/icon_chalk_redo.webp',
  '/today-board/assets/ui/icon_chalk_text.webp',
  '/today-board/assets/ui/icon_chalk_undo.webp',
  '/today-board/assets/ui/icon_check_circle_64.webp',
  '/today-board/assets/ui/icon_check_circle_96.webp',
  '/today-board/assets/ui/title_today_board.webp'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then((res) => res || fetch(e.request)));
});

