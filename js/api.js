/* Chamadas às APIs de IA direto do navegador, com streaming (SSE).
   A chave vem do localStorage e só é enviada para o provedor escolhido. */
const Api = {
  PROVIDERS: {
    gemini: {
      nome: 'Google Gemini',
      keyHint: 'Grátis, sem cartão. Crie a sua em <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>. A chave fica salva apenas neste navegador.',
      keyPlaceholder: 'AIza...',
      models: [
        { id: 'gemini-2.5-flash', label: 'gemini-2.5-flash (recomendado)' },
        { id: 'gemini-2.5-flash-lite', label: 'gemini-2.5-flash-lite (mais rápido)' },
        { id: 'gemini-2.5-pro', label: 'gemini-2.5-pro (melhor qualidade, limite menor)' },
      ],
    },
    openai: {
      nome: 'OpenAI',
      keyHint: 'Requer crédito pré-pago. Crie a sua em <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">platform.openai.com/api-keys</a>. A chave fica salva apenas neste navegador.',
      keyPlaceholder: 'sk-...',
      models: [
        { id: 'gpt-4o-mini', label: 'gpt-4o-mini (rápido e barato)' },
        { id: 'gpt-4o', label: 'gpt-4o (melhor qualidade)' },
        { id: 'gpt-4.1-mini', label: 'gpt-4.1-mini' },
        { id: 'gpt-4.1', label: 'gpt-4.1' },
      ],
    },
  },

  // Preenchido durante o stream com { prompt, output, total } tokens da última geração.
  lastUsage: null,

  stream(userPrompt) {
    const apiKey = Storage.getApiKey();
    if (!apiKey) throw new Error('SEM_CHAVE');
    this.lastUsage = null;
    const provider = Storage.getProvider();
    return provider === 'gemini'
      ? this._streamGemini(apiKey, userPrompt)
      : this._streamOpenai(apiKey, userPrompt);
  },

  async *_streamOpenai(apiKey, userPrompt) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: Storage.getModel(),
        stream: true,
        stream_options: { include_usage: true },
        messages: [
          { role: 'system', content: Prompts.system },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    await this._checkResponse(res);

    for await (const data of this._sseLines(res)) {
      if (data === '[DONE]') return;
      try {
        const obj = JSON.parse(data);
        const text = obj.choices?.[0]?.delta?.content;
        if (text) yield text;
        if (obj.usage) this.lastUsage = {
          prompt: obj.usage.prompt_tokens,
          output: obj.usage.completion_tokens,
          total: obj.usage.total_tokens,
        };
      } catch { /* linha parcial, ignora */ }
    }
  },

  async *_streamGemini(apiKey, userPrompt) {
    const model = Storage.getModel();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: Prompts.system }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      }),
    });
    await this._checkResponse(res);

    for await (const data of this._sseLines(res)) {
      try {
        const obj = JSON.parse(data);
        const text = obj.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) yield text;
        if (obj.usageMetadata) this.lastUsage = {
          prompt: obj.usageMetadata.promptTokenCount,
          output: obj.usageMetadata.candidatesTokenCount,
          total: obj.usageMetadata.totalTokenCount,
        };
      } catch { /* linha parcial, ignora */ }
    }
  },

  async _checkResponse(res) {
    if (res.ok) return;
    let detail = '';
    try {
      const err = await res.json();
      detail = err.error?.message || '';
    } catch { /* corpo não é JSON */ }
    if (res.status === 401 || res.status === 403) throw new Error('CHAVE_INVALIDA');
    if (res.status === 429) throw new Error('LIMITE: ' + detail);
    throw new Error(`Erro ${res.status}: ${detail}`);
  },

  /* Lê um corpo SSE e emite o conteúdo de cada linha "data: ...".
     Idle-timeout: se o stream parar de enviar por mais de IDLE_MS, aborta em vez de
     travar para sempre (senão o spinner giraria eternamente e bloquearia as próximas gerações). */
  async *_sseLines(res) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const IDLE_MS = 60000;

    try {
      while (true) {
        const { done, value } = await this._readWithTimeout(reader, IDLE_MS);
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop(); // última linha pode estar incompleta

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data:')) yield trimmed.slice(5).trim();
        }
      }
    } finally {
      try { reader.releaseLock(); } catch { /* já liberado/cancelado */ }
    }
  },

  /* reader.read() com corte: se demorar mais que ms, cancela o stream e rejeita. */
  _readWithTimeout(reader, ms) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reader.cancel().catch(() => {});
        reject(new Error('TIMEOUT'));
      }, ms);
    });
    return Promise.race([reader.read(), timeout]).finally(() => clearTimeout(timer));
  },

  friendlyError(err) {
    if (err.message === 'SEM_CHAVE')
      return 'Configure sua chave de API em ⚙️ Configurações antes de gerar.';
    if (err.message === 'CHAVE_INVALIDA')
      return 'Chave da API inválida. Verifique em ⚙️ Configurações.';
    if (err.message.startsWith('LIMITE'))
      return 'Limite de uso da API atingido. Aguarde alguns minutos e tente de novo. ' + err.message;
    if (err.message === 'TIMEOUT')
      return 'A geração travou (sem resposta da IA). Tente gerar novamente.';
    if (err instanceof TypeError)
      return 'Falha de conexão. Verifique sua internet.';
    return 'Erro ao gerar: ' + err.message;
  },
};
