/* ✿ Brechó · Controle de Lives
   Página única: dados no localStorage, cálculos espelhando a planilha Controle_Lives_Brecho.xlsx. */
'use strict';

/* ================= Constantes ================= */
const KEY = 'brecho-lives:v1';
const OWNER_KEY = 'brecho-lives:owner';
const CATS = ['Feminina', 'Masculina', 'Infantil', 'Grife', 'Variados'];
const MODELOS = ['Porcentagem', 'Preço fechado', 'Por hora', 'Fechado + porcentagem', 'Por hora + porcentagem'];
const MODEL_FIELDS = {
  'Porcentagem': ['pct'],
  'Preço fechado': ['fixo'],
  'Por hora': ['porHora'],
  'Fechado + porcentagem': ['fixo', 'pct'],
  'Por hora + porcentagem': ['porHora', 'pct'],
};
const MAX_VEND = 15;
const VAR_WORDS = ['centro de mesa', 'bolsa', 'carteira', 'cheirinho', 'phone', 'ursinho', 'kit lenço', 'nerf', 'baldinho', 'sapato', 'sandália', 'sapatilha', 'chinelo', 'salto', 'sutiã', 'cueca', 'calcinha', 'meia', 'paninho', 'canga', 'cinta', 'modelador', 'colete resina'];
const NAME_FIX = { 'Cuecas': 'Cueca', 'Calcinhas preta Ali': 'Calcinha preta Ali', 'Baldinhos porta talheres': 'Baldinho porta talheres' };
const C = { pink: '#E58AB0', pinkS: '#F8C8DC', lilac: '#9B7BC9', lilacS: '#E3D4F5', peach: '#FFB996', txt: '#4B2E7F', grid: '#F1DDE8' };

/* ================= Utilidades ================= */
const $ = (s, r = document) => r.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const money = v => BRL.format(v || 0);
const sum = a => a.reduce((x, y) => x + (y || 0), 0);
const pctFmt = v => (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
const numFmt = v => (v ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const fmtIn = v => v == null ? '' : String(Math.round(v * 100) / 100).replace('.', ',');
const dateBR = d => d ? d.split('-').reverse().join('/') : 'sem data';
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const clone = o => JSON.parse(JSON.stringify(o));

/** Aceita "39,90", "39.90", "R$ 1.234,50", "12%". Vazio → null. */
function parseNum(s) {
  if (s == null) return null;
  s = String(s).replace(/r?\$|reais|%/gi, '').replace(/\s/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function guessCat(nome, secao) {
  const n = nome.toLowerCase();
  if (n.includes('infantil')) return 'Infantil';
  if (secao === 'Masculino' && !n.startsWith('vestido')) return 'Masculina';
  if (secao === 'Grifes') return 'Grife';
  if (VAR_WORDS.some(k => n.includes(k))) return 'Variados';
  return 'Feminina';
}

/* ================= Estado ================= */
function seedPecas() {
  const cheiro = ['Cheirinho para carro piu-piu', 'Cheirinho para carro aviãozinho'];
  let ci = 0;
  return (window.SEED_ITEMS || []).map(([nome, valor, secao], i) => {
    if (nome.startsWith('Cheirinhos para carro')) nome = cheiro[ci++] || nome;
    nome = NAME_FIX[nome] || nome;
    return { id: uid(), ref: 's' + i, nome, categoria: guessCat(nome, secao), valor, status: '' };
  });
}
function newLive(nome, pecas = []) {
  return { id: uid(), nome, data: '', vendedoraId: '', horas: null, pecas, gastos: [] };
}
function freshState() {
  return {
    version: 1,
    settings: { taxa: null, faixas: [30, 50, 80, 120, 200], pinHash: null },
    vendedoras: [],
    lives: [newLive('Live 01', seedPecas()), newLive('Live 02', seedPecas())],
  };
}
function normalize(d) {
  d.version = 1;
  d.settings = Object.assign({ taxa: null, faixas: [30, 50, 80, 120, 200], pinHash: null }, d.settings || {});
  d.vendedoras = (d.vendedoras || []).map(v => Object.assign({ id: uid(), nome: '', modelo: '', pct: null, fixo: null, porHora: null, obs: '' }, v));
  d.lives = (d.lives || []).map(l => {
    l = Object.assign(newLive('Live'), l);
    l.pecas = (l.pecas || []).map(p => Object.assign({ id: uid(), nome: '', categoria: '', valor: null, custo: null, status: '' }, p));
    l.gastos = (l.gastos || []).map(g => Object.assign({ id: uid(), desc: '', valor: null }, g));
    return l;
  });
  return d;
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const d = JSON.parse(raw); if (d && Array.isArray(d.lives)) return normalize(d); }
  } catch (e) { /* sem acesso ao armazenamento */ }
  return freshState();
}
function save() {
  if (CLOUD) return Cloud.schedule(); // nuvem: envia só o que mudou
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { toast('⚠️ O navegador não deixou salvar. Use Exportar JSON para não perder os dados.'); }
}

/** true quando config.js tem os dados do Supabase: dados na nuvem + login de verdade. */
const CLOUD = typeof Cloud !== 'undefined' && Cloud.on;
let state = CLOUD ? { version: 1, settings: { taxa: null, faixas: [30, 50, 80, 120, 200], pinHash: null }, vendedoras: [], lives: [] } : load();
const ui = {
  view: 'inicio', liveId: null, de: '', ate: '',
  busca: '', fStatus: '', fCat: '',
  importText: '', importRows: [], importLive: '',
  owner: false, undo: null, focusK: null,
  loading: CLOUD, loadError: '',
};
if (!CLOUD) try { ui.owner = sessionStorage.getItem(OWNER_KEY) === '1' && !!state.settings.pinHash; } catch (e) { }

const vendById = id => state.vendedoras.find(v => v.id === id);
const liveById = id => state.lives.find(l => l.id === id);
const RO = () => ui.owner ? '' : 'disabled';

/* ================= Cálculos ================= */
function pagamento(v, horas, venda) {
  if (!v) return 0;
  const f = MODEL_FIELDS[v.modelo] || ['fixo', 'porHora', 'pct'];
  return (f.includes('fixo') ? (v.fixo || 0) : 0)
    + (f.includes('porHora') ? (v.porHora || 0) * (horas || 0) : 0)
    + (f.includes('pct') ? (v.pct || 0) / 100 * venda : 0);
}
function descPagamento(v) {
  if (!v) return 'sem vendedora';
  const f = MODEL_FIELDS[v.modelo] || ['fixo', 'porHora', 'pct'];
  const parts = [];
  if (f.includes('fixo') && v.fixo) parts.push(money(v.fixo) + ' fixo');
  if (f.includes('porHora') && v.porHora) parts.push(money(v.porHora) + '/hora');
  if (f.includes('pct') && v.pct) parts.push(numFmt(v.pct) + '% da venda');
  return parts.join(' + ') || 'valores em branco';
}

function calcLive(live) {
  const taxa = (state.settings.taxa || 0) / 100;
  const vend = live.pecas.filter(p => p.status === 'Vendida');
  const venda = sum(vend.map(p => p.valor));
  const taxas = venda * taxa;
  const recebido = venda - taxas;
  const pag = pagamento(vendById(live.vendedoraId), live.horas, venda);
  const gastos = sum(live.gastos.map(g => g.valor));
  const custo = sum(vend.map(p => p.custo));                       // preço pago pelas peças vendidas
  const nVend = vend.length;
  const nDev = live.pecas.filter(p => p.status === 'Devolvida').length;
  return {
    venda, taxas, recebido, pag, gastos, custo, lucro: recebido - custo - pag - gastos,
    vendSemCusto: vend.filter(p => p.custo == null).length,
    nVend, nDev, nPend: live.pecas.length - nVend - nDev, nTotal: live.pecas.length,
    totalCad: sum(live.pecas.map(p => p.valor)), semValor: live.pecas.filter(p => p.valor == null).length,
    ticket: nVend ? venda / nVend : 0,
  };
}

function faixas() {
  const lim = state.settings.faixas;
  const out = [];
  let lo = 0;
  lim.forEach((hi, i) => {
    out.push({ lo, hi, label: i === 0 ? `Até R$ ${numFmt(hi)}` : `R$ ${numFmt(lo)} a ${numFmt(hi)}` });
    lo = hi;
  });
  out.push({ lo, hi: Infinity, label: `R$ ${numFmt(lo)} ou mais` });
  return out;
}

function analisePreco(live) {
  const vals = live.pecas.filter(p => p.status === 'Vendida' && p.valor != null).map(p => p.valor);
  const fx = faixas().map(f => ({ ...f, n: vals.filter(v => v >= f.lo && v < f.hi).length }));
  fx.forEach(f => { f.p = vals.length ? f.n / vals.length : 0; });
  const max = Math.max(0, ...fx.map(f => f.n));
  const freq = new Map();
  vals.forEach(v => freq.set(v, (freq.get(v) || 0) + 1));
  let moda = null, mf = 1;
  freq.forEach((n, v) => { if (n > mf) { mf = n; moda = v; } });
  const s = [...vals].sort((a, b) => a - b);
  const mediana = s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
  return {
    fx, campea: max ? fx.find(f => f.n === max).label : '—',
    ticket: vals.length ? sum(vals) / vals.length : null, moda, mediana,
  };
}

function porCategoria(live) {
  const rows = [...CATS, ''].map(c => {
    const ps = live.pecas.filter(p => p.status === 'Vendida' && (p.categoria || '') === c);
    return { cat: c || 'Sem categoria', n: ps.length, valor: sum(ps.map(p => p.valor)) };
  });
  return rows.filter(r => r.cat !== 'Sem categoria' || r.n);
}

function livesNoPeriodo(de, ate) {
  return state.lives.filter(l => !l.data || ((!de || l.data >= de) && (!ate || l.data <= ate)));
}

function painel(de, ate) {
  const lives = livesNoPeriodo(de, ate);
  const cs = lives.map(l => ({ l, c: calcLive(l) }));
  const t = k => sum(cs.map(x => x.c[k]));
  const rk = new Map();
  cs.forEach(({ l, c }) => {
    if (!l.vendedoraId || !vendById(l.vendedoraId)) return;
    const r = rk.get(l.vendedoraId) || { v: vendById(l.vendedoraId), lives: 0, venda: 0, pag: 0, custo: 0, lucro: 0, pecas: 0 };
    r.lives++; r.venda += c.venda; r.pag += c.pag; r.custo += c.custo; r.lucro += c.lucro; r.pecas += c.nVend;
    rk.set(l.vendedoraId, r);
  });
  const ranking = [...rk.values()].sort((a, b) => b.lucro - a.lucro);
  const nVend = t('nVend'), nDev = t('nDev');
  return {
    lives, cs, ranking,
    venda: t('venda'), recebido: t('recebido'), lucro: t('lucro'), taxas: t('taxas'), pag: t('pag'), gastos: t('gastos'),
    custo: t('custo'), vendSemCusto: t('vendSemCusto'),
    nVend, nDev, nPend: t('nPend'), devPct: (nVend + nDev) ? nDev / (nVend + nDev) : 0,
    ticket: nVend ? t('venda') / nVend : 0,
  };
}

/* ================= Gráficos ================= */
const charts = {};
function destroyCharts() { Object.keys(charts).forEach(k => { charts[k].destroy(); delete charts[k]; }); }
function mkChart(id, cfg) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!window.Chart) { el.parentElement.innerHTML = '<div class="empty small">Gráfico indisponível sem internet.</div>'; return; }
  Chart.defaults.font.family = 'Arial, Helvetica, sans-serif';
  Chart.defaults.color = C.txt;
  charts[id] = new Chart(el, cfg);
}
const moneyAxis = { beginAtZero: true, grid: { color: C.grid }, ticks: { callback: v => 'R$ ' + numFmt(v) } };
const tipMoney = { callbacks: { label: c => `${c.dataset.label}: ${money(c.parsed.y)}` } };
function barChart(id, labels, sets, money_ = true) {
  mkChart(id, {
    type: 'bar',
    data: { labels, datasets: sets.map(s => ({ borderRadius: 8, maxBarThickness: 46, ...s })) },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: sets.length > 1, labels: { usePointStyle: true } }, tooltip: money_ ? tipMoney : {} },
      scales: { y: money_ ? moneyAxis : { beginAtZero: true, grid: { color: C.grid }, ticks: { precision: 0 } }, x: { grid: { display: false } } },
    },
  });
}

/* ================= Componentes ================= */
const kpi = (lbl, val, cls, note = '') =>
  `<div class="kpi ${cls}"><div class="lbl">${lbl}</div><div class="val ${val < 0 ? 'neg' : ''}">${money(val)}</div><div class="note">${note}</div></div>`;
const chip = (ico, n, lbl) => `<div class="chip">${ico} <b>${n}</b> ${lbl}</div>`;
const empty = (ico, txt, extra = '') => `<div class="empty"><span class="big">${ico}</span>${txt}${extra}</div>`;
const optList = (arr, sel, blank) =>
  (blank != null ? `<option value="">${blank}</option>` : '') + arr.map(o => {
    const [v, t] = Array.isArray(o) ? o : [o, o];
    return `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(t)}</option>`;
  }).join('');
function progress(c) {
  const t = c.nTotal || 1;
  return `<div class="progress"><i class="v" style="width:${c.nVend / t * 100}%"></i><i class="d" style="width:${c.nDev / t * 100}%"></i></div>
  <div class="legend"><span><i class="dot" style="background:var(--ok)"></i>${c.nVend} vendidas</span><span><i class="dot" style="background:var(--pink-d)"></i>${c.nDev} devolvidas</span><span><i class="dot" style="background:var(--line)"></i>${c.nPend} a conferir</span></div>`;
}

/* ================= Telas ================= */
function viewInicio() {
  const P = painel(ui.de, ui.ate);
  const taxa = state.settings.taxa;
  const best = P.ranking[0];
  const per = ui.de || ui.ate ? `de ${ui.de ? dateBR(ui.de) : 'início'} até ${ui.ate ? dateBR(ui.ate) : 'hoje'} (lives sem data entram sempre)` : 'todas as lives';
  const ranking = P.ranking.length ? `
    <div class="table-wrap"><table>
      <thead><tr><th></th><th>Vendedora</th><th class="right">Lives</th><th class="right">Venda</th><th class="right">Comissão</th><th class="right">Lucro gerado</th></tr></thead>
      <tbody>${P.ranking.map((r, i) => `<tr class="${i === 0 ? 'rank-1' : ''}"><td><span class="rank-n">${i + 1}</span></td><td>${esc(r.v.nome || 'Sem nome')}</td><td class="right">${r.lives}</td><td class="right nowrap">${money(r.venda)}</td><td class="right nowrap">${money(r.pag)}</td><td class="right nowrap ${r.lucro < 0 ? 'neg' : ''}"><b>${money(r.lucro)}</b></td></tr>`).join('')}</tbody>
    </table></div>` : empty('💁‍♀️', state.vendedoras.length ? 'Defina a vendedora de cada live para montar o ranking.' : 'Cadastre as vendedoras e ligue cada live a uma delas para ver o ranking.',
      `<div style="margin-top:10px" class="owner-only"><button class="btn sm" data-view="${state.vendedoras.length ? 'lives' : 'vendedoras'}">${state.vendedoras.length ? 'Ir para Lives' : 'Cadastrar vendedora'}</button></div>`);
  return `
  <header class="page-head">
    <div><h1>✿ Painel do brechó</h1><p class="sub">Mostrando ${per}.</p></div>
    <div class="filtro">
      <label>De <input class="in" type="date" data-f="ui:de" data-k="de" value="${ui.de}"></label>
      <label>Até <input class="in" type="date" data-f="ui:ate" data-k="ate" value="${ui.ate}"></label>
      ${ui.de || ui.ate ? '<button class="btn ghost sm" data-a="limparPeriodo">Limpar</button>' : ''}
    </div>
  </header>
  <section class="kpis">
    ${kpi('💖 Lucro final', P.lucro, 'hero', 'recebido − preço pago − comissões − gastos')}
    ${kpi('🛍️ Venda total', P.venda, 'lilac', 'soma das peças vendidas')}
    ${kpi('🧾 Preço pago das peças', P.custo, 'pink', P.vendSemCusto ? `${P.vendSemCusto} vendida(s) sem preço pago` : 'o que as peças vendidas custaram')}
    ${kpi('🌸 Valor recebido', P.recebido, 'pink', 'depois das taxas da plataforma')}
    ${kpi('🏷️ Taxas da plataforma', P.taxas, 'peach', taxa ? `${numFmt(taxa)}% sobre a venda` : 'sem taxa definida')}
    ${kpi('💁‍♀️ Comissões pagas', P.pag, 'lilac', 'pagamento das vendedoras')}
    ${kpi('⛽ Gastos', P.gastos, 'peach', 'gasolina, transporte…')}
  </section>
  <section class="chips">
    ${chip('🎥', P.lives.length, P.lives.length === 1 ? 'live realizada' : 'lives realizadas')}
    ${chip('✅', P.nVend, 'peças vendidas')}
    ${chip('↩️', P.nDev, `devolvidas (${pctFmt(P.devPct)})`)}
    ${chip('🔎', P.nPend, 'a conferir')}
    ${chip('🎟️', money(P.ticket), 'ticket médio')}
  </section>
  <section class="grid-2">
    <div class="card">
      <h2>✿ Ranking de vendedoras <span class="hint">por lucro gerado</span></h2>
      ${best ? `<div class="trophy"><span class="cup">🏆</span><div><small>Vendedora mais vantajosa</small><strong>${esc(best.v.nome || 'Sem nome')}</strong><span class="small muted">gerou ${money(best.lucro)} de lucro depois de pagar ${money(best.pag)} de comissão</span></div></div>` : ''}
      ${ranking}
    </div>
    <div class="card">
      <h2>✿ Venda, preço pago e lucro por vendedora</h2>
      ${P.ranking.length ? '<div class="chart-box"><canvas id="chVend"></canvas></div>' : empty('📊', 'O gráfico aparece quando houver lives com vendedora.')}
    </div>
  </section>
  <section class="card">
    <h2>✿ Venda por live</h2>
    ${P.lives.length ? '<div class="chart-box tall"><canvas id="chLives"></canvas></div>' : empty('🎥', 'Nenhuma live no período.')}
  </section>`;
}
function chartsInicio() {
  const P = painel(ui.de, ui.ate);
  if (P.ranking.length) barChart('chVend', P.ranking.map(r => r.v.nome || 'Sem nome'), [
    { label: 'Venda', data: P.ranking.map(r => r.venda), backgroundColor: C.lilac },
    { label: 'Preço pago', data: P.ranking.map(r => r.custo), backgroundColor: C.peach },
    { label: 'Lucro', data: P.ranking.map(r => r.lucro), backgroundColor: C.pink },
  ]);
  if (P.lives.length) barChart('chLives', P.cs.map(x => x.l.nome), [
    { label: 'Venda', data: P.cs.map(x => x.c.venda), backgroundColor: C.lilac },
    { label: 'Preço pago', data: P.cs.map(x => x.c.custo), backgroundColor: C.peach },
    { label: 'Lucro', data: P.cs.map(x => x.c.lucro), backgroundColor: C.pink },
  ]);
}

function viewVendedoras() {
  const P = painel('', '');
  const stats = new Map(P.ranking.map(r => [r.v.id, r]));
  const cards = state.vendedoras.map(v => {
    const f = MODEL_FIELDS[v.modelo] || ['fixo', 'porHora', 'pct'];
    const st = stats.get(v.id);
    const fld = (key, label, ph) => f.includes(key) ? `<label class="field"><span>${label}</span><input class="in money" inputmode="decimal" placeholder="${ph}" data-f="v:${v.id}:${key}" data-k="v-${v.id}-${key}" value="${fmtIn(v[key])}" ${RO()}></label>` : '';
    return `<div class="card vend-card">
      <div class="head"><div class="avatar">${esc((v.nome || '?').trim().charAt(0).toUpperCase() || '?')}</div>
        <input class="in" style="font-weight:700;font-size:16px" placeholder="Nome da vendedora" data-f="v:${v.id}:nome" data-k="v-${v.id}-nome" value="${esc(v.nome)}" ${RO()}>
        <button class="icon-btn del owner-only" title="Excluir vendedora" data-a="delVend" data-id="${v.id}">🗑️</button></div>
      <div class="form-grid">
        <label class="field" style="grid-column:1/-1"><span>Modelo de pagamento</span><select class="in" data-f="v:${v.id}:modelo" data-k="v-${v.id}-modelo" ${RO()}>${optList(MODELOS, v.modelo, 'Escolha…')}</select></label>
        ${fld('pct', '% sobre a venda', 'ex.: 10')}
        ${fld('fixo', 'Valor fechado por live (R$)', '0,00')}
        ${fld('porHora', 'Valor por hora (R$)', '0,00')}
        <label class="field" style="grid-column:1/-1"><span>Observações</span><input class="in" placeholder="—" data-f="v:${v.id}:obs" data-k="v-${v.id}-obs" value="${esc(v.obs)}" ${RO()}></label>
      </div>
      <div class="stats">
        <span class="badge">🎥 ${st ? st.lives : 0} lives</span>
        <span class="badge">🛍️ ${money(st ? st.venda : 0)}</span>
        <span class="badge ${st && st.lucro < 0 ? 'warn' : 'owner'}">💖 lucro ${money(st ? st.lucro : 0)}</span>
      </div>
    </div>`;
  }).join('');
  return `
  <header class="page-head">
    <div><h1>✿ Vendedoras</h1><p class="sub">${state.vendedoras.length} de ${MAX_VEND} cadastradas. Campos em branco valem zero.</p></div>
    <div class="actions owner-only"><button class="btn" data-a="addVend" ${state.vendedoras.length >= MAX_VEND ? 'disabled' : ''}>+ Nova vendedora</button></div>
  </header>
  ${state.vendedoras.length ? `<div class="vend-grid">${cards}</div>` : empty('💁‍♀️', 'Nenhuma vendedora cadastrada ainda.', '<div style="margin-top:10px" class="owner-only"><button class="btn sm" data-a="addVend">Cadastrar a primeira</button></div>')}
  <div class="note-box" style="margin-top:18px"><b>Como o pagamento é calculado:</b> valor fechado + (horas da live × valor por hora) + (% × venda total da live). Só entram os campos do modelo escolhido.</div>`;
}

function viewLives() {
  const cards = state.lives.map(l => {
    const c = calcLive(l);
    const v = vendById(l.vendedoraId);
    return `<div class="card live-card" data-a="openLive" data-id="${l.id}">
      <div class="top"><div><h3>✿ ${esc(l.nome)}</h3><div class="small muted">${dateBR(l.data)} · ${v ? esc(v.nome || 'Sem nome') : 'sem vendedora'}</div></div>
        <span class="badge">${c.nTotal} peças</span></div>
      ${progress(c)}
      <div class="nums"><div><span class="small">Venda</span><b>${money(c.venda)}</b></div><div><span class="small">Lucro</span><b class="${c.lucro < 0 ? 'neg' : ''}">${money(c.lucro)}</b></div></div>
      <div class="foot owner-only">
        <button class="btn soft sm" data-a="dupLive" data-id="${l.id}" title="Cria uma nova live com as mesmas peças, sem status">Duplicar</button>
        <button class="btn ghost sm del" data-a="delLive" data-id="${l.id}">Excluir</button>
      </div>
    </div>`;
  }).join('');
  return `
  <header class="page-head">
    <div><h1>✿ Lives</h1><p class="sub">Clique numa live para ver as peças, marcar vendidas/devolvidas e lançar gastos.</p></div>
    <div class="actions owner-only"><button class="btn" data-a="addLive">+ Nova live</button></div>
  </header>
  ${state.lives.length ? `<div class="lives-grid">${cards}</div>` : empty('🎥', 'Nenhuma live ainda.')}`;
}

function viewLive() {
  const l = liveById(ui.liveId);
  if (!l) { ui.view = 'lives'; return viewLives(); }
  const c = calcLive(l);
  const v = vendById(l.vendedoraId);
  const A = analisePreco(l);
  const q = norm(ui.busca);
  const rows = l.pecas.map((p, i) => ({ p, i })).filter(({ p }) =>
    (!q || norm(p.nome).includes(q)) &&
    (!ui.fCat || (p.categoria || '') === (ui.fCat === '-' ? '' : ui.fCat)) &&
    (!ui.fStatus || (ui.fStatus === 'pend' ? !p.status : p.status === ui.fStatus)));
  const taxa = state.settings.taxa;
  const outras = state.lives.filter(x => x.id !== l.id);

  const tbody = rows.map(({ p, i }) => `
    <tr class="${p.status === 'Vendida' ? 'is-v' : p.status === 'Devolvida' ? 'is-d' : ''}">
      <td class="muted small">${i + 1}</td>
      <td style="min-width:260px"><input class="in" data-f="p:${l.id}:${p.id}:nome" data-k="p-${p.id}-nome" value="${esc(p.nome)}" placeholder="Nome da peça" ${RO()}></td>
      <td style="min-width:132px"><select class="in" data-f="p:${l.id}:${p.id}:categoria" data-k="p-${p.id}-cat" ${RO()}>${optList(CATS, p.categoria, '—')}</select></td>
      <td style="min-width:96px;width:110px"><input class="in money ${p.valor == null ? 'warn' : ''}" inputmode="decimal" placeholder="sem valor" data-f="p:${l.id}:${p.id}:valor" data-k="p-${p.id}-valor" value="${fmtIn(p.valor)}" ${RO()}></td>
      <td style="min-width:96px;width:110px"><input class="in money" inputmode="decimal" placeholder="—" title="Quanto o brechó pagou por esta peça" data-f="p:${l.id}:${p.id}:custo" data-k="p-${p.id}-custo" value="${fmtIn(p.custo)}" ${RO()}></td>
      <td class="nowrap"><span class="st">
        <button class="v ${p.status === 'Vendida' ? 'on' : ''}" data-a="status" data-live="${l.id}" data-id="${p.id}" data-s="Vendida" data-k="st-${p.id}-v" ${RO()}>Vendida</button>
        <button class="d ${p.status === 'Devolvida' ? 'on' : ''}" data-a="status" data-live="${l.id}" data-id="${p.id}" data-s="Devolvida" data-k="st-${p.id}-d" ${RO()}>Devolvida</button>
      </span></td>
      <td class="owner-only"><button class="icon-btn del" title="Remover peça desta live" data-k="del-${p.id}" data-a="delPeca" data-live="${l.id}" data-id="${p.id}">🗑️</button></td>
    </tr>`).join('');

  const fin = (lbl, val, cls = '') => `<div class="fin-row ${cls}"><span>${lbl}</span><span class="nowrap ${val < 0 ? 'neg' : ''}">${typeof val === 'number' ? money(val) : val}</span></div>`;

  return `
  <header class="page-head">
    <div><button class="back" data-view="lives">← Todas as lives</button>
      <h1>✿ ${esc(l.nome)}</h1><p class="sub">${c.nTotal} peças cadastradas · ${money(c.totalCad)} em peças${c.semValor ? ` · <b>${c.semValor} sem valor</b>` : ''}</p></div>
  </header>
  <section class="card">
    <div class="form-grid">
      <label class="field"><span>Nome da live</span><input class="in" data-f="l:${l.id}:nome" data-k="l-nome" value="${esc(l.nome)}" ${RO()}></label>
      <label class="field"><span>Data da live</span><input class="in" type="date" data-f="l:${l.id}:data" data-k="l-data" value="${l.data}" ${RO()}></label>
      <label class="field"><span>Vendedora</span><select class="in" data-f="l:${l.id}:vendedoraId" data-k="l-vend" ${RO()}>${optList(state.vendedoras.map(x => [x.id, x.nome || 'Sem nome']), l.vendedoraId, state.vendedoras.length ? 'Escolha…' : 'Cadastre em Vendedoras')}</select></label>
      <label class="field"><span>Horas de live</span><input class="in money" inputmode="decimal" placeholder="0" data-f="l:${l.id}:horas" data-k="l-horas" value="${fmtIn(l.horas)}" ${RO()}></label>
    </div>
    <p class="small muted" style="margin:10px 0 0">Pagamento: ${v ? `<b>${esc(v.modelo || 'modelo não escolhido')}</b> — ${descPagamento(v)}` : 'escolha a vendedora para calcular o pagamento.'}</p>
  </section>

  <div class="live-layout" style="margin-top:18px">
    <section class="card">
      <h2>✿ Peças da live</h2>
      ${progress(c)}
      <div class="toolbar" style="margin-top:14px">
        <input class="in search" placeholder="🔎 Buscar peça…" data-f="ui:busca" data-k="busca" value="${esc(ui.busca)}">
        <select class="in" data-f="ui:fStatus" data-k="fStatus">${optList([['Vendida', 'Vendidas'], ['Devolvida', 'Devolvidas'], ['pend', 'A conferir']], ui.fStatus, 'Todos os status')}</select>
        <select class="in" data-f="ui:fCat" data-k="fCat">${optList([...CATS, ['-', 'Sem categoria']], ui.fCat, 'Todas as categorias')}</select>
      </div>
      <div class="toolbar owner-only">
        <button class="btn sm" data-a="addPeca" data-live="${l.id}">+ Peça</button>
        ${outras.length ? `<button class="btn soft sm" data-a="tirarVendidas" data-live="${l.id}">Tirar peças vendidas em outra live…</button>` : ''}
        ${c.nPend ? `<button class="btn soft sm" data-a="pendDev" data-live="${l.id}">Marcar as ${c.nPend} a conferir como devolvidas</button>` : ''}
      </div>
      <p class="small muted" style="margin:0 0 8px">${rows.length === l.pecas.length ? `${rows.length} peças` : `${rows.length} de ${l.pecas.length} peças (filtro ativo)`}</p>
      <div class="table-wrap"><table>
        <thead><tr><th>#</th><th>Peça</th><th>Categoria</th><th class="right">Preço de venda</th><th class="right">Preço pago</th><th>Status</th><th class="owner-only"></th></tr></thead>
        <tbody>${tbody || `<tr><td colspan="7" class="muted" style="text-align:center;padding:20px">Nenhuma peça ${l.pecas.length ? 'com esse filtro' : 'nesta live'}.</td></tr>`}</tbody>
      </table></div>
    </section>

    <aside class="live-side">
      <section class="card">
        <h2>✿ Resumo financeiro</h2>
        ${fin('Peças vendidas', `${c.nVend}`)}
        ${fin('Peças devolvidas', `${c.nDev}`)}
        ${fin('VENDA TOTAL', c.venda, 'strong')}
        ${fin(`(–) Taxas da plataforma ${taxa ? `(${numFmt(taxa)}%)` : '(sem taxa)'}`, c.taxas)}
        ${fin('Valor recebido (após taxas)', c.recebido)}
        ${fin('(–) Preço pago das peças vendidas', c.custo)}
        ${c.vendSemCusto ? `<p class="small muted" style="margin:2px 4px 6px">${c.vendSemCusto} peça(s) vendida(s) ainda sem preço pago — contam como R$ 0.</p>` : ''}
        ${fin('(–) Pagamento da vendedora', c.pag)}
        ${fin('(–) Gastos', c.gastos)}
        ${fin('💖 LUCRO FINAL', c.lucro, 'total')}
      </section>
      <section class="card">
        <h2>✿ Gastos da live</h2>
        ${l.gastos.length ? `<div class="table-wrap"><table><thead><tr><th>Descrição</th><th class="right">Valor</th><th class="owner-only"></th></tr></thead><tbody>
          ${l.gastos.map(g => `<tr>
            <td><input class="in" placeholder="Gasolina, transporte…" data-f="g:${l.id}:${g.id}:desc" data-k="g-${g.id}-desc" value="${esc(g.desc)}" ${RO()}></td>
            <td style="width:110px"><input class="in money" inputmode="decimal" placeholder="0,00" data-f="g:${l.id}:${g.id}:valor" data-k="g-${g.id}-valor" value="${fmtIn(g.valor)}" ${RO()}></td>
            <td class="owner-only"><button class="icon-btn del" data-a="delGasto" data-live="${l.id}" data-id="${g.id}">🗑️</button></td></tr>`).join('')}
          </tbody><tfoot><tr><td>Total</td><td class="right nowrap">${money(c.gastos)}</td><td class="owner-only"></td></tr></tfoot></table></div>` : '<p class="muted small">Nenhum gasto lançado.</p>'}
        <button class="btn soft sm owner-only" style="margin-top:10px" data-a="addGasto" data-live="${l.id}">+ Gasto</button>
      </section>
      <section class="card">
        <h2>✿ Qual preço vende mais</h2>
        <div class="chart-box short"><canvas id="chFaixas"></canvas></div>
        <div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>Faixa</th><th class="right">Vendidas</th><th class="right">%</th></tr></thead>
          <tbody>${A.fx.map(f => `<tr><td>${f.label}</td><td class="right">${f.n}</td><td class="right">${pctFmt(f.p)}</td></tr>`).join('')}</tbody></table></div>
        <div class="stat-list">
          <div><span class="small">Faixa campeã</span><b>${A.campea}</b></div>
          <div><span class="small">Ticket médio</span><b>${A.ticket == null ? '—' : money(A.ticket)}</b></div>
          <div><span class="small">Preço que mais se repete</span><b>${A.moda == null ? '—' : money(A.moda)}</b></div>
          <div><span class="small">Preço mediano</span><b>${A.mediana == null ? '—' : money(A.mediana)}</b></div>
        </div>
      </section>
      <section class="card">
        <h2>✿ Vendas por categoria</h2>
        <div class="table-wrap"><table><thead><tr><th>Categoria</th><th class="right">Qtd</th><th class="right">Valor</th></tr></thead>
          <tbody>${porCategoria(l).map(r => `<tr><td>${r.cat}</td><td class="right">${r.n}</td><td class="right nowrap">${money(r.valor)}</td></tr>`).join('')}</tbody></table></div>
      </section>
    </aside>
  </div>`;
}
function chartsLive() {
  const l = liveById(ui.liveId);
  if (!l) return;
  const A = analisePreco(l);
  barChart('chFaixas', A.fx.map(f => f.label), [{ label: 'Peças vendidas', data: A.fx.map(f => f.n), backgroundColor: [C.pinkS, C.pink, C.lilacS, C.lilac, C.peach, C.txt] }], false);
}

function viewResumo() {
  const cs = state.lives.map(l => ({ l, c: calcLive(l) }));
  const t = k => sum(cs.map(x => x.c[k]));
  return `
  <header class="page-head"><div><h1>✿ Resumo das lives</h1><p class="sub">Tabela consolidada de todas as lives — é ela que alimenta o painel inicial.</p></div></header>
  <section class="card"><div class="table-wrap"><table>
    <thead><tr><th>Live</th><th>Data</th><th>Vendedora</th><th class="right">Vendidas</th><th class="right">Devolvidas</th><th class="right">Venda total</th><th class="right">Taxas</th><th class="right">Recebido</th><th class="right">Preço pago</th><th class="right">Pag. vendedora</th><th class="right">Gastos</th><th class="right">Lucro final</th></tr></thead>
    <tbody>${cs.map(({ l, c }) => `<tr class="clickable" data-a="openLive" data-id="${l.id}">
      <td><b>${esc(l.nome)}</b></td><td class="nowrap">${dateBR(l.data)}</td><td>${esc(vendById(l.vendedoraId)?.nome || '—')}</td>
      <td class="right">${c.nVend}</td><td class="right">${c.nDev}</td><td class="right nowrap">${money(c.venda)}</td><td class="right nowrap">${money(c.taxas)}</td>
      <td class="right nowrap">${money(c.recebido)}</td><td class="right nowrap">${money(c.custo)}</td><td class="right nowrap">${money(c.pag)}</td><td class="right nowrap">${money(c.gastos)}</td>
      <td class="right nowrap ${c.lucro < 0 ? 'neg' : ''}"><b>${money(c.lucro)}</b></td></tr>`).join('') || '<tr><td colspan="12" class="muted">Nenhuma live.</td></tr>'}</tbody>
    <tfoot><tr><td colspan="3">Total (${cs.length} lives)</td><td class="right">${t('nVend')}</td><td class="right">${t('nDev')}</td><td class="right nowrap">${money(t('venda'))}</td><td class="right nowrap">${money(t('taxas'))}</td><td class="right nowrap">${money(t('recebido'))}</td><td class="right nowrap">${money(t('custo'))}</td><td class="right nowrap">${money(t('pag'))}</td><td class="right nowrap">${money(t('gastos'))}</td><td class="right nowrap ${t('lucro') < 0 ? 'neg' : ''}">${money(t('lucro'))}</td></tr></tfoot>
  </table></div></section>`;
}

/* ---------- Importar ---------- */
const WORD_NUM = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, 'três': 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10 };
/** Porta do parse.py: separa peça, valor e seção; "N ... cada" vira quantidade. */
function parseLista(text) {
  const out = [];
  let secao = '';
  for (const ln of text.split(/\r?\n/)) {
    let t = ln.trim();
    if (!t || /^lista da live/i.test(t)) continue;
    if (/^\*+\s*[\p{L}\s]+?\s*\*+$/u.test(t)) { secao = t.replace(/\*/g, '').trim(); secao = secao.charAt(0).toUpperCase() + secao.slice(1).toLowerCase(); continue; }
    if (/^\d+$/.test(t)) continue;
    const t0 = t;
    t = t.replace(/^[-•*\s]+/, '').trim();
    let valor = null, m;
    if ((m = t.match(/[rR]*\$\s*(\d+(?:[.,]\d+)?)/))) {
      valor = parseNum(m[1]); t = t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length);
    } else if ((m = t.match(/(\d+(?:[.,]\d+)?)\s*reais/i))) {
      valor = parseNum(m[1]); t = t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length);
    } else if ((m = t.match(/(?<![\d/])(\d+(?:,\d{2})?)\s*$/)) && !/(tam|tamanho)\s*$/i.test(t.slice(0, m.index))) {
      valor = parseNum(m[1]); t = t.slice(0, m.index);
    }
    const temCada = /\bcada\b/i.test(t);
    t = t.replace(/\s*\/\s*$/, '').replace(/\bcada\b/gi, '').replace(/\s+/g, ' ').replace(/^[\s-]+|[\s-]+$/g, '');
    const letters = [...t].filter(ch => /\p{L}/u.test(ch));
    if (letters.length && letters.filter(ch => ch === ch.toUpperCase() && ch !== ch.toLowerCase()).length / letters.length > 0.6) t = t.toLowerCase();
    let qtd = 1;
    if (temCada && (m = t.match(/^(\d{1,2}|\p{L}+)\s+/u))) {
      const n = /^\d+$/.test(m[1]) ? Number(m[1]) : WORD_NUM[m[1].toLowerCase()];
      if (n > 1 && n <= 50) { qtd = n; t = t.slice(m[0].length); }
    }
    t = t.charAt(0).toUpperCase() + t.slice(1);
    if (!t) continue;
    out.push({ nome: t, categoria: guessCat(t, secao), valor, qtd, status: '', orig: t0 });
  }
  return out;
}

function viewImportar() {
  const R = ui.importRows;
  const total = sum(R.map(r => r.qtd || 0));
  const semValor = R.filter(r => r.valor == null).length;
  if (!ui.importLive || (ui.importLive !== 'nova' && !liveById(ui.importLive))) ui.importLive = state.lives[state.lives.length - 1]?.id || 'nova';
  return `
  <header class="page-head"><div><h1>✿ Importar peças</h1><p class="sub">Cole a lista do WhatsApp ou do bloco de notas — uma peça por linha.</p></div></header>
  <div class="grid-2">
    <section class="card">
      <h2>✿ 1. Cole a lista</h2>
      <textarea class="in" data-f="ui:importText" data-k="importText" placeholder="vestido dourado tam P R$ 50&#10;calça jeans 38 r$35,90&#10;*****GRIFES*****&#10;bolsa couro 120 reais">${esc(ui.importText)}</textarea>
      <div class="toolbar" style="margin-top:12px;margin-bottom:0"><button class="btn" data-a="parse">Separar peças</button>${R.length ? '<button class="btn ghost" data-a="clearImport">Limpar</button>' : ''}</div>
    </section>
    <section class="card">
      <h2>✿ Como o texto é lido</h2>
      <div class="note-box">💰 <b>Preço:</b> "R$ 50", "r$50", "$12.90", "35 reais" ou um número solto no fim da linha ("vestido verde 180"). Vale vírgula ou ponto.</div>
      <div class="note-box">📦 <b>Quantidade:</b> "5 cuecas $10 cada" vira 5 peças. Confira a coluna Qtd antes de adicionar.</div>
      <div class="note-box">🏷️ <b>Categoria:</b> palpite por palavra-chave; linhas abaixo de <code>*****GRIFES*****</code> viram Grife e de <code>*****MASCULINO*****</code> viram Masculina. Você pode trocar.</div>
      <div class="note-box">🔢 Linhas só com número (contagens) e "Lista da Live" são ignoradas.</div>
    </section>
  </div>
  ${R.length ? `<section class="card">
    <h2>✿ 2. Confira <span class="hint">${R.length} linhas · ${total} peças${semValor ? ` · ${semValor} sem valor` : ''}</span></h2>
    <div class="table-wrap"><table>
      <thead><tr><th>Peça</th><th>Categoria</th><th class="right">Valor</th><th class="right">Qtd</th><th>Status</th><th></th></tr></thead>
      <tbody>${R.map((r, i) => `<tr>
        <td style="min-width:220px"><input class="in" data-f="ir:${i}:nome" data-k="ir-${i}-nome" value="${esc(r.nome)}" title="${esc(r.orig)}"></td>
        <td><select class="in" data-f="ir:${i}:categoria" data-k="ir-${i}-cat">${optList(CATS, r.categoria, '—')}</select></td>
        <td style="width:110px"><input class="in money ${r.valor == null ? 'warn' : ''}" inputmode="decimal" placeholder="sem valor" data-f="ir:${i}:valor" data-k="ir-${i}-valor" value="${fmtIn(r.valor)}"></td>
        <td style="width:70px"><input class="in money" inputmode="numeric" data-f="ir:${i}:qtd" data-k="ir-${i}-qtd" value="${r.qtd}"></td>
        <td style="width:130px"><select class="in" data-f="ir:${i}:status" data-k="ir-${i}-st">${optList(['Vendida', 'Devolvida'], r.status, '—')}</select></td>
        <td><button class="icon-btn del" data-a="delImportRow" data-i="${i}">✕</button></td></tr>`).join('')}</tbody>
    </table></div>
    <div class="toolbar" style="margin-top:14px;margin-bottom:0">
      <span><b>3. Adicionar em:</b></span>
      <select class="in" data-f="ui:importLive" data-k="importLive">${optList([...state.lives.map(l => [l.id, l.nome]), ['nova', '➕ Nova live']], ui.importLive)}</select>
      <button class="btn" data-a="doImport">Adicionar ${total} peças</button>
    </div>
  </section>` : ''}`;
}

/* ---------- Ajustes ---------- */
function viewAjustes() {
  const fx = faixas();
  return `
  <header class="page-head"><div><h1>✿ Ajustes</h1><p class="sub">Taxa da plataforma, faixas de preço, acesso e backup dos dados.</p></div></header>
  <div class="grid-2">
    <section class="card">
      <h2>✿ Taxa da plataforma</h2>
      <label class="field" style="max-width:240px"><span>% sobre a venda (em branco = sem taxa)</span>
        <input class="in money" inputmode="decimal" placeholder="sem taxa" data-f="s:taxa" data-k="taxa" value="${fmtIn(state.settings.taxa)}" ${RO()}></label>
      <p class="small muted">Hoje não há taxa. Se a plataforma passar a cobrar, preencha aqui e todas as lives são recalculadas.</p>
    </section>
    <section class="card">
      <h2>✿ Faixas de preço</h2>
      <div class="table-wrap"><table><thead><tr><th>Faixa</th><th class="right">De</th><th class="right">Até (não inclui)</th></tr></thead><tbody>
      ${fx.map((f, i) => `<tr><td>${f.label}</td><td class="right">${money(f.lo)}</td><td class="right" style="width:130px">${i < fx.length - 1 ? `<input class="in money" inputmode="decimal" data-f="s:faixa:${i}" data-k="fx-${i}" value="${fmtIn(f.hi)}" ${RO()}>` : '∞'}</td></tr>`).join('')}
      </tbody></table></div>
    </section>
  </div>
  <div class="grid-2">
    <section class="card">
      <h2>✿ Acesso</h2>
      <p>Você está no <b>${ui.owner ? 'modo dono' : 'modo visitante'}</b>${CLOUD && Cloud.user ? ` (${esc(Cloud.user.email)})` : ''}. ${ui.owner ? 'Pode editar tudo.' : 'Só visualização — nada pode ser alterado.'}</p>
      <div class="toolbar">
        ${CLOUD
          ? (Cloud.user ? '<button class="btn ghost" data-a="logout">Sair</button>' : '<button class="btn" data-a="login">Entrar como dono</button>')
          : (ui.owner ? '<button class="btn soft" data-a="changePin">Trocar PIN</button><button class="btn ghost" data-a="logout">Sair do modo dono</button>' : `<button class="btn" data-a="login">${state.settings.pinHash ? 'Entrar como dono' : 'Criar PIN do dono'}</button>`)}
      </div>
      ${CLOUD
        ? '<div class="note-box">🔐 Login com e-mail e senha do Supabase. Quem não entra só consegue ver; as regras de edição ficam no próprio banco de dados, não no navegador.</div>'
        : '<div class="note-box">🔐 O PIN é só uma <b>barreira leve</b> dentro do navegador, para evitar edição sem querer. Não é segurança de verdade. Para login de verdade e dados na nuvem, preencha o <code>config.js</code> com os dados do Supabase.</div>'}
    </section>
    <section class="card">
      <h2>✿ Dados e backup</h2>
      <p class="small muted">${CLOUD
        ? 'Os dados ficam salvos <b>na nuvem (Supabase)</b> e aparecem iguais em qualquer computador ou celular. Mesmo assim, exporte um backup de vez em quando.'
        : 'Os dados ficam salvos <b>neste navegador, neste computador</b>. Faça backups com frequência. Para alguém ver suas lives, envie o arquivo JSON — a pessoa abre o site e clica em "Abrir arquivo de dados".'}</p>
      <div class="toolbar">
        <button class="btn lilac" data-a="exportJson">⬇️ Exportar JSON</button>
        <button class="btn soft ${CLOUD ? 'owner-only' : ''}" data-a="importJson">📂 ${CLOUD ? 'Restaurar de um backup' : 'Abrir arquivo de dados'}</button>
        <button class="btn soft" data-a="exportXlsx">📊 Exportar planilha (.xlsx)</button>
      </div>
      <div class="toolbar owner-only"><button class="btn danger sm" data-a="reset">Restaurar estado inicial</button></div>
      <p class="small muted owner-only">Restaurar apaga vendedoras, lives, gastos e status e volta para Live 01 e Live 02 com as 220 peças originais.</p>
    </section>
  </div>`;
}

function viewCarregando() {
  return ui.loadError
    ? empty('⚠️', `Não consegui carregar os dados da nuvem.<br><span class="small">${esc(ui.loadError)}</span>`, '<div style="margin-top:12px"><button class="btn sm" data-a="recarregar">Tentar de novo</button></div>')
    : empty('☁️', 'Carregando os dados do brechó…');
}

/* ================= Render ================= */
const VIEWS = { inicio: [viewInicio, chartsInicio], vendedoras: [viewVendedoras], lives: [viewLives], live: [viewLive, chartsLive], importar: [viewImportar], resumo: [viewResumo], ajustes: [viewAjustes] };

function renderSide() {
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('active', b.dataset.view === ui.view || (ui.view === 'live' && b.dataset.view === 'lives')));
  $('#sideFoot').innerHTML = `<div class="mode-box">
    <span class="badge ${ui.owner ? 'owner' : ''}">${ui.owner ? '🔓 Modo dono' : '👀 Modo visitante'}</span>
    ${CLOUD ? `<div style="margin-bottom:8px">${Cloud.badge()}</div>` : ''}
    ${CLOUD
      ? (Cloud.user ? '<button class="btn ghost sm block" data-a="logout">Sair</button>' : '<button class="btn sm block" data-a="login">Entrar como dono</button>')
      : (ui.owner ? '<button class="btn ghost sm block" data-a="logout">Sair do modo dono</button>' : `<button class="btn sm block" data-a="login">${state.settings.pinHash ? 'Entrar como dono' : 'Criar PIN do dono'}</button>`)}
  </div>
  <button class="btn soft sm block" data-a="exportJson">⬇️ Exportar backup</button>`;
}

function render() {
  if (ui.view === 'importar' && !ui.owner) ui.view = 'inicio';
  document.body.classList.toggle('owner', ui.owner);
  const ae = document.activeElement;
  const k = ui.focusK || (ae && ae.dataset ? ae.dataset.k : null);
  const caret = ae && typeof ae.selectionStart === 'number' && !ui.focusK ? ae.selectionStart : null;
  ui.focusK = null;
  const sy = window.scrollY;
  destroyCharts();
  const [view, after] = ui.loading || ui.loadError ? [viewCarregando] : (VIEWS[ui.view] || VIEWS.inicio);
  $('#main').innerHTML = view();
  renderSide();
  after && after();
  window.scrollTo(0, sy);
  if (k) {
    const el = $(`#main [data-k="${CSS.escape(k)}"]`);
    if (el) {
      el.focus({ preventScroll: true });
      if (caret != null && el.setSelectionRange) try { el.setSelectionRange(caret, caret); } catch (e) { }
      if (ui.focusScroll) el.scrollIntoView({ block: 'center' });
    }
  }
  ui.focusScroll = false;
}
const commit = () => { save(); render(); };

/* ================= Edição de campos ================= */
const NUM_FIELDS = new Set(['valor', 'custo', 'horas', 'pct', 'fixo', 'porHora', 'taxa', 'qtd']);
function applyField(el) {
  const [kind, ...a] = el.dataset.f.split(':');
  const raw = el.value;
  const val = f => NUM_FIELDS.has(f) ? parseNum(raw) : raw;
  if (kind === 'ui') { ui[a[0]] = raw; return a[0] !== 'importText'; }
  if (kind === 'ir') { const r = ui.importRows[+a[0]]; if (r) r[a[1]] = a[1] === 'qtd' ? Math.max(1, Math.round(parseNum(raw) || 1)) : val(a[1]); return true; }
  if (!ui.owner) return false;
  if (kind === 's') {
    if (a[0] === 'taxa') { const n = parseNum(raw); state.settings.taxa = n == null || n === 0 ? null : n; }
    if (a[0] === 'faixa') {
      const f = state.settings.faixas, i = +a[1], n = parseNum(raw);
      if (n != null && n > (i ? f[i - 1] : 0) && (i === f.length - 1 || n < f[i + 1])) f[i] = n;
      else toast('A faixa precisa ficar entre a anterior e a próxima.');
    }
  } else if (kind === 'v') { const v = vendById(a[0]); if (v) v[a[1]] = val(a[1]); }
  else if (kind === 'l') { const l = liveById(a[0]); if (l) l[a[1]] = val(a[1]); }
  else if (kind === 'p') { const p = liveById(a[0])?.pecas.find(x => x.id === a[1]); if (p) p[a[2]] = val(a[2]); }
  else if (kind === 'g') { const g = liveById(a[0])?.gastos.find(x => x.id === a[1]); if (g) g[a[2]] = val(a[2]); }
  save();
  return true;
}
document.addEventListener('change', e => {
  const el = e.target;
  if (el.id === 'fileJson') return readJsonFile(el);
  if (!el.dataset || !el.dataset.f || el.dataset.f === 'ui:busca' || el.dataset.f === 'ui:importText') return;
  if (applyField(el)) setTimeout(render, 0); // depois do foco ir para o próximo campo
});
document.addEventListener('input', e => {
  const f = e.target.dataset && e.target.dataset.f;
  if (f === 'ui:busca') { ui.busca = e.target.value; render(); }
  if (f === 'ui:importText') ui.importText = e.target.value;
});

/* ================= Ações ================= */
function liveName() {
  let n = state.lives.length + 1;
  const names = new Set(state.lives.map(l => l.nome));
  while (names.has(`Live ${String(n).padStart(2, '0')}`)) n++;
  return `Live ${String(n).padStart(2, '0')}`;
}
function removePecas(live, ids, msg) {
  const before = clone(live.pecas);
  live.pecas = live.pecas.filter(p => !ids.has(p.id));
  commit();
  ui.undo = { liveId: live.id, pecas: before };
  toast(msg, true);
}

const ACTIONS = {
  menu: () => document.body.classList.toggle('menu-open'),
  limparPeriodo: () => { ui.de = ui.ate = ''; render(); },
  openLive: d => { ui.view = 'live'; ui.liveId = d.id; ui.busca = ui.fStatus = ui.fCat = ''; render(); window.scrollTo(0, 0); },
  addVend: () => {
    if (state.vendedoras.length >= MAX_VEND) return toast(`Limite de ${MAX_VEND} vendedoras.`);
    const v = { id: uid(), nome: '', modelo: '', pct: null, fixo: null, porHora: null, obs: '' };
    state.vendedoras.push(v); ui.focusK = `v-${v.id}-nome`; ui.focusScroll = true; commit();
  },
  delVend: d => {
    const v = vendById(d.id);
    const usadas = state.lives.filter(l => l.vendedoraId === d.id).length;
    confirmDlg(`Excluir ${esc(v.nome || 'esta vendedora')}?`, usadas ? `Ela está ligada a ${usadas} live(s); essas lives ficarão sem vendedora (pagamento zerado).` : 'Esta ação não pode ser desfeita.', () => {
      state.vendedoras = state.vendedoras.filter(x => x.id !== d.id);
      state.lives.forEach(l => { if (l.vendedoraId === d.id) l.vendedoraId = ''; });
      commit();
    });
  },
  addLive: () => { const l = newLive(liveName()); state.lives.push(l); save(); ACTIONS.openLive({ id: l.id }); },
  dupLive: d => {
    const src = liveById(d.id);
    const l = newLive(liveName(), src.pecas.map(p => ({ ...p, id: uid(), status: '' })));
    state.lives.push(l); commit(); toast(`${l.nome} criada com ${l.pecas.length} peças (sem status).`);
  },
  delLive: d => {
    const l = liveById(d.id);
    confirmDlg(`Excluir ${esc(l.nome)}?`, `As ${l.pecas.length} peças, status e gastos desta live serão apagados. Não dá para desfazer.`, () => {
      state.lives = state.lives.filter(x => x.id !== d.id);
      if (ui.liveId === d.id) ui.view = 'lives';
      commit();
    });
  },
  status: d => {
    const p = liveById(d.live)?.pecas.find(x => x.id === d.id);
    if (!p) return;
    p.status = p.status === d.s ? '' : d.s;
    commit();
  },
  addPeca: d => {
    const l = liveById(d.live);
    const p = { id: uid(), nome: '', categoria: '', valor: null, status: '' };
    l.pecas.push(p); ui.busca = ui.fStatus = ui.fCat = '';
    ui.focusK = `p-${p.id}-nome`; ui.focusScroll = true; commit();
  },
  delPeca: d => {
    const l = liveById(d.live);
    const p = l.pecas.find(x => x.id === d.id);
    removePecas(l, new Set([d.id]), `Peça removida: ${esc(p.nome || 'sem nome')}`);
  },
  tirarVendidas: d => {
    const l = liveById(d.live);
    const outras = state.lives.filter(x => x.id !== l.id);
    modal({
      title: 'Tirar peças vendidas em outra live',
      body: `<p class="small">Remove de <b>${esc(l.nome)}</b> as peças que foram marcadas como <b>Vendida</b> na live escolhida (mesma peça da lista original, ou mesmo nome e valor).</p>
        <label class="field"><span>Live de origem</span><select class="in" id="mSrc">${optList(outras.map(x => [x.id, `${x.nome} — ${calcLive(x).nVend} vendidas`]), outras[0].id)}</select></label>`,
      ok: 'Remover',
      onOk: m => {
        const src = liveById($('#mSrc', m).value);
        const key = p => p.ref || norm(p.nome) + '|' + p.valor;
        const pool = new Map();
        src.pecas.filter(p => p.status === 'Vendida').forEach(p => pool.set(key(p), (pool.get(key(p)) || 0) + 1));
        const ids = new Set();
        l.pecas.forEach(p => { const k = key(p); if (pool.get(k) > 0) { ids.add(p.id); pool.set(k, pool.get(k) - 1); } });
        if (!ids.size) { toast(`Nenhuma peça vendida em ${esc(src.nome)} foi encontrada em ${esc(l.nome)}.`); return; }
        removePecas(l, ids, `${ids.size} peças vendidas em ${esc(src.nome)} foram removidas.`);
      },
    });
  },
  pendDev: d => {
    const l = liveById(d.live);
    const n = l.pecas.filter(p => !p.status).length;
    confirmDlg(`Marcar ${n} peças como devolvidas?`, 'Todas as peças ainda sem status nesta live viram "Devolvida". Você pode desfazer logo em seguida.', () => {
      ui.undo = { liveId: l.id, pecas: clone(l.pecas) };
      l.pecas.forEach(p => { if (!p.status) p.status = 'Devolvida'; });
      commit(); toast(`${n} peças marcadas como devolvidas.`, true);
    });
  },
  undo: () => {
    const u = ui.undo; const l = u && liveById(u.liveId);
    if (l) { l.pecas = u.pecas; ui.undo = null; commit(); toast('Desfeito ✿'); }
  },
  addGasto: d => { const g = { id: uid(), desc: '', valor: null }; liveById(d.live).gastos.push(g); ui.focusK = `g-${g.id}-desc`; commit(); },
  delGasto: d => { const l = liveById(d.live); l.gastos = l.gastos.filter(g => g.id !== d.id); commit(); },
  parse: () => {
    ui.importRows = parseLista(ui.importText);
    if (!ui.importRows.length) toast('Nenhuma peça encontrada no texto.');
    render();
  },
  clearImport: () => { ui.importText = ''; ui.importRows = []; render(); },
  delImportRow: d => { ui.importRows.splice(+d.i, 1); render(); },
  doImport: () => {
    let l = liveById(ui.importLive);
    if (!l) { l = newLive(liveName()); state.lives.push(l); }
    let n = 0;
    ui.importRows.forEach(r => { for (let i = 0; i < (r.qtd || 1); i++) { l.pecas.push({ id: uid(), nome: r.nome, categoria: r.categoria, valor: r.valor, status: r.status }); n++; } });
    ui.importRows = []; ui.importText = '';
    save(); toast(`${n} peças adicionadas em ${esc(l.nome)} ✿`);
    ACTIONS.openLive({ id: l.id });
  },
  login: () => CLOUD ? loginCloud() : state.settings.pinHash ? askPin() : createPin(false),
  changePin: () => createPin(true),
  logout: async () => {
    if (CLOUD) { await Cloud.logout(); toast('Você saiu ✿'); return; }
    ui.owner = false; try { sessionStorage.removeItem(OWNER_KEY); } catch (e) { } render(); toast('Modo visitante ✿');
  },
  recarregar: () => location.reload(),
  exportJson: () => {
    const data = clone(state); delete data.settings.pinHash;
    download(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), `brecho-lives-${today()}.json`);
  },
  importJson: () => { const f = $('#fileJson'); f.value = ''; f.click(); },
  exportXlsx: exportXlsx,
  reset: () => confirmDlg('Restaurar o estado inicial?', 'Apaga vendedoras, lives, status e gastos e volta para Live 01 e Live 02 com as 220 peças originais. Exporte um backup antes se quiser guardar algo.', () => {
    const pin = state.settings.pinHash;
    state = freshState(); state.settings.pinHash = pin;
    ui.view = 'inicio'; commit(); toast('Dados restaurados ✿');
  }, 'Restaurar'),
};

document.addEventListener('click', e => {
  const nav = e.target.closest('[data-view]');
  if (nav) {
    ui.view = nav.dataset.view; ui.liveId = ui.view === 'live' ? ui.liveId : null;
    document.body.classList.remove('menu-open');
    render(); window.scrollTo(0, 0); return;
  }
  const b = e.target.closest('[data-a]');
  if (!b || b.disabled) return;
  const fn = ACTIONS[b.dataset.a];
  if (fn) { e.preventDefault(); fn(b.dataset); }
});

/* ================= Modal, toast, PIN ================= */
function modal({ title, body, ok = 'Confirmar', danger = false, onOk }) {
  const m = $('#modal');
  m.innerHTML = `<form class="modal-card"><h3>${title}</h3><div class="modal-body">${body}<div class="err" id="mErr"></div></div>
    <div class="modal-actions"><button type="button" class="btn ghost" data-m="cancel">Cancelar</button><button type="submit" class="btn ${danger ? 'danger' : ''}">${ok}</button></div></form>`;
  m.hidden = false;
  const close = () => { m.hidden = true; m.innerHTML = ''; };
  const first = m.querySelector('input, select'); (first || m.querySelector('[type=submit]')).focus();
  m.onclick = e => { if (e.target === m || e.target.dataset.m === 'cancel') close(); };
  m.onkeydown = e => { if (e.key === 'Escape') close(); };
  m.querySelector('form').onsubmit = async e => {
    e.preventDefault();
    const r = onOk ? await onOk(m) : true;
    if (r !== false) close();
  };
}
function confirmDlg(title, text, onOk, ok = 'Excluir') {
  modal({ title, body: `<p>${text}</p>`, ok, danger: true, onOk: () => { onOk(); } });
}
let toastTimer;
function toast(msg, undo = false) {
  const t = $('#toast');
  t.innerHTML = `<span>${msg}</span>${undo ? '<button class="btn sm" data-a="undo">Desfazer</button>' : ''}`;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, undo ? 9000 : 4000);
}

async function hashPin(pin) {
  const s = 'brecho-lives✿' + pin;
  if (window.crypto && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381; for (const ch of s) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;
  return 'djb2-' + h.toString(16);
}
function enterOwner() {
  ui.owner = true;
  try { sessionStorage.setItem(OWNER_KEY, '1'); } catch (e) { }
  render(); toast('Modo dono ativado 🔓');
}
function createPin(trocar) {
  modal({
    title: trocar ? 'Trocar PIN do dono' : 'Criar PIN do dono',
    body: `<p class="small">Escolha um PIN de 4 a 8 números. Ele protege a edição neste navegador — é só uma barreira leve, não segurança real.</p>
      <label class="field"><span>Novo PIN</span><input class="in" id="p1" type="password" inputmode="numeric" autocomplete="new-password"></label>
      <label class="field"><span>Repita o PIN</span><input class="in" id="p2" type="password" inputmode="numeric" autocomplete="new-password"></label>`,
    ok: 'Salvar PIN',
    onOk: async m => {
      const a = $('#p1', m).value.trim(), b = $('#p2', m).value.trim();
      if (!/^\d{4,8}$/.test(a)) { $('#mErr', m).textContent = 'Use de 4 a 8 números.'; return false; }
      if (a !== b) { $('#mErr', m).textContent = 'Os PINs não conferem.'; return false; }
      state.settings.pinHash = await hashPin(a); save();
      if (trocar) toast('PIN trocado ✿'); else enterOwner();
    },
  });
}
function loginCloud() {
  modal({
    title: 'Entrar como dono',
    body: `<label class="field"><span>E-mail</span><input class="in" id="lEmail" type="email" autocomplete="username"></label>
      <label class="field"><span>Senha</span><input class="in" id="lSenha" type="password" autocomplete="current-password"></label>`,
    ok: 'Entrar',
    onOk: async m => {
      const err = await Cloud.login($('#lEmail', m).value.trim(), $('#lSenha', m).value);
      if (err) { $('#mErr', m).textContent = err; return false; }
    },
  });
}
function askPin() {
  modal({
    title: 'Entrar como dono',
    body: '<label class="field"><span>PIN</span><input class="in" id="p1" type="password" inputmode="numeric" autocomplete="current-password"></label>',
    ok: 'Entrar',
    onOk: async m => {
      if (await hashPin($('#p1', m).value.trim()) !== state.settings.pinHash) { $('#mErr', m).textContent = 'PIN incorreto.'; return false; }
      enterOwner();
    },
  });
}

/* ================= Arquivos ================= */
const today = () => new Date().toISOString().slice(0, 10);
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function readJsonFile(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (CLOUD && !ui.owner) return toast('Só o dono pode restaurar dados.');
  const rd = new FileReader();
  rd.onload = () => {
    let d;
    try { d = JSON.parse(rd.result); } catch (e) { return toast('Arquivo inválido: não é um JSON.'); }
    if (!d || !Array.isArray(d.lives)) return toast('Esse arquivo não parece um backup do brechó.');
    confirmDlg('Abrir este arquivo de dados?', `<b>${esc(file.name)}</b> tem ${d.lives.length} lives e ${(d.vendedoras || []).length} vendedoras. ${CLOUD ? "Os dados atuais da nuvem serão substituídos para todos os aparelhos." : "Os dados atuais deste navegador serão substituídos."}`, () => {
      const pin = state.settings.pinHash;
      state = normalize(d); state.settings.pinHash = pin;
      ui.view = 'inicio'; commit(); toast('Dados carregados ✿');
    }, 'Abrir');
  };
  rd.readAsText(file);
}
function exportXlsx() {
  if (!window.XLSX) return toast('Exportar planilha precisa de internet (biblioteca não carregou).');
  const wb = XLSX.utils.book_new();
  const used = new Set();
  const sheetName = n => { let s = n.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Aba'; let i = 2; while (used.has(s)) s = s.slice(0, 28) + ' ' + i++; used.add(s); return s; };
  const res = [['Live', 'Data', 'Vendedora', 'Peças vendidas', 'Peças devolvidas', 'Venda total', 'Taxas', 'Recebido (após taxas)', 'Preço pago das peças', 'Pagamento vendedora', 'Gastos', 'Lucro final']];
  state.lives.forEach(l => { const c = calcLive(l); res.push([l.nome, l.data ? dateBR(l.data) : '', vendById(l.vendedoraId)?.nome || '', c.nVend, c.nDev, c.venda, c.taxas, c.recebido, c.custo, c.pag, c.gastos, c.lucro]); });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(res), sheetName('Resumo'));
  const vs = [['Nome', 'Modelo de pagamento', '% sobre a venda', 'Valor fechado por live', 'Valor por hora', 'Observações']];
  state.vendedoras.forEach(v => vs.push([v.nome, v.modelo, v.pct, v.fixo, v.porHora, v.obs]));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(vs), sheetName('Vendedoras'));
  state.lives.forEach(l => {
    const c = calcLive(l);
    const rows = [[l.nome], ['Data', l.data ? dateBR(l.data) : ''], ['Vendedora', vendById(l.vendedoraId)?.nome || ''], ['Horas', l.horas],
      ['Venda total', c.venda], ['Taxas', c.taxas], ['Recebido', c.recebido], ['Preço pago das peças', c.custo], ['Pagamento vendedora', c.pag], ['Gastos', c.gastos], ['Lucro final', c.lucro], [],
      ['#', 'Peça', 'Categoria', 'Preço de venda (R$)', 'Preço pago (R$)', 'Status']];
    l.pecas.forEach((p, i) => rows.push([i + 1, p.nome, p.categoria, p.valor, p.custo, p.status]));
    if (l.gastos.length) { rows.push([], ['Gastos', 'Valor (R$)']); l.gastos.forEach(g => rows.push([g.desc, g.valor])); }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName(l.nome));
  });
  XLSX.writeFile(wb, `brecho-lives-${today()}.xlsx`);
}

/* ================= Início ================= */
render();
if (CLOUD) Cloud.init();
