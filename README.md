# Professor+ AI

Plataforma web para professores gerarem a **aula** com IA — e, a partir dela, a **atividade**, a **prova** e os **slides**. Preenche um formulário, recebe o material pronto; sem escrever prompt.

100% estática (HTML + CSS + JavaScript puro), sem backend. Funciona direto no GitHub Pages.

## O fluxo

1. **⚙️ Configurações** — cole a chave da API (uma vez só).
2. **📚 Gerar Aula** — três campos: a UC (opcional), a duração da aula e um texto livre descrevendo a aula que você quer. Se precisar, marque também a **adaptação inclusiva**.
3. Na aula pronta, um clique gera **📝 Atividade**, **📄 Prova** e **📽️ Slides** — coerentes com a aula e já com a mesma adaptação.

## Funcionalidades

- 📚 **Aula Completa** — descreva a aula em texto livre (disciplina, tema, tópicos, público, o que quiser — ou cole o bloco do PDT) e receba o conteúdo pronto para ministrar, dividido em seções temáticas e dimensionado para a duração informada
- ♿ **Adaptação inclusiva na origem** — marque TDAH, dislexia, TEA, baixa visão e outras necessidades no formulário da aula: a aula já sai adaptada, e a atividade, a prova e os slides gerados a partir dela também
- 📝 **Atividade** — exercícios variados com gabarito comentado
- 📄 **Prova** — prova formal com cabeçalho, pontuação e gabarito separado
- 📽️ **Slides** — a aula vira apresentação com um clique, já no formato do **Gerador de Slides** (o gerador está embutido aqui). Abre um editor com preview slide a slide: ajuste o texto e veja a mudança na hora, depois exporte em **PPTX** (PowerPoint, editável) ou **PDF**
- ✏️ **Editar antes de exportar** — ajuste o resultado direto na tela; edições entram no PDF, Word e cópia
- 📅 **Agenda** — marque os dias de cada UC no calendário e gere a aula de cada dia. A aula fica presa à data, e a aula anterior e a próxima já vêm preenchidas — é o que garante a progressão entre as aulas
- 📂 **Histórico** — tudo fica salvo no navegador, agrupado por UC; duplique e adapte para outra turma
- 💾 **Backup** — exporte tudo num arquivo `.json` e importe em outro PC/navegador
- ⬇️ **Exportação** — PDF (impressão), Word (.doc) e copiar

## Como usar

1. Abra o site.
2. Vá em **⚙️ Configurações** e cole sua chave de API:
   - **Google Gemini** (padrão) — grátis, sem cartão: [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
   - **OpenAI** — pago, pré-pago: [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
3. Volte para **📚 Gerar Aula**, preencha os campos e clique em **✨ Gerar Aula**.
4. Na aula pronta, use os botões de **Criar a partir desta aula** para a atividade, a prova e os slides.

A chave fica salva **apenas no seu navegador** (localStorage) e é enviada somente para o provedor de IA escolhido. Nenhum dado passa por servidor próprio.

## Formato dos slides

O editor de slides (`js/slides.js`) separa os slides por uma linha com `---` e lê a **primeira linha** de cada bloco como título:

```
Título da aula
---
O que vamos aprender
- item curto
- outro item
---
Conceito
Parágrafo com **negrito**.

| Coluna | Coluna |
| --- | --- |
| a | b |
```

Um bloco só com título vira slide de capa. Linhas em branco separam os blocos dentro do slide (lista, parágrafo, tabela, bloco de código). O prompt de geração já entrega nesse formato — se algum slide sair torto, dá para corrigir no próprio editor, ou usar **✂️ Separar slides** quando as quebras `---` vierem faltando.

## Publicar no GitHub Pages

1. Crie um repositório no GitHub e envie estes arquivos.
2. No repositório: **Settings → Pages → Source: Deploy from a branch → Branch: main / (root)**.
3. O site fica disponível em `https://SEU-USUARIO.github.io/NOME-DO-REPO/`.

## Rodar localmente

Abra o `index.html` no navegador, ou sirva a pasta:

```
python -m http.server 8000
```

e acesse `http://localhost:8000`.
