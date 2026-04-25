import { toolRegistry } from './services/toolRegistry.js';
import { buildSystemPrompt } from './persona.js';

export class Agent {
    constructor(geminiService, memory) {
        this.geminiService = geminiService;
        this.memory = memory;
        this.maxIterations = 5;
        this.iteration = 0;
    }

    async run(userInput, conversationHistory) {
        this.iteration = 0;
        let response = '';

        while (this.iteration < this.maxIterations) {
            this.iteration++;
            
            console.log(`🔄 Agent iteration ${this.iteration}/${this.maxIterations}`);

            try {
                // Build prompt
                const systemPrompt = buildSystemPrompt(this.memory);
                
                // Get available tools
                const tools = this.getAvailableTools();

                // Call Gemini
                const result = await this.geminiService.generateContent(
                    userInput,
                    conversationHistory,
                    systemPrompt,
                    tools
                );

                // Check if tool calling or final response
                if (result.toolCalls && result.toolCalls.length > 0) {
                    console.log(`🔧 Executing ${result.toolCalls.length} tool(s)...`);
                    
                    for (const toolCall of result.toolCalls) {
                        await this.executeTool(toolCall);
                    }
                    
                    // Continue loop for next iteration
                    continue;
                } else if (result.text) {
                    response = result.text;
                    console.log('✅ Final response generated');
                    break;
                }

            } catch (error) {
                console.error(`❌ Agent error at iteration ${this.iteration}:`, error);
                throw error;
            }
        }

        if (!response) {
            response = "I apologize, but I wasn't able to generate a response. Please try again.";
        }

        return response;
    }

    getAvailableTools() {
        return toolRegistry.getToolDefinitions();
    }

    async executeTool(toolCall) {
        try {
            const result = await toolRegistry.executeTool(
                toolCall.name,
                toolCall.args
            );
            console.log(`✅ Tool ${toolCall.name} executed:`, result);
            return result;
        } catch (error) {
            console.error(`❌ Tool execution error (${toolCall.name}):`, error);
            return { error: error.message };
        }
    }
}