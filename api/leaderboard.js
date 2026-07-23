// api/leaderboard.js — Vercel serverless function
// Env vars required (Vercel project settings):
//   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
// Storage: one Redis string key holding the sorted JSON list.

const KEY = 'normie-hopper:leaderboard';

async function redis(...cmd) {
  const res = await fetch(
    `${process.env.UPSTASH_REDIS_REST_URL}/${cmd.map(encodeURIComponent).join('/')}`,
    { headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` } }
  );
  const data = await res.json();
  return data.result;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'GET') {
    const raw = await redis('GET', KEY);
    return res.status(200).json(raw ? JSON.parse(raw) : []);
  }

  if (req.method === 'POST') {
    const b = req.body || {};
    // strict validation — this endpoint is public
    const id = String(b.id || '').slice(0, 24);
    const n = String(b.n || 'ANON').replace(/[<>&"]/g, '').toUpperCase().slice(0, 12);
    const s = Math.max(0, Math.min(99999999, parseInt(b.s, 10) || 0));
    const l = Math.max(1, Math.min(10000, parseInt(b.l, 10) || 1));
    if (!id) return res.status(400).json({ error: 'missing run id' });

    const raw = await redis('GET', KEY);
    let list = raw ? JSON.parse(raw) : [];
    const prev = list.find(e => e.id === id);
    // a run's score only ever grows — reject regressions (basic anti-tamper)
    if (prev && s < prev.s) return res.status(200).json({ ok: true, kept: prev.s });
    list = list.filter(e => e.id !== id);
    list.push({ id, n, s, l, t: Date.now() });
    list.sort((a, b2) => b2.s - a.s);
    list = list.slice(0, 50);
    await redis('SET', KEY, JSON.stringify(list));
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'method not allowed' });
}
