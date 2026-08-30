/* Cronograma: junta a Agenda (dias marcados por UC) com o Plano de Curso
   (aulas numeradas). A regra é direta: a aula N de uma UC cai no N-ésimo dia
   marcado com aquela UC, em ordem cronológica.

   A Agenda continua sendo a ÚNICA fonte das datas — o Plano de Curso não guarda
   data nenhuma. Assim, mexer no calendário (feriado, recesso, dia de projeto)
   reorganiza as aulas sozinho, sem precisar gerar o plano de novo. */
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

  /* Plano de Curso mais recente da UC. O histórico já vem do mais novo para o
     mais antigo, então o primeiro achado é o que vale. */
  plano(uc) {
    const alvo = this.chaveUc(uc);
    if (!alvo) return null;
    return Storage.getHistory().find(
      i => i.tipo === 'curso' && this.chaveUc(i.params && i.params.uc) === alvo
    ) || null;
  },

  /* Aulas do Plano de Curso da UC, na ordem em que foram geradas. */
  aulas(uc) {
    const p = this.plano(uc);
    return p ? Prompts.parseAulas(p.conteudo) : [];
  },

  /* Mapa { "AAAA-MM-DD": { uc, plano, aula, indice, total, anterior, proxima } }
     com todos os dias que já têm uma aula correspondente. */
  mapa() {
    const porUc = new Map(); // chave -> { uc, dias: [] }
    Object.entries(Storage.getAgenda())
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([iso, uc]) => {
        const k = this.chaveUc(uc);
        if (!k) return;
        if (!porUc.has(k)) porUc.set(k, { uc, dias: [] });
        porUc.get(k).dias.push(iso);
      });

    const out = {};
    porUc.forEach(({ uc, dias }) => {
      const plano = this.plano(uc);
      if (!plano) return;
      const aulas = Prompts.parseAulas(plano.conteudo);
      dias.forEach((iso, i) => {
        if (i >= aulas.length) return; // sobram dias: o plano acabou antes
        out[iso] = {
          uc,
          plano,
          aula: aulas[i],
          indice: i,
          total: aulas.length,
          anterior: aulas[i - 1] || null,
          proxima: aulas[i + 1] || null,
        };
      });
    });
    return out;
  },

  /* Situação de uma UC: quantos dias marcados x quantas aulas no plano. */
  resumo(uc) {
    const dias = this.dias(uc);
    const plano = this.plano(uc);
    const aulas = plano ? Prompts.parseAulas(plano.conteudo) : [];
    return {
      uc,
      plano,
      dias: dias.length,
      aulas: aulas.length,
      diasSemAula: Math.max(0, dias.length - aulas.length),
      aulasSemDia: Math.max(0, aulas.length - dias.length),
    };
  },

  /* Número da aula ("3") a partir do bloco colado no campo "Aula do Plano de Curso". */
  numeroDoBloco(texto) {
    const m = (texto || '').match(/^#{0,3}\s*AULA\s+(\d+)\s*[—\-–:]/im);
    return m ? m[1] : null;
  },

  /* Aula Completa já gerada para essa aula do plano (mesma UC, mesmo número). */
  aulaGerada(uc, aula) {
    const alvo = this.chaveUc(uc);
    return Storage.getHistory().find(i =>
      i.tipo === 'plano'
      && this.chaveUc(i.params && i.params.uc) === alvo
      && this.numeroDoBloco(i.params && i.params.basecurso) === aula.numero
    ) || null;
  },
};
