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

  /* ===================== Preview ===================== */

  function barHtml() {
    return '<div class="bar">'
      + BAR_COLORS.map(c => `<div style="background:#${c}"></div>`).join('')
      + '</div>';
  }

  function slideHtml(s) {
    return `<div class="slide-bg"></div>
      <div class="slide-content">
        <h1 class="slide-title">${inlineFormat(s.title)}</h1>
        <div class="slide-body">${s.bodyHtml}</div>
      </div>
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
    els.stage.innerHTML = slideHtml(s);
    els.page.textContent = `${current + 1} / ${slides.length}`;
    els.prev.disabled = current === 0;
    els.next.disabled = current === slides.length - 1;
    renderThumbs();
    scaleStage();
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
  .slide-bg{position:absolute;inset:0;background-image:
    repeating-linear-gradient(60deg, rgba(200,205,215,.35) 0px, rgba(200,205,215,.35) 1.5px, transparent 1.5px, transparent 46px),
    repeating-linear-gradient(-60deg, rgba(200,205,215,.35) 0px, rgba(200,205,215,.35) 1.5px, transparent 1.5px, transparent 46px),
    repeating-linear-gradient(0deg, rgba(200,205,215,.3) 0px, rgba(200,205,215,.3) 1.5px, transparent 1.5px, transparent 40px);}
  .slide-content{position:relative;flex:1;padding:6% 7% 4% 7%;display:flex;flex-direction:column;gap:14px;z-index:1;min-height:0;}
  .slide-title{font-size:2.6em;font-weight:800;color:#3d4a5c;margin:0 0 .1em 0;line-height:1.15;}
  .slide-body{font-size:1.05em;color:#3d4a5c;line-height:1.55;}
  .slide-body p{margin:0 0 .7em 0;}
  .slide-body ul{margin:.2em 0 0 0;padding-left:1.2em;list-style:disc;}
  .slide-body li{margin-bottom:.35em;}
  .slide-body strong{color:#3d4a5c;}
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
    const corpo = slides.map(s =>
      `<div class="pageBox"><section class="pslide${s.isTitleSlide ? ' title-slide' : ''}">${slideHtml(s)}</section></div>`
    ).join('\n');

    const doc = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>${escapeHtml(titulo)}</title><style>${PRINT_CSS}</style></head><body>
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
  function renderPptxBody(slide, blocks, x, y, w) {
    const CHARS_PER_LINE = 85;
    const LINE_H = 0.25;
    const PARA_GAP = 0.12;
    let cursorY = y;
    let pendingRuns = [];
    let estLines = 0;

    function flushText() {
      if (!pendingRuns.length) return;
      const height = Math.max(estLines, 1) * LINE_H + PARA_GAP;
      slide.addText(pendingRuns, {
        x, y: cursorY, w, h: height,
        fontSize: 15, color: '3D4A5C', fontFace: 'Arial', valign: 'top',
      });
      cursorY += height;
      pendingRuns = [];
      estLines = 0;
    }

    blocks.forEach(block => {
      if (block.type === 'code') {
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
          text: c, options: { color: '3D4A5C', valign: 'middle' },
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
                fontSize: 15, color: '3D4A5C', fontFace: 'Arial',
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
              fontSize: 15, color: '3D4A5C', fontFace: 'Arial',
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

      slides.forEach(s => {
        const slide = pptx.addSlide();
        slide.background = { color: 'FFFFFF' };

        // faixa colorida do rodapé (espelha o template da tela)
        const barY = 7.5 - 0.16;
        const segW = 13.333 / BAR_COLORS.length;
        BAR_COLORS.forEach((hex, i) => {
          slide.addShape('rect', {
            x: i * segW, y: barY, w: segW, h: 0.16,
            fill: { color: hex }, line: { type: 'none' },
          });
        });

        if (s.isTitleSlide) {
          slide.addText(s.title, {
            x: 0.6, y: 0, w: 13.333 - 1.2, h: 7.5 - 0.16,
            align: 'center', valign: 'middle',
            fontSize: 40, bold: true, color: '3D4A5C', fontFace: 'Arial',
          });
        } else {
          slide.addText(s.title, {
            x: 0.6, y: 0.45, w: 13.333 - 1.2, h: 1.0,
            fontSize: 32, bold: true, color: '3D4A5C', fontFace: 'Arial',
          });
          renderPptxBody(slide, s.blocks, 0.6, 1.55, 13.333 - 1.2);
        }
      });

      pptx.writeFile({ fileName: sanitizeFilename(titulo) + '.pptx' })
        .then(restaura)
        .catch(() => { restaura(); alert('Não foi possível gerar o arquivo PPTX.'); });
    } catch (err) {
      restaura();
      alert('Não foi possível gerar o arquivo PPTX.');
    }
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

    window.addEventListener('resize', requestScaleStage);
    if (window.ResizeObserver) new ResizeObserver(requestScaleStage).observe(els.stageOuter);
    document.addEventListener('keydown', e => {
      if (els.overlay.hidden) return;
      if (e.target === els.src) return;              // digitando: setas andam no texto
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { current++; renderStage(); }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { current--; renderStage(); }
    });
  }

  function open(texto, opts) {
    if (!els) bind();
    const o = opts || {};
    titulo = o.titulo || 'Slides';
    onChange = o.onChange || null;
    els.titulo.textContent = titulo;
    els.src.value = texto || '';
    current = 0;
    els.overlay.hidden = false;
    lastScale = -1;
    update();
    requestScaleStage();
  }

  function close() {
    if (els) els.overlay.hidden = true;
    onChange = null;
  }

  return { open, close, parseSlides, exportPrint, exportPptx };
})();
