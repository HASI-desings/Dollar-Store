// Signs a short "lease" that says which plan a device is on. The app checks the signature with the PUBLIC key, so editing
// the saved plan on the device breaks the signature.
// The signing key pair is created automatically the first time this runs and is kept in public.lease_keys, which only the
// service role (this function) can read. The private key is never sent to the app.
// Deploy with JWT verification OFF: the device proves itself with its own secret token, checked by shop_state below.
const U = Deno.env.get('SUPABASE_URL')!, K = Deno.env.get('SUPABASE_ANON_KEY')!, S = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const C = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Content-Type': 'application/json' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = 864e5;
const b64u = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const out = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: C });
const sr = (p: string, i: RequestInit = {}) => fetch(`${U}/rest/v1/${p}`, { ...i, headers: { apikey: S, Authorization: `Bearer ${S}`, 'Content-Type': 'application/json', ...(i.headers || {}) } });

let cached: { pub: JsonWebKey; priv: JsonWebKey } | null = null;
async function keys() {
  if (cached) return cached;
  const read = async () => await (await sr('lease_keys?id=eq.1&select=public_jwk,private_jwk')).json();
  let rows = await read();
  if (!rows.length) {
    const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    // If two first requests race, only one row can exist (id = 1); the other insert is ignored and both read the same pair.
    await sr('lease_keys?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' },
      body: JSON.stringify({ id: 1, public_jwk: await crypto.subtle.exportKey('jwk', k.publicKey), private_jwk: await crypto.subtle.exportKey('jwk', k.privateKey) }) });
    rows = await read();
  }
  cached = { pub: rows[0].public_jwk, priv: rows[0].private_jwk };
  return cached;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: C });
  const b = await req.json().catch(() => ({}));
  try {
    const k = await keys();
    if (b.action === 'public_key') return out({ public_jwk: k.pub });
    if (!UUID.test(String(b.p_device)) || typeof b.p_token !== 'string' || b.p_token.length < 32) return out({ message: 'Bad request.' }, 400);
    const r = await fetch(`${U}/rest/v1/rpc/shop_state`, { method: 'POST', headers: { apikey: K, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_device: b.p_device, p_token: b.p_token }) });
    const info = await r.json();
    if (!r.ok) return out(info, r.status);
    const valid = info.plan === 'trial' ? info.trial_ends_at : info.plan === 'subscription' ? info.paid_until : null;
    let exp = Date.now() + (info.plan === 'permanent' ? 30 : 7) * DAY;
    if (valid) exp = Math.min(exp, Date.parse(valid));
    const payload = b64u(new TextEncoder().encode(JSON.stringify({ v: 1, device: b.p_device, shop_id: info.shop_id, plan: info.plan, state: info.state, valid_until: valid, issued_at: Date.now(), expires_at: exp })));
    const key = await crypto.subtle.importKey('jwk', k.priv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const sig = b64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(payload)));
    return out({ payload, sig, info });
  } catch (_e) {
    return out({ message: 'Could not check your plan.' }, 500);
  }
});
