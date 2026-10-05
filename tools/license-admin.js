const $ = id => document.getElementById(id), enc = new TextEncoder(), alg = { name: 'ECDSA', namedCurve: 'P-256' };
const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
$('gen').onclick = async () => {
  const k = await crypto.subtle.generateKey(alg, true, ['sign', 'verify']);
  $('pub').value = JSON.stringify(await crypto.subtle.exportKey('jwk', k.publicKey));
  $('priv').value = JSON.stringify(await crypto.subtle.exportKey('jwk', k.privateKey));
};
$('sign').onclick = async () => {
  const key = await crypto.subtle.importKey('jwk', JSON.parse($('priv').value), alg, false, ['sign']);
  const p = b64u(enc.encode(JSON.stringify({ shop: $('shop').value, exp: $('exp').value || null })));
  $('out').value = p + '.' + b64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(p)));
};
