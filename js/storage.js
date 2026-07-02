/* Persistência em localStorage: configurações e histórico. */
const Storage = {
  KEYS: {
    provider: 'profe_provider',
    apiKey: 'profe_api_key_',   // sufixado pelo provedor
    model: 'profe_model_',      // sufixado pelo provedor
    nome: 'profe_nome',
    history: 'profe_history',
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

  clearHistory() {
    localStorage.removeItem(this.KEYS.history);
  },
};
