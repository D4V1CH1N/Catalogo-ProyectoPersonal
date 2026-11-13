const CACHE_NAME = 'quimfa-pwa-cache-v2';

const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './styles-pwa.css',
    './script-pwa.js',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png',
    '../data/medicamentos.json',
    'https://code.jquery.com/jquery-3.7.1.min.js'
];

self.addEventListener('install', function (evento) {
    evento.waitUntil(
        caches.open(CACHE_NAME).then(function (cache) {
            return cache.addAll(ASSETS_TO_CACHE);
        }).then(function () {
            return self.skipWaiting();
        })
    );
});

self.addEventListener('activate', function (evento) {
    evento.waitUntil(
        caches.keys().then(function (claves) {
            return Promise.all(
                claves.map(function (clave) {
                    if (clave !== CACHE_NAME) {
                        return caches.delete(clave);
                    }
                    return null;
                })
            );
        }).then(function () {
            return self.clients.claim();
        })
    );
});

self.addEventListener('fetch', function (evento) {
    if (evento.request.method !== 'GET') {
        return;
    }
    evento.respondWith(
        caches.match(evento.request).then(function (respuestaCache) {
            if (respuestaCache) {
                return respuestaCache;
            }
            return fetch(evento.request).then(function (respuestaRed) {
                if (!respuestaRed || respuestaRed.status !== 200 || respuestaRed.type === 'opaque') {
                    return respuestaRed;
                }
                var copia = respuestaRed.clone();
                caches.open(CACHE_NAME).then(function (cache) {
                    cache.put(evento.request, copia);
                });
                return respuestaRed;
            }).catch(function () {
                if (evento.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
                return null;
            });
        })
    );
});
