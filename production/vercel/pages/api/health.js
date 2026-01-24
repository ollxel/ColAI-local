/**
 * GET /api/health
 * Проверяет доступность Render-серверов (Ollama /api/tags).
 */
import { LoadBalancer } from '../../../lib/loadBalancer';

const CHECK_TIMEOUT_MS = 8000;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const lb = new LoadBalancer(process.env.RENDER_SERVERS);
  const servers = lb.getAll();

  if (servers.length === 0) {
    return res.status(200).json({
      ok: true,
      servers: [],
      message: 'RENDER_SERVERS not set',
    });
  }

  const results = await Promise.allSettled(
    servers.map(async (base) => {
      const url = base.replace(/\/$/, '') + '/api/tags';
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), CHECK_TIMEOUT_MS);
      try {
        const r = await fetch(url, { method: 'GET', signal: ctrl.signal });
        clearTimeout(t);
        return { url: base, ok: r.ok, status: r.status };
      } catch (e) {
        clearTimeout(t);
        return { url: base, ok: false, error: e.message };
      }
    })
  );

  const checks = results.map((p, i) =>
    p.status === 'fulfilled' ? p.value : { url: servers[i], ok: false, error: p.reason?.message }
  );
  const healthy = checks.filter((c) => c.ok).length;

  return res.status(200).json({
    ok: healthy > 0,
    servers: checks,
    healthy,
    total: servers.length,
  });
}
