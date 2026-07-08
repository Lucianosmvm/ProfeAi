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
