/* Ícones dos slides — traço no estilo Lucide (24x24, sem preenchimento).

   No texto do slide o ícone é uma linha `[icone: rede]`; ele sai ao lado do
   título, na cor de destaque do tema. Vale para todos os estilos.

   A preview e o PDF usam o SVG direto. O PPTX precisa de bitmap (o PowerPoint
   antigo e o Google Slides não abrem SVG), então png() rasteriza e guarda. */
window.Icones = (function () {
  'use strict';

  /* Cada ícone: o miolo do <svg>. */
  const LISTA = {
    livro: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    rede: '<rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/>',
    escudo: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    raio: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    alvo: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    ideia: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
    codigo: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
    terminal: '<path d="m4 17 6-6-6-6"/><path d="M12 19h8"/>',
    banco: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
    nuvem: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
    cadeado: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    chave: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
    engrenagem: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M2 12h3M19 12h3M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12"/>',
    grafico: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
    pessoas: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    relogio: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    calendario: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    pergunta: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    alerta: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    check: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    lupa: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    computador: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>',
    celular: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
    mundo: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    pasta: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    lista: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    foguete: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
    trofeu: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/><path d="M12 15v7"/>',
    mensagem: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    estrela: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
    // Redes e infraestrutura (usados nos diagramas).
    roteador: '<rect x="2" y="14" width="20" height="8" rx="2"/><path d="M6.01 18H6"/><path d="M10.01 18H10"/><path d="M15 10v4"/><path d="M17.84 7.17a4 4 0 0 0-5.66 0"/><path d="M20.66 4.34a8 8 0 0 0-11.31 0"/>',
    servidor: '<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><path d="M6 6h.01"/><path d="M6 18h.01"/>',
    switch: '<rect x="2" y="8" width="20" height="8" rx="2"/><path d="M6 12h.01M10 12h.01M14 12h.01M18 12h.01"/>',
    wifi: '<path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><path d="M12 20h.01"/>',
    antena: '<path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/>',
    firewall: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M12 3v6M8 9v6M16 9v6M12 15v6"/>',
    impressora: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    notebook: '<path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16"/>',
    usuario: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
    email: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/>',
    // Escritório, idiomas e informática básica.
    documento: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z"/><path d="M14 2v6h6"/><path d="M16 13H8M16 17H8M10 9H8"/>',
    dinheiro: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
    predio: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4M10 10h4M10 14h4M10 18h4"/>',
    maleta: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
    telefone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
    carrinho: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
    fala: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    altofalante: '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
    microfone: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/>',
    bandeira: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
    teclado: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"/>',
    mouse: '<rect x="5" y="2" width="14" height="20" rx="7"/><path d="M12 6v4"/>',
    pendrive: '<rect x="7" y="9" width="10" height="13" rx="2"/><path d="M9 9V2h6v7"/><path d="M11 5h.01M13 5h.01"/>',
    hd: '<path d="M22 12H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><path d="M6 16h.01M10 16h.01"/>',
    caneta: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  };

  const NOMES = Object.keys(LISTA);

  function existe(nome) {
    return Object.prototype.hasOwnProperty.call(LISTA, nome);
  }

  /* SVG completo. Sem cor, usa currentColor (a cor vem do CSS). */
  function svg(nome, cor) {
    if (!existe(nome)) return '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="${cor || 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${LISTA[nome]}</svg>`;
  }

  /* PNG de um ícone numa cor, para o PPTX. Fica em cache: o mesmo ícone se
     repete muito numa apresentação. */
  const cache = {};
  const LADO = 128;

  function png(nome, cor) {
    const k = nome + cor;
    if (cache[k]) return Promise.resolve(cache[k]);
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = c.height = LADO;
        c.getContext('2d').drawImage(img, 0, 0, LADO, LADO);
        resolve(cache[k] = c.toDataURL('image/png'));
      };
      img.onerror = () => resolve('');
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg(nome, cor).replace(/\s+/g, ' '));
    });
  }

  /* Já rasterizado? (a montagem do PPTX é síncrona e só lê o cache). */
  function pngPronto(nome, cor) {
    return cache[nome + cor] || '';
  }

  /* ---------- Diagramas ----------
     Bloco de linhas, sem linha em branco:
       [diagrama]
       pc1: computador "PC 1"
       sw: switch "Switch"
       pc1 - sw          (cabo)     pc1 -> sw (seta)     pc1 <-> sw (dupla)
     Os nós são dispostos em colunas, pela distância no grafo. */
  const NO_RE = /^([\w-]+)\s*:\s*([a-zà-ú-]+)(?:\s+["“'](.+?)["”'])?$/i;
  const LINK_RE = /^([\w-]+)\s*(<->|->|--|-)\s*([\w-]+)$/;
  const DIAGRAMA_RE = /^\[\s*diagrama\s*\]$/i;
  const DIAGRAMA_FIM_RE = /^\[\s*\/\s*diagrama\s*\]$/i;

  /* `[caixas: vetor|lista|pilha]`: linhas `rótulo: v1 | v2 | v3` (rótulo opcional). */
  const CAIXAS_RE = /^\[\s*caixas(?:\s*:\s*(vetor|lista|pilha))?\s*\]$/i;
  const LIM_CAIXAS = { vetor: 10, lista: 6, pilha: 6 };

  function ehDiagrama(linhas) {
    return linhas.length > 1 && (DIAGRAMA_RE.test(linhas[0]) || CAIXAS_RE.test(linhas[0]));
  }

  function lerCaixas(linhas) {
    const modo = (linhas[0].match(CAIXAS_RE)[1] || 'vetor').toLowerCase();
    const rows = [];
    for (const l of linhas.slice(1)) {
      if (/^\[\s*\/\s*caixas\s*\]$/i.test(l)) continue;
      const m = l.match(/^([^|:]{1,20}):\s*(.+)$/);
      const rotulo = m ? m[1].trim() : '';
      const valores = (m ? m[2] : l).split('|').map(v => v.trim()).filter(Boolean);
      if (!valores.length || valores.length > LIM_CAIXAS[modo]) return null;
      rows.push({ rotulo, valores });
    }
    if (!rows.length || rows.length > (modo === 'pilha' ? 1 : 3)) return null;
    return { caixas: true, modo, linhas: rows };
  }

  /* null se o bloco não for um diagrama válido (aí vira texto comum). */
  function lerDiagrama(linhas) {
    if (CAIXAS_RE.test(linhas[0])) return lerCaixas(linhas);
    const nos = [], links = [], ids = {};
    for (const l of linhas.slice(1)) {
      if (DIAGRAMA_FIM_RE.test(l)) continue;
      const n = l.match(NO_RE);
      if (n) {
        const id = n[1].toLowerCase(), icone = n[2].toLowerCase();
        if (!existe(icone) || ids[id]) return null;
        ids[id] = true;
        nos.push({ id, icone, rotulo: (n[3] || '').trim() });
        continue;
      }
      const k = l.match(LINK_RE);
      if (!k) return null;
      links.push({ a: k[1].toLowerCase(), b: k[3].toLowerCase(), seta: k[2] === '->' ? 1 : k[2] === '<->' ? 2 : 0 });
    }
    if (nos.length < 2 || nos.length > 8) return null;
    if (links.some(k => !ids[k.a] || !ids[k.b])) return null;
    return { nos, links };
  }

  const DG_W = 1000, DG_R = 44;

  /* Coluna de cada nó: distância (BFS) a partir de uma ponta do grafo. A ponta
     é a mais distante do primeiro nó, e o primeiro nó fica à esquerda. */
  function colunas(d) {
    const viz = {};
    d.nos.forEach(n => { viz[n.id] = []; });
    d.links.forEach(k => { viz[k.a].push(k.b); viz[k.b].push(k.a); });
    const bfs = origem => {
      const dist = { [origem]: 0 }, fila = [origem];
      while (fila.length) {
        const u = fila.shift();
        viz[u].forEach(v => { if (!(v in dist)) { dist[v] = dist[u] + 1; fila.push(v); } });
      }
      return dist;
    };
    const d0 = bfs(d.nos[0].id);
    const ponta = Object.keys(d0).reduce((m, id) => d0[id] > d0[m] ? id : m, d.nos[0].id);
    const dist = bfs(ponta);
    const max = Math.max(...Object.values(dist));
    const inverter = max > 0 && dist[d.nos[0].id] > max / 2;
    const col = {};
    d.nos.forEach(n => {
      // Nó solto (sem cabo) vai para a primeira coluna.
      const c = n.id in dist ? dist[n.id] : 0;
      col[n.id] = inverter ? max - c : c;
    });
    return col;
  }

  function layoutDiagrama(d) {
    const col = colunas(d);
    const nCols = Math.max(...Object.values(col)) + 1;
    const grupos = Array.from({ length: nCols }, () => []);
    d.nos.forEach(n => grupos[col[n.id]].push(n));
    const linhasMax = Math.max(...grupos.map(g => g.length));
    const H = Math.max(230, linhasMax * 170 + 30);
    const pos = {};
    grupos.forEach((g, i) => g.forEach((n, j) => {
      pos[n.id] = { x: DG_W * (i + 0.5) / nCols, y: H * (j + 0.5) / g.length };
    }));
    return { pos, H };
  }

  function proporcaoDiagrama(d) {
    if (d.caixas) return alturaCaixas(d) / DG_W;
    return layoutDiagrama(d).H / DG_W;
  }

  const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* SVG do diagrama. As cores vão em `style` para aceitar var(--slide-…) na
     tela; na rasterização (PPTX) entram hex. */
  function svgDiagrama(d, destaque, texto, id) {
    if (d.caixas) return svgCaixas(d, destaque, texto, id);
    const { pos, H } = layoutDiagrama(d);
    const mk = `dg-seta-${id || 0}`;
    const pontaSeta = `<polygon points="0,0 10,5 0,10" style="fill:${destaque}"/>`;
    const defs = `<defs><marker id="${mk}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">${pontaSeta}</marker></defs>`;
    const cabos = d.links.map(k => {
      const a = pos[k.a], b = pos[k.b];
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len, m = DG_R + 6;
      const x1 = a.x + ux * m, y1 = a.y + uy * m, x2 = b.x - ux * m, y2 = b.y - uy * m;
      const ms = (k.seta ? ` marker-end="url(#${mk})"` : '') + (k.seta === 2 ? ` marker-start="url(#${mk})"` : '');
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"`
        + ` style="stroke:${destaque}" stroke-width="4" stroke-linecap="round"${ms}/>`;
    }).join('');
    const nos = d.nos.map(n => {
      const p = pos[n.id];
      const rot = n.rotulo.length > 20 ? n.rotulo.slice(0, 19) + '…' : n.rotulo;
      return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${DG_R}" style="fill:${destaque};stroke:${destaque}" fill-opacity=".14" stroke-width="3"/>`
        + `<svg x="${(p.x - 24).toFixed(1)}" y="${(p.y - 24).toFixed(1)}" width="48" height="48" viewBox="0 0 24 24" fill="none"`
        + ` style="stroke:${destaque}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${LISTA[n.icone]}</svg>`
        + (rot ? `<text x="${p.x.toFixed(1)}" y="${(p.y + DG_R + 30).toFixed(1)}" text-anchor="middle"`
          + ` font-family="Poppins, 'Segoe UI', Arial, sans-serif" font-size="25" font-weight="700" style="fill:${texto}">${esc(rot)}</text>` : '');
    }).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${DG_W} ${H}">${defs}${cabos}${nos}</svg>`;
  }


  /* ---------- Caixas com valores (vetor, lista ligada, pilha) ---------- */
  const CX_H = 80;

  function alturaCaixas(d) {
    if (d.modo === 'pilha') return d.linhas[0].valores.length * 64 + 40;
    return d.linhas.length * 170 + 20;
  }

  function svgCaixas(d, destaque, texto, id) {
    const H = alturaCaixas(d);
    const mk = `cx-seta-${id || 0}`;
    const fonte = `font-family="Consolas, 'Courier New', monospace"`;
    const val = (v, x, y, tam) => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="central" ${fonte}`
      + ` font-size="${tam}" font-weight="700" style="fill:${texto}">${esc(v.length > 10 ? v.slice(0, 9) + '…' : v)}</text>`;
    const caixa = (x, y, w, h) => `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h}" rx="6"`
      + ` style="fill:${destaque};stroke:${destaque}" fill-opacity=".12" stroke-width="3"/>`;
    const seta = (x1, y1, x2, y2) => `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"`
      + ` style="stroke:${destaque}" stroke-width="4" stroke-linecap="round" marker-end="url(#${mk})"/>`;
    const defs = `<defs><marker id="${mk}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">`
      + `<polygon points="0,0 10,5 0,10" style="fill:${destaque}"/></marker></defs>`;
    let corpo = '';

    if (d.modo === 'pilha') {
      const vs = d.linhas[0].valores, w = 280, x0 = (DG_W - w) / 2;
      vs.forEach((v, i) => {
        corpo += caixa(x0, 20 + i * 64, w, 64) + val(v, DG_W / 2, 20 + i * 64 + 32, 30);
      });
      corpo += `<text x="${x0 - 24}" y="52" text-anchor="end" dominant-baseline="central" font-family="Poppins, 'Segoe UI', Arial, sans-serif"`
        + ` font-size="26" font-weight="700" style="fill:${destaque}">topo ▶</text>`;
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${DG_W} ${H}">${defs}${corpo}</svg>`;
    }

    d.linhas.forEach((ln, r) => {
      const y = 20 + r * 170;
      const x0 = ln.rotulo ? 190 : 30, area = DG_W - x0 - 30;
      if (ln.rotulo) {
        corpo += `<text x="30" y="${y + CX_H / 2}" dominant-baseline="central" font-family="Poppins, 'Segoe UI', Arial, sans-serif"`
          + ` font-size="28" font-weight="800" style="fill:${texto}">${esc(ln.rotulo)}</text>`;
      }
      const n = ln.valores.length;
      if (d.modo === 'vetor') {
        const cw = Math.min(130, area / n), ini = x0 + (area - cw * n) / 2;
        ln.valores.forEach((v, i) => {
          const x = ini + i * cw;
          corpo += caixa(x, y, cw, CX_H) + val(v, x + cw / 2, y + CX_H / 2, 32)
            + `<text x="${(x + cw / 2).toFixed(1)}" y="${y + CX_H + 26}" text-anchor="middle" ${fonte} font-size="22" style="fill:${texto}" fill-opacity=".6">${i}</text>`;
        });
      } else {
        const passo = area / (n + 1), bw = Math.min(150, passo * 0.62);
        ln.valores.forEach((v, i) => {
          const x = x0 + i * passo + (passo - bw) / 2, pw = bw * 0.32;
          corpo += caixa(x, y, bw, CX_H) + val(v, x + (bw - pw) / 2, y + CX_H / 2, 30)
            + `<line x1="${(x + bw - pw).toFixed(1)}" y1="${y}" x2="${(x + bw - pw).toFixed(1)}" y2="${y + CX_H}" style="stroke:${destaque}" stroke-width="3"/>`
            + `<circle cx="${(x + bw - pw / 2).toFixed(1)}" cy="${y + CX_H / 2}" r="6" style="fill:${destaque}"/>`;
          const px = x + bw - pw / 2, prox = x0 + (i + 1) * passo + (passo - bw) / 2;
          if (i < n - 1) corpo += seta(px, y + CX_H / 2, prox - 6, y + CX_H / 2);
          else corpo += seta(px, y + CX_H / 2, px + passo * 0.4, y + CX_H / 2)
            + `<text x="${(px + passo * 0.4 + 12).toFixed(1)}" y="${y + CX_H / 2}" dominant-baseline="central" ${fonte} font-size="26" font-weight="700" style="fill:${texto}" fill-opacity=".7">null</text>`;
        });
      }
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${DG_W} ${H}">${defs}${corpo}</svg>`;
  }

  /* PNG do diagrama para o PPTX (mesma ideia do png() dos ícones). */
  const cacheDg = {};
  const DG_PNG_W = 1600;

  function pngDiagrama(d, destaque, texto) {
    const s = svgDiagrama(d, destaque, texto, 'p');
    if (cacheDg[s]) return Promise.resolve(cacheDg[s]);
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = DG_PNG_W;
        c.height = Math.round(DG_PNG_W * proporcaoDiagrama(d));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(cacheDg[s] = c.toDataURL('image/png'));
      };
      img.onerror = () => resolve('');
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s.replace(/\s+/g, ' '));
    });
  }

  function pngDiagramaPronto(d, destaque, texto) {
    return cacheDg[svgDiagrama(d, destaque, texto, 'p')] || '';
  }

  return {
    NOMES, existe, svg, png, pngPronto,
    ehDiagrama, lerDiagrama, svgDiagrama, pngDiagrama, pngDiagramaPronto, proporcaoDiagrama,
  };
})();
