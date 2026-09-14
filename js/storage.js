/* Persistência: configurações no localStorage, histórico no IndexedDB. */
const Storage = {
  KEYS: {
    provider: 'profe_provider',
    apiKey: 'profe_api_key_',   // sufixado pelo provedor
    model: 'profe_model_',      // sufixado pelo provedor
    nome: 'profe_nome',
    history: 'profe_history',
    stats: 'profe_stats',
    agenda: 'profe_agenda',
    base: 'profe_slide_base',
    referencias: 'profe_referencias',
    slidesOpts: 'profe_slides_opts',
  },

  DEFAULT_MODELS: {
    gemini: 'gemini-2.5-flash',
    openai: 'gpt-4o-mini',
  },

  getProvider() { return localStorage.getItem(this.KEYS.provider) || 'gemini'; },
  setProvider(v) { localStorage.setItem(this.KEYS.provider, v); },

  getApiKey(provider = this.getProvider()) {
    return localStorage.getItem(this.KEYS.apiKey + provider) || '';
  },
  setApiKey(v, provider = this.getProvider()) {
    localStorage.setItem(this.KEYS.apiKey + provider, v);
  },

  getModel(provider = this.getProvider()) {
    return localStorage.getItem(this.KEYS.model + provider) || this.DEFAULT_MODELS[provider];
  },
  setModel(v, provider = this.getProvider()) {
    localStorage.setItem(this.KEYS.model + provider, v);
  },

  getNome() { return localStorage.getItem(this.KEYS.nome) || ''; },
  setNome(v) { localStorage.setItem(this.KEYS.nome, v); },

  /* ===== Histórico =====
     Fica no IndexedDB (sem o limite de ~5 MB do localStorage) e numa cópia em
     memória, para o resto do app continuar lendo de forma síncrona. Só o
     `iniciar()` é assíncrono: o app espera por ele antes de desenhar a tela.

     Cada item leva `atualizadoEm` e cada exclusão deixa uma marca em
     `excluidos` — é o que a sincronização com o Drive usa para saber qual
     versão vence e o que foi apagado em outro aparelho. */
  _hist: [],
  _excluidos: {},          // { id: { em, driveId } }
  _idb: null,              // null = sem IndexedDB: cai no localStorage (limite de 100)
  _ouvintes: [],
  _silencio: 0,

  async iniciar() {
    this._idb = await this._abrirIdb();
    if (this._idb) {
      const [hist, excl] = await Promise.all([this._idbGet('history'), this._idbGet('excluidos')]);
      this._hist = Array.isArray(hist) ? hist : [];
      this._excluidos = excl && typeof excl === 'object' ? excl : {};
      // Migração: o histórico das versões antigas estava no localStorage.
      const antigo = this._lerLocal(this.KEYS.history, null);
      if (Array.isArray(antigo)) {
        const ids = new Set(this._hist.map(i => i.id));
        this._hist = [...this._hist, ...antigo.filter(i => !ids.has(i.id))]
          .sort((a, b) => new Date(b.data) - new Date(a.data));
        // Só apaga a cópia antiga depois de confirmar que a nova foi gravada.
        if (await this._idbPut('history', this._hist)) localStorage.removeItem(this.KEYS.history);
      }
    } else {
      this._hist = this._lerLocal(this.KEYS.history, []);
      this._excluidos = this._lerLocal('profe_excluidos', {});
    }
  },

  /* Avisa quem precisa reagir a mudanças nos dados (a sincronização). */
  aoMudar(fn) { this._ouvintes.push(fn); },
  _avisar() { if (!this._silencio) this._ouvintes.forEach(fn => { try { fn(); } catch { /* segue */ } }); },
  /* Roda `fn` sem disparar os avisos — usado pela própria sincronização. */
  semAvisar(fn) {
    this._silencio++;
    try { return fn(); } finally { this._silencio--; }
  },

  getHistory() { return [...this._hist]; },

  saveHistory(list) {
    this._hist = list;
    this._persistirHistorico();
    this._avisar();
  },

  addHistoryItem(item) {
    this.saveHistory([{ ...item, atualizadoEm: Date.now() }, ...this._hist]);
  },

  removeHistoryItem(id) {
    const item = this._hist.find(i => i.id === id);
    if (!item) return;
    this._excluidos[id] = { em: Date.now(), driveId: item.drive && item.drive.id || '' };
    this.saveHistory(this._hist.filter(i => i.id !== id));
  },

  updateHistoryItem(id, patch) {
    const list = [...this._hist];
    const i = list.findIndex(x => x.id === id);
    if (i < 0) return;
    list[i] = { ...list[i], ...patch, atualizadoEm: Date.now() };
    this.saveHistory(list);
  },

  clearHistory() {
    const agora = Date.now();
    this._hist.forEach(i => {
      this._excluidos[i.id] = { em: agora, driveId: i.drive && i.drive.id || '' };
    });
    this.saveHistory([]);
  },

  getExcluidos() {
    const copia = {};
    Object.entries(this._excluidos).forEach(([id, ex]) => { copia[id] = { ...ex }; });
    return copia;
  },

  /* Grava o vínculo com o arquivo do Drive sem contar como edição do item. */
  marcarDrive(id, drive) {
    const list = [...this._hist];
    const i = list.findIndex(x => x.id === id);
    if (i < 0) return;
    list[i] = { ...list[i], drive };
    this.semAvisar(() => this.saveHistory(list));
  },

  /* Substitui histórico e exclusões de uma vez (resultado de uma sincronização). */
  substituirHistorico(list, excluidos) {
    this._excluidos = excluidos;
    this.semAvisar(() => this.saveHistory(list));
  },

  _persistirHistorico() {
    if (this._idb) {
      this._idbPut('history', this._hist);
      this._idbPut('excluidos', this._excluidos);
      return;
    }
    // Sem IndexedDB: localStorage, com o limite antigo para não estourar a cota.
    this._hist = this._hist.slice(0, 100);
    localStorage.setItem(this.KEYS.history, JSON.stringify(this._hist));
    localStorage.setItem('profe_excluidos', JSON.stringify(this._excluidos));
  },

  _lerLocal(chave, padrao) {
    try {
      const v = JSON.parse(localStorage.getItem(chave));
      return v == null ? padrao : v;
    } catch {
      return padrao;
    }
  },

  _abrirIdb() {
    return new Promise(resolve => {
      if (!window.indexedDB) { resolve(null); return; }
      let req;
      try { req = indexedDB.open('profeai-dados', 1); } catch { resolve(null); return; }
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    });
  },

  _idbGet(chave) {
    return new Promise(resolve => {
      try {
        const r = this._idb.transaction('kv', 'readonly').objectStore('kv').get(chave);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => resolve(undefined);
      } catch { resolve(undefined); }
    });
  },

  _idbPut(chave, valor) {
    return new Promise(resolve => {
      try {
        const t = this._idb.transaction('kv', 'readwrite');
        t.objectStore('kv').put(valor, chave);
        t.oncomplete = () => resolve(true);
        t.onerror = () => resolve(false);
      } catch { resolve(false); }
    });
  },

  /* ===== Agenda ===== */
  /* Mapa { "AAAA-MM-DD": "UC10" } — qual UC ocorre em cada dia. */
  getAgenda() {
    try {
      return JSON.parse(localStorage.getItem(this.KEYS.agenda)) || {};
    } catch {
      return {};
    }
  },

  saveAgenda(map) {
    localStorage.setItem(this.KEYS.agenda, JSON.stringify(map));
    // Instante da última mudança: na sincronização, a agenda mais recente vence.
    localStorage.setItem('profe_agenda_em', String(Date.now()));
    this._avisar();
  },

  getAgendaEm() { return +localStorage.getItem('profe_agenda_em') || 0; },
  getReferenciasEm() { return +localStorage.getItem('profe_referencias_em') || 0; },

  /* Agenda e referências vindas de outro aparelho (sincronização). */
  substituirAgendaEReferencias({ agenda, agendaEm, referencias, referenciasEm }) {
    if (agenda) {
      localStorage.setItem(this.KEYS.agenda, JSON.stringify(agenda));
      localStorage.setItem('profe_agenda_em', String(agendaEm || 0));
    }
    if (referencias) {
      localStorage.setItem(this.KEYS.referencias, JSON.stringify(referencias));
      localStorage.setItem('profe_referencias_em', String(referenciasEm || 0));
    }
  },

  // Marca (uc não-vazia) ou desmarca (uc vazia) uma lista de datas ISO.
  setAgendaDays(dates, uc) {
    const map = this.getAgenda();
    const label = (uc || '').trim();
    dates.forEach(d => {
      if (label) map[d] = label;
      else delete map[d];
    });
    this.saveAgenda(map);
  },

  /* ===== Base (template) dos slides =====
     Vale para todos os slides: fundo, formas e cores do texto. `png` é o fundo
     já rasterizado — é ele que vai para a preview, para o PDF e para o PPTX,
     venha de formas montadas aqui ou de uma imagem enviada pelo professor. */
  BASE_PADRAO: {
    origem: 'formas',      // 'formas' | 'imagem'
    tema: 'aurora',        // id de js/temas.js; '' usa a forma pronta abaixo
    forma: 'grade',        // limpo | grade | faixa | topo | canto | diagonal
    fundo: '#ffffff',
    destaque: '#2563eb',
    destaque2: '#06b6d4',  // segunda cor do gradiente dos estilos prontos
    corTitulo: '#0f2a5c',
    corTexto: '#33415c',
    capaCor: '#ffffff',    // cor do texto no slide de capa (fundo em gradiente)
    barra: false,          // faixa colorida no rodapé
    png: '',               // data URL do fundo JÁ COMPOSTO (fundo + formas + elementos)
    pngCapa: '',           // idem, versão do slide de capa (só nos estilos prontos)
    imgPng: '',            // imagem enviada pelo professor, crua — só ela é reeditável
    /* Elementos desenhados à mão no montador, por cima do fundo. Cada um:
       { id, tipo: 'rect'|'ellipse'|'triangle'|'texto', x, y, w, h (em % do slide),
         cor, opacidade, texto, tamanho (% da altura), negrito, align } */
    elementos: [],
  },

  getBase() {
    try {
      const salvo = JSON.parse(localStorage.getItem(this.KEYS.base));
      if (!salvo) return { ...this.BASE_PADRAO };
      // Base salva antes dos estilos prontos: sem `tema`, ela continua sendo a
      // base montada à mão que o professor já tinha.
      const tema = 'tema' in salvo ? salvo.tema : '';
      return { ...this.BASE_PADRAO, ...salvo, tema };
    } catch {
      return { ...this.BASE_PADRAO };
    }
  },

  setBase(b) {
    localStorage.setItem(this.KEYS.base, JSON.stringify({ ...this.BASE_PADRAO, ...b }));
  },

  resetBase() {
    localStorage.removeItem(this.KEYS.base);
  },

  /* Últimas opções de slides (mínimo e densidade): o professor escolhe uma vez
     e as gerações seguintes já vêm com a preferência dele. */
  SLIDES_OPTS_PADRAO: { minSlides: 14, densidade: 'detalhado', tema: 'aurora' },

  getSlidesOpts() {
    try {
      return { ...this.SLIDES_OPTS_PADRAO, ...(JSON.parse(localStorage.getItem(this.KEYS.slidesOpts)) || {}) };
    } catch {
      return { ...this.SLIDES_OPTS_PADRAO };
    }
  },

  setSlidesOpts(o) {
    localStorage.setItem(this.KEYS.slidesOpts, JSON.stringify({ ...this.SLIDES_OPTS_PADRAO, ...o }));
  },

  /* Contadores de uso: nº de gerações e total de tokens gastos neste navegador. */
  getStats() {
    try {
      return JSON.parse(localStorage.getItem(this.KEYS.stats)) || { count: 0, tokens: 0 };
    } catch {
      return { count: 0, tokens: 0 };
    }
  },

  addUsage(tokens) {
    const s = this.getStats();
    s.count += 1;
    s.tokens += tokens || 0;
    localStorage.setItem(this.KEYS.stats, JSON.stringify(s));
  },

  /* ===== Referência da UC =====
     Ementa, bloco do PDT ou capítulo que vale para TODAS as aulas de uma UC.
     Guardada por UC, e não por aula: o professor cola uma vez e cada aula
     daquela UC nasce presa à fonte, em vez de o modelo preencher lacuna com
     invenção plausível. Fica fora do histórico de propósito — uma cópia do
     texto em cada material estouraria a cota do localStorage. */
  REF_MAX: 20000,

  /* UC é digitada à mão: "uc10", "UC10 " e "Uc10" são a mesma coisa. */
  chaveRef(uc) { return (uc || '').trim().toUpperCase(); },

  getReferencias() {
    try {
      return JSON.parse(localStorage.getItem(this.KEYS.referencias)) || {};
    } catch {
      return {};
    }
  },

  getReferencia(uc) {
    const k = this.chaveRef(uc);
    return k ? (this.getReferencias()[k] || '') : '';
  },

  setReferencia(uc, texto) {
    const k = this.chaveRef(uc);
    if (!k) return;
    const map = this.getReferencias();
    const t = (texto || '').trim().slice(0, this.REF_MAX);
    if (t) map[k] = t; else delete map[k];
    if (JSON.stringify(map) === localStorage.getItem(this.KEYS.referencias)) return;
    localStorage.setItem(this.KEYS.referencias, JSON.stringify(map));
    localStorage.setItem('profe_referencias_em', String(Date.now()));
    this._avisar();
  },

  /* ===== Backup (export/import) ===== */
  /* A chave de API NÃO é incluída de propósito — o arquivo pode ser compartilhado. */
  exportData() {
    return {
      app: 'professor-plus',
      version: 1,
      exportedAt: new Date().toISOString(),
      nome: this.getNome(),
      provider: this.getProvider(),
      models: { gemini: this.getModel('gemini'), openai: this.getModel('openai') },
      stats: this.getStats(),
      history: this.getHistory(),
      agenda: this.getAgenda(),
      base: this.getBase(),
      referencias: this.getReferencias(),
    };
  },

  importData(data, { merge = true } = {}) {
    if (!data || data.app !== 'professor-plus') {
      throw new Error('não é um backup do Professor+');
    }
    if (typeof data.nome === 'string') this.setNome(data.nome);
    if (data.provider) this.setProvider(data.provider);
    if (data.models) {
      if (data.models.gemini) this.setModel(data.models.gemini, 'gemini');
      if (data.models.openai) this.setModel(data.models.openai, 'openai');
    }
    if (data.stats) localStorage.setItem(this.KEYS.stats, JSON.stringify(data.stats));

    if (data.base && typeof data.base === 'object') this.setBase(data.base);

    if (data.referencias && typeof data.referencias === 'object') {
      const atuais = merge ? this.getReferencias() : {};
      localStorage.setItem(this.KEYS.referencias,
        JSON.stringify({ ...atuais, ...data.referencias }));
    }

    if (data.agenda && typeof data.agenda === 'object') {
      const atual = merge ? this.getAgenda() : {};
      this.saveAgenda({ ...atual, ...data.agenda });
    }

    if (Array.isArray(data.history)) {
      // Itens importados contam como mudança: vão para o Drive na próxima sincronização.
      const agora = Date.now();
      let lista = data.history.map(i => ({ ...i, atualizadoEm: i.atualizadoEm || agora }));
      if (merge) {
        const atual = this.getHistory();
        const ids = new Set(atual.map(i => i.id));
        lista = [...lista.filter(i => !ids.has(i.id)), ...atual]
          .sort((a, b) => new Date(b.data) - new Date(a.data));
      }
      this.saveHistory(lista);
    }
  },
};
