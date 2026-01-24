# ColAI - Production Ready

Коллаборативная платформа для работы нескольких нейросетей. Переработана для продакшена с использованием Vercel и Render.com.

## 🏗️ Архитектура

- **Фронтенд**: Next.js на Vercel
- **API**: Vercel Serverless Functions с балансировкой нагрузки
- **ИИ-серверы**: 16 Flask серверов на Render.com (4 сессии Ollama каждый)
- **База данных**: Vercel Postgres
- **Кэш**: Vercel KV (Redis)

## 📁 Структура проекта

```
izm/
├── ColAI-master/          # Оригинальный локальный код (не трогать)
├── vercel/                # Next.js приложение для Vercel
│   ├── pages/            # Страницы и API routes
│   ├── components/        # React компоненты
│   ├── lib/              # Сервисы (LoadBalancer, Cache, DB)
│   ├── styles/           # CSS модули
│   └── [конфигурация]    # next.config.js, package.json, etc.
├── render-server/         # Flask сервер для Render.com
└── docs/                  # Документация
```

## 🚀 Быстрый старт

### 1. Установка

```bash
cd vercel
npm install
```

### 2. Локальная разработка

```bash
# Создайте .env.local
cp .env.local.example .env.local

# Заполните:
# NEXT_PUBLIC_API_URL=http://localhost:3000/api
# OLLAMA_URL=http://localhost:11434

npm run dev
```

### 3. Деплой на Vercel

```bash
cd vercel
vercel login
vercel
```

**Важно**: В настройках Vercel укажите корневую папку `vercel/`

### 4. Настройка переменных окружения в Vercel

```
RENDER_SERVERS=https://server1.onrender.com,https://server2.onrender.com,...
DATABASE_URL=postgres://...
KV_REST_API_URL=https://...
KV_REST_API_TOKEN=...
API_SECRET=your-secret
RENDER_API_KEY=your-key
```

### 5. Создание Render серверов

Для каждого сервера (всего 16):

1. Создайте Web Service на Render.com
2. Укажите путь: `render-server/`
3. Переменные окружения:
   ```
   OLLAMA_URL=http://localhost:11434
   RENDER_API_KEY=your-key
   ```
4. Деплой автоматический

## 📚 Документация

Полная документация в папке `docs/README_PRODUCTION.md`

## 🔧 Основные компоненты

### Vercel API Routes

- `/api/ai/generate` - генерация ответов с балансировкой нагрузки
- `/api/health` - health check для мониторинга
- `/api/stats` - статистика использования

### Render серверы

- `GET /health` - проверка доступности
- `POST /generate` - обработка запросов к Ollama
- 4 параллельные сессии на каждом сервере

### Сервисы

- `LoadBalancer` - round-robin балансировка между серверами
- `CacheService` - кэширование через Vercel KV
- `DatabaseService` - работа с Vercel Postgres
- `RateLimiter` - ограничение запросов

## ⚙️ Конфигурация

Все настройки через переменные окружения. См. `vercel/.env.local.example`

## 🐛 Troubleshooting

1. Проверьте health check: `GET /api/health`
2. Проверьте логи в Vercel Dashboard
3. Убедитесь, что Ollama доступен на Render серверах
4. Проверьте все переменные окружения

## 📝 Важно

- Оригинальный код в `ColAI-master/` не изменяется
- Все новые файлы в `vercel/` и `render-server/`
- Начните с 1-2 серверов для тестирования
- Используйте сильные API ключи

---

**Готово к продакшену!** 🚀
