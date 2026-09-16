/* Service worker: deixa o app instalável e abrindo sem internet.

   - Arquivos do próprio app: rede primeiro (as atualizações chegam na hora),
     com a cópia guardada como reserva quando a rede falha ou demora.
   - Bibliotecas e fontes de CDN: cópia guardada primeiro, atualizada em
     segundo plano.
   - IA, Google Drive e login: nunca passam pelo cache. */
const CACHE = 'profeai-v1';

// Arquivo novo em js/ ou css/: inclua aqui, senão ele não abre sem internet.
const APP = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './css/slides.css',
  './js/seguro.js',
  './js/storage.js',
  './js/prompts.js',
  './js/cronograma.js',
  './js/api.js',
  './js/imagens.js',
  './js/vendor/pptxgen.bundle.js',
  './js/temas.js',
  './js/slides.js',
  './js/avaliacao.js',
  './js/ajuste.js',
  './js/drive.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

const CDN = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const ESPERA_REDE_MS = 4000;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      // Um arquivo que falhe não impede a instalação dos outros.
      .then(cache => Promise.all(APP.map(url => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(nomes => Promise.all(nomes.filter(n => n !== CACHE).map(n => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    event.respondWith(redePrimeiro(req));
    return;
  }
  if (CDN.includes(url.hostname)) {
    event.respondWith(cachePrimeiro(req, event));
  }
  // Qualquer outro endereço (IA, Drive, login do Google): direto para a rede.
});

async function redePrimeiro(req) {
  const cache = await caches.open(CACHE);
  try {
    const resposta = await Promise.race([
      fetch(req),
      new Promise((_, rejeita) => setTimeout(() => rejeita(new Error('lento')), ESPERA_REDE_MS)),
    ]);
    if (resposta.ok) cache.put(req, resposta.clone());
    return resposta;
  } catch {
    const guardada = await cache.match(req, { ignoreSearch: true });
    if (guardada) return guardada;
    // Abrindo uma rota do app sem internet: devolve a página principal.
    if (req.mode === 'navigate') {
      const pagina = await cache.match('./index.html') || await cache.match('./');
      if (pagina) return pagina;
    }
    return fetch(req);
  }
}

async function cachePrimeiro(req, event) {
  const cache = await caches.open(CACHE);
  const guardada = await cache.match(req);
  const atualizar = fetch(req)
    .then(resposta => {
      if (resposta.ok || resposta.type === 'opaque') cache.put(req, resposta.clone());
      return resposta;
    })
    .catch(() => null);
  if (guardada) {
    event.waitUntil(atualizar);
    return guardada;
  }
  return (await atualizar) || Response.error();
}
