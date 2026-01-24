# Мастер-промпт: переписать репо ollama-server для Render

**Задача для нейросети:** переписать репозиторий `ollama-server` так, чтобы его можно было деплоить на **Render.com** как **Docker Web Service**. Сервис при старте устанавливает Ollama (если не предустановлен), скачивает указанную модель, запускает Ollama и обслуживает запросы к API Ollama (`/api/chat`, `/api/tags` и т.д.). Снаружи его вызывает **Vercel** (колай-репо): Vercel шлёт POST на `https://<твой-сервис>.onrender.com/api/chat` и получает ответ модели.

---

## Контекст

1. **Один тип сервера на Render** — только Ollama. Никакого Flask, FastAPI, прокси и т.п. Роль сервера: запустить Ollama + модель и отдавать HTTP API Ollama наружу.

2. **Ollama не предустановлен** на Render. Нужно при старте контейнера:
   - установить Ollama (через твои .sh или команды в Dockerfile);
   - скачать модель (например `ollama pull qwen2.5:14b` или другая по конфигу);
   - запустить `ollama serve` (или эквивалент) так, чтобы слушал `0.0.0.0` и порт, который даёт Render (`$PORT`).

3. **Render** при деплое:
   - собирает образ из Dockerfile;
   - запускает контейнер;
   - пробрасывает трафик на `$PORT` внутри контейнера.

4. **Vercel** из репо colai дергает этот сервис:
   - `GET https://<сервис>.onrender.com/api/tags` — проверка здоровья / список моделей;
   - `POST https://<сервис>.onrender.com/api/chat` — чат с моделью (body как в [Ollama API](https://github.com/ollama/ollama/blob/main/docs/api.md)).

---

## Что должно быть в репо ollama-server

### 1. Dockerfile

- **Base image**: Ubuntu 22.04 (или другой подходящий Linux). Ollama на Render не предустановлен — ставится внутри образа.
- **Установка Ollama**:
  - либо через официальный [install script](https://ollama.ai/install.sh) (например `curl -fsSL https://ollama.ai/install.sh | sh`);
  - либо через твои существующие .sh-скрипты, которые уже умеют ставить Ollama.
- **Скачивание модели**:
  - в Dockerfile или в entrypoint вызвать `ollama pull <модель>` (например `qwen2.5:14b`). Модель можно передавать через `ENV` (например `OLLAMA_MODEL`) и использовать в скрипте.
- **Порт**: Render задаёт `PORT`. Ollama по умолчанию слушает 11434. Нужно либо:
  - запускать Ollama с `OLLAMA_HOST=0.0.0.0:${PORT}`, либо
  - поднять какой‑то минимальный прокси с `$PORT` на 11434 (но по ТЗ — **только Ollama**, без лишних сервисов). Предпочтительно настроить сам Ollama на `$PORT`.
- **Запуск**: `CMD` или entrypoint в итоге должны запускать `ollama serve` (или твой .sh, который это делает) так, чтобы слушал `0.0.0.0` и `$PORT`.

### 2. .sh-скрипты

- Один скрипт (например `install_ollama.sh`): ставит Ollama (curl | sh или твой способ).
- Второй (например `download_model.sh` или часть entrypoint): вызывает `ollama pull $OLLAMA_MODEL`.
- При желании — один `entrypoint.sh`, который:
  1. устанавливает Ollama (если ещё нет);
  2. качает модель;
  3. запускает `ollama serve` с нужным хостом/портом.

Скрипты должны быть идемпотентны где возможно (например, не падать, если Ollama уже установлен или модель уже есть).

### 3. Переменные окружения (Render)

- `OLLAMA_MODEL` (обязательная по смыслу): какая модель качается и используется, например `qwen2.5:14b`.
- `PORT`: задаёт Render, не создавать вручную. Использовать при запуске Ollama.

Остальные переменные — по необходимости (например, `OLLAMA_NUM_PARALLEL` и т.д.).

### 4. Структура репо (пример)

```
ollama-server/
├── Dockerfile
├── install_ollama.sh    # установка Ollama
├── download_model.sh    # ollama pull $OLLAMA_MODEL
├── entrypoint.sh        # оркестрация: install → pull → ollama serve
├── .dockerignore
└── README.md            # как деплоить на Render, какие ENV задать
```

Можешь сохранить твои текущие .sh и Dockerfile, но **адаптировать** под:
- установку Ollama внутри контейнера;
- использование `$PORT` и `0.0.0.0`;
- обязательный `ollama pull` выбранной модели при старте.

### 5. Render: настройки Web Service

- **Type**: Docker.
- **Repo**: `ollama-server`.
- **Root Directory**: корень репо (или где лежит Dockerfile).
- **Environment Variables**:
  - `OLLAMA_MODEL` = `qwen2.5:14b` (или другая модель).
  - `PORT` выставляется Render автоматически.
- **Build**: Render собирает образ из Dockerfile. Отдельный build command не нужен, если всё в Dockerfile/entrypoint.

После деплоя Render даёт URL, например `https://ollama-xxx.onrender.com`. Его добавляют в **colai** в переменную `RENDER_SERVERS` (через запятую, если инстансов несколько).

### 6. Проверка работоспособности

- `curl https://<твой-сервис>.onrender.com/api/tags` — должен вернуть JSON с моделями.
- `curl -X POST https://<твой-сервис>.onrender.com/api/chat -H "Content-Type: application/json" -d '{"model":"qwen2.5:14b","messages":[{"role":"user","content":"Hi"}],"stream":false}'` — ответ модели.

---

## Ограничения и нюансы

1. **Только Ollama** в контейнере. Никаких дополнительных API‑серверов (Flask, Node и т.д.). Vercel общается с Ollama напрямую.

2. **Ollama не предустановлен** — вся установка и загрузка модели происходит при старте контейнера (Dockerfile + entrypoint/.sh).

3. **Порт и хост**: Ollama должен слушать `0.0.0.0` и порт из `$PORT`, иначе Render не пробросит трафик.

4. **Холодный старт**: на бесплатном Render инстансы засыпают. Первый запрос после сна может быть долгим (старт контейнера + pull модели, если делается при каждом старте). По возможности кэшировать образ с уже скачанной моделью.

5. **Модель**: явно указывать в `OLLAMA_MODEL` и всегда делать `ollama pull $OLLAMA_MODEL` в entrypoint перед `ollama serve`, если в образе модель не запечена.

---

## Итог

Переписать репо `ollama-server` так, чтобы:

- Dockerfile + .sh устанавливали Ollama, качали модель по `OLLAMA_MODEL`, запускали `ollama serve` на `0.0.0.0:$PORT`.
- Репо деплоился на Render как **Docker** Web Service без доп. сервисов.
- Снаружи работали `GET /api/tags` и `POST /api/chat` как у обычного Ollama.

Этого достаточно, чтобы colai (Vercel) слал запросы на Render и получал ответы модели обратно.
