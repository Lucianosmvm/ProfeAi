/* Google Drive: guarda cada material no Drive do professor e sincroniza o
   histórico entre aparelhos.

   - Arquivos visíveis: Professor+ AI / <UC> / Aulas | Atividades | Provas | Slides.
     Aula, atividade e prova viram Google Docs; slides viram Google Slides
     (convertidos do mesmo PPTX do editor).
   - Sincronização: um arquivo oculto (appDataFolder) com histórico, exclusões,
     agenda e referências. Cada aparelho baixa, mescla com o que tem e sobe de
     volta. Vence a versão mais recente de cada item.

   Sem backend: o login é o Google Identity Services, que entrega um token de
   1 hora por popup. O escopo drive.file só enxerga os arquivos que o próprio
   app criou — nada do resto do Drive. */
window.Drive = (function () {
  'use strict';

  const ESCOPOS = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive.appdata',
  ];
  const API = 'https://www.googleapis.com/drive/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
  const RAIZ = 'Professor+ AI';
  const ARQ_DADOS = 'profeai-dados.json';
  const PASTA_TIPO = { aula: 'Aulas', plano: 'Aulas', atividade: 'Atividades', prova: 'Provas', slides: 'Slides' };
  const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  const K = {
    cliente: 'profe_drive_client_id',
    token: 'profe_drive_token',
    conectado: 'profe_drive_conectado',
    pastas: 'profe_drive_pastas',
  };
  const ESPERA_MS = 8000;              // junta várias mudanças seguidas numa sincronização
  const EXCLUIDOS_DIAS = 180;          // marcas de exclusão antigas são descartadas

  let estado = { fase: 'off', msg: '' };
  const ouvintes = [];
  let timer = null;
  let rodando = false;
  let deNovo = false;
  let aoAtualizar = () => {};

  /* ===== Estado (para a interface) =====
     off: sem ID do cliente · desconectado · reconectar: token expirou
     sincronizando · ok · erro */
  function setEstado(fase, msg = '') {
    estado = { fase, msg };
    ouvintes.forEach(fn => { try { fn(estado); } catch { /* segue */ } });
  }

  function onEstado(fn) { ouvintes.push(fn); fn(estado); }

  function lerJson(chave, padrao) {
    try { return JSON.parse(localStorage.getItem(chave)) ?? padrao; } catch { return padrao; }
  }

  /* ===== Configuração ===== */
  function getClientId() { return (localStorage.getItem(K.cliente) || '').trim(); }

  function setClientId(v) {
    const novo = (v || '').trim();
    if (novo === getClientId()) return;
    localStorage.setItem(K.cliente, novo);
    // Outro cliente = outra autorização: a sessão anterior não vale mais.
    localStorage.removeItem(K.token);
    localStorage.removeItem(K.conectado);
    if (novo) carregarGis().catch(() => {});
    setEstado(novo ? 'desconectado' : 'off');
  }

  function conectado() { return localStorage.getItem(K.conectado) === '1'; }

  function tokenValido() {
    const t = lerJson(K.token, null);
    return t && t.exp > Date.now() + 60000 ? t.valor : '';
  }

  /* ===== Login (Google Identity Services) ===== */
  let gisPromise = null;

  function carregarGis() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    if (gisPromise) return gisPromise;
    gisPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { gisPromise = null; reject(new Error('Não foi possível carregar o login do Google. Verifique a internet.')); };
      document.head.appendChild(s);
    });
    return gisPromise;
  }

  /* O popup só abre se for pedido dentro do clique: por isso, com a biblioteca
     já carregada, o pedido sai sem nenhum `await` antes. */
  function pedirToken(prompt) {
    return new Promise((resolve, reject) => {
      const pedir = () => {
        const client = google.accounts.oauth2.initTokenClient({
          client_id: getClientId(),
          scope: ESCOPOS.join(' '),
          callback: r => {
            if (r.error) { reject(new Error(r.error_description || r.error)); return; }
            if (!google.accounts.oauth2.hasGrantedAllScopes(r, ...ESCOPOS)) {
              reject(new Error('O acesso ao Drive não foi liberado. Conecte de novo e marque as permissões do Google Drive.'));
              return;
            }
            localStorage.setItem(K.token, JSON.stringify({
              valor: r.access_token,
              exp: Date.now() + (Number(r.expires_in) || 3600) * 1000,
            }));
            resolve(r.access_token);
          },
          error_callback: e => {
            const msgs = {
              popup_closed: 'A janela do Google foi fechada antes de concluir.',
              popup_failed_to_open: 'O navegador bloqueou a janela do Google. Libere pop-ups para este site e tente de novo.',
            };
            reject(new Error(msgs[e && e.type] || 'Falha no login do Google.'));
          },
        });
        client.requestAccessToken({ prompt });
      };
      if (window.google?.accounts?.oauth2) pedir();
      else carregarGis().then(pedir, reject);
    });
  }

  async function conectar() {
    if (!getClientId()) throw new Error('Cole o ID do cliente OAuth antes de conectar.');
    await pedirToken(conectado() ? '' : 'consent');
    localStorage.setItem(K.conectado, '1');
    await sincronizar();
  }

  function desconectar() {
    const t = tokenValido();
    if (t && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(t, () => {});
    localStorage.removeItem(K.token);
    localStorage.removeItem(K.conectado);
    clearTimeout(timer);
    setEstado(getClientId() ? 'desconectado' : 'off');
  }

  /* ===== Chamadas à API ===== */
  function erroReconectar() {
    const e = new Error('A sessão do Google expirou. Reconecte para continuar salvando no Drive.');
    e.reconectar = true;
    return e;
  }

  async function req(url, opts = {}) {
    const token = tokenValido();
    if (!token) throw erroReconectar();
    const r = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
    if (r.status === 401) { localStorage.removeItem(K.token); throw erroReconectar(); }
    if (!r.ok) {
      let msg = '';
      try { msg = (await r.json()).error.message; } catch { /* sem corpo */ }
      const e = new Error(msg || `O Drive respondeu com erro ${r.status}.`);
      e.status = r.status;
      throw e;
    }
    return r;
  }

  const json = (url, opts) => req(url, opts).then(r => r.json());

  function q(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

  /* Corpo multipart/related: metadados + conteúdo numa requisição só. */
  function multipart(meta, blob) {
    const limite = 'profeai' + Math.random().toString(36).slice(2);
    const corpo = new Blob([
      `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
      `--${limite}\r\nContent-Type: ${blob.type || 'application/octet-stream'}\r\n\r\n`,
      blob,
      `\r\n--${limite}--`,
    ]);
    return { corpo, contentType: `multipart/related; boundary=${limite}` };
  }

  /* ===== Pastas: Professor+ AI / UC / Tipo ===== */
  async function acharOuCriarPasta(nome, paiId) {
    const busca = `mimeType='application/vnd.google-apps.folder' and name='${q(nome)}' and '${paiId}' in parents and trashed=false`;
    const r = await json(`${API}/files?q=${encodeURIComponent(busca)}&fields=files(id)&pageSize=1`);
    if (r.files && r.files.length) return r.files[0].id;
    const nova = await json(`${API}/files?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nome, mimeType: 'application/vnd.google-apps.folder', parents: [paiId] }),
    });
    return nova.id;
  }

  async function pastaDo(item) {
    const uc = Storage.chaveRef(item.params && item.params.uc) || 'Sem UC';
    const caminho = [RAIZ, uc, PASTA_TIPO[item.tipo] || 'Outros'];
    const cache = lerJson(K.pastas, {});
    let pai = 'root';
    for (let i = 0; i < caminho.length; i++) {
      const chave = caminho.slice(0, i + 1).join('/');
      if (!cache[chave]) {
        cache[chave] = await acharOuCriarPasta(caminho[i], pai);
        localStorage.setItem(K.pastas, JSON.stringify(cache));
      }
      pai = cache[chave];
    }
    return pai;
  }

  /* Se o professor apagou a pasta principal no Drive, esquece os ids guardados
     e as pastas são recriadas no próximo envio. */
  async function validarPastas() {
    const raiz = lerJson(K.pastas, {})[RAIZ];
    if (!raiz) return;
    try {
      const f = await json(`${API}/files/${raiz}?fields=trashed`);
      if (!f.trashed) return;
    } catch (e) {
      if (e.reconectar) throw e;
      if (e.status !== 404) return;
    }
    localStorage.removeItem(K.pastas);
  }

  /* ===== Arquivos dos materiais ===== */
  function escapar(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function nomeArquivo(item) {
    let dia = (item.params && item.params.data) || '';
    if (!dia) {
      const d = new Date(item.data);
      dia = isNaN(d) ? '' : d.toISOString().slice(0, 10);
    }
    const titulo = (item.titulo || 'Material').replace(/^(Aula|Atividade|Prova|Slides):\s*/i, '');
    return `${dia ? dia + ' — ' : ''}${titulo}`.slice(0, 180);
  }

  function blobDoc(item) {
    const corpo = item.conteudoHtml
      || (window.marked ? marked.parse(item.conteudo || '') : `<pre>${escapar(item.conteudo || '')}</pre>`);
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapar(item.titulo || '')}</title></head><body>${corpo}</body></html>`;
    return new Blob([html], { type: 'text/html' });
  }

  /* Envia a versão atual do item. Uma versão anterior vai para a lixeira do
     Drive (recuperável por 30 dias) em vez de ser sobrescrita. */
  async function enviarItem(item) {
    const pasta = await pastaDo(item);
    let blob = null;
    let mime = 'application/vnd.google-apps.document';
    if (item.tipo === 'slides' && window.Deck && Deck.pptxBlob) {
      try {
        blob = new Blob([await Deck.pptxBlob(item.conteudo || '')], { type: PPTX_MIME });
        mime = 'application/vnd.google-apps.presentation';
      } catch { blob = null; }   // slides que não montam: vão como documento de texto
    }
    if (!blob) { blob = blobDoc(item); mime = 'application/vnd.google-apps.document'; }

    const { corpo, contentType } = multipart({ name: nomeArquivo(item), mimeType: mime, parents: [pasta] }, blob);
    const novo = await json(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body: corpo,
    });
    if (item.drive && item.drive.id && item.drive.id !== novo.id) await lixeira(item.drive.id);
    return { id: novo.id, versao: item.atualizadoEm || 0 };
  }

  async function lixeira(id) {
    try {
      await req(`${API}/files/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashed: true }),
      });
    } catch (e) {
      // Já apagado à mão ou sem acesso: nada a fazer.
      if (e.reconectar || (e.status !== 404 && e.status !== 403)) throw e;
    }
  }

  /* ===== Arquivo de dados (oculto) ===== */
  async function acharArquivoDados() {
    const busca = `name='${ARQ_DADOS}' and trashed=false`;
    const r = await json(`${API}/files?spaces=appDataFolder&q=${encodeURIComponent(busca)}&fields=files(id)&pageSize=1`);
    return r.files && r.files.length ? r.files[0].id : '';
  }

  async function gravarDados(id, dados) {
    const blob = new Blob([JSON.stringify(dados)], { type: 'application/json' });
    if (id) {
      await req(`${UPLOAD}/files/${id}?uploadType=media`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: blob,
      });
      return id;
    }
    const { corpo, contentType } = multipart({ name: ARQ_DADOS, parents: ['appDataFolder'] }, blob);
    return (await json(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
      method: 'POST', headers: { 'Content-Type': contentType }, body: corpo,
    })).id;
  }

  function retrato() {
    return {
      app: 'professor-plus',
      versao: 2,
      salvoEm: Date.now(),
      history: Storage.getHistory(),
      excluidos: Storage.getExcluidos(),
      agenda: Storage.getAgenda(),
      agendaEm: Storage.getAgendaEm(),
      referencias: Storage.getReferencias(),
      referenciasEm: Storage.getReferenciasEm(),
    };
  }

  /* ===== Mesclagem =====
     Item: vence o `atualizadoEm` maior; o vínculo com o arquivo do Drive
     (`drive`) é aproveitado de qualquer um dos lados. Exclusão: apaga o item
     se for mais recente que ele. Agenda e referências: vence a mais recente. */
  function mesclar(local, remoto) {
    const vale = i => i.atualizadoEm || Date.parse(i.data) || 0;
    const melhorDrive = (a, b) => (!a ? b : !b ? a : ((a.versao || 0) >= (b.versao || 0) ? a : b));

    const excluidos = { ...(remoto.excluidos || {}) };
    Object.entries(local.excluidos || {}).forEach(([id, ex]) => {
      const outro = excluidos[id];
      excluidos[id] = !outro ? ex : {
        em: Math.max(ex.em || 0, outro.em || 0),
        driveId: ex.driveId || outro.driveId || '',
        lixeira: !!(ex.lixeira || outro.lixeira),
      };
    });

    const porId = new Map();
    [...(remoto.history || []), ...(local.history || [])].forEach(item => {
      const atual = porId.get(item.id);
      if (!atual) { porId.set(item.id, item); return; }
      const [novo, velho] = vale(item) >= vale(atual) ? [item, atual] : [atual, item];
      porId.set(item.id, { ...novo, drive: melhorDrive(novo.drive, velho.drive) });
    });

    const limite = Date.now() - EXCLUIDOS_DIAS * 86400000;
    const history = [];
    porId.forEach(item => {
      const ex = excluidos[item.id];
      if (ex && ex.em >= vale(item)) {
        if (!ex.driveId && item.drive && item.drive.id) ex.driveId = item.drive.id;
        return;
      }
      history.push(item);
    });
    Object.keys(excluidos).forEach(id => {
      const ex = excluidos[id];
      if (ex.em < limite && (ex.lixeira || !ex.driveId)) delete excluidos[id];
    });
    history.sort((a, b) => new Date(b.data) - new Date(a.data));

    const agendaRemota = (remoto.agendaEm || 0) > (local.agendaEm || 0);
    const refsRemotas = (remoto.referenciasEm || 0) > (local.referenciasEm || 0);
    return {
      history,
      excluidos,
      agenda: agendaRemota ? remoto.agenda : null,
      agendaEm: remoto.agendaEm,
      referencias: refsRemotas ? remoto.referencias : null,
      referenciasEm: remoto.referenciasEm,
    };
  }

  /* ===== Sincronização ===== */
  async function sincronizar() {
    if (!conectado()) return;
    if (rodando) { deNovo = true; return; }
    if (!tokenValido()) { setEstado('reconectar', 'A sessão do Google expirou. Reconecte para continuar salvando no Drive.'); return; }
    clearTimeout(timer);
    rodando = true;
    setEstado('sincronizando', 'Sincronizando…');
    let falhas = 0;
    try {
      await validarPastas();
      let idDados = await acharArquivoDados();
      let remoto = {};
      if (idDados) {
        try { remoto = await json(`${API}/files/${idDados}?alt=media`); } catch (e) { if (e.reconectar) throw e; }
      }

      // Nada de `await` entre ler o local e gravar a mescla: uma mudança feita
      // no meio não se perde.
      const m = mesclar(retrato(), remoto);
      Storage.substituirHistorico(m.history, m.excluidos);
      Storage.substituirAgendaEReferencias(m);
      aoAtualizar();

      const pendentes = Storage.getHistory().filter(i => !i.drive || i.drive.versao !== (i.atualizadoEm || 0));
      for (let n = 0; n < pendentes.length; n++) {
        setEstado('sincronizando', `Salvando no Drive: ${n + 1} de ${pendentes.length}…`);
        try {
          Storage.marcarDrive(pendentes[n].id, await enviarItem(pendentes[n]));
        } catch (e) {
          if (e.reconectar) throw e;
          falhas++;
          console.warn('Drive: não foi possível enviar', pendentes[n].titulo, e);
        }
      }

      const excluidos = Storage.getExcluidos();
      for (const ex of Object.values(excluidos)) {
        if (!ex.driveId || ex.lixeira) continue;
        await lixeira(ex.driveId);
        ex.lixeira = true;
      }
      Storage.substituirHistorico(Storage.getHistory(), excluidos);

      idDados = await gravarDados(idDados, retrato());
      const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      setEstado(falhas ? 'erro' : 'ok', falhas
        ? `${falhas} ${falhas === 1 ? 'material não foi salvo' : 'materiais não foram salvos'} no Drive. Tenta de novo na próxima sincronização.`
        : `Tudo salvo no Drive · ${hora}`);
    } catch (e) {
      if (e.reconectar) setEstado('reconectar', e.message);
      else setEstado('erro', e.message || 'Falha ao sincronizar com o Drive.');
    } finally {
      rodando = false;
      if (deNovo) { deNovo = false; agendar(); }
    }
  }

  /* Mudança local: espera um pouco (várias edições seguidas viram um envio só). */
  function agendar() {
    if (!conectado()) return;
    clearTimeout(timer);
    if (!tokenValido()) {
      setEstado('reconectar', 'Há mudanças esperando. Reconecte o Google Drive para salvá-las.');
      return;
    }
    timer = setTimeout(sincronizar, ESPERA_MS);
  }

  function iniciar(opts = {}) {
    aoAtualizar = opts.aoAtualizar || aoAtualizar;
    Storage.aoMudar(agendar);
    // Voltou para a aba: traz o que mudou em outro aparelho.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && conectado() && tokenValido()) sincronizar();
    });
    if (!getClientId()) { setEstado('off'); return; }
    carregarGis().catch(() => {});
    if (!conectado()) { setEstado('desconectado'); return; }
    if (tokenValido()) sincronizar();
    else setEstado('reconectar', 'Reconecte o Google Drive para sincronizar.');
  }

  return {
    iniciar, onEstado, getClientId, setClientId, conectado, conectar, desconectar,
    sincronizar, carregarGis, get estado() { return estado; },
    _mesclar: mesclar,   // exposto para teste
  };
})();
