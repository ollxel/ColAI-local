import { marked } from 'marked';
import { NetworkManager } from './networkManager.js';
import { UIManager } from './uiManager.js';
import { PromptGenerator } from './promptGenerator.js';
import { FileManager } from './fileManager.js';
import { DialogueManager } from './dialogueManager.js';
import { getLanguageLabel } from './languageConfig.js';

export class ColAIFramework {
    constructor() {
        this.projectName = '';
        this.projectDescription = '';
        this.summarizerInstructions = '';
        this.iterations = 0;
        this.maxIterations = 5;
        this.discussionHistory = [];
        this.acceptedSummaries = [];
        this.currentState = 'idle'; // idle, discussing, summarizing, voting
        this.finalOutput = '';
        this.discussionPaused = false;
        this.currentOperation = null; // To store the ongoing operation (Promise)
        this.useCustomIterations = false;
        this.customIterationCycles = 1;
        this.unrestrictedMode = false; // New flag for unrestricted (uncensored) mode
        this.infiniteMode = false; // New flag for infinite discussion mode
        this.interfaceLanguage = 'en'; // Current interface language
        this.languageTranslations = this.initializeLanguageTranslations();
        
        // Initialize File Manager
        this.fileManager = new FileManager();
        
        // Initialize UI Manager with fileManager
        this.uiManager = new UIManager(this.fileManager);
        this.localizationService = this.uiManager.localizationService;
        
        // Initialize Network Manager with network personas
        this.networkManager = new NetworkManager();
        
        // Загружаем модель из localStorage или устанавливаем по умолчанию
        const savedModel = localStorage.getItem('ollama-model') || 'qwen2.5:14b';
        this.networkManager.setModel(savedModel);
        
        // Initialize Prompt Generator
        this.promptGenerator = new PromptGenerator();
        
        // Add dialogue manager for event-driven mode
        this.dialogueManager = new DialogueManager();
        this.mode = 'iterative'; // or 'event_driven'
        
        // Only initialize event listeners if we're in collaboration mode
        if (window.location.hash !== '#mafia' && window.location.hash !== '#wiki') {
            this.initEventListeners();
            this.loadSavedDiscussions(); // Load saved discussions
            this.initOllamaControls(); // Инициализируем элементы управления Ollama
        }
        
        // Set global reference to this instance
        window.neuralFramework = this;
        
        // Set up dialogue manager event listeners
        this.setupDialogueManagerListeners();
        
        // Add live chat mode settings
        this.liveChatMode = false;
        this.initiativeEnabled = false;
        this.fragmentedMessagesEnabled = false;
        this.fragmentationLevel = 0.5; // 0 = single block, 1 = every sentence
        this.activeGenerations = new Map(); // Track ongoing generations
        this.messageQueue = [];
        this.sequenceCounter = 0;
    }
    
    initOllamaControls() {
        const modelInput = document.getElementById('ollama-model');
        const checkBtn = document.getElementById('check-ollama');
        const statusDiv = document.getElementById('ollama-status');
        
        if (modelInput) {
            const savedModel = localStorage.getItem('ollama-model') || 'qwen2.5:14b';
            modelInput.value = savedModel;
            
            modelInput.addEventListener('change', async () => {
                const modelName = modelInput.value.trim();
                if (modelName) {
                    this.networkManager.setModel(modelName);
                    localStorage.setItem('ollama-model', modelName);
                    const message = await this.localizationService?.getLocalizedString(`Model set to: ${modelName}`, this.interfaceLanguage) 
                        || `Model set to: ${modelName}`;
                    statusDiv.textContent = message;
                    statusDiv.style.color = '#06d6a0';
                }
            });
        }
        
        if (checkBtn) {
            checkBtn.addEventListener('click', async () => {
                checkBtn.disabled = true;
                const checkingLabel = await this.localizationService?.getLocalizedString('Checking...', this.interfaceLanguage) || 'Checking...';
                checkBtn.textContent = checkingLabel;
                statusDiv.style.color = '#ff9e00';
                const verifyingText = await this.localizationService?.getLocalizedString('Verifying connection to Ollama...', this.interfaceLanguage) 
                    || 'Verifying connection to Ollama...';
                statusDiv.textContent = verifyingText;
                
                try {
                    const isConnected = await this.networkManager.checkOllamaConnection();
                    if (isConnected) {
                        const models = await this.networkManager.getAvailableModels();
                        let successMessage = `✓ Ollama connected. Models available: ${models.length}`;
                        
                        const currentModel = modelInput.value.trim();
                        if (currentModel && !models.includes(currentModel)) {
                            successMessage += `\n⚠ Model "${currentModel}" was not found. Make sure it is pulled (ollama pull ${currentModel}).`;
                            statusDiv.style.color = '#ff9e00';
                        } else {
                            statusDiv.style.color = '#06d6a0';
                        }
                        
                        statusDiv.textContent = await this.localizationService?.getLocalizedString(successMessage, this.interfaceLanguage) 
                            || successMessage;
                    } else {
                        const offlineMessage = '✗ API недоступен. Проверьте подключение к Vercel API (Render серверы)';
                        statusDiv.textContent = await this.localizationService?.getLocalizedString(offlineMessage, this.interfaceLanguage) 
                            || offlineMessage;
                        statusDiv.style.color = '#ef476f';
                    }
                } catch (error) {
                    const errorMessage = `✗ Error: ${error.message}`;
                    statusDiv.textContent = await this.localizationService?.getLocalizedString(errorMessage, this.interfaceLanguage) 
                        || errorMessage;
                    statusDiv.style.color = '#ef476f';
                } finally {
                    checkBtn.disabled = false;
                    const defaultLabel = await this.localizationService?.getLocalizedString('Check Connection', this.interfaceLanguage) 
                        || 'Check Connection';
                    checkBtn.textContent = defaultLabel;
                }
            });
        }
    }
    
    initEventListeners() {
        if (this.uiManager.elements.startBtn && this.uiManager.elements.resetBtn) {
            this.uiManager.elements.startBtn.addEventListener('click', () => this.startCollaboration());
            this.uiManager.elements.resetBtn.addEventListener('click', () => this.resetProject());
            
            // Add event listener for infinite mode toggle
            if (document.getElementById('infinite-mode')) {
                document.getElementById('infinite-mode').addEventListener('change', (e) => {
                    this.infiniteMode = e.target.checked;
                    if (this.infiniteMode) {
                        this.uiManager.addSystemMessage(this.translateText("Infinite mode enabled - discussion will continue indefinitely until manually stopped."));
                    }
                });
            }
            
            // Add event listener for language switcher
            if (document.getElementById('interface-language')) {
                document.getElementById('interface-language').addEventListener('change', async (e) => {
                    this.interfaceLanguage = e.target.value;
                    await this.updateInterfaceLanguage();
                });
            }
            
            // Add event listener for continue discussion button
            if (this.uiManager.elements.continueDiscussionBtn) {
                this.uiManager.elements.continueDiscussionBtn.addEventListener('click', () => this.continueAfterCompletion());
            }
        }
    }
    
    startCollaboration() {
        this.projectName = this.uiManager.elements.projectName.value.trim();
        this.projectDescription = this.uiManager.elements.projectDescription.value.trim();
        this.summarizerInstructions = this.uiManager.elements.summarizerInstructions?.value.trim() || '';
        
        // Get max iterations from the input field rather than the slider
        this.maxIterations = parseInt(this.uiManager.elements.maxIterationsInput.value);
        
        // Check for custom iteration settings
        this.useCustomIterations = this.uiManager.elements.iterationType.value === 'custom';
        if (this.useCustomIterations) {
            this.customIterationCycles = parseInt(this.uiManager.elements.customIterationCycles.value) || 1;
        }
        
        // Update model settings from UI controls
        this.updateModelSettings();
        
        if (!this.projectName || !this.projectDescription) {
            this.uiManager.addSystemMessage('Please enter both a topic name and description before starting.');
            return;
        }
        
        this.uiManager.elements.projectName.disabled = true;
        this.uiManager.elements.projectDescription.disabled = true;
        this.uiManager.elements.summarizerInstructions.disabled = true;
        this.uiManager.elements.maxIterations.disabled = true;
        this.uiManager.elements.maxIterationsInput.disabled = true;
        this.uiManager.elements.startBtn.disabled = true;
        
        this.uiManager.addSystemMessage(`Topic "${this.projectName}" initiated. Starting collaborative discussion.`);
        
        // Check live chat mode settings first
        this.updateLiveChatSettings();
        
        // Always check for live chat mode first, regardless of other modes
        if (this.liveChatMode) {
            this.startLiveChatDiscussion();
        } else if (this.mode === 'event_driven') {
            this.startEventDrivenDiscussion();
        } else {
            this.startIterativeDiscussion();
        }
    }
    
    updateLiveChatSettings() {
        // Get settings from UI elements that will be added
        this.initiativeEnabled = document.getElementById('initiative-enabled')?.checked || false;
        this.fragmentedMessagesEnabled = document.getElementById('fragmented-messages-enabled')?.checked || false;
        this.fragmentationLevel = parseFloat(document.getElementById('fragmentation-level')?.value || 0.5);
        this.liveChatMode = this.initiativeEnabled || this.fragmentedMessagesEnabled;
        
        // Update UI mode immediately
        this.uiManager.updateChatMode(this.liveChatMode ? 'live' : 'classic');
        
        // Force live chat mode if either setting is enabled
        if (this.liveChatMode) {
            this.uiManager.showLiveChatInterface();
        }
    }
    
    async startLiveChatDiscussion() {
        this.uiManager.addSystemMessage(this.translateText("Live Chat mode activated. Networks will communicate with initiative and dynamic responses."));
        this.uiManager.showLiveChatInterface();
        
        const prompt = this.promptGenerator.createIterationPrompt(
            this.projectName, 
            this.projectDescription, 
            1, 
            this.acceptedSummaries
        );
        
        // Get enabled networks
        const enabledNetworks = this.getEnabledNetworks();
        
        if (enabledNetworks.length === 0) {
            this.uiManager.addSystemMessage(this.translateText("Error: No networks are enabled."));
            return;
        }
        
        // Start infinite live chat if infinite mode is enabled
        if (this.infiniteMode) {
            this.startInfiniteLiveChat(enabledNetworks, prompt);
        } else {
            // Start race condition generation if initiative is enabled
            if (this.initiativeEnabled) {
                this.startRaceGeneration(enabledNetworks, prompt);
            } else {
                // Standard sequential with fragmentation
                this.startSequentialLiveChat(enabledNetworks, prompt);
            }
        }
    }
    
    async startInfiniteLiveChat(networks, prompt) {
        this.uiManager.addSystemMessage(this.translateText("Infinite live chat started - networks will continue discussing indefinitely."));
        
        const runInfiniteRounds = async () => {
            while (this.infiniteMode && !this.discussionPaused) {
                if (this.initiativeEnabled) {
                    await this.startRaceGeneration(networks, this.getUpdatedPromptWithContext());
                } else {
                    await this.startSequentialLiveChat(networks, this.getUpdatedPromptWithContext());
                }
                
                // Add random delay between rounds (5-15 seconds)
                await new Promise(resolve => setTimeout(resolve, Math.random() * 10000 + 5000));
            }
        };
        
        runInfiniteRounds();
    }
    
    async startRaceGeneration(networks, prompt) {
        const attachments = this.fileManager.getAttachments();
        this.activeGenerations.clear(); // Clear any previous generations
        
        // Start all networks generating simultaneously with different delays
        const generationPromises = networks.map(async (networkId, index) => {
            // Add random startup delay to make race more realistic
            const startupDelay = Math.random() * 2000 + (index * 300); // 0-2s + staggered start
            await new Promise(resolve => setTimeout(resolve, startupDelay));
            
            return this.generateWithInitiative(networkId, prompt, attachments);
        });
        
        // Use Promise.allSettled to handle all generations
        try {
            const results = await Promise.allSettled(generationPromises);
            const successfulResults = results
                .filter(result => result.status === 'fulfilled' && result.value)
                .map(result => result.value)
                .sort((a, b) => a.timestamp - b.timestamp); // Sort by completion time
            
            if (successfulResults.length > 0) {
                // Process all successful generations in order
                for (const result of successfulResults) {
                    await this.handleRaceWinner(result, networks);
                    // Small delay between processing results
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                
                // Start next round with random chance
                if (Math.random() < 0.6) { // 60% chance to continue
                    setTimeout(() => {
                        const updatedPrompt = this.getUpdatedPromptWithContext();
                        this.startRaceGeneration(networks, updatedPrompt);
                    }, Math.random() * 3000 + 2000); // 2-5 second delay
                }
            }
        } catch (error) {
            console.error("Race generation error:", error);
        }
    }
    
    async generateWithInitiative(networkId, prompt, attachments) {
        // More varied thinking times based on network characteristics
        const networkDelays = {
            'network1': [2000, 4000], // Analytical - takes time to think
            'network2': [1000, 3000], // Creative - quicker bursts
            'network3': [1500, 3500], // Implementation - moderate
            'network4': [2500, 4500], // Data Science - thorough analysis
            'network5': [2000, 4000], // Ethical - careful consideration
            'network6': [1500, 3000], // UX - user-focused speed
            'network7': [3000, 5000], // Systems - comprehensive view
            'network8': [1000, 2500]  // Devil's Advocate - quick challenges
        };
        
        const delays = networkDelays[networkId] || [1500, 3500];
        const thinkingTime = Math.random() * (delays[1] - delays[0]) + delays[0];
        
        await new Promise(resolve => setTimeout(resolve, thinkingTime));
        
        this.uiManager.updateNetworkStatus(networkId);
        
        try {
            let response;
            if (this.fragmentedMessagesEnabled) {
                response = await this.generateFragmentedMessage(networkId, prompt, attachments);
            } else {
                response = await this.networkManager.generateNetworkResponse(networkId, prompt, attachments);
            }
            
            return { networkId, response, timestamp: Date.now() };
        } catch (error) {
            console.error(`Generation error for ${networkId}:`, error);
            // Return a fallback response instead of null
            return { 
                networkId, 
                response: this.getRoleBasedResponse(networkId), 
                timestamp: Date.now() 
            };
        }
    }
    
    async generateFragmentedMessage(networkId, prompt, attachments) {
        const fragmentPrompt = prompt + `\n\nIMPORTANT: You should respond naturally and conversationally. If you have multiple thoughts, you can send them as separate short messages by ending with [CONTINUE] to send another message, or [END] when you're done. Each message should feel natural and spontaneous, like in a real conversation. Avoid generic responses and focus on your specific role as ${this.networkManager.networks[networkId].name}.`;
        
        const fragments = [];
        let continueGeneration = true;
        let fragmentCount = 0;
        const maxFragments = Math.max(1, Math.ceil(3 * this.fragmentationLevel) + 1); // 1-4 fragments based on level
        
        while (continueGeneration && fragmentCount < maxFragments) {
            const contextualPrompt = fragmentCount === 0 ? 
                fragmentPrompt : 
                `${fragmentPrompt}\n\nYour previous messages in this sequence: ${fragments.join(' ')}\nContinue with your next thought or conclude with [END]:`;
                
            try {
                const response = await this.networkManager.generateNetworkResponse(networkId, contextualPrompt, attachments);
                
                // Check if response indicates continuation
                if (response.includes('[CONTINUE]') && Math.random() < this.fragmentationLevel) {
                    fragments.push(response.replace('[CONTINUE]', '').trim());
                    continueGeneration = true;
                } else {
                    fragments.push(response.replace(/\[(CONTINUE|END)\]/g, '').trim());
                    continueGeneration = false;
                }
                
                fragmentCount++;
                
                // Small delay between fragments for realistic typing
                if (continueGeneration && fragmentCount < maxFragments) {
                    await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 1200));
                }
            } catch (error) {
                console.error(`Fragment generation error for ${networkId}:`, error);
                if (fragments.length === 0) {
                    // Provide a fallback if no fragments were generated
                    const roleBasedResponse = this.getRoleBasedResponse(networkId);
                    fragments.push(roleBasedResponse);
                }
                break;
            }
        }
        
        return fragments.length > 0 ? fragments : [this.getRoleBasedResponse(networkId)];
    }
    
    getRoleBasedResponse(networkId) {
        const responses = {
            'network1': "I'm analyzing the key components of this topic systematically.",
            'network2': "Let me explore some creative angles on this discussion.",
            'network3': "From a practical standpoint, here's what I'm considering.",
            'network4': "Looking at this through a data-driven lens.",
            'network5': "I want to examine the ethical implications here.",
            'network6': "Thinking about the user experience aspects.",
            'network7': "Taking a holistic systems view of this topic.",
            'network8': "I need to challenge some assumptions here."
        };
        return responses[networkId] || "I'm contributing my perspective to this discussion.";
    }
    
    async handleRaceWinner(winner, allNetworks) {
        if (!winner) return;
        
        const { networkId, response } = winner;
        this.sequenceCounter++;
        
        // Post the winning message(s)
        if (Array.isArray(response)) {
            // Fragmented message
            for (let i = 0; i < response.length; i++) {
                const messageId = await this.postLiveChatMessage(
                    networkId, 
                    response[i], 
                    i > 0 ? `${this.sequenceCounter}-${i-1}` : null,
                    `${this.sequenceCounter}-${i}`
                );
                
                // Small delay between fragments for visual effect
                if (i < response.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 800));
                }
            }
        } else {
            // Single message
            await this.postLiveChatMessage(networkId, response, null, `${this.sequenceCounter}-0`);
        }
        
        // Clean up this generation
        this.activeGenerations.delete(networkId);
        
        // Other networks may reconsider their response
        const remainingNetworks = allNetworks.filter(id => id !== networkId && this.activeGenerations.has(id));
        
        for (const id of remainingNetworks) {
            // Cancel ongoing generation and potentially restart
            this.activeGenerations.delete(id);
            
            // 30% chance to give up, 70% chance to reconsider
            if (Math.random() > 0.3) {
                const newPrompt = this.getUpdatedPromptWithContext();
                setTimeout(() => {
                    this.generateWithInitiative(id, newPrompt, this.fileManager.getAttachments())
                        .then(result => {
                            if (result) {
                                this.handleRaceWinner(result, [id]);
                            }
                        });
                }, Math.random() * 2000 + 500); // 0.5-2.5 second delay
            }
        }
        
        // Check if any network wants to continue immediately
        if (Math.random() < 0.4) { // 40% chance the winner continues
            setTimeout(() => {
                const continuationPrompt = this.getUpdatedPromptWithContext() + "\n\nYou may continue your thought or respond to the current discussion.";
                this.generateWithInitiative(networkId, continuationPrompt, this.fileManager.getAttachments())
                    .then(result => {
                        if (result) {
                            this.handleRaceWinner(result, [networkId]);
                        }
                    });
            }, Math.random() * 3000 + 1000); // 1-4 second delay
        }
    }
    
    async postLiveChatMessage(networkId, content, parentId, sequenceId) {
        const messageId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        
        const messageData = {
            id: messageId,
            networkId,
            content,
            parentId,
            sequenceId,
            timestamp: Date.now(),
            isFragment: !!parentId
        };
        
        // Add to discussion history
        this.discussionHistory.push({
            role: networkId, 
            content,
            messageId,
            parentId,
            sequenceId
        });
        
        // Update UI
        this.uiManager.addLiveChatMessage(networkId, this.networkManager.networks[networkId].name, content, messageData);
        
        return messageId;
    }
    
    getUpdatedPromptWithContext() {
        let context = `Topic: ${this.projectName}\nDescription: ${this.projectDescription}\n\n`;
        
        // Get recent messages for context
        const recentMessages = this.discussionHistory.slice(-10);
        context += "Recent discussion:\n";
        
        recentMessages.forEach(msg => {
            const networkName = this.networkManager.networks[msg.role]?.name || msg.role;
            context += `${networkName}: ${msg.content}\n`;
        });
        
        return context;
    }
    
    getEnabledNetworks() {
        return this.networkManager.getNetworkIds().filter(id => {
            const networkNum = id.replace('network', '');
            return (this.networkManager.modelSettings[`use_${id}`] !== false) ||
                   (this.uiManager.elements[`use${networkNum}`] && 
                    this.uiManager.elements[`use${networkNum}`].checked);
        });
    }
    
    async startSequentialLiveChat(networks, prompt) {
        for (const networkId of networks) {
            const result = await this.generateWithInitiative(networkId, prompt, this.fileManager.getAttachments());
            if (result) {
                await this.handleRaceWinner(result, [networkId]);
                
                // Delay before next network
                await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
            }
        }
    }
    
    updateModelSettings() {
        const modelSettings = {
            temperature: parseFloat(this.uiManager.elements.temperature.value) / 10,
            max_tokens: parseInt(this.uiManager.elements.maxTokens.value),
            top_p: parseFloat(this.uiManager.elements.topP.value) / 10,
            presence_penalty: parseFloat(this.uiManager.elements.presencePenalty.value) / 10,
            frequency_penalty: parseFloat(this.uiManager.elements.frequencyPenalty.value) / 10,
            system_prompt_template: this.uiManager.elements.systemPrompt.value.trim(),
            use_network1: this.uiManager.elements.useNetwork1.checked,
            use_network2: this.uiManager.elements.useNetwork2.checked,
            use_network3: this.uiManager.elements.useNetwork3.checked,
            use_network4: this.uiManager.elements.useNetwork4.checked,
            use_network5: this.uiManager.elements.useNetwork5.checked,
            use_network6: this.uiManager.elements.useNetwork6.checked,
            use_network7: this.uiManager.elements.useNetwork7.checked,
            use_network8: this.uiManager.elements.useNetwork8.checked,
            use_summarizer: this.uiManager.elements.useSummarizer ? this.uiManager.elements.useSummarizer.checked : true,
            unrestricted_mode: this.unrestrictedMode // Add unrestricted mode setting
        };
        
        // Parse logit bias if provided
        if (this.uiManager.elements.logitBias.value.trim()) {
            try {
                modelSettings.logit_bias = JSON.parse(this.uiManager.elements.logitBias.value.trim());
            } catch (e) {
                console.error("Invalid logit bias JSON:", e);
                this.uiManager.addSystemMessage("Warning: Invalid logit bias JSON format. Using default settings.");
            }
        }
        
        this.networkManager.updateModelSettings(modelSettings);
        
        // Update individual network settings
        for (let i = 1; i <= 8; i++) {
            const networkId = `network${i}`;
            const networkSettings = this.uiManager.getNetworkSettings(networkId);
            this.networkManager.updateNetworkSettings(networkId, networkSettings);
        }
        
        // Update summarizer settings
        const summarizerSettings = this.uiManager.getNetworkSettings('summarizer');
        this.networkManager.updateNetworkSettings('summarizer', summarizerSettings);
    }
    
    async startNewIteration() {
        this.networkManager.clearDiscussionHistory();
        this.iterations++;
        this.uiManager.elements.iterationCounter.textContent = this.iterations;
        
        const prompt = this.promptGenerator.createIterationPrompt(this.projectName, this.projectDescription, this.iterations, this.acceptedSummaries);
        this.currentState = 'discussing';
        this.uiManager.showPauseButton();

        this.uiManager.addSystemMessage(`Starting iteration ${this.iterations}...`);
        
        // Get attachments from file manager
        const attachments = this.fileManager.getAttachments();
        
        // Check which networks are enabled
        const modelSettings = this.networkManager.modelSettings;
        const enabledNetworks = this.networkManager.getNetworkIds().filter(id => {
            const networkNum = id.replace('network', '');
            // Check if this network is enabled
            return (this.networkManager.modelSettings[`use_${id}`] !== false) ||
                   (this.uiManager.elements[`use${networkNum}`] && 
                    this.uiManager.elements[`use${networkNum}`].checked);
        });
        
        if (enabledNetworks.length === 0) {
            this.uiManager.addSystemMessage("Error: No networks are enabled. Please enable at least one network.");
            this.currentState = 'idle';
            this.uiManager.elements.startBtn.disabled = false;
            this.uiManager.hidePauseButton();
            return;
        }
        
        const summarizerEnabled = this.isSummarizerEnabled();

        // Process each enabled network
        for (const networkId of enabledNetworks) {
            this.uiManager.updateNetworkStatus(networkId);
            await this.uiManager.simulateThinking(networkId, this.networkManager.networks);
            
            try {
                const contextForNetwork = this.getDiscussionContext();
                const networkResponse = await this.networkManager.generateNetworkResponse(networkId, contextForNetwork, attachments);
                this.discussionHistory.push({role: networkId, content: networkResponse});
                this.uiManager.addMessageToChat(networkId, this.networkManager.networks[networkId].name, networkResponse);
            } catch (error) {
                console.error(`Error generating response for ${networkId}:`, error);
                if (this.discussionPaused) return;
            }
        }
        
        // Additional exchange rounds (can be configured)
        const exchangeRounds = this.useCustomIterations ? this.customIterationCycles : 1;
        for (let i = 1; i < exchangeRounds; i++) {
            for (const networkId of enabledNetworks) {
                this.uiManager.updateNetworkStatus(networkId);
                await this.uiManager.simulateThinking(networkId, this.networkManager.networks);
                
                try {
                    const contextForNetwork = this.getDiscussionContext();
                    const networkResponse = await this.networkManager.generateNetworkResponse(networkId, contextForNetwork, attachments);
                    this.discussionHistory.push({role: networkId, content: networkResponse});
                    this.uiManager.addMessageToChat(networkId, this.networkManager.networks[networkId].name, networkResponse);
                } catch (error) {
                    console.error(`Error generating response for ${networkId} in round ${i+1}:`, error);
                    if (this.discussionPaused) return;
                }
            }
        }
        
        if (!summarizerEnabled) {
            this.currentState = 'idle';
            const transcript = this.generateTranscriptSummary();
            this.acceptSummary(transcript);
            this.uiManager.addSystemMessage(this.translateText("Summarizer disabled - skipping summary and voting phases."));
            
            if (this.iterations < this.maxIterations || this.infiniteMode) {
                setTimeout(() => this.startNewIteration(), 1500);
            } else {
                this.finalizeDevelopment();
            }
            return;
        }
        
        // Generate summary
        this.currentState = 'summarizing';
        this.uiManager.updateNetworkStatus('summarizer');
        await this.uiManager.simulateThinking('summarizer', this.networkManager.networks, 2500);
        const summaryContext = this.getDiscussionContext();
        const summary = await this.networkManager.generateSummary(summaryContext, this.summarizerInstructions);
        this.uiManager.addMessageToChat('summarizer', this.networkManager.networks.summarizer.name, summary);
        
        // Vote on summary
        this.currentState = 'voting';
        
        // Get votes from each enabled network
        const votes = [];
        for (const networkId of enabledNetworks) {
            this.uiManager.updateNetworkStatus(networkId);
            await this.uiManager.simulateThinking(networkId, this.networkManager.networks);
            const networkVote = await this.networkManager.getVoteOnSummary(networkId, summary);
            this.uiManager.addMessageToChat(networkId, this.networkManager.networks[networkId].name, networkVote);
            
            // Track if this network accepts the summary
            const accepts = 
                networkVote.toLowerCase().includes('accept') || 
                networkVote.toLowerCase().includes('agree') ||
                networkVote.toLowerCase().includes('yes');
            
            votes.push({ networkId, accepts });
        }
        
        // Check if all networks accept the summary
        const allAccept = votes.every(vote => vote.accepts);
        
        if (allAccept) {
            this.acceptSummary(summary);
            this.uiManager.addSystemMessage(this.translateText("Summary accepted by all networks! Moving to the next iteration."));
            
            // Check if we should continue with more iterations
            if (this.iterations < this.maxIterations || this.infiniteMode) {
                setTimeout(() => this.startNewIteration(), 1500);
            } else {
                this.finalizeDevelopment();
            }
        } else {
            // Identify which networks rejected the summary
            const rejectingNetworks = votes.filter(vote => !vote.accepts)
                .map(vote => this.networkManager.networks[vote.networkId].name);
            
            this.uiManager.addSystemMessage(this.translateText(`Summary was rejected. ${rejectingNetworks.join(', ')} disagreed. Starting a new discussion round.`));
            setTimeout(() => this.startNewIteration(), 1500);
        }
    }
    
    acceptSummary(summary) {
        this.acceptedSummaries.push(summary);
        this.uiManager.addSummaryToList(summary, this.iterations);
        this.uiManager.addSystemMessage(this.translateText("Summary accepted! Moving to the next iteration."));
        
        // Clear discussion history for the next iteration but keep summaries
        this.discussionHistory = [];
    }
    
    async finalizeDevelopment() {
        this.currentState = 'finalizing';
        this.uiManager.addSystemMessage(this.translateText("All iterations complete. Generating final output..."));
        
        if (!this.isSummarizerEnabled()) {
            const transcriptOutput = this.buildTranscriptBasedOutput();
            this.completeFinalization(transcriptOutput);
            return;
        }
        
        this.uiManager.updateNetworkStatus('summarizer');
        this.uiManager.simulateThinking('summarizer', this.networkManager.networks, 3000).then(() => {
            this.networkManager.generateFinalOutput(this.projectName, this.projectDescription, this.acceptedSummaries).then(finalOutput => {
                this.completeFinalization(finalOutput);
            });
        });
    }
    
    completeFinalization(finalOutput) {
        this.finalOutput = finalOutput;
        this.uiManager.displayFinalOutput(finalOutput);
        this.currentState = 'completed';
        this.uiManager.updateNetworkStatus(null);
        this.uiManager.addSystemMessage(this.translateText("Discussion process completed!"));
        this.uiManager.elements.resetBtn.disabled = false;
        this.uiManager.hidePauseButton();
        
        // Save the discussion to local storage
        this.saveCurrentDiscussion();
        
        if (this.infiniteMode) {
            setTimeout(() => {
                this.uiManager.addSystemMessage(this.translateText("Infinite mode active - continuing discussion..."));
                this.startContinuationIteration();
            }, 3000);
        } else if (this.uiManager.elements.continueDiscussionBtn) {
            this.uiManager.elements.continueDiscussionBtn.style.display = 'block';
        }
    }
    
    buildTranscriptBasedOutput() {
        const header = '# ColAI Discussion Transcript\n';
        if (this.acceptedSummaries.length === 0) {
            return `${header}\n${this.generateTranscriptSummary()}`;
        }
        
        const sections = this.acceptedSummaries.map((summary, index) => `## Iteration ${index + 1}\n${summary}`);
        return `${header}\n${sections.join('\n\n')}`;
    }
    
    generateTranscriptSummary() {
        if (this.discussionHistory.length === 0) {
            return this.translateText("No discussion was captured during this iteration.");
        }
        
        return this.discussionHistory.map(entry => {
            const networkName = this.networkManager.networks[entry.role]?.name || entry.role;
            return `${networkName}:\n${entry.content}`;
        }).join('\n\n');
    }
    
    isSummarizerEnabled() {
        return this.networkManager?.modelSettings?.use_summarizer !== false;
    }
    
    startIterativeDiscussion() {
        // Original iterative logic
        this.startNewIteration();
    }
    
    startEventDrivenDiscussion() {
        // Register all enabled networks with dialogue manager
        const enabledNetworks = this.networkManager.getNetworkIds().filter(id => {
            const networkNum = id.replace('network', '');
            return (this.networkManager.modelSettings[`use_${id}`] !== false) ||
                   (this.uiManager.elements[`use${networkNum}`] && 
                    this.uiManager.elements[`use${networkNum}`].checked);
        });
        
        enabledNetworks.forEach(networkId => {
            this.dialogueManager.registerModel(networkId);
        });
        
        // Register summarizer
        if (this.isSummarizerEnabled()) {
            this.dialogueManager.registerModel('summarizer');
        } else {
            this.uiManager.addSystemMessage(this.translateText("Summarizer network disabled - event-driven mode will operate without synthesized summaries."));
        }
        
        // Start the dialogue manager
        this.dialogueManager.start();
        
        // Post initial topic message
        const initialPrompt = this.promptGenerator.createIterationPrompt(
            this.projectName, 
            this.projectDescription, 
            1, 
            this.acceptedSummaries
        );
        
        this.dialogueManager.postMessage('system', initialPrompt);
        
        this.uiManager.addSystemMessage(this.translateText('Event-driven discussion started. Models will respond based on priority and initiative.'));
        this.uiManager.showStreamInterface();
    }
    
    setupDialogueManagerListeners() {
        this.dialogueManager.addEventListener({
            messagePosted: (message) => {
                this.uiManager.addStreamMessage(message);
            },
            modelActivated: ({ modelId, model }) => {
                this.uiManager.updateNetworkStatus(modelId, 'active');
                this.uiManager.simulateThinking(modelId, this.networkManager.networks);
            },
            modelDeactivated: ({ modelId, model }) => {
                this.uiManager.updateNetworkStatus(modelId, 'idle');
            },
            prioritiesUpdated: (models) => {
                this.uiManager.updateModelPriorities(models);
            },
            generateRequest: async ({ modelId, context }) => {
                try {
                    const attachments = this.fileManager.getAttachments();
                    const prompt = this.buildPromptFromContext(context);
                    const response = await this.networkManager.generateNetworkResponse(modelId, prompt, attachments);
                    await this.dialogueManager.postMessage(modelId, response);
                } catch (error) {
                    console.error(`Error generating response for ${modelId}:`, error);
                }
            },
            summaryRequest: async (context) => {
                if (!this.isSummarizerEnabled()) {
                    this.uiManager.addSystemMessage(this.translateText("Summarizer network is disabled - skipping automatic summary generation."));
                    return;
                }
                try {
                    const prompt = this.buildSummaryPromptFromContext(context);
                    const summary = await this.networkManager.generateSummary(prompt, this.summarizerInstructions);
                    const summaryMessage = await this.dialogueManager.postMessage('summarizer', summary);
                    summaryMessage.isSummary = true;
                    this.startSummaryVoting(summaryMessage);
                } catch (error) {
                    console.error('Error generating summary:', error);
                }
            }
        });
    }
    
    buildPromptFromContext(context) {
        let prompt = `Topic Name: ${this.projectName}\nTopic Description: ${this.projectDescription}\n\n`;
        
        if (context.messages.length > 0) {
            prompt += "Recent discussion:\n";
            context.messages.forEach(msg => {
                const authorName = msg.authorId === 'system' ? 'System' : 
                                 this.networkManager.networks[msg.authorId]?.name || msg.authorId;
                prompt += `${authorName}: ${msg.content}\n\n`;
            });
        }
        
        return prompt;
    }
    
    buildSummaryPromptFromContext(context) {
        return this.buildPromptFromContext(context) + 
               "\n\nPlease provide a concise summary of the key points and agreements from this discussion.";
    }
    
    async startSummaryVoting(summaryMessage) {
        // Trigger voting from all active models
        const activeModels = Array.from(this.dialogueManager.models.keys())
            .filter(id => id !== 'summarizer' && id !== 'system');
        
        for (const modelId of activeModels) {
            try {
                const vote = await this.networkManager.getVoteOnSummary(modelId, summaryMessage.content);
                await this.dialogueManager.postMessage(modelId, `Vote on summary: ${vote}`, summaryMessage.id);
            } catch (error) {
                console.error(`Error getting vote from ${modelId}:`, error);
            }
        }
    }
    
    resetProject() {
        // Store current settings before reset
        const currentSettings = {
            projectName: this.projectName,
            projectDescription: this.projectDescription,
            summarizerInstructions: this.summarizerInstructions,
            maxIterations: this.maxIterations,
            useCustomIterations: this.useCustomIterations,
            customIterationCycles: this.customIterationCycles,
            modelSettings: JSON.parse(JSON.stringify(this.networkManager.modelSettings)),
            networkSettings: JSON.parse(JSON.stringify(this.networkManager.networkSettings))
        };
        
        // Reset state variables
        this.projectName = '';
        this.projectDescription = '';
        this.summarizerInstructions = '';
        this.iterations = 0;
        this.discussionHistory = [];
        this.acceptedSummaries = [];
        this.currentState = 'idle';
        this.finalOutput = '';
        
        // Abort any ongoing operations
        if (this.currentOperation && this.currentOperation.abort) {
            this.currentOperation.abort();
        }
        this.currentOperation = null;
        
        // Reset UI elements via UIManager while preserving settings
        this.uiManager.resetUI();
        
        // Restore the settings that should be preserved
        if (this.uiManager.elements.projectName) {
            this.uiManager.elements.projectName.value = currentSettings.projectName;
        }
        if (this.uiManager.elements.projectDescription) {
            this.uiManager.elements.projectDescription.value = currentSettings.projectDescription;
        }
        if (this.uiManager.elements.summarizerInstructions) {
            this.uiManager.elements.summarizerInstructions.value = currentSettings.summarizerInstructions;
        }
        if (this.uiManager.elements.maxIterationsInput) {
            this.uiManager.elements.maxIterationsInput.value = currentSettings.maxIterations;
            this.uiManager.elements.maxIterations.value = Math.min(20, currentSettings.maxIterations);
            this.uiManager.elements.iterationValue.textContent = currentSettings.maxIterations <= 20 ? 
                currentSettings.maxIterations : `${currentSettings.maxIterations} (custom)`;
        }
        if (this.uiManager.elements.iterationType) {
            this.uiManager.elements.iterationType.value = currentSettings.useCustomIterations ? 'custom' : 'auto';
            this.uiManager.elements.customIterationContainer.style.display = 
                currentSettings.useCustomIterations ? 'block' : 'none';
        }
        if (this.uiManager.elements.customIterationCycles) {
            this.uiManager.elements.customIterationCycles.value = currentSettings.customIterationCycles;
        }
        
        // Restore model settings
        this.networkManager.updateModelSettings(currentSettings.modelSettings);
        
        // Restore individual network settings
        for (const networkId in currentSettings.networkSettings) {
            this.networkManager.updateNetworkSettings(networkId, currentSettings.networkSettings[networkId]);
        }
        
        // Stop dialogue manager if running
        this.dialogueManager.stop();
        
        // Hide the continue discussion button
        if (this.uiManager.elements.continueDiscussionBtn) {
            this.uiManager.elements.continueDiscussionBtn.style.display = 'none';
        }
        
        this.uiManager.addSystemMessage(this.translateText("Topic reset. Ready to start a new collaboration."));
    }
    
    pauseDiscussion() {
        this.discussionPaused = true;
        if (this.currentOperation && this.currentOperation.abort) {
            this.currentOperation.abort();
        }
        this.uiManager.showUserPromptArea();
    }
    
    resumeDiscussion(userPrompt = null) {
        this.discussionPaused = false;
        this.uiManager.hideUserPromptArea();
        
        if (userPrompt) {
            // Add user prompt to the discussion
            this.uiManager.addMessageToChat('user', 'User', userPrompt);
            this.discussionHistory.push({role: 'user', content: userPrompt});
            
            // Continue with the current phase
            this.continueFromUserPrompt(userPrompt);
        } else {
            // Just continue from where we left off
            this.continueFromCurrentState();
        }
    }
    
    continueFromUserPrompt(userPrompt) {
        // Resume based on current state with user prompt
        if (this.currentState === 'discussing') {
            this.continueDiscussionWithUserPrompt(userPrompt);
        } else if (this.currentState === 'summarizing') {
            this.continueWithSummarizingFromUserPrompt(userPrompt);
        } else if (this.currentState === 'voting') {
            this.continueVotingWithUserPrompt(userPrompt);
        }
    }
    
    continueFromCurrentState() {
        // Resume from current state without modifying the flow
        if (this.currentState === 'discussing') {
            this.continueDiscussion();
        } else if (this.currentState === 'summarizing') {
            this.continueSummarizing();
        } else if (this.currentState === 'voting') {
            this.continueVoting();
        }
    }
    
    async continueDiscussionWithUserPrompt(userPrompt) {
        // Continue discussion with user prompt
        const context = this.getDiscussionContext() + `\nUser's additional instructions: ${userPrompt}\n`;
        
        // Determine which network to respond next
        const lastNetworkIndex = this.findLastNetworkIndex();
        const nextNetworkId = this.getNextNetworkId(lastNetworkIndex);
        
        this.uiManager.updateNetworkStatus(nextNetworkId);
        await this.uiManager.simulateThinking(nextNetworkId, this.networkManager.networks);
        
        // Get attachments
        const attachments = this.fileManager.getAttachments();
        
        try {
            const response = await this.networkManager.generateNetworkResponse(nextNetworkId, context, attachments);
            this.discussionHistory.push({role: nextNetworkId, content: response});
            this.uiManager.addMessageToChat(nextNetworkId, this.networkManager.networks[nextNetworkId].name, response);
            
            // Continue with normal flow
            this.continueDiscussion(lastNetworkIndex + 1);
        } catch (error) {
            console.error("Error continuing discussion:", error);
            this.uiManager.addSystemMessage(this.translateText("Error occurred while continuing discussion. Please try again."));
        }
    }
    
    findLastNetworkIndex() {
        if (this.discussionHistory.length === 0) return -1;
        
        // Exclude user messages
        const networkMessages = this.discussionHistory.filter(msg => msg.role !== 'user');
        if (networkMessages.length === 0) return -1;
        
        const lastMessage = networkMessages[networkMessages.length - 1];
        const networkIds = this.networkManager.getNetworkIds();
        
        return networkIds.indexOf(lastMessage.role);
    }
    
    getNextNetworkId(previousIndex) {
        const networkIds = this.networkManager.getNetworkIds();
        const enabledNetworks = networkIds.filter(id => {
            const networkNum = id.replace('network', '');
            // Check if this network is enabled
            return (networkNum <= 2) || 
                   (this.networkManager.modelSettings[`use_${id}`] || 
                    this.networkManager.modelSettings[`use_network${networkNum}`] || 
                    (this.uiManager.elements[`use${networkNum}`] && 
                     this.uiManager.elements[`use${networkNum}`].checked));
        });
        
        if (enabledNetworks.length === 0) return 'network1';
        
        const nextIndex = (previousIndex + 1) % enabledNetworks.length;
        return enabledNetworks[nextIndex];
    }
    
    async continueWithSummarizingFromUserPrompt(userPrompt) {
        // Handle summarization with user input
        if (!this.isSummarizerEnabled()) {
            this.uiManager.addSystemMessage(this.translateText("Summarizer network is disabled. Enable it to continue summarizing with user input."));
            return;
        }
        this.uiManager.updateNetworkStatus('summarizer');
        await this.uiManager.simulateThinking('summarizer', this.networkManager.networks, 2000);
        
        // Get the context with user prompt included
        const summaryContext = this.getDiscussionContext() + `\nUser's additional guidance for summarization: ${userPrompt}\n`;
        
        // Generate a summary with the user's additional guidance
        const summary = await this.networkManager.generateSummary(summaryContext, userPrompt);
        this.uiManager.addMessageToChat('summarizer', this.networkManager.networks.summarizer.name, summary);
        
        // Continue with voting phase
        this.currentState = 'voting';
        this.continueVoting();
    }
    
    async continueSummarizing() {
        // Continue with standard summarization process
        if (!this.isSummarizerEnabled()) {
            this.uiManager.addSystemMessage(this.translateText("Summarizer network is disabled. Enable it to continue summarizing."));
            return;
        }
        this.uiManager.updateNetworkStatus('summarizer');
        await this.uiManager.simulateThinking('summarizer', this.networkManager.networks, 2000);
        const summaryContext = this.getDiscussionContext();
        const summary = await this.networkManager.generateSummary(summaryContext, this.summarizerInstructions);
        this.uiManager.addMessageToChat('summarizer', this.networkManager.networks.summarizer.name, summary);
        
        // Continue with voting phase
        this.currentState = 'voting';
        this.continueVoting();
    }
    
    async continueVotingWithUserPrompt(userPrompt) {
        // Implement voting continuation with user prompt
        if (!this.isSummarizerEnabled()) {
            this.uiManager.addSystemMessage(this.translateText("Summarizer network is disabled. Voting workflow is unavailable."));
            return;
        }
        this.uiManager.updateNetworkStatus('network1');
        await this.uiManager.simulateThinking('network1', this.networkManager.networks);
        
        // Get the most recent summary from messages
        const messages = Array.from(this.uiManager.elements.chatMessages.querySelectorAll('.message.summarizer'));
        let summary = '';
        if (messages.length > 0) {
            const lastSummaryElement = messages[messages.length - 1];
            const contentElement = lastSummaryElement.querySelector('.content');
            if (contentElement) {
                summary = contentElement.innerText;
            }
        }
        
        if (!summary) {
            // If no summary found, create one with user input
            this.uiManager.updateNetworkStatus('summarizer');
            await this.uiManager.simulateThinking('summarizer', this.networkManager.networks, 1500);
            summary = `Summary incorporating user feedback: ${userPrompt}`;
            this.uiManager.addMessageToChat('summarizer', this.networkManager.networks.summarizer.name, summary);
        }
        
        // Continue with voting
        this.continueVoting(summary);
    }
    
    async continueVoting(summary = null) {
        if (!this.isSummarizerEnabled()) {
            this.uiManager.addSystemMessage(this.translateText("Summarizer network is disabled. Voting workflow is unavailable."));
            return;
        }
        // If no summary is provided, try to find the most recent one
        if (!summary) {
            const messages = Array.from(this.uiManager.elements.chatMessages.querySelectorAll('.message.summarizer'));
            if (messages.length > 0) {
                const lastSummaryElement = messages[messages.length - 1];
                const contentElement = lastSummaryElement.querySelector('.content');
                if (contentElement) {
                    summary = contentElement.innerText;
                }
            }
            
            if (!summary) {
                // If still no summary, create a generic one
                summary = "Summary of the discussion so far.";
            }
        }
        
        // Implement voting logic
        this.uiManager.updateNetworkStatus('network1');
        await this.uiManager.simulateThinking('network1', this.networkManager.networks);
        const network1Vote = await this.networkManager.getVoteOnSummary('network1', summary);
        this.uiManager.addMessageToChat('network1', this.networkManager.networks.network1.name, network1Vote);
        
        this.uiManager.updateNetworkStatus('network2');
        await this.uiManager.simulateThinking('network2', this.networkManager.networks);
        const network2Vote = await this.networkManager.getVoteOnSummary('network2', summary);
        this.uiManager.addMessageToChat('network2', this.networkManager.networks.network2.name, network2Vote);
        
        // Continue with rest of voting process...
        // Process voting results and move to next iteration as needed
        // This would typically call relevant parts of the startNewIteration method
    }
    
    getDiscussionContext() {
        let context = `Topic Name: ${this.projectName}\nTopic Description: ${this.projectDescription}\n\n`;
        
        if (this.acceptedSummaries.length > 0) {
            context += "Accepted Summaries:\n";
            this.acceptedSummaries.forEach((summary, index) => {
                context += `Summary ${index + 1}: ${summary}\n\n`;
            });
        }
        
        context += "Current Discussion:\n";
        this.discussionHistory.forEach(entry => {
            const networkName = entry.role === 'network1' ? this.networkManager.networks.network1.name : 
                               (entry.role === 'network2' ? this.networkManager.networks.network2.name : 
                               (entry.role === 'network3' ? this.networkManager.networks.network3.name : 
                               (entry.role === 'network4' ? this.networkManager.networks.network4.name : 
                               (entry.role === 'network5' ? this.networkManager.networks.network5.name : 
                               (entry.role === 'network6' ? this.networkManager.networks.network6.name : 
                               (entry.role === 'network7' ? this.networkManager.networks.network7.name : 
                               (entry.role === 'network8' ? this.networkManager.networks.network8.name : 'Synthesizer')))))));
            context += `${networkName}: ${entry.content}\n\n`;
        });
        
        return context;
    }
    
    continueAfterCompletion() {
        // Hide the continue button
        if (this.uiManager.elements.continueDiscussionBtn) {
            this.uiManager.elements.continueDiscussionBtn.style.display = 'none';
        }
        
        // Add a system message indicating continuation
        this.uiManager.addSystemMessage(this.translateText("Continuing the discussion beyond the planned iterations..."));
        
        // Reset state but maintain history
        this.currentState = 'discussing';
        
        // Start a special continuation iteration
        this.startContinuationIteration();
    }
    
    async startContinuationIteration() {
        // Create a special prompt for continuation
        const prompt = `Topic Name: ${this.projectName}\nTopic Description: ${this.projectDescription}\n\n` +
                      `This is a continuation of our previous discussion. We have completed ${this.iterations} iterations ` +
                      `and generated a final output, but we're continuing to explore this topic further. ` +
                      `Please build upon our previous conclusions and explore any aspects that merit further discussion.`;
        
        this.uiManager.showPauseButton();
        
        // Get attachments from file manager
        const attachments = this.fileManager.getAttachments();
        
        // Start with Network 1
        this.uiManager.updateNetworkStatus('network1');
        await this.uiManager.simulateThinking('network1', this.networkManager.networks);
        
        try {
            const network1Response = await this.networkManager.generateNetworkResponse('network1', prompt, attachments);
            
            if (this.discussionPaused) return;
            
            this.discussionHistory.push({role: 'network1', content: network1Response});
            this.uiManager.addMessageToChat('network1', this.networkManager.networks.network1.name, network1Response);
            
            // Continue the exchange with other networks
            // ... similar to startNewIteration() ...
            
            // No need for summarization or voting in continuation mode
            // Just keep the discussion going with multiple exchanges
            
            // Add a "continue further" option after this round
            this.uiManager.addSystemMessage(this.translateText("This continuation round is complete. You can reset or continue further."));
            if (this.uiManager.elements.continueDiscussionBtn) {
                this.uiManager.elements.continueDiscussionBtn.style.display = 'block';
            }
        } catch (error) {
            console.error("Error in continuation:", error);
            this.uiManager.addSystemMessage(this.translateText("Error occurred during continuation. Please try again."));
        }
    }
    
    saveCurrentDiscussion() {
        if (!this.projectName) return;
        
        const discussionData = {
            id: Date.now().toString(),
            projectName: this.projectName,
            projectDescription: this.projectDescription,
            acceptedSummaries: this.acceptedSummaries,
            finalOutput: this.finalOutput,
            timestamp: new Date().toISOString(),
            messages: Array.from(document.querySelectorAll('.message')).map(el => {
                // Get sender and content
                const sender = el.querySelector('.sender')?.textContent || 'System';
                const content = el.querySelector('.content')?.innerHTML || el.textContent;
                const network = Array.from(el.classList).find(c => c.startsWith('network')) || 'system';
                
                return { sender, content, network };
            })
        };
        
        // Get existing saved discussions
        const savedDiscussions = JSON.parse(localStorage.getItem('savedDiscussions') || '[]');
        
        // Add new discussion
        savedDiscussions.push(discussionData);
        
        // Save back to localStorage (limited to last 20 discussions)
        localStorage.setItem('savedDiscussions', JSON.stringify(savedDiscussions.slice(-20)));
    }
    
    loadSavedDiscussions() {
        const savedDiscussions = JSON.parse(localStorage.getItem('savedDiscussions') || '[]');
        if (savedDiscussions.length > 0) {
            this.uiManager.createHistoryUI(savedDiscussions);
        }
    }
    
    exportDiscussion(format = 'json') {
        if (!this.projectName) {
            this.uiManager.showErrorMessage('No discussion to export');
            return;
        }
        
        // Gather all discussion data
        const messages = Array.from(document.querySelectorAll('.message')).map(el => {
            const sender = el.querySelector('.sender')?.textContent || 'System';
            const content = el.querySelector('.content')?.innerHTML || el.textContent;
            const network = Array.from(el.classList).find(c => c.startsWith('network')) || 'system';
            
            return { sender, content, network };
        });
        
        const discussionData = {
            projectName: this.projectName,
            projectDescription: this.projectDescription,
            acceptedSummaries: this.acceptedSummaries,
            finalOutput: this.finalOutput,
            messages: messages,
            exportedAt: new Date().toISOString()
        };
        
        let content, filename, type;
        
        switch(format) {
            case 'json':
                content = JSON.stringify(discussionData, null, 2);
                filename = `${this.projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_discussion.json`;
                type = 'application/json';
                break;
            case 'text':
                content = `Project: ${this.projectName}\n` +
                    `Description: ${this.projectDescription}\n\n` +
                    `Discussion:\n` +
                    messages.map(m => `${m.sender}: ${m.content.replace(/<[^>]*>/g, '')}`).join('\n\n') + 
                    `\n\nFinal Output:\n${this.finalOutput}`;
                filename = `${this.projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_discussion.txt`;
                type = 'text/plain';
                break;
            case 'html':
                content = `<!DOCTYPE html>
                <html>
                <head>
                    <title>${this.projectName} Discussion</title>
                    <style>
                        body { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
                        .message { margin-bottom: 20px; padding: 10px; border-radius: 10px; }
                        .network1 { background-color: #f0f9ff; }
                        .network2 { background-color: #f0fdf4; }
                        .network3 { background-color: #fff7ed; }
                        .network4 { background-color: #e6fff8; }
                        .network5 { background-color: #ffe6ee; }
                        .network6 { background-color: #e6f6ff; }
                        .network7 { background-color: #fff9e6; }
                        .network8 { background-color: #ffe6e6; }
                        .summarizer { background-color: #fffbeb; }
                        .system { background-color: #f9fafb; font-style: italic; }
                        .sender { font-weight: bold; margin-bottom: 5px; }
                        .final-output { margin-top: 30px; border-top: 1px solid #ddd; padding-top: 20px; }
                        h1, h2 { color: #6C63FF; }
                    </style>
                </head>
                <body>
                    <h1>${this.projectName}</h1>
                    <p>${this.projectDescription}</p>
                    <h2>Discussion</h2>
                    ${messages.map(m => `<div class="message ${m.network}">
                        <div class="sender">${m.sender}</div>
                        <div class="content">${m.content}</div>
                    </div>`).join('')}
                    <div class="final-output">
                        <h2>Final Output</h2>
                        ${this.finalOutput}
                    </div>
                </body>
                </html>`;
                filename = `${this.projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_discussion.html`;
                type = 'text/html';
                break;
        }
        
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    }
    
    toggleUnrestrictedMode(enabled) {
        this.unrestrictedMode = enabled;
        this.updateModelSettings();
    }
    
    setMode(mode) {
        if (['iterative', 'event_driven'].includes(mode)) {
            this.mode = mode;
            this.uiManager.updateModeInterface(mode);
        }
    }
    
    initializeLanguageTranslations() {
        return {
            'Infinite mode enabled - discussion will continue indefinitely until manually stopped.': {
                'ru': 'Бесконечный режим включен - обсуждение будет продолжаться бесконечно, пока не будет остановлено вручную.',
                'es': 'Modo infinito habilitado: la discusión continuará indefinidamente hasta que se detenga manualmente.',
                'fr': 'Mode infini activé - la discussion continuera indéfiniment jusqu\'à l\'arrêt manuel.',
                'de': 'Unendlicher Modus aktiviert - Diskussion wird unbegrenzt fortgesetzt, bis manuell gestoppt.',
                'zh': '无限模式已启用 - 讨论将无限期继续，直到手动停止。'
            },
            'All iterations complete. Generating final output...': {
                'ru': 'Все итерации завершены. Генерируется финальный результат...',
                'es': 'Todas las iteraciones completadas. Generando resultado final...',
                'fr': 'Toutes les itérations terminées. Génération du résultat final...',
                'de': 'Alle Iterationen abgeschlossen. Endergebnis wird generiert...',
                'zh': '所有迭代完成。正在生成最终输出...'
            },
            'Discussion process completed!': {
                'ru': 'Процесс обсуждения завершен!',
                'es': '¡Proceso de discusión completado!',
                'fr': 'Processus de discussion terminé !',
                'de': 'Diskussionsprozess abgeschlossen!',
                'zh': '讨论过程完成！'
            },
            'Summary accepted! Moving to the next iteration.': {
                'ru': 'Резюме принято! Переход к следующей итерации.',
                'es': '¡Resumen aceptado! Pasando a la siguiente iteración.',
                'fr': 'Résumé accepté ! Passage à l\'itération suivante.',
                'de': 'Zusammenfassung akzeptiert! Weiter zur nächsten Iteration.',
                'zh': '摘要已接受！进入下一次迭代。'
            },
            'Live Chat mode activated. Networks will communicate with initiative and dynamic responses.': {
                'ru': 'Режим живого чата активирован. Сети будут общаться с инициативой и динамическими ответами.',
                'es': 'Modo de chat en vivo activado. Las redes se comunicarán con iniciativa y respuestas dinámicas.',
                'fr': 'Mode chat en direct activé. Les réseaux communiqueront avec initiative et réponses dynamiques.',
                'de': 'Live-Chat-Modus aktiviert. Netzwerke kommunizieren mit Initiative und dynamischen Antworten.',
                'zh': '实时聊天模式已激活。网络将主动进行动态响应交流。'
            },
            'Error: No networks are enabled.': {
                'ru': 'Ошибка: Ни одна сеть не включена.',
                'es': 'Error: No hay redes habilitadas.',
                'fr': 'Erreur : Aucun réseau n\'est activé.',
                'de': 'Fehler: Keine Netzwerke aktiviert.',
                'zh': '错误：没有启用的网络。'
            },
            'Infinite live chat started - networks will continue discussing indefinitely.': {
                'ru': 'Бесконечный живой чат начат - сети будут обсуждать бесконечно.',
                'es': 'Chat en vivo infinito iniciado: las redes continuarán discutiendo indefinidamente.',
                'fr': 'Chat en direct infini démarré - les réseaux continueront à discuter indéfiniment.',
                'de': 'Unendlicher Live-Chat gestartet - Netzwerke werden unbegrenzt diskutieren.',
                'zh': '无限实时聊天开始 - 网络将无限期讨论。'
            }
        };
    }
    
    translateText(text) {
        if (this.interfaceLanguage === 'en') return text;
        
        const translations = this.languageTranslations[text];
        if (translations && translations[this.interfaceLanguage]) {
            return translations[this.interfaceLanguage];
        }
        
        return text; // Fallback to English if translation not found
    }
    
    async updateInterfaceLanguage() {
        if (this.uiManager?.updateLanguage) {
            await this.uiManager.updateLanguage(this.interfaceLanguage);
        }
        
        const message = `Interface language changed to ${this.getLanguageName(this.interfaceLanguage)}.`;
        
        if (this.localizationService) {
            const localizedMessage = await this.localizationService.getLocalizedString(message, this.interfaceLanguage);
            this.uiManager.addSystemMessage(localizedMessage);
        } else {
            this.uiManager.addSystemMessage(this.translateText(message));
        }
    }
    
    getLanguageName(code) {
        return getLanguageLabel(code);
    }
}
