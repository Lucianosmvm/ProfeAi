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
- 🖼️ **Imagens nos slides** — envie imagens, clique para inserir no slide e depois **arraste e redimensione** direto na preview. A posição fica gravada no próprio texto, e as imagens vão para o PDF e o PPTX
- 🎨 **Base do slide** — monte seu template sem sair do app: cor de fundo, cor de destaque, uma forma (faixa lateral, barra no topo, bloco no canto, diagonais ou hachura) e as cores do título e do texto. Enquanto monta, as **áreas do título e do conteúdo aparecem tracejadas**, para você não colocar forma nenhuma em cima do texto. Também dá para usar uma imagem sua como fundo. A base vale para todos os slides e vai junto no PDF e no PPTX
- ✏️ **Editar antes de exportar** — ajuste o resultado direto na tela; edições entram no PDF, Word e cópia
- 📅 **Agenda** — marque os dias de cada UC no calendário e gere a aula de cada dia. A aula fica presa à data, e a aula anterior e a próxima já vêm preenchidas — é o que garante a progressão entre as aulas
- 📂 **Histórico** — tudo fica salvo no navegador (IndexedDB, sem limite de itens), agrupado por UC; duplique e adapte para outra turma
- ☁️ **Google Drive** — conecte sua conta e cada material vai para o seu Drive em `Professor+ AI / <UC> / Aulas | Atividades | Provas | Slides` (aulas, atividades e provas como Google Docs; slides como Google Slides). O histórico e a agenda sincronizam entre celular e PC
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

## Instalar no celular

O app é um PWA: dá para instalar e abrir pelo ícone da tela inicial, em tela cheia.

- **Android (Chrome):** aparece o aviso **Instalar** na tela inicial do app (ou em **Ajustes → Instalar no celular**). Também dá pelo menu **⋮ → Instalar app**.
- **iPhone/iPad:** abra o site no **Safari**, toque em **Compartilhar → Adicionar à Tela de Início**.

Precisa estar publicado em HTTPS (o GitHub Pages já é). O `sw.js` guarda os arquivos do app: com internet, sempre busca a versão nova; sem internet, abre a cópia guardada — o histórico e os materiais já gerados continuam acessíveis (gerar precisa de internet). Os ícones ficam em `icons/`.

## Google Drive

Grátis e sem servidor: o login é feito pelo Google Identity Services direto no navegador, e o app usa só os escopos `drive.file` (enxerga apenas os arquivos que ele mesmo criou) e `drive.appdata` (o arquivo oculto de sincronização).

Configuração, uma vez só:

1. No [Google Cloud Console](https://console.cloud.google.com/projectcreate), crie um projeto (não pede cartão).
2. Ative a [Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com).
3. Em [Google Auth Platform](https://console.cloud.google.com/auth/overview), configure o app com público **Externo**, deixe em **Teste** e adicione seu e-mail em **Usuários de teste**.
4. Em **Clientes**, crie um cliente **Aplicativo da Web** e adicione em **Origens JavaScript autorizadas** o endereço do site — ex.: `https://SEU-USUARIO.github.io` e, para testar local, `http://localhost:8000`.
5. Cole o **ID do cliente** em **Ajustes → Google Drive** e clique em **Conectar**.

Como funciona:

- Cada material vira um arquivo em `Professor+ AI / <UC> / <tipo>`; sem UC, vai para `Sem UC`. O nome começa pela data (`2026-09-08 — Modelo ER`), para ordenar.
- Editou o material no app: a versão nova é enviada e a anterior vai para a **lixeira do Drive** (recuperável por 30 dias). Excluiu no app: o arquivo também vai para a lixeira.
- O arquivo oculto `profeai-dados.json` (pasta de dados do app) guarda histórico, agenda e referências das UCs. Cada aparelho mescla o que tem com ele: no histórico, vence a versão mais recente de cada material; na agenda, a mudança mais recente de cada dia (marcar, trocar ou desmarcar); nas referências, a mais recente de cada UC.
- O token do Google dura 1 hora. Quando expira, aparece **Reconectar** no topo: um clique e as mudanças pendentes seguem para o Drive.
- Editar o arquivo direto no Drive não volta para o app — o app é a fonte, e a próxima edição feita nele substitui o arquivo.

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

Imagens entram como um bloco próprio, `![id x=43 y=46 w=30 k=ab12]` — `x`, `y` e `w` em % do slide. Você não escreve isso à mão: o botão **➕ Adicionar imagem** insere a tag, e arrastar ou redimensionar na preview reescreve os números. As imagens ficam no **IndexedDB** do navegador (`js/imagens.js`), não no localStorage — em base64 elas estourariam a cota que o histórico inteiro divide. Por isso **não entram no backup `.json`**: ao restaurar um backup em outro PC, os slides voltam com o aviso de imagem não encontrada e é preciso enviá-las de novo.

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
