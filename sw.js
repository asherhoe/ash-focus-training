// Service Worker for ASH Focus Training
const CACHE_NAME = 'ash-focus-v1';
const STATIC_CACHE_NAME = 'ash-focus-static-v1';
const DYNAMIC_CACHE_NAME = 'ash-focus-dynamic-v1';

// 需要缓存的静态资源
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  // 图标文件
  '/icon-48x48.png',
  '/icon-72x72.png',
  '/icon-96x96.png',
  '/icon-128x128.png',
  '/icon-144x144.png',
  '/icon-152x152.png',
  '/icon-192x192.png',
  '/icon-384x384.png',
  '/icon-512x512.png',
  '/icon-512x512-maskable.png'
];

// 安装事件 - 缓存静态资源
self.addEventListener('install', event => {
  console.log('[Service Worker] 安装中...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] 缓存静态资源');
        // 使用addAll的安全版本，忽略失败的资源
        return Promise.all(
          STATIC_ASSETS.map(url => {
            return cache.add(url).catch(err => {
              console.warn(`[Service Worker] 无法缓存: ${url}`, err);
            });
          })
        );
      })
      .then(() => {
        console.log('[Service Worker] 安装完成');
        // 立即激活新的Service Worker
        return self.skipWaiting();
      })
  );
});

// 激活事件 - 清理旧缓存
self.addEventListener('activate', event => {
  console.log('[Service Worker] 激活中...');
  
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(cacheName => {
              // 删除旧版本的缓存
              return cacheName.startsWith('ash-focus-') && 
                     cacheName !== STATIC_CACHE_NAME &&
                     cacheName !== DYNAMIC_CACHE_NAME;
            })
            .map(cacheName => {
              console.log('[Service Worker] 删除旧缓存:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        console.log('[Service Worker] 激活完成');
        // 立即控制所有客户端
        return self.clients.claim();
      })
  );
});

// 获取事件 - 缓存策略
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // 只处理HTTP和HTTPS请求
  if (!url.protocol.startsWith('http')) {
    return;
  }
  
  // 对于HTML请求，使用网络优先策略
  if (request.headers.get('accept').includes('text/html')) {
    event.respondWith(
      networkFirst(request)
    );
    return;
  }
  
  // 对于静态资源（图片、图标等），使用缓存优先策略
  if (isStaticAsset(request.url)) {
    event.respondWith(
      cacheFirst(request)
    );
    return;
  }
  
  // 其他请求使用网络优先策略
  event.respondWith(
    networkFirst(request)
  );
});

// 缓存优先策略
async function cacheFirst(request) {
  try {
    const cacheResponse = await caches.match(request);
    if (cacheResponse) {
      console.log('[Service Worker] 从缓存返回:', request.url);
      return cacheResponse;
    }
    
    // 如果缓存中没有，从网络获取
    const networkResponse = await fetch(request);
    
    // 如果是有效响应，添加到缓存
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(STATIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
      console.log('[Service Worker] 已缓存:', request.url);
    }
    
    return networkResponse;
  } catch (error) {
    console.error('[Service Worker] 获取失败:', error);
    // 返回离线页面或默认响应
    return caches.match('/index.html');
  }
}

// 网络优先策略
async function networkFirst(request) {
  try {
    // 设置网络请求超时
    const networkResponse = await fetchWithTimeout(request, 5000);
    
    // 如果是有效响应，更新缓存
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(DYNAMIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
      console.log('[Service Worker] 更新缓存:', request.url);
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[Service Worker] 网络请求失败，尝试从缓存获取:', request.url);
    
    // 网络失败时，尝试从缓存获取
    const cacheResponse = await caches.match(request);
    if (cacheResponse) {
      return cacheResponse;
    }
    
    // 如果是导航请求，返回离线页面
    if (request.mode === 'navigate') {
      return caches.match('/index.html');
    }
    
    // 其他情况返回错误
    throw error;
  }
}

// 带超时的fetch
function fetchWithTimeout(request, timeout = 5000) {
  return Promise.race([
    fetch(request),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('请求超时')), timeout)
    )
  ]);
}

// 判断是否为静态资源
function isStaticAsset(url) {
  const staticExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.webp'];
  return staticExtensions.some(ext => url.endsWith(ext));
}

// 监听消息事件
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[Service Worker] 收到跳过等待的消息');
    self.skipWaiting();
  }
  
  // 清除所有缓存
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys()
        .then(cacheNames => {
          return Promise.all(
            cacheNames.map(cacheName => caches.delete(cacheName))
          );
        })
        .then(() => {
          console.log('[Service Worker] 所有缓存已清除');
          // 通知客户端
          self.clients.matchAll().then(clients => {
            clients.forEach(client => {
              client.postMessage({
                type: 'CACHE_CLEARED'
              });
            });
          });
        })
    );
  }
});

// 后台同步（可选功能）
self.addEventListener('sync', event => {
  if (event.tag === 'sync-test-results') {
    event.waitUntil(syncTestResults());
  }
});

// 同步测试结果的函数（示例）
async function syncTestResults() {
  // 这里可以实现将离线时的测试结果同步到服务器的逻辑
  console.log('[Service Worker] 同步测试结果...');
}

// 推送通知（可选功能）
self.addEventListener('push', event => {
  const options = {
    body: event.data ? event.data.text() : '是时候进行专注力训练了！',
    icon: '/icon-192x192.png',
    badge: '/icon-96x96.png',
    vibrate: [200, 100, 200],
    tag: 'focus-reminder',
    requireInteraction: true,
    actions: [
      {
        action: 'start-3min',
        title: '3分钟训练'
      },
      {
        action: 'start-5min',
        title: '5分钟训练'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification('ASH Focus Training', options)
  );
});

// 处理通知点击
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  let url = '/';
  if (event.action === 'start-3min') {
    url = '/index.html?duration=3';
  } else if (event.action === 'start-5min') {
    url = '/index.html?duration=5';
  }
  
  event.waitUntil(
    clients.openWindow(url)
  );
});
