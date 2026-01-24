# ColAI — Production (Vercel + Render)

Фронт и API на **Vercel**; инференс — **Render** (Ollama из репо `ollama-server`).

Офлайн-версия: [ColAI-master/](../ColAI-master/).

## Поток запросов

```
Пользователь → Vercel (Next.js + /api/ai/generate) → Render (Ollama) → ответ обратно
```

- **Vercel**: приём запросов, round‑robin по `RENDER_SERVERS`, вызов Ollama `/api/chat` на Render, возврат ответа.
- **Render**: только инстансы Ollama (репо `ollama-server`, Docker). При старте — установка Ollama, загрузка модели.

## Структура

```
production/
├── colai-production/  # ВСЯ логика ColAI (UI, модули, коллаборация, мафия)
│                     # Вызовы идут через Vercel API вместо localhost:11434
├── vercel/           # Next.js: API Routes (Vercel)
├── docs/             # Документация
└── README.md
```

**colai-production/** — полная копия ColAI-master со всеми фичами, но вызовы Ollama идут через Vercel API → Render.

`render-server` удалён: один тип сервера на Render — Ollama из `ollama-server`.

## Быстрый старт

### 1. Vercel (этот репо)

```bash
cd production/vercel
npm install
cp .env.local.example .env.local
# В .env.local задать RENDER_SERVERS (URL Ollama на Render)
npm run dev
```

В Vercel: **Root Directory** = `production/vercel`, **Environment Variables**: `RENDER_SERVERS` (через запятую).

### 2. Render (репо ollama-server)

Отдельный репо с Dockerfile и .sh: установка Ollama + модели. Деплой на Render как **Docker** Web Service. URL инстансов — в `RENDER_SERVERS` в Vercel.

Подробности: [docs/README_PRODUCTION.md](docs/README_PRODUCTION.md).

**Мастер-промпт** для переписывания репо ollama-server под Render (отдай другой нейросети): [docs/MASTER_PROMPT_OLLAMA_SERVER.md](docs/MASTER_PROMPT_OLLAMA_SERVER.md).

## Использование

### Вариант 1: colai-production (полный UI, все фичи)

Открой `colai-production/index.html` в браузере или через локальный сервер. Всё работает как раньше, но запросы идут через Vercel API.

**Локально:**
```bash
cd production/colai-production
python -m http.server 8000
# В консоли браузера: window.API_URL = 'http://localhost:3000/api'
```

**На Vercel:** загрузи `colai-production/` как статику, в `index.html` оставь `window.API_URL = '/api'`.

### Вариант 2: только API (для интеграции)

Используй только `vercel/` API Routes для интеграции в другие приложения.

## API Endpoints

- `POST /api/ai/generate` — тело: `{ "prompt": "...", "model?", "temperature?", "maxTokens?" }` или `{ "messages": [...] }`. Ответ: `{ "response": "...", "model": "..." }`.
- `GET /api/health` — проверка доступности Render‑серверов (Ollama `/api/tags`).
- `GET /api/models` — список моделей (для совместимости с ollamaManager).

## Переменные окружения (Vercel)

| Переменная | Описание |
|------------|----------|
| `RENDER_SERVERS` | URL инстансов Ollama на Render через запятую, напр. `https://colai-ollama-1.onrender.com` |
| `NEXT_PUBLIC_API_URL` | Опционально, по умолчанию `/api` |
