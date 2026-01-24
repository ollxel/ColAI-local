# Production: Vercel + Render (Ollama)

## Архитектура

- **Vercel**: Next.js, страницы + API Routes. Принимает запросы, дергает Ollama на Render, отдаёт ответы.
- **Render**: только **один тип** сервиса — **Ollama** (репо `ollama-server`, Docker). Много инстансов, round‑robin с Vercel.

Нет Flask, отдельного «API‑сервера» на Render и т.п. — только Ollama.

## 1. Настройка Vercel

1. Подключить репо **colai**.
2. **Root Directory**: `production/vercel`.
3. **Framework**: Next.js.
4. **Environment Variables**:
   - `RENDER_SERVERS` — URL Ollama на Render через запятую, например:
     ```
     RENDER_SERVERS=https://colai-ollama-1.onrender.com,https://colai-ollama-2.onrender.com
     ```
   - `NEXT_PUBLIC_API_URL` — по желанию (по умолчанию `/api`).

Postgres, KV и т.д. не требуются для базового сценария.

## 2. Настройка Render (ollama-server)

Отдельный репозиторий **ollama-server** с:

- Dockerfile;
- .sh-скриптами: установка Ollama, скачивание модели.

На Render для каждого инстанса:

- **Type**: Docker.
- **Repo**: `ollama-server`.
- **Root Directory**: по структуре репо (если нужно).

Сервис при старте устанавливает Ollama, качает модель, поднимает Ollama. Его URL (например `https://xxx.onrender.com`) добавляются в `RENDER_SERVERS` в Vercel.

Подробная пошаговая инструкция для переписывания репо `ollama-server` под Render — в [MASTER_PROMPT_OLLAMA_SERVER.md](MASTER_PROMPT_OLLAMA_SERVER.md).

## 3. Локальная разработка

```bash
cd production/vercel
npm install
cp .env.local.example .env.local
```

В `.env.local`:

- `NEXT_PUBLIC_API_URL=http://localhost:3000/api`
- `RENDER_SERVERS=https://your-ollama.onrender.com` (или тестовый Ollama).

```bash
npm run dev
```

## 4. Проверка

- Health: `GET https://your-app.vercel.app/api/health`
- Генерация: `POST https://your-app.vercel.app/api/ai/generate` с телом `{ "prompt": "Hello" }`

## 5. Чеклист

- [ ] Репо `ollama-server` подготовлен под Render (Docker, Ollama, модель).
- [ ] На Render созданы Ollama‑инстансы, известны их URL.
- [ ] В Vercel задано `RENDER_SERVERS`.
- [ ] Health и generate отвечают без ошибок.
