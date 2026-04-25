export class GeminiService {
    constructor() {
        this.model = 'gemini-1.5-flash';
        this.apiEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
    }

    getApiKey() {
        return localStorage.getItem('gemini_api_key');
    }

    setApiKey(key) {
        localStorage.setItem('gemini_api_key', key);
    }

    async generateContent(userInput, conversationHistory, systemPrompt, tools) {
        const apiKey = this.getApiKey();
        
        if (!apiKey) {
            throw new Error('Gemini API key not configured. Please set it in settings.');
        }

        try {
            // Build messages array
            const messages = [
                {
                    role: 'user',
                    parts: [{
                        text: systemPrompt + '\n\nUser: ' + userInput
                    }]
                }
            ];

            // Add conversation history if available
            if (conversationHistory && conversationHistory.length > 0) {
                messages.unshift({
                    role: 'user',
                    parts: [{
                        text: 'Previous conversation context:\n' + 
                              conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n')
                    }]
                });
            }

            // Build request payload
            const payload = {
                contents: messages,
                tools: {
                    functionDeclarations: tools
                }
            };

            console.log('📤 Sending request to Gemini API...');

            // Make API call
            const response = await fetch(this.apiEndpoint + `?key=${apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Gemini API error: ${errorData.error?.message || response.statusText}`);
            }

            const data = await response.json();
            console.log('📥 Received response from Gemini API');

            return this.parseResponse(data);

        } catch (error) {
            console.error('❌ Gemini API error:', error);
            throw error;
        }
    }

    parseResponse(data) {
        if (!data.candidates || data.candidates.length === 0) {
            throw new Error('No response from Gemini API');
        }

        const candidate = data.candidates[0];
        const content = candidate.content;

        if (!content || !content.parts) {
            throw new Error('Invalid response format from Gemini API');
        }

        let toolCalls = [];
        let text = '';

        // Parse response parts
        for (const part of content.parts) {
            if (part.text) {
                text += part.text;
            } else if (part.functionCall) {
                toolCalls.push({
                    name: part.functionCall.name,
                    args: part.functionCall.args
                });
            }
        }

        return {
            text,
            toolCalls
        };
    }
}