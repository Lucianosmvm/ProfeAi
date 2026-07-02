# Professor+ AI

Plataforma web para professores gerarem **planos de aula, atividades, provas e rubricas** com IA — preenchendo formulários simples, sem escrever prompts.

100% estática (HTML + CSS + JavaScript puro), sem backend. Funciona direto no GitHub Pages.

## Funcionalidades

- 📚 **Plano de Aula** — objetivos, metodologia, cronograma com tempos, avaliação e tarefa de casa
- 📝 **Gerar Atividade** — múltipla escolha, dissertativa, V/F, projeto ou misto, com gabarito comentado
- 📄 **Gerar Prova** — prova formal com cabeçalho, pontuação e gabarito separado
- 📊 **Rubrica** — critérios com pesos e níveis de desempenho
- 📂 **Histórico** — tudo fica salvo no navegador; duplique e adapte para outra turma
- ⬇️ **Exportação** — PDF (impressão), Word (.doc) e copiar

## Como usar

1. Abra o site.
2. Vá em **⚙️ Configurações** e cole sua chave da API OpenAI ([crie aqui](https://platform.openai.com/api-keys)).
3. Escolha um fluxo, preencha os campos e clique em **✨ Gerar**.

A chave fica salva **apenas no seu navegador** (localStorage) e é enviada somente para a API da OpenAI. Nenhum dado passa por servidor próprio.

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
