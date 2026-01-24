/**
 * GET /api/models
 * Возвращает список моделей (для совместимости с ollamaManager.getAvailableModels)
 */
import { LoadBalancer } from '../../../lib/loadBalancer';

const CHECK_TIMEOUT_MS = 5000;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const lb = new LoadBalancer(process.env.RENDER_SERVERS);
  const servers = lb.getAll();

  if (servers.length === 0) {
    // Возвращаем дефолтный список
    return res.status(200).json({
      models: ['qwen2.5:14b', 'qwen2.5:7b', 'llama3.2:3b', 'deepseek-r1', 'mistral:7b']
    });
  }

  // Пробуем получить список моделей с первого доступного сервера
  for (const base of servers) {
    const url = base.replace(/\/$/, '') + '/api/tags';
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
    
    try {
      const r = await fetch(url, { method: 'GET', signal: controller.signal });
      clearTimeout(t);
      
      if (r.ok) {
        const data = await r.json();
        const models = data.models ? data.models.map(m => m.name || m) : [];
        if (models.length > 0) {
          return res.status(200).json({ models });
        }
      }
    } catch (e) {
      clearTimeout(t);
      continue;
    }
  }

  // Fallback: дефолтный список
  return res.status(200).json({
    models: ['qwen2.5:14b', 'qwen2.5:7b', 'llama3.2:3b', 'deepseek-r1', 'mistral:7b']
  });
}
