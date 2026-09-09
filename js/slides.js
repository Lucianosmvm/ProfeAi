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

  /* Elementos desenhados pelo professor. Ficam guardados em % do slide: o mesmo
     número serve para a preview (qualquer tamanho de tela) e para este SVG de
     1600x900, então o que ele posiciona no painel é o que sai no PPTX. */
  const EL_PADRAO = { cor: '#4f46e5', opacidade: 100, texto: 'Texto', tamanho: 5, negrito: false, align: 'left' };

  /* Da caixa do texto até a linha de base da primeira linha, em múltiplos do
     corpo da fonte. É o que alinha o <text> do SVG com a <div> da preview. */
  const EL_QUEBRA = /\r?\n/;
  const EL_BASELINE = 0.95;
  const EL_ENTRELINHA = 1.2;

  function elementoSvg(f) {
    const x = f.x / 100 * BASE_SVG_W, y = f.y / 100 * BASE_SVG_H;
    const w = f.w / 100 * BASE_SVG_W, h = f.h / 100 * BASE_SVG_H;
    const op = (f.opacidade == null ? 100 : f.opacidade) / 100;
    const cor = f.cor || EL_PADRAO.cor;

    if (f.tipo === 'texto') {
      const fs = (f.tamanho || EL_PADRAO.tamanho) / 100 * BASE_SVG_H;
      const anchor = f.align === 'center' ? 'middle' : f.align === 'right' ? 'end' : 'start';
      const tx = f.align === 'center' ? x + w / 2 : f.align === 'right' ? x + w : x;
      // Linha vazia viraria tspan sem altura: o espaço segura o espaçamento.
      const tspans = String(f.texto || '').split(EL_QUEBRA)
        .map((l, i) => `<tspan x="${tx}" dy="${i === 0 ? 0 : fs * EL_ENTRELINHA}">${escapeHtml(l) || ' '}</tspan>`)
        .join('');
      return `<text x="${tx}" y="${y + fs * EL_BASELINE}" fill="${cor}" opacity="${op}"
        font-family="Arial, Helvetica, sans-serif" font-size="${fs}"
        font-weight="${f.negrito ? 700 : 400}" text-anchor="${anchor}">${tspans}</text>`;
    }
    if (f.tipo === 'ellipse') {
      return `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}"
        fill="${cor}" opacity="${op}"/>`;
    }
    if (f.tipo === 'triangle') {
      return `<polygon points="${x + w / 2},${y} ${x + w},${y + h} ${x},${y + h}"
        fill="${cor}" opacity="${op}"/>`;
    }
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${cor}" opacity="${op}"/>`;
  }

  function elementosSvg(b) {
    return (b.elementos || []).map(elementoSvg).join('');
  }

  /* Fundo: a imagem enviada OU a cor + a forma pronta. Os elementos vêm sempre
     por cima dos dois — é o que permite escrever sobre uma imagem de fundo. */
  function baseSvg(b, semElementos, capa) {
    const img = b.origem === 'imagem' && (b.imgPng || b.png);
    let fundo;
    if (img) {
      fundo = `<image href="${img}" x="0" y="0" width="${BASE_SVG_W}" height="${BASE_SVG_H}"
          preserveAspectRatio="xMidYMid slice"/>`;
    } else if (b.tema && window.Temas && Temas.get(b.tema)) {
      fundo = Temas.desenho(b.tema, b, capa);
    } else {
      fundo = `<rect width="100%" height="100%" fill="${b.fundo}"/>${formasSvg(b)}`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${BASE_SVG_W}" height="${BASE_SVG_H}"
      viewBox="0 0 ${BASE_SVG_W} ${BASE_SVG_H}">${fundo}${semElementos ? '' : elementosSvg(b)}</svg>`;
  }

  /* Um estilo pronto tem dois fundos: o de conteúdo e o da capa (o slide que só
     tem título). Sem estilo pronto, a capa usa o mesmo fundo dos demais. */
  function temCapaPropria(b) {
    return !!(b.pngCapa && b.tema && b.origem !== 'imagem');
  }

  /* Cor do texto no slide: na capa o fundo é o gradiente inteiro, então vale a
     cor de capa do tema. */
  function coresDoSlide(b, capa) {
    return (capa && temCapaPropria(b))
      ? { titulo: b.capaCor || '#ffffff', texto: b.capaCor || '#ffffff' }
      : { titulo: b.corTitulo, texto: b.corTexto };
  }

  function svgDataUrl(svg) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace(/\s+/g, ' '));
  }

  /* O PPTX precisa de bitmap: SVG não é formato de imagem aceito pelo
     PowerPoint. Rasteriza uma vez, na hora de aplicar a base. */
  function svgParaPng(svg, jpeg, q) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = BASE_SVG_W;
        c.height = BASE_SVG_H;
        const ctx = c.getContext('2d');
        // JPEG não tem transparência: sem este fundo a foto sai sobre preto.
        if (jpeg) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, BASE_SVG_W, BASE_SVG_H); }
        ctx.drawImage(img, 0, 0, BASE_SVG_W, BASE_SVG_H);
        resolve(jpeg ? c.toDataURL('image/jpeg', q || 0.88) : c.toDataURL('image/png'));
      };
      img.onerror = () => resolve('');
      img.src = svgDataUrl(svg);
    });
  }

  function baseAtual() {
    return base || (base = Storage.getBase());
  }

  /* Rasteriza a base e guarda. Estilo pronto e imagem de fundo saem em JPEG:
     são gradientes de ponta a ponta e em PNG passariam de 1 MB, estourando a
     cota do localStorage. A base montada à mão continua PNG. */
  async function rasterizarBase(b) {
    const chapado = b.origem === 'imagem' || !!b.tema;
    const composto = await svgParaPng(baseSvg(b), chapado, 0.94);
    if (composto) b.png = composto;
    b.pngCapa = (b.tema && b.origem !== 'imagem')
      ? (await svgParaPng(baseSvg(b, false, true), true, 0.94) || '')
      : '';
    return b;
  }

  function salvarBase(b) {
    try {
      Storage.setBase(b);
    } catch (err) {
      alert('Não foi possível salvar a base do slide: o armazenamento do navegador está cheio. '
        + 'Apague materiais antigos do histórico e tente de novo.');
      return false;
    }
    base = Storage.getBase();
    return true;
  }

  /* Base salva sem o bitmap (estilo padrão de fábrica, ou troca de versão):
     desenha uma vez, na primeira abertura. */
  async function garantirBasePng() {
    const b = Storage.getBase();
    if (b.origem === 'imagem' || !b.tema || (b.png && b.pngCapa)) return;
    await rasterizarBase(b);
    salvarBase(b);
  }

  /* ---------- API para o resto do app (painel de geração) ---------- */

  async function aplicarTema(id) {
    const patch = window.Temas ? Temas.patchBase(id) : null;
    if (!patch) return false;
    const b = { ...Storage.getBase(), ...patch, imgPng: '' };
    await rasterizarBase(b);
    if (!salvarBase(b)) return false;
    if (els && !els.overlay.hidden) renderStage();
    return true;
  }

  async function usarImagemBase(file) {
    const rec = await Imagens.adicionar(file);
    if (!rec) return false;
    // A imagem de fundo não entra na galeria: ela é a base, não um elemento.
    Imagens.remover(rec.id);
    const b = { ...Storage.getBase(), origem: 'imagem', imgPng: rec.dataUrl, png: rec.dataUrl };
    await rasterizarBase(b);
    if (!salvarBase(b)) return false;
    if (els && !els.overlay.hidden) renderStage();
    return true;
  }

  /* O que está aplicado agora — o painel de geração usa para marcar o cartão. */
  function baseInfo() {
    const b = Storage.getBase();
    return { tema: b.tema, origem: b.origem, forma: b.forma };
  }

  /* Estilo do fundo de um slide: a base do professor, ou nada (o CSS cai na
     hachura padrão quando não há imagem). */
  function bgStyle(capa) {
    const b = baseAtual();
    const png = (capa && temCapaPropria(b)) ? b.pngCapa : b.png;
    return png
      ? ` style="background-image:url('${png}');background-size:cover;background-position:center;"`
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
    const capa = !!s.isTitleSlide;
    const png = (capa && temCapaPropria(b)) ? b.pngCapa : b.png;
    // As cores vão inline no slide: a capa pode ter cor própria, e assim a
    // janela de impressão herda a mesma regra sem depender do :root.
    const c = coresDoSlide(b, capa);
    const vars = ` style="--slide-titulo:${c.titulo};--slide-texto:${c.texto};"`;
    return `<div class="slide-bg"${png ? ' data-base="1"' : ''}${bgStyle(capa)}></div>
      <div class="slide-content"${vars}>
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
    aplicarCoresTexto(els.stage, s.isTitleSlide);
    els.stage.innerHTML = slideHtml(s);
    els.page.textContent = `${current + 1} / ${slides.length}`;
    els.prev.disabled = current === 0;
    els.next.disabled = current === slides.length - 1;
    renderThumbs();
    renderPosicionadas(s);
    scaleStage();
  }

  /* As cores do texto vêm da base e entram como variáveis CSS. */
  function aplicarCoresTexto(el, capa) {
    const c = coresDoSlide(baseAtual(), capa);
    el.style.setProperty('--slide-titulo', c.titulo);
    el.style.setProperty('--slide-texto', c.texto);
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

      slides.forEach(s => {
        const slide = pptx.addSlide();
        const capa = !!s.isTitleSlide;
        const corDoTitulo = hex(coresDoSlide(b, capa).titulo);
        slide.background = { color: hex(b.fundo) };

        // A base montada (ou a imagem de fundo) entra como imagem de página
        // inteira; a capa tem a sua, quando o estilo pronto define uma.
        const fundoPng = (capa && temCapaPropria(b)) ? b.pngCapa : b.png;
        if (fundoPng) slide.addImage({ data: fundoPng, x: 0, y: 0, w: 13.333, h: 7.5 });

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

        if (capa) {
          slide.addText(s.title, {
            x: 0.6, y: 0, w: 13.333 - 1.2, h: 7.5 - 0.16,
            align: 'center', valign: 'middle',
            fontSize: 40, bold: true, color: corDoTitulo, fontFace: 'Arial',
          });
        } else {
          slide.addText(s.title, {
            x: 0.6, y: 0.45, w: 13.333 - 1.2, h: 1.0,
            fontSize: 32, bold: true, color: corDoTitulo, fontFace: 'Arial',
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
    // Copia profunda: o rascunho nao pode alterar a base ja aplicada nos
    // slides enquanto o professor ainda pode cancelar.
    const b = baseAtual();
    baseRascunho = { ...b, elementos: (b.elementos || []).map(f => ({ ...f })) };
    // Base salva antes do montador de elementos: a imagem crua so existia em `png`.
    if (baseRascunho.origem === 'imagem' && !baseRascunho.imgPng) {
      baseRascunho.imgPng = baseRascunho.png;
    }
    elFerramenta = null;
    elSel = null;
    els.baseVerCapa.checked = false;
    els.baseFundo.value = baseRascunho.fundo;
    els.baseDestaque.value = baseRascunho.destaque;
    els.baseCorTitulo.value = baseRascunho.corTitulo;
    els.baseCorTexto.value = baseRascunho.corTexto;
    els.baseBarra.checked = !!baseRascunho.barra;
    els.baseModal.hidden = false;
    renderTemas();
    renderBasePreview();
  }

  function fecharBase() {
    els.baseModal.hidden = true;
    baseRascunho = null;
    elFerramenta = null;
    elSel = null;
    elDrag = null;
  }

  function lerControles() {
    baseRascunho.fundo = els.baseFundo.value;
    baseRascunho.destaque = els.baseDestaque.value;
    baseRascunho.corTitulo = els.baseCorTitulo.value;
    baseRascunho.corTexto = els.baseCorTexto.value;
    baseRascunho.barra = els.baseBarra.checked;
  }

  /* ---------- Galeria de estilos do painel ----------
     Um cartão por estilo pronto (js/temas.js) e um por forma básica. Escolher
     um cartão é também o jeito de sair de uma imagem de fundo sem resetar tudo. */
  const FORMAS_BASICAS = [
    { forma: 'grade', nome: 'Hachura' },
    { forma: 'limpo', nome: 'Sem formas' },
    { forma: 'faixa', nome: 'Faixa lateral' },
    { forma: 'topo', nome: 'Barra no topo' },
    { forma: 'canto', nome: 'Bloco no canto' },
    { forma: 'diagonal', nome: 'Diagonais' },
  ];

  function miniaturaBasica(forma) {
    const b = baseRascunho || baseAtual();
    return svgDataUrl(baseSvg({ ...b, tema: '', origem: 'formas', forma }, true));
  }

  function cartaoTema(sel, url, nome, dataset) {
    return `<button type="button" class="tema-card${sel ? ' sel' : ''}" ${dataset}
      title="${escapeHtml(nome)}"><img src="${url}" alt=""><span>${escapeHtml(nome)}</span></button>`;
  }

  function renderTemas() {
    const b = baseRascunho;
    const usandoImagem = b.origem === 'imagem';
    const prontos = (window.Temas ? Temas.LISTA : []).map(t => cartaoTema(
      !usandoImagem && b.tema === t.id,
      Temas.previewUrl(t.id, false, null),
      t.nome,
      `data-tema="${t.id}"`,
    )).join('');
    const basicas = FORMAS_BASICAS.map(f => cartaoTema(
      !usandoImagem && !b.tema && b.forma === f.forma,
      miniaturaBasica(f.forma),
      f.nome,
      `data-forma="${f.forma}"`,
    )).join('');
    els.baseTemas.innerHTML =
      `<div class="tema-grupo"><span class="tema-grupo-nome">Profissionais (cores vivas)</span>
        <div class="tema-grade">${prontos}</div></div>
       <div class="tema-grupo"><span class="tema-grupo-nome">Básicos</span>
        <div class="tema-grade">${basicas}</div></div>`;
  }

  /* Escolher um estilo troca as cores junto: é o pacote fechado do tema. O
     professor pode ajustar as cores logo depois, nos seletores ao lado. */
  function escolherTema(id) {
    const patch = window.Temas ? Temas.patchBase(id) : null;
    if (!patch) return;
    Object.assign(baseRascunho, patch);
    els.baseFundo.value = baseRascunho.fundo;
    els.baseDestaque.value = baseRascunho.destaque;
    els.baseCorTitulo.value = baseRascunho.corTitulo;
    els.baseCorTexto.value = baseRascunho.corTexto;
    els.baseBarra.checked = !!baseRascunho.barra;
    renderTemas();
    renderBasePreview();
  }

  function escolherForma(forma) {
    baseRascunho.tema = '';
    baseRascunho.forma = forma;
    baseRascunho.origem = 'formas';
    renderTemas();
    renderBasePreview();
  }

  /* Preview do painel: mostra a base com as zonas de título e conteúdo por
     cima. As zonas são só guia — nunca entram no slide. */
  function renderBasePreview() {
    const b = baseRascunho;
    // A capa só existe nos estilos prontos; nos demais o botão não muda nada.
    const capa = els.baseVerCapa.checked && !!b.tema && b.origem !== 'imagem';
    const corT = capa ? (b.capaCor || '#ffffff') : b.corTitulo;
    const corC = capa ? (b.capaCor || '#ffffff') : b.corTexto;
    // Fundo sem os elementos: eles entram como HTML, para poderem ser arrastados.
    els.baseCanvas.style.backgroundImage = `url('${svgDataUrl(baseSvg(b, true, capa))}')`;

    const zona = (z, classe, rotulo) =>
      `<div class="base-zona ${classe}" style="left:${z.x}%;top:${z.y}%;width:${z.w}%;height:${z.h}%">`
      + `<span>${rotulo}</span></div>`;

    els.baseCanvas.innerHTML =
      `<div class="base-amostra" style="left:${ZONAS.titulo.x}%;top:${ZONAS.titulo.y}%;`
      + `width:${ZONAS.titulo.w}%;color:${corT}">Título do slide</div>`
      + `<div class="base-amostra base-amostra-corpo" style="left:${ZONAS.conteudo.x}%;`
      + `top:${ZONAS.conteudo.y}%;width:${ZONAS.conteudo.w}%;color:${corC}">`
      + 'Texto do conteúdo, bullets e tabelas caem aqui.</div>'
      + zona(ZONAS.titulo, 'z-titulo', 'ÁREA DO TÍTULO')
      + zona(ZONAS.conteudo, 'z-conteudo', 'ÁREA DO CONTEÚDO')
      + (b.barra ? zona(ZONAS.barra, 'z-barra', '') : '')
      + elementosHtml();

    els.baseBarraPreview.hidden = !b.barra;
    renderElUI();
  }


  /* ----- Elementos da base: desenhar, mover, redimensionar ----- */

  let elFerramenta = null;   // ferramenta armada ('rect', 'texto'...) ou null = selecionar
  let elSel = null;          // id do elemento selecionado
  let elDrag = null;         // arrasto em curso

  const EL_MIN = 2;          // % — menor que isso o elemento some e nao da para pegar

  function clampPct(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function elLista() {
    if (!Array.isArray(baseRascunho.elementos)) baseRascunho.elementos = [];
    return baseRascunho.elementos;
  }

  function elAtual() {
    return baseRascunho ? elLista().find(f => f.id === elSel) || null : null;
  }

  function novoElId() {
    return 'e' + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36);
  }

  /* Um elemento por vez no DOM: e o mesmo retangulo em % que vai para o SVG. */
  function elementoHtml(f, alturaPx) {
    const op = (f.opacidade == null ? 100 : f.opacidade) / 100;
    const cor = f.cor || EL_PADRAO.cor;
    let interno;
    if (f.tipo === 'texto') {
      const fs = (f.tamanho || EL_PADRAO.tamanho) / 100 * alturaPx;
      interno = `<div class="base-el-txt" style="color:${cor};font-size:${fs}px;`
        + `font-weight:${f.negrito ? 700 : 400};text-align:${f.align || 'left'};`
        + `line-height:${EL_ENTRELINHA}">${escapeHtml(f.texto || '')}</div>`;
    } else {
      const molde = f.tipo === 'ellipse' ? 'border-radius:50%'
        : f.tipo === 'triangle' ? 'clip-path:polygon(50% 0,100% 100%,0 100%)' : '';
      interno = `<div class="base-el-fill" style="background:${cor};${molde}"></div>`;
    }
    const sel = f.id === elSel;
    const alcas = sel
      ? ['nw', 'ne', 'sw', 'se'].map(h => `<i class="base-el-h h-${h}" data-h="${h}"></i>`).join('')
      : '';
    return `<div class="base-el${sel ? ' sel' : ''}" data-id="${f.id}"`
      + ` style="left:${f.x}%;top:${f.y}%;width:${f.w}%;height:${f.h}%;opacity:${op}">`
      + `${interno}${alcas}</div>`;
  }

  function elementosHtml() {
    const alturaPx = els.baseCanvas.clientHeight || 300;
    return elLista().map(f => elementoHtml(f, alturaPx)).join('');
  }

  /* Ponto do ponteiro em % da base — a mesma unidade em que o elemento vive. */
  function elPonto(e) {
    const r = els.baseCanvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.width * 100,
      y: (e.clientY - r.top) / r.height * 100,
    };
  }

  /* Durante o arrasto mexe so no style do no: refazer o painel inteiro a cada
     pixel picotaria o movimento. O modelo ja esta atualizado. */
  function elAplicarEstilo(f) {
    const no = els.baseCanvas.querySelector('.base-el[data-id="' + f.id + '"]');
    if (!no) return;
    no.style.left = f.x + '%';
    no.style.top = f.y + '%';
    no.style.width = f.w + '%';
    no.style.height = f.h + '%';
  }

  function elPointerDown(e) {
    if (!baseRascunho || e.button !== 0) return;
    const p = elPonto(e);

    if (elFerramenta) {
      const f = Object.assign({}, EL_PADRAO, {
        id: novoElId(), tipo: elFerramenta,
        x: p.x, y: p.y, w: 0, h: 0,
        cor: baseRascunho.destaque || EL_PADRAO.cor,
      });
      elLista().push(f);
      elSel = f.id;
      elDrag = { modo: 'novo', id: f.id, x0: p.x, y0: p.y };
    } else {
      const alca = e.target.closest('.base-el-h');
      const alvo = e.target.closest('.base-el');
      if (!alvo) {
        if (elSel === null) return;
        elSel = null;
        renderBasePreview();
        return;
      }
      const f = elLista().find(x => x.id === alvo.dataset.id);
      if (!f) return;
      elSel = f.id;
      elDrag = alca
        ? { modo: 'redim', id: f.id, canto: alca.dataset.h, orig: Object.assign({}, f) }
        : { modo: 'mover', id: f.id, dx: p.x - f.x, dy: p.y - f.y };
    }
    e.preventDefault();
    try { els.baseCanvas.setPointerCapture(e.pointerId); } catch { /* ponteiro ja solto */ }
    renderBasePreview();
  }

  function elPointerMove(e) {
    if (!elDrag || !baseRascunho) return;
    const f = elLista().find(x => x.id === elDrag.id);
    if (!f) { elDrag = null; return; }
    const p = elPonto(e);

    if (elDrag.modo === 'novo') {
      f.x = clampPct(Math.min(elDrag.x0, p.x), 0, 100);
      f.y = clampPct(Math.min(elDrag.y0, p.y), 0, 100);
      f.w = clampPct(Math.abs(p.x - elDrag.x0), 0, 100 - f.x);
      f.h = clampPct(Math.abs(p.y - elDrag.y0), 0, 100 - f.y);
    } else if (elDrag.modo === 'mover') {
      f.x = clampPct(p.x - elDrag.dx, 0, 100 - f.w);
      f.y = clampPct(p.y - elDrag.dy, 0, 100 - f.h);
    } else {
      // Redimensionar: o canto oposto ao puxado fica parado.
      const o = elDrag.orig;
      const fixoX = (elDrag.canto === 'nw' || elDrag.canto === 'sw') ? o.x + o.w : o.x;
      const fixoY = (elDrag.canto === 'nw' || elDrag.canto === 'ne') ? o.y + o.h : o.y;
      const px = clampPct(p.x, 0, 100), py = clampPct(p.y, 0, 100);
      f.x = Math.min(px, fixoX);
      f.y = Math.min(py, fixoY);
      f.w = Math.min(Math.max(EL_MIN, Math.abs(px - fixoX)), 100 - f.x);
      f.h = Math.min(Math.max(EL_MIN, Math.abs(py - fixoY)), 100 - f.y);
    }
    elAplicarEstilo(f);
  }

  function elPointerUp() {
    if (!elDrag || !baseRascunho) { elDrag = null; return; }
    const f = elLista().find(x => x.id === elDrag.id);
    if (elDrag.modo === 'novo' && f) {
      // Clique sem arrastar: entrega um elemento ja em tamanho utilizavel.
      if (f.w < EL_MIN || f.h < EL_MIN) {
        const d = f.tipo === 'texto' ? { w: 40, h: 9 } : { w: 20, h: 14 };
        f.w = Math.min(d.w, 100 - f.x);
        f.h = Math.min(d.h, 100 - f.y);
      }
      elFerramenta = null;    // uma forma por clique no botao: evita desenhar sem querer
    }
    elDrag = null;
    renderBasePreview();
  }

  function elRemover() {
    const f = elAtual();
    if (!f) return;
    baseRascunho.elementos = elLista().filter(x => x.id !== f.id);
    elSel = null;
    renderBasePreview();
  }

  function elDuplicar() {
    const f = elAtual();
    if (!f) return;
    const copia = Object.assign({}, f, {
      id: novoElId(),
      x: clampPct(f.x + 3, 0, 100 - f.w),
      y: clampPct(f.y + 3, 0, 100 - f.h),
    });
    elLista().push(copia);
    elSel = copia.id;
    renderBasePreview();
  }

  /* Ordem no array = ordem de desenho: o ultimo fica por cima. */
  function elOrdem(paraFrente) {
    const f = elAtual();
    if (!f) return;
    const lista = elLista();
    const i = lista.indexOf(f);
    if (i < 0) return;
    lista.splice(i, 1);
    if (paraFrente) lista.push(f); else lista.unshift(f);
    renderBasePreview();
  }

  /* Escreve uma propriedade no elemento selecionado e redesenha. */
  function elSet(campo, valor) {
    const f = elAtual();
    if (!f) return;
    f[campo] = valor;
    renderBasePreview();
  }

  function renderElUI() {
    const f = elAtual();
    els.baseTools.querySelectorAll('button[data-tool]').forEach(b => {
      b.classList.toggle('ativo', b.dataset.tool === elFerramenta);
    });
    els.baseCanvas.classList.toggle('desenhando', !!elFerramenta);
    els.baseElDica.textContent = elFerramenta
      ? 'Arraste na base para desenhar. Esc cancela.'
      : (f ? 'Arraste para mover, puxe os cantos para redimensionar. Setas ajustam, Delete apaga.'
        : 'Escolha uma forma acima e arraste sobre a base para criá-la.');

    els.baseProps.hidden = !f;
    if (!f) return;
    els.baseElCor.value = f.cor || EL_PADRAO.cor;
    els.baseElOp.value = f.opacidade == null ? 100 : f.opacidade;
    const ehTexto = f.tipo === 'texto';
    els.baseElTextoGrupo.hidden = !ehTexto;
    if (ehTexto) {
      if (document.activeElement !== els.baseElTexto) els.baseElTexto.value = f.texto || '';
      els.baseElTam.value = f.tamanho || EL_PADRAO.tamanho;
      els.baseElNegrito.checked = !!f.negrito;
      els.baseElAlign.value = f.align || 'left';
    }
  }

  async function aplicarBase() {
    const b = baseRascunho;
    els.baseAplicar.disabled = true;
    els.baseAplicar.textContent = 'Aplicando…';
    // Tudo vira bitmap — fundo, estilo e elementos — porque o PowerPoint não
    // aceita SVG.
    await rasterizarBase(b);
    salvarBase(b);
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
      baseTemas: $('base-temas'),
      baseVerCapa: $('base-ver-capa'),
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
      // editor de elementos da base
      baseTools: $('base-el-tools'),
      baseProps: $('base-el-props'),
      baseElCor: $('base-el-cor'),
      baseElOp: $('base-el-op'),
      baseElTextoGrupo: $('base-el-texto-grupo'),
      baseElTexto: $('base-el-texto'),
      baseElTam: $('base-el-tam'),
      baseElNegrito: $('base-el-negrito'),
      baseElAlign: $('base-el-align'),
      baseElFrente: $('base-el-frente'),
      baseElTras: $('base-el-tras'),
      baseElDup: $('base-el-dup'),
      baseElDel: $('base-el-del'),
      baseElLimpar: $('base-el-limpar'),
      baseElDica: $('base-el-dica'),
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
    [els.baseFundo, els.baseDestaque, els.baseCorTitulo,
      els.baseCorTexto, els.baseBarra].forEach(el => {
      // As miniaturas usam as cores atuais: mudou a cor, a galeria acompanha.
      const aplicar = () => { lerControles(); renderTemas(); renderBasePreview(); };
      el.addEventListener('input', aplicar);
      el.addEventListener('change', aplicar);
    });
    els.baseVerCapa.addEventListener('change', renderBasePreview);
    els.baseTemas.addEventListener('click', e => {
      const card = e.target.closest('.tema-card');
      if (!card) return;
      if (card.dataset.tema) escolherTema(card.dataset.tema);
      else if (card.dataset.forma) escolherForma(card.dataset.forma);
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
      // A crua fica separada: `png` passa a ser a composicao com os elementos.
      baseRascunho.imgPng = rec.dataUrl;
      baseRascunho.png = rec.dataUrl;
      els.baseVerCapa.checked = false;
      renderTemas();
      renderBasePreview();
    });
    els.baseReset.addEventListener('click', () => {
      baseRascunho = { ...Storage.BASE_PADRAO, elementos: [] };
      elFerramenta = null;
      elSel = null;
      els.baseFundo.value = baseRascunho.fundo;
      els.baseDestaque.value = baseRascunho.destaque;
      els.baseCorTitulo.value = baseRascunho.corTitulo;
      els.baseCorTexto.value = baseRascunho.corTexto;
      els.baseBarra.checked = baseRascunho.barra;
      els.baseVerCapa.checked = false;
      renderTemas();
      renderBasePreview();
    });


    // --- elementos da base ---
    els.baseTools.addEventListener('click', e => {
      const b = e.target.closest('button[data-tool]');
      if (!b) return;
      elFerramenta = elFerramenta === b.dataset.tool ? null : b.dataset.tool;
      renderElUI();
    });
    els.baseCanvas.addEventListener('pointerdown', elPointerDown);
    els.baseCanvas.addEventListener('pointermove', elPointerMove);
    els.baseCanvas.addEventListener('pointerup', elPointerUp);
    els.baseCanvas.addEventListener('pointercancel', elPointerUp);

    els.baseElCor.addEventListener('input', () => elSet('cor', els.baseElCor.value));
    els.baseElOp.addEventListener('input', () => elSet('opacidade', +els.baseElOp.value));
    els.baseElTexto.addEventListener('input', () => elSet('texto', els.baseElTexto.value));
    els.baseElTam.addEventListener('input', () => elSet('tamanho', +els.baseElTam.value));
    els.baseElNegrito.addEventListener('change', () => elSet('negrito', els.baseElNegrito.checked));
    els.baseElAlign.addEventListener('change', () => elSet('align', els.baseElAlign.value));
    els.baseElFrente.addEventListener('click', () => elOrdem(true));
    els.baseElTras.addEventListener('click', () => elOrdem(false));
    els.baseElDup.addEventListener('click', elDuplicar);
    els.baseElDel.addEventListener('click', elRemover);
    els.baseElLimpar.addEventListener('click', () => {
      if (!elLista().length) return;
      if (!confirm('Apagar todos os elementos desenhados na base?')) return;
      baseRascunho.elementos = [];
      elSel = null;
      renderBasePreview();
    });

    // O tamanho do texto e calculado em px a partir da altura da base: mudou o
    // tamanho da janela, os elementos precisam ser redesenhados.
    if (window.ResizeObserver) {
      new ResizeObserver(() => { if (baseRascunho) renderBasePreview(); }).observe(els.baseCanvas);
    }

    window.addEventListener('resize', requestScaleStage);
    if (window.ResizeObserver) new ResizeObserver(requestScaleStage).observe(els.stageOuter);
    document.addEventListener('keydown', e => {
      if (els.overlay.hidden) return;
      if (!els.baseModal.hidden) {                   // painel da base abre na frente
        if (e.key === 'Escape') {
          // Esc desfaz uma camada por vez: ferramenta, selecao, painel.
          if (elFerramenta) { elFerramenta = null; renderElUI(); }
          else if (elSel) { elSel = null; renderBasePreview(); }
          else fecharBase();
          return;
        }
        if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '')) return;
        const sel = elAtual();
        if (!sel) return;
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); elRemover(); return; }
        const passo = e.shiftKey ? 5 : 0.5;
        const mov = {
          ArrowLeft: [-passo, 0], ArrowRight: [passo, 0],
          ArrowUp: [0, -passo], ArrowDown: [0, passo],
        }[e.key];
        if (mov) {
          e.preventDefault();
          sel.x = clampPct(sel.x + mov[0], 0, 100 - sel.w);
          sel.y = clampPct(sel.y + mov[1], 0, 100 - sel.h);
          renderBasePreview();
        }
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
    await garantirBasePng();
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

  return { open, close, parseSlides, exportPrint, exportPptx, aplicarTema, usarImagemBase, baseInfo };
})();
