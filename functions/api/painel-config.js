// functions/api/painel-config.js  →  rota /api/painel-config  (Cloudflare Pages Functions)
// Entrega ao navegador SOMENTE a URL do projeto e a chave pública (sb_publishable_).
// Recusa-se a responder se a variável contiver uma chave secreta/service_role por engano.
// Adaptado de netlify/functions/painel-config.mjs — mesmo comportamento.

const reply = (status, obj) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': status === 200 ? 'public, max-age=300' : 'no-store',
    },
  });

function b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return atob(s);
}

function isSecret(key) {
  if (/^sb_secret_/.test(key)) return true;
  if (/^eyJ/.test(key)) {
    try {
      const p = JSON.parse(b64urlDecode(key.split('.')[1] || ''));
      return p.role !== 'anon';
    } catch (e) {
      return true;
    }
  }
  return false;
}

export async function onRequest({ request, env }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return reply(405, { error: 'Método não permitido.' });
  }
  const url = String(env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = String(env.SUPABASE_PUBLISHABLE_KEY || '').trim();
  if (!url || !key) {
    return reply(500, { error: 'SUPABASE_URL ou SUPABASE_PUBLISHABLE_KEY não configurada no Cloudflare.' });
  }
  if (isSecret(key)) {
    return reply(500, { error: 'SUPABASE_PUBLISHABLE_KEY contém uma chave secreta. Use a chave sb_publishable_.' });
  }
  return reply(200, { url, key });
}
