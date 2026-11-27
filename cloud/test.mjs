import test from 'node:test';
import assert from 'node:assert/strict';
import w, { fee, form, verifyStripe, entFrom, OPTIONS, PACK } from './worker.js';

/* ---- faux Firebase + faux Stripe en mémoire ---- */
function mk() {
  const db = {}; const calls = []; const subs = {}; let n = 0;
  const get = (p) => p.split('/').filter(Boolean).reduce((o, k) => (o == null ? o : o[k]), db);
  const set = (p, v) => { const ks = p.split('/').filter(Boolean); let o = db; ks.slice(0, -1).forEach((k) => (o = o[k] = o[k] || {})); o[ks.at(-1)] = v; };
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url); const body = init.body;
    if (u.host === 'fb.test') {
      const path = decodeURIComponent(u.pathname.replace(/^\//, '').replace(/\.json$/, ''));
      if (init.method === 'GET') { const v = get(path); return new Response(JSON.stringify(v === undefined ? null : v), { status: 200 }); }
      set(path, JSON.parse(body)); return new Response('', { status: 200 });
    }
    if (u.host === 'api.stripe.com') {
      const path = u.pathname.replace('/v1/', ''); const params = Object.fromEntries(new URLSearchParams(body || u.search));
      calls.push({ path, params, acct: init.headers['Stripe-Account'], method: init.method, auth: init.headers.Authorization });
      if (path === 'customers') return new Response(JSON.stringify({ id: 'cus_' + ++n }), { status: 200 });
      if (path === 'checkout/sessions') return new Response(JSON.stringify({ id: 'cs_' + ++n, url: 'https://checkout.stripe.test/' + n }), { status: 200 });
      if (path === 'accounts') return new Response(JSON.stringify({ id: 'acct_1' }), { status: 200 });
      if (path === 'account_links') return new Response(JSON.stringify({ url: 'https://connect.stripe.test/onb' }), { status: 200 });
      if (path === 'accounts/acct_1') return new Response(JSON.stringify({ charges_enabled: true, details_submitted: true }), { status: 200 });
      if (path === 'billing_portal/sessions') return new Response(JSON.stringify({ url: 'https://portal.stripe.test' }), { status: 200 });
      if (path === 'subscriptions') return new Response(JSON.stringify({ data: subs[params.customer] || [] }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };
  return { db, calls, subs };
}
const ENV = { FB_URL: 'https://fb.test', FB_TOKEN: 'tok', STRIPE_KEY: 'sk_test_x', STRIPE_WHSEC: 'whsec_a', STRIPE_WHSEC_CONNECT: 'whsec_b', APP_URL: 'https://app.test/', WORKER_URL: 'https://w.test', ALLOW_ORIGINS: 'https://app.test,https://lago-caisse.fr' };
const call = (path, body, env = ENV, headers = {}) => w.fetch(new Request('https://w.test' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }), env);
const sign = async (raw, secret, t) => { const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); const s = [...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(t + '.' + raw)))].map((x) => x.toString(16).padStart(2, '0')).join(''); return `t=${t},v1=${s}`; };
const hook = async (ev, secret = 'whsec_a', env = ENV) => { const raw = JSON.stringify(ev), t = Math.floor(Date.now() / 1000); return w.fetch(new Request('https://w.test/v1/stripe/webhook', { method: 'POST', headers: { 'Stripe-Signature': await sign(raw, secret, t) }, body: raw }), env); };
const parseLink = (l) => JSON.parse(Buffer.from(l.split('#cloud=')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());

test('commission 2 % : arrondi et plafond', () => {
  assert.equal(fee(1000), 20); assert.equal(fee(24900), 498); assert.equal(fee(1850), 37); assert.equal(fee(125), 3); assert.equal(fee(10), 0 + Math.round(0.2)); assert.equal(fee(100, 20000), 100);
});
test('form : encodage imbriqué Stripe', () => {
  assert.equal(decodeURIComponent(form({ a: { 0: { b: 1 } }, c: 'x y' })), 'a[0][b]=1&c=x y');
});
test('signature du webhook : valide, fausse, périmée', async () => {
  const raw = '{"a":1}', t = Math.floor(Date.now() / 1000);
  assert.equal(await verifyStripe(raw, await sign(raw, 's', t), 's'), true);
  assert.equal(await verifyStripe(raw, await sign(raw, 'autre', t), 's'), false);
  assert.equal(await verifyStripe(raw + ' ', await sign(raw, 's', t), 's'), false);
  assert.equal(await verifyStripe(raw, await sign(raw, 's', t - 4000), 's'), false);
  assert.equal(await verifyStripe(raw, '', 's'), false);
});
test('inscription : crée l’espace, le lien contient la config attendue par l’appli', async () => {
  const m = mk();
  const r = await call('/v1/signup', { name: 'Salon Hélène', tpl: 'coiffeur', email: 'Helene@Exemple.fr' });
  assert.equal(r.status, 200);
  const { link } = await r.json(); const c = parseLink(link);
  assert.equal(c.u, 'https://fb.test'); assert.match(c.r, /^c\/[a-z2-9]{22}$/); assert.equal(c.b, 1); assert.equal(c.t, 'coiffeur'); assert.equal(c.n, 'Salon Hélène'); assert.equal(c.m, 1); assert.equal(c.w, 'https://w.test'); assert.ok(c.o.length === 24);
  assert.ok(link.startsWith('https://app.test/#cloud='));
  const tid = m.db._r[c.r.slice(2)]; const t = m.db._t[tid];
  assert.equal(t.email, 'helene@exemple.fr'); assert.notEqual(t.oh, c.o); assert.equal(t.oh.length, 64); assert.ok(!JSON.stringify(m.db).includes(c.o));
  assert.ok(m.db._ent.c[c.r.slice(2)]);
});
test('inscription : refuse métier inconnu, e-mail invalide, champ piège', async () => {
  mk();
  for (const b of [{ name: 'X', tpl: 'coiffeur', email: 'a@b.fr' }, { name: 'Salon', tpl: 'pirate', email: 'a@b.fr' }, { name: 'Salon', tpl: 'coiffeur', email: 'nope' }, { name: 'Salon', tpl: 'coiffeur', email: 'a@b.fr', hp: 'bot' }]) assert.equal((await call('/v1/signup', b)).status, 400);
});
test('inscription : limite par adresse IP', async () => {
  mk(); const store = {}; const RL = { get: async (k) => store[k], put: async (k, v) => { store[k] = v; } };
  const env = { ...ENV, RL }; let last;
  for (let i = 0; i < 6; i++) last = await call('/v1/signup', { name: 'Salon ' + i, tpl: 'coiffeur', email: 'a@b.fr' }, env, { 'CF-Connecting-IP': '1.2.3.4' });
  assert.equal(last.status, 429);
});
async function newTenant() { const r = await call('/v1/signup', { name: 'Bowl Test', tpl: 'bowling', email: 'b@t.fr' }); return parseLink((await r.json()).link); }
test('achat d’option : refuse sans jeton propriétaire, accepte avec', async () => {
  const m = mk(); const c = await newTenant();
  assert.equal((await call('/v1/checkout', { r: c.r, o: 'faux', opt: 'cast' })).status, 401);
  assert.equal((await call('/v1/checkout', { r: c.r, opt: 'cast' })).status, 401);
  assert.equal((await call('/v1/checkout', { r: 'c/' + 'a'.repeat(22), o: c.o, opt: 'cast' })).status, 401);
  assert.equal((await call('/v1/checkout', { r: c.r, o: c.o, opt: 'inconnue' })).status, 400);
  const r = await call('/v1/checkout', { r: c.r, o: c.o, opt: 'cast' }); assert.equal(r.status, 200);
  const s = m.calls.find((x) => x.path === 'checkout/sessions');
  assert.equal(s.params['line_items[0][price_data][unit_amount]'], String(OPTIONS.cast)); assert.equal(s.params.mode, 'subscription'); assert.equal(s.params['subscription_data[metadata][opt]'], 'cast');
  assert.equal(s.params['line_items[0][price_data][recurring][interval]'], 'month'); assert.equal(s.auth, 'Bearer sk_test_x');
});
test('paiement réussi puis résiliation : l’option s’active puis se désactive toute seule', async () => {
  const m = mk(); const c = await newTenant(); const rr = c.r.slice(2);
  await call('/v1/checkout', { r: c.r, o: c.o, opt: 'cast' });
  const tid = m.db._r[rr], cus = m.db._t[tid].cus; assert.ok(cus);
  m.subs[cus] = [{ status: 'active', metadata: { tid, opt: 'cast' } }];
  assert.equal((await hook({ type: 'checkout.session.completed', data: { object: { mode: 'subscription', customer: cus, metadata: { tid, opt: 'cast' } } } })).status, 200);
  assert.equal(m.db._ent.c[rr].cast, 1); assert.equal(m.db._ent.c[rr].qr, undefined);
  m.subs[cus] = [{ status: 'canceled', metadata: { tid, opt: 'cast' } }];
  await hook({ type: 'customer.subscription.deleted', data: { object: { customer: cus } } });
  assert.equal(m.db._ent.c[rr].cast, undefined);
});
test('pack : active toutes les options ; impayé = délai de grâce, puis coupé', async () => {
  const m = mk(); const c = await newTenant(); const rr = c.r.slice(2);
  await call('/v1/checkout', { r: c.r, o: c.o, opt: 'pack' }); const tid = m.db._r[rr], cus = m.db._t[tid].cus;
  assert.equal(m.calls.find((x) => x.path === 'checkout/sessions').params['line_items[0][price_data][unit_amount]'], String(PACK.price));
  m.subs[cus] = [{ status: 'active', metadata: { tid, opt: 'pack' } }];
  await hook({ type: 'customer.subscription.created', data: { object: { customer: cus } } });
  for (const k of Object.keys(OPTIONS)) assert.equal(m.db._ent.c[rr][k], 1, k);
  m.subs[cus][0].status = 'past_due'; await hook({ type: 'invoice.payment_failed', data: { object: { customer: cus } } }); assert.equal(m.db._ent.c[rr].cast, 1);
  m.subs[cus][0].status = 'unpaid'; await hook({ type: 'customer.subscription.updated', data: { object: { customer: cus } } }); assert.equal(m.db._ent.c[rr].cast, undefined);
});
test('webhook : signature fausse refusée, rien n’est modifié', async () => {
  const m = mk(); const c = await newTenant(); const rr = c.r.slice(2); const tid = m.db._r[rr];
  const before = JSON.stringify(m.db);
  const raw = JSON.stringify({ type: 'checkout.session.completed', data: { object: { mode: 'subscription', customer: 'cus_x', metadata: { tid, opt: 'pack' } } } });
  const r = await w.fetch(new Request('https://w.test/v1/stripe/webhook', { method: 'POST', headers: { 'Stripe-Signature': 't=1,v1=00' }, body: raw }), ENV);
  assert.equal(r.status, 400); assert.equal(JSON.stringify(m.db), before);
});
test('paiement d’une réservation : commission de 2 % sur le compte du client', async () => {
  const m = mk(); const c = await newTenant();
  assert.equal((await call('/v1/connect/start', { r: c.r, o: 'faux' })).status, 401);
  const s = await call('/v1/connect/start', { r: c.r, o: c.o, k: 'pubkey123' }); assert.equal((await s.json()).url, 'https://connect.stripe.test/onb');
  assert.equal((await (await call('/v1/connect/status', { r: c.r, o: c.o })).json()).on, true);
  const open = await call('/v1/pay/session', { k: 'pubkey123', code: 'RES-0042', amount: 24900, label: 'Anniversaire', ok: 'https://app.test/merci', ko: 'https://app.test/annule' }, ENV, { Origin: 'https://exemple.fr' });
  assert.equal(open.status, 200); assert.equal(open.headers.get('Access-Control-Allow-Origin'), '*');
  const x = m.calls.filter((q) => q.path === 'checkout/sessions').at(-1);
  assert.equal(x.acct, 'acct_1'); assert.equal(x.params['payment_intent_data[application_fee_amount]'], '498'); assert.equal(x.params['line_items[0][price_data][unit_amount]'], '24900'); assert.equal(x.params.mode, 'payment');
  /* adresses de retour non autorisées, montants absurdes, clé inconnue */
  assert.equal((await call('/v1/pay/session', { k: 'pubkey123', code: 'R', amount: 1000, ok: 'https://evil.test/', ko: 'https://app.test/a' })).status, 400);
  assert.equal((await call('/v1/pay/session', { k: 'pubkey123', code: 'R', amount: 5, ok: 'https://app.test/a', ko: 'https://app.test/a' })).status, 400);
  assert.equal((await call('/v1/pay/session', { k: 'inconnue99', code: 'R', amount: 1000, ok: 'https://app.test/a', ko: 'https://app.test/a' })).status, 404);
});
test('paiement confirmé par Stripe : écrit dans _pay, uniquement si le compte correspond', async () => {
  const m = mk(); const c = await newTenant(); const rr = c.r.slice(2); const tid = m.db._r[rr];
  await call('/v1/connect/start', { r: c.r, o: c.o, k: 'pubkey123' });
  const ev = (acct) => ({ type: 'checkout.session.completed', account: acct, data: { object: { id: 'cs_9', mode: 'payment', payment_status: 'paid', amount_total: 24900, metadata: { tid, code: 'RES-0042' } } } });
  await hook(ev('acct_autre'), 'whsec_b'); assert.equal(m.db._pay, undefined);
  await hook(ev('acct_1'), 'whsec_b'); assert.equal(m.db._pay.c[rr]['RES-0042'].a, 24900);
});
test('CORS : l’inscription est réservée aux sites Lago', async () => {
  mk();
  const ok = await call('/v1/signup', { name: 'Salon', tpl: 'coiffeur', email: 'a@b.fr' }, ENV, { Origin: 'https://lago-caisse.fr' }); assert.equal(ok.headers.get('Access-Control-Allow-Origin'), 'https://lago-caisse.fr');
  const bad = await call('/v1/signup', { name: 'Salon', tpl: 'coiffeur', email: 'a@b.fr' }, ENV, { Origin: 'https://evil.test' }); assert.equal(bad.headers.get('Access-Control-Allow-Origin'), null);
});
test('entFrom ignore les abonnements résiliés', () => { assert.deepEqual(entFrom([{ status: 'canceled', metadata: { opt: 'qr' } }, { status: 'trialing', metadata: { opt: 'ia' } }]), { ia: 1 }); });
test('compte de service Firebase : jeton signé RS256 vérifiable', async () => {
  const { generateKeyPairSync, createVerify } = await import('node:crypto');
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const sa = { client_email: 'x@y.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
  let verified = false, getTok = 0;
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).startsWith('https://oauth2.googleapis.com/token')) {
      getTok++; const a = new URLSearchParams(init.body).get('assertion'); const [h, p, s] = a.split('.');
      const v = createVerify('RSA-SHA256'); v.update(h + '.' + p); verified = v.verify(publicKey, Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
      const claims = JSON.parse(Buffer.from(p, 'base64url')); assert.equal(claims.iss, sa.client_email); assert.match(claims.scope, /firebase\.database/);
      return new Response(JSON.stringify({ access_token: 'T1', expires_in: 3600 }), { status: 200 });
    }
    assert.match(String(url), /access_token=T1/); return new Response('null', { status: 200 });
  };
  const env = { ...ENV, FB_TOKEN: undefined, FB_SA: JSON.stringify(sa) };
  await w.fetch(new Request('https://w.test/v1/pay/session', { method: 'POST', body: JSON.stringify({ k: 'abcdef12', code: 'R', amount: 1000, ok: 'https://app.test/a', ko: 'https://app.test/a' }) }), env);
  await w.fetch(new Request('https://w.test/v1/pay/session', { method: 'POST', body: JSON.stringify({ k: 'abcdef12', code: 'R', amount: 1000, ok: 'https://app.test/a', ko: 'https://app.test/a' }) }), env);
  assert.equal(verified, true); assert.equal(getTok, 1);
});
