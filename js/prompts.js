/* Fluxos guiados: cada função transforma os campos do formulário em prompt.
   O professor nunca vê nem escreve isso. */
const Prompts = {
  system: `Você é um assistente pedagógico especializado em criar materiais didáticos
para professores brasileiros. Responda sempre em português do Brasil, em Markdown
bem formatado, pronto para impressão. Seja objetivo e completo — o material deve
estar pronto para uso em sala de aula, sem necessidade de edição.`,

  plano(d) {
    return `Crie um plano de aula completo com os dados abaixo.

- Curso/Série: ${d.curso}
- Unidade Curricular/Disciplina: ${d.disciplina}
- Carga horária: ${d.carga}
- Tema da aula: ${d.tema}
${d.objetivo ? `- Objetivo geral: ${d.objetivo}` : ''}
${d.competencias ? `- Competências: ${d.competencias}` : ''}

Estruture o plano com estas seções:
1. **Identificação** (curso, disciplina, tema, carga horária)
2. **Objetivos de aprendizagem** (geral e específicos)
3. **Conteúdo programático**
4. **Metodologia** (estratégias didáticas)
5. **Cronograma da aula** — tabela com atividade, descrição e tempo de cada etapa, somando exatamente a carga horária
6. **Recursos necessários**
7. **Avaliação** (como verificar a aprendizagem)
8. **Tarefa de casa** (opcional, se fizer sentido)
9. **Observações para o professor** (dicas práticas, pontos de atenção)`;
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
  plano: d => `Plano: ${d.tema} (${d.disciplina})`,
  atividade: d => `Atividade: ${d.tema} (${d.disciplina})`,
  prova: d => `Prova: ${d.disciplina}`,
  rubrica: d => `Rubrica: ${d.tipoTrabalho} de ${d.disciplina}`,
};

Prompts.labels = {
  plano: '📚 Plano de Aula',
  atividade: '📝 Atividade',
  prova: '📄 Prova',
  rubrica: '📊 Rubrica',
};
