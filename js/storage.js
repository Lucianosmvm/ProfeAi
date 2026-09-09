/* Persistência em localStorage: configurações e histórico. */
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

  getHistory() {
    try {
      return JSON.parse(localStorage.getItem(this.KEYS.history)) || [];
    } catch {
      return [];
    }
  },

  saveHistory(list) {
    localStorage.setItem(this.KEYS.history, JSON.stringify(list));
  },

  addHistoryItem(item) {
    const list = this.getHistory();
    list.unshift(item);
    // limite de 100 itens para não estourar a cota do localStorage
    this.saveHistory(list.slice(0, 100));
  },

  removeHistoryItem(id) {
    this.saveHistory(this.getHistory().filter(i => i.id !== id));
  },

  updateHistoryItem(id, patch) {
    const list = this.getHistory();
    const i = list.findIndex(x => x.id === id);
    if (i < 0) return;
    list[i] = { ...list[i], ...patch };
    this.saveHistory(list);
  },

  clearHistory() {
    localStorage.removeItem(this.KEYS.history);
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
    forma: 'grade',        // limpo | grade | faixa | topo | canto | diagonal
    fundo: '#ffffff',
    destaque: '#4f46e5',
    corTitulo: '#3d4a5c',
    corTexto: '#3d4a5c',
    barra: true,           // faixa colorida no rodapé
    png: '',               // data URL do fundo JÁ COMPOSTO (fundo + formas + elementos)
    imgPng: '',            // imagem enviada pelo professor, crua — só ela é reeditável
    /* Elementos desenhados à mão no montador, por cima do fundo. Cada um:
       { id, tipo: 'rect'|'ellipse'|'triangle'|'texto', x, y, w, h (em % do slide),
         cor, opacidade, texto, tamanho (% da altura), negrito, align } */
    elementos: [],
  },

  getBase() {
    try {
      return { ...this.BASE_PADRAO, ...(JSON.parse(localStorage.getItem(this.KEYS.base)) || {}) };
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
  SLIDES_OPTS_PADRAO: { minSlides: 14, densidade: 'detalhado' },

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

    if (data.agenda && typeof data.agenda === 'object') {
      const atual = merge ? this.getAgenda() : {};
      this.saveAgenda({ ...atual, ...data.agenda });
    }

    if (Array.isArray(data.history)) {
      let lista = data.history;
      if (merge) {
        const atual = this.getHistory();
        const ids = new Set(atual.map(i => i.id));
        lista = [...data.history.filter(i => !ids.has(i.id)), ...atual]
          .sort((a, b) => new Date(b.data) - new Date(a.data));
      }
      this.saveHistory(lista.slice(0, 100));
    }
  },
};
