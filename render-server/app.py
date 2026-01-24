"""
Flask сервер для Render.com
Запускает 4 сессии Ollama для обработки запросов

ВАЖНО: Rate limiting работает только в рамках одного процесса.
При использовании gunicorn с несколькими воркерами (-w 4),
каждый воркер имеет свой собственный счетчик rate limit.
Для продакшена рекомендуется использовать Redis для глобального rate limiting.
"""
from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import requests
import time
import threading
from queue import Queue
from concurrent.futures import ThreadPoolExecutor
import logging

app = Flask(__name__)
CORS(app)

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Конфигурация
OLLAMA_URL = os.getenv('OLLAMA_URL', 'http://localhost:11434')
API_KEY = os.getenv('RENDER_API_KEY', '')
MAX_WORKERS = 4  # 4 сессии Ollama
MAX_PROMPT_LENGTH = 10000
REQUEST_TIMEOUT = 120  # 2 минуты

# Очередь запросов
request_queue = Queue()
executor = ThreadPoolExecutor(max_workers=MAX_WORKERS)

# Rate limiting (in-memory, работает только в рамках одного процесса)
# ⚠️ ВАЖНО: При использовании gunicorn с несколькими воркерами (-w 4),
# каждый воркер имеет свой собственный счетчик. Фактический лимит = RATE_LIMIT_MAX × количество воркеров.
# Для продакшена рекомендуется использовать Redis для глобального rate limiting.
rate_limit_store = {}
rate_limit_lock = threading.Lock()  # Защита для многопоточности в рамках одного процесса
RATE_LIMIT_WINDOW = 60  # секунд
RATE_LIMIT_MAX = 100  # запросов в окне (на процесс, не глобально!)

def check_rate_limit(identifier):
    """
    Проверяет rate limit для идентификатора.
    
    ⚠️ ОГРАНИЧЕНИЕ: Работает только в рамках одного процесса.
    При использовании gunicorn с несколькими воркерами, каждый воркер
    имеет свой счетчик. Для глобального rate limiting используйте Redis.
    """
    with rate_limit_lock:
        now = time.time()
        if identifier not in rate_limit_store:
            rate_limit_store[identifier] = {'count': 0, 'window_start': now}
        
        store = rate_limit_store[identifier]
        
        # Сбрасываем окно если прошло больше RATE_LIMIT_WINDOW секунд
        if now - store['window_start'] > RATE_LIMIT_WINDOW:
            store['count'] = 0
            store['window_start'] = now
        
        if store['count'] >= RATE_LIMIT_MAX:
            return False
        
        store['count'] += 1
        return True

def validate_api_key():
    """Проверяет API ключ из заголовков"""
    if not API_KEY:
        return True  # Если ключ не установлен, пропускаем проверку
    
    provided_key = request.headers.get('X-API-Key', '')
    return provided_key == API_KEY

def process_ollama_request(prompt, model, temperature, max_tokens):
    """Обрабатывает запрос к Ollama"""
    try:
        payload = {
            'model': model,
            'messages': [
                {
                    'role': 'user',
                    'content': prompt
                }
            ],
            'stream': False,
            'options': {
                'temperature': temperature,
                'num_predict': max_tokens,
                'top_p': 1.0
            }
        }
        
        start_time = time.time()
        response = requests.post(
            f'{OLLAMA_URL}/api/chat',
            json=payload,
            timeout=REQUEST_TIMEOUT,
            headers={'Content-Type': 'application/json'}
        )
        
        response_time = time.time() - start_time
        
        if response.status_code != 200:
            logger.error(f"Ollama error: {response.status_code} - {response.text}")
            raise Exception(f"Ollama API error: {response.status_code}")
        
        data = response.json()
        
        if 'message' not in data or 'content' not in data['message']:
            raise Exception("Invalid response from Ollama")
        
        return {
            'response': data['message']['content'],
            'model': data.get('model', model),
            'response_time': response_time
        }
        
    except requests.exceptions.Timeout:
        logger.error("Ollama request timeout")
        raise Exception("Request timeout")
    except requests.exceptions.RequestException as e:
        logger.error(f"Ollama request error: {e}")
        raise Exception(f"Ollama connection error: {str(e)}")

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint для мониторинга"""
    try:
        # Проверяем доступность Ollama
        response = requests.get(f'{OLLAMA_URL}/api/tags', timeout=5)
        
        if response.status_code == 200:
            return jsonify({
                'status': 'healthy',
                'ollama_available': True,
                'workers': MAX_WORKERS,
                'timestamp': time.time()
            }), 200
        else:
            return jsonify({
                'status': 'degraded',
                'ollama_available': False,
                'workers': MAX_WORKERS,
                'timestamp': time.time()
            }), 503
            
    except Exception as e:
        logger.error(f"Health check error: {e}")
        return jsonify({
            'status': 'unhealthy',
            'ollama_available': False,
            'error': str(e),
            'timestamp': time.time()
        }), 503

@app.route('/generate', methods=['POST'])
def generate():
    """Основной endpoint для генерации ответов"""
    # Проверка API ключа
    if not validate_api_key():
        return jsonify({'error': 'Invalid API key'}), 401
    
    # Rate limiting
    client_id = request.headers.get('X-Forwarded-For', request.remote_addr)
    if not check_rate_limit(client_id):
        return jsonify({
            'error': 'Rate limit exceeded',
            'retry_after': RATE_LIMIT_WINDOW
        }), 429
    
    # Валидация входных данных
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body is required'}), 400
        
        prompt = data.get('prompt', '')
        if not prompt or not isinstance(prompt, str):
            return jsonify({'error': 'Prompt is required and must be a string'}), 400
        
        if len(prompt) > MAX_PROMPT_LENGTH:
            return jsonify({
                'error': f'Prompt is too long (max {MAX_PROMPT_LENGTH} characters)'
            }), 400
        
        model = data.get('model', 'qwen2.5:14b')
        temperature = float(data.get('temperature', 0.7))
        max_tokens = int(data.get('maxTokens', 1000))
        
        # Ограничения параметров
        temperature = max(0.0, min(2.0, temperature))
        max_tokens = max(1, min(4000, max_tokens))
        
    except (ValueError, TypeError) as e:
        return jsonify({'error': f'Invalid request parameters: {str(e)}'}), 400
    
    # Обработка запроса через пул потоков
    try:
        future = executor.submit(process_ollama_request, prompt, model, temperature, max_tokens)
        result = future.result(timeout=REQUEST_TIMEOUT)
        
        return jsonify({
            'response': result['response'],
            'model': result['model'],
            'response_time': result['response_time']
        }), 200
        
    except Exception as e:
        logger.error(f"Generation error: {e}")
        return jsonify({
            'error': 'Generation failed',
            'message': str(e)
        }), 500

@app.route('/models', methods=['GET'])
def list_models():
    """Возвращает список доступных моделей Ollama"""
    try:
        response = requests.get(f'{OLLAMA_URL}/api/tags', timeout=5)
        if response.status_code == 200:
            data = response.json()
            models = [m['name'] for m in data.get('models', [])]
            return jsonify({'models': models}), 200
        else:
            return jsonify({'error': 'Failed to fetch models'}), 500
    except Exception as e:
        logger.error(f"Models list error: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
