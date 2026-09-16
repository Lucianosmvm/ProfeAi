/* Provas e atividades: folha do aluno × gabarito, e versões embaralhadas.

   Tudo aqui trabalha sobre o formato pedido nos prompts (js/prompts.js):
   cada questão começa com "**Questão N**", alternativas uma por linha
   ("A) ...") e as respostas ficam na seção "## Gabarito". Materiais antigos,
   fora desse formato, também são aceitos quando dá para reconhecer as
   questões numeradas ("1. ...") e um título de gabarito. */
window.Avaliacao = (function () {
  'use strict';

  /* ===== Folha do aluno × gabarito (na tela, sobre o HTML) ===== */
  const RE_TITULO_GABARITO = /^\s*(gabarito|respostas|resolu[çc][ãa]o)\b/i;
  const RE_TITULO_ADAPTACAO = /o que foi adaptado/i;

  function ehTitulo(el) {
    if (/^H[1-6]$/.test(el.tagName)) return true;
    // "**Gabarito comentado**" sozinho num parágrafo também conta como título.
    if (el.tagName !== 'P') return false;
    const forte = el.querySelector('strong, b');
    return !!forte && forte.textContent.trim().length >= el.textContent.trim().length - 2
      && el.textContent.trim().length < 80;
  }

  /* Embrulha o gabarito (e a nota de adaptação, que é do professor) em blocos
     próprios, para a tela e a impressão poderem mostrar ou esconder cada um.
     Devolve se achou gabarito. Pode ser chamada de novo sem duplicar. */
  function marcar(box) {
    if (box.querySelector(':scope > .bloco-gabarito')) return true;
    const filhos = [...box.children];
    const iGab = filhos.findIndex(el => ehTitulo(el) && RE_TITULO_GABARITO.test(el.textContent));
    if (iGab < 0) return false;

    const iAdapt = filhos.findIndex((el, i) => i > iGab && ehTitulo(el) && RE_TITULO_ADAPTACAO.test(el.textContent));
    const inicio = filhos[iGab - 1] && filhos[iGab - 1].tagName === 'HR' ? iGab - 1 : iGab;
    const fim = iAdapt > 0 ? iAdapt : filhos.length;
    embrulhar(box, filhos.slice(inicio, fim), 'bloco-gabarito');
    if (iAdapt > 0) embrulhar(box, filhos.slice(iAdapt).filter(el => !el.classList.contains('no-print')), 'bloco-adaptacao');
    return true;
  }

  function embrulhar(box, elementos, classe) {
    if (!elementos.length) return;
    const bloco = document.createElement('div');
    bloco.className = classe;
    box.insertBefore(bloco, elementos[0]);
    elementos.forEach(el => bloco.appendChild(el));
  }

  /* Cópia do conteúdo só com a parte pedida: 'completo' | 'aluno' | 'gabarito'. */
  function recorte(box, vista) {
    const copia = box.cloneNode(true);
    copia.querySelectorAll('.no-print').forEach(el => el.remove());
    if (vista === 'aluno') {
      copia.querySelectorAll(':scope > .bloco-gabarito, :scope > .bloco-adaptacao').forEach(el => el.remove());
    } else if (vista === 'gabarito') {
      const titulo = copia.querySelector(':scope > h1');
      [...copia.children].forEach(el => {
        if (el !== titulo && !el.classList.contains('bloco-gabarito')) el.remove();
      });
    }
    return copia;
  }

  /* ===== Versão embaralhada (sobre o Markdown) ===== */
  const RE_QUESTAO = /^(\s{0,3}(?:#{1,6}\s*)?(?:\*\*|__)?\s*quest[aã]o\s+)(\d+)/i;
  const RE_NUMERADA = /^(\s{0,3}(?:\*\*)?)(\d{1,2})(?=[.)](?:\*\*)?\s+\S)/;
  const RE_ALTERNATIVA = /^(\s*(?:[-*]\s+)?(?:\*\*)?\(?)([A-Ea-e])(\)|\.)(\*\*)?(\s+.*)$/;
  const RE_GABARITO_MD = /^\s{0,3}(?:#{1,6}\s*(?:\*\*)?|\*\*)\s*(gabarito|respostas)\b/i;
  const RE_ADAPTACAO_MD = /^\s{0,3}(?:#{1,6}|\*\*).*o que foi adaptado/i;

  function erro(msg) { return new Error(msg); }

  function embaralharLista(lista, rnd) {
    const a = [...lista];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* Permutação que muda a ordem sempre que houver mais de um elemento. */
  function permutar(n, rnd) {
    const base = [...Array(n).keys()];
    if (n < 2) return base;
    for (let t = 0; t < 10; t++) {
      const p = embaralharLista(base, rnd);
      if (p.some((v, i) => v !== i)) return p;
    }
    return [...base.slice(1), base[0]];
  }

  /* Alternativas da questão: linhas seguidas A, B, C... (maiúsculas ou minúsculas). */
  function alternativas(linhas) {
    const achadas = [];
    linhas.forEach((l, i) => {
      const m = l.match(RE_ALTERNATIVA);
      if (!m) return;
      const esperada = String.fromCharCode(65 + achadas.length);
      if (m[2].toUpperCase() === esperada) achadas.push({ i, m });
    });
    return achadas.length >= 2 ? achadas : [];
  }

  /* Troca as letras citadas num texto de resposta ("C", "alternativa C", "letra C", "C)"). */
  function trocarLetras(texto, mapa) {
    if (!Object.keys(mapa).length) return texto;
    const troca = l => {
      const nova = mapa[l.toUpperCase()];
      return nova ? (l === l.toUpperCase() ? nova : nova.toLowerCase()) : l;
    };
    // Uma passada só: com várias, "alternativa (C)" seria trocada duas vezes.
    const re = /\b([Aa]lternativa|[Ll]etra|[Oo]p[çc][ãa]o|[Rr]esposta:?)(\s*\**\s*\(?)([A-Ea-e])\b|(^|[\s(*])([A-Ea-e])(?=\))|^(\s*\**\s*)([A-E])(?=\s*\**\s*$)/g;
    return texto.replace(re, (tudo, p1, s1, l1, p2, l2, p3, l3) => {
      if (l1) return p1 + s1 + troca(l1);
      if (l2) return p2 + troca(l2);
      return p3 + troca(l3);
    });
  }

  /* Gabarito em tabela: | Questão | Resposta | Justificativa | */
  function remontarTabela(linhas, novoNumero, mapas) {
    const idxLinhas = linhas.map((l, i) => i).filter(i => /^\s*\|/.test(linhas[i]));
    const dados = idxLinhas.filter(i => {
      const cel = linhas[i].split('|').slice(1, -1).map(c => c.trim());
      return cel.length >= 2 && /^\**\s*(?:quest[aã]o\s*)?\d+\s*\**$/i.test(cel[0]);
    });
    if (dados.length < 2) return null;

    const porNovo = [];
    dados.forEach(i => {
      const cel = linhas[i].split('|').slice(1, -1).map(c => c.trim());
      const antigo = parseInt(cel[0].replace(/\D/g, ''), 10);
      const novo = novoNumero[antigo];
      if (!novo) return;
      const mapa = mapas[antigo] || {};
      const celulas = cel.map((c, k) => (k === 0 ? c.replace(/\d+/, String(novo)) : trocarLetras(c, mapa)));
      porNovo[novo] = `| ${celulas.join(' | ')} |`;
    });
    const linhasOrdenadas = porNovo.filter(Boolean);
    if (linhasOrdenadas.length < dados.length) return null;

    // Mantém o que vem antes e depois das linhas de dados (título, cabeçalho da tabela, notas).
    const primeira = dados[0];
    const ultima = dados[dados.length - 1];
    return [...linhas.slice(0, primeira), ...linhasOrdenadas, ...linhas.slice(ultima + 1)];
  }

  /* Gabarito em lista: "1. C — ..." ou "**Questão 1:** C ..." (uma entrada pode ter várias linhas). */
  function remontarLista(linhas, novoNumero, mapas) {
    const reEntrada = /^(\s*(?:[-*]\s+)?(?:\*\*)?\s*(?:quest[aã]o\s*)?)(\d{1,2})(?=\s*(?:\*\*)?\s*[.):–—-])/i;
    const inicios = linhas.map((l, i) => (reEntrada.test(l) ? i : -1)).filter(i => i >= 0);
    if (inicios.length < 2) return null;
    const cabeca = linhas.slice(0, inicios[0]);
    const entradas = [];
    inicios.forEach((ini, k) => {
      const bloco = linhas.slice(ini, inicios[k + 1] ?? linhas.length);
      const antigo = parseInt(bloco[0].match(reEntrada)[2], 10);
      const novo = novoNumero[antigo];
      if (!novo) return;
      const mapa = mapas[antigo] || {};
      bloco[0] = bloco[0].replace(reEntrada, (_, p) => p + novo);
      entradas[novo] = bloco.map(l => trocarLetras(l, mapa));
    });
    const ordenadas = entradas.filter(Boolean);
    if (ordenadas.length < inicios.length) return null;
    return [...cabeca, ...ordenadas.flat()];
  }

  /* Monta a versão `letra` da prova: questões e alternativas em outra ordem e
     o gabarito refeito para a nova ordem. Lança erro se não reconhecer o formato. */
  function embaralhar(markdown, letra, rnd = Math.random) {
    const linhas = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');

    const iGab = linhas.findIndex(l => RE_GABARITO_MD.test(l));
    if (iGab < 0) throw erro('Não encontrei a seção "Gabarito" nesta prova.');
    let fimCorpo = iGab;
    while (fimCorpo > 0 && /^\s*(?:-{3,}|\*{3,}|_{3,})?\s*$/.test(linhas[fimCorpo - 1])) fimCorpo--;
    const corpo = linhas.slice(0, fimCorpo);
    let gabarito = linhas.slice(iGab);
    const iAdapt = gabarito.findIndex((l, i) => i > 0 && RE_ADAPTACAO_MD.test(l));
    const notaAdaptacao = iAdapt > 0 ? gabarito.slice(iAdapt) : [];
    if (iAdapt > 0) gabarito = gabarito.slice(0, iAdapt);

    const reInicio = corpo.some(l => RE_QUESTAO.test(l)) ? RE_QUESTAO : RE_NUMERADA;
    const inicios = corpo.map((l, i) => (reInicio.test(l) ? i : -1)).filter(i => i >= 0);
    if (inicios.length < 2) throw erro('Não reconheci as questões desta prova.');

    const cabecalho = corpo.slice(0, inicios[0]);
    const questoes = inicios.map((ini, k) => {
      const bloco = corpo.slice(ini, inicios[k + 1] ?? corpo.length);
      return { numero: parseInt(bloco[0].match(reInicio)[2], 10), linhas: bloco };
    });
    if (new Set(questoes.map(q => q.numero)).size !== questoes.length) {
      throw erro('A numeração das questões está repetida; não dá para refazer o gabarito com segurança.');
    }

    // Alternativas de cada questão em outra ordem.
    const mapas = {};
    questoes.forEach(q => {
      const alts = alternativas(q.linhas);
      if (!alts.length) return;
      const ordem = permutar(alts.length, rnd);
      const mapa = {};
      alts.forEach((alt, novaPos) => {
        const origem = alts[ordem[novaPos]];
        const letraNova = String.fromCharCode(65 + novaPos);
        const minuscula = alt.m[2] === alt.m[2].toLowerCase();
        mapa[origem.m[2].toUpperCase()] = letraNova;
        q.linhas[alt.i] = alt.m[1] + (minuscula ? letraNova.toLowerCase() : letraNova)
          + alt.m[3] + (alt.m[4] || '') + origem.m[5];
      });
      mapas[q.numero] = mapa;
    });

    // Questões em outra ordem, renumeradas.
    const ordemQ = permutar(questoes.length, rnd);
    const novoNumero = {};
    const embaralhadas = ordemQ.map((idx, pos) => {
      const q = questoes[idx];
      novoNumero[q.numero] = pos + 1;
      const linhasQ = [...q.linhas];
      linhasQ[0] = linhasQ[0].replace(reInicio, (_, p) => p + (pos + 1));
      // Separa bem uma questão da outra, mesmo que a original colada não tivesse linha em branco.
      if (linhasQ[linhasQ.length - 1].trim() !== '') linhasQ.push('');
      return linhasQ;
    });

    const novoGabarito = remontarTabela(gabarito, novoNumero, mapas)
      || remontarLista(gabarito, novoNumero, mapas);
    if (!novoGabarito) throw erro('Não consegui remontar o gabarito desta prova na nova ordem.');

    // Marca a versão logo abaixo do título (ou no topo, se não houver título).
    const iTitulo = cabecalho.findIndex(l => /^\s{0,3}#\s/.test(l));
    const marca = `**Versão ${letra}**`;
    if (iTitulo >= 0) cabecalho.splice(iTitulo + 1, 0, '', marca);
    else cabecalho.unshift(marca, '');

    return [
      ...cabecalho,
      ...embaralhadas.flat(),
      '---',
      '',
      ...novoGabarito,
      ...notaAdaptacao,
    ].join('\n');
  }

  return { marcar, recorte, embaralhar };
})();
