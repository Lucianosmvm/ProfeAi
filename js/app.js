/* Professor+ AI — SPA com roteamento por hash. */
(function () {
  'use strict';

  const $ = sel => document.querySelector(sel);
  const $$ = sel => document.querySelectorAll(sel);

  const state = {
    current: null,      // { tipo, params, conteudo } do resultado em exibição
    generating: false,
  };

  /* ===== Roteamento ===== */
  const routes = ['home', 'plano', 'sequencia', 'atividade', 'prova', 'slides', 'adaptar', 'rubrica', 'historico', 'config', 'resultado'];

  function route() {
    const hash = location.hash.replace('#/', '') || 'home';
    const name = routes.includes(hash) ? hash : 'home';

    $$('.view').forEach(v => v.classList.remove('active'));
    $(`#view-${name}`).classList.add('active');

    $$('.nav-link').forEach(a => {
      a.classList.toggle('active', a.dataset.route === name);
    });

    $('#sidebar').classList.remove('open');

    if (name === 'home') renderHome();
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

    state.current = { tipo, params, conteudo: '' };
    $('#result-title').textContent = Prompts.labels[tipo];
    togglePresentBtn(tipo);
    renderChain(tipo);
    setEditUI(false);
    $('#result-content').innerHTML = '';
    $('#result-status').hidden = false;
    renderUsage(null);
    location.hash = '#/resultado';

    try {
      const prompt = promptText;
      let texto = '';
      for await (const chunk of Api.stream(prompt)) {
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
    } catch (err) {
      $('#result-content').innerHTML =
        `<p>⚠️ ${escapeHtml(Api.friendlyError(err))}</p>`;
    } finally {
      $('#result-status').hidden = true;
      state.generating = false;
    }
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

  ['plano', 'sequencia', 'atividade', 'prova', 'slides', 'adaptar', 'rubrica'].forEach(tipo => {
    $(`#form-${tipo}`).addEventListener('submit', e => {
      e.preventDefault();
      generate(tipo, formToObj(e.target));
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
    return `<div class="history-item" data-id="${item.id}">
      <div class="info">
        <div class="titulo">${escapeHtml(item.titulo)}</div>
        <div class="meta">${Prompts.labels[item.tipo]} · ${data}</div>
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
    if (!list.length) {
      box.innerHTML = '<p class="empty-msg">Nada gerado ainda. Comece por 📚 Plano de Aula ou 📝 Gerar Atividade.</p>';
      return;
    }
    box.innerHTML = list.map(historyItemHtml).join('');
    bindHistoryActions(box);
  }

  function bindHistoryActions(container) {
    container.querySelectorAll('.history-item').forEach(el => {
      const item = Storage.getHistory().find(i => i.id === el.dataset.id);
      if (!item) return;

      el.querySelector('[data-action="open"]').addEventListener('click', () => {
        state.current = { id: item.id, tipo: item.tipo, params: item.params, conteudo: item.conteudo, conteudoHtml: item.conteudoHtml };
        $('#result-title').textContent = Prompts.labels[item.tipo];
        setEditUI(false);
        $('#result-content').innerHTML = item.conteudoHtml || marked.parse(item.conteudo);
        togglePresentBtn(item.tipo);
        renderChain(item.tipo);
        renderUsage(item.usage);
        location.hash = '#/resultado';
      });

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
    const targets = Prompts.chainTargets[tipo] || [];
    const bar = $('#chain-bar');
    const box = $('#chain-actions');
    if (!targets.length) { bar.hidden = true; box.innerHTML = ''; return; }
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
    const srcTipo = state.current.tipo;
    // innerText inclui edições feitas no modo Editar; fallback para o markdown original.
    const srcText = $('#result-content').innerText.trim() || state.current.conteudo;

    // Adaptar precisa escolher a necessidade → abre o formulário já preenchido.
    if (target === 'adaptar') {
      $('#form-adaptar').elements.material.value = srcText;
      location.hash = '#/adaptar';
      return;
    }

    runGeneration(
      target,
      { origem: srcTipo },
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
