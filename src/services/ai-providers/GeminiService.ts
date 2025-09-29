import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';
import chalk from 'chalk';
import { readFileSync, existsSync } from 'node:fs';
import { PM2X_CONFIG } from '../../utils/constants';
import type { AIProvider, AIConfig, ConversationMessage } from './types';
import { SHARED_SYSTEM_PROMPT } from './types';
import { Loader } from '../../utils/Loader';
import type { ModelPreset } from './OpenAIService';
import { createConfigManager, type ConfigFileManager } from '../../utils/ConfigFileManager';

export class GeminiService implements AIProvider {
  private client: GoogleGenerativeAI | null = null;
  private config: AIConfig;
  private configFile = PM2X_CONFIG.CONFIG_FILE;
  private configManager: ConfigFileManager;

  // Model presets for different speed/quality tradeoffs
  private static readonly MODEL_PRESETS: ModelPreset[] = [
    {
      name: 'lightning',
      model: 'gemini-2.5-flash-lite',
      description: 'Fastest, most cost-efficient',
      speed: 'fastest',
      quality: 'good',
      useCase: 'Quick questions, high-volume tasks'
    },
    {
      name: 'smart',
      model: 'gemini-2.5-pro',
      description: 'Highest intelligence, complex reasoning',
      speed: 'balanced',
      quality: 'best',
      useCase: 'Complex analysis, detailed explanations'
    },
    {
      name: 'reasoning',
      model: 'gemini-2.5-pro',
      description: 'Deep thinking for complex problems',
      speed: 'slow',
      quality: 'best',
      useCase: 'Complex troubleshooting, optimization advice'
    }
  ];

  constructor() {
    this.configManager = createConfigManager(this.configFile);
    this.config = this.loadConfig();
    this.initializeClient();
    // Save config if we have an API key but no saved config yet
    void this.ensureConfigPersisted();
  }

  private async ensureConfigPersisted(): Promise<void> {
    // Only save if we have an API key and it's not already in the config file
    if (this.config.apiKey) {
      try {
        const configPath = this.configFile;
        if (existsSync(configPath)) {
          const parsed = JSON.parse(readFileSync(configPath, 'utf-8')) as unknown;
          if (typeof parsed === 'object' && parsed !== null) {
            const config = parsed as Record<string, unknown>;
            // Check if gemini section exists with API key
            if (!config.gemini || typeof config.gemini !== 'object' || 
                !(config.gemini as Record<string, unknown>).apiKey) {
              // Gemini config missing or incomplete, save it
              await this.saveConfig({});
            }
          }
        } else {
          // Config file doesn't exist, create it with Gemini config
          await this.saveConfig({});
        }
      } catch {
        // If there's any error reading config, save our current config
        await this.saveConfig({});
      }
    }
  }

  private loadConfig(): AIConfig {
    // Default configuration
    const defaultConfig: AIConfig = {
      model: 'gemini-2.5-flash-lite',
      temperature: 0.7,
      maxTokens: 1000
    };

    // Try to load from config file first
    let fileConfig: AIConfig = {};
    try {
      const configPath = this.configFile;
      if (existsSync(configPath)) {
        const parsed = JSON.parse(readFileSync(configPath, 'utf-8')) as unknown;
        if (typeof parsed === 'object' && parsed !== null && 'gemini' in parsed) {
          const { gemini } = parsed as Record<string, unknown>;
          if (typeof gemini === 'object' && gemini !== null) {
            fileConfig = gemini as AIConfig;
          }
        }
      }
    } catch {
      // Config file doesn't exist or is invalid
      fileConfig = {};
    }

    // Check environment variable
    const apiKey = process.env.GEMINI_API_KEY || fileConfig.apiKey;

    return {
      ...defaultConfig,
      ...fileConfig,
      apiKey
    };
  }

  private initializeClient(): void {
    if (this.config.apiKey) {
      this.client = new GoogleGenerativeAI(this.config.apiKey);
    }
  }

  async query(prompt: string, context?: string): Promise<string> {
    return this.queryWithHistory(prompt, [], context);
  }

  async queryWithHistory(prompt: string, history: ConversationMessage[], context?: string): Promise<string> {
    if (!this.client) {
      throw new Error('Gemini API is not configured. Please set GEMINI_API_KEY environment variable.');
    }

    const loader = new Loader();
    loader.start({ message: 'Thinking...', context: 'query' });

    try {
      const model = this.client.getGenerativeModel({ 
        model: this.config.model || 'gemini-2.5-flash',
        generationConfig: {
          temperature: this.config.temperature || 0.7,
          maxOutputTokens: this.config.maxTokens || 1000,
        },
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
          },
          {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
          },
        ],
        systemInstruction: SHARED_SYSTEM_PROMPT,
      });

      const userPrompt = context 
        ? `Context:\n${context}\n\nQuestion: ${prompt}` 
        : prompt;

      // Convert conversation history to Gemini chat format
      const chatHistory = history
        .filter(msg => msg.role !== 'system') // System instruction is handled separately
        .map(msg => ({
          role: msg.role === 'assistant' ? 'model' as const : 'user' as const,
          parts: [{ text: msg.content }],
        }));

      // Start chat session with history
      const chat = model.startChat({
        history: chatHistory,
      });

      // Send current message
      const result = await chat.sendMessage(userPrompt);
      const response = result.response;
      const text = response.text();

      loader.stop();
      return text;
    } catch (error) {
      loader.stop();
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Gemini API error: ${message}`);
    }
  }

  isConfigured(): boolean {
    return !!this.config.apiKey;
  }

  getConfigInfo(): string {
    if (!this.isConfigured()) {
      return chalk.yellow('Gemini AI not configured. Set GEMINI_API_KEY environment variable.');
    }

    const maskedKey = this.config.apiKey 
      ? `${this.config.apiKey.slice(0, 8)}...${this.config.apiKey.slice(-4)}` 
      : 'Not set';

    return `${chalk.green('Gemini AI Configuration:')}
  Model: ${chalk.cyan(this.config.model || 'gemini-2.5-flash')}
  API Key: ${chalk.gray(maskedKey)}
  Temperature: ${chalk.cyan(this.config.temperature || 0.7)}
  Max Tokens: ${chalk.cyan(this.config.maxTokens || 1000)}`;
  }

  async saveConfig(config: Partial<AIConfig>): Promise<void> {
    this.config = { ...this.config, ...config };
    
    // Re-initialize client with new API key if provided
    if (config.apiKey) {
      this.initializeClient();
    }

    // Save to config file using safe config manager
    try {
      await this.configManager.updateConfig<Record<string, unknown>>((fullConfig) => {
        // Update gemini section
        fullConfig.gemini = {
          apiKey: this.config.apiKey,
          model: this.config.model || 'gemini-2.5-flash',
          temperature: this.config.temperature || 0.7,
          maxTokens: this.config.maxTokens || 1000,
          activePreset: this.config.activePreset
        };
        
        return fullConfig;
      });
      
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Failed to save configuration: ${message}`));
    }
  }

  getModelPresets(): ModelPreset[] {
    return GeminiService.MODEL_PRESETS;
  }

  getPresetByName(name: string): ModelPreset | undefined {
    return GeminiService.MODEL_PRESETS.find(preset => preset.name.toLowerCase() === name.toLowerCase());
  }

  async applyPreset(presetName: string): Promise<boolean> {
    const preset = this.getPresetByName(presetName);
    if (!preset) {
      console.log(chalk.red(`❌ Unknown preset: ${presetName}`));
      console.log(chalk.gray('Available presets: ' + GeminiService.MODEL_PRESETS.map(p => p.name).join(', ')));
      return false;
    }

    await this.saveConfig({ model: preset.model, activePreset: preset.name });
    console.log(chalk.green(`✅ Applied "${preset.name}" preset`));
    console.log(chalk.gray(`Model: ${preset.model} - ${preset.description}`));
    return true;
  }

  getPresetsInfo(): string {
    const currentModel = this.config.model || 'gemini-2.5-flash';
    const activePresetName = this.config.activePreset;
    
    let info = chalk.blue.bold('\n🚀 Available Gemini Speed Presets:\n\n');
    
    GeminiService.MODEL_PRESETS.forEach(preset => {
      // Use activePreset if available, otherwise fall back to model matching
      const isActive = activePresetName ? preset.name === activePresetName : preset.model === currentModel;
      const icon = isActive ? '👉' : '  ';
      const nameColor = isActive ? chalk.cyan.bold : chalk.white;
      
      const speedIcon = preset.speed === 'fastest' ? '⚡⚡⚡' : 
                       preset.speed === 'fast' ? '⚡⚡' :
                       preset.speed === 'balanced' ? '⚡' : '🧠';
      
      info += `${icon} ${nameColor(preset.name.padEnd(10))} ${speedIcon} ${chalk.gray(preset.description)}\n`;
      info += `     ${chalk.dim(`Model: ${preset.model} • ${preset.useCase}`)}\n\n`;
    });
    
    // Show current status
    if (activePresetName) {
      const activePreset = this.getPresetByName(activePresetName);
      info += chalk.green(`Currently using: ${activePresetName} (${activePreset?.model || currentModel})`);
    } else {
      const modelPreset = GeminiService.MODEL_PRESETS.find(p => p.model === currentModel);
      if (modelPreset) {
        info += chalk.yellow(`Currently using: ${modelPreset.name} preset (${currentModel})`);
      } else {
        info += chalk.yellow(`Currently using: Custom model (${currentModel})`);
      }
    }
    
    return info;
  }
}
