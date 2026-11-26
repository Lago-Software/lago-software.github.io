/* Lago Cloud : petit serveur (Cloudflare Worker) pour
 *  - l'inscription en libre-service (création d'un espace Lago prêt à l'emploi),
 *  - l'achat d'options par abonnement Stripe et leur activation automatique,
 *  - le paiement en ligne des réservations avec commission Lago (Stripe Connect).
 * Aucune dépendance. Les secrets sont dans l'environnement du Worker (voir cloud/LISEZMOI.md).
 * Les données des clients restent dans la base Firebase ; ce serveur n'y écrit que le registre (_t, _c, _pk), les droits (_ent) et les paiements (_pay). */

export const OPTIONS = { cast: 900, qr: 500, wallet: 900, ia: 900, multi: 1900, export: 900, support: 1900 }; /* centimes HT par mois */
export const PACK = { key: 'pack', price: 5900 };
export const COMMISSION_BPS = 200; /* 2 % */
export const TEMPLATES = ['accrobranche', 'boutique', 'bowling', 'coiffeur', 'escape-game', 'institut-de-beaute', 'karting', 'laser-game', 'parc-indoor', 'parc-trampoline', 'restaurant', 'salle-d-escalade'];
const OPT_NAMES = {
  cast: 'Lago Cast : écran TV client', qr: 'Lago : check-in par QR code', wallet: 'Lago : carte de fidélité dans le wallet', ia: 'Lago : recherche IA',
  multi: 'Lago : plusieurs établissements', export: 'Lago : rapports et exports', support: 'Lago : support prioritaire', pack: 'Lago : pack Tout (toutes les options)'
};
const te = new TextEncoder();
const b64u = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hex = (u8) => [...u8].map((x) => x.toString(16).padStart(2, '0')).join('');
const rand = (n) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map((x) => 'abcdefghijkmnpqrstuvwxyz23456789'[x % 32]).join(''); };
const sha = async (s) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(s))));
const eq = (a, b) => { a = String(a); b = String(b); if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

/* ---------- HTTP ---------- */
const origins = (env) => String(env.ALLOW_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
function cors(req, env, open) {
  const o = req.headers.get('Origin') || '';
  const ok = open ? '*' : origins(env).includes(o) ? o : '';
  const h = { 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' };
  if (ok) h['Access-Control-Allow-Origin'] = ok;
  return h;
}
const json = (o, status, h) => new Response(JSON.stringify(o), { status: status || 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(h || {}) } });
class Err extends Error { constructor(status, msg) { super(msg); this.status = status; } }

/* ---------- Stripe (formulaires imbriqués) ---------- */
export function form(o, p, out) {
  out = out || [];
  for (const k in o) {
    const v = o[k]; if (v === undefined || v === null) continue;
    const key = p ? p + '[' + k + ']' : k;
    if (typeof v === 'object') form(v, key, out); else out.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(v)));
  }
  return out.join('&');
}
async function stripe(env, method, path, params, acct) {
  const h = { Authorization: 'Bearer ' + env.STRIPE_KEY, 'Content-Type': 'application/x-www-form-urlencoded' };
  if (acct) h['Stripe-Account'] = acct;
  const url = 'https://api.stripe.com/v1/' + path + (method === 'GET' && params ? '?' + form(params) : '');
  const r = await fetch(url, { method, headers: h, body: method === 'GET' ? undefined : form(params || {}) });
  const j = await r.json();
  if (!r.ok) throw new Err(502, 'Stripe : ' + ((j && j.error && j.error.message) || r.status));
  return j;
}
export async function verifyStripe(raw, header, secret, now, tol) {
  const m = {}; String(header || '').split(',').forEach((p) => { const i = p.indexOf('='); if (i > 0) (m[p.slice(0, i).trim()] = m[p.slice(0, i).trim()] || []).push(p.slice(i + 1)); });
  const t = +((m.t || [])[0]); if (!t || !(m.v1 || []).length) return false;
  if (Math.abs((now || Date.now() / 1000) - t) > (tol || 300)) return false;
  const key = await crypto.subtle.importKey('raw', te.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, te.encode(t + '.' + raw))));
  return m.v1.some((v) => eq(v, sig));
}

/* ---------- Firebase Realtime Database (compte de service) ---------- */
let TOK = { v: '', exp: 0 };
async function fbToken(env) {
  if (env.FB_TOKEN) return env.FB_TOKEN; /* tests */
  if (TOK.v && TOK.exp > Date.now() + 60000) return TOK.v;
  const sa = JSON.parse(env.FB_SA), now = Math.floor(Date.now() / 1000);
  const head = b64u(te.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const body = b64u(te.encode(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = b64u(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, te.encode(head + '.' + body))));
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + body + '.' + sig }) });
  const j = await r.json(); if (!r.ok || !j.access_token) throw new Err(500, 'Base indisponible');
  TOK = { v: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return TOK.v;
}
async function rtdb(env, method, path, body) {
  const t = await fbToken(env);
  const r = await fetch(env.FB_URL.replace(/\/+$/, '') + '/' + path + '.json?access_token=' + encodeURIComponent(t) + (method === 'PUT' || method === 'PATCH' ? '&print=silent' : ''), { method, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!r.ok) throw new Err(500, 'Base : erreur ' + r.status);
  return method === 'GET' ? r.json() : null;
}

/* ---------- registre ---------- */
async function tenantByAuth(env, b) {
  const r = String(b.r || ''), o = String(b.o || '');
  const m = /^c\/([a-z2-9]{22})$/.exec(r); if (!m || !o) throw new Err(401, 'Accès refusé');
  const tid = await rtdb(env, 'GET', '_r/' + m[1]); if (!tid) throw new Err(401, 'Accès refusé');
  const t = await rtdb(env, 'GET', '_t/' + tid); if (!t || !t.oh || !eq(await sha(o), t.oh)) throw new Err(401, 'Accès refusé');
  return { tid, t };
}
export const ENT_KEYS = [...Object.keys(OPTIONS)];
export function entFrom(subs) {
  const e = {};
  for (const s of subs) {
    if (!['active', 'trialing', 'past_due'].includes(s.status)) continue;
    const k = (s.metadata && s.metadata.opt) || '';
    if (k === 'pack') ENT_KEYS.forEach((x) => (e[x] = 1));
    else if (ENT_KEYS.includes(k)) e[k] = 1;
    if (k === 'pack') e.pack = 1;
  }
  return e;
}
async function syncEnt(env, tid) {
  const t = await rtdb(env, 'GET', '_t/' + tid); if (!t) return null;
  let ent = {};
  if (t.cus) { const l = await stripe(env, 'GET', 'subscriptions', { customer: t.cus, status: 'all', limit: 100 }); ent = entFrom(l.data || []); }
  ent.at = Date.now();
  await rtdb(env, 'PUT', '_ent/c/' + t.r.slice(2), ent);
  return ent;
}

/* ---------- routes ---------- */
async function signup(env, b, req) {
  const name = String(b.name || '').trim().replace(/\s+/g, ' '), tpl = String(b.tpl || ''), email = String(b.email || '').trim().toLowerCase();
  if (name.length < 2 || name.length > 60) throw new Err(400, 'Indiquez le nom de votre établissement (2 à 60 caractères).');
  if (!TEMPLATES.includes(tpl)) throw new Err(400, 'Choisissez votre métier.');
  if (!/^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,}$/.test(email)) throw new Err(400, 'Indiquez une adresse e-mail valide.');
  if (b.hp) throw new Err(400, 'Demande refusée.'); /* champ piège anti-robots */
  if (env.TURNSTILE_SECRET) {
    const v = await (await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form({ secret: env.TURNSTILE_SECRET, response: String(b.ts || ''), remoteip: req && req.headers.get('CF-Connecting-IP') || '' }), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })).json();
    if (!v.success) throw new Err(400, 'Vérification anti-robot échouée : réessayez.');
  }
  if (env.RL && req) { /* 5 créations par heure et par adresse IP */
    const ip = req.headers.get('CF-Connecting-IP') || 'x', k = 'su:' + ip, n = +(await env.RL.get(k)) || 0;
    if (n >= 5) throw new Err(429, 'Trop de demandes : réessayez dans une heure.');
    await env.RL.put(k, String(n + 1), { expirationTtl: 3600 });
  }
  const tid = rand(16), rr = rand(22), ot = rand(24);
  const t = { name, tpl, email, r: 'c/' + rr, oh: await sha(ot), at: Date.now(), plan: 'free' };
  await rtdb(env, 'PUT', '_t/' + tid, t);
  await rtdb(env, 'PUT', '_r/' + rr, tid);
  await rtdb(env, 'PUT', '_ent/c/' + rr, { at: Date.now() });
  const cfg = { u: env.FB_URL.replace(/\/+$/, ''), r: t.r, b: 1, t: tpl, n: name, m: 1, w: env.WORKER_URL, o: ot };
  const link = env.APP_URL.replace(/\/+$/, '') + '/#cloud=' + b64u(te.encode(JSON.stringify(cfg)));
  return { link, name };
}
async function ensureCustomer(env, tid, t) {
  if (t.cus) return t.cus;
  const c = await stripe(env, 'POST', 'customers', { name: t.name, email: t.email, metadata: { tid } });
  await rtdb(env, 'PUT', '_t/' + tid + '/cus', c.id); await rtdb(env, 'PUT', '_c/' + c.id, tid);
  return c.id;
}
async function checkout(env, b) {
  const { tid, t } = await tenantByAuth(env, b);
  const opt = String(b.opt || ''), price = opt === 'pack' ? PACK.price : OPTIONS[opt];
  if (!price) throw new Err(400, 'Option inconnue.');
  const cus = await ensureCustomer(env, tid, t);
  const back = env.APP_URL.replace(/\/+$/, '') + '/';
  const s = await stripe(env, 'POST', 'checkout/sessions', {
    mode: 'subscription', customer: cus, client_reference_id: tid,
    line_items: { 0: { quantity: 1, price_data: { currency: 'eur', unit_amount: price, recurring: { interval: 'month' }, product_data: { name: OPT_NAMES[opt] } } } },
    subscription_data: { metadata: { tid, opt } }, metadata: { tid, opt },
    allow_promotion_codes: 'true', billing_address_collection: 'required', tax_id_collection: { enabled: 'true' }, customer_update: { name: 'auto', address: 'auto' },
    success_url: back + '?abonnement=ok', cancel_url: back + '?abonnement=annule'
  });
  return { url: s.url };
}
async function portal(env, b) {
  const { t } = await tenantByAuth(env, b);
  if (!t.cus) throw new Err(400, 'Aucun abonnement pour le moment.');
  const s = await stripe(env, 'POST', 'billing_portal/sessions', { customer: t.cus, return_url: env.APP_URL.replace(/\/+$/, '') + '/' });
  return { url: s.url };
}
async function connectStart(env, b) {
  const { tid, t } = await tenantByAuth(env, b);
  let acct = t.acct;
  if (!acct) {
    const a = await stripe(env, 'POST', 'accounts', { type: 'standard', email: t.email, business_profile: { name: t.name }, metadata: { tid } });
    acct = a.id; await rtdb(env, 'PUT', '_t/' + tid + '/acct', acct);
  }
  const k = String(b.k || '');
  if (/^[A-Za-z0-9_-]{6,60}$/.test(k)) { await rtdb(env, 'PUT', '_pk/' + k, tid); await rtdb(env, 'PUT', '_t/' + tid + '/pk', k); }
  const back = env.APP_URL.replace(/\/+$/, '') + '/';
  const l = await stripe(env, 'POST', 'account_links', { account: acct, type: 'account_onboarding', refresh_url: back + '?stripe=retour', return_url: back + '?stripe=ok' });
  return { url: l.url };
}
async function connectStatus(env, b) {
  const { t } = await tenantByAuth(env, b);
  if (!t.acct) return { on: false, details: false, bps: COMMISSION_BPS };
  const a = await stripe(env, 'GET', 'accounts/' + t.acct);
  return { on: !!a.charges_enabled, details: !!a.details_submitted, bps: COMMISSION_BPS };
}
export const fee = (amount, bps) => Math.min(amount, Math.max(0, Math.round((amount * (bps == null ? COMMISSION_BPS : bps)) / 10000)));
async function paySession(env, b) {
  const k = String(b.k || ''), code = String(b.code || '').slice(0, 40), amount = Math.round(+b.amount), label = String(b.label || 'Réservation').slice(0, 120);
  if (!/^[A-Za-z0-9_-]{6,60}$/.test(k) || !code || !(amount >= 50 && amount <= 500000)) throw new Err(400, 'Paiement impossible.');
  const sk = String(b.ok || ''), fk = String(b.ko || '');
  const urlOk = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && (origins(env).includes(x.origin)); } catch (e) { return false; } };
  if (!urlOk(sk) || !urlOk(fk)) throw new Err(400, 'Adresse de retour refusée.');
  const tid = await rtdb(env, 'GET', '_pk/' + k); if (!tid) throw new Err(404, 'Établissement introuvable.');
  const t = await rtdb(env, 'GET', '_t/' + tid); if (!t || !t.acct) throw new Err(409, 'Le paiement en ligne n’est pas activé.');
  const s = await stripe(env, 'POST', 'checkout/sessions', {
    mode: 'payment', client_reference_id: code,
    line_items: { 0: { quantity: 1, price_data: { currency: 'eur', unit_amount: amount, product_data: { name: label } } } },
    payment_intent_data: { application_fee_amount: fee(amount, env.COMMISSION_BPS ? +env.COMMISSION_BPS : COMMISSION_BPS), description: label + ' (' + code + ')' },
    metadata: { code, tid }, success_url: sk, cancel_url: fk
  }, t.acct);
  return { url: s.url };
}
async function webhook(env, req) {
  const raw = await req.text(), sig = req.headers.get('Stripe-Signature');
  let ok = false;
  for (const sec of [env.STRIPE_WHSEC, env.STRIPE_WHSEC_CONNECT]) if (sec && (await verifyStripe(raw, sig, sec, env.NOW))) ok = true;
  if (!ok) throw new Err(400, 'Signature invalide');
  const ev = JSON.parse(raw), o = ev.data && ev.data.object || {};
  if (ev.account) { /* événement d'un compte connecté : paiement d'une réservation */
    if (ev.type === 'checkout.session.completed' && o.mode === 'payment' && o.payment_status === 'paid' && o.metadata && o.metadata.tid && o.metadata.code) {
      const t = await rtdb(env, 'GET', '_t/' + o.metadata.tid);
      if (t && t.acct === ev.account) await rtdb(env, 'PUT', '_pay/c/' + t.r.slice(2) + '/' + o.metadata.code.replace(/[.$#\[\]\/]/g, '_'), { a: o.amount_total, at: Date.now(), s: o.id });
    }
    return { ok: true };
  }
  if (ev.type === 'checkout.session.completed' && o.mode === 'subscription' && o.metadata && o.metadata.tid) {
    const t = await rtdb(env, 'GET', '_t/' + o.metadata.tid);
    if (t && !t.cus && o.customer) { await rtdb(env, 'PUT', '_t/' + o.metadata.tid + '/cus', o.customer); await rtdb(env, 'PUT', '_c/' + o.customer, o.metadata.tid); }
    await syncEnt(env, o.metadata.tid);
  } else if (/^customer\.subscription\.(created|updated|deleted|paused|resumed)$/.test(ev.type) && o.customer) {
    const tid = await rtdb(env, 'GET', '_c/' + o.customer); if (tid) await syncEnt(env, tid);
  } else if (/^invoice\.(paid|payment_failed)$/.test(ev.type) && o.customer) {
    const tid = await rtdb(env, 'GET', '_c/' + o.customer); if (tid) await syncEnt(env, tid);
  }
  return { ok: true };
}

export default {
  async fetch(req, env) {
    const u = new URL(req.url), p = u.pathname.replace(/\/+$/, '');
    const open = p === '/v1/pay/session';
    const H = cors(req, env, open);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: H });
    try {
      if (p === '/v1/stripe/webhook' && req.method === 'POST') return json(await webhook(env, req), 200, H);
      if (req.method !== 'POST') return json({ ok: true, service: 'lago-cloud' }, 200, H);
      const b = await req.json().catch(() => ({}));
      if (p === '/v1/signup') return json(await signup(env, b, req), 200, H);
      if (p === '/v1/checkout') return json(await checkout(env, b), 200, H);
      if (p === '/v1/portal') return json(await portal(env, b), 200, H);
      if (p === '/v1/connect/start') return json(await connectStart(env, b), 200, H);
      if (p === '/v1/connect/status') return json(await connectStatus(env, b), 200, H);
      if (p === '/v1/pay/session') return json(await paySession(env, b), 200, H);
      throw new Err(404, 'Introuvable');
    } catch (e) {
      return json({ error: e instanceof Err ? e.message : 'Erreur du serveur' }, e instanceof Err ? e.status : 500, H);
    }
  }
};
