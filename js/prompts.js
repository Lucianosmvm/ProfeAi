/* Fluxos guiados: cada função transforma os campos do formulário em prompt.
   O professor nunca vê nem escreve isso. */
const Prompts = {
  /* Regras de linguagem por nível da turma (definido em Configurações → Perfil da turma).
     É o que separa material didático de material técnico: o modelo, sozinho, copia o
     registro do texto que recebe — e o que ele recebe é jargão de PDT. */
  NIVEIS: {
    iniciante: {
      label: 'Iniciante — nunca viu o assunto',
      regras: `Os alunos NUNCA tiveram contato com este assunto. Escreva para quem começa do zero:
- Apresente a IDEIA antes do NOME: explique o conceito com uma situação concreta do dia a dia e só depois diga como ele se chama.
- Todo termo técnico e toda sigla ganham explicação em linguagem simples na primeira vez que aparecem; sigla sempre expandida por extenso.
- Se um tópico depende de um pré-requisito, ensine o pré-requisito em duas ou três linhas em vez de supor que o aluno já sabe.
- Frases curtas e diretas. Prefira a palavra comum à palavra sofisticada.
- Um conceito novo por vez, cada um seguido de um exemplo concreto.
- Nenhuma definição sozinha: definição sempre acompanhada de exemplo ou analogia.`,
    },
    intermediario: {
      label: 'Já teve contato com o assunto',
      regras: `Os alunos já tiveram contato com o assunto, mas não o dominam:
- Pode usar o vocabulário técnico da área, explicando em poucas palavras os termos menos comuns.
- Retome rapidamente a base necessária antes de avançar.
- Priorize exemplos aplicados e a relação entre os conceitos.`,
    },
    avancado: {
      label: 'Avançado — domina a base',
      regras: `Os alunos dominam a base da área:
- Use o vocabulário técnico livremente, sem parar para explicar o básico.
- Avance para nuances, casos limite, boas práticas e aplicações profissionais.`,
    },
  },

  /* Perfil da turma salvo em Configurações; usado para montar o system prompt. */
  perfil() {
    const p = (typeof Storage !== 'undefined' && Storage.getPerfil)
      ? Storage.getPerfil()
      : { ...this.PERFIL_PADRAO };
    return this.NIVEIS[p.nivel] ? p : { ...p, nivel: 'iniciante' };
  },

  PERFIL_PADRAO: { nivel: 'iniciante', publico: '', obs: '' },

  /* System prompt: base didática fixa + regras do nível da turma.
     Montado a cada geração para refletir mudanças no perfil sem recarregar a página. */
  buildSystem() {
    const p = this.perfil();
    return `Você é um assistente pedagógico que escreve materiais didáticos para professores brasileiros.
Responda sempre em português do Brasil, em Markdown bem formatado, pronto para impressão.

## Para quem você escreve
${this.NIVEIS[p.nivel].regras}${p.publico ? `
Perfil dos alunos: ${p.publico}` : ''}${p.obs ? `
Observações do professor sobre a turma: ${p.obs}` : ''}

## Como você escreve
- O material é para o ALUNO ler e entender sozinho. Nada de meta-instruções do tipo "o professor deve...".
- Priorize COMPREENSÃO sobre completude: é melhor o aluno entender bem cinco pontos do que ler dez sem entender.
- Use exemplos concretos e brasileiros, do cotidiano ou do mundo do trabalho do curso.
- Sem enrolação, sem frases de efeito, sem repetir o que já foi dito.
- Quando o pedido especificar um formato curto (listas, tópicos, tabelas, slides), estas regras valem para a ESCOLHA DAS PALAVRAS, não para alongar o texto: mantenha o formato pedido.
- Se o pedido informar um público ou nível próprio, ele prevalece sobre o perfil padrão acima.
- Entregue o material pronto para uso em sala, sem necessidade de edição.`;
  },

  plano(d) {
    const abertura = d.tipoaula === 'Abertura de unidade';
    // Aulas vizinhas (vêm preenchidas da Agenda ou da geração em lote): sem elas o
    // modelo INVENTA o que foi visto antes, e cada aula sai desconectada da anterior.
    const vizinhas = [
      d.aulaanterior ? `- Aula anterior (já dada): ${d.aulaanterior}` : '',
      d.aulaproxima ? `- Próxima aula (ainda não dada): ${d.aulaproxima}` : '',
    ].filter(Boolean).join('\n');
    return `Gere a AULA COMPLETA, pronta para ser ministrada: o CONTEÚDO em si que será ensinado. NÃO é um plano de aula, NÃO é um roteiro de instruções ao professor. É o material da aula — explicações, definições, exemplos, tabelas e atividades — desenvolvido para preencher todo o tempo da aula.

- Curso / Disciplina: ${d.disciplina}
- Duração total da aula: ${d.carga}
${d.tipoaula ? `- Tipo de aula: ${d.tipoaula}` : ''}
${vizinhas}

Baseie-se no bloco abaixo: derive o TÍTULO da aula dele e desenvolva EXATAMENTE os tópicos listados, com profundidade suficiente para o aluno entender — compreensão vem antes de completude. O bloco indica o módulo e a posição da aula (ex.: "Aulas 1 a 5", "AULA 1") — comece ${abertura ? 'apresentando o tema novo' : (d.aulaanterior ? 'retomando em poucas linhas o que foi visto na aula anterior, citando-a pelo título' : 'retomando em poucas linhas o que foi visto na aula anterior')} e termine ${d.aulaproxima ? 'conectando com a próxima aula, citando-a pelo título' : 'conectando com a próxima aula'}. Não acrescente tópicos fora do escopo nem deixe algum de fora.
=== AULA (PLANO DE CURSO) ===
${d.basecurso}
=== FIM ===

Regras:
- Comece com o **título da aula** e 2–3 linhas de objetivos de aprendizagem.
- Divida a aula em SEÇÕES na ordem em que serão trabalhadas, com título temático, ex.: \`## Levantamento de Requisitos\`. NÃO inclua tempos/minutos nos títulos nem no corpo.
- Em cada seção, ENTREGUE O CONTEÚDO de fato: explique o conceito de forma didática, com exemplos concretos do cotidiano e tabelas quando ajudarem. Escreva o material que o aluno vê/estuda — nada de "o professor deve...", nada de meta-instruções.
- Inclua ao menos uma ATIVIDADE PRÁTICA para os alunos resolverem e uma VERIFICAÇÃO de aprendizagem (exercícios ou perguntas com respostas), dimensionadas ao tempo.
- Dimensione a profundidade e a quantidade de exemplos/exercícios para realmente ocupar ${d.carga} de aula.${vizinhas ? `
- CONTINUIDADE: trate o conteúdo da aula anterior como já conhecido — retome, não reensine — e não invada o conteúdo da próxima aula. A retomada e a ponte final devem se referir às aulas informadas acima, nunca a temas inventados.` : ''}`;
  },

  /* Dados do PDT — comuns ao primeiro lote e às continuações. */
  cursoDados(d) {
    return `DADOS DA UNIDADE CURRICULAR:
- Unidade Curricular: ${d.unidade}
- Carga horária total: ${d.carga}
- Duração de cada aula: ${d.duracao}
- Número EXATO de aulas do curso inteiro: ${d.aulas}
${d.indicadores ? `\nINDICADORES DE COMPETÊNCIA:\n${d.indicadores}` : ''}
${d.conhecimentos ? `\nCONHECIMENTOS:\n${d.conhecimentos}` : ''}
${d.habilidades ? `\nHABILIDADES:\n${d.habilidades}` : ''}
${d.atitudes ? `\nATITUDES / VALORES:\n${d.atitudes}` : ''}`;
  },

  /* Plano de Curso — primeiro (ou único) lote de aulas.
     Cursos longos são gerados em lotes: um plano de 32 aulas não cabe numa
     resposta só e vinha cortado no meio, sem aviso. */
  curso(d) {
    const total = Number(d.aulas);
    const ate = Number(d.ate) || total;
    const emLote = ate < total;

    return `Você vai transformar o descritivo de uma Unidade Curricular (extraído de um PDT / plano de curso técnico) em um PLANO DE CURSO detalhado, dividido em módulos e aulas.

${this.cursoDados(d)}

REGRAS:
1. ${emLote
  ? `O curso inteiro terá ${total} aulas, mas AGORA você vai gerar somente as AULAS 1 a ${ate}. Pare exatamente na AULA ${ate} — o resto vem depois.`
  : `Gere EXATAMENTE ${total} aulas — nem mais, nem menos. Numere de AULA 1 até AULA ${total}.`} No cabeçalho informe, ex.: "Carga Horária: ${d.carga} (${total} aulas de ${d.duracao})".
2. Planeje a distribuição de TODO o conteúdo dos conhecimentos/habilidades pensando nas ${total} aulas do curso inteiro, do mais simples ao mais complexo (progressão pedagógica). Nenhum tópico do PDT pode ficar de fora do curso.
3. Agrupe as aulas em MÓDULOS temáticos coerentes. Cada módulo cobre uma faixa de aulas.
4. Reserve aulas para exercícios integradores e um projeto integrador final${emLote ? ' — isso fica para o fim do curso, não neste primeiro trecho' : ''}.

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

[continue todas as aulas do módulo, depois o próximo módulo, até a AULA ${ate}]

Cada aula deve ter de 3 a 4 tópicos curtos (bullets), sem parágrafos longos. Não escreva nada fora dessa estrutura.`;
  },

  /* Continuação do Plano de Curso: gera só as aulas do lote seguinte. */
  cursoContinua(d, jaGerado, de, ate) {
    const total = Number(d.aulas);
    const ultimo = ate >= total;

    return `Continue o PLANO DE CURSO que já foi começado (o texto vem no final). Gere APENAS as AULAS ${de} a ${ate}.

${this.cursoDados(d)}

REGRAS:
- NÃO repita o cabeçalho, os indicadores nem nenhuma aula que já existe no texto abaixo.
- Comece direto na \`### AULA ${de} — [Título]\`. Se ela abrir um módulo novo, escreva antes a linha \`## MÓDULO N — [Nome] (Aulas X a Y)\`; se ela continua o módulo atual, não repita o cabeçalho do módulo.
- Siga a progressão do que já foi dado: não volte a temas já cobertos e não adiante o que ainda não tem base.
- Pare exatamente na AULA ${ate}.${ultimo ? `\n- Estas são as ÚLTIMAS aulas do curso: inclua aqui os exercícios integradores e o projeto integrador final, e feche a cobertura de todos os conhecimentos do PDT que ainda não apareceram.` : ''}
- Mesmo formato: 3 a 4 tópicos curtos (bullets) por aula. Não escreva nada fora dessa estrutura.

=== PLANO DE CURSO ATÉ AQUI (aulas 1 a ${de - 1}) ===
${jaGerado}
=== FIM ===`;
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

/* Extrai cada bloco de aula (módulo + "AULA N — Título" + tópicos) de um
   Plano de Curso já gerado, para alimentar a geração em lote da Aula Completa.
   Aceita tanto "### AULA 1 — Título" (saída padrão) quanto "AULA 1 — Título"
   sem cabeçalho Markdown (ex.: texto colado/editado pelo professor). */
Prompts.parseAulas = function (md) {
  const moduloRe = /^#{0,3}\s*M[ÓO]DULO\b/i;
  const aulaRe = /^#{0,3}\s*AULA\s+(\d+)\s*[—\-–:]\s*(.+?)\s*$/i;

  const aulas = [];
  let moduloAtual = '';
  let atual = null;

  (md || '').split(/\r?\n/).forEach(linhaBruta => {
    const linha = linhaBruta.trim();
    if (!linha) return;

    if (moduloRe.test(linha)) {
      moduloAtual = linha.replace(/^#+\s*/, '').trim();
      return;
    }
    const m = linha.match(aulaRe);
    if (m) {
      if (atual) aulas.push(atual);
      atual = { numero: m[1], titulo: m[2].trim(), modulo: moduloAtual, bullets: [] };
      return;
    }
    if (atual) atual.bullets.push(linha);
  });
  if (atual) aulas.push(atual);

  // Monta o texto de cada bloco no mesmo formato que o professor colaria manualmente.
  aulas.forEach(a => {
    a.blockText = [a.modulo, '', `AULA ${a.numero} — ${a.titulo}`, ...a.bullets]
      .filter(Boolean).join('\n');
  });
  return aulas;
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
  curso: [], // "Plano de Curso" não encadeia por aqui: usa o botão especial "Gerar todas as aulas" (app.js)
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
