/* Professor+ AI — SPA com roteamento por hash.

   Fluxo único: configurar a chave → gerar a Aula → e, a partir dela, gerar
   atividade, prova e slides. A adaptação inclusiva é pedida uma vez, no
   formulário da aula, e acompanha os materiais derivados. */
(function () {
  'use strict';

  // Quebras de linha simples viram <br> — mantém alternativas (A, B, C, D) uma por linha.
  if (window.marked) marked.setOptions({ breaks: true, gfm: true });

  const $ = sel => document.querySelector(sel);
  const $$ = sel => document.querySelectorAll(sel);

  const state = {
    current: null,      // { tipo, params, conteudo } do resultado em exibição
    generating: false,
  };

  // Filtro de UC ativo na tela de Histórico ('all' = todas). Mantido entre re-renders.
  let historyFilter = 'all';

  /* ===== UC (Unidade Curricular) ===== */
  // Código bruto da UC de um item (string), ex.: "UC10". Vazio se não tiver.
  function ucOf(item) { return (item.params && item.params.uc || '').trim(); }
  // Chave de agrupamento — normaliza p/ "UC10" e "uc10" caírem no mesmo grupo.
  function ucKey(uc) { return (uc || '').trim().toUpperCase() || '__none__'; }

  // Lista de UCs distintas já usadas, ordenadas (naturalmente por número quando possível).
  function usedUcs() {
    const map = new Map(); // chave -> rótulo bruto (o primeiro visto)
    Storage.getHistory().forEach(it => {
      const raw = ucOf(it);
      if (!raw) return;
      const k = ucKey(raw);
      if (!map.has(k)) map.set(k, raw);
    });
    // Inclui também as UCs já usadas na Agenda.
    Object.values(Storage.getAgenda()).forEach(raw => {
      const k = ucKey(raw);
      if (!map.has(k)) map.set(k, raw);
    });
    return [...map.values()].sort((a, b) =>
      a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }));
  }

  // Preenche o <datalist> para autocompletar o campo UC dos formulários.
  function refreshUcList() {
    const dl = $('#uc-list');
    if (!dl) return;
    dl.innerHTML = usedUcs().map(u => `<option value="${escapeHtml(u)}">`).join('');
  }

  /* ===== Roteamento ===== */
  const routes = ['aula', 'agenda', 'historico', 'config', 'resultado'];

  let rotaAnterior = '';

  function route() {
    const hash = location.hash.replace('#/', '') || 'aula';
    const name = routes.includes(hash) ? hash : 'aula';

    // O CSS do celular troca a barra de abas pela barra de ações no Resultado.
    if (document.body.dataset.rota && document.body.dataset.rota !== name) rotaAnterior = document.body.dataset.rota;
    document.body.dataset.rota = name;
    fecharGaveta();
    // Trocou de tela: a barra de abas volta, mesmo que um campo tenha perdido o foco sem aviso.
    document.body.classList.remove('digitando');

    $$('.view').forEach(v => v.classList.remove('active'));
    $(`#view-${name}`).classList.add('active');

    $$('.nav-link').forEach(a => {
      a.classList.toggle('active', a.dataset.route === name);
    });

    window.scrollTo(0, 0);
    renderView(name);
  }

  function rotaAtual() {
    const hash = location.hash.replace('#/', '') || 'aula';
    return routes.includes(hash) ? hash : 'aula';
  }

  /* Redesenha a tela sem rolar — também chamado quando a sincronização com o
     Drive traz dados de outro aparelho. */
  function renderView(name = rotaAtual()) {
    refreshUcList();
    if (name === 'aula') renderTelaAula();
    if (name === 'agenda') renderAgenda();
    if (name === 'historico') renderHistory();
    if (name === 'config') loadConfig();
  }

  window.addEventListener('hashchange', route);

  /* ===== Tela inicial: formulário da aula ===== */
  function renderTelaAula() {
    const nome = Storage.getNome();
    const hora = new Date().getHours();
    const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
    $('#greeting').textContent = nome ? `${saudacao}, ${nome}` : 'Gerar material';

    const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    $('#saudacao-data').textContent = hoje.charAt(0).toUpperCase() + hoje.slice(1);

    $('#aviso-chave').hidden = !!Storage.getApiKey();
    updateAulaHint();
    renderPainelSemana();
  }

  /* ===== Painel da semana (tela Gerar) =====
     Próximas aulas marcadas na Agenda e os materiais mais recentes: no PC ocupa
     a coluna da direita; no celular vem depois do formulário. */
  const PROXIMAS_MAX = 5;
  const RECENTES_MAX = 5;

  function renderPainelSemana() {
    const hojeISO = toISO(new Date());
    const agendaMap = Storage.getAgenda();
    const aulas = Cronograma.mapa();
    const proximas = Object.keys(agendaMap)
      .filter(iso => iso >= hojeISO && agendaMap[iso])
      .sort()
      .slice(0, PROXIMAS_MAX);

    const boxProx = $('#painel-proximas');
    boxProx.innerHTML = proximas.length
      ? proximas.map(iso => {
        const d = fromISO(iso);
        const quando = iso === hojeISO
          ? 'Hoje'
          : d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '');
        const aula = aulas[iso];
        return `<button type="button" class="painel-item painel-aula${iso === hojeISO ? ' hoje' : ''}" data-date="${iso}" style="--uc-cor:${corDaUc(agendaMap[iso])}">
          <span class="painel-item-meta">${escapeHtml(quando)} · ${escapeHtml(agendaMap[iso])}</span>
          <span class="painel-item-titulo${aula ? '' : ' pendente'}">${aula ? escapeHtml(Cronograma.tema(aula)) : 'Aula ainda não gerada'}</span>
        </button>`;
      }).join('')
      : '<p class="painel-vazio">Nenhuma aula marcada daqui para frente. <a href="#/agenda">Montar o cronograma</a></p>';

    // Celular: sem aula marcada, a faixa do topo some em vez de mostrar o aviso.
    boxProx.closest('.painel-bloco').classList.toggle('vazio', !proximas.length);
    $('#view-aula').classList.toggle('tem-historico', Storage.getHistory().length > 0);

    const recentes = Storage.getHistory().slice(0, RECENTES_MAX);
    const boxRec = $('#home-recent');
    boxRec.innerHTML = recentes.length
      ? recentes.map(item => `<button type="button" class="painel-item painel-recente" data-id="${item.id}">
          <span class="painel-item-icone">${ic(ICONE_TIPO[item.tipo] || 'file')}</span>
          <span class="painel-item-texto">
            <span class="painel-item-titulo">${escapeHtml(item.titulo)}</span>
            <span class="painel-item-meta">${rotulo(item.tipo)}${ucOf(item) ? ' · ' + escapeHtml(ucOf(item)) : ''}</span>
          </span>
        </button>`).join('')
      : '<p class="painel-vazio">O que você gerar aparece aqui.</p>';
  }

  // Dia da Agenda: abre a aula pronta ou leva o dia para o formulário.
  $('#painel-proximas').addEventListener('click', e => {
    const btn = e.target.closest('.painel-aula');
    if (!btn) return;
    const info = Cronograma.info(btn.dataset.date);
    if (!info) return;
    if (info.aula) openHistoryItem(info.aula);
    else {
      prefillAulaDaAgenda(btn.dataset.date, info);
      $('#form-aula').elements.pedido.focus();
    }
  });

  $('#home-recent').addEventListener('click', e => {
    const btn = e.target.closest('.painel-recente');
    const item = btn && Storage.getHistory().find(i => i.id === btn.dataset.id);
    if (item) openHistoryItem(item);
  });

  /* Checkboxes de adaptação inclusiva, montados a partir da lista de prompts. */
  (function montarAdaptacoes() {
    $('#adaptacoes-lista').innerHTML = Prompts.NECESSIDADES.map(n => `
      <label class="check">
        <input type="checkbox" name="adaptacoes" value="${escapeHtml(n)}" data-grupo="1">
        ${escapeHtml(n)}
      </label>`).join('');
  })();

  /* ===== Geração ===== */
  async function runGeneration(tipo, params, promptText, titulo) {
    if (state.generating) return;
    state.generating = true;
    abrirResultado(tipo, params, titulo);

    let texto = '';
    try {
      for await (const chunk of Api.stream(promptText)) {
        texto += chunk;
        $('#result-content').innerHTML = Seguro.md(texto);
      }
      const usage = Api.lastUsage;
      const id = Date.now().toString(36);
      state.current.conteudo = texto;
      state.current.id = id;
      // O nome vem do título que a IA escreveu no material — o pedido do
      // professor ("Conteúdos", "aula 3"...) raramente diz do que a aula trata.
      const tituloGerado = tituloDoConteudo(tipo, texto);
      if (tituloGerado) {
        titulo = tituloGerado;
        if (tipo === 'aula') params.tema = tituloGerado;   // Agenda e materiais derivados usam o tema
        state.current.titulo = titulo;
        $('#result-title').textContent = titulo;
      }
      Storage.addUsage(usage?.total);
      renderUsage(usage);
      Storage.addHistoryItem({
        id,
        tipo,
        titulo,
        data: new Date().toISOString(),
        params,
        conteudo: texto,
        usage,
      });
      refreshUcList();
      prepararVista();
      if (Api.truncou()) avisarTruncado();
    } catch (err) {
      mostrarErro(err, texto);
    } finally {
      $('#result-status').hidden = true;
      state.generating = false;
      mostrarAjuste();
    }
  }

  /* Texto do indicador de progresso (fica ao lado do spinner). */
  function setStatus(msg) {
    $('#result-status').innerHTML = `<span class="spinner"></span> ${escapeHtml(msg)}`;
  }

  /* Prepara a tela de Resultado para uma geração nova. */
  function abrirResultado(tipo, params, titulo) {
    state.current = { tipo, params, titulo, conteudo: '' };
    editarNome(false);
    $('#result-title').textContent = titulo || Prompts.labels[tipo] || 'Resultado';
    togglePresentBtn(tipo);
    renderChain(tipo);
    setEditUI(false);
    $('#result-content').innerHTML = '';
    $('#result-status').hidden = false;
    setStatus('Gerando…');
    $('#vista-impressao').hidden = true;
    $('#ajuste-form').hidden = true;
    avisoAjuste('');
    $('#ajuste-pedido').value = '';
    setVista('completo');
    renderUsage(null);
    location.hash = '#/resultado';
  }

  /* Avisa que a IA parou no limite de tamanho e oferece a retomada.
     Sem isso, um material cortado no meio parece completo. */
  function avisarTruncado() {
    const aviso = document.createElement('div');
    aviso.className = 'aviso-truncado no-print';
    aviso.innerHTML = '<p>⚠️ A IA parou no limite de tamanho da resposta — o material está incompleto.</p>'
      + `<button type="button" class="btn-primary" id="btn-continuar">${ic('arrow-right')}Continuar de onde parou</button>`;
    $('#result-content').appendChild(aviso);
    $('#btn-continuar').addEventListener('click', continuarGeracao);
  }

  /* Emenda a continuação no material já gerado. */
  async function continuarGeracao() {
    if (state.generating || !state.current?.conteudo) return;
    const { tipo, id } = state.current;
    state.generating = true;
    $('#result-status').hidden = false;
    setStatus('Continuando de onde parou…');
    $$('.aviso-truncado').forEach(el => el.remove());

    let texto = state.current.conteudo;
    try {
      let parcial = '';
      for await (const chunk of Api.stream(Prompts.continuar(tipo, texto))) {
        parcial += chunk;
        $('#result-content').innerHTML = Seguro.md(texto + parcial);
      }
      texto = texto + parcial;
      state.current.conteudo = texto;
      Storage.addUsage(Api.lastUsage?.total);
      renderUsage(Api.lastUsage);
      if (id) Storage.updateHistoryItem(id, { conteudo: texto, conteudoHtml: null });
      prepararVista();
      if (Api.truncou()) avisarTruncado();
    } catch (err) {
      mostrarErro(err, texto);
    } finally {
      $('#result-status').hidden = true;
      state.generating = false;
      mostrarAjuste();
    }
  }

  /* Mostra o erro SEM apagar o que já tinha sido gerado. */
  function mostrarErro(err, textoParcial) {
    const msg = `<p class="erro-geracao">⚠️ ${escapeHtml(Api.friendlyError(err))}</p>`;
    $('#result-content').innerHTML = textoParcial
      ? Seguro.md(textoParcial) + msg
      : msg;
  }

  function formToObj(form) {
    const data = {};
    const fd = new FormData(form);
    fd.forEach((v, k) => { data[k] = v.toString().trim(); });
    // Checkboxes soltos: desmarcados não entram no FormData, viram false.
    form.querySelectorAll('input[type="checkbox"]').forEach(c => {
      if (c.dataset.grupo) return;   // grupo de mesmo name: tratado abaixo
      data[c.name] = c.checked;
    });
    // Grupos (várias caixas com o mesmo name) viram lista.
    form.querySelectorAll('input[type="checkbox"][data-grupo]').forEach(c => {
      data[c.name] = fd.getAll(c.name).map(String);
    });
    return data;
  }

  /* ===== Formulário: Aula | Atividade | Prova | Slides =====
     Atividade, prova e slides avulsos saem de um conteúdo colado, sem aula
     antes. Os campos do outro modo ficam escondidos (CSS) e desabilitados, para
     não cobrarem `required` nem entrarem no FormData. Blocos `data-so="slides"`
     valem só para os slides, dentro do modo avulso. */
  const ROTULO_ENVIAR = { aula: 'Gerar Aula', atividade: 'Gerar Atividade', prova: 'Gerar Prova', slides: 'Gerar Slides' };

  // Nos slides o conteúdo colado não é fonte de questões: é o próprio texto
  // que vai para a tela. As dicas dos campos mudam para dizer isso.
  const DICAS_AVULSO = {
    questoes: {
      conteudo: 'As questões saem só daqui: pode ser o texto completo, um resumo ou a lista de tópicos.',
      instrucoes: 'Quantidade, tipo de questão, nível… Sem instruções, segue o padrão do app.',
      placeholder: 'Ex.: 15 questões, só dissertativas, nível fácil',
    },
    slides: {
      conteudo: 'O texto é organizado em slides sem ser reescrito: nada é inventado, a ordem e as palavras são mantidas.',
      instrucoes: 'Ex.: um slide por seção, manter a tabela inteira. Sem instruções, segue o padrão do app.',
      placeholder: 'Ex.: um slide por tópico, manter as tabelas',
    },
  };

  function setModoForm(tipo) {
    const form = $('#form-aula');
    const avulso = tipo !== 'aula';
    form.dataset.modo = avulso ? 'avulso' : 'aula';
    form.dataset.tipo = tipo;
    form.querySelector(`input[name="tipo"][value="${tipo}"]`).checked = true;
    form.querySelectorAll('[data-so]').forEach(bloco => {
      const ativo = bloco.dataset.so === 'slides'
        ? tipo === 'slides'
        : bloco.dataset.so === form.dataset.modo;
      bloco.querySelectorAll('input, textarea, select').forEach(c => { c.disabled = !ativo; });
    });
    const dica = DICAS_AVULSO[tipo === 'slides' ? 'slides' : 'questoes'];
    $('#conteudo-dica').textContent = dica.conteudo;
    $('#instrucoes-dica').textContent = dica.instrucoes;
    form.elements.instrucoes.placeholder = dica.placeholder;
    // Densidade: a última escolhida, a mesma do painel de slides do Resultado.
    if (tipo === 'slides' && !form.elements.densidade.dataset.tocado) {
      form.elements.densidade.value = Storage.getSlidesOpts().densidade || 'equilibrado';
    }
    $('#form-aula-enviar').textContent = ROTULO_ENVIAR[tipo];
  }

  $('#form-aula').elements.densidade.addEventListener('change', e => {
    e.target.dataset.tocado = '1';
  });

  $('#form-aula').querySelectorAll('input[name="tipo"]').forEach(r => {
    r.addEventListener('change', () => setModoForm(r.value));
  });

  $('#form-aula').addEventListener('submit', e => {
    e.preventDefault();
    const params = formToObj(e.target);
    const tipo = params.tipo || 'aula';
    delete params.tipo;

    if (tipo !== 'aula') {
      // O conteúdo colado fica salvo no item: é dele que o "Gerar de novo" refaz.
      const avulso = {
        uc: params.uc || '',
        tema: Prompts.resumoPedido(params.conteudo),
        conteudoBase: params.conteudo || '',
        instrucoes: params.instrucoes || '',
        adaptacoes: params.adaptacoes || [],
        adaptobs: params.adaptobs || '',
        origem: 'avulso',
        // Vazio = a quantidade que o conteúdo pedir (Prompts.slidesMinimo → 0).
        ...(tipo === 'slides' ? { minSlides: params.minSlides || '', densidade: params.densidade || 'equilibrado' } : {}),
      };
      runGeneration(tipo, avulso, Prompts.avulso(tipo, avulso), Prompts.titulo[tipo](avulso));
      return;
    }

    // Rótulo curto derivado do pedido: é o que aparece no histórico, na Agenda
    // e nos materiais gerados a partir desta aula.
    params.tema = Prompts.resumoPedido(params.pedido);

    // A referência fica guardada na UC, não em cada aula: são milhares de
    // caracteres, e uma cópia por item do histórico estouraria a cota.
    const referencia = params.referencia || '';
    Storage.setReferencia(params.uc, referencia);
    refCarregada = referencia;
    delete params.referencia;

    runGeneration(
      'aula', params,
      Prompts.aula({ ...params, referencia }),
      Prompts.titulo.aula(params),
    );
  });

  /* ===== Ações do resultado ===== */

  /* Nome do material atual — usado no arquivo do Word. Itens antigos do
     histórico não têm gerador de título, então cai no título salvo. */
  function tituloAtual() {
    const c = state.current;
    if (!c) return 'documento';
    const fn = Prompts.titulo[c.tipo];
    return c.titulo || (fn && fn(c.params || {})) || 'documento';
  }

  /* ===== Nome do material =====
     Título escrito pela IA no topo do material: o primeiro "# " ou "## " — nos
     slides, a primeira linha (a capa). Sem marcações de negrito. */
  const TITULO_MAX = 150;

  function tituloDoConteudo(tipo, texto) {
    const linhas = String(texto || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let bruto = '';
    if (tipo === 'slides') bruto = (linhas[0] || '').replace(/^#+\s*/, '');
    else {
      const titulo = linhas.find(l => /^#{1,2}\s+\S/.test(l));
      bruto = titulo ? titulo.replace(/^#{1,2}\s+/, '') : '';
    }
    const limpo = bruto.replace(/[*_`]/g, '').replace(/\s+/g, ' ').replace(/[:\s]+$/, '').trim();
    return limpo.slice(0, TITULO_MAX);
  }

  function editarNome(on) {
    const c = state.current;
    if (on && (!c?.id || state.generating)) return;   // ainda gerando: não há item para renomear
    $('#form-renomear').hidden = !on;
    $('#result-title').hidden = on;
    $('#btn-renomear').hidden = on;
    if (on) {
      const input = $('#renomear-input');
      input.value = c.titulo || '';
      input.focus();
      input.select();
    }
  }

  $('#btn-renomear').addEventListener('click', () => editarNome(true));
  $('#result-title').addEventListener('click', () => editarNome(true));
  $('#renomear-cancelar').addEventListener('click', () => editarNome(false));
  $('#renomear-input').addEventListener('keydown', e => { if (e.key === 'Escape') editarNome(false); });

  $('#form-renomear').addEventListener('submit', e => {
    e.preventDefault();
    const c = state.current;
    const nome = $('#renomear-input').value.replace(/\s+/g, ' ').trim().slice(0, TITULO_MAX);
    if (!c?.id || !nome || nome === c.titulo) { editarNome(false); return; }
    c.titulo = nome;
    const patch = { titulo: nome };
    // A aula também é chamada pelo tema na Agenda e nos materiais gerados dela.
    if (c.tipo === 'aula') {
      c.params = { ...(c.params || {}), tema: nome };
      patch.params = c.params;
    }
    Storage.updateHistoryItem(c.id, patch);
    $('#result-title').textContent = nome;
    editarNome(false);
  });

  /* ===== Folha do aluno × gabarito =====
     Em prova e atividade, a tela, a impressão, o Word e o Copiar seguem a
     vista escolhida: completo, só a folha do aluno ou só o gabarito. */
  const SUFIXO_VISTA = { completo: '', aluno: ' - folha do aluno', gabarito: ' - gabarito' };
  state.vista = 'completo';

  function setVista(vista) {
    state.vista = vista;
    const box = $('#result-content');
    box.classList.toggle('vista-aluno', vista === 'aluno');
    box.classList.toggle('vista-gabarito', vista === 'gabarito');
    $$('#vista-impressao [data-vista]').forEach(b => b.classList.toggle('ativo', b.dataset.vista === vista));
  }

  /* Depois de o conteúdo estar na tela: acha o gabarito e mostra o seletor. */
  function prepararVista() {
    const tipo = state.current?.tipo;
    const tem = (tipo === 'prova' || tipo === 'atividade') && Avaliacao.marcar($('#result-content'));
    $('#vista-impressao').hidden = !tem;
    if (!tem) setVista('completo');
  }

  $$('#vista-impressao [data-vista]').forEach(b => {
    b.addEventListener('click', () => {
      if ($('#result-content').contentEditable === 'true') return;   // editando: sempre completo
      setVista(b.dataset.vista);
    });
  });

  /* Conteúdo da tela na vista atual (ou na pedida), já sem avisos da interface. */
  function recorteAtual(vista = state.vista) {
    return Avaliacao.recorte($('#result-content'), vista);
  }

  /* innerText só respeita quebras de parágrafo num elemento que está na página. */
  function textoDe(el) {
    el.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;';
    document.body.appendChild(el);
    const texto = el.innerText.trim();
    el.remove();
    return texto;
  }

  $('#btn-copy').addEventListener('click', async () => {
    if (!state.current?.conteudo) return;
    // Lê a tela: inclui edições feitas no modo Editar e respeita a vista escolhida.
    const texto = textoDe(recorteAtual()) || state.current.conteudo;
    await navigator.clipboard.writeText(texto);
    flash($('#btn-copy'), 'Copiado!', 'check');
  });

  $('#btn-print').addEventListener('click', () => window.print());

  $('#btn-word').addEventListener('click', () => {
    if (!state.current?.conteudo) return;
    // .doc aceita HTML; Word abre normalmente. Lê o DOM p/ incluir edições.
    const corpo = recorteAtual().innerHTML || Seguro.md(state.current.conteudo);
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <style>body{font-family:Calibri,Arial,sans-serif;line-height:1.5}
      table{border-collapse:collapse}td,th{border:1px solid #999;padding:6px 10px}</style>
      </head><body>${corpo}</body></html>`;
    const blob = new Blob(['﻿', html], { type: 'application/msword' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = sanitizeFilename(tituloAtual() + SUFIXO_VISTA[state.vista]) + '.doc';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  /* ===== Versão embaralhada da prova =====
     Sem IA e sem custo: as questões e as alternativas trocam de ordem e o
     gabarito é refeito para a nova ordem. Cada versão vira um item próprio. */
  function gerarVersao() {
    const atual = state.current;
    if (!atual?.conteudo || state.generating) return;
    const raizId = atual.params?.versaoDe || atual.id;
    const historico = Storage.getHistory();
    const raiz = historico.find(i => i.id === raizId) || atual;

    if (raiz.conteudoHtml && !confirm('Esta prova foi editada na tela. A versão embaralhada parte do texto gerado originalmente, sem essas edições. Continuar?')) return;

    const usadas = new Set(historico.filter(i => i.params?.versaoDe === raizId).map(i => i.params.versao));
    let letra = 'B';
    while (usadas.has(letra) && letra < 'Z') letra = String.fromCharCode(letra.charCodeAt(0) + 1);

    let conteudo;
    try {
      conteudo = Avaliacao.embaralhar(raiz.conteudo, letra);
    } catch (err) {
      alert(`⚠️ ${err.message}\n\nA versão embaralhada precisa das questões numeradas e da seção "Gabarito". Provas geradas agora já saem nesse formato.`);
      return;
    }

    const item = {
      id: Date.now().toString(36),
      tipo: 'prova',
      titulo: `${raiz.titulo} (Versão ${letra})`,
      data: new Date().toISOString(),
      params: { ...raiz.params, versaoDe: raizId, versao: letra },
      conteudo,
    };
    Storage.addHistoryItem(item);
    openHistoryItem(item);
  }

  /* ===== Ajustar um trecho com IA =====
     A IA devolve só os trechos que mudam (js/ajuste.js aplica). O estado
     anterior fica guardado para um "Desfazer" — um nível, nesta sessão. */
  const SUGESTOES_AJUSTE = {
    aula: ['Linguagem mais simples', 'Mais um exemplo prático em cada seção', 'Mais exercícios no final'],
    atividade: ['Questões mais fáceis', 'Mais 2 questões', 'Justificativas mais curtas no gabarito'],
    prova: ['Deixe mais difícil', 'Mais 2 questões', 'Troque a questão 1 por outra do mesmo tema'],
    slides: ['Menos texto por slide', 'Mais um slide de exemplo', 'Títulos mais curtos'],
  };

  function mostrarAjuste() {
    const c = state.current;
    const form = $('#ajuste-form');
    form.hidden = !c?.conteudo || state.generating;
    if (form.hidden) return;
    $('#ajuste-sugestoes').innerHTML = (SUGESTOES_AJUSTE[c.tipo] || [])
      .map(s => `<button type="button" class="ajuste-chip">${escapeHtml(s)}</button>`).join('');
    $('#ajuste-desfazer').hidden = !(state.desfazer && state.desfazer.id === c.id);
  }

  function avisoAjuste(msg, tipo = 'ok') {
    const el = $('#ajuste-msg');
    el.hidden = !msg;
    el.className = `ajuste-msg is-${tipo}`;
    el.textContent = msg || '';
  }

  /* Troca o conteúdo do material atual na tela e no histórico. */
  function trocarConteudo(conteudo, conteudoHtml) {
    const c = state.current;
    c.conteudo = conteudo;
    c.conteudoHtml = conteudoHtml || null;
    if (c.id) Storage.updateHistoryItem(c.id, { conteudo, conteudoHtml: c.conteudoHtml });
    $('#result-content').innerHTML = c.conteudoHtml ? Seguro.html(c.conteudoHtml) : Seguro.md(conteudo);
    prepararVista();
  }

  $('#ajuste-sugestoes').addEventListener('click', e => {
    const chip = e.target.closest('.ajuste-chip');
    if (!chip) return;
    $('#ajuste-pedido').value = chip.textContent;
    $('#ajuste-pedido').focus();
  });

  $('#ajuste-form').addEventListener('submit', async e => {
    e.preventDefault();
    const c = state.current;
    const pedido = $('#ajuste-pedido').value.trim();
    if (!c?.conteudo || state.generating) return;
    if (!pedido) { $('#ajuste-pedido').focus(); return; }
    if ($('#result-content').contentEditable === 'true') { avisoAjuste('Conclua a edição antes de pedir um ajuste.', 'erro'); return; }
    if (c.conteudoHtml && !confirm('Este material foi editado na tela. O ajuste parte do texto gerado, e essas edições feitas à mão serão perdidas. Continuar?')) return;

    state.generating = true;
    avisoAjuste('');
    $('#ajuste-enviar').disabled = true;
    $('#ajuste-enviar').innerHTML = `<span class="spinner"></span>Ajustando…`;
    $('#result-status').hidden = false;
    setStatus('Ajustando…');
    let resposta = '';
    try {
      for await (const chunk of Api.stream(Prompts.ajuste(c.tipo, c.conteudo, pedido))) resposta += chunk;
      Storage.addUsage(Api.lastUsage?.total);

      if (Api.truncou()) {
        avisoAjuste('A resposta da IA foi cortada no meio; nada foi alterado. Tente um pedido menor.', 'erro');
        return;
      }
      const blocos = Ajuste.ler(resposta);
      if (!blocos.length) {
        avisoAjuste('A IA não devolveu o ajuste no formato esperado. Tente descrever o pedido de outro jeito.', 'erro');
        return;
      }
      const r = Ajuste.aplicar(c.conteudo, blocos);
      if (!r.aplicados) {
        avisoAjuste('Não encontrei no material os trechos que a IA quis mudar; nada foi alterado. Tente de novo.', 'erro');
        return;
      }
      state.desfazer = { id: c.id, conteudo: c.conteudo, conteudoHtml: c.conteudoHtml || null };
      trocarConteudo(r.texto, null);
      $('#ajuste-pedido').value = '';
      avisoAjuste(`${r.aplicados} ${r.aplicados === 1 ? 'trecho ajustado' : 'trechos ajustados'}.`
        + (r.falhas ? ` ${r.falhas} ${r.falhas === 1 ? 'trecho não foi encontrado e ficou' : 'trechos não foram encontrados e ficaram'} como estava.` : ''),
        r.falhas ? 'erro' : 'ok');
    } catch (err) {
      avisoAjuste(Api.friendlyError(err), 'erro');
    } finally {
      state.generating = false;
      $('#ajuste-enviar').disabled = false;
      $('#ajuste-enviar').innerHTML = `${ic('wand')}Ajustar`;
      $('#result-status').hidden = true;
      mostrarAjuste();
    }
  });

  $('#ajuste-desfazer').addEventListener('click', () => {
    const d = state.desfazer;
    if (!d || d.id !== state.current?.id || state.generating) return;
    trocarConteudo(d.conteudo, d.conteudoHtml);
    state.desfazer = null;
    avisoAjuste('Ajuste desfeito.');
    mostrarAjuste();
  });

  $('#btn-regenerate').addEventListener('click', () => {
    const c = state.current;
    if (!c || state.generating) return;
    // Versão embaralhada: embaralha de novo a partir da prova original.
    if (c.params?.versaoDe) {
      const raiz = Storage.getHistory().find(i => i.id === c.params.versaoDe);
      if (!raiz) { alert('A prova original desta versão não está mais no histórico.'); return; }
      try {
        const conteudo = Avaliacao.embaralhar(raiz.conteudo, c.params.versao);
        Storage.updateHistoryItem(c.id, { conteudo, conteudoHtml: null });
        openHistoryItem(Storage.getHistory().find(i => i.id === c.id));
      } catch (err) {
        alert('⚠️ ' + err.message);
      }
      return;
    }
    if (c.tipo === 'aula') {
      // A referência não vive no histórico: vem da UC, como na primeira geração.
      const referencia = Storage.getReferencia(c.params && c.params.uc);
      runGeneration(
        'aula', c.params,
        Prompts.aula({ ...c.params, referencia }),
        Prompts.titulo.aula(c.params),
      );
      return;
    }
    // Atividade/prova/slides avulsos: o conteúdo de base está no próprio item.
    if (c.params?.origem === 'avulso') {
      runGeneration(c.tipo, c.params, Prompts.avulso(c.tipo, c.params), c.titulo);
      return;
    }
    // Materiais derivados: refaz a partir do material base salvo no histórico.
    // Guardamos só o id da origem — copiar a aula inteira dentro de cada
    // derivado triplicaria o histórico dentro da cota do localStorage.
    const origem = c.params?.origemId
      && Storage.getHistory().find(i => i.id === c.params.origemId);
    if (!origem) {
      alert('A aula de origem não está mais no histórico. Abra a aula desejada e gere este material a partir dela.');
      return;
    }
    runGeneration(
      c.tipo, c.params,
      Prompts.chain(c.tipo, c.params.origem, origem.conteudo, c.params),
      c.titulo,
    );
  });

  function renderUsage(u) {
    const el = $('#result-usage');
    if (!u || !u.total) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    el.textContent = `🔢 ${u.total} tokens nesta geração (entrada ${u.prompt ?? '—'} · saída ${u.output ?? '—'})`;
  }

  /* ===== Editar resultado ===== */
  function setEditUI(on) {
    const c = $('#result-content');
    c.contentEditable = on ? 'true' : 'false';
    c.classList.toggle('editing', on);
    atualizarBarraEdicao();
    // Editando, tudo fica à mostra; ao concluir, o gabarito é reconhecido de novo.
    if (on) setVista('completo');
    $('#vista-impressao').classList.toggle('desativado', on);
    $('#ajuste-form').classList.toggle('desativado', on);
    if (!on && state.current?.conteudo) prepararVista();
    $('#btn-edit').innerHTML = on
      ? `${ic('check')}<span class="lbl">Concluir</span>`
      : `${ic('pencil')}<span class="lbl">Editar</span>`;
  }

  function persistEdit() {
    if (!state.current) return;
    const html = $('#result-content').innerHTML;
    state.current.conteudoHtml = html;
    if (state.current.id) Storage.updateHistoryItem(state.current.id, { conteudoHtml: html });
  }

  $('#btn-edit').addEventListener('click', () => {
    if (!state.current?.conteudo || state.generating) return;
    const on = $('#result-content').contentEditable !== 'true';
    setEditUI(on);
    if (on) $('#result-content').focus();
    else persistEdit();
  });

  // Troca o rótulo do botão por um aviso curto e depois restaura (ícone incluso).
  function flash(btn, msg, icone) {
    const original = btn.innerHTML;
    btn.innerHTML = (icone ? ic(icone) : '') + `<span class="lbl">${escapeHtml(msg)}</span>`;
    setTimeout(() => { btn.innerHTML = original; }, 1500);
  }

  /* Ícone SVG do sprite em index.html. */
  function ic(nome) {
    return `<svg class="ic" aria-hidden="true"><use href="#i-${nome}"/></svg>`;
  }

  /* Rótulo do tipo sem o emoji do início ("📝 Atividade" -> "Atividade"). */
  function rotulo(tipo) {
    return (Prompts.labels[tipo] || tipo).replace(/^[^\p{L}\p{N}]+/u, '');
  }
  const ICONE_TIPO = { aula: 'book', plano: 'book', atividade: 'pencil', prova: 'file', slides: 'present' };

  function sanitizeFilename(name) {
    return name.replace(/[\\/:*?"<>|]/g, '-').slice(0, 80);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  /* ===== Encadear: gerar atividade, prova e slides a partir da aula ===== */
  function renderChain(tipo) {
    const bar = $('#chain-bar');
    const box = $('#chain-actions');
    const targets = Prompts.chainTargets[tipo] || [];
    if (!targets.length) { bar.hidden = true; box.innerHTML = ''; return; }

    $('.chain-label').textContent = tipo === 'aula'
      ? 'Criar a partir desta aula:'
      : 'Criar a partir disto:';
    bar.hidden = false;
    slidesOpts().hidden = true;
    box.innerHTML = targets
      .map(t => `<button class="btn-secondary" data-target="${t}">${ic(ICONE_TIPO[t] || 'file')}${rotulo(t)}</button>`)
      .join('')
      + (tipo === 'prova'
        ? `<button class="btn-secondary" data-target="versao" title="Mesmas questões, em outra ordem, com o gabarito refeito">${ic('shuffle')}Versão embaralhada</button>`
        : '');
    box.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => {
        if (b.dataset.target === 'versao') { gerarVersao(); return; }
        // Slides abrem antes o painel de opções (quantidade e densidade).
        if (b.dataset.target === 'slides') { toggleSlidesOpts(); return; }
        generateChain(b.dataset.target);
      });
    });
  }

  /* ===== Opções dos slides ===== */
  function slidesOpts() { return $('#chain-opts-slides'); }

  function toggleSlidesOpts() {
    const box = slidesOpts();
    if (!box.hidden) { box.hidden = true; return; }
    const o = Storage.getSlidesOpts();
    $('#slides-min').value = o.minSlides;
    $('#slides-densidade').value = o.densidade;
    // Se a base aplicada não é mais a de um estilo pronto (o professor montou a
    // dele ou pôs uma imagem), o cartão marcado é o "minha base".
    const info = Deck.baseInfo();
    temaEscolhido = info.origem === 'imagem' || !info.tema ? 'atual' : info.tema;
    renderTemasEscolha();
    box.hidden = false;
  }

  /* ===== Estilo visual dos slides =====
     Os estilos prontos vêm de js/temas.js; os dois últimos cartões guardam o
     que já existia: montar a base à mão e usar uma imagem como fundo. */
  let temaEscolhido = 'atual';

  function cartaoEstilo(sel, thumb, nome, hint, dataset) {
    return `<button type="button" class="tema-card${sel ? ' sel' : ''}" ${dataset} title="${escapeHtml(hint)}">
      ${thumb}<span>${escapeHtml(nome)}</span></button>`;
  }

  function renderTemasEscolha() {
    const box = $('#slides-temas');
    if (!box) return;
    const prontos = (window.Temas ? Temas.LISTA : []).map(t => cartaoEstilo(
      temaEscolhido === t.id,
      `<img src="${Temas.previewUrl(t.id, false, null)}" alt="">`,
      t.nome,
      'Fundo profissional com capa em gradiente',
      `data-tema="${t.id}"`,
    )).join('');
    const manter = cartaoEstilo(
      temaEscolhido === 'atual',
      '<span class="tema-card-icone">🎨</span>',
      'Minha base',
      'Mantém a base que você montou em 🎨 Base do slide',
      'data-tema="atual"',
    );
    const imagem = cartaoEstilo(
      false,
      '<span class="tema-card-icone">🖼️</span>',
      'Imagem de fundo',
      'Usa uma imagem 16:9 sua como fundo de todos os slides',
      'data-tema="imagem"',
    );
    box.innerHTML = prontos + manter + imagem;
  }

  $('#slides-temas').addEventListener('click', e => {
    const card = e.target.closest('.tema-card');
    if (!card) return;
    if (card.dataset.tema === 'imagem') { $('#slides-tema-img').click(); return; }
    temaEscolhido = card.dataset.tema;
    renderTemasEscolha();
  });

  $('#slides-tema-img').addEventListener('change', async e => {
    const file = (e.target.files || [])[0];
    e.target.value = '';
    if (!file) return;
    const ok = await Deck.usarImagemBase(file);
    if (!ok) { alert('Não foi possível usar esta imagem como fundo.'); return; }
    temaEscolhido = 'atual';
    renderTemasEscolha();
  });

  /* Lê o painel, guarda a escolha e devolve os campos que vão para o prompt. */
  function lerSlidesOpts() {
    const n = parseInt($('#slides-min').value, 10);
    const opts = {
      minSlides: Math.min(60, Math.max(4, Number.isFinite(n) ? n : 14)),
      densidade: $('#slides-densidade').value,
      tema: temaEscolhido,
    };
    Storage.setSlidesOpts(opts);
    return opts;
  }

  $('#slides-gerar').addEventListener('click', async () => {
    const btn = $('#slides-gerar');
    // O estilo é aplicado antes de gerar: quando o editor abrir, a preview já
    // sai com o fundo certo.
    if (temaEscolhido && temaEscolhido !== 'atual') {
      btn.disabled = true;
      await Deck.aplicarTema(temaEscolhido);
      btn.disabled = false;
    }
    slidesOpts().hidden = true;
    generateChain('slides');
  });

  function generateChain(target) {
    if (!state.current?.conteudo || state.generating) return;
    const src = state.current;
    const p = src.params || {};
    // innerText inclui edições feitas no modo Editar; fallback para o markdown original.
    const srcText = textoDe(recorteAtual('completo')) || src.conteudo;

    // A adaptação inclusiva pedida na aula segue para o material derivado.
    const params = {
      uc: p.uc || '',
      tema: p.tema || '',
      disciplina: p.disciplina || '',
      adaptacoes: Prompts.adaptacoes(p),
      adaptobs: p.adaptobs || '',
      origem: src.tipo,
      origemId: src.id || '',
      // Quantidade e densidade escolhidas pelo professor; ficam salvas no
      // histórico para o "Gerar novamente" repetir a mesma configuração.
      ...(target === 'slides' ? lerSlidesOpts() : {}),
    };
    runGeneration(
      target,
      params,
      Prompts.chain(target, src.tipo, srcText, params),
      Prompts.titulo[target](params),
    );
  }

  /* ===== Histórico ===== */
  // Voltam para o formulário: a Aula e a atividade/prova avulsa. Os demais
  // materiais nascem de outro material, não do formulário.
  function podeDuplicar(item) {
    return item.tipo === 'aula' || item.tipo === 'plano' || item.params?.origem === 'avulso';
  }

  function historyItemHtml(item) {
    const data = new Date(item.data).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
    const uc = ucOf(item);
    const ucTag = uc ? `<span class="meta-uc">${escapeHtml(uc)}</span>` : '';
    return `<div class="history-item" data-id="${item.id}">
      <span class="history-icon">${ic(ICONE_TIPO[item.tipo] || 'file')}</span>
      <div class="info">
        <div class="titulo">${escapeHtml(item.titulo)}</div>
        <div class="meta">${ucTag}<span>${rotulo(item.tipo)} · ${data}</span></div>
      </div>
      <div class="actions">
        <button class="btn-secondary" data-action="open">Abrir</button>
        ${podeDuplicar(item) ? `<button class="btn-secondary btn-icon" data-action="dup" title="Duplicar" aria-label="Duplicar">${ic('copy')}</button>` : ''}
        <button class="btn-danger btn-icon" data-action="del" title="Excluir" aria-label="Excluir">${ic('trash')}</button>
      </div>
    </div>`;
  }

  /* ===== Histórico: busca e filtros =====
     Filtros por UC e por tipo, e busca no título e no conteúdo. No PC ficam
     numa coluna ao lado; no celular, em faixas roláveis acima da lista. Os
     controles são montados uma vez só, para a busca não perder o foco a cada
     letra digitada. */
  let historyTipo = 'all';
  let historyBusca = '';
  const TIPOS_FILTRO = [
    { id: 'aula', rotulo: 'Aulas', tipos: ['aula', 'plano'] },
    { id: 'atividade', rotulo: 'Atividades', tipos: ['atividade'] },
    { id: 'prova', rotulo: 'Provas', tipos: ['prova'] },
    { id: 'slides', rotulo: 'Slides', tipos: ['slides'] },
  ];

  function semAcento(t) {
    return String(t || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  }

  function montarControlesHistorico(controls) {
    if (controls.querySelector('#hist-busca')) return;
    controls.innerHTML = `
      <label class="hist-busca">
        ${ic('search')}
        <input type="search" id="hist-busca" placeholder="Buscar materiais" autocomplete="off" aria-label="Buscar no histórico">
      </label>
      <div class="hist-filtro">
        <span class="hist-filtro-titulo">UC</span>
        <div class="hist-chips" id="hist-ucs"></div>
      </div>
      <div class="hist-filtro">
        <span class="hist-filtro-titulo">Tipo</span>
        <div class="hist-chips" id="hist-tipos"></div>
      </div>`;
    $('#hist-busca').value = historyBusca;
    $('#hist-busca').addEventListener('input', e => {
      historyBusca = e.target.value;
      renderHistory();
    });
    $('#hist-ucs').addEventListener('click', e => {
      const b = e.target.closest('[data-uc]');
      if (b) { historyFilter = b.dataset.uc; renderHistory(); }
    });
    $('#hist-tipos').addEventListener('click', e => {
      const b = e.target.closest('[data-tipo]');
      if (b) { historyTipo = b.dataset.tipo; renderHistory(); }
    });
  }

  function chipFiltro(attr, valor, rotulo, qtd, ativo) {
    return `<button type="button" class="hist-chip${ativo ? ' ativo' : ''}" data-${attr}="${escapeHtml(valor)}">
      <span>${escapeHtml(rotulo)}</span><span class="hist-chip-qtd">${qtd}</span></button>`;
  }

  function renderHistory() {
    const list = Storage.getHistory();
    const box = $('#history-list');
    const controls = $('#history-controls');

    if (!list.length) {
      controls.innerHTML = '';
      controls.hidden = true;
      box.innerHTML = `<div class="empty-state">
        <span class="empty-icon">${ic('inbox')}</span>
        <h3>Nada gerado ainda</h3>
        <p>As aulas, atividades, provas e slides que você gerar aparecem aqui.</p>
        <a href="#/" class="btn-primary">${ic('sparkles')}Gerar a primeira aula</a>
      </div>`;
      return;
    }
    controls.hidden = false;
    montarControlesHistorico(controls);

    // Busca e tipo valem para tudo; as contagens de UC já refletem os dois.
    const termo = semAcento(historyBusca.trim());
    const bateBusca = item => !termo
      || semAcento(item.titulo).includes(termo)
      || semAcento(item.conteudo).includes(termo);
    const tipoAtual = TIPOS_FILTRO.find(t => t.id === historyTipo);
    const bateTipo = item => !tipoAtual || tipoAtual.tipos.includes(item.tipo);

    const buscados = list.filter(bateBusca);
    const filtrados = buscados.filter(bateTipo);

    // Agrupa por UC preservando a ordem (histórico já vem do mais novo p/ o mais antigo).
    const groups = new Map(); // chave -> { label, items: [] }
    list.forEach(item => {
      const k = ucKey(ucOf(item));
      if (!groups.has(k)) groups.set(k, { label: ucOf(item) || 'Sem UC', items: [] });
    });
    filtrados.forEach(item => groups.get(ucKey(ucOf(item))).items.push(item));

    // Ordena os grupos: UCs nomeadas por ordem natural, "Sem UC" por último.
    const keys = [...groups.keys()].sort((a, b) => {
      if (a === '__none__') return 1;
      if (b === '__none__') return -1;
      return groups.get(a).label.localeCompare(
        groups.get(b).label, 'pt-BR', { numeric: true, sensitivity: 'base' });
    });
    if (historyFilter !== 'all' && !groups.has(historyFilter)) historyFilter = 'all';

    $('#hist-ucs').innerHTML = chipFiltro('uc', 'all', 'Todas', filtrados.length, historyFilter === 'all')
      + keys.map(k => chipFiltro('uc', k, groups.get(k).label, groups.get(k).items.length, historyFilter === k)).join('');

    const tiposPresentes = TIPOS_FILTRO.filter(t => list.some(i => t.tipos.includes(i.tipo)));
    $('#hist-tipos').innerHTML = chipFiltro('tipo', 'all', 'Todos', buscados.length, historyTipo === 'all')
      + tiposPresentes.map(t => chipFiltro('tipo', t.id, t.rotulo,
        buscados.filter(i => t.tipos.includes(i.tipo)).length, historyTipo === t.id)).join('');

    const visible = (historyFilter === 'all' ? keys : [historyFilter])
      .filter(k => groups.get(k).items.length);
    if (!visible.length) {
      box.innerHTML = `<div class="empty-state hist-sem-resultado">
        <span class="empty-icon">${ic('search')}</span>
        <h3>Nenhum material encontrado</h3>
        <p>Tente outra palavra ou limpe os filtros.</p>
        <button type="button" class="btn-secondary" id="hist-limpar">Limpar filtros</button>
      </div>`;
      $('#hist-limpar').addEventListener('click', () => {
        historyFilter = 'all';
        historyTipo = 'all';
        historyBusca = '';
        $('#hist-busca').value = '';
        renderHistory();
      });
      return;
    }

    box.innerHTML = visible.map(k => {
      const g = groups.get(k);
      const badge = k === '__none__' ? 'Sem UC' : escapeHtml(g.label);
      return `<div class="uc-group">
        <h2 class="uc-group-title">${badge} <span class="uc-count">${g.items.length}</span></h2>
        <div class="uc-group-itens">${g.items.map(historyItemHtml).join('')}</div>
      </div>`;
    }).join('');
    bindHistoryActions(box);
  }

  // Abre um item do histórico na tela de Resultado.
  function openHistoryItem(item) {
    state.current = {
      id: item.id, tipo: item.tipo, params: item.params, titulo: item.titulo,
      conteudo: item.conteudo, conteudoHtml: item.conteudoHtml,
    };
    editarNome(false);
    $('#result-title').textContent = item.titulo || Prompts.labels[item.tipo] || 'Resultado';
    setEditUI(false);
    $('#result-content').innerHTML = item.conteudoHtml ? Seguro.html(item.conteudoHtml) : Seguro.md(item.conteudo);
    togglePresentBtn(item.tipo);
    renderChain(item.tipo);
    renderUsage(item.usage);
    prepararVista();
    avisoAjuste('');
    $('#ajuste-pedido').value = '';
    mostrarAjuste();
    location.hash = '#/resultado';
  }

  /* Texto do pedido de um item salvo. Itens das versões antigas do app não têm
     o campo `pedido`: remonta um a partir dos campos que existiam antes. */
  function pedidoDoItem(params) {
    if ((params.pedido || '').trim()) return params.pedido;
    return [
      params.disciplina ? `Disciplina: ${params.disciplina}` : '',
      params.tema ? `Tema: ${params.tema}` : '',
      params.tipoaula ? `Tipo de aula: ${params.tipoaula}` : '',
      (params.conteudo || params.basecurso || '').trim(),
    ].filter(Boolean).join('\n');
  }

  /* Leva os campos de um item de volta ao formulário da aula. */
  function preencherFormAula(params, {
    data = '', aulaanterior = '', aulaproxima = '', abertura = '',
    aulaanteriortopicos = '', aulaproximatopicos = '',
  } = {}) {
    const form = $('#form-aula');
    setModoForm('aula');
    form.elements.uc.value = params.uc || '';
    form.elements.carga.value = params.carga || '';
    form.elements.pedido.value = pedidoDoItem(params);
    form.elements.adaptobs.value = params.adaptobs || '';
    form.elements.aulaanterior.value = aulaanterior;
    form.elements.aulaproxima.value = aulaproxima;
    form.elements.aulaanteriortopicos.value = aulaanteriortopicos;
    form.elements.aulaproximatopicos.value = aulaproximatopicos;
    form.elements.abertura.value = abertura;

    const marcadas = Prompts.adaptacoes(params);
    form.querySelectorAll('input[name="adaptacoes"]').forEach(c => {
      c.checked = marcadas.includes(c.value);
    });
    $('#aula-adaptacao').open = marcadas.length > 0 || !!params.adaptobs;

    form.elements.data.value = data;
    refCarregada = '';            // formulário novo: pode trazer a referência da UC
    carregarReferencia();
    location.hash = '#/aula';
    updateAulaHint();
  }

  /* Leva uma atividade/prova/slides avulsos de volta ao formulário (Duplicar). */
  function preencherFormAvulso(tipo, params) {
    const form = $('#form-aula');
    setModoForm(tipo);
    form.elements.uc.value = params.uc || '';
    form.elements.conteudo.value = params.conteudoBase || '';
    form.elements.instrucoes.value = params.instrucoes || '';
    if (tipo === 'slides') {
      form.elements.minSlides.value = params.minSlides || '';
      form.elements.densidade.value = params.densidade || 'equilibrado';
    }
    form.elements.adaptobs.value = params.adaptobs || '';
    const marcadas = Prompts.adaptacoes(params);
    form.querySelectorAll('input[name="adaptacoes"]').forEach(c => {
      c.checked = marcadas.includes(c.value);
    });
    $('#aula-adaptacao').open = marcadas.length > 0 || !!params.adaptobs;
    location.hash = '#/aula';
  }

  function bindHistoryActions(container) {
    container.querySelectorAll('.history-item').forEach(el => {
      const item = Storage.getHistory().find(i => i.id === el.dataset.id);
      if (!item) return;

      el.querySelector('[data-action="open"]').addEventListener('click', () => openHistoryItem(item));

      const dup = el.querySelector('[data-action="dup"]');
      // Duplicar reabre o formulário com os campos preenchidos, mas SEM a data:
      // a cópia é para outra turma/dia, não para sobrescrever a aula daquele dia.
      if (dup) {
        dup.addEventListener('click', () => (item.params?.origem === 'avulso'
          ? preencherFormAvulso(item.tipo, item.params)
          : preencherFormAula(item.params || {})));
      }

      el.querySelector('[data-action="del"]').addEventListener('click', () => {
        Storage.removeHistoryItem(item.id);
        renderHistory();
      });
    });
  }

  /* ===== Agenda ===== */
  const agenda = {
    view: new Date(),          // qualquer dia do mês exibido
    selected: new Set(),       // datas ISO selecionadas (AAAA-MM-DD)
    painting: false,           // arrasto em andamento
    paintState: true,          // no arrasto: selecionar (true) ou tirar (false)
    modo: 'ver',               // 'ver' = consultar a aula do dia; 'marcar' = pintar UCs
    detalhe: null,             // ISO do dia aberto no painel de detalhe
    aulas: {},                 // Cronograma.mapa() do render atual
  };

  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  // Paleta estável — cada UC sempre cai na mesma cor.
  const UC_CORES = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626',
    '#7c3aed', '#db2777', '#0d9488', '#65a30d', '#ea580c'];

  function toISO(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  // Date('AAAA-MM-DD') é lido como UTC e volta um dia no nosso fuso — monta local.
  function fromISO(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function dataLonga(iso) {
    const t = fromISO(iso).toLocaleDateString('pt-BR',
      { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  function corDaUc(uc) {
    const k = ucKey(uc);
    let h = 0;
    for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
    return UC_CORES[h % UC_CORES.length];
  }

  function updateAgendaSelInfo() {
    const el = $('#agenda-selinfo');
    if (agenda.modo === 'ver') {
      el.textContent = 'Clique em um dia para ver ou gerar a aula daquele dia.';
      return;
    }
    const n = agenda.selected.size;
    el.textContent = n
      ? `${n} ${n === 1 ? 'dia selecionado' : 'dias selecionados'}.`
      : 'Nenhum dia selecionado. Clique nos dias (ou arraste) para selecionar.';
  }

  function renderAgenda() {
    const grid = $('#agenda-grid');
    if (!grid) return;
    const ano = agenda.view.getFullYear();
    const mes = agenda.view.getMonth();
    $('#agenda-month').textContent = `${MESES[mes]} de ${ano}`;

    const map = Storage.getAgenda();
    agenda.aulas = Cronograma.mapa();
    const primeiro = new Date(ano, mes, 1);
    const diasNoMes = new Date(ano, mes + 1, 0).getDate();
    const hojeISO = toISO(new Date());

    let html = '';
    // Espaços vazios antes do dia 1 (0 = domingo).
    for (let i = 0; i < primeiro.getDay(); i++) html += '<div class="agenda-empty"></div>';

    for (let dia = 1; dia <= diasNoMes; dia++) {
      const iso = toISO(new Date(ano, mes, dia));
      const uc = map[iso];
      const item = agenda.aulas[iso];
      const sel = agenda.selected.has(iso);
      const hoje = iso === hojeISO;
      const aberto = iso === agenda.detalhe;
      const style = uc ? ` style="--uc-cor:${corDaUc(uc)}"` : '';
      const tema = Cronograma.tema(item);
      html += `<div class="agenda-day${uc ? ' has-uc' : ''}${sel ? ' selected' : ''}${hoje ? ' today' : ''}`
        + `${item ? ' tem-aula' : ''}${aberto ? ' aberto' : ''}"`
        + ` data-date="${iso}"${style}${tema ? ` title="${escapeHtml(tema)}"` : ''}>`
        + `<span class="agenda-daynum">${dia}</span>`
        + (uc ? `<span class="agenda-uctag">${escapeHtml(uc)}</span>` : '')
        + (item ? `<span class="agenda-aula"><b>✓</b> ${escapeHtml(tema)}</span>` : '')
        + '</div>';
    }
    grid.innerHTML = html;

    // Legenda: UCs que aparecem no mês exibido.
    const noMes = new Map();
    Object.entries(map).forEach(([iso, uc]) => {
      if (iso.startsWith(`${ano}-${String(mes + 1).padStart(2, '0')}`)) {
        noMes.set(ucKey(uc), uc);
      }
    });
    const legenda = $('#agenda-legend');
    legenda.innerHTML = noMes.size
      ? [...noMes.values()]
          .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }))
          .map(uc => `<span class="agenda-legenda-item"><span class="dot" style="background:${corDaUc(uc)}"></span>${escapeHtml(uc)}</span>`)
          .join('')
      : '';

    renderAgendaLista(map, ano, mes);
    renderAgendaDetalhe();
    updateAgendaSelInfo();
  }

  /* Lista dos dias com UC no mês exibido (visível só no celular, via CSS). */
  function renderAgendaLista(map, ano, mes) {
    const box = $('#agenda-lista');
    if (agenda.modo !== 'ver') { box.innerHTML = ''; return; }
    const prefixo = `${ano}-${String(mes + 1).padStart(2, '0')}`;
    const dias = Object.keys(map).filter(iso => iso.startsWith(prefixo) && map[iso]).sort();

    if (!dias.length) {
      box.innerHTML = `<h2 class="agenda-lista-titulo">Aulas do mês</h2>
        <p class="agenda-lista-vazio">Nenhum dia marcado neste mês. Use <strong>Marcar UCs</strong> para montar o cronograma.</p>`;
      return;
    }

    box.innerHTML = '<h2 class="agenda-lista-titulo">Aulas do mês</h2>' + dias.map(iso => {
      const d = fromISO(iso);
      const uc = map[iso];
      const item = agenda.aulas[iso];
      const semana = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
      const tema = item
        ? `<span class="agenda-li-tema">${escapeHtml(Cronograma.tema(item))}</span>`
        : '<span class="agenda-li-tema pendente">Aula ainda não gerada</span>';
      return `<button type="button" class="agenda-li${iso === agenda.detalhe ? ' aberto' : ''}"
          data-date="${iso}" style="--uc-cor:${corDaUc(uc)}">
        <span class="agenda-li-data"><b>${d.getDate()}</b><small>${escapeHtml(semana)}</small></span>
        <span class="agenda-li-info">
          <span class="agenda-li-uc">${escapeHtml(uc)}${item ? ` ${ic('check')}` : ''}</span>
          ${tema}
        </span>
        ${ic('chev-right')}
      </button>`;
    }).join('');
  }

  /* ===== Painel do dia: a aula daquela data ===== */
  function renderAgendaDetalhe() {
    const box = $('#agenda-detail');
    const iso = agenda.detalhe;
    if (!iso) { box.hidden = true; box.innerHTML = ''; return; }

    const info = Cronograma.info(iso);
    const uc = info ? info.uc : '';
    box.hidden = false;

    let corpo;
    if (!info) {
      corpo = '<p class="detail-vazio">Nenhuma UC marcada neste dia. Use <strong>Marcar UCs</strong> para marcar.</p>';
    } else {
      const pos = `<p class="detail-pos">Aula ${info.indice + 1} de ${info.total} dias marcados de ${escapeHtml(uc)}</p>`;
      const vizinhas = `
        <div class="detail-vizinhas">
          ${info.anterior ? `<span><b>Antes:</b> ${escapeHtml(Cronograma.tema(info.anterior))}</span>` : ''}
          ${info.proxima ? `<span><b>Depois:</b> ${escapeHtml(Cronograma.tema(info.proxima))}</span>` : ''}
        </div>`;
      corpo = info.aula
        ? `${pos}
           <h3 class="detail-titulo">${escapeHtml(info.aula.titulo)}</h3>
           ${vizinhas}
           <div class="detail-acoes">
             <button type="button" class="btn-primary" data-act="abrir">${ic('book')}Abrir aula</button>
             <button type="button" class="btn-secondary" data-act="gerar">${ic('refresh')}Gerar outra para este dia</button>
           </div>`
        : `${pos}
           <p class="detail-vazio">Nenhuma aula gerada para este dia ainda.</p>
           ${vizinhas}
           <div class="detail-acoes">
             <button type="button" class="btn-primary" data-act="gerar">${ic('sparkles')}Gerar a aula deste dia</button>
           </div>`;
    }

    box.innerHTML = `
      <div class="detail-head">
        <div class="detail-data">
          <strong>${escapeHtml(dataLonga(iso))}</strong>
          ${uc ? `<span class="detail-uc" style="background:${corDaUc(uc)}">${escapeHtml(uc)}</span>` : ''}
        </div>
        <button type="button" class="btn-secondary detail-close" data-act="fechar" aria-label="Fechar">✕</button>
      </div>
      ${corpo}`;

    box.querySelectorAll('[data-act]').forEach(b => {
      b.addEventListener('click', () => acaoDetalhe(b.dataset.act, iso, info));
    });
  }

  function acaoDetalhe(act, iso, info) {
    if (act === 'fechar') {
      agenda.detalhe = null;
      renderAgenda();
      return;
    }
    if (!info) return;
    if (act === 'abrir' && info.aula) { openHistoryItem(info.aula); return; }
    if (act === 'gerar') prefillAulaDaAgenda(iso, info);
  }

  /* Leva o dia da Agenda para o formulário: UC, data e as aulas vizinhas já
     geradas — é o que garante a progressão entre uma aula e a seguinte. */
  function prefillAulaDaAgenda(iso, info) {
    // Dia que já tem aula: reabre o pedido daquela aula para ajustar e refazer.
    // Dia vazio: só herda o que se repete na UC — o pedido é novo, do professor.
    const base = info.aula ? (info.aula.params || {}) : herdarDaUc(info.uc);
    preencherFormAula({ ...base, uc: info.uc }, {
      data: iso,
      aulaanterior: Cronograma.tema(info.anterior),
      aulaproxima: Cronograma.tema(info.proxima),
      // Não só o título: os títulos de seção dizem o que a aula vizinha cobriu.
      aulaanteriortopicos: Cronograma.topicos(info.anterior).join(' · '),
      aulaproximatopicos: Cronograma.topicos(info.proxima).join(' · '),
      abertura: info.indice === 0 ? 'sim' : '',
    });
  }

  /* Duração e adaptações vêm da última aula gerada para a UC — redigitar isso
     a cada dia do calendário é trabalho à toa. O pedido não se herda: cada
     aula ensina outra coisa. */
  function herdarDaUc(uc) {
    const alvo = ucKey(uc);
    const anterior = Storage.getHistory().find(
      i => i.tipo === 'aula' && ucKey(ucOf(i)) === alvo
    );
    if (!anterior) return {};
    const p = anterior.params || {};
    return {
      carga: p.carga || '',
      adaptacoes: Prompts.adaptacoes(p),
      adaptobs: p.adaptobs || '',
    };
  }

  function paintDay(el) {
    const iso = el.dataset.date;
    if (agenda.paintState) agenda.selected.add(iso);
    else agenda.selected.delete(iso);
    el.classList.toggle('selected', agenda.paintState);
  }

  // Seleção por clique/arrasto (delegação no grid).
  (function bindAgenda() {
    const grid = $('#agenda-grid');
    if (!grid) return;

    grid.addEventListener('pointerdown', e => {
      if (agenda.modo !== 'marcar') return;
      const day = e.target.closest('.agenda-day');
      if (!day) return;
      e.preventDefault();
      agenda.painting = true;
      agenda.paintState = !agenda.selected.has(day.dataset.date);
      paintDay(day);
      updateAgendaSelInfo();
    });
    grid.addEventListener('pointerover', e => {
      if (agenda.modo !== 'marcar' || !agenda.painting) return;
      const day = e.target.closest('.agenda-day');
      if (day) { paintDay(day); updateAgendaSelInfo(); }
    });
    document.addEventListener('pointerup', () => { agenda.painting = false; });

    // Modo "ver aulas": clicar em um dia abre o painel com a aula daquela data.
    grid.addEventListener('click', e => {
      if (agenda.modo !== 'ver') return;
      const day = e.target.closest('.agenda-day');
      if (!day) return;
      abrirDiaAgenda(day.dataset.date);
    });

    // Lista do mês (celular): tocar num item abre o mesmo painel do dia.
    $('#agenda-lista').addEventListener('click', e => {
      const li = e.target.closest('.agenda-li');
      if (li) abrirDiaAgenda(li.dataset.date);
    });

    function abrirDiaAgenda(iso) {
      agenda.detalhe = agenda.detalhe === iso ? null : iso;
      renderAgenda();
      if (agenda.detalhe) $('#agenda-detail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    $$('.agenda-modo').forEach(btn => {
      btn.addEventListener('click', () => {
        agenda.modo = btn.dataset.modo;
        $$('.agenda-modo').forEach(b => b.classList.toggle('active', b === btn));
        $('#agenda-apply').hidden = agenda.modo !== 'marcar';
        // Cada modo começa limpo: nada selecionado, nenhum dia aberto.
        agenda.selected.clear();
        agenda.detalhe = null;
        renderAgenda();
      });
    });

    $('#agenda-prev').addEventListener('click', () => {
      agenda.view = new Date(agenda.view.getFullYear(), agenda.view.getMonth() - 1, 1);
      renderAgenda();
    });
    $('#agenda-next').addEventListener('click', () => {
      agenda.view = new Date(agenda.view.getFullYear(), agenda.view.getMonth() + 1, 1);
      renderAgenda();
    });
    $('#agenda-today').addEventListener('click', () => {
      agenda.view = new Date();
      renderAgenda();
    });

    $('#agenda-set').addEventListener('click', () => {
      const uc = $('#agenda-uc').value.trim();
      if (!uc) { $('#agenda-uc').focus(); return; }
      if (!agenda.selected.size) { flash($('#agenda-set'), 'Selecione dias antes'); return; }
      Storage.setAgendaDays([...agenda.selected], uc);
      agenda.selected.clear();
      renderAgenda();
      refreshUcList();
    });

    $('#agenda-clear').addEventListener('click', () => {
      if (!agenda.selected.size) return;
      // Remove a marcação de UC dos dias selecionados e limpa a seleção.
      Storage.setAgendaDays([...agenda.selected], '');
      agenda.selected.clear();
      renderAgenda();
    });
  })();

  /* ===== Referência da UC =====
     A referência é da UC, não da aula: trocar a UC no formulário troca o texto.
     `refCarregada` guarda o que foi posto automaticamente, para não apagar por
     cima do que o professor acabou de digitar. */
  let refCarregada = '';

  function carregarReferencia() {
    const form = $('#form-aula');
    const ta = form.elements.referencia;
    const salva = Storage.getReferencia(form.elements.uc.value);
    if (salva) {
      // A referência salva na UC sempre vence: sem isso, passar pela UC errada
      // ao digitar sobrescreveria a ementa dela com o texto de outra.
      ta.value = salva;
      refCarregada = salva;
      $('#aula-referencia').open = true;
    } else if (ta.value === refCarregada) {
      // O que está na caixa veio da UC anterior, não foi digitado: a UC nova
      // não tem referência, então a caixa esvazia.
      ta.value = '';
      refCarregada = '';
    }
    // Texto digitado e UC nova sem referência: segue como rascunho desta UC.
    atualizarRefStatus();
  }

  function atualizarRefStatus() {
    const form = $('#form-aula');
    const uc = form.elements.uc.value.trim();
    const n = form.elements.referencia.value.trim().length;
    const status = $('#ref-status');
    if (!n) { status.textContent = ''; return; }
    const chars = `${n.toLocaleString('pt-BR')} caracteres`;
    status.textContent = uc
      ? `Vale para todas as aulas de ${uc} · ${chars}`
      : `Sem UC informada: vale só para esta aula · ${chars}`;
  }

  $('#form-aula').elements.referencia.addEventListener('input', atualizarRefStatus);
  $('#ref-limpar').addEventListener('click', () => {
    const form = $('#form-aula');
    form.elements.referencia.value = '';
    refCarregada = '';
    Storage.setReferencia(form.elements.uc.value, '');
    atualizarRefStatus();
  });

  /* ===== Formulário da aula: vínculo com a Agenda ===== */
  function updateAulaHint() {
    const form = $('#form-aula');
    const hint = $('#aula-agenda-hint');
    const iso = form.elements.data.value;

    if (iso) {
      // As aulas vizinhas são campos ocultos: o professor precisa ver que elas
      // estão indo junto, senão o "retomando a aula anterior" parece mágica.
      const ant = form.elements.aulaanterior.value;
      const prox = form.elements.aulaproxima.value;
      const vizinhas = [
        ant ? `⬅️ vem depois de <em>${escapeHtml(ant)}</em>` : '',
        prox ? `➡️ e antes de <em>${escapeHtml(prox)}</em>` : '',
      ].filter(Boolean).join(' ');
      hint.hidden = false;
      hint.innerHTML = `📅 Esta aula fica marcada em <strong>${escapeHtml(dataLonga(iso))}</strong> na Agenda`
        + (vizinhas ? ` — ${vizinhas}` : '') + '. '
        + '<button type="button" class="btn-link" id="aula-desvincular">Desvincular da data</button>';
      $('#aula-desvincular').addEventListener('click', () => {
        form.elements.data.value = '';
        form.elements.aulaanterior.value = '';
        form.elements.aulaproxima.value = '';
        form.elements.aulaanteriortopicos.value = '';
        form.elements.aulaproximatopicos.value = '';
        form.elements.abertura.value = '';
        updateAulaHint();
      });
      return;
    }

    const uc = form.elements.uc.value.trim();
    const dias = uc ? Cronograma.dias(uc).length : 0;
    if (!dias) { hint.hidden = true; hint.innerHTML = ''; return; }
    hint.hidden = false;
    hint.innerHTML = `📅 ${escapeHtml(uc)} tem <strong>${dias}</strong> ${dias === 1 ? 'dia marcado' : 'dias marcados'} na Agenda. `
      + 'Gerando pela <a href="#/agenda">Agenda</a>, cada aula fica presa ao seu dia e já vem com a anterior e a próxima preenchidas.';
  }

  $('#form-aula').elements.uc.addEventListener('input', () => {
    updateAulaHint();
    carregarReferencia();
  });

  /* ===== Configurações ===== */
  function fillProviderFields(provider) {
    const form = $('#form-config');
    const info = Api.PROVIDERS[provider];
    $('#key-hint').innerHTML = info.keyHint;
    form.elements.apiKey.placeholder = info.keyPlaceholder;
    form.elements.apiKey.value = Storage.getApiKey(provider);
    form.elements.model.innerHTML = info.models
      .map(m => `<option value="${m.id}">${m.label}</option>`).join('');
    form.elements.model.value = Storage.getModel(provider);
  }

  function loadConfig() {
    const form = $('#form-config');
    form.elements.nome.value = Storage.getNome();
    form.elements.provider.value = Storage.getProvider();
    fillProviderFields(Storage.getProvider());

    const s = Storage.getStats();
    $('#usage-summary').textContent =
      `Você gerou ${s.count} ${s.count === 1 ? 'material' : 'materiais'} · ~${s.tokens.toLocaleString('pt-BR')} tokens no total.`;
  }

  $('#form-config').elements.provider.addEventListener('change', e => {
    fillProviderFields(e.target.value);
  });

  $('#form-config').addEventListener('submit', e => {
    e.preventDefault();
    const d = formToObj(e.target);
    Storage.setNome(d.nome);
    Storage.setProvider(d.provider);
    Storage.setApiKey(d.apiKey, d.provider);
    Storage.setModel(d.model, d.provider);
    updateKeyStatus();
    const msg = $('#config-saved');
    msg.hidden = false;
    setTimeout(() => { msg.hidden = true; }, 2000);
  });

  /* ===== Backup ===== */
  $('#btn-export').addEventListener('click', () => {
    const data = Storage.exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `professor-plus-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $('#btn-import').addEventListener('click', () => $('#import-file').click());

  $('#import-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const n = Array.isArray(data.history) ? data.history.length : 0;
      if (confirm(`Importar backup com ${n} ${n === 1 ? 'material' : 'materiais'}? Serão mesclados ao histórico atual (sem apagar o que já existe).`)) {
        Storage.importData(data, { merge: true });
        loadConfig();
        alert('✅ Backup importado!');
      }
    } catch (err) {
      alert('⚠️ Não foi possível importar: ' + err.message);
    }
    e.target.value = '';
  });

  $('#btn-clear-history').addEventListener('click', () => {
    const noDrive = Drive.conectado()
      ? ' Com o Google Drive conectado, os arquivos também vão para a lixeira do Drive (e somem dos outros aparelhos).'
      : '';
    if (confirm(`Apagar todo o histórico? Esta ação não pode ser desfeita.${noDrive}`)) {
      Storage.clearHistory();
      renderHistory();
    }
  });

  function updateKeyStatus() {
    // Há dois indicadores: um na sidebar (desktop) e um na barra superior (celular).
    const ok = !!Storage.getApiKey();
    $$('[data-key-status]').forEach(el => {
      el.querySelector('span').textContent = ok ? 'chave configurada' : 'sem chave';
      el.classList.toggle('ok', ok);
    });
    const aviso = $('#aviso-chave');
    if (aviso) aviso.hidden = !!Storage.getApiKey();
  }

  /* ===== Slides: abre o editor/preview (js/slides.js) ===== */

  function togglePresentBtn(tipo) {
    $('#btn-present').hidden = tipo !== 'slides';
    renderBarraResultado(tipo);
  }

  /* ===== Celular: barra de ações e gavetas do Resultado =====
     Os botões da barra só repassam o clique aos botões de verdade do painel
     de ações — nenhuma ação é duplicada. "Ajustar" e "Mais" abrem esse mesmo
     painel como gaveta, cada um mostrando só a sua parte. */
  function renderBarraResultado(tipo) {
    $('#resultado-painel').dataset.tipo = tipo || '';
    const itens = tipo === 'slides'
      ? [['#btn-present', 'present', 'Slides'], ['#btn-edit', 'pencil', 'Editar'], ['#btn-print', 'printer', 'PDF']]
      : [['#btn-edit', 'pencil', 'Editar'], ['#btn-print', 'printer', 'PDF'], ['#btn-word', 'file', 'Word']];
    $('#resultado-barra').innerHTML = itens
      .map(([alvo, icone, rotuloBtn]) => `<button type="button" data-proxy="${alvo}">${ic(icone)}<span>${rotuloBtn}</span></button>`)
      .join('')
      + `<button type="button" data-gaveta="ajuste">${ic('wand')}<span>Ajustar</span></button>`
      + `<button type="button" data-gaveta="mais">${ic('dots')}<span>Mais</span></button>`;
    atualizarBarraEdicao();
  }

  function atualizarBarraEdicao() {
    const b = $('#resultado-barra [data-proxy="#btn-edit"]');
    if (!b) return;
    const editando = $('#result-content').contentEditable === 'true';
    b.innerHTML = editando ? `${ic('check')}<span>Concluir</span>` : `${ic('pencil')}<span>Editar</span>`;
    b.classList.toggle('ativo', editando);
  }

  function abrirGaveta(modo) {
    if (modo === 'ajuste' && $('#ajuste-form').hidden) return;   // gerando: nada a ajustar ainda
    const painel = $('#resultado-painel');
    painel.dataset.gaveta = modo;
    $('#gaveta-titulo').textContent = modo === 'ajuste' ? 'Ajustar com IA' : 'Mais ações';
    $('#gaveta-fundo').hidden = false;
    document.body.classList.add('gaveta-aberta');
    if (modo === 'ajuste') setTimeout(() => $('#ajuste-pedido').focus(), 250);
  }

  function fecharGaveta() {
    const painel = $('#resultado-painel');
    if (!painel || !painel.dataset.gaveta) return;
    delete painel.dataset.gaveta;
    $('#gaveta-fundo').hidden = true;
    document.body.classList.remove('gaveta-aberta');
  }

  $('#resultado-barra').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.gaveta) { abrirGaveta(b.dataset.gaveta); return; }
    const alvo = $(b.dataset.proxy);
    if (alvo) alvo.click();
    atualizarBarraEdicao();
  });
  $('#gaveta-fundo').addEventListener('click', fecharGaveta);
  $('#gaveta-fechar').addEventListener('click', fecharGaveta);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharGaveta(); });

  // Na gaveta "Mais": ação escolhida, a gaveta fecha e o material aparece.
  $('#resultado-painel').addEventListener('click', e => {
    if ($('#resultado-painel').dataset.gaveta !== 'mais') return;
    const b = e.target.closest('.result-actions button, #chain-actions button, #vista-impressao [data-vista], #slides-gerar');
    // Slides abrem antes o painel de opções: esse fica aberto para escolher.
    if (b && b.dataset.target !== 'slides') fecharGaveta();
  });

  $('#btn-voltar').addEventListener('click', () => {
    if (rotaAnterior && rotaAnterior !== 'resultado') history.back();
    else location.hash = '#/historico';
  });

  /* ===== Celular: barra de abas some enquanto digita =====
     Com o teclado aberto, a barra fixa sobe junto e rouba espaço do campo. */
  const CAMPO_DIGITAVEL = 'textarea, [contenteditable="true"], input:not([type="checkbox"]):not([type="radio"]):not([type="color"]):not([type="range"]):not([type="file"]):not([type="button"]):not([type="submit"])';
  document.addEventListener('focusin', e => {
    if (e.target.matches && e.target.matches(CAMPO_DIGITAVEL)) document.body.classList.add('digitando');
  });
  document.addEventListener('focusout', () => {
    // Espera o próximo foco: pular de um campo para outro não pisca a barra.
    setTimeout(() => {
      const ativo = document.activeElement;
      if (!(ativo && ativo.matches && ativo.matches(CAMPO_DIGITAVEL))) document.body.classList.remove('digitando');
    }, 50);
  });

  function abrirSlides() {
    const c = state.current;
    if (!c || !c.conteudo || state.generating) return;
    /* Usa o markdown BRUTO, não o innerText da tela: o editor de slides depende
       dos `---`, dos `- ` e dos `**`, que o innerText perde. Por isso o próprio
       editor tem um campo de texto — o que for ajustado lá volta para cá. */
    Deck.open(c.conteudo, {
      titulo: c.titulo || 'Slides',
      onChange: texto => {
        c.conteudo = texto;
        c.conteudoHtml = null;
        $('#result-content').innerHTML = Seguro.md(texto);
        if (c.id) Storage.updateHistoryItem(c.id, { conteudo: texto, conteudoHtml: null });
      },
    });
  }

  $('#btn-present').addEventListener('click', abrirSlides);

  /* ===== Google Drive ===== */
  const ESTADO_DRIVE = {
    off: { icone: 'cloud-off', chip: '' },
    desconectado: { icone: 'cloud-off', chip: '' },
    reconectar: { icone: 'cloud-off', chip: 'Reconectar' },
    sincronizando: { icone: 'refresh', chip: 'Salvando…' },
    ok: { icone: 'cloud', chip: 'Drive' },
    erro: { icone: 'cloud-off', chip: 'Drive' },
  };

  function renderDrive(est) {
    const info = ESTADO_DRIVE[est.fase] || ESTADO_DRIVE.off;
    // Indicador no topo (celular) e na sidebar: só quando o Drive está em uso.
    $$('[data-drive-chip]').forEach(el => {
      el.hidden = !info.chip;
      el.className = `drive-chip is-${est.fase}`;
      el.title = est.msg || 'Google Drive';
      el.innerHTML = `${ic(info.icone)}<span>${info.chip}</span>`;
    });

    const conectado = Drive.conectado();
    const msg = $('#drive-estado');
    msg.hidden = !est.msg && est.fase !== 'desconectado';
    msg.className = `drive-estado is-${est.fase}`;
    msg.innerHTML = `${ic(info.icone)}<span>${escapeHtml(est.msg || 'Não conectado.')}</span>`;

    const btn = $('#drive-conectar');
    btn.hidden = conectado && est.fase !== 'reconectar';
    btn.querySelector('span').textContent = est.fase === 'reconectar' ? 'Reconectar' : 'Conectar Google Drive';
    $('#drive-sync').hidden = !conectado || est.fase === 'reconectar';
    $('#drive-sync').disabled = est.fase === 'sincronizando';
    $('#drive-sair').hidden = !conectado;
  }

  function carregarDriveConfig() {
    $('#drive-client').value = Drive.getClientId();
    $('#drive-origem').textContent = location.origin;
  }

  // Colou o ID: já carrega o login do Google, para o popup abrir direto no clique.
  $('#drive-client').addEventListener('change', e => Drive.setClientId(e.target.value));

  $('#drive-conectar').addEventListener('click', async () => {
    Drive.setClientId($('#drive-client').value);
    try {
      await Drive.conectar();
    } catch (err) {
      alert('⚠️ ' + err.message);
    }
  });

  $('#drive-sync').addEventListener('click', () => Drive.sincronizar());

  $('#drive-sair').addEventListener('click', () => {
    if (confirm('Desconectar o Google Drive? Os arquivos que já estão no Drive continuam lá; este aparelho só para de sincronizar.')) {
      Drive.desconectar();
    }
  });

  /* ===== Instalar como app (PWA) =====
     Android/Chrome oferece o pedido de instalação (beforeinstallprompt); no
     iPhone não existe pedido automático — o app mostra o caminho no Safari. */
  let pedidoInstalar = null;
  const CHAVE_BANNER = 'profe_banner_instalar_fechado';

  function appInstalado() {
    return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  }

  function ehIos() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function renderInstalar() {
    const instalado = appInstalado();
    $('#instalar-btn').hidden = instalado || !pedidoInstalar;
    $('#instalar-texto').textContent = instalado
      ? 'Você já está usando o Professor+ instalado.'
      : 'Coloque o Professor+ na tela inicial: abre como um app, em tela cheia, e o que já foi gerado continua abrindo mesmo sem internet.';
    $('#instalar-passos').innerHTML = instalado || pedidoInstalar ? '' : ehIos()
      ? 'No iPhone ou iPad: abra este site no <strong>Safari</strong>, toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.'
      : 'No Chrome do celular: toque no menu <strong>⋮</strong> e depois em <strong>Instalar app</strong> (ou <strong>Adicionar à tela inicial</strong>).';

    let fechado = false;
    try { fechado = localStorage.getItem(CHAVE_BANNER) === '1'; } catch { /* sem armazenamento */ }
    const celular = matchMedia('(pointer: coarse)').matches;
    $('#banner-instalar').hidden = instalado || fechado || !celular || !(pedidoInstalar || ehIos());
  }

  async function instalar() {
    if (!pedidoInstalar) { location.hash = '#/config'; return; }   // iPhone: mostra o passo a passo
    pedidoInstalar.prompt();
    await pedidoInstalar.userChoice;
    pedidoInstalar = null;
    renderInstalar();
  }

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();          // guarda o pedido para o botão do app
    pedidoInstalar = e;
    renderInstalar();
  });
  window.addEventListener('appinstalled', () => { pedidoInstalar = null; renderInstalar(); });

  $('#instalar-btn').addEventListener('click', instalar);
  $('#banner-instalar-btn').addEventListener('click', instalar);
  $('#banner-instalar-fechar').addEventListener('click', () => {
    try { localStorage.setItem(CHAVE_BANNER, '1'); } catch { /* sem armazenamento */ }
    renderInstalar();
  });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  /* ===== Init ===== */
  // O histórico vem do IndexedDB (assíncrono): a tela só é desenhada depois.
  setModoForm('aula');
  updateKeyStatus();
  renderInstalar();
  Storage.iniciar().then(() => {
    route();
    carregarDriveConfig();
    Drive.onEstado(renderDrive);
    // Em Ajustes não redesenha: apagaria o que o professor estiver digitando.
    Drive.iniciar({ aoAtualizar: () => { if (!state.generating && rotaAtual() !== 'config') renderView(); } });
  });
})();
