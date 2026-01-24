# ColAI Production — версия через Vercel API

**Это production-версия ColAI** со **всей** функциональностью из ColAI-master:
- Коллаборативный режим (8 нейросетей общаются между собой)
- Режим Мафии
- Все настройки, файлы, локализация

**Единственное отличие**: вместо прямых вызовов `localhost:11434` (локальный Ollama), все запросы идут через **Vercel API** → **Render (Ollama)**.

## Как это работает

1. Весь UI и логика — **без изменений** из ColAI-master
2. `ollamaManager.js` адаптирован: вместо `http://localhost:11434/api/chat` вызывает `/api/ai/generate` (Vercel API)
3. Vercel API проксирует запросы на Render (Ollama инстансы)
4. Ответы возвращаются обратно через тот же путь

## Запуск

### Локально (с Vercel dev server)

1. Запусти Vercel API локально:
   ```bash
   cd ../vercel
   npm install
   cp .env.local.example .env.local
   # В .env.local задай RENDER_SERVERS (URL Ollama на Render)
   npm run dev
   ```

2. Открой `colai-production/index.html` в браузере или через локальный сервер:
   ```bash
   cd colai-production
   python -m http.server 8000
   ```

3. В `index.html` (или через консоль браузера) задай:
   ```javascript
   window.API_URL = 'http://localhost:3000/api';
   ```

### На Vercel (продакшен)

1. Деплой `production/vercel` на Vercel (Root Directory = `production/vercel`)
2. Задай `RENDER_SERVERS` в Environment Variables
3. Загрузи `colai-production/` как статические файлы на Vercel или хости статики
4. В `index.html` оставь `window.API_URL = '/api'` (относительный путь)

## Структура

```
production/
├── colai-production/    # ВСЯ логика ColAI (UI, модули, всё)
│   ├── index.html       # Главная страница
│   ├── app.js           # Инициализация
│   ├── modules/         # Все модули (framework, networkManager, mafiaMode...)
│   └── ...
└── vercel/              # Vercel API (Next.js)
    ├── pages/api/       # API routes
    └── lib/             # LoadBalancer
```

## Что изменено

- **`modules/ollamaManager.js`**:
  - `baseUrl = 'http://localhost:11434'` → `apiUrl = '/api'` (Vercel API)
  - `fetch('/api/chat')` → `fetch('/api/ai/generate')`
  - `checkConnection()` → проверяет `/api/health`
  - `getAvailableModels()` → вызывает `/api/models`

- **`index.html`**: добавлен скрипт для настройки `window.API_URL`

- **Всё остальное**: без изменений (framework, networkManager, mafiaMode, UI и т.д.)

## Отличия от ColAI-master

| ColAI-master | colai-production |
|--------------|------------------|
| `localhost:11434` | Vercel API → Render |
| Локальный Ollama | Ollama на Render (через API) |
| Офлайн | Онлайн (требует Vercel + Render) |

Вся остальная функциональность идентична.
