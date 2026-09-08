/* Imagens dos slides, guardadas no IndexedDB.

   Não vão para o localStorage de propósito: uma foto em base64 tem centenas de
   KB e estouraria a cota (~5 MB) que o histórico inteiro divide. Aqui elas
   ficam num banco próprio e o texto do slide guarda só o id — `![img3]`.

   Toda função devolve Promise e nunca rejeita por falta de suporte: se o
   IndexedDB não estiver disponível (navegador antigo, aba anônima em alguns
   casos), o app segue funcionando com as imagens só em memória. */
window.Imagens = (function () {
  'use strict';

  const DB = 'profeai-imagens';
  const STORE = 'imgs';
  const VERSAO = 1;

  let dbPromise = null;

  function abrir() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(resolve => {
      if (!window.indexedDB) { resolve(null); return; }
      let req;
      try { req = indexedDB.open(DB, VERSAO); } catch { resolve(null); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    });
    return dbPromise;
  }

  function tx(modo, fn) {
    return abrir().then(db => {
      if (!db) return null;
      return new Promise(resolve => {
        let t;
        try { t = db.transaction(STORE, modo); } catch { resolve(null); return; }
        const store = t.objectStore(STORE);
        const r = fn(store);
        t.oncomplete = () => resolve(r && 'result' in r ? r.result : null);
        t.onerror = () => resolve(null);
        t.onabort = () => resolve(null);
      });
    });
  }

  /* Id único e curto. Inclui o instante para não colidir entre materiais
     diferentes gerados no mesmo navegador. */
  let seq = 0;
  function novoId() {
    seq += 1;
    return 'img' + Date.now().toString(36) + seq.toString(36);
  }

  /* Reduz a imagem antes de guardar: uma foto de celular tem 4000px de largura
     e pesa MBs — num slide de 1600px isso é peso puro. */
  const MAX_LADO = 1600;

  function reduzir(dataUrl, tipo) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const escala = Math.min(1, MAX_LADO / Math.max(img.naturalWidth, img.naturalHeight));
        if (escala >= 1) { resolve({ dataUrl, w: img.naturalWidth, h: img.naturalHeight }); return; }
        const w = Math.round(img.naturalWidth * escala);
        const h = Math.round(img.naturalHeight * escala);
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        // PNG mantém transparência; o resto vira JPEG, que é bem menor.
        const png = /png/i.test(tipo || '');
        resolve({ dataUrl: c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.85), w, h });
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }

  /* Lê um File do input, reduz e guarda. Devolve { id, dataUrl, w, h }. */
  function adicionar(file) {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = async () => {
        const reduzida = await reduzir(reader.result, file.type);
        if (!reduzida) { resolve(null); return; }
        const rec = { id: novoId(), dataUrl: reduzida.dataUrl, w: reduzida.w, h: reduzida.h, criado: Date.now() };
        await tx('readwrite', store => store.put(rec));
        resolve(rec);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  /* Carrega os registros pedidos num mapa { id: rec }. Ids inexistentes só
     ficam de fora — o slide mostra o aviso de imagem não encontrada. */
  function carregar(ids) {
    const lista = [...new Set(ids || [])].filter(Boolean);
    if (!lista.length) return Promise.resolve({});
    return abrir().then(db => {
      if (!db) return {};
      return new Promise(resolve => {
        const saida = {};
        let t;
        try { t = db.transaction(STORE, 'readonly'); } catch { resolve({}); return; }
        const store = t.objectStore(STORE);
        lista.forEach(id => {
          const r = store.get(id);
          r.onsuccess = () => { if (r.result) saida[r.result.id] = r.result; };
        });
        t.oncomplete = () => resolve(saida);
        t.onerror = () => resolve(saida);
        t.onabort = () => resolve(saida);
      });
    });
  }

  function remover(id) {
    return tx('readwrite', store => store.delete(id));
  }

  return { adicionar, carregar, remover, novoId };
})();
