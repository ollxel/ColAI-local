# Полное руководство по продакшену ColAI

## 📋 Требования

- Node.js 18+
- Python 3.9+
- Аккаунты: Vercel, Render.com (4 аккаунта)
- Uptime Robot (для мониторинга)

## 🚀 Шаг 1: Настройка Vercel

### 1.1 Создание проекта

1. Подключите репозиторий к Vercel
2. Выберите Next.js framework preset
3. **Важно**: Укажите корневую папку `vercel/`
4. Установите переменные окружения:

```env
RENDER_SERVERS=https://server1.onrender.com,https://server2.onrender.com,...
DATABASE_URL=postgres://user:password@host:5432/database
KV_REST_API_URL=https://your-kv-instance.vercel-kv.com
KV_REST_API_TOKEN=your-kv-token
API_SECRET=your-secret-key-here
RENDER_API_KEY=your-render-api-key
```

### 1.2 Настройка Vercel Postgres

1. В панели Vercel → Storage → Create Database
2. Выберите Postgres
3. Скопируйте `DATABASE_URL` в переменные окружения
4. Таблицы создадутся автоматически при первом запросе

### 1.3 Настройка Vercel KV (Redis)

1. В панели Vercel → Storage → Create Database
2. Выберите KV (Redis)
3. Скопируйте `KV_REST_API_URL` и `KV_REST_API_TOKEN`

## 🖥️ Шаг 2: Настройка Render.com серверов

### 2.1 Подготовка серверов

Для каждого из 16 серверов (4 аккаунта × 4 сервера):

1. Создайте новый Web Service на Render.com
2. Подключите репозиторий
3. **Важно**: Укажите корневую папку `render-server/`
4. Настройки:
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn -w 4 -b 0.0.0.0:$PORT app:app --timeout 120`
   - **Environment**: Python 3

### 2.2 Переменные окружения для каждого сервера

```env
OLLAMA_URL=http://your-ollama-instance:11434
RENDER_API_KEY=your-secret-api-key-here
PORT=5000
```

**Важно**: Используйте один и тот же `RENDER_API_KEY` для всех серверов.

### 2.3 Список всех серверов

После создания всех 16 серверов, соберите их URL и добавьте в Vercel:

```env
RENDER_SERVERS=https://colai-server-1.onrender.com,https://colai-server-2.onrender.com,...
```

## 📊 Шаг 3: Настройка мониторинга

### 3.1 Uptime Robot

Для каждого из 16 серверов создайте монитор:

1. **Monitor Type**: HTTP(s)
2. **URL**: `https://your-server.onrender.com/health`
3. **Interval**: 5 minutes
4. **Alert Contacts**: Ваш email/Telegram

## 🔧 Шаг 4: Локальная разработка

### 4.1 Установка зависимостей

```bash
cd vercel
npm install
```

### 4.2 Настройка .env.local

Скопируйте `.env.local.example` в `.env.local` и заполните:

```env
NEXT_PUBLIC_API_URL=http://localhost:3000/api
OLLAMA_URL=http://localhost:11434
```

### 4.3 Запуск локального сервера

```bash
npm run dev
```

Приложение будет доступно на `http://localhost:3000`

### 4.4 Тестирование Render сервера локально

```bash
cd ../render-server
pip install -r requirements.txt
python app.py
```

## 🧪 Шаг 5: Тестирование

### 5.1 Проверка Health Check

```bash
curl https://your-vercel-app.vercel.app/api/health
```

### 5.2 Тест генерации

```bash
curl -X POST https://your-vercel-app.vercel.app/api/ai/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Hello, how are you?",
    "model": "qwen2.5:14b",
    "temperature": 0.7,
    "maxTokens": 100
  }'
```

## 🔒 Безопасность

### API Keys

- Используйте сильные случайные ключи для `RENDER_API_KEY`
- Храните ключи только в переменных окружения
- Никогда не коммитьте `.env` файлы

### Rate Limiting

**Vercel API (рекомендуется):**
- 60 запросов в минуту на IP/API ключ
- Настраивается в `vercel/lib/rateLimiter.js`
- Использует Vercel KV для глобального rate limiting

**Render серверы:**
- ⚠️ **ВНИМАНИЕ**: Текущая реализация rate limiting работает только в рамках одного процесса
- При использовании gunicorn с 4 воркерами, каждый воркер имеет свой счетчик
- Фактический лимит = RATE_LIMIT_MAX × количество воркеров
- Для продакшена рекомендуется использовать Redis для глобального rate limiting
- Основной rate limiting должен выполняться на уровне Vercel API

## 📈 Масштабирование

### Добавление новых серверов

1. Создайте новый сервер на Render
2. Добавьте его URL в `RENDER_SERVERS` в Vercel
3. Перезапустите приложение

### Увеличение количества сессий

В `render-server/app.py` измените:

```python
MAX_WORKERS = 8  # Вместо 4
```

## 🐛 Troubleshooting

### Серверы не отвечают

1. Проверьте health check: `curl https://server.onrender.com/health`
2. Проверьте логи на Render
3. Убедитесь, что Ollama доступен

### Медленные ответы

1. Проверьте нагрузку на серверы
2. Увеличьте количество серверов
3. Проверьте кэширование (KV должен работать)

### Ошибки базы данных

1. Проверьте `DATABASE_URL` в Vercel
2. Убедитесь, что Postgres создан и активен
3. Проверьте логи в Vercel Dashboard

## 🎯 Checklist перед деплоем

- [ ] Все 16 серверов созданы и работают
- [ ] Health checks проходят успешно
- [ ] Vercel Postgres настроен
- [ ] Vercel KV настроен
- [ ] Все переменные окружения установлены
- [ ] Uptime Robot мониторы настроены
- [ ] API ключи сгенерированы и сохранены
- [ ] Тесты пройдены успешно

---

**Готово!** Ваше приложение готово к продакшену! 🚀
