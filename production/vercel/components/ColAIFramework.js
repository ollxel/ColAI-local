import { useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || '/api';

export default function ColAIFramework() {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setError('');
    setResponse('');
    setLoading(true);
    try {
      const r = await fetch(`${API}/ai/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          model: 'qwen2.5:14b',
          temperature: 0.7,
          maxTokens: 2048,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data?.error || data?.message || `HTTP ${r.status}`);
        return;
      }
      setResponse(data.response || '');
    } catch (e) {
      setError(e?.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: '1.75rem', marginBottom: 8 }}>ColAI</h1>
      <p style={{ color: '#a1a1aa', marginBottom: 24 }}>
        Запросы идут через Vercel → Render (Ollama). Введите промпт и нажмите «Отправить».
      </p>

      <form onSubmit={handleSubmit} style={{ marginBottom: 24 }}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Введите промпт..."
          rows={4}
          disabled={loading}
          style={{
            width: '100%',
            padding: 12,
            borderRadius: 8,
            border: '1px solid #27272a',
            background: '#18181b',
            color: '#e4e4e7',
            resize: 'vertical',
            marginBottom: 12,
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '10px 20px',
            borderRadius: 8,
            background: loading ? '#3f3f46' : '#6366f1',
            color: '#fff',
            fontWeight: 500,
          }}
        >
          {loading ? 'Отправка…' : 'Отправить'}
        </button>
      </form>

      {error && (
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            background: 'rgba(239,68,68,0.15)',
            color: '#fca5a5',
            marginBottom: 24,
          }}
        >
          {error}
        </div>
      )}

      {response && (
        <div
          style={{
            padding: 16,
            borderRadius: 8,
            border: '1px solid #27272a',
            background: '#18181b',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          <strong style={{ color: '#a1a1aa', display: 'block', marginBottom: 8 }}>
            Ответ:
          </strong>
          {response}
        </div>
      )}
    </div>
  );
}
