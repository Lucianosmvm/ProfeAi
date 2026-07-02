/* Chamada à API da OpenAI direto do navegador, com streaming (SSE).
   A chave vem do localStorage e só é enviada para api.openai.com. */
const Api = {
  async *stream(userPrompt) {
    const apiKey = Storage.getApiKey();
    if (!apiKey) {
      throw new Error('SEM_CHAVE');
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: Storage.getModel(),
        stream: true,
        messages: [
          { role: 'system', content: Prompts.system },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!res.ok) {
      let detail = '';
      try {
        const err = await res.json();
        detail = err.error?.message || '';
      } catch { /* corpo não é JSON */ }
      if (res.status === 401) throw new Error('CHAVE_INVALIDA');
      if (res.status === 429) throw new Error('LIMITE: ' + detail);
      throw new Error(`Erro ${res.status}: ${detail}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // eventos SSE são separados por linha; cada dado vem como "data: {...}"
      const lines = buffer.split('\n');
      buffer = lines.pop(); // última linha pode estar incompleta

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') return;
        try {
          const chunk = JSON.parse(payload);
          const text = chunk.choices?.[0]?.delta?.content;
          if (text) yield text;
        } catch { /* linha parcial, ignora */ }
      }
    }
  },

  friendlyError(err) {
    if (err.message === 'SEM_CHAVE')
      return 'Configure sua chave da API OpenAI em ⚙️ Configurações antes de gerar.';
    if (err.message === 'CHAVE_INVALIDA')
      return 'Chave da API inválida. Verifique em ⚙️ Configurações.';
    if (err.message.startsWith('LIMITE'))
      return 'Limite de uso da API atingido. Verifique seu saldo em platform.openai.com. ' + err.message;
    if (err instanceof TypeError)
      return 'Falha de conexão. Verifique sua internet.';
    return 'Erro ao gerar: ' + err.message;
  },
};
