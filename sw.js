// Service Worker for ASH Focus Training v1.2
const APP_VERSION = '1.2';
const VERSION_CODE = 2;
const CACHE_NAME = `ash-focus-v${VERSION_CODE}`;
const STATIC_CACHE_NAME = `ash-focus-static-v${VERSION_CODE}`;
const DYNAMIC_CACHE_NAME = `ash-focus-dynamic-v${VERSION_CODE}`;

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
  '/icon-512x512-maskable.png',
  // 截图文件（可选）
  '/screenshot1.png',
  '/screenshot2.png',
  '/screenshot-mobile1.png',
  '/screenshot-mobile2.png'
];

// 安装事件 - 缓存静态资源
self.addEventListener('install', event => {
  console.log(`[Service Worker v${APP_VERSION}] 安装中...`);
  
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then(cache => {
        console.log(`[Service Worker v${APP_VERSION}] 缓存静态资源`);
        // 使用addAll的安全版本，忽略失败的资源
        return Promise.all(
          STATIC_ASSETS.map(url => {
            return cache.add(url).catch(err => {
              console.warn(`[Service Worker v${APP_VERSION}] 无法缓存: ${url}`, err);
            });
          })
        );
      })
      .then(() => {
        console.log(`[Service Worker v${APP_VERSION}] 安装完成`);
        // 立即激活新的Service Worker
        return self.skipWaiting();
      })
  );
});

// 激活事件 - 清理旧缓存
self.addEventListener('activate', event => {
  console.log(`[Service Worker v${APP_VERSION}] 激活中...`);
  
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(cacheName => {
              // 删除旧版本的缓存，保留当前版本
              return cacheName.startsWith('ash-focus-') && 
                     cacheName !== STATIC_CACHE_NAME &&
                     cacheName !== DYNAMIC_CACHE_NAME;
            })
            .map(cacheName => {
              console.log(`[Service Worker v${APP_VERSION}] 删除旧缓存:`, cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        console.log(`[Service Worker v${APP_VERSION}] 激活完成`);
        // 通知客户端新版本可用
        notifyClientsOfUpdate();
        // 立即控制所有客户端
        return self.clients.claim();
      })
  );
});

// 通知客户端有更新
function notifyClientsOfUpdate() {
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'SW_UPDATED',
        version: APP_VERSION,
        versionCode: VERSION_CODE
      });
    });
  });
}

// 获取事件 - 缓存策略
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // 只处理HTTP和HTTPS请求
  if (!url.protocol.startsWith('http')) {
    return;
  }
  
  // 对于HTML请求，使用网络优先策略
  if (request.headers.get('accept') && request.headers.get('accept').includes('text/html')) {
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
  
  // 对于API请求或其他动态内容，使用网络优先策略
  if (request.url.includes('/api/') || request.url.includes('analytics')) {
    event.respondWith(
      networkOnly(request)
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
      console.log(`[Service Worker v${APP_VERSION}] 从缓存返回:`, request.url);
      return cacheResponse;
    }
    
    // 如果缓存中没有，从网络获取
    const networkResponse = await fetch(request);
    
    // 如果是有效响应，添加到缓存
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(STATIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
      console.log(`[Service Worker v${APP_VERSION}] 已缓存:`, request.url);
    }
    
    return networkResponse;
  } catch (error) {
    console.error(`[Service Worker v${APP_VERSION}] 获取失败:`, error);
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
      console.log(`[Service Worker v${APP_VERSION}] 更新缓存:`, request.url);
    }
    
    return networkResponse;
  } catch (error) {
    console.log(`[Service Worker v${APP_VERSION}] 网络请求失败，尝试从缓存获取:`, request.url);
    
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

// 仅网络策略（用于API请求）
async function networkOnly(request) {
  try {
    return await fetchWithTimeout(request, 10000);
  } catch (error) {
    console.error(`[Service Worker v${APP_VERSION}] 网络请求失败:`, request.url, error);
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
  const staticExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.webp', '.css', '.js', '.woff', '.woff2', '.ttf'];
  return staticExtensions.some(ext => url.endsWith(ext));
}

// 监听消息事件
self.addEventListener('message', event => {
  const { data } = event;
  
  if (data && data.type === 'SKIP_WAITING') {
    console.log(`[Service Worker v${APP_VERSION}] 收到跳过等待的消息`);
    self.skipWaiting();
    // 通知客户端重新加载
    event.ports[0]?.postMessage({ type: 'RELOAD_WINDOW' });
  }
  
  // 清除所有缓存
  if (data && data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys()
        .then(cacheNames => {
          return Promise.all(
            cacheNames.map(cacheName => caches.delete(cacheName))
          );
        })
        .then(() => {
          console.log(`[Service Worker v${APP_VERSION}] 所有缓存已清除`);
          // 通知客户端
          self.clients.matchAll().then(clients => {
            clients.forEach(client => {
              client.postMessage({
                type: 'CACHE_CLEARED',
                version: APP_VERSION
              });
            });
          });
        })
    );
  }
  
  // 获取版本信息
  if (data && data.type === 'GET_VERSION') {
    event.ports[0]?.postMessage({
      type: 'VERSION_INFO',
      version: APP_VERSION,
      versionCode: VERSION_CODE,
      cacheNames: [STATIC_CACHE_NAME, DYNAMIC_CACHE_NAME]
    });
  }
  
  // 预缓存特定资源
  if (data && data.type === 'PRECACHE') {
    event.waitUntil(
      precacheResources(data.urls || [])
    );
  }
});

// 预缓存资源
async function precacheResources(urls) {
  try {
    const cache = await caches.open(STATIC_CACHE_NAME);
    await Promise.all(
      urls.map(url => {
        return cache.add(url).catch(err => {
          console.warn(`[Service Worker v${APP_VERSION}] 预缓存失败: ${url}`, err);
        });
      })
    );
    console.log(`[Service Worker v${APP_VERSION}] 预缓存完成:`, urls);
  } catch (error) {
    console.error(`[Service Worker v${APP_VERSION}] 预缓存错误:`, error);
  }
}

// 后台同步（用于离线数据同步）
self.addEventListener('sync', event => {
  console.log(`[Service Worker v${APP_VERSION}] 后台同步事件:`, event.tag);
  
  if (event.tag === 'sync-test-results') {
    event.waitUntil(syncTestResults());
  }
  
  if (event.tag === 'sync-analytics') {
    event.waitUntil(syncAnalytics());
  }
});

// 同步测试结果的函数
async function syncTestResults() {
  try {
    console.log(`[Service Worker v${APP_VERSION}] 同步测试结果...`);
    
    // 从IndexedDB或localStorage获取离线数据
    const testData = await getOfflineTestData();
    
    if (testData && testData.length > 0) {
      // 发送到服务器
      const response = await fetch('/api/sync-test-results', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          version: APP_VERSION,
          data: testData
        })
      });
      
      if (response.ok) {
        console.log(`[Service Worker v${APP_VERSION}] 测试结果同步成功`);
        // 清除已同步的数据
        await clearSyncedTestData();
      }
    }
  } catch (error) {
    console.error(`[Service Worker v${APP_VERSION}] 同步测试结果失败:`, error);
  }
}

// 同步分析数据
async function syncAnalytics() {
  try {
    console.log(`[Service Worker v${APP_VERSION}] 同步分析数据...`);
    // 实现分析数据同步逻辑
  } catch (error) {
    console.error(`[Service Worker v${APP_VERSION}] 同步分析数据失败:`, error);
  }
}

// 获取离线测试数据（示例实现）
async function getOfflineTestData() {
  // 这里应该从IndexedDB或localStorage获取数据
  return [];
}

// 清除已同步的测试数据
async function clearSyncedTestData() {
  // 实现清除逻辑
}

// 推送通知
self.addEventListener('push', event => {
  console.log(`[Service Worker v${APP_VERSION}] 收到推送消息`);
  
  const defaultData = {
    title: 'ASH Focus Training',
    body: '是时候进行专注力训练了！',
    icon: '/icon-192x192.png',
    badge: '/icon-96x96.png'
  };
  
  let notificationData = defaultData;
  
  if (event.data) {
    try {
      notificationData = { ...defaultData, ...event.data.json() };
    } catch (e) {
      notificationData.body = event.data.text() || defaultData.body;
    }
  }
  
  const options = {
    body: notificationData.body,
    icon: notificationData.icon,
    badge: notificationData.badge,
    vibrate: [200, 100, 200],
    tag: 'focus-reminder',
    requireInteraction: true,
    data: {
      version: APP_VERSION,
      timestamp: Date.now()
    },
    actions: [
      {
        action: 'start-3min',
        title: '3分钟训练',
        icon: '/icon-96x96.png'
      },
      {
        action: 'start-5min',
        title: '5分钟训练',
        icon: '/icon-96x96.png'
      },
      {
        action: 'dismiss',
        title: '稍后提醒',
        icon: '/icon-96x96.png'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(notificationData.title, options)
  );
});

// 处理通知点击
self.addEventListener('notificationclick', event => {
  console.log(`[Service Worker v${APP_VERSION}] 通知点击:`, event.action);
  
  event.notification.close();
  
  let url = '/';
  
  switch (event.action) {
    case 'start-3min':
      url = '/index.html?duration=3&source=notification';
      break;
    case 'start-5min':
      url = '/index.html?duration=5&source=notification';
      break;
    case 'dismiss':
      // 设置稍后提醒
      scheduleNotification(30 * 60 * 1000); // 30分钟后
      return;
    default:
      url = '/index.html?source=notification';
  }
  
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      // 如果已有窗口打开，聚焦并导航
      for (const client of clientList) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      // 否则打开新窗口
      return clients.openWindow(url);
    })
  );
});

// 安排通知（示例实现）
function scheduleNotification(delay) {
  // 在实际应用中，这里应该使用更可靠的调度机制
  setTimeout(() => {
    self.registration.showNotification('ASH Focus Training', {
      body: '该进行专注力训练了！',
      icon: '/icon-192x192.png',
      tag: 'scheduled-reminder'
    });
  }, delay);
}

// 错误处理
self.addEventListener('error', event => {
  console.error(`[Service Worker v${APP_VERSION}] 错误:`, event.error);
});

self.addEventListener('unhandledrejection', event => {
  console.error(`[Service Worker v${APP_VERSION}] 未处理的Promise拒绝:`, event.reason);
});

console.log(`[Service Worker v${APP_VERSION}] 已加载，版本代码: ${VERSION_CODE}`);
