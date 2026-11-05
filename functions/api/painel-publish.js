// functions/api/painel-publish.js  →  rota /api/painel-publish  (Cloudflare Pages Functions)
// Publica uma importação validada no Supabase. A autorização é validada AQUI, no servidor:
//   1) o token do usuário (Supabase Auth) é conferido no Supabase;
//   2) o e-mail precisa estar confirmado e constar em PUBLISHER_EMAILS.
// A gravação usa a chave secreta (SUPABASE_SECRET_KEY), que existe só nas variáveis do Cloudflare.
// Adaptado de netlify/functions/painel-publish.mjs — validação, checksum e resumo idênticos.

const MAX_BODY = 5 * 1024 * 1024; // mantido igual ao Netlify (o Cloudflare aceita até 100 MB)
const SLOTS = ['CONSOL.', 'BREWHOUSE 1', 'BREWHOUSE 3', 'FERMENTHP', 'FERMENTAMSTELPRAY', 'BRIGHT BEER'];
const KEY_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

let ENV = {};
const env = (k) => String(ENV[k] || '').trim();
const reply = (status, obj) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

// ---- mesmas funções puras do painel (checksum, classificação, resumo) ----
function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}
const pkeyOf = (p) =>
  p && Number.isInteger(p.m) && Number.isInteger(p.y) && p.m >= 0 && p.m < 12 ? p.y + '-' + String(p.m + 1).padStart(2, '0') : null;

function cls(x, p) {
  if (x == null) return 'ausente';
  if (p.lo == null && p.hi == null) return 'sem limite';
  return (p.lo == null || x >= p.lo) && (p.hi == null || x <= p.hi) ? 'dentro' : 'fora';
}
function agg(rs) {
  const a = { dentro: 0, fora: 0 }, ev = new Set(), bad = new Set();
  rs.forEach((r) => {
    if (r.st === 'dentro') { a.dentro++; ev.add(r.l); }
    else if (r.st === 'fora') { a.fora++; ev.add(r.l); bad.add(r.l); }
  });
  a.lots = ev.size; a.lotsBad = bad.size;
  a.ftr = ev.size ? ((ev.size - bad.size) / ev.size) * 100 : null;
  return a;
}
function readings(groups, lots) {
  const o = [];
  lots.forEach((l) => {
    const G = groups[l.g];
    l.v.forEach((x, i) => {
      if (l.ig && l.ig[i]) return;
      if (x == null && G.sparse) return;
      const p = G.p[i];
      o.push({ l, st: cls(x, p) });
    });
  });
  return o;
}
function summarize(d) {
  const R = {
    bh: readings(d.groups, d.lots),
    fe: readings(d.fe.groups, d.fe.lots),
    bb: readings(d.bb.groups, d.bb.lots),
  };
  const C = d.consol || [];
  const rx = { bh: /^FTR Brewhouse/, fe: /^FTR Fermentation/, bb: /^FTR Bright Beer/ };
  const o = {
    key: pkeyOf(d.period),
    meta: d.meta ?? null,
    ftrGeral: d.ftrGeral != null ? d.ftrGeral * 100 : null,
    stages: {},
    tot: { lots: 0, lotsBad: 0, fora: 0 },
  };
  for (const k of ['bh', 'fe', 'bb']) {
    const a = agg(R[k]), row = C.find((x) => rx[k].test(x.l));
    o.stages[k] = { off: row ? row.p * 100 : null, rec: a.ftr, lots: a.lots, lotsBad: a.lotsBad, fora: a.fora };
    o.tot.lots += a.lots; o.tot.lotsBad += a.lotsBad; o.tot.fora += a.fora;
  }
  return o;
}

// ---- validação do payload (estrutura, tipos e consistência) ----
function validateLots(name, groups, lots, errs) {
  if (!Array.isArray(groups) || !Array.isArray(lots)) { errs.push(name + ': grupos/lotes ausentes'); return; }
  if (lots.length > 5000 || groups.length > 500) errs.push(name + ': volume acima do limite');
  groups.forEach((g, i) => {
    if (!g || typeof g.mosto !== 'string' || !Array.isArray(g.p)) { errs.push(name + ': grupo ' + i + ' inválido'); return; }
    g.p.forEach((p) => {
      if (!p || typeof p.n !== 'string') errs.push(name + ': parâmetro inválido no grupo ' + i);
      else for (const k of ['t', 'lo', 'hi']) if (p[k] != null && typeof p[k] !== 'number') errs.push(name + ': limite não numérico em ' + p.n);
    });
  });
  for (const l of lots) {
    const G = groups[l && l.g];
    if (!G) { errs.push(name + ': lote sem grupo'); break; }
    if (typeof l.ref !== 'string' || !Array.isArray(l.v) || l.v.length !== G.p.length) { errs.push(name + ': lote ' + (l && l.ref) + ' inconsistente'); break; }
    if (l.v.some((x) => x != null && typeof x !== 'number')) { errs.push(name + ': valor não numérico no lote ' + l.ref); break; }
    if (l.s && (!Array.isArray(l.s) || l.s.length !== l.v.length)) { errs.push(name + ': sentenças inconsistentes no lote ' + l.ref); break; }
  }
}
function validatePayload(d, key) {
  const errs = [];
  if (!d || typeof d !== 'object' || Array.isArray(d)) return ['dados ausentes'];
  if (typeof d.file !== 'string' || !d.file) errs.push('nome do arquivo ausente');
  if (!d.fe || !d.bb) return ['estrutura de fermentação/bright beer ausente'];
  if (!Array.isArray(d.sources) || !SLOTS.every((n) => d.sources.some((x) => x && x.name === n && x.state === 'ok')))
    errs.push('as 6 abas obrigatórias precisam estar reconhecidas (' + SLOTS.join(', ') + ')');
  const pk = pkeyOf(d.period);
  if (!pk) errs.push('período não identificado');
  else if (pk !== key) errs.push('o período dos dados (' + pk + ') não confere com o informado (' + key + ')');
  else if (d.period.y < 2000 || d.period.y > 2100) errs.push('ano fora do intervalo esperado');
  if (d.ftrGeral != null && !(typeof d.ftrGeral === 'number' && d.ftrGeral >= 0 && d.ftrGeral <= 1.5)) errs.push('FTR geral fora do intervalo');
  if (d.meta != null && !(typeof d.meta === 'number' && d.meta >= 0 && d.meta <= 100)) errs.push('meta fora do intervalo');
  if (!Array.isArray(d.consol) || !d.consol.length) errs.push('CONSOL. sem indicadores');
  else if (d.consol.some((r) => !r || typeof r.l !== 'string' || typeof r.p !== 'number')) errs.push('indicador da CONSOL. inválido');
  validateLots('Brewhouse', d.groups, d.lots, errs);
  validateLots('Fermentação', d.fe.groups, d.fe.lots, errs);
  validateLots('Bright Beer', d.bb.groups, d.bb.lots, errs);
  if (Array.isArray(d.lots) && !d.lots.length) errs.push('nenhum lote de Brewhouse');
  if (d.fe && Array.isArray(d.fe.lots) && !d.fe.lots.length) errs.push('nenhum lote de fermentação');
  return errs;
}

export async function onRequest({ request: req, env: cfEnv }) {
  ENV = cfEnv || {};
  if (req.method !== 'POST') return reply(405, { ok: false, error: 'Método não permitido.' });

  const SB = env('SUPABASE_URL').replace(/\/+$/, '');
  const PUB = env('SUPABASE_PUBLISHABLE_KEY');
  const SEC = env('SUPABASE_SECRET_KEY');
  const ALLOW = env('PUBLISHER_EMAILS').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!SB || !PUB || !SEC || !ALLOW.length)
    return reply(500, { ok: false, error: 'Servidor sem configuração completa (variáveis de ambiente do Cloudflare).' });

  const origins = env('ALLOWED_ORIGINS').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.get('origin');
  if (origins.length && origin && !origins.includes(origin)) return reply(403, { ok: false, error: 'Origem não permitida.' });

  // 1) autenticação: token do Supabase Auth conferido no servidor
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') || '');
  if (!m) return reply(401, { ok: false, error: 'Login necessário para publicar.' });
  let user;
  try {
    const r = await fetch(SB + '/auth/v1/user', { headers: { apikey: PUB, Authorization: 'Bearer ' + m[1] } });
    if (!r.ok) return reply(401, { ok: false, error: 'Sessão inválida ou expirada. Entre novamente.' });
    user = await r.json();
  } catch (e) {
    return reply(502, { ok: false, error: 'Não foi possível validar o login no Supabase.' });
  }
  const email = String((user && user.email) || '').toLowerCase();
  if (!email || !(user.email_confirmed_at || user.confirmed_at)) return reply(403, { ok: false, error: 'E-mail do usuário não confirmado.' });
  // 2) autorização: lista de e-mails mantida só no servidor
  if (!ALLOW.includes(email)) return reply(403, { ok: false, error: 'Este usuário não está autorizado a publicar.' });

  // 3) payload
  const len = Number(req.headers.get('content-length') || 0);
  if (len > MAX_BODY) return reply(413, { ok: false, error: 'Arquivo grande demais para publicar.' });
  let raw;
  try { raw = await req.text(); } catch (e) { return reply(400, { ok: false, error: 'Corpo da requisição ilegível.' }); }
  if (raw.length > MAX_BODY) return reply(413, { ok: false, error: 'Arquivo grande demais para publicar.' });
  let body;
  try { body = JSON.parse(raw); } catch (e) { return reply(400, { ok: false, error: 'JSON inválido.' }); }

  const { file, periodKey, checksum, dataJson } = body || {};
  const setCurrent = body && body.setCurrent === false ? false : true;
  if (typeof periodKey !== 'string' || !KEY_RE.test(periodKey)) return reply(422, { ok: false, error: 'Período inválido.' });
  if (typeof file !== 'string' || !file.trim() || file.length > 255 || /[\u0000-\u001f]/.test(file)) return reply(422, { ok: false, error: 'Nome de arquivo inválido.' });
  if (typeof dataJson !== 'string' || typeof checksum !== 'string') return reply(422, { ok: false, error: 'Dados ausentes.' });
  if (fnv(dataJson) !== checksum) return reply(422, { ok: false, error: 'Verificação de integridade falhou (checksum).' });

  let d;
  try { d = JSON.parse(dataJson); } catch (e) { return reply(422, { ok: false, error: 'Dados ilegíveis.' }); }
  const errs = validatePayload(d, periodKey);
  if (errs.length) return reply(422, { ok: false, error: 'A validação do servidor recusou os dados. A versão anterior foi preservada.', details: errs.slice(0, 20) });

  let summary = null;
  try { summary = summarize(d); } catch (e) { return reply(422, { ok: false, error: 'Não foi possível calcular o resumo dos dados.' }); }

  // 4) gravação atômica (função SQL painel_publish), com a chave secreta
  const h = { apikey: SEC, 'Content-Type': 'application/json' };
  if (/^eyJ/.test(SEC)) h.Authorization = 'Bearer ' + SEC; // chave legada service_role (JWT)
  let res;
  try {
    res = await fetch(SB + '/rest/v1/rpc/painel_publish', {
      method: 'POST',
      headers: h,
      body: JSON.stringify({
        p_period_key: periodKey,
        p_file_name: file.trim(),
        p_checksum: checksum,
        p_data: d,
        p_summary: summary,
        p_published_by: email,
        p_set_current: setCurrent,
      }),
    });
  } catch (e) {
    return reply(502, { ok: false, error: 'Sem conexão com o Supabase. A versão anterior foi preservada.' });
  }
  if (!res.ok) {
    console.error('painel_publish falhou', res.status, (await res.text()).slice(0, 500));
    return reply(502, { ok: false, error: 'Falha ao gravar no banco. A versão anterior foi preservada.' });
  }
  const out = await res.json();
  return reply(200, {
    ok: true,
    key: periodKey,
    checksum,
    publishedAt: out.published_at,
    revision: out.revision,
    replaced: !!out.replaced,
    currentSet: !!out.current_set,
  });
}
