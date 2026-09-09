/* Estilos prontos da base do slide.

   Cada tema é uma paleta viva + um desenho de fundo (layout). O desenho é SVG
   1600x900 — a mesma tela da base montada à mão — e sai rasterizado em PNG na
   hora de aplicar, porque é esse bitmap que vai para a preview, o PDF e o PPTX.

   Dois desenhos por tema:
     • conteúdo — enfeites só nas margens, o miolo fica limpo para o texto;
     • capa     — gradiente inteiro, para o slide de título (o que só tem título).

   As cores ficam na base (fundo/destaque/destaque2), não aqui: o professor
   escolhe o estilo e ainda pode trocar as cores nos seletores do montador. */
window.Temas = (function () {
  'use strict';

  const W = 1600;
  const H = 900;

  /* Zonas ocupadas pelo texto (mesmas de ZONAS em slides.js), em px desta tela:
       título   x 72..1524   y 54..174
       conteúdo x 72..1524   y 186..857
     Formas fortes ficam fora disso; o que passa por dentro vai com opacidade
     baixa para não competir com a leitura. */

  /* ---------- Helpers de SVG ---------- */

  function lg(id, c1, c2, dir) {
    const d = dir === 'v' ? ['0%', '0%', '0%', '100%']
      : dir === 'd' ? ['0%', '0%', '100%', '100%']
        : ['0%', '0%', '100%', '0%'];
    return `<linearGradient id="${id}" x1="${d[0]}" y1="${d[1]}" x2="${d[2]}" y2="${d[3]}">
      <stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient>`;
  }

  /* Brilho difuso: círculo grande que some nas bordas. */
  function rg(id, cor, forca) {
    return `<radialGradient id="${id}">
      <stop offset="0%" stop-color="${cor}" stop-opacity="${forca}"/>
      <stop offset="100%" stop-color="${cor}" stop-opacity="0"/></radialGradient>`;
  }

  function pontos(id, cor) {
    return `<pattern id="${id}" width="34" height="34" patternUnits="userSpaceOnUse">
      <circle cx="4" cy="4" r="3.2" fill="${cor}" opacity="0.5"/></pattern>`;
  }

  /* Margem do texto: .slide-content tem padding de 7%, então o texto começa em
     112px e termina em 1488px. É por eles que os acentos se alinham. */
  const TX = 112;
  const TW = W - TX * 2;

  /* Barra de acento embaixo do título — assinatura visual comum aos temas. */
  function acento(larg) {
    return `<rect x="${TX}" y="176" width="${larg || 120}" height="7" rx="3.5" fill="url(#g1)"/>`;
  }

  /* Fundo da capa: gradiente cheio, igual em todos os layouts. */
  function capaFundo() {
    return `<rect width="${W}" height="${H}" fill="url(#g1)"/>`;
  }

  /* ---------- Layouts ---------- */
  /* Cada layout recebe { fundo, d1, d2 } e devolve o miolo do SVG. */

  const LAYOUTS = {

    /* Barra de gradiente na lateral esquerda + brilho no canto. */
    lateral: {
      conteudo: p => `<defs>${lg('g1', p.d1, p.d2, 'v')}${rg('b1', p.d2, 0.5)}</defs>
        <rect width="${W}" height="${H}" fill="${p.fundo}"/>
        <circle cx="${W}" cy="0" r="430" fill="url(#b1)" opacity="0.5"/>
        <rect x="0" y="0" width="30" height="${H}" fill="url(#g1)"/>
        <rect x="44" y="0" width="5" height="${H}" fill="${p.d2}" opacity="0.28"/>
        <path d="M${W},${H} L${W},690 L1310,${H} Z" fill="url(#g1)" opacity="0.16"/>
        ${acento(120)}`,
      capa: p => `<defs>${lg('g1', p.d1, p.d2, 'd')}</defs>
        ${capaFundo()}
        <circle cx="1370" cy="150" r="330" fill="#ffffff" opacity="0.07"/>
        <circle cx="1510" cy="770" r="250" fill="#ffffff" opacity="0.05"/>
        <path d="M0,${H} L540,${H} L0,450 Z" fill="#ffffff" opacity="0.06"/>
        <rect x="0" y="0" width="30" height="${H}" fill="#ffffff" opacity="0.35"/>`,
    },

    /* Blocos e réguas — o visual de template corporativo. */
    blocos: {
      conteudo: p => `<defs>${lg('g1', p.d1, p.d2, 'r')}</defs>
        <rect width="${W}" height="${H}" fill="${p.fundo}"/>
        <path d="M1330,0 L${W},0 L${W},250 Z" fill="${p.d2}" opacity="0.10"/>
        <rect x="0" y="0" width="${W}" height="11" fill="url(#g1)"/>
        <rect x="1530" y="46" width="58" height="58" rx="10" fill="url(#g1)" opacity="0.9"/>
        <rect x="${TX}" y="172" width="${TW}" height="3" fill="${p.d1}" opacity="0.14"/>
        <rect x="${TX}" y="169" width="180" height="8" rx="4" fill="url(#g1)"/>
        <rect x="1180" y="884" width="420" height="16" fill="url(#g1)"/>
        <rect x="0" y="884" width="1180" height="16" fill="${p.d1}" opacity="0.10"/>`,
      capa: p => `<defs>${lg('g1', p.d1, p.d2, 'd')}</defs>
        ${capaFundo()}
        <rect x="1180" y="0" width="${W - 1180}" height="${H}" fill="#ffffff" opacity="0.05"/>
        <rect x="1264" y="120" width="150" height="150" rx="20" fill="#ffffff" opacity="0.10"/>
        <rect x="1264" y="300" width="150" height="150" rx="20" fill="#ffffff" opacity="0.07"/>
        <rect x="1264" y="480" width="150" height="150" rx="20" fill="#ffffff" opacity="0.05"/>
        <rect x="0" y="0" width="${W}" height="14" fill="#ffffff" opacity="0.35"/>`,
    },

    /* Faixa fina no topo + cunha diagonal no canto. */
    topo: {
      conteudo: p => `<defs>${lg('g1', p.d1, p.d2, 'r')}${rg('b1', p.d1, 0.45)}</defs>
        <rect width="${W}" height="${H}" fill="${p.fundo}"/>
        <path d="M1240,0 L${W},0 L${W},200 Z" fill="${p.d1}" opacity="0.11"/>
        <circle cx="90" cy="840" r="150" fill="url(#b1)" opacity="0.55"/>
        <rect x="0" y="0" width="${W}" height="14" fill="url(#g1)"/>
        <rect x="0" y="884" width="540" height="16" fill="url(#g1)"/>
        <rect x="540" y="884" width="1060" height="16" fill="${p.d1}" opacity="0.12"/>
        ${acento(140)}`,
      capa: p => `<defs>${lg('g1', p.d1, p.d2, 'r')}</defs>
        ${capaFundo()}
        <path d="M0,${H} L${W},${H} L${W},620 Z" fill="#ffffff" opacity="0.07"/>
        <path d="M0,0 L620,0 L0,420 Z" fill="#ffffff" opacity="0.06"/>
        <circle cx="1420" cy="180" r="190" fill="#ffffff" opacity="0.06"/>`,
    },

    /* Ondas suaves na base — mais leve, bom para aula. */
    onda: {
      conteudo: p => `<defs>${lg('g1', p.d1, p.d2, 'r')}${rg('b1', p.d2, 0.45)}</defs>
        <rect width="${W}" height="${H}" fill="${p.fundo}"/>
        <circle cx="1500" cy="60" r="230" fill="url(#b1)" opacity="0.6"/>
        <path d="M0,812 C 300,762 560,890 900,846 C 1200,806 1400,764 ${W},796 L${W},${H} L0,${H} Z"
          fill="url(#g1)" opacity="0.16"/>
        <path d="M0,868 C 340,828 620,914 980,874 C 1260,842 1420,830 ${W},852 L${W},${H} L0,${H} Z"
          fill="url(#g1)" opacity="0.85"/>
        ${acento(120)}`,
      capa: p => `<defs>${lg('g1', p.d1, p.d2, 'd')}</defs>
        ${capaFundo()}
        <path d="M0,700 C 340,640 620,790 980,730 C 1260,684 1420,660 ${W},690 L${W},${H} L0,${H} Z"
          fill="#ffffff" opacity="0.07"/>
        <path d="M0,806 C 360,760 640,880 1000,820 C 1280,774 1430,760 ${W},786 L${W},${H} L0,${H} Z"
          fill="#ffffff" opacity="0.10"/>
        <circle cx="1400" cy="170" r="200" fill="#ffffff" opacity="0.06"/>`,
    },

    /* Malha de pontos nos cantos — cara de tecnologia. */
    malha: {
      conteudo: p => `<defs>${lg('g1', p.d1, p.d2, 'r')}${pontos('pt', p.d1)}</defs>
        <rect width="${W}" height="${H}" fill="${p.fundo}"/>
        <rect x="1260" y="0" width="340" height="290" fill="url(#pt)" opacity="0.35"/>
        <rect x="0" y="610" width="250" height="290" fill="url(#pt)" opacity="0.28"/>
        <rect x="0" y="0" width="${W}" height="12" fill="url(#g1)"/>
        <path d="M${W},${H} L${W},806 L1424,${H} Z" fill="url(#g1)" opacity="0.55"/>
        ${acento(140)}`,
      capa: p => `<defs>${lg('g1', p.d1, p.d2, 'd')}${pontos('pt', '#ffffff')}</defs>
        ${capaFundo()}
        <rect x="1140" y="0" width="460" height="420" fill="url(#pt)" opacity="0.22"/>
        <rect x="0" y="520" width="420" height="380" fill="url(#pt)" opacity="0.16"/>
        <circle cx="1300" cy="700" r="240" fill="#ffffff" opacity="0.05"/>`,
    },
  };

  /* ---------- Catálogo ---------- */
  /* corTitulo/corTexto valem no slide de conteúdo; capaCor vale no slide de
     título, que tem o gradiente inteiro atrás. */
  const LISTA = [
    {
      id: 'aurora', nome: 'Azul Aurora', layout: 'lateral',
      fundo: '#ffffff', destaque: '#2563eb', destaque2: '#06b6d4',
      corTitulo: '#0f2a5c', corTexto: '#33415c', capaCor: '#ffffff',
    },
    {
      id: 'indigo', nome: 'Índigo Vivo', layout: 'blocos',
      fundo: '#ffffff', destaque: '#4f46e5', destaque2: '#a855f7',
      corTitulo: '#241a6b', corTexto: '#3b3a58', capaCor: '#ffffff',
    },
    {
      id: 'violeta', nome: 'Violeta Neon', layout: 'topo',
      fundo: '#fdfbff', destaque: '#7c3aed', destaque2: '#ec4899',
      corTitulo: '#40156e', corTexto: '#443a55', capaCor: '#ffffff',
    },
    {
      id: 'ciano', nome: 'Ciano Tech', layout: 'malha',
      fundo: '#ffffff', destaque: '#0891b2', destaque2: '#22d3ee',
      corTitulo: '#083b48', corTexto: '#33505a', capaCor: '#ffffff',
    },
    {
      id: 'esmeralda', nome: 'Verde Esmeralda', layout: 'onda',
      fundo: '#ffffff', destaque: '#059669', destaque2: '#84cc16',
      corTitulo: '#0b3f31', corTexto: '#334a45', capaCor: '#ffffff',
    },
    {
      id: 'ambar', nome: 'Laranja Energia', layout: 'lateral',
      fundo: '#fffdf8', destaque: '#ea580c', destaque2: '#f59e0b',
      corTitulo: '#6b2408', corTexto: '#4a3c33', capaCor: '#ffffff',
    },
    {
      id: 'coral', nome: 'Coral Vibrante', layout: 'blocos',
      fundo: '#fffbfc', destaque: '#e11d48', destaque2: '#fb7185',
      corTitulo: '#6b0f26', corTexto: '#4c3840', capaCor: '#ffffff',
    },
    {
      id: 'grafite', nome: 'Escuro Neon', layout: 'onda',
      fundo: '#0f172a', destaque: '#22d3ee', destaque2: '#818cf8',
      corTitulo: '#ffffff', corTexto: '#cbd5e1', capaCor: '#ffffff',
    },
  ];

  function get(id) {
    return LISTA.find(t => t.id === id) || null;
  }

  /* Cores efetivas: as do tema, sobrescritas pelo que estiver na base — é isso
     que deixa o professor recolorir um estilo pronto sem sair dele. */
  function paleta(tema, b) {
    b = b || {};
    return {
      fundo: b.fundo || tema.fundo,
      d1: b.destaque || tema.destaque,
      d2: b.destaque2 || tema.destaque2,
    };
  }

  /* Miolo do SVG (sem a tag <svg>): quem chama monta a moldura. */
  function desenho(id, b, capa) {
    const tema = get(id);
    if (!tema) return '';
    const layout = LAYOUTS[tema.layout] || LAYOUTS.lateral;
    return (capa ? layout.capa : layout.conteudo)(paleta(tema, b));
  }

  function svgCompleto(id, b, capa) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"
      viewBox="0 0 ${W} ${H}">${desenho(id, b, capa)}</svg>`;
  }

  /* Miniatura para as galerias de escolha (não passa por rasterização). */
  function previewUrl(id, capa, b) {
    const svg = svgCompleto(id, b, capa).replace(/\s+/g, ' ');
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  /* Campos que o tema grava na base ao ser escolhido. A faixa colorida do
     rodapé sai: os temas já têm o próprio acabamento embaixo. */
  function patchBase(id) {
    const t = get(id);
    if (!t) return null;
    return {
      tema: t.id,
      origem: 'formas',
      fundo: t.fundo,
      destaque: t.destaque,
      destaque2: t.destaque2,
      corTitulo: t.corTitulo,
      corTexto: t.corTexto,
      capaCor: t.capaCor,
      barra: false,
    };
  }

  return { W, H, LISTA, get, desenho, svgCompleto, previewUrl, patchBase };
})();
