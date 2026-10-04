"use strict";

const $ = (id) => document.getElementById(id);
const NIVEIS = { 1: "Mínimo", 2: "Baixo", 3: "Moderado", 4: "Alto", 5: "Crítico" };
const ETAPAS = [
  "Lendo o contrato…",
  "Identificando o tipo de contrato…",
  "Separando as cláusulas…",
  "Analisando o risco de cada cláusula…",
  "Montando o relatório…",
];

let resultado = null;
let abaAtual = "pdf";
let arquivoEscolhido = null;
let timerEtapas = null;

/* Cria elementos sem usar innerHTML (o texto da IA nunca é interpretado como HTML). */
function el(tag, props = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") e.className = v;
    else if (k === "texto") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const f of filhos.flat()) if (f != null) e.append(f);
  return e;
}

function mostrar(tela) {
  for (const t of ["tela-form", "tela-carregando", "tela-resultado"]) $(t).classList.toggle("oculto", t !== tela);
  window.scrollTo({ top: 0 });
}

/* ---------------- formulário ---------------- */

document.querySelectorAll("input[name=lado]").forEach((r) =>
  r.addEventListener("change", () => {
    $("campo-outro").classList.toggle("oculto", r.value !== "Outro" || !r.checked);
    if (r.value === "Outro") $("papel-outro").focus();
  })
);

function trocarAba(aba) {
  abaAtual = aba;
  $("aba-pdf").classList.toggle("ativa", aba === "pdf");
  $("aba-texto").classList.toggle("ativa", aba === "texto");
  $("aba-pdf").setAttribute("aria-selected", aba === "pdf");
  $("aba-texto").setAttribute("aria-selected", aba === "texto");
  $("painel-pdf").classList.toggle("oculto", aba !== "pdf");
  $("painel-texto").classList.toggle("oculto", aba !== "texto");
}
$("aba-pdf").addEventListener("click", () => trocarAba("pdf"));
$("aba-texto").addEventListener("click", () => trocarAba("texto"));

function escolherArquivo(f) {
  arquivoEscolhido = f || null;
  $("area-pdf").classList.toggle("tem-arquivo", !!f);
  $("nome-arquivo").textContent = f ? `📄 ${f.name} (${(f.size / 1024 / 1024).toFixed(1)} MB)` : "Clique para escolher o PDF ou arraste-o até aqui";
}
$("arquivo").addEventListener("change", (e) => escolherArquivo(e.target.files[0]));
const area = $("area-pdf");
["dragenter", "dragover"].forEach((ev) => area.addEventListener(ev, (e) => { e.preventDefault(); area.classList.add("arrastando"); }));
["dragleave", "drop"].forEach((ev) => area.addEventListener(ev, (e) => { e.preventDefault(); area.classList.remove("arrastando"); }));
area.addEventListener("drop", (e) => {
  const f = e.dataTransfer.files[0];
  if (f) { $("arquivo").value = ""; escolherArquivo(f); }
});

function erroForm(msg) {
  const p = $("erro-form");
  p.textContent = msg || "";
  p.classList.toggle("oculto", !msg);
  if (msg) p.scrollIntoView({ block: "center", behavior: "smooth" });
}

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  erroForm("");

  const lado = (document.querySelector("input[name=lado]:checked") || {}).value;
  const papel = $("papel-outro").value.trim();
  const texto = $("texto").value.trim();

  if (!lado) return erroForm("Escolha de que lado está o seu cliente: Comprador, Vendedor ou Outro.");
  if (lado === "Outro" && !papel) return erroForm("Descreva o papel do cliente (ex.: locatário, contratante, prestador).");
  if (abaAtual === "pdf") {
    if (!arquivoEscolhido) return erroForm("Escolha o arquivo PDF do contrato ou use a aba “Colar cláusulas”.");
    if (!/\.pdf$/i.test(arquivoEscolhido.name) && arquivoEscolhido.type !== "application/pdf") return erroForm("O arquivo precisa ser um PDF.");
    if (arquivoEscolhido.size > 10 * 1024 * 1024) return erroForm("O arquivo é grande demais. O limite é de 10 MB.");
  } else if (!texto) {
    return erroForm("Cole as cláusulas que deseja analisar no campo de texto.");
  }

  const ladoTexto = lado === "Outro" ? `Outro — ${papel}` : lado;
  senhaAtual = $("senha").value;
  cancelado = false;

  iniciarCarregamento();
  try {
    let conteudo, completo;
    if (abaAtual === "pdf") {
      status("Lendo o PDF…");
      conteudo = await lerPdf(arquivoEscolhido);
      completo = true;
    } else {
      conteudo = texto;
      completo = false;
      if (conteudo.length > 200000) throw new ErroUsuario("O texto colado é grande demais. Cole menos cláusulas por vez.");
    }
    if (conteudo.length > 500000) throw new ErroUsuario("O contrato é grande demais para uma única análise. Cole apenas as cláusulas que deseja analisar.");
    resultado = await analisar(conteudo, ladoTexto, completo);
    pararCarregamento();
    renderizar();
    mostrar("tela-resultado");
  } catch (err) {
    pararCarregamento();
    mostrar("tela-form");
    if (err instanceof ErroUsuario) erroForm(err.message);
    else if (err instanceof TypeError) erroForm("Não foi possível falar com o servidor. Verifique sua conexão com a internet.");
    else erroForm("Ocorreu um erro inesperado. Tente novamente.");
  }
});

/* ---------------- análise (o navegador organiza; o servidor fala com o Claude) ---------------- */

class ErroUsuario extends Error {}
let senhaAtual = "";
let cancelado = false;
const status = (m) => { $("msg-carregando").textContent = m; };

async function chamarIA(tarefa, carga) {
  if (cancelado) throw new ErroUsuario("Análise cancelada.");
  const resp = await fetch("/api/ia", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tarefa, senha: senhaAtual, ...carga }),
  });
  let corpo = null;
  try { corpo = await resp.json(); } catch { /* sem JSON: normalmente tempo esgotado */ }
  if (resp.ok) return corpo;
  if (corpo && corpo.erro) throw new ErroUsuario(corpo.erro);
  const e = new Error("tempo");
  e.tempo = resp.status === 502 || resp.status === 504 || resp.status === 500;
  throw e;
}

/* PDF: lido no navegador com pdf.js */
function carregarScript(src) {
  return new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => no(new Error("script")); document.head.append(s); });
}
async function lerPdf(arquivo) {
  const base = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
  try {
    if (!window.pdfjsLib) {
      await carregarScript(base + "pdf.min.js");
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = base + "pdf.worker.min.js";
    }
  } catch {
    throw new ErroUsuario("Não foi possível carregar o leitor de PDF. Verifique sua conexão ou cole as cláusulas na aba “Colar cláusulas”.");
  }
  let doc;
  try {
    doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) }).promise;
  } catch (e) {
    if (e && e.name === "PasswordException") throw new ErroUsuario("Este PDF é protegido por senha. Remova a proteção e envie novamente.");
    throw new ErroUsuario("Não foi possível ler este PDF. Ele pode estar corrompido. Tente salvá-lo novamente ou cole as cláusulas no campo de texto.");
  }
  const paginas = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    let t = "";
    for (const it of tc.items) t += it.str + (it.hasEOL ? "\n" : "");
    paginas.push(t);
  }
  const txt = paginas.join("\n").trim();
  if (txt.length < 200 || txt.length / paginas.length < 60)
    throw new ErroUsuario("Este PDF parece ser uma imagem escaneada (não tem texto selecionável). Cole as cláusulas que deseja analisar na aba “Colar cláusulas”.");
  return txt;
}

/* Divisão em cláusulas */
const RE_CLAUSULA = /^[ \t]*(cl[áa]usula\s+([\wçãáéíóúô]+)([ \t]*[ªº°.:\-–—])?)/gim;
const RE_NUMERADA = /^[ \t]*(\d{1,3})[.)\-–][ \t]+(?=\S)/gm;

function comecaBloco(txt, pos) {
  if (pos === 0) return true;
  const antes = txt.slice(0, pos);
  return /\n[ \t]*\n[ \t]*$/.test(antes) || /[.;:]\s*$/.test(antes);
}
function achaCortes(txt) {
  const a = [];
  for (const m of txt.matchAll(RE_CLAUSULA)) if (m[3] || comecaBloco(txt, m.index)) a.push(m.index);
  if (a.length >= 2) return a;
  const b = []; let esperado = 1;
  for (const m of txt.matchAll(RE_NUMERADA)) if (Number(m[1]) === esperado) { b.push(m.index); esperado++; }
  return b.length >= 3 ? b : null;
}
function separaCabecalho(linha) {
  const m = linha.match(/^(cl[áa]usula\s+[\wçãáéíóúô]+[ªº°]?|\d{1,3})[ \t]*[.)\-–—:]?[ \t]*(.*)$/i);
  if (!m) return [linha.slice(0, 60), ""];
  let numero = m[1].trim();
  if (!/^cl/i.test(numero)) numero = "Cláusula " + numero;
  return [numero, m[2].trim().length <= 90 ? m[2].trim() : ""];
}
function dividirTexto(txt) {
  txt = txt.replace(/\r\n?/g, "\n");
  const cortes = achaCortes(txt);
  if (cortes) {
    const out = [];
    cortes.forEach((ini, i) => {
      const bloco = txt.slice(ini, i + 1 < cortes.length ? cortes[i + 1] : txt.length).trim();
      if (bloco.length < 15) return;
      const [numero, titulo] = separaCabecalho(bloco.split("\n")[0].trim());
      out.push({ id: out.length + 1, numero, titulo, texto: bloco });
    });
    return out;
  }
  if (txt.trim().length <= 3000) return [{ id: 1, numero: "Trecho informado", titulo: "", texto: txt.trim() }];
  return null;
}
function pedacos(txt, limite = 12000) {
  const out = []; let atual = "";
  for (const p of txt.split("\n").filter((x) => x.trim())) {
    if (atual && atual.length + p.length > limite) { out.push(atual); atual = ""; }
    atual += p + "\n";
  }
  if (atual.trim()) out.push(atual);
  return out;
}
/* lotes pequenos: cada chamada precisa terminar dentro do tempo limite do servidor */
function emLotes(cs) {
  const out = []; let atual = [], tam = 0;
  for (const c of cs) {
    if (atual.length && (tam + c.texto.length > 4500 || atual.length >= 3)) { out.push(atual); atual = []; tam = 0; }
    atual.push(c); tam += c.texto.length;
  }
  if (atual.length) out.push(atual);
  return out;
}

async function analisarLote(lote, visao, lado, completo) {
  const enviar = lote.map((c) => ({ id: c.id, numero: c.numero, texto: c.texto.slice(0, 12000) }));
  try {
    const d = await chamarIA("lote", { clausulas: enviar, visao, lado, completo });
    return d.clausulas || [];
  } catch (e) {
    if (e.tempo && lote.length > 1) { // demorou demais: tenta de novo em pedaços menores
      const meio = Math.ceil(lote.length / 2);
      return [...(await analisarLote(lote.slice(0, meio), visao, lado, completo)), ...(await analisarLote(lote.slice(meio), visao, lado, completo))];
    }
    if (e.tempo) return []; // uma cláusula sozinha estourou o tempo: fica marcada para revisão manual
    throw e;
  }
}

async function analisar(texto, lado, completo) {
  status("Identificando o tipo de contrato…");
  let visao;
  try {
    visao = await chamarIA("visao", { texto: texto.slice(0, 60000), lado, completo });
  } catch (e) {
    if (e.tempo) throw new ErroUsuario("O servidor demorou demais para responder. Tente com menos texto ou tente novamente.");
    throw e;
  }
  if (!completo) visao.lacunas = [];

  status("Separando as cláusulas…");
  let clausulas = dividirTexto(texto);
  if (!clausulas) {
    clausulas = [];
    for (const p of pedacos(texto)) {
      const d = await chamarIA("dividir", { texto: p, lado });
      for (const c of d.clausulas || []) {
        if (String(c.texto_original || "").trim())
          clausulas.push({ id: clausulas.length + 1, numero: String(c.numero || "").trim() || `Trecho ${clausulas.length + 1}`, titulo: String(c.titulo || "").trim(), texto: String(c.texto_original).trim() });
      }
    }
  }
  if (!clausulas.length) throw new ErroUsuario("Não foi possível identificar cláusulas no texto enviado.");

  const analises = new Map(); let feitas = 0;
  const fila = emLotes(clausulas);
  status(`Analisando as cláusulas (0 de ${clausulas.length})…`);
  const trabalhador = async () => {
    while (fila.length) {
      const lote = fila.shift();
      for (const a of await analisarLote(lote, visao, lado, completo)) analises.set(Number(a.id), a);
      feitas += lote.length;
      status(`Analisando as cláusulas (${Math.min(feitas, clausulas.length)} de ${clausulas.length})…`);
    }
  };
  await Promise.all(Array.from({ length: 3 }, trabalhador));

  const saida = clausulas.map((c) => {
    const a = analises.get(c.id) || { nota: 3, criterios: [], comentario_risco: "Esta cláusula não pôde ser analisada automaticamente. Revise-a manualmente." };
    return {
      numero: c.numero, titulo: c.titulo, texto_original: c.texto,
      nota: Math.min(5, Math.max(1, Math.round(Number(a.nota)) || 3)),
      criterios: Array.isArray(a.criterios) ? a.criterios.map(String) : [],
      comentario_risco: String(a.comentario_risco || ""),
      como_melhorar: String(a.como_melhorar || ""),
      redacao_sugerida: String(a.redacao_sugerida || ""),
    };
  });
  const notas = saida.map((c) => c.nota);
  const contagem = {}; for (let n = 1; n <= 5; n++) contagem[n] = notas.filter((x) => x === n).length;
  return {
    tipo_de_contrato: visao.tipo_de_contrato || "Não identificado",
    regime_juridico: visao.regime_juridico || "Não identificado",
    justificativa_regime: visao.justificativa_regime || "",
    lado_analisado: lado,
    contrato_completo: completo,
    clausulas: saida,
    lacunas: (visao.lacunas || []).map((l) => ({ tipo: String(l.tipo || "lacuna"), titulo: String(l.titulo || ""), descricao: String(l.descricao || ""), relevancia: String(l.relevancia || "media"), redacao_sugerida: String(l.redacao_sugerida || "") })),
    resumo: {
      nota_media: Math.round(notas.reduce((a, b) => a + b, 0) / notas.length * 10) / 10,
      contagem_por_nivel: contagem,
      mais_criticas: notas.map((_, i) => i).sort((a, b) => notas[b] - notas[a] || a - b).slice(0, 3),
    },
  };
}

function iniciarCarregamento() {
  mostrar("tela-carregando");
  status(ETAPAS[0]);
}
function pararCarregamento() { cancelado = true; }

/* ---------------- resultado ---------------- */

function renderizar() {
  const r = resultado;
  const resumo = $("resumo");
  resumo.replaceChildren();

  const max = Math.max(1, ...Object.values(r.resumo.contagem_por_nivel));
  const barras = el("div", { class: "barras" },
    [5, 4, 3, 2, 1].map((n) =>
      el("div", { class: `barra-linha nota-${n}` },
        el("span", { texto: `${n} · ${NIVEIS[n]}` }),
        el("div", { class: "barra-fundo" }, el("i", { style: `width:${(r.resumo.contagem_por_nivel[n] / max) * 100}%` })),
        el("strong", { texto: String(r.resumo.contagem_por_nivel[n]) })
      )
    )
  );
  const arred = Math.round(r.resumo.nota_media);

  const criticas = el("div", { class: "criticas" },
    el("h3", { texto: "Cláusulas mais críticas" }),
    el("ol", {}, r.resumo.mais_criticas.map((pos) => {
      const c = r.clausulas[pos];
      return el("li", {},
        el("button", { type: "button", class: `nota-${c.nota}`, onclick: () => irParaClausula(pos) },
          el("span", { class: "mini", texto: `${c.nota}/5` }),
          el("span", { texto: [c.numero, c.titulo].filter(Boolean).join(" — ") })
        ));
    }))
  );

  resumo.append(
    el("h2", { texto: "Resumo da análise" }),
    el("dl", { class: "resumo-grade" },
      el("div", {}, el("dt", { texto: "Tipo de contrato" }), el("dd", { texto: r.tipo_de_contrato })),
      el("div", {}, el("dt", { texto: "Lado analisado" }), el("dd", { texto: r.lado_analisado })),
      el("div", {}, el("dt", { texto: "Regime jurídico provável" }),
        el("dd", { texto: r.regime_juridico + (r.justificativa_regime ? ` — ${r.justificativa_regime}` : "") })),
      el("div", {}, el("dt", { texto: "Cláusulas analisadas" }),
        el("dd", { texto: `${r.clausulas.length}${r.contrato_completo ? " (contrato completo)" : " (trechos enviados)"}` }))
    ),
    el("div", { class: "nota-media" },
      el("span", { class: `selo nota-${arred}`, texto: r.resumo.nota_media.toFixed(1).replace(".", ",") }),
      el("div", {}, el("strong", { texto: "Nota média de risco" }), el("div", { class: "cl-nivel", texto: `de 1 a 5 · ${NIVEIS[arred] || ""}` })),
      barras
    ),
    criticas
  );

  $("filtro-nota").value = "0";
  $("ordem").value = "contrato";
  renderizarClausulas();
  renderizarLacunas();
}

function cartao(c, pos) {
  const criterios = c.criterios.length
    ? el("div", {}, el("h4", { texto: "Critérios do alerta" }),
        el("div", { class: "etiquetas" }, c.criterios.map((t) => el("span", { class: "etiqueta", texto: t }))))
    : null;

  const melhorar = (c.como_melhorar || c.redacao_sugerida)
    ? el("div", { class: "melhorar" },
        el("h4", { texto: "Como melhorar" }),
        c.como_melhorar ? el("p", { texto: c.como_melhorar }) : null,
        c.redacao_sugerida
          ? [el("h4", { texto: "Proposta de nova redação" }),
             el("div", { class: "redacao", texto: c.redacao_sugerida }),
             el("button", { type: "button", class: "copiar nao-imprimir", texto: "Copiar redação",
               onclick: (ev) => copiar(c.redacao_sugerida, ev.target) })]
          : null)
    : null;

  return el("article", { class: `clausula nota-${c.nota}`, id: `clausula-${pos}` },
    el("div", { class: "cl-topo" },
      el("span", { class: "selo", texto: String(c.nota) }),
      el("div", {},
        el("h3", { class: "cl-titulo", texto: [c.numero, c.titulo].filter(Boolean).join(" — ") }),
        el("div", { class: "cl-nivel", texto: `Risco ${NIVEIS[c.nota].toLowerCase()} (${c.nota}/5)` }))),
    el("div", { class: "cl-corpo" },
      el("details", { class: "original" }, el("summary", { texto: "Texto original da cláusula" }), el("blockquote", { texto: c.texto_original })),
      criterios,
      el("div", {}, el("h4", { texto: "Por que é um risco para o cliente" }), el("p", { texto: c.comentario_risco })),
      melhorar));
}

function renderizarClausulas() {
  const filtro = $("filtro-nota").value;
  const ordem = $("ordem").value;
  let itens = resultado.clausulas.map((c, pos) => ({ c, pos }));

  if (filtro.endsWith("+")) itens = itens.filter(({ c }) => c.nota >= Number(filtro[0]));
  else if (filtro !== "0") itens = itens.filter(({ c }) => c.nota === Number(filtro));

  if (ordem === "maior") itens.sort((a, b) => b.c.nota - a.c.nota || a.pos - b.pos);
  if (ordem === "menor") itens.sort((a, b) => a.c.nota - b.c.nota || a.pos - b.pos);

  const lista = $("lista-clausulas");
  lista.replaceChildren(...(itens.length ? itens.map(({ c, pos }) => cartao(c, pos)) : [el("p", { class: "vazio", texto: "Nenhuma cláusula com esse filtro." })]));
}

function renderizarLacunas() {
  const sec = $("lacunas");
  const lacunas = resultado.lacunas;
  sec.classList.toggle("oculto", !resultado.contrato_completo);
  if (!resultado.contrato_completo) return;
  sec.replaceChildren(
    el("h2", { class: "lacunas-titulo", texto: "Lacunas e contradições" }),
    ...(lacunas.length
      ? lacunas.map((l) =>
          el("div", { class: "lacuna" },
            el("h3", {}, el("span", { texto: l.titulo }),
              el("span", { class: "tag", texto: l.tipo === "contradicao" ? "Contradição" : "Cláusula ausente" }),
              el("span", { class: "tag", texto: `Relevância ${l.relevancia}` })),
            el("p", { texto: l.descricao }),
            l.redacao_sugerida ? el("p", {}, el("strong", { texto: "Sugestão de redação: " }), l.redacao_sugerida) : null))
      : [el("p", { class: "vazio", texto: "Nenhuma lacuna ou contradição relevante foi identificada." })])
  );
}

function irParaClausula(pos) {
  $("filtro-nota").value = "0";
  renderizarClausulas();
  const alvo = $(`clausula-${pos}`);
  alvo.scrollIntoView({ behavior: "smooth", block: "start" });
  alvo.classList.add("destaque");
  setTimeout(() => alvo.classList.remove("destaque"), 2000);
}

async function copiar(texto, botao) {
  try { await navigator.clipboard.writeText(texto); botao.textContent = "Copiado ✓"; }
  catch { botao.textContent = "Não foi possível copiar"; }
  setTimeout(() => (botao.textContent = "Copiar redação"), 2000);
}

$("filtro-nota").addEventListener("change", renderizarClausulas);
$("ordem").addEventListener("change", renderizarClausulas);
$("btn-nova").addEventListener("click", () => {
  if (confirm("Voltar ao início? O relatório atual será descartado.")) {
    resultado = null;
    $("form").reset();
    escolherArquivo(null);
    $("campo-outro").classList.add("oculto");
    mostrar("tela-form");
  }
});

fetch("/api/config").then((r) => r.json()).then((c) => $("campo-senha").classList.toggle("oculto", !c.senha)).catch(() => {});

/* Exportar PDF: usa a impressão do navegador ("Salvar como PDF"). */
$("btn-pdf").addEventListener("click", () => window.print());
window.addEventListener("beforeprint", () => document.querySelectorAll("details.original").forEach((d) => (d.open = true)));
