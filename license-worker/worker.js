/* Lago — service de licences (Cloudflare Worker, offre gratuite).
   Rôle : quand un client paie une option sur Stripe, Lago reçoit tout seul sa licence signée.
   Aucun mot de passe ni donnée de carte ici : Stripe garde les paiements.

   À CONFIGURER (voir LISEZMOI.md) :
     - Liaison KV      : LIC
     - Secret          : STRIPE_WHSEC  (« Secret de signature » du webhook Stripe, commence par whsec_)
     - Secret          : ADMIN         (un mot de passe long, pour vos commandes d'administration)
     - Variable        : PRICES        ({"price_123":"premium","price_456":"multi"}  identifiant de prix Stripe → option)
*/
const enc = new TextEncoder();
const DAY = 864e5;
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type,authorization',
  'access-control-max-age': '86400'
};
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS } });

const b64u = buf => {
  const a = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const same = (a, b) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

/* ---------- signature Stripe (HMAC-SHA256 de « horodatage.corps ») ---------- */
async function stripeOk(raw, header, secret) {
  if (!header || !secret) return false;
  const p = {};
  String(header).split(',').forEach(x => {
    const i = x.indexOf('=');
    if (i > 0) (p[x.slice(0, i).trim()] = p[x.slice(0, i).trim()] || []).push(x.slice(i + 1).trim());
  });
  const t = +(p.t && p.t[0]);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = hex(await crypto.subtle.sign('HMAC', key, enc.encode(t + '.' + raw)));
  return (p.v1 || []).some(v => same(v, mac));
}

/* ---------- clé de signature des licences (ECDSA P-256) ---------- */
async function keys(env) {
  const j = await env.LIC.get('key');
  if (!j) return null;
  const k = JSON.parse(j);
  return {
    pub: k.pub,
    priv: await crypto.subtle.importKey('jwk', k.priv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  };
}
async function setup(env) {
  const ex = await env.LIC.get('key');
  if (ex) return JSON.parse(ex).pub;
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const priv = await crypto.subtle.exportKey('jwk', kp.privateKey);
  const clean = ({ kty, crv, x, y }) => ({ kty, crv, x, y });
  await env.LIC.put('key', JSON.stringify({ pub: clean(pub), priv }));
  return clean(pub);
}

/* ---------- état d'un client ---------- */
const okCid = c => typeof c === 'string' && /^[A-Za-z0-9_-]{12,64}$/.test(c);
const getJ = async (env, k) => { const v = await env.LIC.get(k); return v ? JSON.parse(v) : null; };
const putJ = (env, k, o) => env.LIC.put(k, JSON.stringify(o));

async function optsOf(env, cid) {
  const out = {};
  const add = (o) => { for (const k in (o || {})) if (+o[k] > (out[k] || 0)) out[k] = +o[k]; };
  const cust = await env.LIC.get('c:' + cid);
  if (cust) add((await getJ(env, 'u:' + cust) || {}).opts);
  add((await getJ(env, 'g:' + cid) || {}).opts);
  const now = Date.now();
  for (const k in out) if (out[k] < now) delete out[k];
  return out;
}

async function license(env, cid) {
  const K = await keys(env);
  if (!K) return { ok: false, err: 'pas_configure' };
  const opts = await optsOf(env, cid);
  if (!Object.keys(opts).length) return { ok: true, tok: null, opts: {} };
  const body = b64u(enc.encode(JSON.stringify({ v: 1, id: cid, opts, iat: Date.now() })));
  const sig = b64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, K.priv, enc.encode(body)));
  return { ok: true, tok: body + '.' + sig, opts };
}

/* ---------- événements Stripe ---------- */
const priceOf = l => (l && ((l.price && l.price.id) || (l.pricing && l.pricing.price_details && l.pricing.price_details.price) || (l.plan && l.plan.id))) || '';
async function onStripe(env, ev) {
  const o = ev && ev.data && ev.data.object;
  if (!o) return;
  if (ev.type === 'checkout.session.completed') {
    const cid = o.client_reference_id, cust = o.customer;
    if (okCid(cid) && cust) {
      await env.LIC.put('c:' + cid, cust);
      const u = (await getJ(env, 'u:' + cust)) || { opts: {} };
      u.cid = cid;
      await putJ(env, 'u:' + cust, u);
    }
  } else if (ev.type === 'invoice.paid') {
    const cust = o.customer;
    if (!cust) return;
    let map = {};
    try { map = JSON.parse(env.PRICES || '{}'); } catch (e) { map = {}; }
    const u = (await getJ(env, 'u:' + cust)) || { opts: {} };
    u.opts = u.opts || {};
    for (const l of ((o.lines && o.lines.data) || [])) {
      const opt = map[priceOf(l)];
      const end = l.period && l.period.end ? l.period.end * 1000 : 0;
      if (opt && end > (u.opts[opt] || 0)) u.opts[opt] = end;
    }
    await putJ(env, 'u:' + cust, u);
  }
}

/* ---------- routes ---------- */
export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    const p = url.pathname.replace(/\/+$/, '') || '/';
    try {
      if (p === '/' ) return json({ ok: true, service: 'lago-licences' });

      if (p === '/pub' && req.method === 'GET') {
        const j = await env.LIC.get('key');
        return json(j ? { ok: true, pub: JSON.parse(j).pub } : { ok: false });
      }

      if (p === '/license' && req.method === 'GET') {
        const cid = url.searchParams.get('cid');
        if (!okCid(cid)) return json({ ok: false, err: 'identifiant' }, 400);
        return json(await license(env, cid));
      }

      if (p === '/stripe' && req.method === 'POST') {
        const raw = await req.text();
        if (!(await stripeOk(raw, req.headers.get('stripe-signature'), env.STRIPE_WHSEC))) return json({ ok: false, err: 'signature' }, 400);
        let ev;
        try { ev = JSON.parse(raw); } catch (e) { return json({ ok: false }, 400); }
        await onStripe(env, ev);
        return json({ ok: true });
      }

      if (p.startsWith('/admin/')) {
        const a = req.headers.get('authorization') || '';
        if (!env.ADMIN || !same(a, 'Bearer ' + env.ADMIN)) return json({ ok: false, err: 'refusé' }, 401);

        if (p === '/admin/setup' && req.method === 'POST') return json({ ok: true, pub: await setup(env) });

        /* offrir une option : { "cid":"…", "opt":"premium", "days":365 } (days absent = 10 ans) */
        if (p === '/admin/grant' && req.method === 'POST') {
          const b = await req.json();
          if (!okCid(b.cid) || !/^[a-z0-9_-]{1,30}$/.test(b.opt || '')) return json({ ok: false, err: 'paramètres' }, 400);
          const g = (await getJ(env, 'g:' + b.cid)) || { opts: {} };
          g.opts[b.opt] = Date.now() + (+b.days > 0 ? +b.days : 3650) * DAY;
          await putJ(env, 'g:' + b.cid, g);
          return json({ ok: true, opts: g.opts });
        }
        if (p === '/admin/revoke' && req.method === 'POST') {
          const b = await req.json();
          if (!okCid(b.cid)) return json({ ok: false, err: 'paramètres' }, 400);
          await env.LIC.delete('g:' + b.cid);
          return json({ ok: true });
        }
        if (p === '/admin/status' && req.method === 'GET') {
          const cid = url.searchParams.get('cid');
          if (!okCid(cid)) return json({ ok: false, err: 'identifiant' }, 400);
          return json({ ok: true, opts: await optsOf(env, cid) });
        }
      }
      return json({ ok: false, err: 'introuvable' }, 404);
    } catch (e) {
      return json({ ok: false, err: 'erreur' }, 500);
    }
  }
};
