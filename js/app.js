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
  const routes = ['home', 'plano', 'atividade', 'prova', 'rubrica', 'historico', 'config', 'resultado'];

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
    if (state.generating) return;
    state.generating = true;

    state.current = { tipo, params, conteudo: '' };
    $('#result-title').textContent = Prompts.labels[tipo];
    $('#result-content').innerHTML = '';
    $('#result-status').hidden = false;
    location.hash = '#/resultado';

    try {
      const prompt = Prompts[tipo](params);
      let texto = '';
      for await (const chunk of Api.stream(prompt)) {
        texto += chunk;
        $('#result-content').innerHTML = marked.parse(texto);
      }
      state.current.conteudo = texto;
      Storage.addHistoryItem({
        id: Date.now().toString(36),
        tipo,
        titulo: Prompts.titulo[tipo](params),
        data: new Date().toISOString(),
        params,
        conteudo: texto,
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

  ['plano', 'atividade', 'prova', 'rubrica'].forEach(tipo => {
    $(`#form-${tipo}`).addEventListener('submit', e => {
      e.preventDefault();
      generate(tipo, formToObj(e.target));
    });
  });

  /* ===== Ações do resultado ===== */
  $('#btn-copy').addEventListener('click', async () => {
    if (!state.current?.conteudo) return;
    await navigator.clipboard.writeText(state.current.conteudo);
    flash($('#btn-copy'), '✅ Copiado!');
  });

  $('#btn-print').addEventListener('click', () => window.print());

  $('#btn-word').addEventListener('click', () => {
    if (!state.current?.conteudo) return;
    // .doc aceita HTML; Word abre normalmente
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <style>body{font-family:Calibri,Arial,sans-serif;line-height:1.5}
      table{border-collapse:collapse}td,th{border:1px solid #999;padding:6px 10px}</style>
      </head><body>${marked.parse(state.current.conteudo)}</body></html>`;
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
        state.current = { tipo: item.tipo, params: item.params, conteudo: item.conteudo };
        $('#result-title').textContent = Prompts.labels[item.tipo];
        $('#result-content').innerHTML = marked.parse(item.conteudo);
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

  /* ===== Menu mobile ===== */
  $('#menu-toggle').addEventListener('click', () => {
    $('#sidebar').classList.toggle('open');
  });

  /* ===== Init ===== */
  updateKeyStatus();
  route();
})();
