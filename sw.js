const NOMBRE_CACHE = 'quimfa-global-v1';

const RECURSOS_BASE = [
    './',
    './index.html',
    './manifest.json',
    './CSS/styles.css',
    './JS/script.js',
    './data/medicamentos.json',
    './pwa/',
    './pwa/index.html',
    './pwa/manifest.json',
    './pwa/styles-pwa.css',
    './pwa/script-pwa.js',
    './pwa/icons/icon-192.png',
    './pwa/icons/icon-512.png',
    'https://code.jquery.com/jquery-3.7.1.min.js'
];

self.addEventListener('install', function (evento) {
    evento.waitUntil(
        caches.open(NOMBRE_CACHE).then(function (cache) {
            return cache.addAll(RECURSOS_BASE);
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
                    if (clave !== NOMBRE_CACHE) {
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
                caches.open(NOMBRE_CACHE).then(function (cache) {
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

