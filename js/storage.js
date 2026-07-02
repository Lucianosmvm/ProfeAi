/* Persistência em localStorage: configurações e histórico. */
const Storage = {
  KEYS: {
    apiKey: 'profe_api_key',
    model: 'profe_model',
    nome: 'profe_nome',
    history: 'profe_history',
  },

  getApiKey() { return localStorage.getItem(this.KEYS.apiKey) || ''; },
  setApiKey(v) { localStorage.setItem(this.KEYS.apiKey, v); },

  getModel() { return localStorage.getItem(this.KEYS.model) || 'gpt-4o-mini'; },
  setModel(v) { localStorage.setItem(this.KEYS.model, v); },

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
