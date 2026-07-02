# Professor+ AI

Plataforma web para professores gerarem **planos de aula, atividades, provas e rubricas** com IA — preenchendo formulários simples, sem escrever prompts.

100% estática (HTML + CSS + JavaScript puro), sem backend. Funciona direto no GitHub Pages.

## Funcionalidades

- 📚 **Plano de Aula** — objetivos, metodologia, cronograma com tempos, avaliação e tarefa de casa
- 🗺️ **Sequência Didática** — várias aulas encadeadas sobre um tema, com progressão, quadro-resumo e avaliação do conjunto
- 📝 **Gerar Atividade** — múltipla escolha, dissertativa, V/F, projeto ou misto, com gabarito comentado
- 📄 **Gerar Prova** — prova formal com cabeçalho, pontuação e gabarito separado
- 📽️ **Slides** — apresentação pronta para projetar (reveal.js), com notas do apresentador; botão **Apresentar** em tela cheia
- ♿ **Adaptação Inclusiva** — adapta um material existente para TDAH, dislexia, TEA, baixa visão e outras necessidades, preservando o conteúdo
- 📊 **Rubrica** — critérios com pesos e níveis de desempenho
- 🔗 **Encadear materiais** — gere um material a partir de outro (ex.: slides ou prova a partir de um plano), mantendo coerência
- ✏️ **Editar antes de exportar** — ajuste o resultado direto na tela; edições entram no PDF, Word e cópia
- 📂 **Histórico** — tudo fica salvo no navegador; duplique e adapte para outra turma
- 💾 **Backup** — exporte tudo num arquivo `.json` e importe em outro PC/navegador (guarde no Drive, se quiser)
- ⬇️ **Exportação** — PDF (impressão), Word (.doc) e copiar

## Como usar

1. Abra o site.
2. Vá em **⚙️ Configurações** e cole sua chave de API:
   - **Google Gemini** (padrão) — grátis, sem cartão: [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
   - **OpenAI** — pago, pré-pago: [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
3. Escolha um fluxo, preencha os campos e clique em **✨ Gerar**.

A chave fica salva **apenas no seu navegador** (localStorage) e é enviada somente para o provedor de IA escolhido. Nenhum dado passa por servidor próprio.

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
