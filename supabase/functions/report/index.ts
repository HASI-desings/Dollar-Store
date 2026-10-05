// Sends the weekly/monthly/yearly report. Secrets live only in Edge Function secrets:
// RESEND_API_KEY, REPORT_FROM, CRON_SECRET (SUPABASE_URL and the service key are injected by Supabase).
const U = Deno.env.get('SUPABASE_URL')!, K = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const R = Deno.env.get('RESEND_API_KEY')!, FROM = Deno.env.get('REPORT_FROM')!, CRON = Deno.env.get('CRON_SECRET')!;
const C = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info' };
const PERIODS = ['weekly', 'monthly', 'yearly'];
const db = (p: string, i: RequestInit = {}) => fetch(`${U}/rest/v1/${p}`, { ...i, headers: { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', ...(i.headers || {}) } });
const rs = (n: number) => 'Rs ' + n.toLocaleString('en-US');

async function sendOne(owner: string, period: string, to: string[]) {
  const s = (await (await db(`report_summary?owner_id=eq.${owner}&select=summary,updated_at`)).json())[0];
  let status = 'failed', detail = 'No backup summary yet. Make a cloud backup first.';
  if (s) {
    const p = s.summary[period] ?? { sales: 0, refunds: 0, expenses: 0 };
    const text = `Dollar Store ${period} report\nSales: ${rs(p.sales)}\nRefunds: ${rs(p.refunds)}\nExpenses: ${rs(p.expenses)}\nNet: ${rs(p.sales - p.refunds - p.expenses)}\n\nData freshness: as of the last cloud backup, ${s.updated_at}.`;
    for (let i = 0; i < 3 && status !== 'sent'; i++) {
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${R}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: FROM, to, subject: `Dollar Store ${period} report`, text }) });
      if (r.ok) { status = 'sent'; detail = ''; } else detail = `Email service error ${r.status}`;
    }
  }
  await db('report_log', { method: 'POST', body: JSON.stringify({ owner_id: owner, period, status, detail }) });
  return status;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: C });
  const b = await req.json().catch(() => ({}));
  const secret = req.headers.get('x-cron-secret');
  if (secret) {
    if (!CRON || secret !== CRON || !PERIODS.includes(b.period)) return new Response('forbidden', { status: 403, headers: C });
    const rows = await (await db(`report_settings?${b.period}=eq.true&select=owner_id,recipients`)).json();
    for (const r of rows) if (r.recipients.length) await sendOne(r.owner_id, b.period, r.recipients);
    return new Response('ok', { headers: C });
  }
  const u = await fetch(`${U}/auth/v1/user`, { headers: { apikey: K, Authorization: req.headers.get('Authorization') ?? '' } });
  if (!u.ok) return new Response('unauthorized', { status: 401, headers: C });
  const owner = (await u.json()).id;
  const st = (await (await db(`report_settings?owner_id=eq.${owner}&select=recipients`)).json())[0];
  if (!st || !st.recipients.length) return new Response('no recipients', { status: 400, headers: C });
  return new Response(await sendOne(owner, 'weekly', st.recipients), { headers: C });
});
