# Render Server для ColAI

Flask сервер для обработки запросов к Ollama на Render.com.

## Установка

1. Установите зависимости:
```bash
pip install -r requirements.txt
```

2. Настройте переменные окружения (см. `.env.example`)

3. Запустите сервер:
```bash
python app.py
```

Или с помощью gunicorn:
```bash
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

## Деплой на Render.com

1. Создайте новый Web Service на Render.com
2. Подключите репозиторий
3. Установите переменные окружения:
   - `OLLAMA_URL` - URL вашего Ollama инстанса
   - `RENDER_API_KEY` - секретный ключ для защиты API
4. Render автоматически использует `Procfile` для запуска

## Endpoints

- `GET /health` - Health check для мониторинга
- `POST /generate` - Генерация ответа от ИИ
- `GET /models` - Список доступных моделей

## Конфигурация

Сервер настроен на обработку 4 параллельных запросов (4 сессии Ollama).
