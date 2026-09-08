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

  function route() {
    const hash = location.hash.replace('#/', '') || 'aula';
    const name = routes.includes(hash) ? hash : 'aula';

    $$('.view').forEach(v => v.classList.remove('active'));
    $(`#view-${name}`).classList.add('active');

    $$('.nav-link').forEach(a => {
      a.classList.toggle('active', a.dataset.route === name);
    });

    $('#sidebar').classList.remove('open');

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
    $('#greeting').textContent = nome ? `👋 ${saudacao}, ${nome}!` : '📚 Gerar Aula';

    $('#aviso-chave').hidden = !!Storage.getApiKey();
    updateAulaHint();

    const recent = Storage.getHistory().slice(0, 3);
    const box = $('#home-recent');
    if (!recent.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<h2>Recentes</h2>' + recent.map(historyItemHtml).join('');
    bindHistoryActions(box);
  }

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
        $('#result-content').innerHTML = marked.parse(texto);
      }
      const usage = Api.lastUsage;
      const id = Date.now().toString(36);
      state.current.conteudo = texto;
      state.current.id = id;
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
      if (Api.truncou()) avisarTruncado();
    } catch (err) {
      mostrarErro(err, texto);
    } finally {
      $('#result-status').hidden = true;
      state.generating = false;
    }
  }

  /* Texto do indicador de progresso (fica ao lado do spinner). */
  function setStatus(msg) {
    $('#result-status').innerHTML = `<span class="spinner"></span> ${escapeHtml(msg)}`;
  }

  /* Prepara a tela de Resultado para uma geração nova. */
  function abrirResultado(tipo, params, titulo) {
    state.current = { tipo, params, titulo, conteudo: '' };
    $('#result-title').textContent = titulo || Prompts.labels[tipo] || 'Resultado';
    togglePresentBtn(tipo);
    renderChain(tipo);
    setEditUI(false);
    $('#result-content').innerHTML = '';
    $('#result-status').hidden = false;
    setStatus('Gerando…');
    renderUsage(null);
    location.hash = '#/resultado';
  }

  /* Avisa que a IA parou no limite de tamanho e oferece a retomada.
     Sem isso, um material cortado no meio parece completo. */
  function avisarTruncado() {
    const aviso = document.createElement('div');
    aviso.className = 'aviso-truncado no-print';
    aviso.innerHTML = '<p>⚠️ A IA parou no limite de tamanho da resposta — o material está incompleto.</p>'
      + '<button type="button" class="btn-primary" id="btn-continuar">▶️ Continuar de onde parou</button>';
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
        $('#result-content').innerHTML = marked.parse(texto + parcial);
      }
      texto = texto + parcial;
      state.current.conteudo = texto;
      Storage.addUsage(Api.lastUsage?.total);
      renderUsage(Api.lastUsage);
      if (id) Storage.updateHistoryItem(id, { conteudo: texto, conteudoHtml: null });
      if (Api.truncou()) avisarTruncado();
    } catch (err) {
      mostrarErro(err, texto);
    } finally {
      $('#result-status').hidden = true;
      state.generating = false;
    }
  }

  /* Mostra o erro SEM apagar o que já tinha sido gerado. */
  function mostrarErro(err, textoParcial) {
    const msg = `<p class="erro-geracao">⚠️ ${escapeHtml(Api.friendlyError(err))}</p>`;
    $('#result-content').innerHTML = textoParcial
      ? marked.parse(textoParcial) + msg
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

  $('#form-aula').addEventListener('submit', e => {
    e.preventDefault();
    const params = formToObj(e.target);
    // Rótulo curto derivado do pedido: é o que aparece no histórico, na Agenda
    // e nos materiais gerados a partir desta aula.
    params.tema = Prompts.resumoPedido(params.pedido);
    runGeneration('aula', params, Prompts.aula(params), Prompts.titulo.aula(params));
  });

  /* ===== Ações do resultado ===== */

  /* Nome do material atual — usado no arquivo do Word. Itens antigos do
     histórico não têm gerador de título, então cai no título salvo. */
  function tituloAtual() {
    const c = state.current;
    if (!c) return 'documento';
    const fn = Prompts.titulo[c.tipo];
    return (fn && fn(c.params || {})) || c.titulo || 'documento';
  }

  $('#btn-copy').addEventListener('click', async () => {
    if (!state.current?.conteudo) return;
    // innerText reflete edições feitas no modo Editar; sem edição, é o markdown renderizado.
    const texto = $('#result-content').innerText.trim() || state.current.conteudo;
    await navigator.clipboard.writeText(texto);
    flash($('#btn-copy'), '✅ Copiado!');
  });

  $('#btn-print').addEventListener('click', () => window.print());

  $('#btn-word').addEventListener('click', () => {
    if (!state.current?.conteudo) return;
    // .doc aceita HTML; Word abre normalmente. Lê o DOM p/ incluir edições.
    const corpo = $('#result-content').innerHTML || marked.parse(state.current.conteudo);
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <style>body{font-family:Calibri,Arial,sans-serif;line-height:1.5}
      table{border-collapse:collapse}td,th{border:1px solid #999;padding:6px 10px}</style>
      </head><body>${corpo}</body></html>`;
    const blob = new Blob(['﻿', html], { type: 'application/msword' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = sanitizeFilename(tituloAtual()) + '.doc';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $('#btn-regenerate').addEventListener('click', () => {
    const c = state.current;
    if (!c || state.generating) return;
    if (c.tipo === 'aula') {
      runGeneration('aula', c.params, Prompts.aula(c.params), Prompts.titulo.aula(c.params));
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
    $('#btn-edit').textContent = on ? '✅ Concluir edição' : '✏️ Editar';
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

  function flash(btn, msg) {
    const original = btn.textContent;
    btn.textContent = msg;
    setTimeout(() => { btn.textContent = original; }, 1500);
  }

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
      ? '➡️ Criar a partir desta aula:'
      : '➡️ Criar a partir disto:';
    bar.hidden = false;
    box.innerHTML = targets
      .map(t => `<button class="btn-secondary" data-target="${t}">${Prompts.labels[t]}</button>`)
      .join('');
    box.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => generateChain(b.dataset.target));
    });
  }

  function generateChain(target) {
    if (!state.current?.conteudo || state.generating) return;
    const src = state.current;
    const p = src.params || {};
    // innerText inclui edições feitas no modo Editar; fallback para o markdown original.
    const srcText = $('#result-content').innerText.trim() || src.conteudo;

    // A adaptação inclusiva pedida na aula segue para o material derivado.
    const params = {
      uc: p.uc || '',
      tema: p.tema || '',
      disciplina: p.disciplina || '',
      adaptacoes: Prompts.adaptacoes(p),
      adaptobs: p.adaptobs || '',
      origem: src.tipo,
      origemId: src.id || '',
    };
    runGeneration(
      target,
      params,
      Prompts.chain(target, src.tipo, srcText, params),
      Prompts.titulo[target](params),
    );
  }

  /* ===== Histórico ===== */
  // Só a Aula volta para o formulário: os demais materiais nascem de uma aula.
  function podeDuplicar(item) { return item.tipo === 'aula' || item.tipo === 'plano'; }

  function historyItemHtml(item) {
    const data = new Date(item.data).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
    const uc = ucOf(item);
    const ucTag = uc ? `📦 ${escapeHtml(uc)} · ` : '';
    const label = Prompts.labels[item.tipo] || item.tipo;
    return `<div class="history-item" data-id="${item.id}">
      <div class="info">
        <div class="titulo">${escapeHtml(item.titulo)}</div>
        <div class="meta">${ucTag}${label} · ${data}</div>
      </div>
      <div class="actions">
        <button class="btn-secondary" data-action="open">Abrir</button>
        ${podeDuplicar(item) ? '<button class="btn-secondary" data-action="dup">Duplicar</button>' : ''}
        <button class="btn-danger" data-action="del">Excluir</button>
      </div>
    </div>`;
  }

  function renderHistory() {
    const list = Storage.getHistory();
    const box = $('#history-list');
    const controls = $('#history-controls');

    if (!list.length) {
      controls.innerHTML = '';
      box.innerHTML = '<p class="empty-msg">Nada gerado ainda. Comece por 📚 Gerar Aula.</p>';
      return;
    }

    // Agrupa por UC preservando a ordem (histórico já vem do mais novo p/ o mais antigo).
    const groups = new Map(); // chave -> { label, items: [] }
    list.forEach(item => {
      const raw = ucOf(item);
      const k = ucKey(raw);
      if (!groups.has(k)) groups.set(k, { label: raw || 'Sem UC', items: [] });
      groups.get(k).items.push(item);
    });

    // Ordena os grupos: UCs nomeadas por ordem natural, "Sem UC" por último.
    const keys = [...groups.keys()].sort((a, b) => {
      if (a === '__none__') return 1;
      if (b === '__none__') return -1;
      return groups.get(a).label.localeCompare(
        groups.get(b).label, 'pt-BR', { numeric: true, sensitivity: 'base' });
    });

    // Filtro (dropdown). Se a UC filtrada sumiu, volta p/ "todas".
    if (historyFilter !== 'all' && !groups.has(historyFilter)) historyFilter = 'all';
    controls.innerHTML =
      '<label class="uc-filter">Ver UC: ' +
      '<select id="uc-filter">' +
      `<option value="all"${historyFilter === 'all' ? ' selected' : ''}>Todas (${list.length})</option>` +
      keys.map(k => {
        const g = groups.get(k);
        const sel = historyFilter === k ? ' selected' : '';
        return `<option value="${escapeHtml(k)}"${sel}>${escapeHtml(g.label)} (${g.items.length})</option>`;
      }).join('') +
      '</select></label>';
    $('#uc-filter').addEventListener('change', e => {
      historyFilter = e.target.value;
      renderHistory();
    });

    const visible = historyFilter === 'all' ? keys : [historyFilter];
    box.innerHTML = visible.map(k => {
      const g = groups.get(k);
      const badge = k === '__none__' ? '📁 Sem UC' : `📦 ${escapeHtml(g.label)}`;
      return `<div class="uc-group">
        <h2 class="uc-group-title">${badge} <span class="uc-count">${g.items.length}</span></h2>
        ${g.items.map(historyItemHtml).join('')}
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
    $('#result-title').textContent = item.titulo || Prompts.labels[item.tipo] || 'Resultado';
    setEditUI(false);
    $('#result-content').innerHTML = item.conteudoHtml || marked.parse(item.conteudo);
    togglePresentBtn(item.tipo);
    renderChain(item.tipo);
    renderUsage(item.usage);
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
  function preencherFormAula(params, { data = '', aulaanterior = '', aulaproxima = '', abertura = '' } = {}) {
    const form = $('#form-aula');
    form.elements.uc.value = params.uc || '';
    form.elements.carga.value = params.carga || '';
    form.elements.pedido.value = pedidoDoItem(params);
    form.elements.adaptobs.value = params.adaptobs || '';
    form.elements.aulaanterior.value = aulaanterior;
    form.elements.aulaproxima.value = aulaproxima;
    form.elements.abertura.value = abertura;

    const marcadas = Prompts.adaptacoes(params);
    form.querySelectorAll('input[name="adaptacoes"]').forEach(c => {
      c.checked = marcadas.includes(c.value);
    });
    $('#aula-adaptacao').open = marcadas.length > 0 || !!params.adaptobs;

    form.elements.data.value = data;
    location.hash = '#/aula';
    updateAulaHint();
  }

  function bindHistoryActions(container) {
    container.querySelectorAll('.history-item').forEach(el => {
      const item = Storage.getHistory().find(i => i.id === el.dataset.id);
      if (!item) return;

      el.querySelector('[data-action="open"]').addEventListener('click', () => openHistoryItem(item));

      const dup = el.querySelector('[data-action="dup"]');
      // Duplicar reabre o formulário com os campos preenchidos, mas SEM a data:
      // a cópia é para outra turma/dia, não para sobrescrever a aula daquele dia.
      if (dup) dup.addEventListener('click', () => preencherFormAula(item.params || {}));

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

    renderAgendaDetalhe();
    updateAgendaSelInfo();
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
      corpo = '<p class="detail-vazio">Nenhuma UC marcada neste dia. Use <strong>✏️ Marcar UCs</strong> para marcar.</p>';
    } else {
      const pos = `<p class="detail-pos">Aula ${info.indice + 1} de ${info.total} dias marcados de ${escapeHtml(uc)}</p>`;
      const vizinhas = `
        <div class="detail-vizinhas">
          ${info.anterior ? `<span>⬅️ Antes: ${escapeHtml(Cronograma.tema(info.anterior))}</span>` : ''}
          ${info.proxima ? `<span>➡️ Depois: ${escapeHtml(Cronograma.tema(info.proxima))}</span>` : ''}
        </div>`;
      corpo = info.aula
        ? `${pos}
           <h3 class="detail-titulo">${escapeHtml(info.aula.titulo)}</h3>
           ${vizinhas}
           <div class="detail-acoes">
             <button type="button" class="btn-primary" data-act="abrir">📂 Abrir aula</button>
             <button type="button" class="btn-secondary" data-act="gerar">🔄 Gerar outra para este dia</button>
           </div>`
        : `${pos}
           <p class="detail-vazio">Nenhuma aula gerada para este dia ainda.</p>
           ${vizinhas}
           <div class="detail-acoes">
             <button type="button" class="btn-primary" data-act="gerar">📚 Gerar a aula deste dia</button>
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
      agenda.detalhe = agenda.detalhe === day.dataset.date ? null : day.dataset.date;
      renderAgenda();
      if (agenda.detalhe) $('#agenda-detail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

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
      if (!agenda.selected.size) { flash($('#agenda-set'), '⚠️ Selecione dias'); return; }
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

  $('#form-aula').elements.uc.addEventListener('input', updateAulaHint);

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
    if (confirm('Apagar todo o histórico? Esta ação não pode ser desfeita.')) {
      Storage.clearHistory();
      renderHistory();
    }
  });

  function updateKeyStatus() {
    const el = $('#key-status');
    if (Storage.getApiKey()) {
      el.textContent = '🔑 chave configurada';
      el.classList.add('ok');
    } else {
      el.textContent = '🔑 sem chave';
      el.classList.remove('ok');
    }
    const aviso = $('#aviso-chave');
    if (aviso) aviso.hidden = !!Storage.getApiKey();
  }

  /* ===== Slides: abre o editor/preview (js/slides.js) ===== */

  function togglePresentBtn(tipo) {
    $('#btn-present').hidden = tipo !== 'slides';
  }

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
        $('#result-content').innerHTML = marked.parse(texto);
        if (c.id) Storage.updateHistoryItem(c.id, { conteudo: texto, conteudoHtml: null });
      },
    });
  }

  $('#btn-present').addEventListener('click', abrirSlides);

  /* ===== Menu mobile ===== */
  $('#menu-toggle').addEventListener('click', () => {
    $('#sidebar').classList.toggle('open');
  });

  /* ===== Init ===== */
  updateKeyStatus();
  route();
})();
