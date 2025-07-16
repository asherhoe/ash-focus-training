// ASH Focus Training Service Worker
// 版本号，更新时需要修改
const CACHE_NAME = 'ash-focus-v1.0.0';

// 动态获取缓存文件列表
const urlsToCache = [
  './',
  './index.html',
  './manifest.json'
];

// 可选的资源文件（如果存在才缓存）
const optionalResources = [
  './icon-48x48.png',
  './icon-72x72.png', 
  './icon-96x96.png',
  './icon-128x128.png',
  './icon-144x144.png',
  './icon-152x152.png',
  './icon-192x192.png',
  './icon-384x384.png',
  './icon-512x512.png',
  './icon-512x512-maskable.png',
  './screenshot1.png',
  './screenshot2.png'
];

// 安装事件 - 缓存资源
self.addEventListener('install', event => {
  console.log('SW: 安装中... / Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('SW: 缓存核心文件 / Caching core files');
        // 先缓存核心文件
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        // 尝试缓存可选资源
        return caches.open(CACHE_NAME).then(cache => {
          return Promise.allSettled(
            optionalResources.map(url => 
              fetch(url)
                .then(response => {
                  if (response.ok) {
                    return cache.put(url, response);
                  }
                })
                .catch(() => {
                  console.log('SW: 跳过不存在的资源 / Skipping missing resource:', url);
                })
            )
          );
        });
      })
      .then(() => {
        console.log('SW: 安装完成 / Installation complete');
        // 强制激活新的 service worker
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('SW: 安装失败 / Installation failed:', error);
      })
  );
});

// 激活事件 - 清理旧缓存
self.addEventListener('activate', event => {
  console.log('SW: 激活中... / Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // 删除旧版本的缓存
          if (cacheName !== CACHE_NAME) {
            console.log('SW: 删除旧缓存 / Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('SW: 激活完成 / Activation complete');
      // 立即控制所有客户端
      return self.clients.claim();
    })
  );
});

// 拦截网络请求
self.addEventListener('fetch', event => {
  // 只处理GET请求和同源请求
  if (event.request.method !== 'GET') return;
  
  // 检查是否为同源请求或相对路径
  const requestUrl = new URL(event.request.url);
  const currentUrl = new URL(self.location.href);
  
  if (requestUrl.origin !== currentUrl.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // 如果在缓存中找到，直接返回
        if (response) {
          console.log('SW: 从缓存返回 / Serving from cache:', event.request.url);
          return response;
        }

        // 否则发起网络请求
        console.log('SW: 网络请求 / Network request:', event.request.url);
        return fetch(event.request)
          .then(response => {
            // 检查响应是否有效
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // 克隆响应，因为响应流只能使用一次
            const responseToCache = response.clone();

            // 将新资源添加到缓存
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          })
          .catch(error => {
            console.error('SW: 网络请求失败 / Network request failed:', error);
            
            // 如果是导航请求且网络不可用，返回离线页面
            if (event.request.destination === 'document') {
              return caches.match('./index.html') || caches.match('./');
            }
            
            throw error;
          });
      })
  );
});

// 处理消息事件
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('SW: 收到跳过等待消息 / Received skip waiting message');
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({
      type: 'VERSION',
      version: CACHE_NAME
    });
  }
});

// 推送通知支持（可选）
self.addEventListener('push', event => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body || '是时候进行专注力训练了！/ Time for focus training!',
      icon: '/icon-192x192.png',
      badge: '/icon-96x96.png',
      vibrate: [200, 100, 200],
      data: {
        url: data.url || '/'
      },
      actions: [
        {
          action: 'open',
          title: '开始训练 / Start Training',
          icon: '/icon-96x96.png'
        },
        {
          action: 'dismiss',
          title: '稍后 / Later'
        }
      ]
    };

    event.waitUntil(
      self.registration.showNotification(
        data.title || 'ASH Focus Training',
        options
      )
    );
  }
});

// 处理通知点击事件
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'open' || !event.action) {
    const urlToOpen = event.notification.data?.url || '/';
    
    event.waitUntil(
      clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      }).then(windowClients => {
        // 如果已经有窗口打开，聚焦到该窗口
        for (let client of windowClients) {
          if (client.url.includes(urlToOpen) && 'focus' in client) {
            return client.focus();
          }
        }
        
        // 否则打开新窗口
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
    );
  }
});

// 后台同步支持（可选）
self.addEventListener('sync', event => {
  if (event.tag === 'background-sync') {
    console.log('SW: 执行后台同步 / Performing background sync');
    // 这里可以添加后台同步逻辑，比如上传训练数据
  }
});

// 错误处理
self.addEventListener('error', event => {
  console.error('SW: Service Worker 错误 / Error:', event.error);
});

self.addEventListener('unhandledrejection', event => {
  console.error('SW: 未处理的 Promise 拒绝 / Unhandled promise rejection:', event.reason);
});

console.log('SW: Service Worker 脚本已加载 / Script loaded');
