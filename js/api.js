/* Chamadas às APIs de IA direto do navegador, com streaming (SSE).
   A chave vem do localStorage e só é enviada para o provedor escolhido. */
const Api = {
  PROVIDERS: {
    gemini: {
      nome: 'Google Gemini',
      keyHint: 'Grátis, sem cartão. Crie a sua em <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>. A chave fica salva apenas neste navegador.',
      keyPlaceholder: 'AIza...',
      models: [
        { id: 'gemini-2.5-flash', label: 'gemini-2.5-flash (recomendado)', maxOut: 32768 },
        { id: 'gemini-2.5-flash-lite', label: 'gemini-2.5-flash-lite (mais rápido)', maxOut: 32768 },
        { id: 'gemini-2.5-pro', label: 'gemini-2.5-pro (melhor qualidade, limite menor)', maxOut: 32768 },
      ],
    },
    openai: {
      nome: 'OpenAI',
      keyHint: 'Requer crédito pré-pago. Crie a sua em <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">platform.openai.com/api-keys</a>. A chave fica salva apenas neste navegador.',
      keyPlaceholder: 'sk-...',
      models: [
        { id: 'gpt-4o-mini', label: 'gpt-4o-mini (rápido e barato)', maxOut: 16384 },
        { id: 'gpt-4o', label: 'gpt-4o (melhor qualidade)', maxOut: 16384 },
        { id: 'gpt-4.1-mini', label: 'gpt-4.1-mini', maxOut: 16384 },
        { id: 'gpt-4.1', label: 'gpt-4.1', maxOut: 16384 },
      ],
    },
  },

  // Preenchido durante o stream com { prompt, output, total } tokens da última geração.
  lastUsage: null,
  // Motivo do fim da última geração ('STOP', 'MAX_TOKENS', 'length'...).
  lastFinish: null,

  /* Teto de saída do modelo escolhido. Sem isso o provedor usa o default dele,
     que corta materiais longos (um Plano de Curso de 32 aulas, por exemplo)
     no meio, sem avisar. */
  maxOut(provider = Storage.getProvider(), model = Storage.getModel()) {
    const m = this.PROVIDERS[provider].models.find(x => x.id === model);
    return (m && m.maxOut) || 8192;
  },

  /* A última resposta foi cortada no limite de tamanho? */
  truncou() {
    const f = (this.lastFinish || '').toUpperCase();
    return f === 'MAX_TOKENS' || f === 'LENGTH';
  },

  stream(userPrompt) {
    const apiKey = Storage.getApiKey();
    if (!apiKey) throw new Error('SEM_CHAVE');
    this.lastUsage = null;
    this.lastFinish = null;
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
        max_tokens: this.maxOut('openai'),
        stream_options: { include_usage: true },
        messages: [
          { role: 'system', content: Prompts.buildSystem() },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    await this._checkResponse(res, 'openai');

    for await (const data of this._sseLines(res)) {
      if (data === '[DONE]') return;
      try {
        const obj = JSON.parse(data);
        const text = obj.choices?.[0]?.delta?.content;
        if (text) yield text;
        const fim = obj.choices?.[0]?.finish_reason;
        if (fim) this.lastFinish = fim;
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
        systemInstruction: { parts: [{ text: Prompts.buildSystem() }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { maxOutputTokens: this.maxOut('gemini', model) },
      }),
    });
    await this._checkResponse(res, 'gemini');

    for await (const data of this._sseLines(res)) {
      try {
        const obj = JSON.parse(data);
        const text = obj.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) yield text;
        const fim = obj.candidates?.[0]?.finishReason;
        if (fim) this.lastFinish = fim;
        if (obj.usageMetadata) this.lastUsage = {
          prompt: obj.usageMetadata.promptTokenCount,
          output: obj.usageMetadata.candidatesTokenCount,
          total: obj.usageMetadata.totalTokenCount,
        };
      } catch { /* linha parcial, ignora */ }
    }
  },

  async _checkResponse(res, provider) {
    if (res.ok) return;
    let corpo = null;
    let detail = '';
    try {
      corpo = await res.json();
      detail = corpo.error?.message || '';
    } catch { /* corpo não é JSON */ }
    if (res.status === 401 || res.status === 403) throw new Error('CHAVE_INVALIDA');
    if (res.status === 429) {
      const e = new Error('LIMITE');
      e.limite = this._classificarLimite(corpo, provider);
      throw e;
    }
    throw new Error(`Erro ${res.status}: ${detail}`);
  },

  /* Três situações diferentes chegam como 429, e o conselho certo é oposto em
     cada uma: esperar um minuto resolve o limite de ritmo, não resolve a cota
     do dia e nunca resolve crédito acabado. Uma mensagem só mandava o
     professor esperar em casos em que esperar não adianta. */
  _classificarLimite(corpo, provider) {
    const erro = (corpo && corpo.error) || {};
    const msg = erro.message || '';
    // Os detalhes do Gemini trazem o quotaId ("...PerDay...", "...PerMinute...")
    // e o retryDelay; é o que diz QUAL cota estourou.
    const texto = (msg + ' ' + JSON.stringify(erro.details || '')).toLowerCase();
    const codigo = String(erro.code || erro.type || '').toLowerCase();
    const base = { detalhe: msg, provedor: provider };

    // Cota por dia: o quotaId do Gemini é a fonte confiável. A frase "check your
    // plan and billing details" NÃO serve para decidir — o Gemini free devolve
    // ela também, e aí viraria "recarregue o crédito" para quem não tem crédito.
    if (/per ?day|requests per day|daily/.test(texto)) {
      return { ...base, tipo: 'diaria' };
    }
    if (provider === 'openai'
      && (codigo === 'insufficient_quota' || /insufficient_quota/.test(texto))) {
      return { ...base, tipo: 'saldo' };
    }
    return { ...base, tipo: 'ritmo', esperar: this._segundosDeEspera(texto) };
  },

  /* Quanto esperar, quando o provedor diz: retryDelay "27s" (Gemini) ou
     "try again in 20s" (OpenAI). 0 = não informou. */
  _segundosDeEspera(texto) {
    const m = texto.match(/retrydelay"?\s*:\s*"?(\d+(?:\.\d+)?)s/)
      || texto.match(/try again in (\d+(?:\.\d+)?)\s*(ms|s)/);
    if (!m) return 0;
    const n = parseFloat(m[1]);
    return Math.max(1, Math.ceil(m[2] === 'ms' ? n / 1000 : n));
  },

  /* Lê um corpo SSE e emite o conteúdo de cada linha "data: ...".
     Idle-timeout: se o stream parar de enviar por mais de IDLE_MS, aborta em vez de
     travar para sempre (senão o spinner giraria eternamente e bloquearia as próximas gerações). */
  async *_sseLines(res) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const IDLE_MS = 120000;

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

  /* O texto cru do provedor vem junto, curto: é o que permite pesquisar o
     erro exato quando a classificação não bate. */
  _msgLimite(info) {
    const i = info || { tipo: 'ritmo' };
    const cru = (i.detalhe || '').trim();
    const rodape = cru ? ` · Mensagem do provedor: ${cru.slice(0, 200)}` : '';

    if (i.tipo === 'saldo') {
      return 'Seu crédito na OpenAI acabou. Esperar não resolve — adicione créditos em '
        + 'platform.openai.com/settings/organization/billing e tente de novo.' + rodape;
    }
    if (i.tipo === 'diaria') {
      const onde = i.provedor === 'gemini' ? 'do Gemini' : 'da API';
      return `A cota DIÁRIA ${onde} acabou. Ela só volta amanhã — até lá, dá para trocar `
        + 'de modelo ou de provedor em ⚙️ Configurações.' + rodape;
    }
    const espera = i.esperar
      ? `${i.esperar} segundo${i.esperar > 1 ? 's' : ''}`
      : 'cerca de um minuto';
    return `Muitas requisições em pouco tempo. Espere ${espera} e clique em `
      + '🔄 Gerar novamente.' + rodape;
  },

  friendlyError(err) {
    if (err.message === 'SEM_CHAVE')
      return 'Configure sua chave de API em ⚙️ Configurações antes de gerar.';
    if (err.message === 'CHAVE_INVALIDA')
      return 'Chave da API inválida. Verifique em ⚙️ Configurações.';
    if (err.message.startsWith('LIMITE')) return this._msgLimite(err.limite);
    if (err.message === 'TIMEOUT')
      return 'A geração travou (sem resposta da IA). Tente gerar novamente.';
    if (err instanceof TypeError)
      return 'Falha de conexão. Verifique sua internet.';
    return 'Erro ao gerar: ' + err.message;
  },
};
