/* Fluxos guiados: cada função transforma os campos do formulário em prompt.
   O professor nunca vê nem escreve isso. */
const Prompts = {
  system: `Você é um assistente pedagógico especializado em criar materiais didáticos
para professores brasileiros. Responda sempre em português do Brasil, em Markdown
bem formatado, pronto para impressão. Seja objetivo e completo — o material deve
estar pronto para uso em sala de aula, sem necessidade de edição.`,

  plano(d) {
    const abertura = d.tipoaula === 'Abertura de unidade';
    return `Gere a AULA COMPLETA, pronta para ser ministrada: o CONTEÚDO em si que será ensinado. NÃO é um plano de aula, NÃO é um roteiro de instruções ao professor. É o material da aula — explicações, definições, exemplos, tabelas e atividades — desenvolvido para preencher todo o tempo da aula.

- Curso / Disciplina: ${d.disciplina}
- Duração total da aula: ${d.carga}
${d.tipoaula ? `- Tipo de aula: ${d.tipoaula}` : ''}

Baseie-se no bloco abaixo: derive o TÍTULO da aula dele e desenvolva EXATAMENTE os tópicos listados, em profundidade. O bloco indica o módulo e a posição da aula (ex.: "Aulas 1 a 5", "AULA 1") — comece ${abertura ? 'apresentando o tema novo' : 'retomando em poucas linhas o que foi visto na aula anterior'} e termine conectando com a próxima aula. Não acrescente tópicos fora do escopo nem deixe algum de fora.
=== AULA (PLANO DE CURSO) ===
${d.basecurso}
=== FIM ===

Regras:
- Comece com o **título da aula** e 2–3 linhas de objetivos de aprendizagem.
- Divida a aula em SEÇÕES na ordem em que serão trabalhadas, cada uma com o TEMPO no título, ex.: \`## Levantamento de Requisitos (35 min)\`. A soma dos tempos deve fechar exatamente ${d.carga}.
- Em cada seção, ENTREGUE O CONTEÚDO de fato: explique o conceito de forma didática, com exemplos concretos do cotidiano e tabelas quando ajudarem. Escreva o material que o aluno vê/estuda — nada de "o professor deve...", nada de meta-instruções.
- Inclua ao menos uma ATIVIDADE PRÁTICA para os alunos resolverem e uma VERIFICAÇÃO de aprendizagem (exercícios ou perguntas com respostas), dimensionadas ao tempo.
- Dimensione a profundidade e a quantidade de exemplos/exercícios para realmente ocupar ${d.carga} de aula.`;
  },

  curso(d) {
    return `Você vai transformar o descritivo de uma Unidade Curricular (extraído de um PDT / plano de curso técnico) em um PLANO DE CURSO detalhado, dividido em módulos e aulas.

DADOS DA UNIDADE CURRICULAR:
- Unidade Curricular: ${d.unidade}
- Carga horária total: ${d.carga}
- Duração de cada aula: ${d.duracao}
- Número EXATO de aulas: ${d.aulas}
${d.indicadores ? `\nINDICADORES DE COMPETÊNCIA:\n${d.indicadores}` : ''}
${d.conhecimentos ? `\nCONHECIMENTOS:\n${d.conhecimentos}` : ''}
${d.habilidades ? `\nHABILIDADES:\n${d.habilidades}` : ''}
${d.atitudes ? `\nATITUDES / VALORES:\n${d.atitudes}` : ''}

REGRAS:
1. Gere EXATAMENTE ${d.aulas} aulas — nem mais, nem menos. Numere de AULA 1 até AULA ${d.aulas}. No cabeçalho informe, ex.: "Carga Horária: ${d.carga} (${d.aulas} aulas de ${d.duracao})".
2. Distribua TODO o conteúdo dos conhecimentos/habilidades ao longo das ${d.aulas} aulas, do mais simples ao mais complexo (progressão pedagógica). Nenhum tópico do PDT pode ficar de fora.
3. Agrupe as aulas em MÓDULOS temáticos coerentes. Cada módulo cobre uma faixa de aulas.
4. Reserve aulas para exercícios integradores e um projeto integrador final.

FORMATO DE SAÍDA (siga EXATAMENTE esta estrutura em Markdown):

# ${d.unidade}
**Carga Horária:** [total] ([N] aulas de [duração])

## INDICADORES DE COMPETÊNCIA
[Liste os indicadores, um por linha, de forma resumida e clara]

## MÓDULO 1 — [Nome do módulo] (Aulas X a Y)

### AULA 1 — [Título da aula]
- [tópico]
- [tópico]
- [tópico]

### AULA 2 — [Título da aula]
- [tópico]
- [tópico]

[continue todas as aulas do módulo, depois o próximo módulo, até completar exatamente ${d.aulas} aulas]

Cada aula deve ter de 3 a 4 tópicos curtos (bullets), sem parágrafos longos. Não escreva nada fora dessa estrutura.`;
  },

  sequencia(d) {
    return `Crie uma sequência didática completa (conjunto de aulas encadeadas) com os dados abaixo.

- Curso/Série: ${d.curso}
- Disciplina: ${d.disciplina}
- Tema/Unidade: ${d.tema}
- Número de aulas: ${d.aulas}
- Carga horária por aula: ${d.carga}
${d.publico ? `- Público: ${d.publico}` : ''}
${d.objetivo ? `- Objetivo geral: ${d.objetivo}` : ''}
${d.competencias ? `- Competências/habilidades: ${d.competencias}` : ''}

Estruture assim:
1. **Apresentação da sequência** (tema, justificativa e a que se propõe)
2. **Objetivos gerais de aprendizagem**
3. **Competências e habilidades** desenvolvidas ao longo da sequência
4. **Conhecimentos prévios** esperados dos alunos
5. **Quadro-resumo** — tabela com uma linha por aula: Aula (nº), Título, Foco/Conteúdo, Carga horária
6. **Detalhamento das aulas** — gere exatamente ${d.aulas} aulas, uma seção por aula (\`### Aula N — Título\`), cada uma com:
   - Objetivos específicos da aula
   - Conteúdo
   - Metodologia / estratégias
   - Recursos necessários
   - Avaliação/evidência de aprendizagem da aula
   - Ligação com a próxima aula (progressão)
7. **Avaliação da sequência** (como avaliar a aprendizagem no conjunto)
8. **Referências / materiais de apoio**

As aulas devem ter progressão pedagógica: do mais simples ao mais complexo, uma preparando a seguinte.`;
  },

  atividade(d) {
    return `Crie uma atividade com ${d.quantidade} questões.

- Disciplina: ${d.disciplina}
- Tema: ${d.tema}
- Nível: ${d.nivel}
- Tipo de questões: ${d.tipo}
${d.publico ? `- Público: ${d.publico}` : ''}

Regras:
- Comece com título, objetivo da atividade e tempo estimado.
- Numere as questões.
- Questões de múltipla escolha: 4 alternativas (A–D), apenas uma correta.
- Tipo "Misto": varie entre múltipla escolha, dissertativa e verdadeiro/falso.
- Tipo "Projeto prático": descreva o enunciado do projeto, requisitos numerados e critérios de entrega.
${d.gabarito ? '- Ao final, inclua a seção **Gabarito comentado** com a resposta de cada questão e uma breve justificativa.' : '- NÃO inclua gabarito.'}`;
  },

  prova(d) {
    return `Crie uma prova formal de múltipla escolha.

- Disciplina: ${d.disciplina}
- Temas cobrados: ${d.tema}
- Quantidade de questões: ${d.quantidade}
- Alternativas por questão: ${d.alternativas}
- Nível: ${d.nivel}
- Valor total: ${d.valor}

Regras:
- Comece com um cabeçalho de prova (linhas para nome do aluno, turma e data).
- Inclua instruções breves para o aluno.
- Distribua a pontuação entre as questões e indique o valor de cada uma.
- Apenas uma alternativa correta por questão; distratores plausíveis.
- Ao final, em seção separada iniciada por "---", inclua o **Gabarito** em tabela (questão × resposta) com justificativa curta de cada resposta. Essa seção será destacada e entregue separadamente.`;
  },

  slides(d) {
    return `Crie os slides de uma apresentação de aula em Markdown.

- Disciplina: ${d.disciplina}
- Tema: ${d.tema}
- Número de slides: ${d.quantidade}
${d.publico ? `- Público: ${d.publico}` : ''}
${d.objetivo ? `- Objetivo da aula: ${d.objetivo}` : ''}
${d.basematerial ? `\nBaseie os slides no material abaixo, mantendo total coerência com ele (mesmo tema, nível e conteúdo). Transforme o conteúdo em ${d.quantidade} slides:\n=== MATERIAL BASE ===\n${d.basematerial}\n=== FIM DO MATERIAL BASE ===` : ''}

Regras de formatação (SIGA EXATAMENTE — o resultado alimenta um apresentador de slides):
- Separe CADA slide com uma linha contendo apenas três hifens: \`---\`
- Um único título por slide, iniciado com \`## \`.
${d.aulacompleta ? `${d.basematerial
  ? '- Converta a AULA do material base em slides, PRESERVANDO a mesma sequência de etapas e os tempos. Cada etapa vira um ou mais slides, com o tempo no título, ex.: `## Desenvolvimento (30 min)`.'
  : '- Monte a aula em ETAPAS sequenciais com o tempo no título, ex.: `## Desenvolvimento (30 min)`, somando a duração da aula. Comece pela capa e objetivos; depois retomada/contextualização do tema (use quebra-gelo lúdico só se for abertura de um tema novo); desenvolvimento com exemplos; prática; síntese; verificação da aprendizagem; e fechamento com ponte para a próxima aula. Quiz e tarefa só se fizerem sentido.'}
- No corpo do slide use bullets curtos com conceitos-chave, exemplos concretos e, quando ajudar, TABELAS em Markdown. Use mais de um slide por etapa se precisar.
- Gere quantos slides forem necessários para cobrir toda a estrutura (aproximadamente ${d.quantidade} ou mais).` : `- No máximo 5 tópicos (bullets) por slide, curtos e objetivos. Nada de parágrafos longos.
- Estrutura sugerida: slide de abertura (título da aula + tema), slide de objetivos, slides de conteúdo, slide de atividade/pergunta e slide de encerramento/resumo.
- Gere aproximadamente ${d.quantidade} slides.`}
- NÃO inclua notas do apresentador (nada de linhas \`Note:\`).
- Não escreva nada fora dos slides (sem introdução nem conclusão fora do formato).`;
  },

  adaptar(d) {
    return `Adapte o material didático abaixo para atender estudantes com: ${d.necessidade}.
${d.observacoes ? `Contexto adicional da turma/aluno: ${d.observacoes}` : ''}

Regras:
- Mantenha os objetivos de aprendizagem e o conteúdo essencial — adapte a FORMA, não rebaixe o conteúdo.
- Aplique estratégias específicas para essa necessidade, considerando: linguagem e vocabulário, estrutura e layout, segmentação das tarefas em passos, apoios visuais, clareza das instruções, tempo e forma de avaliação.
- Entregue o material adaptado pronto para uso.
- Ao final, inclua a seção **O que foi adaptado e por quê** — lista curta ligando cada mudança à necessidade.

=== MATERIAL ORIGINAL ===
${d.material}
=== FIM DO MATERIAL ORIGINAL ===`;
  },

  rubrica(d) {
    return `Crie uma rubrica de avaliação.

- Tipo de trabalho: ${d.tipoTrabalho}
- Disciplina: ${d.disciplina}
- Descrição do trabalho: ${d.descricao}
- Valor total: ${d.valor}

Regras:
- Comece com título e uma frase explicando o que será avaliado.
- Tabela principal: critério, descrição do critério e peso (os pesos devem somar o valor total).
- Para cada critério, descreva 3 níveis de desempenho: **Excelente**, **Adequado** e **Insuficiente**, com a pontuação correspondente.
- Finalize com orientações rápidas de aplicação para o professor.`;
  },
};

/* Título curto para o histórico. */
Prompts.titulo = {
  curso: d => `Plano de Curso: ${d.unidade}`,
  plano: d => {
    // Deriva o título da aula: primeira linha "AULA ..." do bloco, senão a disciplina.
    const linha = (d.basecurso || '').split('\n').map(s => s.trim()).find(s => /^AULA/i.test(s));
    return `Plano: ${linha || d.tema || d.disciplina}`;
  },
  sequencia: d => `Sequência: ${d.tema} (${d.disciplina})`,
  atividade: d => `Atividade: ${d.tema} (${d.disciplina})`,
  prova: d => `Prova: ${d.disciplina}`,
  slides: d => `Slides: ${d.tema} (${d.disciplina})`,
  adaptar: d => `Adaptação: ${d.necessidade}`,
  rubrica: d => `Rubrica: ${d.tipoTrabalho} de ${d.disciplina}`,
};

Prompts.labels = {
  curso: '📋 Plano de Curso',
  plano: '📚 Aula Completa',
  sequencia: '🗺️ Sequência Didática',
  atividade: '📝 Atividade',
  prova: '📄 Prova',
  slides: '📽️ Slides',
  adaptar: '♿ Adaptação Inclusiva',
  rubrica: '📊 Rubrica',
};

/* ===== Encadeamento: gerar um material a partir de outro já pronto ===== */

/* Regras de formatação do material-alvo, sem depender de campos de formulário. */
const CHAIN_RULES = {
  slides: `Crie os slides de uma apresentação de aula em Markdown.
- Separe CADA slide com uma linha contendo apenas três hifens: \`---\`
- Um único título por slide, iniciado com \`## \`. No máximo 5 tópicos curtos por slide.
- Gere de 10 a 12 slides: abertura, objetivos, slides de conteúdo, um slide de atividade/pergunta e encerramento/resumo.
- Após os tópicos de cada slide, adicione uma linha começando com \`Note:\` com a fala do professor.
- Não escreva nada fora do formato de slides.`,

  atividade: `Crie uma atividade de fixação coerente com o material base.
- Comece com título, objetivo da atividade e tempo estimado.
- 8 a 10 questões numeradas, variando entre múltipla escolha (A–D), dissertativa e verdadeiro/falso.
- Ao final, inclua a seção **Gabarito comentado** com a resposta e uma breve justificativa de cada questão.`,

  prova: `Crie uma prova formal de múltipla escolha coerente com o material base.
- Comece com cabeçalho (linhas para nome, turma e data) e instruções breves.
- 10 questões, 5 alternativas (A–E), apenas uma correta, distratores plausíveis.
- Distribua a pontuação (total 10 pontos) e indique o valor de cada questão.
- Ao final, após uma linha "---", inclua o **Gabarito** em tabela (questão × resposta) com justificativa curta.`,
};

/* Quais alvos cada tipo de material pode gerar. */
Prompts.chainTargets = {
  curso: [],
  plano: ['slides', 'atividade', 'prova', 'adaptar'],
  sequencia: ['slides', 'atividade', 'prova', 'adaptar'],
  atividade: ['prova', 'slides', 'adaptar'],
  prova: ['slides', 'adaptar'],
  slides: ['atividade', 'adaptar'],
  adaptar: [],
  rubrica: ['adaptar'],
};

Prompts.chain = function (target, srcTipo, srcContent) {
  return `Você vai criar um NOVO material didático derivado de um material já existente.
Aproveite o tema, o nível, o público e o conteúdo do material base abaixo, mantendo total coerência com ele.

${CHAIN_RULES[target]}

=== MATERIAL BASE (${Prompts.labels[srcTipo]}) ===
${srcContent}
=== FIM DO MATERIAL BASE ===`;
};
