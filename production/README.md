# ColAI - Production (Vercel + Render)

Версия ColAI для продакшена: Next.js на Vercel, Flask‑серверы на Render.com.

**Эта папка содержит только production‑версию.** Локальная офлайн‑версия — в корне репозитория ([ColAI-master/](../ColAI-master/)).

## 📁 Структура

```
production/
├── vercel/           # Next.js для Vercel (фронт + API)
├── render-server/    # Flask‑серверы для Render.com
├── docs/             # Документация
└── README.md         # этот файл
```

## 🚀 Быстрый старт

### Vercel (фронт + API)

```bash
cd production/vercel
npm install
cp .env.local.example .env.local
npm run dev
```

В Vercel укажите **Root Directory**: `production/vercel`

### Render (ИИ‑серверы)

Для каждого сервера на Render укажите **Root Directory**: `production/render-server`

## 📚 Документация

Подробная настройка и деплой: [docs/README_PRODUCTION.md](docs/README_PRODUCTION.md)

## ⚙️ Переменные окружения

- **Vercel**: `RENDER_SERVERS`, `DATABASE_URL`, `KV_*`, `API_SECRET`, `RENDER_API_KEY`
- **Render**: `OLLAMA_URL`, `RENDER_API_KEY`

См. `vercel/.env.local.example` и `render-server/.env.example`.

---

**Production‑версия изолирована от основной офлайн‑версии ColAI.**
