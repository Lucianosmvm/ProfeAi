/* Professor+ AI — SPA com roteamento por hash. */
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
    // E as UCs com descritivo do PDT guardado.
    Object.values(Storage.getUcs()).forEach(u => {
      const raw = (u.rotulo || '').trim();
      if (!raw) return;
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
  const routes = ['home', 'curso', 'plano', 'situacao', 'atividade', 'prova', 'slides', 'adaptar', 'rubrica', 'agenda', 'historico', 'config', 'resultado'];

  function route() {
    const hash = location.hash.replace('#/', '') || 'home';
    const name = routes.includes(hash) ? hash : 'home';

    $$('.view').forEach(v => v.classList.remove('active'));
    $(`#view-${name}`).classList.add('active');

    $$('.nav-link').forEach(a => {
      a.classList.toggle('active', a.dataset.route === name);
    });

    $('#sidebar').classList.remove('open');

    refreshUcList();
    if (name === 'home') renderHome();
    if (name === 'curso') { updateCursoAgendaHint(); restaurarUcNoCurso(); }
    if (UC_DESTINOS[name]) atualizarUcHint(name);
    if (name === 'agenda') renderAgenda();
    if (name === 'historico') renderHistory();
    if (name === 'config') loadConfig();
  }

  window.addEventListener('hashchange', route);

  /* ===== Home ===== */
  function renderHome() {
    const nome = Storage.getNome();
    const hora = new Date().getHours();
    const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
    $('#greeting').textContent = `👋 ${saudacao}, ${nome ? nome : 'Professor'}!`;

    const recent = Storage.getHistory().slice(0, 3);
    const box = $('#home-recent');
    if (!recent.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<h2>Recentes</h2>' + recent.map(historyItemHtml).join('');
    bindHistoryActions(box);
  }

  /* ===== Geração ===== */
  async function generate(tipo, params) {
    return runGeneration(tipo, params, Prompts[tipo](params), Prompts.titulo[tipo](params));
  }

  async function runGeneration(tipo, params, promptText, titulo) {
    if (state.generating) return;
    state.generating = true;
    abrirResultado(tipo, params);

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
  function abrirResultado(tipo, params) {
    state.current = { tipo, params, conteudo: '' };
    restoreResultUI(tipo);
    $('#result-title').textContent = Prompts.labels[tipo];
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
    const { tipo, params, id } = state.current;
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

  /* Plano de Curso longo: gerado em lotes de aulas, emendando um no outro.
     Numa chamada só, um curso de 32 aulas estoura o limite de saída do modelo
     e volta cortado (parava lá pela aula 18). */
  const CURSO_LOTE = 8;

  async function generateCurso(params) {
    const total = Number(params.aulas) || 0;
    if (total <= CURSO_LOTE) return generate('curso', params);
    if (state.generating) return;

    state.generating = true;
    abrirResultado('curso', params);

    let texto = '';
    let tokens = 0;
    try {
      for (let de = 1; de <= total; de += CURSO_LOTE) {
        const ate = Math.min(de + CURSO_LOTE - 1, total);
        setStatus(`Gerando aulas ${de} a ${ate} de ${total}…`);

        const prompt = de === 1
          ? Prompts.curso({ ...params, ate })
          : Prompts.cursoContinua(params, texto, de, ate);

        let parcial = '';
        for await (const chunk of Api.stream(prompt)) {
          parcial += chunk;
          $('#result-content').innerHTML = marked.parse(texto + parcial);
        }
        texto += (texto ? '\n\n' : '') + parcial.trim();
        state.current.conteudo = texto;
        tokens += Api.lastUsage?.total || 0;
      }

      const id = Date.now().toString(36);
      state.current.id = id;
      const usage = { total: tokens };
      Storage.addUsage(tokens);
      renderUsage(usage);
      Storage.addHistoryItem({
        id,
        tipo: 'curso',
        titulo: Prompts.titulo.curso(params),
        data: new Date().toISOString(),
        params,
        conteudo: texto,
        usage,
      });
      $('#result-content').innerHTML = marked.parse(texto);
      avisarAulasFaltando(texto, total);
    } catch (err) {
      mostrarErro(err, texto);
    } finally {
      $('#result-status').hidden = true;
      state.generating = false;
      refreshUcList();
    }
  }

  /* Confere se saíram todas as aulas pedidas — o professor precisa saber
     antes de montar a Agenda em cima de um plano incompleto. */
  function avisarAulasFaltando(texto, total) {
    const geradas = Prompts.parseAulas(texto).length;
    if (geradas >= total) return;
    const aviso = document.createElement('div');
    aviso.className = 'aviso-truncado no-print';
    aviso.innerHTML = `<p>⚠️ Saíram ${geradas} das ${total} aulas pedidas. `
      + 'Use <strong>🔄 Gerar novamente</strong> ou continue a partir daqui.</p>'
      + '<button type="button" class="btn-primary" id="btn-continuar">▶️ Continuar de onde parou</button>';
    $('#result-content').appendChild(aviso);
    $('#btn-continuar').addEventListener('click', continuarGeracao);
  }

  function formToObj(form) {
    const data = {};
    new FormData(form).forEach((v, k) => { data[k] = v.toString().trim(); });
    // checkboxes desmarcados não entram no FormData
    form.querySelectorAll('input[type="checkbox"]').forEach(c => {
      data[c.name] = c.checked;
    });
    return data;
  }

  ['curso', 'plano', 'situacao', 'atividade', 'prova', 'slides', 'adaptar', 'rubrica'].forEach(tipo => {
    $(`#form-${tipo}`).addEventListener('submit', e => {
      e.preventDefault();
      const params = formToObj(e.target);
      // Curso longo não cabe numa resposta só: vai em lotes de aulas.
      if (tipo === 'curso') { guardarUcDoCurso(params); generateCurso(params); }
      else generate(tipo, params);
    });
  });

  /* ===== Ações do resultado ===== */
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
    a.download = sanitizeFilename(state.current ? Prompts.titulo[state.current.tipo](state.current.params) : 'documento') + '.doc';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $('#btn-regenerate').addEventListener('click', () => {
    if (state.current?.tipo === 'curso' && state.current.params) {
      generateCurso(state.current.params);
      return;
    }
    if (!state.current || state.generating) return;
    generate(state.current.tipo, state.current.params);
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
    return s.replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  /* ===== Histórico ===== */
  function historyItemHtml(item) {
    const data = new Date(item.data).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
    const uc = ucOf(item);
    const ucTag = uc ? `📦 ${escapeHtml(uc)} · ` : '';
    return `<div class="history-item" data-id="${item.id}">
      <div class="info">
        <div class="titulo">${escapeHtml(item.titulo)}</div>
        <div class="meta">${ucTag}${Prompts.labels[item.tipo]} · ${data}</div>
      </div>
      <div class="actions">
        <button class="btn-secondary" data-action="open">Abrir</button>
        <button class="btn-secondary" data-action="dup">Duplicar</button>
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
      box.innerHTML = '<p class="empty-msg">Nada gerado ainda. Comece por 📚 Plano de Aula ou 📝 Gerar Atividade.</p>';
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
    state.current = { id: item.id, tipo: item.tipo, params: item.params, conteudo: item.conteudo, conteudoHtml: item.conteudoHtml };
    restoreResultUI(item.tipo);
    $('#result-title').textContent = Prompts.labels[item.tipo];
    setEditUI(false);
    $('#result-content').innerHTML = item.conteudoHtml || marked.parse(item.conteudo);
    togglePresentBtn(item.tipo);
    renderChain(item.tipo);
    renderUsage(item.usage);
    location.hash = '#/resultado';
  }

  function bindHistoryActions(container) {
    container.querySelectorAll('.history-item').forEach(el => {
      const item = Storage.getHistory().find(i => i.id === el.dataset.id);
      if (!item) return;

      el.querySelector('[data-action="open"]').addEventListener('click', () => openHistoryItem(item));

      el.querySelector('[data-action="dup"]').addEventListener('click', () => {
        // reabre o formulário do tipo com os campos preenchidos para adaptar
        const form = $(`#form-${item.tipo}`);
        Object.entries(item.params).forEach(([k, v]) => {
          const field = form.elements[k];
          if (!field) return;
          if (field.type === 'checkbox') field.checked = !!v;
          else field.value = v;
        });
        location.hash = `#/${item.tipo}`;
      });

      el.querySelector('[data-action="del"]').addEventListener('click', () => {
        Storage.removeHistoryItem(item.id);
        renderHistory();
        renderHome();
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
    crono: {},                 // Cronograma.mapa() do render atual
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

  function rotuloAula(a) { return a ? `AULA ${a.numero} — ${a.titulo}` : ''; }

  function corDaUc(uc) {
    const k = ucKey(uc);
    let h = 0;
    for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
    return UC_CORES[h % UC_CORES.length];
  }

  function updateAgendaSelInfo() {
    const el = $('#agenda-selinfo');
    if (agenda.modo === 'ver') {
      el.textContent = 'Clique em um dia para ver a aula daquele dia.';
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
    agenda.crono = Cronograma.mapa();
    const primeiro = new Date(ano, mes, 1);
    const diasNoMes = new Date(ano, mes + 1, 0).getDate();
    const hojeISO = toISO(new Date());

    let html = '';
    // Espaços vazios antes do dia 1 (0 = domingo).
    for (let i = 0; i < primeiro.getDay(); i++) html += '<div class="agenda-empty"></div>';

    for (let dia = 1; dia <= diasNoMes; dia++) {
      const iso = toISO(new Date(ano, mes, dia));
      const uc = map[iso];
      const info = agenda.crono[iso];
      const sel = agenda.selected.has(iso);
      const hoje = iso === hojeISO;
      const aberto = iso === agenda.detalhe;
      const style = uc ? ` style="--uc-cor:${corDaUc(uc)}"` : '';
      const rotulo = info ? rotuloAula(info.aula) : '';
      html += `<div class="agenda-day${uc ? ' has-uc' : ''}${sel ? ' selected' : ''}${hoje ? ' today' : ''}`
        + `${info ? ' tem-aula' : ''}${aberto ? ' aberto' : ''}"`
        + ` data-date="${iso}"${style}${rotulo ? ` title="${escapeHtml(rotulo)}"` : ''}>`
        + `<span class="agenda-daynum">${dia}</span>`
        + (uc ? `<span class="agenda-uctag">${escapeHtml(uc)}</span>` : '')
        + (info
          ? `<span class="agenda-aula"><b>A${escapeHtml(info.aula.numero)}</b> ${escapeHtml(info.aula.titulo)}</span>`
          : '')
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

  /* ===== Painel do dia: mostra a aula que cai naquela data ===== */
  function renderAgendaDetalhe() {
    const box = $('#agenda-detail');
    const iso = agenda.detalhe;
    if (!iso) { box.hidden = true; box.innerHTML = ''; return; }

    const uc = Storage.getAgenda()[iso] || '';
    const info = agenda.crono[iso];
    box.hidden = false;

    let corpo;
    if (!uc) {
      corpo = '<p class="detail-vazio">Nenhuma UC marcada neste dia. Use <strong>✏️ Marcar UCs</strong> para marcar.</p>';
    } else if (info) {
      const a = info.aula;
      const gerada = Cronograma.aulaGerada(uc, a);
      corpo = `
        <p class="detail-pos">Aula ${info.indice + 1} de ${info.total}${a.modulo ? ` · ${escapeHtml(a.modulo)}` : ''}</p>
        <h3 class="detail-titulo">AULA ${escapeHtml(a.numero)} — ${escapeHtml(a.titulo)}</h3>
        <ul class="detail-topicos">${a.bullets
          .map(b => `<li>${escapeHtml(b.replace(/^[-*•]\s*/, ''))}</li>`).join('')}</ul>
        <div class="detail-vizinhas">
          ${info.anterior ? `<span>⬅️ Antes: ${escapeHtml(rotuloAula(info.anterior))}</span>` : ''}
          ${info.proxima ? `<span>➡️ Depois: ${escapeHtml(rotuloAula(info.proxima))}</span>` : ''}
        </div>
        <div class="detail-acoes">
          <button type="button" class="btn-secondary" data-act="copiar">📋 Copiar bloco</button>
          ${gerada
            ? '<button type="button" class="btn-primary" data-act="abrir">📂 Abrir aula gerada</button>'
              + '<button type="button" class="btn-secondary" data-act="gerar">🔄 Gerar de novo</button>'
            : '<button type="button" class="btn-primary" data-act="gerar">📚 Gerar Aula Completa</button>'}
        </div>`;
    } else {
      const r = Cronograma.resumo(uc);
      const pos = Cronograma.dias(uc).indexOf(iso) + 1;
      corpo = r.plano
        ? `<p class="detail-vazio">Este é o ${pos}º dia de ${escapeHtml(uc)} na Agenda, mas o Plano de Curso tem só ${r.aulas} aulas.
             ${r.diasSemAula} ${r.diasSemAula === 1 ? 'dia ficou' : 'dias ficaram'} sem aula — gere um Plano de Curso com ${r.dias} aulas
             ou tire a marcação destes dias.</p>
           <div class="detail-acoes"><button type="button" class="btn-secondary" data-act="ir-curso">📋 Ir para Plano de Curso</button></div>`
        : `<p class="detail-vazio">Ainda não há Plano de Curso para <strong>${escapeHtml(uc)}</strong>.
             Gere um usando esse mesmo código de UC e as aulas aparecem aqui sozinhas, uma por dia marcado.</p>
           <div class="detail-acoes"><button type="button" class="btn-secondary" data-act="ir-curso">📋 Ir para Plano de Curso</button></div>`;
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
      b.addEventListener('click', () => acaoDetalhe(b.dataset.act, iso, uc, info, b));
    });
  }

  async function acaoDetalhe(act, iso, uc, info, btn) {
    if (act === 'fechar') {
      agenda.detalhe = null;
      renderAgenda();
      return;
    }
    if (act === 'ir-curso') {
      $('#form-curso').elements.uc.value = uc;
      updateCursoAgendaHint();
      location.hash = '#/curso';
      return;
    }
    if (!info) return;

    if (act === 'copiar') {
      try {
        await navigator.clipboard.writeText(info.aula.blockText);
        flash(btn, '✅ Copiado!');
      } catch {
        flash(btn, '⚠️ Não foi possível copiar');
      }
      return;
    }
    if (act === 'abrir') {
      const item = Cronograma.aulaGerada(uc, info.aula);
      if (item) openHistoryItem(item);
      return;
    }
    if (act === 'gerar') prefillPlanoDaAgenda(uc, info);
  }

  /* Leva o bloco da aula (e as aulas vizinhas) para o formulário de Aula Completa. */
  function prefillPlanoDaAgenda(uc, info) {
    const form = $('#form-plano');
    const p = info.plano.params || {};
    form.elements.uc.value = uc;
    form.elements.basecurso.value = info.aula.blockText;
    if (p.unidade) form.elements.disciplina.value = p.unidade;
    if (p.duracao) form.elements.carga.value = p.duracao;
    form.elements.tipoaula.value = info.indice === 0 ? 'Abertura de unidade' : 'Conteúdo novo';
    form.elements.aulaanterior.value = rotuloAula(info.anterior);
    form.elements.aulaproxima.value = rotuloAula(info.proxima);
    location.hash = '#/plano';
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

  /* ===== Plano de Curso: nº de aulas a partir da Agenda ===== */
  function updateCursoAgendaHint() {
    const form = $('#form-curso');
    const hint = $('#curso-agenda-hint');
    if (!form || !hint) return;
    const uc = form.elements.uc.value.trim();
    const dias = uc ? Cronograma.dias(uc).length : 0;
    if (!dias) { hint.hidden = true; hint.innerHTML = ''; return; }

    hint.hidden = false;
    const igual = Number(form.elements.aulas.value) === dias;
    hint.innerHTML = `📅 Você marcou <strong>${dias}</strong> ${dias === 1 ? 'dia' : 'dias'} de `
      + `${escapeHtml(uc)} na Agenda.`
      + (igual ? ' O nº de aulas bate — cada aula cai em um dia.'
               : ` <button type="button" class="btn-link" id="curso-usar-dias">Usar ${dias} aulas</button>`);
    const btn = $('#curso-usar-dias');
    if (btn) btn.addEventListener('click', () => {
      form.elements.aulas.value = dias;
      updateCursoAgendaHint();
    });
  }

  $('#form-curso').elements.uc.addEventListener('input', updateCursoAgendaHint);
  $('#form-curso').elements.aulas.addEventListener('input', updateCursoAgendaHint);

  /* ===== Plano de Curso: cabeçalho lido do descritivo colado =====
     O bloco que o professor cola do PDT quase sempre já traz o nome da UC, a
     carga horária e o nº de aulas. Redigitar o que acabou de ser colado é
     trabalho à toa — então a gente lê de lá e só pede confirmação. */

  // Só mexe em campo vazio; 'aulas' tem valor padrão, conta como vazio se intocado.
  function campoVago(el) {
    return el.name === 'aulas' ? el.value === el.defaultValue : !el.value.trim();
  }

  /* "2h30", "2,5 h" e "2:30" viram horas decimais — e voltam formatados. */
  function horasDecimais(num, sep, frac) {
    const h = Number(num);
    if (frac === undefined) return h;
    const min = (sep === ',' || sep === '.')
      ? Math.round(Number('0.' + frac) * 60)
      : Number(frac);
    return h + min / 60;
  }

  function formatarDuracao(dec) {
    const h = Math.floor(dec);
    const m = Math.round((dec - h) * 60);
    return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
  }

  function acharUnidade(t) {
    const linhas = t.split('\n').map(l => l.trim()).filter(Boolean);
    for (let i = 0; i < linhas.length; i++) {
      if (!/unidade\s+curricular|^uc\s*\d/i.test(linhas[i])) continue;
      let nome = linhas[i].replace(/^[-•*\s]+/, '').replace(/[:;.\s]+$/, '');
      // "UNIDADE CURRICULAR 10" sozinha na linha: o nome vem na linha de baixo.
      if (/^(unidade\s+curricular|uc)\s*n?[ºo°]?\s*\d*$/i.test(nome) && linhas[i + 1]) {
        nome += ' — ' + linhas[i + 1].replace(/^[-•*\s]+/, '').replace(/[:;.\s]+$/, '');
      }
      if (nome.length <= 160) return nome;
    }
    return '';
  }

  function acharCarga(t) {
    const m = t.match(/carga\s+hor[áa]ria[^\d]{0,30}(\d{1,4})/i);
    return m ? `${m[1]} horas` : '';
  }

  function acharDuracao(t) {
    const m = t.match(/(?:dura[çc][ãa]o|cada\s+aula|por\s+aula|aulas?\s+de)[^\d]{0,20}(\d{1,2})(?:\s*([h:.,])\s*(\d{1,2}))?/i);
    if (!m) return '';
    const dec = horasDecimais(m[1], m[2], m[3]);
    return dec > 0 && dec <= 12 ? formatarDuracao(dec) : '';
  }

  function acharAulas(t, carga, duracao) {
    const m = t.match(/(\d{1,3})\s*aulas\b/i);
    if (m) return m[1];
    // Sem nº explícito: carga total dividida pela duração de cada aula.
    const ch = Number((carga.match(/\d{1,4}/) || [])[0]);
    const dm = duracao.match(/(\d{1,2})(?:\s*([h:.,])\s*(\d{1,2}))?/);
    if (!ch || !dm) return '';
    const dh = horasDecimais(dm[1], dm[2], dm[3]);
    const n = dh > 0 ? Math.floor(ch / dh) : 0;
    return n >= 1 && n <= 200 ? String(n) : '';
  }

  const cursoAuto = { preenchidos: null };

  function autofillCurso() {
    const form = $('#form-curso');
    const hint = $('#curso-autofill-hint');
    const texto = form.elements.descritivo.value;
    if (texto.trim().length < 40) return;

    const carga = acharCarga(texto);
    const duracao = acharDuracao(texto);
    const achados = {
      unidade: acharUnidade(texto),
      carga,
      duracao,
      aulas: acharAulas(texto, carga, duracao),
    };

    const antes = {};
    Object.entries(achados).forEach(([nome, valor]) => {
      const el = form.elements[nome];
      if (!valor || !campoVago(el)) return;
      antes[nome] = el.value;
      el.value = valor;
    });

    const nomes = Object.keys(antes);
    if (!nomes.length) return;
    cursoAuto.preenchidos = antes;
    updateCursoAgendaHint();

    const rotulos = { unidade: 'Unidade Curricular', carga: 'carga horária', duracao: 'duração da aula', aulas: 'nº de aulas' };
    hint.hidden = false;
    hint.innerHTML = `✍️ Preenchi <strong>${nomes.map(n => rotulos[n]).join('</strong>, <strong>')}</strong> `
      + 'a partir do texto colado — confira antes de gerar. '
      + '<button type="button" class="btn-link" id="curso-desfazer">Desfazer</button>';
    $('#curso-desfazer').addEventListener('click', () => {
      Object.entries(cursoAuto.preenchidos || {}).forEach(([nome, valor]) => {
        form.elements[nome].value = valor;
      });
      cursoAuto.preenchidos = null;
      hint.hidden = true;
      updateCursoAgendaHint();
    });
  }

  $('#form-curso').elements.descritivo.addEventListener('input', autofillCurso);

  /* ===== Descritivo do PDT guardado por UC =====
     Colado uma vez no Plano de Curso, volta sozinho nas próximas gerações da
     mesma UC — inclusive nos outros formulários, que só precisam de um clique. */

  // "Unidade Curricular 10 — Desenvolver Banco de Dados" -> "Desenvolver Banco de Dados"
  function nomeCurtoUc(unidade) {
    const t = (unidade || '').trim();
    const m = t.match(/[—–-]\s*(.+)$/);
    const nome = m ? m[1].trim() : t.replace(/^(unidade\s+curricular|uc)\s*n?[ºo°]?\s*\d*\s*[:.]?\s*/i, '').trim();
    return nome || t;
  }

  function guardarUcDoCurso(p) {
    if (!p.uc || !p.descritivo || !p.descritivo.trim()) return;
    Storage.setUc(p.uc, {
      descritivo: p.descritivo,
      unidade: p.unidade,
      carga: p.carga,
      duracao: p.duracao,
      aulas: p.aulas,
    });
  }

  // Data curta ("12/03") para o professor saber de quando é o descritivo salvo.
  function dataCurta(iso) {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }

  /* Plano de Curso: ao digitar uma UC já conhecida, traz o descritivo de volta. */
  function restaurarUcNoCurso() {
    const form = $('#form-curso');
    const hint = $('#curso-uc-hint');
    const salvo = Storage.getUc(form.elements.uc.value);
    if (!salvo || !salvo.descritivo || form.elements.descritivo.value.trim()) {
      hint.hidden = true;
      return;
    }

    const antes = {};
    ['descritivo', 'unidade', 'carga', 'duracao', 'aulas'].forEach(nome => {
      const el = form.elements[nome];
      if (!salvo[nome] || !campoVago(el)) return;
      antes[nome] = el.value;
      el.value = salvo[nome];
    });
    if (!Object.keys(antes).length) { hint.hidden = true; return; }

    updateCursoAgendaHint();
    $('#curso-autofill-hint').hidden = true;
    hint.hidden = false;
    hint.innerHTML = `📦 Descritivo desta UC recuperado${salvo.atualizado ? ` (salvo em ${dataCurta(salvo.atualizado)})` : ''}. `
      + '<button type="button" class="btn-link" id="curso-uc-limpar">Limpar e colar outro</button>';
    $('#curso-uc-limpar').addEventListener('click', () => {
      Object.entries(antes).forEach(([nome, valor]) => { form.elements[nome].value = valor; });
      hint.hidden = true;
      updateCursoAgendaHint();
    });
  }

  /* Demais formulários: campo de texto que aceita o descritivo do PDT.
     Aqui não preenche sozinho — o professor decide, porque esses campos também
     aceitam um recorte menor que o descritivo inteiro. */
  const UC_DESTINOS = {
    plano: { disciplina: true },
    situacao: { disciplina: true, campo: 'competencias' },
    atividade: { disciplina: true },
    prova: { disciplina: true },
    slides: { disciplina: true },
    rubrica: { disciplina: true, campo: 'indicadores' },
  };

  function atualizarUcHint(tipo) {
    const cfg = UC_DESTINOS[tipo];
    const form = $(`#form-${tipo}`);
    const hint = $(`#${tipo}-uc-hint`);
    if (!cfg || !form || !hint) return;

    const salvo = Storage.getUc(form.elements.uc.value);
    if (!salvo || !salvo.descritivo) { hint.hidden = true; return; }

    const nome = nomeCurtoUc(salvo.unidade);
    hint.hidden = false;
    hint.innerHTML = `📦 Descritivo do PDT salvo${nome ? ` — <strong>${escapeHtml(nome)}</strong>` : ''}. `
      + `<button type="button" class="btn-link" id="${tipo}-uc-usar">Usar aqui</button>`;
    $(`#${tipo}-uc-usar`).addEventListener('click', () => {
      if (cfg.disciplina && form.elements.disciplina && !form.elements.disciplina.value.trim()) {
        form.elements.disciplina.value = nome;
      }
      if (cfg.campo && form.elements[cfg.campo]) {
        const el = form.elements[cfg.campo];
        el.value = el.value.trim() ? `${el.value.trim()}\n\n${salvo.descritivo}` : salvo.descritivo;
      }
      hint.hidden = true;
    });
  }

  // Cria o parágrafo de aviso logo abaixo do campo UC de cada formulário.
  Object.keys(UC_DESTINOS).forEach(tipo => {
    const form = $(`#form-${tipo}`);
    if (!form) return;
    const p = document.createElement('p');
    p.className = 'form-hint';
    p.id = `${tipo}-uc-hint`;
    p.hidden = true;
    form.elements.uc.closest('label').after(p);
    form.elements.uc.addEventListener('input', () => atualizarUcHint(tipo));
  });

  $('#form-curso').elements.uc.addEventListener('input', restaurarUcNoCurso);

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

    const perfil = Storage.getPerfil();
    form.elements.perfilNivel.innerHTML = Object.entries(Prompts.NIVEIS)
      .map(([id, n]) => `<option value="${id}">${escapeHtml(n.label)}</option>`).join('');
    form.elements.perfilNivel.value = perfil.nivel;
    form.elements.perfilPublico.value = perfil.publico;
    form.elements.perfilObs.value = perfil.obs;

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
    Storage.setPerfil({ nivel: d.perfilNivel, publico: d.perfilPublico, obs: d.perfilObs });
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
        renderHome();
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
  }

  /* ===== Apresentação (reveal.js) ===== */
  let deck = null;

  function togglePresentBtn(tipo) {
    $('#btn-present').hidden = tipo !== 'slides';
  }

  /* ===== Encadear fluxos ===== */
  function renderChain(tipo) {
    const bar = $('#chain-bar');
    const box = $('#chain-actions');

    // Plano de Curso não usa o encadeamento normal: mostra o botão de gerar
    // todas as Aulas Completas de uma vez, uma para cada bloco "AULA N".
    if (tipo === 'curso') {
      bar.hidden = false;
      $('.chain-label').textContent = '➡️ A partir deste Plano de Curso:';
      box.innerHTML = `<button class="btn-primary" id="btn-gerar-todas-aulas">🚀 Gerar todas as aulas</button>`;
      $('#btn-gerar-todas-aulas').addEventListener('click', generateAllAulas);
      return;
    }
    $('.chain-label').textContent = '➡️ Criar a partir disto:';

    const targets = Prompts.chainTargets[tipo] || [];
    if (!targets.length) { bar.hidden = true; box.innerHTML = ''; return; }
    bar.hidden = false;
    box.innerHTML = targets
      .map(t => `<button class="btn-secondary" data-target="${t}">${Prompts.labels[t]}</button>`)
      .join('');
    box.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => generateChain(b.dataset.target));
    });
  }

  /* ===== Gerar todas as aulas do Plano de Curso, de uma vez ===== */

  // Restaura a tela normal de resultado (some com o painel de lote, se estiver visível).
  function restoreResultUI(tipo) {
    $('#batch-panel').hidden = true;
    $('#result-content').hidden = false;
    $$('.result-actions button').forEach(b => { b.hidden = false; });
    togglePresentBtn(tipo);
  }

  function renderBatchPanel(aulas) {
    restoreResultUI(state.current.tipo);
    $('#chain-bar').hidden = true;
    $('#result-status').hidden = true;
    $('#result-usage').hidden = true;
    $('#result-content').hidden = true;
    $$('.result-actions button').forEach(b => { b.hidden = true; });

    $('#batch-panel').hidden = false;
    $('#btn-batch-cancel').hidden = false;
    $('#btn-batch-cancel').disabled = false;
    $('#btn-batch-cancel').textContent = '✖ Cancelar';
    $('#batch-summary').hidden = true;
    $('#batch-summary').innerHTML = '';
    $('#batch-list').innerHTML = aulas.map((a, i) => `
      <li class="batch-item" data-idx="${i}">
        <span class="batch-status" data-status="pending">⏳</span>
        <span class="batch-titulo">AULA ${escapeHtml(a.numero)} — ${escapeHtml(a.titulo)}</span>
      </li>`).join('');
  }

  function markBatchStatus(i, status, detail) {
    const li = $(`#batch-list li[data-idx="${i}"]`);
    if (!li) return;
    const icones = { pending: '⏳', running: '<span class="spinner"></span>', done: '✅', error: '⚠️', cancelled: '⏹️' };
    const st = li.querySelector('.batch-status');
    st.dataset.status = status;
    st.innerHTML = icones[status] || '';
    li.classList.toggle('batch-error', status === 'error');
    if (status === 'error' && detail) {
      let d = li.querySelector('.batch-detail');
      if (!d) {
        d = document.createElement('span');
        d.className = 'batch-detail';
        li.appendChild(d);
      }
      d.textContent = detail;
    }
  }

  function finishBatchPanel(aulas, okCount, failCount, uc) {
    $('#btn-batch-cancel').hidden = true;
    $('#result-title').textContent = `Aulas geradas (${okCount}/${aulas.length})`;

    const resumo = $('#batch-summary');
    resumo.hidden = false;
    const msgFalha = failCount
      ? ` ${failCount} ${failCount === 1 ? 'falhou' : 'falharam'} — você pode gerá-la(s) manualmente em 📚 Aula Completa, colando o bloco correspondente.`
      : '';
    resumo.innerHTML = `
      <p>✅ ${okCount} de ${aulas.length} aulas geradas com sucesso.${msgFalha}</p>
      <button class="btn-primary" id="btn-batch-historico">📂 Ver no Histórico</button>
      <button class="btn-secondary" id="btn-batch-voltar">⬅️ Voltar ao Plano de Curso</button>
    `;
    $('#btn-batch-historico').addEventListener('click', () => {
      historyFilter = uc ? ucKey(uc) : 'all';
      location.hash = '#/historico';
    });
    $('#btn-batch-voltar').addEventListener('click', () => {
      restoreResultUI(state.current.tipo);
      renderChain(state.current.tipo);
    });
  }

  $('#btn-batch-cancel').addEventListener('click', () => {
    state.batchCancel = true;
    $('#btn-batch-cancel').disabled = true;
    $('#btn-batch-cancel').textContent = 'Cancelando após a aula atual…';
  });

  async function generateAllAulas() {
    if (!state.current?.conteudo || state.generating || state.current.tipo !== 'curso') return;

    // innerText reflete edições feitas no modo Editar; fallback para o markdown original.
    const srcText = $('#result-content').innerText.trim() || state.current.conteudo;
    const aulas = Prompts.parseAulas(srcText);
    if (!aulas.length) {
      alert('Não foi possível identificar as aulas neste Plano de Curso. Verifique se o texto contém blocos "AULA N — Título".');
      return;
    }
    const ok = confirm(
      `Isso vai gerar ${aulas.length} Aulas Completas, uma de cada vez (pode levar vários minutos e consumir tokens da sua chave de API).\n\nDeseja continuar?`
    );
    if (!ok) return;

    const baseParams = state.current.params || {};
    const uc = baseParams.uc || '';
    const disciplina = baseParams.unidade || '';
    const cargaAula = baseParams.duracao || '';

    state.generating = true;
    state.batchCancel = false;
    renderBatchPanel(aulas);

    let okCount = 0;
    let failCount = 0;

    for (let i = 0; i < aulas.length; i++) {
      const a = aulas[i];
      if (state.batchCancel) { markBatchStatus(i, 'cancelled'); continue; }

      markBatchStatus(i, 'running');
      $('#result-title').textContent = `Gerando ${i + 1} de ${aulas.length}: AULA ${a.numero} — ${a.titulo}`;

      const params = {
        uc,
        disciplina,
        carga: cargaAula,
        tipoaula: i === 0 ? 'Abertura de unidade' : 'Conteúdo novo',
        basecurso: a.blockText,
        // Sem os vizinhos o modelo inventa o que veio antes e cada aula sai solta.
        aulaanterior: rotuloAula(aulas[i - 1]),
        aulaproxima: rotuloAula(aulas[i + 1]),
      };
      const titulo = `Plano: AULA ${a.numero} — ${a.titulo}`;

      try {
        let texto = '';
        for await (const chunk of Api.stream(Prompts.plano(params))) {
          texto += chunk;
        }
        // Aula cortada no limite: emenda a continuação antes de salvar.
        let tentativas = 0;
        while (Api.truncou() && tentativas < 2) {
          tentativas++;
          for await (const chunk of Api.stream(Prompts.continuar('plano', texto))) {
            texto += chunk;
          }
        }
        const usage = Api.lastUsage;
        const id = Date.now().toString(36) + '_' + i;
        Storage.addUsage(usage?.total);
        Storage.addHistoryItem({
          id, tipo: 'plano', titulo, data: new Date().toISOString(), params, conteudo: texto, usage,
        });
        okCount++;
        markBatchStatus(i, 'done');
      } catch (err) {
        failCount++;
        markBatchStatus(i, 'error', Api.friendlyError(err));
      }
    }

    state.generating = false;
    refreshUcList();
    finishBatchPanel(aulas, okCount, failCount, uc);
  }

  function generateChain(target) {
    if (!state.current?.conteudo || state.generating) return;
    const srcTipo = state.current.tipo;
    const uc = state.current.params && state.current.params.uc || '';
    // innerText inclui edições feitas no modo Editar; fallback para o markdown original.
    const srcText = $('#result-content').innerText.trim() || state.current.conteudo;

    // Adaptar precisa escolher a necessidade → abre o formulário já preenchido.
    if (target === 'adaptar') {
      $('#form-adaptar').elements.material.value = srcText;
      if (uc) $('#form-adaptar').elements.uc.value = uc;
      location.hash = '#/adaptar';
      return;
    }

    // Slides: abre o formulário para o professor definir o nº de slides antes de gerar.
    if (target === 'slides') {
      const form = $('#form-slides');
      const p = state.current.params || {};
      form.elements.basematerial.value = srcText;
      if (p.disciplina) form.elements.disciplina.value = p.disciplina;
      if (p.tema) form.elements.tema.value = p.tema;
      if (uc) form.elements.uc.value = uc;
      location.hash = '#/slides';
      return;
    }

    runGeneration(
      target,
      { origem: srcTipo, uc },
      Prompts.chain(target, srcTipo, srcText),
      `${Prompts.labels[target]} (de ${Prompts.labels[srcTipo]})`,
    );
  }

  async function present() {
    const md = state.current?.conteudo;
    if (!md) return;

    const overlay = $('#reveal-overlay');
    const revealEl = overlay.querySelector('.reveal');
    // Recria o template a cada apresentação (o plugin markdown consome o textarea no init).
    const slides = revealEl.querySelector('.slides');
    slides.innerHTML =
      '<section data-markdown data-separator="^\\r?\\n---\\r?\\n$" data-separator-notes="^Note:">' +
      '<textarea data-template></textarea></section>';
    slides.querySelector('textarea[data-template]').textContent = md;

    overlay.hidden = false;

    if (deck) { try { deck.destroy(); } catch { /* ignora */ } }
    deck = new Reveal(revealEl, {
      hash: false,      // não mexe na URL da SPA
      keyboard: true,   // setas navegam os slides
      plugins: [RevealMarkdown],
    });
    await deck.initialize();

    if (overlay.requestFullscreen) {
      try { await overlay.requestFullscreen(); } catch { /* usuário pode ter negado */ }
    }
  }

  function closePresent() {
    $('#reveal-overlay').hidden = true;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (deck) { try { deck.destroy(); } catch { /* ignora */ } deck = null; }
  }

  $('#btn-present').addEventListener('click', present);
  $('#btn-close-present').addEventListener('click', closePresent);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#reveal-overlay').hidden) closePresent();
  });
  document.addEventListener('fullscreenchange', () => {
    // Sair do fullscreen (Esc do navegador) também fecha o overlay.
    if (!document.fullscreenElement && !$('#reveal-overlay').hidden) closePresent();
  });

  /* ===== Menu mobile ===== */
  $('#menu-toggle').addEventListener('click', () => {
    $('#sidebar').classList.toggle('open');
  });

  /* ===== Init ===== */
  updateKeyStatus();
  route();
})();
