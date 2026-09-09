/* Cronograma: liga a Agenda (dias marcados por UC) às aulas já geradas.

   Cada aula gerada a partir de um dia da Agenda guarda a data em `params.data`.
   É essa data que amarra os dois lados — a Agenda continua sendo a única fonte
   do calendário, e mexer nela (feriado, recesso) não invalida nada do que já
   foi gerado. */
/* `##` e `###` do markdown: é assim que Prompts.aula manda a IA dividir a aula. */
const TITULO_SECAO = /^ {0,3}#{2,3} +(.+?) *$/;
const QUEBRA = /\r?\n/;

const Cronograma = {
  chaveUc(uc) { return (uc || '').trim().toUpperCase(); },

  /* Dias marcados com essa UC, em ordem cronológica (ISO ordena como texto). */
  dias(uc) {
    const alvo = this.chaveUc(uc);
    if (!alvo) return [];
    return Object.entries(Storage.getAgenda())
      .filter(([, u]) => this.chaveUc(u) === alvo)
      .map(([iso]) => iso)
      .sort();
  },

  /* Aula gerada para aquela data. O histórico vem do mais novo para o mais
     antigo, então o primeiro achado é a versão mais recente do dia. */
  aulaDoDia(iso) {
    if (!iso) return null;
    return Storage.getHistory().find(
      i => i.tipo === 'aula' && i.params && i.params.data === iso
    ) || null;
  },

  /* Mapa { "AAAA-MM-DD": item } com todos os dias que já têm aula gerada —
     usado para pintar o calendário numa passada só. */
  mapa() {
    const out = {};
    Storage.getHistory().forEach(i => {
      const iso = i.tipo === 'aula' && i.params && i.params.data;
      // O histórico vem do mais novo para o mais antigo: não sobrescreve.
      if (iso && !out[iso]) out[iso] = i;
    });
    return out;
  },

  /* Situação de um dia: posição dentro da UC e as aulas vizinhas já geradas.
     As vizinhas alimentam os campos "aula anterior/próxima" do formulário —
     é o que garante a progressão entre as aulas. */
  info(iso) {
    const uc = Storage.getAgenda()[iso] || '';
    if (!uc) return null;
    const dias = this.dias(uc);
    const indice = dias.indexOf(iso);
    return {
      uc,
      indice,
      total: dias.length,
      aula: this.aulaDoDia(iso),
      anterior: indice > 0 ? this.aulaDoDia(dias[indice - 1]) : null,
      proxima: indice >= 0 && indice < dias.length - 1 ? this.aulaDoDia(dias[indice + 1]) : null,
    };
  },

  /* Títulos de seção do material de uma aula já gerada.

     O tema sozinho não diz o que foi DADO — com ele o modelo reensina o que a
     turma já viu ou pula o que ficou faltando. Estes títulos são o conteúdo
     real da aula vizinha, e é isso que amarra uma aula na seguinte. */
  topicos(item) {
    if (!item || !item.conteudo) return [];
    const out = [];
    String(item.conteudo).split(QUEBRA).forEach(linha => {
      const m = linha.match(TITULO_SECAO);
      if (m) out.push(m[1].replace(/[*_`]/g, '').trim());
    });
    return out.filter(Boolean).slice(0, 12);
  },

  /* Tema da aula de um item do histórico, para rótulos curtos. */
  tema(item) {
    if (!item) return '';
    return (item.params && item.params.tema) || item.titulo || '';
  },
};
