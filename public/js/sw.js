// Service Worker لإدارة التخزين المؤقت
self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open('chat-app-v1').then(function(cache) {
            return cache.addAll([
                '/',
                '/css/style.css',
                '/js/script.js'
            ]);
        })
    );
});

self.addEventListener('fetch', function(event) {
    // تجاهل التخزين المؤقت لطلبات الرسائل وSocket.io
    if (event.request.url.includes('/get-messages') || 
        event.request.url.includes('/send-message') ||
        event.request.url.includes('/clear-chat') ||
        event.request.url.includes('/download/') ||
        event.request.url.includes('/socket.io/')) {
        return fetch(event.request);
    }
    
    event.respondWith(
        caches.match(event.request).then(function(response) {
            return response || fetch(event.request);
        })
    );
});