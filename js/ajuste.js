/* Ajuste de um trecho do material, sem gerar tudo de novo.

   A IA responde só com blocos de substituição (veja Prompts.ajuste):

     <<<<<<< ORIGINAL
     trecho como está hoje
     =======
     como deve ficar
     >>>>>>> NOVO

   Aqui os blocos são lidos e aplicados no texto do material. O trecho
   original é procurado primeiro exatamente e, se não bater (a IA costuma
   mexer em espaços no fim da linha), linha a linha ignorando espaços nas
   pontas. Bloco que não encontra o seu trecho é contado e informado — nunca
   aplicado no lugar errado. */
window.Ajuste = (function () {
  'use strict';

  const RE_BLOCO = /<{5,}\s*ORIGINAL[^\n]*\n([\s\S]*?)\n?={5,}[^\n]*\n([\s\S]*?)\n?>{5,}\s*NOVO[^\n]*/gi;

  function ler(resposta) {
    const texto = String(resposta || '').replace(/\r\n?/g, '\n');
    const blocos = [];
    let m;
    RE_BLOCO.lastIndex = 0;
    while ((m = RE_BLOCO.exec(texto))) blocos.push({ original: m[1], novo: m[2] });
    return blocos;
  }

  /* Posição [inicio, fim) do trecho no texto, ou null. */
  function localizar(texto, trecho) {
    if (!trecho.trim()) return null;
    const exato = texto.indexOf(trecho);
    if (exato >= 0) return [exato, exato + trecho.length];

    // Linha a linha, ignorando espaços nas pontas e linhas em branco nas bordas do trecho.
    const alvo = trecho.split('\n').map(l => l.trim());
    while (alvo.length && !alvo[0]) alvo.shift();
    while (alvo.length && !alvo[alvo.length - 1]) alvo.pop();
    if (!alvo.length) return null;

    const linhas = texto.split('\n');
    const inicios = [];
    let pos = 0;
    linhas.forEach(l => { inicios.push(pos); pos += l.length + 1; });

    for (let i = 0; i + alvo.length <= linhas.length; i++) {
      let bate = true;
      for (let k = 0; k < alvo.length; k++) {
        if (linhas[i + k].trim() !== alvo[k]) { bate = false; break; }
      }
      if (bate) {
        const ultima = i + alvo.length - 1;
        return [inicios[i], inicios[ultima] + linhas[ultima].length];
      }
    }
    return null;
  }

  /* Aplica os blocos em sequência. Devolve { texto, aplicados, falhas }. */
  function aplicar(textoAtual, blocos) {
    let texto = String(textoAtual || '').replace(/\r\n?/g, '\n');
    let aplicados = 0;
    let falhas = 0;
    blocos.forEach(({ original, novo }) => {
      // ORIGINAL vazio: acréscimo no fim do material.
      if (!original.trim()) {
        if (!novo.trim()) return;
        texto = `${texto.replace(/\s+$/, '')}\n\n${novo}\n`;
        aplicados++;
        return;
      }
      const onde = localizar(texto, original);
      if (!onde) { falhas++; return; }
      texto = texto.slice(0, onde[0]) + novo + texto.slice(onde[1]);
      aplicados++;
    });
    // Remoções deixam linhas em branco sobrando: no máximo uma seguida.
    texto = texto.replace(/\n{3,}/g, '\n\n');
    return { texto, aplicados, falhas };
  }

  return { ler, aplicar };
})();
