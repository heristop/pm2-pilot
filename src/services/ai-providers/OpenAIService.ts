import OpenAI from 'openai';
import chalk from 'chalk';
import { readFileSync, existsSync } from 'node:fs';
import { PM2X_CONFIG } from '../../utils/constants';
import type { AIProvider, AIConfig, ConversationMessage } from './types';
import { SHARED_SYSTEM_PROMPT } from './types';
import { Loader } from '../../utils/Loader';
import { createConfigManager, type ConfigFileManager } from '../../utils/ConfigFileManager';

export interface ModelPreset {
  name: string;
  model: string;
  description: string;
  speed: 'fastest' | 'fast' | 'balanced' | 'slow';
  quality: 'basic' | 'good' | 'high' | 'best';
  useCase: string;
}

export class OpenAIService implements AIProvider {
  private client: OpenAI | null = null;
  private config: AIConfig;
  private configFile = PM2X_CONFIG.CONFIG_FILE;
  private configManager: ConfigFileManager;

  // Model presets for different speed/quality tradeoffs
  private static readonly MODEL_PRESETS: ModelPreset[] = [
    {
      name: 'lightning',
      model: 'gpt-5-nano',
      description: 'Fastest reasoning model, ultra-low cost',
      speed: 'fastest',
      quality: 'good',
      useCase: 'Quick questions, simple process management'
    },
    {
      name: 'smart',
      model: 'gpt-4.1',
      description: 'Latest GPT-4.1 model, excellent performance',
      speed: 'balanced',
      quality: 'best',
      useCase: 'Complex analysis, detailed explanations'
    },
    {
      name: 'reasoning',
      model: 'gpt-5-mini',
      description: 'Mid-tier reasoning model, good balance',
      speed: 'slow',
      quality: 'best',
      useCase: 'Complex troubleshooting, optimization advice'
    },
    {
      name: 'advanced',
      model: 'gpt-5',
      description: 'Full reasoning model, highest intelligence',
      speed: 'slow',
      quality: 'best',
      useCase: 'Most complex tasks, advanced reasoning'
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
            // Check if openai section exists with API key
            if (!config.openai || typeof config.openai !== 'object' || 
                !(config.openai as Record<string, unknown>).apiKey) {
              // OpenAI config missing or incomplete, save it
              await this.saveConfig({});
            }
          }
        } else {
          // Config file doesn't exist, create it with OpenAI config
          await this.saveConfig({});
        }
      } catch {
        // If there's any error reading config, save our current config
        await this.saveConfig({});
      }
    }
  }

  private loadConfig(): AIConfig {
    // Default configuration - using gpt-4.1 for best performance
    const defaultConfig: AIConfig = {
      model: 'gpt-4.1',
      temperature: 0.7,
      maxTokens: 1000,
      activePreset: 'smart'
    };

    // Try to load from config file first
    let fileConfig: AIConfig = {};
    try {
      const configPath = this.configFile;
      if (existsSync(configPath)) {
        const parsed = JSON.parse(readFileSync(configPath, 'utf-8')) as unknown;
        if (typeof parsed === 'object' && parsed !== null && 'openai' in parsed) {
          const { openai } = parsed as Record<string, unknown>;
          if (typeof openai === 'object' && openai !== null) {
            fileConfig = openai as AIConfig;
          }
        }
      }
    } catch {
      // Config file doesn't exist or is invalid
      fileConfig = {};
    }

    // Check environment variable
    const apiKey = process.env.OPENAI_API_KEY || fileConfig.apiKey;

    return {
      ...defaultConfig,
      ...fileConfig,
      apiKey
    };
  }

  private initializeClient(): void {
    if (this.config.apiKey) {
      this.client = new OpenAI({
        apiKey: this.config.apiKey
      });
    }
  }

  private isReasoningModel(model?: string): boolean {
    const modelName = model || this.config.model || 'gpt-4.1';
    // Reasoning models that require max_completion_tokens instead of max_tokens
    const reasoningModels = [
      'gpt-5', 'gpt-5-mini', 'gpt-5-nano',
      'o1', 'o1-mini', 'o1-preview',
      'o3', 'o3-mini'
    ];
    
    return reasoningModels.some(reasoningModel => 
      modelName.toLowerCase().includes(reasoningModel.toLowerCase())
    );
  }

  async query(prompt: string, context?: string): Promise<string> {
    return this.queryWithHistory(prompt, [], context);
  }

  async queryWithHistory(prompt: string, history: ConversationMessage[], context?: string): Promise<string> {
    if (!this.client) {
      throw new Error('OpenAI API is not configured. Please set OPENAI_API_KEY environment variable.');
    }

    const loader = new Loader();
    loader.start({ message: 'Thinking...', context: 'query' });

    try {
      const userPrompt = context 
        ? `Context:\n${context}\n\nQuestion: ${prompt}`
        : prompt;

      const model = this.config.model || 'gpt-4.1';
      const isReasoning = this.isReasoningModel(model);
      // Reasoning models need more tokens due to internal reasoning process
      const baseTokenLimit = this.config.maxTokens || 1000;
      const tokenLimit = isReasoning ? Math.max(baseTokenLimit, 2000) : baseTokenLimit;

      // Build messages array with history
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: SHARED_SYSTEM_PROMPT }
      ];

      // Add conversation history (excluding system messages to avoid duplicates)
      history.forEach(msg => {
        if (msg.role !== 'system') {
          messages.push({ role: msg.role, content: msg.content });
        }
      });

      // Add current user prompt
      messages.push({ role: 'user', content: userPrompt });

      // Use model-aware parameter handling
      const baseParams = {
        model,
        messages
      };

      // Add temperature and token parameters based on model type
      const requestParams = isReasoning
        ? {
            ...baseParams,
            max_completion_tokens: tokenLimit
            // Note: reasoning models only support default temperature (1)
          }
        : {
            ...baseParams,
            temperature: this.config.temperature || 0.7,
            max_tokens: tokenLimit
          };

      const response = await this.client.chat.completions.create(requestParams);

      loader.stop();
      return response.choices[0]?.message?.content || 'No response from AI';
    } catch (error) {
      loader.stop();
      if (error instanceof Error) {
        if (error.message.includes('rate limit')) {
          throw new Error('Rate limit exceeded. Please try again later.');
        }
        if (error.message.includes('api key')) {
          throw new Error('Invalid API key. Please check your OpenAI API key.');
        }
        if (error.message.includes('model') && error.message.includes('does not exist')) {
          throw new Error(`Model "${this.config.model}" is not available. Try switching to a different model preset.`);
        }
        throw new Error(`OpenAI API error: ${error.message}`);
      }
      throw new Error('Unknown error occurred during AI query');
    }
  }

  isConfigured(): boolean {
    return !!this.config.apiKey;
  }

  getConfigInfo(): string {
    if (!this.isConfigured()) {
      return chalk.yellow('OpenAI not configured. Set OPENAI_API_KEY environment variable.');
    }

    const maskedKey = this.config.apiKey 
      ? `${this.config.apiKey.slice(0, 8)}...${this.config.apiKey.slice(-4)}` 
      : 'Not set';

    return `${chalk.green('OpenAI Configuration:')}
  Model: ${chalk.cyan(this.config.model || 'gpt-4.1')}
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
        // Update openai section
        fullConfig.openai = {
          apiKey: this.config.apiKey,
          model: this.config.model || 'gpt-4.1',
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
    return OpenAIService.MODEL_PRESETS;
  }

  getPresetByName(name: string): ModelPreset | undefined {
    return OpenAIService.MODEL_PRESETS.find(preset => preset.name.toLowerCase() === name.toLowerCase());
  }

  async applyPreset(presetName: string): Promise<boolean> {
    const preset = this.getPresetByName(presetName);
    if (!preset) {
      console.log(chalk.red(`❌ Unknown preset: ${presetName}`));
      console.log(chalk.gray('Available presets: ' + OpenAIService.MODEL_PRESETS.map(p => p.name).join(', ')));
      return false;
    }

    await this.saveConfig({ model: preset.model, activePreset: preset.name });
    console.log(chalk.green(`✅ Applied "${preset.name}" preset`));
    console.log(chalk.gray(`Model: ${preset.model} - ${preset.description}`));
    return true;
  }

  getPresetsInfo(): string {
    const currentModel = this.config.model || 'gpt-4.1';
    const activePresetName = this.config.activePreset;
    
    let info = chalk.blue.bold('\n🚀 Available Speed Presets:\n\n');
    
    OpenAIService.MODEL_PRESETS.forEach(preset => {
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
      const modelPreset = OpenAIService.MODEL_PRESETS.find(p => p.model === currentModel);
      if (modelPreset) {
        info += chalk.yellow(`Currently using: ${modelPreset.name} preset (${currentModel})`);
      } else {
        info += chalk.yellow(`Currently using: Custom model (${currentModel})`);
      }
    }
    
    return info;
  }
}
