import { Agent } from './agent.js';
import { Memory } from './memory.js';
import { GeminiService } from './services/geminiService.js';
import { VoiceService } from './services/voiceService.js';

class FRIDAY {
    constructor() {
        this.memory = new Memory();
        this.geminiService = new GeminiService();
        this.voiceService = new VoiceService();
        this.agent = new Agent(this.geminiService, this.memory);
        this.isProcessing = false;
        this.init();
    }

    init() {
        console.log('🚀 Initializing FRIDAY...');
        this.setupUI();
        this.setupEventListeners();
        console.log('✅ FRIDAY ready');
    }

    setupUI() {
        this.voiceOrbEl = document.getElementById('voiceOrb');
        this.chatMessagesEl = document.getElementById('chatMessages');
        this.userInputEl = document.getElementById('userInput');
        this.sendButtonEl = document.getElementById('sendButton');
        this.settingsBtn = document.getElementById('settingsBtn');
        this.settingsModal = document.getElementById('settingsModal');
        this.apiKeyInput = document.getElementById('apiKeyInput');
        this.saveKeyBtn = document.getElementById('saveKeyBtn');
        this.cancelKeyBtn = document.getElementById('cancelKeyBtn');
        this.statusIndicator = document.getElementById('statusIndicator');

        this.loadAPIKey();
        this.checkConnection();
    }

    setupEventListeners() {
        // Voice Orb
        this.voiceOrbEl.addEventListener('click', () => this.toggleVoiceInput());
        
        // Keyboard
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && document.activeElement !== this.userInputEl) {
                e.preventDefault();
                this.toggleVoiceInput();
            }
        });

        // Text Input
        this.sendButtonEl.addEventListener('click', () => this.sendMessage());
        this.userInputEl.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Settings
        this.settingsBtn.addEventListener('click', () => this.openSettings());
        this.saveKeyBtn.addEventListener('click', () => this.saveAPIKey());
        this.cancelKeyBtn.addEventListener('click', () => this.closeSettings());
    }

    toggleVoiceInput() {
        if (this.isProcessing) return;
        
        this.setOrbState('listening');
        this.voiceService.startListening(
            (transcript) => {
                console.log('📝 Transcript:', transcript);
                if (transcript) {
                    this.userInputEl.value = transcript;
                    this.sendMessage();
                }
            },
            (error) => {
                console.error('Voice error:', error);
                this.setOrbState('idle');
            }
        );
    }

    async sendMessage() {
        const text = this.userInputEl.value.trim();
        if (!text || this.isProcessing) return;

        this.isProcessing = true;
        this.userInputEl.value = '';
        this.setOrbState('thinking');

        try {
            // Add user message
            this.memory.addMessage('user', text);
            this.addChatBubble('user', text);

            // Get response from agent
            const response = await this.agent.run(
                text,
                this.memory.getConversationHistory()
            );

            // Add assistant message
            this.memory.addMessage('assistant', response);
            this.addChatBubble('assistant', response);

            // Speak response
            this.setOrbState('speaking');
            this.voiceService.speak(response, () => {
                this.setOrbState('idle');
            });

        } catch (error) {
            console.error('Error:', error);
            const errorMsg = 'I encountered an error. Please check your API key and try again.';
            this.addChatBubble('assistant', errorMsg);
            this.setOrbState('idle');
        } finally {
            this.isProcessing = false;
        }
    }

    addChatBubble(role, text) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}`;

        const bubbleDiv = document.createElement('div');
        bubbleDiv.className = 'message-bubble';
        bubbleDiv.textContent = text;

        const timeDiv = document.createElement('div');
        timeDiv.className = 'message-time';
        timeDiv.textContent = new Date().toLocaleTimeString();

        messageDiv.appendChild(bubbleDiv);
        messageDiv.appendChild(timeDiv);
        this.chatMessagesEl.appendChild(messageDiv);
        this.chatMessagesEl.scrollTop = this.chatMessagesEl.scrollHeight;
    }

    setOrbState(state) {
        this.voiceOrbEl.classList.remove('listening', 'thinking', 'speaking');
        
        let emoji = '🎙️';
        if (state === 'listening') {
            emoji = '🔊';
            this.voiceOrbEl.classList.add('listening');
        } else if (state === 'thinking') {
            emoji = '⚙️';
            this.voiceOrbEl.classList.add('thinking');
        } else if (state === 'speaking') {
            emoji = '🗣️';
            this.voiceOrbEl.classList.add('speaking');
        }
        
        this.voiceOrbEl.textContent = emoji;
    }

    loadAPIKey() {
        const key = this.geminiService.getApiKey();
        if (key) {
            this.statusIndicator.classList.add('connected');
            this.statusIndicator.innerHTML = '<div class="status-dot"></div>Ready';
        } else {
            this.statusIndicator.innerHTML = '<div class="status-dot"></div>No API Key';
        }
    }

    openSettings() {
        const currentKey = this.geminiService.getApiKey();
        this.apiKeyInput.value = currentKey || '';
        this.settingsModal.classList.add('show');
    }

    closeSettings() {
        this.settingsModal.classList.remove('show');
    }

    saveAPIKey() {
        const key = this.apiKeyInput.value.trim();
        if (!key) {
            alert('Please enter a valid API key');
            return;
        }
        this.geminiService.setApiKey(key);
        this.loadAPIKey();
        this.closeSettings();
        alert('✅ API Key saved successfully!');
    }

    checkConnection() {
        setInterval(() => {
            const hasKey = !!this.geminiService.getApiKey();
            if (hasKey) {
                this.statusIndicator.classList.add('connected');
            }
        }, 5000);
    }
}

window.friday = new FRIDAY();