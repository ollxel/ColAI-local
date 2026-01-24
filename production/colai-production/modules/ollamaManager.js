
/**
 * Ollama Session Manager
 * Управляет сессиями для моделей Ollama через Vercel API (Render)
 * 
 * ВАЖНО: Использует Vercel API вместо прямого вызова localhost:11434
 * API URL берется из window.API_URL или localStorage['api-url'] или по умолчанию '/api'
 */
export class OllamaSessionManager {
    constructor() {
        this.sessions = new Map();
        // API URL для Vercel (по умолчанию относительный путь для продакшена)
        this.apiUrl = this.getApiUrl();
        this.defaultModel = 'qwen2.5:14b';
        this.connectionStatus = 'unknown';
    }

    /**
     * Получает URL API из конфига
     */
    getApiUrl() {
        // Проверяем window (может быть установлен в index.html)
        if (typeof window !== 'undefined' && window.API_URL) {
            return window.API_URL;
        }
        // Проверяем localStorage
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('api-url');
            if (saved) return saved;
        }
        // По умолчанию относительный путь (работает на Vercel)
        return '/api';
    }

    /**
     * Устанавливает API URL
     */
    setApiUrl(url) {
        this.apiUrl = url;
        if (typeof window !== 'undefined') {
            localStorage.setItem('api-url', url);
        }
    }

    /**
     * Проверяет доступность API (Vercel → Render)
     */
    async checkConnection() {
        try {
            const response = await fetch(`${this.apiUrl}/health`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (response.ok) {
                const data = await response.json();
                // Если хотя бы один сервер здоров - считаем подключенным
                if (data.healthy > 0) {
                    this.connectionStatus = 'connected';
                    return true;
                }
            }
            this.connectionStatus = 'error';
            return false;
        } catch (error) {
            this.connectionStatus = 'disconnected';
            console.error('API connection error:', error);
            return false;
        }
    }

    /**
     * Получает или создает сессию для модели
     */
    async getOrCreateSession(sessionId, modelConfig) {
        if (this.sessions.has(sessionId)) {
            return this.sessions.get(sessionId);
        }

        const session = {
            id: sessionId,
            model: modelConfig.model || this.defaultModel,
            systemPrompt: modelConfig.systemPrompt || '',
            temperature: modelConfig.temperature || 0.7,
            maxTokens: modelConfig.maxTokens || 2048,
            topP: modelConfig.topP || 1.0,
            contextWindow: modelConfig.contextWindow || 4096,
            conversationHistory: []
        };

        this.sessions.set(sessionId, session);
        return session;
    }

    /**
     * Отправляет сообщение в Ollama
     */
    async sendMessage(sessionId, messages, options = {}) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }

        // Проверяем подключение (опционально, можно пропустить для ускорения)
        // const isConnected = await this.checkConnection();
        // if (!isConnected) {
        //     throw new Error('API недоступен. Проверьте подключение к Vercel API.');
        // }

        // Формируем сообщения для Ollama
        const ollamaMessages = [];
        
        // Определяем system prompt: приоритет у system prompt из сессии, если он есть
        let systemPrompt = session.systemPrompt || '';
        
        // Проверяем, есть ли system prompt в новых сообщениях
        const systemMessages = messages.filter(msg => msg.role === 'system');
        if (systemMessages.length > 0 && !systemPrompt) {
            // Используем system prompt из сообщений, если в сессии его нет
            systemPrompt = systemMessages[0].content;
        } else if (systemMessages.length > 0 && systemPrompt) {
            // Если есть и в сессии, и в сообщениях, объединяем их
            systemPrompt = systemPrompt + '\n\n' + systemMessages[0].content;
        }
        
        // Добавляем system prompt если есть
        if (systemPrompt) {
            ollamaMessages.push({
                role: 'system',
                content: systemPrompt
            });
        }

        // Добавляем историю разговора (без system сообщений)
        if (session.conversationHistory.length > 0) {
            const historyWithoutSystem = session.conversationHistory.filter(msg => msg.role !== 'system');
            ollamaMessages.push(...historyWithoutSystem);
        }

        // Добавляем новые сообщения (исключая system, так как он уже обработан)
        for (const msg of messages) {
            if (msg.role === 'system') {
                continue; // System prompt уже обработан
            }
            
            if (typeof msg.content === 'string') {
                ollamaMessages.push({
                    role: msg.role,
                    content: msg.content
                });
            } else if (Array.isArray(msg.content)) {
                // Обработка мультимодального контента
                const textParts = [];
                for (const part of msg.content) {
                    if (part.type === 'text') {
                        textParts.push(part.text);
                    } else if (part.type === 'image_url') {
                        // Ollama поддерживает изображения через base64
                        textParts.push(`[Image: ${part.image_url.url.substring(0, 50)}...]`);
                    }
                }
                ollamaMessages.push({
                    role: msg.role,
                    content: textParts.join('\n\n')
                });
            }
        }

        // Формируем запрос к Vercel API (который проксирует на Render/Ollama)
        const apiPayload = {
            messages: ollamaMessages,
            model: options.model || session.model,
            temperature: options.temperature !== undefined ? options.temperature : session.temperature,
            maxTokens: options.maxTokens !== undefined ? options.maxTokens : session.maxTokens,
            topP: options.topP !== undefined ? options.topP : session.topP
        };

        try {
            const response = await fetch(`${this.apiUrl}/ai/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(apiPayload)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: await response.text() }));
                throw new Error(`API error: ${response.status} - ${errorData.error || errorData.message || 'Unknown error'}`);
            }

            const data = await response.json();

            if (!data.response) {
                throw new Error('Invalid response from API: no response field');
            }

            // Обновляем историю разговора
            session.conversationHistory.push(...ollamaMessages.slice(-messages.length));
            session.conversationHistory.push({
                role: 'assistant',
                content: data.response
            });

            // Ограничиваем размер истории (последние 20 сообщений)
            if (session.conversationHistory.length > 20) {
                session.conversationHistory = session.conversationHistory.slice(-20);
            }

            return {
                content: data.response,
                model: data.model || session.model
            };
        } catch (error) {
            console.error('API error:', error);
            throw error;
        }
    }

    /**
     * Очищает историю сессии
     */
    clearSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.conversationHistory = [];
        }
    }

    /**
     * Удаляет сессию
     */
    deleteSession(sessionId) {
        this.sessions.delete(sessionId);
    }

    /**
     * Устанавливает модель по умолчанию
     */
    setDefaultModel(modelName) {
        this.defaultModel = modelName;
    }

    /**
     * Получает список доступных моделей (через Vercel API)
     * Возвращает дефолтный список, так как модели управляются на Render
     */
    async getAvailableModels() {
        try {
            // Можно вызвать /api/models если такой endpoint есть, иначе возвращаем дефолтные
            const response = await fetch(`${this.apiUrl}/models`);
            if (response.ok) {
                const data = await response.json();
                return data.models || [];
            }
        } catch (error) {
            console.warn('Error fetching models from API:', error);
        }
        // Дефолтный список моделей (можно расширить)
        return ['qwen2.5:14b', 'qwen2.5:7b', 'llama3.2:3b', 'deepseek-r1', 'mistral:7b'];
    }

    /**
     * Проверяет наличие модели
     */
    async checkModel(modelName) {
        const models = await this.getAvailableModels();
        return models.includes(modelName);
    }
}

