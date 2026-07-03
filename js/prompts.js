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
- Divida a aula em SEÇÕES na ordem em que serão trabalhadas, com título temático, ex.: \`## Levantamento de Requisitos\`. NÃO inclua tempos/minutos nos títulos nem no corpo.
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

  situacao(d) {
    return `Crie uma SITUAÇÃO DE APRENDIZAGEM (SA) no modelo pedagógico do Senac: um desafio contextualizado no mundo do trabalho que mobiliza competências, com percurso, entregas e avaliação formativa.

- Unidade Curricular / Disciplina: ${d.disciplina}
- Tema / conteúdo: ${d.tema}
${d.contexto ? `- Contexto do mundo do trabalho: ${d.contexto}` : ''}
${d.aulas ? `- Duração prevista: ${d.aulas}` : ''}
${d.publico ? `- Público: ${d.publico}` : ''}
${d.competencias ? `- Competências / indicadores (do PDT):\n${d.competencias}` : ''}

Estruture a SA EXATAMENTE nesta ordem, em Markdown:

## [Título da Situação de Aprendizagem]

### 1. Contextualização
Apresente um cenário realista do mundo do trabalho ${d.contexto ? `envolvendo ${d.contexto}` : 'ligado ao tema'}, com uma narrativa curta que dê sentido ao desafio (empresa/cliente/problema real).

### 2. Desafio
Enuncie de forma clara o problema ou produto que os alunos devem resolver/entregar. Coloque o aluno no papel profissional.

### 3. Competências e indicadores mobilizados
${d.competencias ? 'Use os indicadores informados acima.' : 'Liste as competências e de 3 a 5 indicadores mobilizados pela SA.'}

### 4. Percurso de aprendizagem (etapas)
Descreva as etapas que o aluno percorre até a entrega — o que faz em cada uma (investigar, planejar, executar, testar, apresentar). Sem tempos/minutos.

### 5. Entregas esperadas
Liste os produtos/evidências concretas que o aluno entrega (ex.: protótipo, relatório, apresentação, código).

### 6. Recursos e materiais
Ferramentas, referências e insumos necessários.

### 7. Papel do docente (mediação)
Como o docente acompanha, provoca e dá devolutivas ao longo do percurso — sem entregar a resposta pronta.

### 8. Avaliação formativa
Indique como avaliar por competências (níveis Atendeu plenamente / parcialmente / Não atendeu, ligados aos indicadores). Não use nota numérica.

### 9. Marcas Formativas Senac
Aponte quais marcas formativas a SA desenvolve (ex.: domínio técnico-científico, relação com o mundo do trabalho, atitude empreendedora, colaboração) e como.

Seja concreto e realista; a SA deve estar pronta para aplicar em sala.`;
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
- Questões de múltipla escolha: 4 alternativas (A–D), apenas uma correta. Escreva CADA alternativa em sua própria linha, iniciada por "A) ", "B) ", "C) ", "D) " (uma alternativa por linha, nunca na mesma linha).
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
- Apenas uma alternativa correta por questão; distratores plausíveis. Escreva CADA alternativa em sua própria linha (A), B), C)...), uma por linha, nunca na mesma linha.
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
    return `Crie um INSTRUMENTO DE AVALIAÇÃO POR COMPETÊNCIAS no modelo formativo do Senac (avaliação por indicadores, não por nota numérica).

- Tipo de trabalho / instrumento: ${d.tipoTrabalho}
- Unidade Curricular / Disciplina: ${d.disciplina}
- Descrição do trabalho / desafio: ${d.descricao}
${d.indicadores ? `- Indicadores de competência (do PDT):\n${d.indicadores}` : ''}

Regras (SIGA EXATAMENTE o modelo Senac):
- Comece com um título e 1–2 linhas dizendo qual competência/desafio será avaliado.
- ${d.indicadores
  ? 'Use EXATAMENTE os indicadores de competência informados acima, um por linha da tabela.'
  : 'Derive de 4 a 6 indicadores de competência a partir da descrição do trabalho, um por linha da tabela.'}
- NÃO use nota numérica, pontos nem pesos. A avaliação é qualitativa por níveis.
- Monte a TABELA principal com uma linha por indicador e as colunas: **Indicador de competência** | **Atendeu plenamente** | **Atendeu parcialmente** | **Não atendeu**. Em cada célula, descreva de forma observável o que o aluno demonstra naquele nível (comportamento/evidência concreta), não frases genéricas.
- Após a tabela, inclua a seção **Síntese avaliativa** explicando a regra de decisão (ex.: para ser considerado competente, o aluno precisa "Atender plenamente" ou "parcialmente" os indicadores essenciais) — sem transformar em nota.
- Inclua a seção **Parecer descritivo (modelo)** com um exemplo curto de devolutiva formativa ao aluno: o que já domina, o que precisa desenvolver e como avançar.
- Finalize com **Orientações de aplicação** curtas para o docente.`;
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
  situacao: d => `Situação de Aprendizagem: ${d.tema} (${d.disciplina})`,
  atividade: d => `Atividade: ${d.tema} (${d.disciplina})`,
  prova: d => `Prova: ${d.disciplina}`,
  slides: d => `Slides: ${d.tema} (${d.disciplina})`,
  adaptar: d => `Adaptação: ${d.necessidade}`,
  rubrica: d => `Critérios de Avaliação: ${d.tipoTrabalho} de ${d.disciplina}`,
};

Prompts.labels = {
  curso: '📋 Plano de Curso',
  plano: '📚 Aula Completa',
  situacao: '🧩 Situação de Aprendizagem',
  atividade: '📝 Atividade',
  prova: '📄 Prova',
  slides: '📽️ Slides',
  adaptar: '♿ Adaptação Inclusiva',
  rubrica: '📊 Critérios de Avaliação',
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
- 8 a 10 questões numeradas, variando entre múltipla escolha (A–D), dissertativa e verdadeiro/falso. Nas de múltipla escolha, escreva CADA alternativa em sua própria linha (A), B), C)...), uma por linha.
- Ao final, inclua a seção **Gabarito comentado** com a resposta e uma breve justificativa de cada questão.`,

  situacao: `Crie uma SITUAÇÃO DE APRENDIZAGEM (modelo Senac) coerente com o material base: um desafio contextualizado no mundo do trabalho que mobiliza as competências do material.
- Estruture em: Título; 1. Contextualização (cenário do mundo do trabalho); 2. Desafio; 3. Competências e indicadores mobilizados; 4. Percurso de aprendizagem (etapas, sem tempos); 5. Entregas esperadas; 6. Recursos e materiais; 7. Papel do docente (mediação); 8. Avaliação formativa (níveis Atendeu plenamente/parcialmente/Não atendeu, sem nota); 9. Marcas Formativas Senac.
- Seja concreto e pronto para aplicar.`,

  prova: `Crie uma prova formal de múltipla escolha coerente com o material base.
- Comece com cabeçalho (linhas para nome, turma e data) e instruções breves.
- 10 questões, 5 alternativas (A–E), apenas uma correta, distratores plausíveis. Escreva CADA alternativa em sua própria linha (A), B), C), D), E)), uma por linha.
- Distribua a pontuação (total 10 pontos) e indique o valor de cada questão.
- Ao final, após uma linha "---", inclua o **Gabarito** em tabela (questão × resposta) com justificativa curta.`,
};

/* Quais alvos cada tipo de material pode gerar. */
Prompts.chainTargets = {
  curso: [],
  plano: ['situacao', 'slides', 'atividade', 'prova', 'adaptar'],
  situacao: ['slides', 'atividade', 'prova', 'adaptar'],
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
