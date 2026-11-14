/* ✿ Sincronização com o Supabase
   O app continua trabalhando com o objeto `state` em memória. A cada alteração, este módulo
   compara o estado atual com o último que foi salvo na nuvem e envia só as linhas que mudaram
   (upsert) ou sumiram (delete). Mudanças feitas em outro aparelho chegam pelo Realtime. */
'use strict';

const Cloud = (() => {
  const cfg = window.BRECHO_CONFIG || {};
  const on = !!(cfg.supabaseUrl && cfg.supabaseKey && window.supabase);
  // pecas_custo = preço pago de cada peça, numa tabela que só o DONO consegue ler (RLS).
  // Visitantes recebem apenas a soma por live, pela função custos_por_live().
  const PARENTS_FIRST = ['ajustes', 'vendedoras', 'lives', 'pecas', 'pecas_custo', 'gastos'];
  const CHILDREN_FIRST = ['gastos', 'pecas_custo', 'pecas', 'lives', 'vendedoras'];
  const KEY = t => t === 'pecas_custo' ? 'peca_id' : 'id';
  const ORDER = t => t === 'ajustes' ? 'id' : t === 'pecas_custo' ? 'peca_id' : 'ordem';
  let sb = null, synced = null, timer = null, busy = false, again = false;
  let refreshTimer = null, status = 'idle', lastError = '', user = null, isOwner = false;

  const num = v => v == null || v === '' ? null : Number(v);

  /* ---------- Conversão estado ⇄ linhas ---------- */
  function toRows(st) {
    const r = emptyRows();
    r.ajustes.set('1', { id: 1, taxa: st.settings.taxa ?? null, faixas: st.settings.faixas });
    st.vendedoras.forEach((v, i) => r.vendedoras.set(v.id, { id: v.id, nome: v.nome || '', modelo: v.modelo || '', pct: v.pct ?? null, fixo: v.fixo ?? null, por_hora: v.porHora ?? null, obs: v.obs || '', ordem: i }));
    st.lives.forEach((l, i) => {
      r.lives.set(l.id, { id: l.id, nome: l.nome || '', data: l.data || null, vendedora_id: l.vendedoraId || null, horas: l.horas ?? null, ordem: i });
      l.pecas.forEach((p, j) => {
        r.pecas.set(p.id, { id: p.id, live_id: l.id, ref: p.ref || null, nome: p.nome || '', categoria: p.categoria || '', valor: p.valor ?? null, status: p.status || '', ordem: j });
        if (p.custo != null) r.pecas_custo.set(p.id, { peca_id: p.id, custo: p.custo });
      });
      l.gastos.forEach((g, j) => r.gastos.set(g.id, { id: g.id, live_id: l.id, descricao: g.desc || '', valor: g.valor ?? null, ordem: j }));
    });
    return r;
  }
  function fromRows(d) {
    const aj = d.ajustes[0] || {};
    const byOrd = (a, b) => a.ordem - b.ordem;
    const st = {
      version: 1,
      settings: { taxa: num(aj.taxa), faixas: Array.isArray(aj.faixas) ? aj.faixas.map(Number) : [30, 50, 80, 120, 200], pinHash: null },
      vendedoras: d.vendedoras.sort(byOrd).map(v => ({ id: v.id, nome: v.nome, modelo: v.modelo, pct: num(v.pct), fixo: num(v.fixo), porHora: num(v.por_hora), obs: v.obs })),
      lives: d.lives.sort(byOrd).map(l => ({ id: l.id, nome: l.nome, data: l.data || '', vendedoraId: l.vendedora_id || '', horas: num(l.horas), pecas: [], gastos: [] })),
    };
    const lv = new Map(st.lives.map(l => [l.id, l]));
    const custos = new Map((d.pecas_custo || []).map(c => [c.peca_id, num(c.custo)]));   // vazio para visitantes
    st.custosLive = Object.fromEntries((d.custos || []).map(c => [c.live_id, num(c.custo) || 0]));
    d.pecas.sort(byOrd).forEach(p => {
      const p2 = { id: p.id, nome: p.nome, categoria: p.categoria, valor: num(p.valor), custo: custos.get(p.id) ?? null, status: p.status };
      if (p.ref) p2.ref = p.ref;
      lv.get(p.live_id)?.pecas.push(p2);
    });
    d.gastos.sort(byOrd).forEach(g => lv.get(g.live_id)?.gastos.push({ id: g.id, desc: g.descricao, valor: num(g.valor) }));
    return st;
  }
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const emptyRows = () => Object.fromEntries(PARENTS_FIRST.map(t => [t, new Map()]));
  const snap = r => JSON.stringify(PARENTS_FIRST.map(t => [...r[t]]));
  let custosSnap = '';
  function diff(cur) {
    let n = 0;
    for (const t of PARENTS_FIRST) for (const [id, row] of cur[t]) if (!same(synced[t].get(id), row)) n++;
    for (const t of CHILDREN_FIRST) for (const id of synced[t].keys()) if (!cur[t].has(id)) n++;
    return n;
  }
  const pending = () => synced && (timer || busy || diff(toRows(state)) > 0);

  /* ---------- Status ---------- */
  function setStatus(s, err = '') {
    status = s; lastError = err;
    const el = document.getElementById('syncStatus');
    if (el) el.outerHTML = badge();
  }
  function badge() {
    const m = {
      idle: ['', '☁️ Conectando…'], loading: ['', '☁️ Carregando…'], ok: ['owner', '☁️ Sincronizado'],
      saving: ['warn', '⏳ Salvando…'], error: ['warn', '⚠️ Erro ao salvar'], offline: ['warn', '📴 Sem conexão'],
    }[status] || ['', ''];
    return `<span id="syncStatus" class="badge ${m[0]}" title="${esc(lastError)}">${m[1]}</span>`;
  }

  /* ---------- Leitura ---------- */
  async function fetchAll() {
    const out = {};
    for (const t of PARENTS_FIRST) {
      const rows = [];
      if (t === 'pecas_custo' && !isOwner) { out[t] = rows; continue; }   // visitante: nem pede o preço pago
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from(t).select('*').order(ORDER(t)).range(from, from + 999);
        if (error) throw error;
        rows.push(...data);
        if (data.length < 1000) break;
      }
      out[t] = rows;
    }
    // soma do preço pago das peças vendidas, por live (liberada para todos; o valor por peça não)
    const { data: custos, error: eC } = await sb.rpc('custos_por_live');
    if (eC) console.warn('custos_por_live:', eC.message);
    out.custos = custos || [];
    return out;
  }
  async function refresh(force = false) {
    clearTimeout(refreshTimer);
    // não atropela o que a pessoa está digitando nem alterações ainda não enviadas
    const ae = document.activeElement;
    const typing = ae && ae.closest && ae.closest('#main') && /INPUT|TEXTAREA|SELECT/.test(ae.tagName);
    if (!force && (pending() || typing || !$('#modal').hidden)) { refreshTimer = setTimeout(() => refresh(), 1500); return; }
    try {
      if (!synced) setStatus('loading');
      const d = await fetchAll();
      const novo = fromRows(d);
      const empty = !d.lives.length && !d.vendedoras.length && !d.ajustes.length;
      if (empty && isOwner) {
        // primeiro uso: sobe as duas lives iniciais com as 220 peças
        state = freshState();
        synced = emptyRows();
        ui.loading = false; render();
        toast('Primeiro acesso: enviando as lives iniciais para a nuvem ✿');
        return flush();
      }
      const rows = toRows(novo);
      const cs = JSON.stringify(novo.custosLive);
      const changed = !synced || snap(rows) !== snap(synced) || cs !== custosSnap;
      synced = rows; custosSnap = cs;
      if (changed || ui.loading) { state = novo; ui.loading = false; render(); }
      setStatus('ok');
    } catch (e) {
      console.error(e);
      setStatus(navigator.onLine ? 'error' : 'offline', e.message || String(e));
      if (ui.loading) { ui.loading = false; ui.loadError = e.message || String(e); render(); }
      refreshTimer = setTimeout(() => refresh(), 8000);
    }
  }

  /* ---------- Escrita ---------- */
  function schedule() {
    if (!synced || !isOwner) return;
    clearTimeout(timer);
    setStatus('saving');
    timer = setTimeout(() => { timer = null; flush(); }, 500);
  }
  async function flush() {
    if (!synced || !isOwner) return;
    if (busy) { again = true; return; }
    busy = true; setStatus('saving');
    const cur = toRows(state);
    try {
      for (const t of PARENTS_FIRST) {
        const up = [...cur[t]].filter(([id, row]) => !same(synced[t].get(id), row)).map(x => x[1]);
        for (let i = 0; i < up.length; i += 500) {
          const { error } = await sb.from(t).upsert(up.slice(i, i + 500));
          if (error) throw error;
        }
      }
      for (const t of CHILDREN_FIRST) {
        const del = [...synced[t].keys()].filter(id => !cur[t].has(id));
        for (let i = 0; i < del.length; i += 200) {
          const { error } = await sb.from(t).delete().in(KEY(t), del.slice(i, i + 200));
          if (error) throw error;
        }
      }
      synced = cur;
      setStatus('ok');
    } catch (e) {
      console.error(e);
      setStatus(navigator.onLine ? 'error' : 'offline', e.message || String(e));
      toast('⚠️ Não foi possível salvar na nuvem. Vou tentar de novo em instantes.');
      setTimeout(schedule, 5000);
    }
    busy = false;
    if (again) { again = false; flush(); }
  }

  /* ---------- Login ---------- */
  async function checkOwner() {
    if (!user) { isOwner = false; return; }
    const { data, error } = await sb.from('donos').select('user_id').eq('user_id', user.id);
    isOwner = !error && data.length > 0;
  }
  async function onAuth(session) {
    user = session ? session.user : null;
    await checkOwner();
    ui.owner = isOwner;
    if (user && !isOwner) toast('Você entrou, mas este usuário ainda não é dono (falta o passo 2 do SQL).');
    await refresh(true);
    render();
  }
  async function login(email, senha) {
    const { error } = await sb.auth.signInWithPassword({ email, password: senha });
    return error ? (error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message) : null;
  }
  async function logout() {
    if (pending()) await flush();
    await sb.auth.signOut();
  }

  /* ---------- Início ---------- */
  async function init() {
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
    let first = true;
    sb.auth.onAuthStateChange((ev, session) => {
      const uidNovo = session ? session.user.id : null;
      if (!first && (user ? user.id : null) === uidNovo) return; // só renovação de token
      first = false;
      setTimeout(() => onAuth(session), 0);
    });
    sb.channel('brecho-db')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => refresh(), 700); })
      .subscribe();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (timer) { clearTimeout(timer); timer = null; flush(); } }
      else refresh();
    });
    window.addEventListener('online', () => { schedule(); refresh(); });
    window.addEventListener('beforeunload', e => { if (pending()) { e.preventDefault(); e.returnValue = ''; } });
  }

  return { on, init, schedule, flush, login, logout, badge, get user() { return user; } };
})();
