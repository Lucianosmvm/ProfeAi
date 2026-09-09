/* Fluxos guiados: cada função transforma os campos do formulário em prompt.
   O professor nunca vê nem escreve isso. */

const Prompts = {
  /* Regras de linguagem fixas: material didático, não material técnico.
     Sem elas o modelo copia o registro do texto que recebe — e o que ele
     recebe é jargão de PDT. */
  REGRAS_LINGUAGEM: `Escreva para quem está começando no assunto:
- Apresente a IDEIA antes do NOME: explique o conceito com uma situação concreta do dia a dia e só depois diga como ele se chama.
- Todo termo técnico e toda sigla ganham explicação em linguagem simples na primeira vez que aparecem; sigla sempre expandida por extenso.
- Se um tópico depende de um pré-requisito, ensine o pré-requisito em duas ou três linhas em vez de supor que o aluno já sabe.
- Frases curtas e diretas. Prefira a palavra comum à palavra sofisticada.
- Um conceito novo por vez, cada um seguido de um exemplo concreto.
- Nenhuma definição sozinha: definição sempre acompanhada de exemplo ou analogia.`,

  /* System prompt: base didática usada em toda geração. */
  buildSystem() {
    return `Você é um assistente pedagógico que escreve materiais didáticos para professores brasileiros.
Responda sempre em português do Brasil, em Markdown bem formatado, pronto para impressão.

## Para quem você escreve
${this.REGRAS_LINGUAGEM}

## Como você escreve
- O material é para o ALUNO ler e entender sozinho. Nada de meta-instruções do tipo "o professor deve...".
- Priorize COMPREENSÃO sobre completude: é melhor o aluno entender bem cinco pontos do que ler dez sem entender.
- Use exemplos concretos e brasileiros, do cotidiano ou do mundo do trabalho do curso.
- Sem enrolação, sem frases de efeito, sem repetir o que já foi dito.
- Quando o pedido especificar um formato curto (listas, tópicos, tabelas, slides), estas regras valem para a ESCOLHA DAS PALAVRAS, não para alongar o texto: mantenha o formato pedido.
- Se o pedido informar um público ou nível próprio, ele prevalece sobre o perfil padrão acima.
- Entregue o material pronto para uso em sala, sem necessidade de edição.`;
  },

  /* Necessidades oferecidas no formulário da aula. */
  NECESSIDADES: [
    'TDAH',
    'Dislexia',
    'TEA (Transtorno do Espectro Autista)',
    'Deficiência intelectual',
    'Baixa visão',
    'Surdez / deficiência auditiva',
    'Discalculia',
    'Altas habilidades / superdotação',
    'Baixa proficiência em leitura',
  ],

  /* Lista de adaptações pedidas no formulário, normalizada. */
  adaptacoes(d) {
    const a = d && d.adaptacoes;
    if (Array.isArray(a)) return a.filter(Boolean);
    return a ? [String(a)] : [];
  },

  /* Bloco de adaptação inclusiva anexado a QUALQUER material.
     A adaptação é pedida uma vez, na geração da aula, e acompanha os materiais
     derivados dela — atividade, prova e slides saem já adaptados. */
  blocoAdaptacao(d, opts) {
    const lista = this.adaptacoes(d);
    if (!lista.length && !(d.adaptobs || '').trim()) return '';
    // Nos slides a seção final quebraria o formato (viraria um slide torto):
    // o texto vai direto para o gerador, que lê cada bloco como um slide.
    const resumo = (opts && opts.semResumo)
      ? ''
      : `
- Ao final do material, acrescente a seção **O que foi adaptado e por quê** — lista curta ligando cada escolha à necessidade atendida.`;
    return `

ADAPTAÇÃO INCLUSIVA — obrigatória neste material${lista.length ? `
Adapte para estudantes com: ${lista.join(', ')}.` : ''}${(d.adaptobs || '').trim() ? `
Contexto adicional da turma/aluno: ${d.adaptobs.trim()}` : ''}
- Mantenha os objetivos de aprendizagem e o conteúdo essencial — adapte a FORMA, não rebaixe o conteúdo.
- Aplique estratégias específicas para essas necessidades: linguagem e vocabulário, estrutura e layout, segmentação das tarefas em passos curtos, apoios visuais, clareza das instruções, tempo e forma de avaliação.${resumo}`;
  },

  /* ===== Slides: quantidade e densidade escolhidas pelo professor =====
     Professor iniciante precisa de slide que sustente a fala; professor
     experiente prefere tela limpa. A escolha é feita na hora de gerar. */
  SLIDES_DENSIDADES: {
    enxuto: {
      lista: 'No máximo 5 itens por slide, cada um com no máximo 12 palavras.',
      conteudo: `- Cada slide cabe numa tela projetada: pouco texto, frase curta, um conceito por slide. O que não couber vira um segundo slide com o mesmo tema.
- LIMITE DE TELA: no máximo 35 palavras por slide. Nada de parágrafo longo — o professor fala o resto.`,
    },
    equilibrado: {
      lista: 'No máximo 5 itens por slide, cada um com no máximo 14 palavras.',
      conteudo: `- Cada slide de conteúdo traz os tópicos e, abaixo, um parágrafo curto (1 a 2 linhas) que explica ou exemplifica o ponto principal.
- Um conceito por slide. LIMITE DE TELA: no máximo 60 palavras por slide — o que não couber vira um segundo slide com o mesmo tema.`,
    },
    detalhado: {
      lista: 'No máximo 6 itens por slide, cada um com no máximo 16 palavras.',
      conteudo: `- Cada slide de conteúdo precisa dar ao professor O QUE FALAR: depois dos tópicos, escreva um parágrafo de 2 a 4 linhas explicando o conceito em linguagem simples e, em outro parágrafo curto, um exemplo concreto do cotidiano ou do mundo do trabalho.
- Escreva as definições por extenso e explique ali mesmo, no slide, todo termo técnico e toda sigla — quem conduz a aula está dando esse conteúdo pela primeira vez.
- Um conceito por slide, mesmo assim. LIMITE DE TELA: no máximo 90 palavras por slide. Passou disso, divida em dois slides com o mesmo tema, titulados \`Tema (1/2)\` e \`Tema (2/2)\` — nunca encolha a explicação para caber.`,
    },
  },

  /* Densidade pedida; sem escolha, mantém o comportamento antigo (enxuto). */
  slidesDensidade(d) {
    return this.SLIDES_DENSIDADES[(d && d.densidade) || ''] || this.SLIDES_DENSIDADES.enxuto;
  },

  /* Mínimo de slides pedido. 0 = professor não informou. */
  slidesMinimo(d) {
    const n = parseInt(d && d.minSlides, 10);
    return Number.isFinite(n) && n > 0 ? Math.min(n, 60) : 0;
  },

  /* Bloco CONTEÚDO dos slides: quantidade + densidade. */
  regraSlides(d) {
    const min = this.slidesMinimo(d);
    const qtd = min
      ? `- Gere NO MÍNIMO ${min} slides, contando a capa. Pode passar disso se o conteúdo pedir, nunca ficar abaixo: faltando slide, quebre os temas mais densos em partes em vez de inchar um slide.`
      : '- Gere de 10 a 14 slides.';
    return `${qtd}
${this.slidesDensidade(d).conteudo}`;
  },

  aula(d) {
    // Aulas vizinhas (vêm preenchidas da Agenda): sem elas o modelo INVENTA o
    // que foi visto antes, e cada aula sai desconectada da anterior.
    const vizinhas = [
      d.aulaanterior ? `- Aula anterior (já dada): ${d.aulaanterior}` : '',
      d.aulaproxima ? `- Próxima aula (ainda não dada): ${d.aulaproxima}` : '',
    ].filter(Boolean).join('\n');
    const abertura = d.abertura === 'sim' || d.abertura === true;

    return `Gere a AULA COMPLETA, pronta para ser ministrada: o CONTEÚDO em si que será ensinado. NÃO é um plano de aula, NÃO é um roteiro de instruções ao professor. É o material da aula — explicações, definições, exemplos, tabelas e atividades — desenvolvido para preencher todo o tempo da aula.

- Duração total da aula: ${d.carga}
${vizinhas}

O professor descreveu assim a aula que quer. Siga este pedido como escopo — o que ele pediu entra, o que ele não pediu fica de fora. Se o pedido trouxer disciplina, público ou tópicos, use-os; se não trouxer, deduza do próprio texto e siga em frente sem pedir esclarecimento:
=== PEDIDO DO PROFESSOR ===
${(d.pedido || '').trim()}
=== FIM DO PEDIDO ===

Regras:
- Comece com o **título da aula** e 2–3 linhas de objetivos de aprendizagem.
- Divida a aula em SEÇÕES na ordem em que serão trabalhadas, com título temático, ex.: \`## Levantamento de Requisitos\`. NÃO inclua tempos/minutos nos títulos nem no corpo.
- Em cada seção, ENTREGUE O CONTEÚDO de fato: explique o conceito de forma didática, com exemplos concretos do cotidiano e tabelas quando ajudarem. Escreva o material que o aluno vê/estuda — nada de "o professor deve...", nada de meta-instruções.
- Inclua ao menos uma ATIVIDADE PRÁTICA para os alunos resolverem e uma VERIFICAÇÃO de aprendizagem (exercícios ou perguntas com respostas), dimensionadas ao tempo.
- Dimensione a profundidade e a quantidade de exemplos/exercícios para realmente ocupar ${d.carga} de aula.
- ${abertura ? 'Esta é a abertura da unidade: comece apresentando o tema novo e situando o aluno no percurso do curso.' : (d.aulaanterior ? 'Comece retomando em poucas linhas o que foi visto na aula anterior, citando-a pelo título.' : 'Comece retomando em poucas linhas a base necessária para o tema.')}
- Termine ${d.aulaproxima ? 'conectando com a próxima aula, citando-a pelo título' : 'com uma síntese e uma ponte para o próximo tema'}.${vizinhas ? `
- CONTINUIDADE: trate o conteúdo da aula anterior como já conhecido — retome, não reensine — e não invada o conteúdo da próxima aula. A retomada e a ponte final devem se referir às aulas informadas acima, nunca a temas inventados.` : ''}${this.blocoAdaptacao(d)}`;
  },

  /* Rótulo curto do pedido, para o título do histórico e para a Agenda.
     A primeira linha costuma ser a frase que descreve a aula. */
  resumoPedido(texto) {
    const linha = (texto || '').split(/\r?\n/).map(l => l.trim()).find(Boolean) || '';
    const limpa = linha.replace(/^[-*#>\s]+/, '');
    return limpa.length > 70 ? limpa.slice(0, 70).trimEnd() + '…' : limpa;
  },

  /* Retomada de um material que a IA cortou no limite de tamanho. */
  continuar(tipo, textoParcial) {
    return `O material abaixo (${this.labels[tipo] || tipo}) foi cortado no meio porque a resposta atingiu o limite de tamanho.

Continue EXATAMENTE de onde parou:
- Não repita nada do que já está escrito e não reescreva o começo.
- Se a última linha estiver incompleta, complete-a — o texto será emendado direto no final.
- Não escreva nenhuma introdução, aviso ou comentário: só a continuação do material.
- Mantenha o mesmo formato, o mesmo nível de linguagem e a mesma numeração.

=== MATERIAL ATÉ AQUI ===
${textoParcial}
=== FIM ===`;
  },
};

/* Título curto para o histórico. */
Prompts.titulo = {
  aula: d => `Aula: ${d.tema || Prompts.resumoPedido(d.pedido) || 'sem tema'}`,
  atividade: d => `Atividade: ${d.tema || d.disciplina || ''}`.trim(),
  prova: d => `Prova: ${d.tema || d.disciplina || ''}`.trim(),
  slides: d => `Slides: ${d.tema || d.disciplina || ''}`.trim(),
};

Prompts.labels = {
  aula: '📚 Aula',
  atividade: '📝 Atividade',
  prova: '📄 Prova',
  slides: '📽️ Slides',

  /* Tipos das versões antigas do app: não é possível gerar nem encadear a
     partir deles, mas o histórico salvo no navegador continua abrindo. */
  plano: '📚 Aula',
  curso: '📋 Plano de Curso',
  situacao: '🧩 Situação de Aprendizagem',
  rubrica: '📊 Critérios de Avaliação',
  roteiro: '🎬 Roteiro de Aula',
  adaptar: '♿ Adaptação Inclusiva',
};

/* ===== Encadeamento: gerar um material a partir da aula pronta ===== */

/* Regras de formatação do material-alvo, sem depender de campos de formulário. */
const CHAIN_RULES = {
  atividade: `Crie uma atividade de fixação coerente com o material base.
- Comece com título, objetivo da atividade e tempo estimado.
- 8 a 10 questões numeradas, variando entre múltipla escolha (A–D), dissertativa e verdadeiro/falso. Nas de múltipla escolha, escreva CADA alternativa em sua própria linha (A), B), C)...), uma por linha.
- Ao final, inclua a seção **Gabarito comentado** com a resposta e uma breve justificativa de cada questão.`,

  prova: `Crie uma prova formal de múltipla escolha coerente com o material base.
- Comece com cabeçalho (linhas para nome, turma e data) e instruções breves.
- 10 questões, 5 alternativas (A–E), apenas uma correta, distratores plausíveis. Escreva CADA alternativa em sua própria linha (A), B), C), D), E)), uma por linha.
- Distribua a pontuação (total 10 pontos) e indique o valor de cada questão.
- Ao final, após uma linha "---", inclua o **Gabarito** em tabela (questão × resposta) com justificativa curta.`,

  /* O texto vai direto para o editor de slides (js/slides.js), que separa os
     slides pelo `---` e lê a PRIMEIRA LINHA do bloco como título. Qualquer
     desvio do formato vira slide errado — por isso as regras são literais. */
  slides: d => `Crie os SLIDES de uma apresentação de aula, em texto puro.

FORMATO DE SAÍDA — siga ao pé da letra, o texto vai direto para um gerador de slides:
- Separe CADA slide com uma linha contendo APENAS três hifens: \`---\`
- A PRIMEIRA LINHA de cada slide é o título dele, em texto puro. Sem \`#\`, sem \`##\`, sem numeração, sem asteriscos, sem dois-pontos no fim.
- O corpo do slide vem nas linhas seguintes.
- O PRIMEIRO slide é a capa: só o título da aula, nada no corpo.
- Listas: uma linha por item, começando com \`- \`. ${Prompts.slidesDensidade(d).lista}
- Destaque um termo com \`**negrito**\` — não use itálico, links, notas de rodapé nem emojis.
- Deixe uma LINHA EM BRANCO entre a lista e o parágrafo (ou entre dois parágrafos). É a linha em branco que separa os blocos do slide.
- Tabelas: markdown normal, uma linha por linha da tabela, ex.: \`| Camada | Função |\`, com a linha de traços \`| --- | --- |\` logo abaixo do cabeçalho. No máximo 5 linhas.
- Código: numa linha só com \`\`\` antes e outra igual depois.
- NÃO escreva notas do apresentador, NÃO escreva "Slide 1", "Note:" nem comentário nenhum fora dos slides.

CONTEÚDO:
- Converta a aula do material base em slides, preservando a sequência das seções: capa, objetivos, slides de conteúdo, um slide de atividade/pergunta e um de encerramento/resumo.
${Prompts.regraSlides(d)}

EXEMPLO do formato (siga a forma, não o conteúdo):

Modelo Entidade-Relacionamento
---
O que vamos aprender
- O que é uma entidade
- Como identificar atributos
- Para que serve a cardinalidade
---
O que é uma entidade
Entidade é qualquer coisa do mundo real sobre a qual guardamos dados.

Numa locadora, **Filme**, **Cliente** e **Locação** são entidades.
---
Tipos de cardinalidade
| Tipo | Exemplo |
| --- | --- |
| Um para um | Pessoa e CPF |
| Um para muitos | Cliente e locações |`,
};

/* Quais alvos cada material pode gerar. */
Prompts.chainTargets = {
  aula: ['atividade', 'prova', 'slides'],
  atividade: ['prova', 'slides'],
  prova: ['slides'],
  slides: ['atividade'],
};

/* `params` traz a adaptação inclusiva pedida na aula de origem — o material
   derivado sai adaptado igual, sem o professor pedir de novo. */
Prompts.chain = function (target, srcTipo, srcContent, params) {
  // Slides recebem opções do professor (quantidade/densidade): a regra é função.
  const regra = CHAIN_RULES[target];
  const regras = typeof regra === 'function' ? regra(params || {}) : regra;
  return `Você vai criar um NOVO material didático derivado de um material já existente.
Aproveite o tema, o nível, o público e o conteúdo do material base abaixo, mantendo total coerência com ele.

${regras}${Prompts.blocoAdaptacao(params || {}, { semResumo: target === 'slides' })}

=== MATERIAL BASE (${Prompts.labels[srcTipo]}) ===
${srcContent}
=== FIM DO MATERIAL BASE ===`;
};
