/**
 * POST /api/ai/generate
 * Принимает запрос, выбирает Render-сервер (Ollama), дергает /api/chat, возвращает ответ.
 */
import { LoadBalancer } from '../../../../lib/loadBalancer';

const TIMEOUT_MS = 120_000;
const MAX_PROMPT_LEN = 32_000;

function getBody(req) {
  try {
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const lb = new LoadBalancer(process.env.RENDER_SERVERS);
  const servers = lb.getAll();
  if (servers.length === 0) {
    return res.status(503).json({
      error: 'No Render servers configured',
      hint: 'Set RENDER_SERVERS (comma-separated Ollama URLs on Render)',
    });
  }

  const body = getBody(req);
  if (!body) {
    return res.status(400).json({ error: 'JSON body required' });
  }

  const {
    prompt,
    messages: rawMessages,
    model = 'qwen2.5:14b',
    temperature = 0.7,
    maxTokens = 2048,
    topP = 1.0,
  } = body;

  let messages;
  if (Array.isArray(rawMessages) && rawMessages.length > 0) {
    messages = rawMessages;
  } else if (typeof prompt === 'string' && prompt.length > 0) {
    messages = [{ role: 'user', content: prompt }];
  } else {
    return res.status(400).json({ error: 'Provide "prompt" or "messages"' });
  }

  const promptLen = JSON.stringify(messages).length;
  if (promptLen > MAX_PROMPT_LEN) {
    return res.status(400).json({
      error: `Prompt too long (${promptLen} chars, max ${MAX_PROMPT_LEN})`,
    });
  }

  const payload = {
    model,
    messages,
    stream: false,
    options: {
      temperature: Math.max(0, Math.min(2, Number(temperature) || 0.7)),
      num_predict: Math.max(1, Math.min(8192, Number(maxTokens) || 2048)),
      top_p: Math.max(0, Math.min(1, Number(topP) || 1)),
    },
  };

  let lastError = null;
  const tried = [];

  for (let i = 0; i < servers.length; i++) {
    const base = lb.getNext();
    if (!base) break;
    const url = base.replace(/\/$/, '') + '/api/chat';
    tried.push(url);

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(t);

      if (!r.ok) {
        const text = await r.text();
        lastError = new Error(`Ollama ${r.status}: ${text.slice(0, 200)}`);
        continue;
      }

      const data = await r.json();
      if (!data?.message?.content) {
        lastError = new Error('Invalid Ollama response: no message.content');
        continue;
      }

      return res.status(200).json({
        response: data.message.content,
        model: data.model || model,
      });
    } catch (e) {
      clearTimeout(t);
      lastError = e;
    }
  }

  return res.status(503).json({
    error: 'All Render servers failed',
    tried: tried.length,
    lastError: lastError?.message || 'Unknown',
  });
}
