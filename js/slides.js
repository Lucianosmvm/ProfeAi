/* Editor de Slides — portado do app "Gerador de Slides".

   Recebe o texto dos slides (o mesmo formato que o app original espera),
   mostra a preview slide a slide e exporta em PPTX e PDF.

   Formato de entrada:
     Título do slide
     ---
     Próximo título
     - bullet
     - bullet
     ---
     Título
     Parágrafo com **negrito**

     | col | col |
     | --- | --- |
     | a   | b   |

   Regras: separador de slide numa linha só (`---`, `===` ou `[slide]`); a
   primeira linha do bloco é o título; blocos separados por linha em branco
   viram lista, tabela, bloco de código ou parágrafos. Um bloco só com título
   vira slide de capa (centralizado).

   O que ficou de fora do app original: biblioteca de imagens, imagem de fundo
   e abrir/salvar .txt — no Professor+ o texto vem da aula e fica no histórico. */
window.Deck = (function () {
  'use strict';

  const BASE_W = 900;
  const BASE_H = 506;
  const BAR_COLORS = ['E02020', 'EA5B1F', 'F4A300', 'F7BD12', 'F5D400', 'C6D92E', '9DC23A', '3FA63F'];

  let slides = [];
  let current = 0;
  let onChange = null;      // avisa o app quando o texto é editado aqui dentro
  let titulo = 'Slides';
  let els = null;           // preenchido no primeiro open()
  let imageLibrary = {};    // { id: {dataUrl, w, h} } das imagens usadas neste material
  let base = null;          // base (template) do slide, vinda do Storage

  /* Zonas do slide, em % — as mesmas coordenadas usadas na exportação PPTX.
     São elas que o montador de base desenha por cima, para o professor ver
     onde o título e o conteúdo vão cair antes de escolher fundo e formas. */
  const ZONAS = {
    titulo: { x: 4.5, y: 6, w: 90.75, h: 13.33 },
    conteudo: { x: 4.5, y: 20.67, w: 90.75, h: 74.53 },
    barra: { x: 0, y: 97.86, w: 100, h: 2.14 },
  };

  /* ===================== Parser ===================== */

  function escapeHtml(t) {
    return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function inlineFormat(text) {
    return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }

  /* Caracteres aceitos como "régua" separadora. O ChatGPT renderiza --- (e ***
     e ___) como linha horizontal, então ao copiar da interface o separador some.
     Por isso aceitamos várias formas. */
  const RULE_CHARS = '-*_=—–─═▬';

  /* Marcadores de lista: além de "- ", aparecem "* ", "+ " e bullets unicode.
     "* " não conflita com **negrito**, que nunca tem espaço após o asterisco. */
  const BULLET_RE = /^[-*+•‣◦⁃–—]\s+/;

  /* ---------- Blocos de código ----------
     Retirados do texto ANTES de qualquer outra análise: assim --- , | e * que
     estejam dentro do código não viram separador, tabela ou lista. */
  const FENCE_RE = /^(?:`{3,}|~{3,})\s*[A-Za-z0-9_+#.-]*$/;
  const CODE_TOKEN_RE = /^\u0000CODE(\d+)\u0000$/;

  function extractCodeBlocks(text) {
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const codes = [];
    const out = [];
    let i = 0;
    while (i < lines.length) {
      if (FENCE_RE.test(lines[i].trim())) {
        let j = i + 1;
        while (j < lines.length && !FENCE_RE.test(lines[j].trim())) j++;
        if (j < lines.length) {                    // só trata como código se fechar
          const body = lines.slice(i + 1, j).join('\n').replace(/^\s*\n+|\n+\s*$/g, '');
          if (body.trim()) {
            out.push('', '\u0000CODE' + codes.length + '\u0000', '');
            codes.push(body);
          }
          i = j + 1;
          continue;
        }
      }
      out.push(lines[i]);
      i++;
    }
    return { text: out.join('\n'), codes };
  }

  function codeHtml(code) {
    return `<pre class="slide-code"><code>${escapeHtml(code)}</code></pre>`;
  }

  /* ---------- Imagens ----------
     No texto a imagem é `![id]` (entra no fluxo, entre os parágrafos) ou
     `![id x=35 y=40 w=30 k=ab12]` (solta, arrastável). O `k` é uma marca única
     por inserção: é por ele que o arrasto sabe qual tag reescrever quando a
     mesma imagem aparece duas vezes no mesmo slide. */
  function parseImgTagInner(inner) {
    const m = inner.match(/^([\w-]+)(?:\s+x=(-?[\d.]+)\s+y=(-?[\d.]+)\s+w=(-?[\d.]+)\s+k=([A-Za-z0-9]+))?$/);
    if (!m) return null;
    const [, id, x, y, w, k] = m;
    if (x !== undefined) {
      return { id, positioned: true, x: parseFloat(x), y: parseFloat(y), w: parseFloat(w), k };
    }
    return { id, positioned: false };
  }

  function imgTagHtml(id) {
    const img = imageLibrary[id];
    if (!img) {
      return `<p style="color:#b23b3b;font-style:italic;">[imagem "${escapeHtml(id)}" não encontrada]</p>`;
    }
    return `<img src="${img.dataUrl}" alt="${escapeHtml(id)}" class="slide-img">`;
  }

  /* Ids de imagem citados num texto — usado para carregar do IndexedDB só o
     que este material usa. */
  function idsNoTexto(txt) {
    const ids = [];
    (txt || '').replace(/!\[([\w-]+)(?:\s[^\]]*)?\]/g, (_, id) => { ids.push(id); return ''; });
    return ids;
  }

  /* ---------- Tabelas ----------
     Ao copiar uma tabela renderizada do chat, cada célula cai numa linha própria
     separada por "|" soltos. repairTables() remonta esse formato (e também aceita
     a tabela markdown normal) na forma canônica "| a | b |" por linha. */
  const DELIM_CELL_RE = /^:?-{1,}:?$/;

  function isPipeLine(l) { return l.trim().startsWith('|'); }

  function cellsFromFlat(flat) {
    const inner = flat.trim().replace(/^\|/, '').replace(/\|$/, '');
    const tokens = inner.split('|').map(t => t.trim());
    // largura da tabela = maior sequência de células delimitadoras (--- | --- | ---)
    let n = 0, run = 0;
    tokens.forEach(t => {
      if (DELIM_CELL_RE.test(t)) { run++; if (run > n) n = run; }
      else run = 0;
    });
    if (n < 1) return null;
    const rows = [];
    for (let i = 0; i < tokens.length;) {
      const row = tokens.slice(i, i + n);
      if (row.length < n) break;
      rows.push(row);
      i += n;
      if (tokens[i] === '') i++;          // token vazio = fronteira entre linhas
    }
    const clean = rows.filter(r => !r.every(c => DELIM_CELL_RE.test(c)));
    return clean.length ? clean : null;
  }

  function cellsFromLines(lines) {
    const rows = lines.map(l =>
      l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())
    );
    const clean = rows.filter(r => !r.every(c => DELIM_CELL_RE.test(c)));
    return clean.length ? clean : null;
  }

  function repairTables(text) {
    const lines = text.split('\n');
    const out = [];
    let i = 0;
    const nextNonBlank = k => { while (k < lines.length && !lines[k].trim()) k++; return k; };
    const isProperRow = l => { const t = l.trim(); return t.startsWith('|') && t.endsWith('|') && t.length > 2; };

    while (i < lines.length) {
      if (!isPipeLine(lines[i])) { out.push(lines[i]); i++; continue; }

      let end = i;
      while (end < lines.length && lines[end].trim() && isPipeLine(lines[end])) end++;
      const tight = lines.slice(i, end).map(l => l.trim());
      // tabela markdown bem formada não atravessa linha em branco: assim duas
      // tabelas seguidas continuam sendo duas
      const clean = tight.every(isProperRow);

      let region, consumedEnd;
      if (clean) {
        region = tight;
        consumedEnd = end;
      } else {
        region = [];
        let j = i;
        consumedEnd = i;
        while (j < lines.length) {
          if (!lines[j].trim()) { j++; continue; }
          if (isPipeLine(lines[j])) { region.push(lines[j].trim()); j++; consumedEnd = j; continue; }
          const k = nextNonBlank(j + 1);
          if (k < lines.length && isPipeLine(lines[k])) { region.push(lines[j].trim()); j++; consumedEnd = j; continue; }
          break;
        }
      }

      let rows = clean ? cellsFromLines(region) : cellsFromFlat(region.join(' '));
      if (!rows && region.length && region.every(isProperRow)) rows = cellsFromLines(region);

      if (rows && rows.length) {
        // isola a tabela com linhas em branco: vira um "chunk" próprio
        if (out.length && out[out.length - 1].trim()) out.push('');
        rows.forEach(r => out.push('| ' + r.join(' | ') + ' |'));
        out.push('');
        i = consumedEnd;
      } else {
        out.push(lines[i]); i++;
      }
    }
    return out.join('\n');
  }

  function tableHtml(head, rows) {
    const th = head.map(c => `<th>${inlineFormat(c)}</th>`).join('');
    const tb = rows.map(r => `<tr>${r.map(c => `<td>${inlineFormat(c)}</td>`).join('')}</tr>`).join('');
    return `<table class="slide-table"><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table>`;
  }

  /* ---------- Separação em slides ---------- */
  function isSlideSeparator(line) {
    const t = line.trim();
    if (!t) return false;
    if (/^(?:<!--\s*slide\s*-->|[[{]\s*slide\s*[\]}])$/i.test(t)) return true;
    const compact = t.replace(/[ \t]/g, '');   // aceita "- - -" além de "---"
    if (compact.length < 3) return false;
    const c = compact[0];
    if (RULE_CHARS.indexOf(c) === -1) return false;
    return compact.split('').every(ch => ch === c);
  }

  /* Se o separador sumiu mas o texto tem vários títulos markdown (## Slide),
     usa os títulos como quebra. */
  function splitByHeadings(text) {
    const lines = text.split('\n');
    const isHeading = l => /^#{1,6}\s+\S/.test(l);
    if (lines.filter(isHeading).length < 2) return null;
    const out = [];
    let cur = [];
    lines.forEach(line => {
      if (isHeading(line)) { if (cur.length) out.push(cur.join('\n')); cur = [line]; }
      else cur.push(line);
    });
    if (cur.length) out.push(cur.join('\n'));
    return out.map(b => b.trim()).filter(Boolean);
  }

  /* ---------- Separação automática (último recurso) ----------
     Sem separador nenhum, deduz onde cada slide começa pelo formato: título =
     linha curta, sem pontuação final, logo depois de uma frase terminada em
     ponto (ou logo antes de uma lista). */
  const SENTENCE_END_RE = /[.!?]["')\]]?$/;

  function findTitleLines(lines) {
    const meaningful = [];
    lines.forEach((l, i) => { if (l.trim()) meaningful.push(i); });
    const isBulletLine = l => BULLET_RE.test((l || '').trim());
    const titleLike = raw => {
      const t = raw.trim();
      if (!t || t.length > 70) return false;
      if (isBulletLine(t) || isPipeLine(t)) return false;
      if (SENTENCE_END_RE.test(t)) return false;
      const c = t.indexOf(':');
      if (c > 0) {
        const tail = t.slice(c + 1).trim();
        const letras = (tail.match(/[A-Za-zÀ-ÿ]/g) || []).length;
        if (tail && letras / tail.length < 0.5) return false;
      }
      return true;
    };

    const titles = new Set();
    let prevWasTitle = false;
    meaningful.forEach((li, k) => {
      const l = lines[li];
      let yes = false;
      if (titleLike(l)) {
        const prev = k > 0 ? lines[meaningful[k - 1]].trim() : null;
        const next = k < meaningful.length - 1 ? lines[meaningful[k + 1]].trim() : null;
        if (k === 0) yes = true;                                 // primeira linha
        else if (next && isBulletLine(next)) yes = true;          // título antes de uma lista
        else if (!prevWasTitle && (SENTENCE_END_RE.test(prev) || isBulletLine(prev))) yes = true;
      }
      if (yes) titles.add(li);
      prevWasTitle = yes;
    });
    return titles;
  }

  function autoSplitBlocks(text) {
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    if (lines.filter(l => l.trim()).length < 12) return null;   // texto curto: não arrisca
    const titles = findTitleLines(lines);
    if (titles.size < 3) return null;
    const out = [];
    let cur = [];
    lines.forEach((l, i) => {
      if (titles.has(i) && cur.length) { out.push(cur.join('\n')); cur = []; }
      cur.push(l);
    });
    if (cur.length) out.push(cur.join('\n'));
    const blocks = out.map(b => b.trim()).filter(Boolean);
    return blocks.length > 1 ? blocks : null;
  }

  /* Mesma dedução, mas escrevendo --- no texto para o professor revisar. */
  function autoSplitToText(raw) {
    const lines = raw.replace(/\r\n?/g, '\n').split('\n');
    const titles = findTitleLines(lines);
    const out = [];
    lines.forEach((l, i) => {
      if (titles.has(i) && out.some(x => x.trim())) out.push('---');
      out.push(l);
    });
    return out.join('\n').replace(/\n{3,}/g, '\n\n');
  }

  function splitSlideBlocks(raw) {
    const lines = raw.replace(/\r\n?/g, '\n').split('\n');   // normaliza CRLF
    const out = [];
    let cur = [];
    lines.forEach(line => {
      if (isSlideSeparator(line)) { out.push(cur.join('\n')); cur = []; }
      else cur.push(line);
    });
    out.push(cur.join('\n'));
    const blocks = out.map(b => b.trim()).filter(Boolean);
    if (blocks.length > 1) return blocks;
    const only = blocks[0] || '';
    return splitByHeadings(only) || autoSplitBlocks(only) || blocks;
  }

  /* Limpa "## ", "1. " e "**" do título. */
  function cleanTitle(line) {
    return (line || '').trim()
      .replace(/^#{1,6}\s+/, '')
      .replace(/^\d+[.)]\s+/, '')
      .replace(/^\*\*(.+?)\*\*$/, '$1')
      .trim();
  }

  function parseSlides(raw) {
    const { text: semCodigo, codes } = extractCodeBlocks(raw || '');
    return splitSlideBlocks(semCodigo).map(block => {
      const lines = block.split('\n');
      const title = cleanTitle(lines.shift());
      const rest = repairTables(lines.join('\n').trim());

      const chunks = rest.split(/\n\s*\n/).filter(c => c.trim().length);
      let bodyHtml = '';
      const blocks = [];
      chunks.forEach(chunk => {
        const chunkLines = chunk.split('\n').map(l => l.trim()).filter(Boolean);

        const codeMatch = chunkLines.length === 1 && chunkLines[0].match(CODE_TOKEN_RE);
        if (codeMatch) {
          const code = codes[Number(codeMatch[1])];
          bodyHtml += codeHtml(code);
          blocks.push({ type: 'code', text: code });
          return;
        }

        const tagImg = chunkLines.length === 1 && chunkLines[0].match(/^!\[(.+?)\]$/);
        const imgInfo = tagImg ? parseImgTagInner(tagImg[1].trim()) : null;
        if (imgInfo) {
          // A imagem posicionada não entra no fluxo: é desenhada solta por cima.
          if (!imgInfo.positioned) bodyHtml += imgTagHtml(imgInfo.id);
          blocks.push({ type: 'img', ...imgInfo });
          return;
        }

        const isTable = chunkLines.length > 1 && chunkLines.every(isPipeLine);
        if (isTable) {
          const rows = cellsFromLines(chunkLines);
          if (rows && rows.length) {
            const head = rows[0];
            const body = rows.slice(1);
            bodyHtml += tableHtml(head, body);
            blocks.push({ type: 'table', head, rows: body });
            return;
          }
        }

        if (chunkLines.every(l => BULLET_RE.test(l))) {
          const items = chunkLines.map(l => l.replace(BULLET_RE, ''));
          bodyHtml += '<ul>' + items.map(t => `<li>${inlineFormat(t)}</li>`).join('') + '</ul>';
          blocks.push({ type: 'ul', items });
          return;
        }

        chunkLines.forEach(l => {
          bodyHtml += `<p>${inlineFormat(l)}</p>`;
          blocks.push({ type: 'p', text: l });
        });
      });

      return { title, bodyHtml, blocks, isTitleSlide: chunks.length === 0 };
    });
  }

  /* ===================== Base (template) do slide ===================== */

  const BASE_SVG_W = 1600;
  const BASE_SVG_H = 900;

  /* Hachura diagonal do fundo padrão, em três direções — é o desenho do app
     original, refeito em <pattern> para poder ser rasterizado junto do fundo. */
  function hachuraSvg(cor) {
    const p = (id, ang, passo) => `<pattern id="${id}" width="${passo}" height="${passo}"
        patternUnits="userSpaceOnUse" patternTransform="rotate(${ang})">
        <line x1="0" y1="0" x2="0" y2="${passo}" stroke="${cor}" stroke-width="1.4"/></pattern>`;
    return `<defs>${p('h1', 60, 46)}${p('h2', -60, 46)}${p('h3', 90, 40)}</defs>
      <rect width="100%" height="100%" fill="url(#h1)"/>
      <rect width="100%" height="100%" fill="url(#h2)"/>
      <rect width="100%" height="100%" fill="url(#h3)"/>`;
  }

  function formasSvg(b) {
    const W = BASE_SVG_W, H = BASE_SVG_H, d = b.destaque;
    switch (b.forma) {
      case 'grade':
        return hachuraSvg(d + '2b');                       // ~17% de opacidade
      case 'faixa':
        return `<rect x="0" y="0" width="${W * 0.055}" height="${H}" fill="${d}"/>`;
      case 'topo':
        return `<rect x="0" y="0" width="${W}" height="${H * 0.09}" fill="${d}"/>`;
      case 'canto':
        return `<path d="M${W * 0.78},0 L${W},0 L${W},${H * 0.30} Z" fill="${d}"/>`
          + `<circle cx="${W * 0.055}" cy="${H * 0.93}" r="${H * 0.045}" fill="${d}" opacity="0.35"/>`;
      case 'diagonal':
        return `<path d="M0,${H} L${W * 0.5},${H} L0,${H * 0.5} Z" fill="${d}" opacity="0.16"/>`
          + `<path d="M${W},0 L${W},${H * 0.42} L${W * 0.66},0 Z" fill="${d}" opacity="0.10"/>`;
      default:
        return '';                                          // 'limpo'
    }
  }

  function baseSvg(b) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${BASE_SVG_W}" height="${BASE_SVG_H}"
      viewBox="0 0 ${BASE_SVG_W} ${BASE_SVG_H}">
      <rect width="100%" height="100%" fill="${b.fundo}"/>${formasSvg(b)}</svg>`;
  }

  function svgDataUrl(svg) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace(/\s+/g, ' '));
  }

  /* O PPTX precisa de bitmap: SVG não é formato de imagem aceito pelo
     PowerPoint. Rasteriza uma vez, na hora de aplicar a base. */
  function svgParaPng(svg) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = BASE_SVG_W;
        c.height = BASE_SVG_H;
        c.getContext('2d').drawImage(img, 0, 0, BASE_SVG_W, BASE_SVG_H);
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = () => resolve('');
      img.src = svgDataUrl(svg);
    });
  }

  function baseAtual() {
    return base || (base = Storage.getBase());
  }

  /* Estilo do fundo de um slide: a base do professor, ou nada (o CSS cai na
     hachura padrão quando não há imagem). */
  function bgStyle() {
    const b = baseAtual();
    return b.png
      ? ` style="background-image:url('${b.png}');background-size:cover;background-position:center;"`
      : '';
  }

  /* ===================== Preview ===================== */

  function barHtml() {
    if (!baseAtual().barra) return '';
    return '<div class="bar">'
      + BAR_COLORS.map(c => `<div style="background:#${c}"></div>`).join('')
      + '</div>';
  }

  /* Imagens soltas: ficam fora do fluxo do texto, nas coordenadas guardadas. */
  function posicionadasHtml(s) {
    return s.blocks.filter(b => b.type === 'img' && b.positioned).map(b => {
      const img = imageLibrary[b.id];
      if (!img) return '';
      return `<img src="${img.dataUrl}" alt="${escapeHtml(b.id)}"
        style="position:absolute;left:${b.x}%;top:${b.y}%;width:${b.w}%;height:auto;z-index:5;border-radius:4px;">`;
    }).join('');
  }

  /* Na preview as imagens soltas são elementos interativos, montados à parte
     (arrastar/redimensionar); no PDF elas entram já aqui, estáticas. */
  function slideHtml(s, opts) {
    const b = baseAtual();
    const soltas = (opts && opts.comPosicionadas) ? posicionadasHtml(s) : '';
    return `<div class="slide-bg"${b.png ? ' data-base="1"' : ''}${bgStyle()}></div>
      <div class="slide-content">
        <h1 class="slide-title">${inlineFormat(s.title)}</h1>
        <div class="slide-body">${s.bodyHtml}</div>
      </div>
      ${soltas}
      ${barHtml()}`;
  }

  let lastScale = -1;
  function scaleStage() {
    const outer = els.stageOuter;
    if (!outer || !els.stageFrame) return;
    /* clientWidth/Height incluem o padding: precisa descontar, senão o frame
       fica maior que a área útil, aparece scrollbar, o clientWidth encolhe e a
       preview fica tremendo. */
    const cs = getComputedStyle(outer);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const availW = outer.clientWidth - padX - 2;
    const availH = outer.clientHeight - padY - 2;
    if (availW <= 0 || availH <= 0) return;
    const scale = Math.max(0.05, Math.min(availW / BASE_W, availH / BASE_H));
    if (Math.abs(scale - lastScale) < 0.0005) return;
    lastScale = scale;
    els.stage.style.transform = `scale(${scale})`;
    /* floor: evita meio pixel de sobra que reintroduz a scrollbar */
    els.stageFrame.style.width = Math.floor(BASE_W * scale) + 'px';
    els.stageFrame.style.height = Math.floor(BASE_H * scale) + 'px';
  }

  let scaleRaf = 0;
  function requestScaleStage() {
    if (scaleRaf) return;
    scaleRaf = requestAnimationFrame(() => { scaleRaf = 0; scaleStage(); });
  }

  function renderThumbs() {
    els.thumbs.innerHTML = '';
    slides.forEach((s, i) => {
      const t = document.createElement('div');
      t.className = 'deck-thumb' + (i === current ? ' active' : '');
      t.innerHTML = `<span class="num">${i + 1}</span>${escapeHtml(s.title.slice(0, 40))}`;
      t.onclick = () => { current = i; renderStage(); };
      els.thumbs.appendChild(t);
    });
  }

  function renderStage() {
    if (!slides.length) {
      els.stage.className = 'deck-stage';
      els.stage.innerHTML = '<div class="slide-content"><p class="slide-body">Sem conteúdo para exibir.</p></div>';
      els.page.textContent = '0 / 0';
      els.thumbs.innerHTML = '';
      scaleStage();
      return;
    }
    if (current >= slides.length) current = slides.length - 1;
    if (current < 0) current = 0;
    const s = slides[current];

    els.stage.className = 'deck-stage' + (s.isTitleSlide ? ' title-slide' : '');
    aplicarCoresTexto(els.stage);
    els.stage.innerHTML = slideHtml(s);
    els.page.textContent = `${current + 1} / ${slides.length}`;
    els.prev.disabled = current === 0;
    els.next.disabled = current === slides.length - 1;
    renderThumbs();
    renderPosicionadas(s);
    scaleStage();
  }

  /* As cores do texto vêm da base e entram como variáveis CSS. */
  function aplicarCoresTexto(el) {
    const b = baseAtual();
    el.style.setProperty('--slide-titulo', b.corTitulo);
    el.style.setProperty('--slide-texto', b.corTexto);
  }

  /* ===================== Imagens soltas: arrastar e redimensionar ===================== */

  function renderPosicionadas(s) {
    s.blocks.filter(b => b.type === 'img' && b.positioned).forEach(b => {
      const img = imageLibrary[b.id];
      const wrap = document.createElement('div');
      wrap.className = 'floating-wrap';
      wrap.dataset.k = b.k;
      wrap.style.left = b.x + '%';
      wrap.style.top = b.y + '%';
      wrap.style.width = b.w + '%';

      const imgEl = document.createElement('img');
      imgEl.src = img ? img.dataUrl : '';
      imgEl.alt = b.id;
      imgEl.draggable = false;
      wrap.appendChild(imgEl);

      const handle = document.createElement('div');
      handle.className = 'resize-handle';
      wrap.appendChild(handle);

      arrastar(wrap, b);
      redimensionar(handle, wrap, b);
      els.stage.appendChild(wrap);
    });
  }

  function arrastar(el, block) {
    let startX, startY, startPctX, startPctY, dragging = false;

    el.addEventListener('pointerdown', e => {
      if (e.target.classList.contains('resize-handle')) return;
      e.preventDefault();
      dragging = true;
      el.setPointerCapture(e.pointerId);
      startX = e.clientX;
      startY = e.clientY;
      startPctX = block.x;
      startPctY = block.y;
      el.classList.add('dragging');
    });

    el.addEventListener('pointermove', e => {
      if (!dragging) return;
      const rect = els.stage.getBoundingClientRect();
      const dxPct = ((e.clientX - startX) / rect.width) * 100;
      const dyPct = ((e.clientY - startY) / rect.height) * 100;
      el._x = Math.max(0, Math.min(100 - block.w, startPctX + dxPct));
      el._y = Math.max(0, Math.min(95, startPctY + dyPct));
      el.style.left = el._x + '%';
      el.style.top = el._y + '%';
    });

    el.addEventListener('pointerup', () => {
      if (!dragging) return;
      dragging = false;
      el.classList.remove('dragging');
      if (el._x !== undefined) gravarPosicao(block.k, el._x, el._y, block.w);
    });
  }

  function redimensionar(handle, wrap, block) {
    let startX, startW, resizing = false;

    handle.addEventListener('pointerdown', e => {
      e.stopPropagation();
      e.preventDefault();
      resizing = true;
      handle.setPointerCapture(e.pointerId);
      startX = e.clientX;
      startW = block.w;
      wrap.classList.add('resizing');
    });

    handle.addEventListener('pointermove', e => {
      if (!resizing) return;
      const rect = els.stage.getBoundingClientRect();
      const dxPct = ((e.clientX - startX) / rect.width) * 100;
      wrap._w = Math.max(5, Math.min(100 - block.x, startW + dxPct));
      wrap.style.width = wrap._w + '%';
    });

    handle.addEventListener('pointerup', () => {
      if (!resizing) return;
      resizing = false;
      wrap.classList.remove('resizing');
      if (wrap._w !== undefined) gravarPosicao(block.k, block.x, block.y, wrap._w);
    });
  }

  /* A posição mora no texto, não num estado paralelo: assim o que o professor
     arrasta some junto com o material se ele apagar a linha, e o histórico
     guarda tudo num campo só. */
  function gravarPosicao(k, x, y, w) {
    const n = v => Math.round(v * 10) / 10;
    const re = new RegExp('(!\\[[\\w-]+\\s+x=)(-?[\\d.]+)(\\s+y=)(-?[\\d.]+)(\\s+w=)(-?[\\d.]+)(\\s+k=' + k + '\\])');
    els.src.value = els.src.value.replace(re, `$1${n(x)}$3${n(y)}$5${n(w)}$7`);
    update();
    if (onChange) onChange(els.src.value);
  }

  function update() {
    slides = parseSlides(els.src.value);
    renderStage();
  }

  /* ===================== Exportar PDF (impressão) ===================== */

  /* Estilos do slide numa janela própria: o navegador imprime uma página por
     slide, em paisagem, sem a interface em volta. */
  const PRINT_CSS = `
  *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact;}
  html,body{margin:0;padding:0;}
  body{font-family:"Segoe UI",Arial,Helvetica,sans-serif;color:#3d4a5c;background:#ddd;}
  .pageBox{width:100%;max-width:1280px;aspect-ratio:16/9;margin:0 auto;page-break-after:always;break-after:page;background:#fff;}
  .pageBox:last-child{page-break-after:auto;break-after:auto;}
  .pslide{position:relative;width:100%;height:100%;overflow:hidden;background:#fff;display:flex;flex-direction:column;}
  .slide-bg{position:absolute;inset:0;}
  .slide-bg:not([data-base]){background-image:
    repeating-linear-gradient(60deg, rgba(200,205,215,.35) 0px, rgba(200,205,215,.35) 1.5px, transparent 1.5px, transparent 46px),
    repeating-linear-gradient(-60deg, rgba(200,205,215,.35) 0px, rgba(200,205,215,.35) 1.5px, transparent 1.5px, transparent 46px),
    repeating-linear-gradient(0deg, rgba(200,205,215,.3) 0px, rgba(200,205,215,.3) 1.5px, transparent 1.5px, transparent 40px);}
  .slide-img{display:block;max-width:100%;max-height:35%;object-fit:contain;margin:.4em auto;border-radius:6px;}
  .slide-content{position:relative;flex:1;padding:6% 7% 4% 7%;display:flex;flex-direction:column;gap:14px;z-index:1;min-height:0;}
  .slide-title{font-size:2.6em;font-weight:800;color:var(--slide-titulo,#3d4a5c);margin:0 0 .1em 0;line-height:1.15;}
  .slide-body{font-size:1.05em;color:var(--slide-texto,#3d4a5c);line-height:1.55;}
  .slide-body p{margin:0 0 .7em 0;}
  .slide-body ul{margin:.2em 0 0 0;padding-left:1.2em;list-style:disc;}
  .slide-body li{margin-bottom:.35em;}
  .slide-body strong{color:var(--slide-texto,#3d4a5c);}
  .slide-body .slide-code{background:#f4f6f8;border:1px solid #e2e6ec;border-left:3px solid #9aa5b4;border-radius:4px;padding:.5em .7em;margin:.5em 0 .8em 0;overflow-x:auto;}
  .slide-body .slide-code code{font-family:Consolas,"Courier New",monospace;font-size:.88em;line-height:1.45;white-space:pre;color:#2f3b4c;display:block;}
  .slide-body .slide-table{width:100%;border-collapse:collapse;margin:.5em 0 .8em 0;font-size:.92em;line-height:1.35;}
  .slide-body .slide-table th,.slide-body .slide-table td{border:1px solid #d8dde4;padding:.38em .6em;text-align:left;vertical-align:top;}
  .slide-body .slide-table thead th{background:#eef1f5;font-weight:700;color:#2f3b4c;border-bottom:2px solid #b9c2cf;}
  .slide-body .slide-table tbody tr:nth-child(even) td{background:#fafbfc;}
  .title-slide .slide-content{align-items:center;justify-content:center;text-align:center;}
  .title-slide .slide-title{font-size:2.7em;}
  .bar{height:5%;width:100%;display:flex;z-index:1;flex:0 0 auto;}
  .bar div{flex:1;}
  @media print{body{background:#fff;}.pageBox{max-width:none;}}
  @page{size:landscape;margin:0;}`;

  function exportPrint() {
    if (!slides.length) { alert('Sem slides para exportar.'); return; }
    const b = baseAtual();
    const corpo = slides.map(s =>
      `<div class="pageBox"><section class="pslide${s.isTitleSlide ? ' title-slide' : ''}">`
      + slideHtml(s, { comPosicionadas: true }) + '</section></div>'
    ).join('\n');

    // As cores da base entram como variáveis no :root da janela de impressão.
    const vars = `:root{--slide-titulo:${b.corTitulo};--slide-texto:${b.corTexto};}`;
    const doc = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>${escapeHtml(titulo)}</title><style>${vars}${PRINT_CSS}</style></head><body>
${corpo}
<script>window.onload=function(){setTimeout(function(){window.print();},250);};<\/script>
</body></html>`;

    const win = window.open('', '_blank');
    if (!win) {
      alert('Não foi possível abrir a janela de exportação. Verifique se pop-ups estão bloqueados para este site.');
      return;
    }
    win.document.open();
    win.document.write(doc);
    win.document.close();
  }

  /* ===================== Exportar PPTX ===================== */

  function mdRuns(text) {
    return text.split(/(\*\*.+?\*\*)/g).filter(Boolean).map(part => {
      if (part.startsWith('**') && part.endsWith('**')) return { text: part.slice(2, -2), bold: true };
      return { text: part, bold: false };
    });
  }

  /* O pptx não tem fluxo automático de texto como o HTML: os blocos são
     empilhados de cima para baixo, com a altura estimada linha a linha. */
  /* '#4f46e5' -> '4F46E5' — o pptxgenjs quer hex sem '#'. */
  function hex(c) { return String(c || '').replace('#', '').toUpperCase() || '3D4A5C'; }

  function renderPptxBody(slide, blocks, x, y, w) {
    const CHARS_PER_LINE = 85;
    const LINE_H = 0.25;
    const PARA_GAP = 0.12;
    const IMG_MAX_H = 2.6;
    const corTexto = hex(baseAtual().corTexto);
    let cursorY = y;
    let pendingRuns = [];
    let estLines = 0;

    function flushText() {
      if (!pendingRuns.length) return;
      const height = Math.max(estLines, 1) * LINE_H + PARA_GAP;
      slide.addText(pendingRuns, {
        x, y: cursorY, w, h: height,
        fontSize: 15, color: corTexto, fontFace: 'Arial', valign: 'top',
      });
      cursorY += height;
      pendingRuns = [];
      estLines = 0;
    }

    blocks.forEach(block => {
      if (block.type === 'img') {
        // As soltas são posicionadas à parte, em coordenadas absolutas.
        if (block.positioned) return;
        flushText();
        const img = imageLibrary[block.id];
        if (img) {
          let dispW = w, dispH = dispW * (img.h / img.w);
          if (dispH > IMG_MAX_H) { dispH = IMG_MAX_H; dispW = dispH * (img.w / img.h); }
          slide.addImage({ data: img.dataUrl, x: x + (w - dispW) / 2, y: cursorY, w: dispW, h: dispH });
          cursorY += dispH + PARA_GAP;
        }
      } else if (block.type === 'code') {
        flushText();
        const nLinhas = block.text.split('\n').length;
        const h = Math.max(0.45, nLinhas * 0.24 + 0.22);
        slide.addText(block.text, {
          x, y: cursorY, w, h,
          fontSize: 12, fontFace: 'Consolas', color: '2F3B4C',
          fill: { color: 'F4F6F8' }, line: { color: 'E2E6EC', width: 0.5 },
          valign: 'top', margin: 6,
        });
        cursorY += h + PARA_GAP;
      } else if (block.type === 'table') {
        flushText();
        const ROW_H = 0.34;
        const nCols = block.head.length || 1;
        const colW = Array(nCols).fill(w / nCols);
        const headRow = block.head.map(c => ({
          text: c, options: { bold: true, color: '2F3B4C', fill: { color: 'EEF1F5' }, valign: 'middle' },
        }));
        const bodyRows = block.rows.map(r => r.map(c => ({
          text: c, options: { color: '3D4A5C', valign: 'middle' },   // fundo claro fixo da tabela
        })));
        slide.addTable([headRow, ...bodyRows], {
          x, y: cursorY, w, colW,
          fontSize: 13, fontFace: 'Arial', align: 'left',
          border: { type: 'solid', pt: 0.5, color: 'D8DDE4' },
          margin: 4, autoPage: false,
        });
        cursorY += (block.rows.length + 1) * ROW_H + PARA_GAP;
      } else if (block.type === 'ul') {
        block.items.forEach(item => {
          const segs = mdRuns(item);
          segs.forEach((seg, i) => {
            pendingRuns.push({
              text: seg.text,
              options: {
                bold: seg.bold,
                breakLine: i === segs.length - 1,
                bullet: i === 0 ? { code: '25CF' } : undefined,
                fontSize: 15, color: corTexto, fontFace: 'Arial',
              },
            });
          });
          estLines += Math.max(1, Math.ceil(item.length / CHARS_PER_LINE));
        });
      } else {
        const segs = mdRuns(block.text);
        segs.forEach((seg, i) => {
          pendingRuns.push({
            text: seg.text,
            options: {
              bold: seg.bold,
              breakLine: i === segs.length - 1,
              paraSpaceAfter: i === segs.length - 1 ? 10 : 0,
              fontSize: 15, color: corTexto, fontFace: 'Arial',
            },
          });
        });
        estLines += Math.max(1, Math.ceil(block.text.length / CHARS_PER_LINE));
      }
    });
    flushText();
  }

  function sanitizeFilename(name) {
    return (name || 'slides').replace(/[\\/:*?"<>|]/g, '-').slice(0, 80);
  }

  /* Imagens arrastadas: x/y/w em % viram polegadas no slide de 13,333 x 7,5. */
  function renderPptxPosicionadas(slide, blocks) {
    const SLIDE_W = 13.333, SLIDE_H = 7.5;
    blocks.filter(b => b.type === 'img' && b.positioned).forEach(b => {
      const img = imageLibrary[b.id];
      if (!img) return;
      const wIn = (b.w / 100) * SLIDE_W;
      slide.addImage({
        data: img.dataUrl,
        x: (b.x / 100) * SLIDE_W,
        y: (b.y / 100) * SLIDE_H,
        w: wIn,
        h: wIn * (img.h / img.w),
      });
    });
  }

  function exportPptx() {
    if (!slides.length) { alert('Sem slides para exportar.'); return; }
    if (!window.PptxGenJS) { alert('A biblioteca de exportação PPTX não carregou.'); return; }

    const btn = els.pptxBtn;
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Gerando…';

    const restaura = () => { btn.disabled = false; btn.textContent = label; };

    try {
      const pptx = new window.PptxGenJS();
      pptx.defineLayout({ name: 'WIDE', width: 13.333, height: 7.5 });
      pptx.layout = 'WIDE';

      const b = baseAtual();
      const corTitulo = hex(b.corTitulo);

      slides.forEach(s => {
        const slide = pptx.addSlide();
        slide.background = { color: hex(b.fundo) };

        // A base montada (ou a imagem de fundo) entra como imagem de página inteira.
        if (b.png) slide.addImage({ data: b.png, x: 0, y: 0, w: 13.333, h: 7.5 });

        // faixa colorida do rodapé (espelha o template da tela)
        if (b.barra) {
          const barY = 7.5 - 0.16;
          const segW = 13.333 / BAR_COLORS.length;
          BAR_COLORS.forEach((cor, i) => {
            slide.addShape('rect', {
              x: i * segW, y: barY, w: segW, h: 0.16,
              fill: { color: cor }, line: { type: 'none' },
            });
          });
        }

        if (s.isTitleSlide) {
          slide.addText(s.title, {
            x: 0.6, y: 0, w: 13.333 - 1.2, h: 7.5 - 0.16,
            align: 'center', valign: 'middle',
            fontSize: 40, bold: true, color: corTitulo, fontFace: 'Arial',
          });
        } else {
          slide.addText(s.title, {
            x: 0.6, y: 0.45, w: 13.333 - 1.2, h: 1.0,
            fontSize: 32, bold: true, color: corTitulo, fontFace: 'Arial',
          });
          renderPptxBody(slide, s.blocks, 0.6, 1.55, 13.333 - 1.2);
        }
        renderPptxPosicionadas(slide, s.blocks);
      });

      pptx.writeFile({ fileName: sanitizeFilename(titulo) + '.pptx' })
        .then(restaura)
        .catch(() => { restaura(); alert('Não foi possível gerar o arquivo PPTX.'); });
    } catch (err) {
      restaura();
      alert('Não foi possível gerar o arquivo PPTX.');
    }
  }

  /* ===================== Galeria de imagens ===================== */

  function montarGaleria() {
    const ids = Object.keys(imageLibrary);
    els.galeria.hidden = !ids.length;
    els.galeriaRow.innerHTML = '';
    ids.forEach(id => {
      const chip = document.createElement('div');
      chip.className = 'img-chip';
      chip.innerHTML = `<img src="${imageLibrary[id].dataUrl}" alt="${escapeHtml(id)}">`
        + '<span class="img-del" title="remover">\u00d7</span>';
      chip.querySelector('img').addEventListener('click', () => inserirTagImagem(id));
      chip.querySelector('.img-del').addEventListener('click', ev => {
        ev.stopPropagation();
        if (!confirm('Remover esta imagem? Ela sai dos slides que a usam.')) return;
        delete imageLibrary[id];
        Imagens.remover(id);
        // Tira do texto as tags que apontavam para ela.
        els.src.value = els.src.value.replace(
          new RegExp('^\\s*!\\[' + id + '(?:\\s[^\\]]*)?\\]\\s*$\n?', 'gm'), '');
        montarGaleria();
        update();
        if (onChange) onChange(els.src.value);
      });
      els.galeriaRow.appendChild(chip);
    });
  }

  /* Insere a imagem como bloco próprio no ponto onde o cursor está. Nasce
     posicionada (x/y/w) para poder ser arrastada logo em seguida. */
  function inserirTagImagem(id) {
    const k = Math.random().toString(36).slice(2, 8);
    const tag = `![${id} x=35 y=38 w=30 k=${k}]`;
    const ta = els.src;
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const antes = ta.value.slice(0, start);
    const depois = ta.value.slice(end);
    const quebra = antes.length && !antes.endsWith('\n') ? '\n\n' : '';
    const insercao = quebra + tag + '\n\n';
    ta.value = antes + insercao + depois;
    const caret = (antes + insercao).length;
    ta.focus();
    ta.setSelectionRange(caret, caret);
    update();
    if (onChange) onChange(ta.value);
  }

  async function adicionarImagens(files) {
    for (const file of files) {
      const rec = await Imagens.adicionar(file);
      if (rec) imageLibrary[rec.id] = rec;
    }
    montarGaleria();
    update();
  }

  /* ===================== Montador da base ===================== */

  let baseRascunho = null;   // cópia editada enquanto o painel está aberto

  function abrirBase() {
    baseRascunho = { ...baseAtual() };
    els.baseForma.value = baseRascunho.forma;
    els.baseFundo.value = baseRascunho.fundo;
    els.baseDestaque.value = baseRascunho.destaque;
    els.baseCorTitulo.value = baseRascunho.corTitulo;
    els.baseCorTexto.value = baseRascunho.corTexto;
    els.baseBarra.checked = !!baseRascunho.barra;
    els.baseModal.hidden = false;
    renderBasePreview();
  }

  function fecharBase() {
    els.baseModal.hidden = true;
    baseRascunho = null;
  }

  function lerControles() {
    baseRascunho.forma = els.baseForma.value;
    baseRascunho.fundo = els.baseFundo.value;
    baseRascunho.destaque = els.baseDestaque.value;
    baseRascunho.corTitulo = els.baseCorTitulo.value;
    baseRascunho.corTexto = els.baseCorTexto.value;
    baseRascunho.barra = els.baseBarra.checked;
    // Mexer nas formas volta a base para o modo "montada".
    if (baseRascunho.origem === 'imagem' && els.baseForma.value !== baseRascunho.forma) {
      baseRascunho.origem = 'formas';
    }
  }

  /* Preview do painel: mostra a base com as zonas de título e conteúdo por
     cima. As zonas são só guia — nunca entram no slide. */
  function renderBasePreview() {
    const b = baseRascunho;
    const fundo = b.origem === 'imagem' && b.png ? b.png : svgDataUrl(baseSvg(b));
    els.baseCanvas.style.backgroundImage = `url('${fundo}')`;

    const zona = (z, classe, rotulo) =>
      `<div class="base-zona ${classe}" style="left:${z.x}%;top:${z.y}%;width:${z.w}%;height:${z.h}%">`
      + `<span>${rotulo}</span></div>`;

    els.baseCanvas.innerHTML =
      `<div class="base-amostra" style="left:${ZONAS.titulo.x}%;top:${ZONAS.titulo.y}%;`
      + `width:${ZONAS.titulo.w}%;color:${b.corTitulo}">Título do slide</div>`
      + `<div class="base-amostra base-amostra-corpo" style="left:${ZONAS.conteudo.x}%;`
      + `top:${ZONAS.conteudo.y}%;width:${ZONAS.conteudo.w}%;color:${b.corTexto}">`
      + 'Texto do conteúdo, bullets e tabelas caem aqui.</div>'
      + zona(ZONAS.titulo, 'z-titulo', 'ÁREA DO TÍTULO')
      + zona(ZONAS.conteudo, 'z-conteudo', 'ÁREA DO CONTEÚDO')
      + (b.barra ? zona(ZONAS.barra, 'z-barra', '') : '');

    els.baseBarraPreview.hidden = !b.barra;
  }

  async function aplicarBase() {
    const b = baseRascunho;
    els.baseAplicar.disabled = true;
    els.baseAplicar.textContent = 'Aplicando…';
    // Formas montadas viram PNG: o PowerPoint não aceita SVG como imagem.
    if (b.origem !== 'imagem') b.png = await svgParaPng(baseSvg(b));
    Storage.setBase(b);
    base = Storage.getBase();
    els.baseAplicar.disabled = false;
    els.baseAplicar.textContent = 'Aplicar';
    fecharBase();
    renderStage();
  }

  /* ===================== Abrir / fechar ===================== */

  function bind() {
    const $ = id => document.getElementById(id);
    els = {
      overlay: $('deck-overlay'),
      titulo: $('deck-titulo'),
      src: $('deck-src'),
      stage: $('deck-stage'),
      stageOuter: $('deck-stage-outer'),
      stageFrame: $('deck-stage-frame'),
      thumbs: $('deck-thumbs'),
      page: $('deck-page'),
      prev: $('deck-prev'),
      next: $('deck-next'),
      pptxBtn: $('deck-pptx'),
      pdfBtn: $('deck-pdf'),
      sepBtn: $('deck-sep'),
      fechar: $('deck-fechar'),
      // imagens
      imgBtn: $('deck-img-btn'),
      imgInput: $('deck-img-input'),
      galeria: $('deck-galeria'),
      galeriaRow: $('deck-galeria-row'),
      // base do slide
      baseBtn: $('deck-base-btn'),
      baseModal: $('base-modal'),
      baseCanvas: $('base-canvas'),
      baseForma: $('base-forma'),
      baseFundo: $('base-fundo'),
      baseDestaque: $('base-destaque'),
      baseCorTitulo: $('base-cor-titulo'),
      baseCorTexto: $('base-cor-texto'),
      baseBarra: $('base-barra'),
      baseBarraPreview: $('base-barra-preview'),
      baseImgBtn: $('base-img-btn'),
      baseImgInput: $('base-img-input'),
      baseReset: $('base-reset'),
      baseAplicar: $('base-aplicar'),
      baseCancelar: $('base-cancelar'),
      baseFechar: $('base-fechar'),
    };

    els.src.addEventListener('input', () => {
      update();
      if (onChange) onChange(els.src.value);
    });
    els.prev.addEventListener('click', () => { current--; renderStage(); });
    els.next.addEventListener('click', () => { current++; renderStage(); });
    els.pdfBtn.addEventListener('click', exportPrint);
    els.pptxBtn.addEventListener('click', exportPptx);
    els.fechar.addEventListener('click', close);

    els.sepBtn.addEventListener('click', () => {
      const raw = els.src.value;
      if (!raw.trim()) return;
      const jaTem = raw.replace(/\r\n?/g, '\n').split('\n').some(isSlideSeparator);
      if (jaTem && !confirm('O texto já tem separadores. Adicionar mais quebras automáticas mesmo assim?')) return;
      const novo = autoSplitToText(raw);
      const qtd = novo.split('\n').filter(isSlideSeparator).length + 1;
      if (qtd < 2) { alert('Não consegui identificar títulos de slide neste texto.'); return; }
      els.src.value = novo;
      current = 0;
      update();
      if (onChange) onChange(novo);
      alert(`Separadores inseridos: ${qtd} slides.\n\nConfira o texto — os --- foram deduzidos pelo formato, então algum pode precisar ser movido ou apagado.`);
    });

    // --- imagens ---
    els.imgBtn.addEventListener('click', () => els.imgInput.click());
    els.imgInput.addEventListener('change', async e => {
      const files = Array.from(e.target.files || []);
      e.target.value = '';
      if (files.length) await adicionarImagens(files);
    });

    // --- base do slide ---
    els.baseBtn.addEventListener('click', abrirBase);
    els.baseCancelar.addEventListener('click', fecharBase);
    els.baseFechar.addEventListener('click', fecharBase);
    els.baseAplicar.addEventListener('click', aplicarBase);
    [els.baseForma, els.baseFundo, els.baseDestaque, els.baseCorTitulo,
      els.baseCorTexto, els.baseBarra].forEach(el => {
      el.addEventListener('input', () => { lerControles(); renderBasePreview(); });
      el.addEventListener('change', () => { lerControles(); renderBasePreview(); });
    });
    els.baseImgBtn.addEventListener('click', () => els.baseImgInput.click());
    els.baseImgInput.addEventListener('change', async e => {
      const file = (e.target.files || [])[0];
      e.target.value = '';
      if (!file) return;
      const rec = await Imagens.adicionar(file);
      if (!rec) { alert('Não foi possível ler esta imagem.'); return; }
      // A imagem de fundo não entra na galeria: ela é a base, não um elemento do slide.
      Imagens.remover(rec.id);
      baseRascunho.origem = 'imagem';
      baseRascunho.png = rec.dataUrl;
      renderBasePreview();
    });
    els.baseReset.addEventListener('click', () => {
      baseRascunho = { ...Storage.BASE_PADRAO };
      els.baseForma.value = baseRascunho.forma;
      els.baseFundo.value = baseRascunho.fundo;
      els.baseDestaque.value = baseRascunho.destaque;
      els.baseCorTitulo.value = baseRascunho.corTitulo;
      els.baseCorTexto.value = baseRascunho.corTexto;
      els.baseBarra.checked = baseRascunho.barra;
      renderBasePreview();
    });

    window.addEventListener('resize', requestScaleStage);
    if (window.ResizeObserver) new ResizeObserver(requestScaleStage).observe(els.stageOuter);
    document.addEventListener('keydown', e => {
      if (els.overlay.hidden) return;
      if (!els.baseModal.hidden) {                   // painel da base abre na frente
        if (e.key === 'Escape') fecharBase();
        return;
      }
      if (e.target === els.src) return;              // digitando: setas andam no texto
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { current++; renderStage(); }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { current--; renderStage(); }
    });
  }

  async function open(texto, opts) {
    if (!els) bind();
    const o = opts || {};
    titulo = o.titulo || 'Slides';
    onChange = o.onChange || null;
    base = Storage.getBase();
    els.titulo.textContent = titulo;
    els.src.value = texto || '';
    current = 0;
    els.overlay.hidden = false;
    lastScale = -1;
    update();
    requestScaleStage();

    /* As imagens vêm do IndexedDB (assíncrono): a preview aparece na hora com
       o texto e se completa quando elas chegam. */
    imageLibrary = await Imagens.carregar(idsNoTexto(texto));
    montarGaleria();
    update();
  }

  function close() {
    if (els) {
      els.overlay.hidden = true;
      els.baseModal.hidden = true;
    }
    onChange = null;
  }

  return { open, close, parseSlides, exportPrint, exportPptx };
})();
