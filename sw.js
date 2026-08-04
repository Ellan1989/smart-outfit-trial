/**
 * sw.js —— Service Worker（PWA 缓存策略）
 *
 * 相册项目没有 PWA，本方案新增。
 * 策略：
 *   install：预缓存核心资源
 *   fetch：静态资源 Cache First（命中即返回，后台更新）；API 请求 Network Only
 *   activate：清理旧版本缓存
 *
 * 注意：iOS 18+ 不自动缓存 manifest 图标，需手动加入预缓存清单（已包含）。
 *       iOS Safari 与主屏 PWA 的 Service Worker 不共享——首次必须联网注册。
 */
const CACHE_VERSION = 'smart-outfit-v1';
const PRECACHE = [
  './',
  'index.html',
  'css/style.css',
  'manifest.json',
  'js/db.js',
  'js/config.js',
  'js/ai.js',
  'js/image-utils.js',
  'js/store.js',
  'js/page-closet.js',
  'js/page-outfit.js',
  'js/page-me.js',
  'js/main.js',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-maskable-512.png',
  'assets/icons/apple-touch-icon.png'
];

// 需要走 Network Only 的域名（AI API，绝不缓存）
const NETWORK_ONLY_HOSTS = ['open.bigmodel.cn', 'dashscope.aliyuncs.com'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(PRECACHE).catch(err => console.warn('预缓存部分失败', err)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);

  // AI API 请求：只走网络，不缓存
  if(NETWORK_ONLY_HOSTS.includes(url.hostname)){
    e.respondWith(fetch(req));
    return;
  }

  // 同源静态资源：Cache First + 后台更新（stale-while-revalidate）
  if(req.method === 'GET' && url.origin === self.location.origin){
    e.respondWith(
      caches.match(req).then(cached => {
        const fetchPromise = fetch(req).then(resp => {
          // 只缓存成功的响应
          if(resp && resp.status === 200){
            const clone = resp.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(req, clone));
          }
          return resp;
        }).catch(() => cached);  // 网络失败兜底用缓存
        return cached || fetchPromise;
      })
    );
    return;
  }

  // 其他（跨域等）：正常网络请求
  e.respondWith(fetch(req).catch(() => caches.match(req)));
});
