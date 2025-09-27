import chalk from 'chalk';
import type { AIProvider, AIConfig } from './ai-providers/types';
import { OpenAIService } from './ai-providers/OpenAIService';
import { GeminiService } from './ai-providers/GeminiService';
import { existsSync, readFileSync } from 'node:fs';
import { PM2X_CONFIG } from '../utils/constants';

export type AIProviderType = 'openai' | 'gemini';

export interface UserPreferences {
  autoExecute: boolean;
  verbosity: 'concise' | 'detailed' | 'verbose';
  confirmationLevel: 'none' | 'destructive' | 'all';
}

export class AIProviderFactory {
  private static instance: AIProviderFactory | null = null;
  private providers: Map<AIProviderType, AIProvider> = new Map();
  private currentProvider: AIProviderType | null = null;
  private configFile = PM2X_CONFIG.CONFIG_FILE;
  private userPreferences: UserPreferences;

  private constructor() {
    this.userPreferences = this.loadUserPreferences();
    this.initializeProviders();
    this.selectProvider();
  }

  static getInstance(): AIProviderFactory {
    if (!AIProviderFactory.instance) {
      AIProviderFactory.instance = new AIProviderFactory();
    }
    return AIProviderFactory.instance;
  }

  private loadUserPreferences(): UserPreferences {
    const defaultPreferences: UserPreferences = {
      autoExecute: true, // Default to auto mode for efficiency
      verbosity: 'detailed',
      confirmationLevel: 'destructive'
    };

    try {
      if (existsSync(this.configFile)) {
        const configData = readFileSync(this.configFile, 'utf-8');
        const parsed = JSON.parse(configData) as unknown;
        
        if (typeof parsed === 'object' && parsed !== null) {
          const config = parsed as Record<string, unknown>;
          
          if (typeof config.userPreferences === 'object' && config.userPreferences !== null) {
            const prefs = config.userPreferences as Record<string, unknown>;
            return {
              autoExecute: typeof prefs.autoExecute === 'boolean' ? prefs.autoExecute : defaultPreferences.autoExecute,
              verbosity: this.isValidVerbosity(prefs.verbosity) ? prefs.verbosity : defaultPreferences.verbosity,
              confirmationLevel: this.isValidConfirmationLevel(prefs.confirmationLevel) ? prefs.confirmationLevel : defaultPreferences.confirmationLevel
            };
          }
        }
      }
    } catch {
      // Config file doesn't exist or is invalid, use defaults
    }

    return defaultPreferences;
  }

  private isValidVerbosity(value: unknown): value is UserPreferences['verbosity'] {
    return typeof value === 'string' && ['concise', 'detailed', 'verbose'].includes(value);
  }

  private isValidConfirmationLevel(value: unknown): value is UserPreferences['confirmationLevel'] {
    return typeof value === 'string' && ['none', 'destructive', 'all'].includes(value);
  }

  private async saveUserPreferences(): Promise<void> {
    try {
      let config: Record<string, unknown> = {};
      
      // Load existing config
      if (existsSync(this.configFile)) {
        const existingContent = readFileSync(this.configFile, 'utf-8');
        const parsed = JSON.parse(existingContent) as unknown;
        if (typeof parsed === 'object' && parsed !== null) {
          config = parsed as Record<string, unknown>;
        }
      }
      
      // Update user preferences
      config.userPreferences = this.userPreferences;
      
      const fs = await import('fs/promises');
      await fs.writeFile(this.configFile, JSON.stringify(config, null, 2));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Failed to save user preferences: ${message}`));
    }
  }

  private initializeProviders(): void {
    // Initialize available providers
    this.providers.set('openai', new OpenAIService());
    this.providers.set('gemini', new GeminiService());
  }

  private selectProvider(): void {
    // 1. Check environment variable for explicit provider selection (highest priority)
    const envProvider = process.env.AI_PROVIDER?.toLowerCase() as AIProviderType;
    if (envProvider && this.providers.has(envProvider)) {
      const provider = this.providers.get(envProvider)!;
      if (provider.isConfigured()) {
        this.currentProvider = envProvider;
        // Save this preference if not already saved
        void this.saveProviderPreference(envProvider);
        return;
      }
    }

    // 2. Check config file for saved preference (second priority)
    try {
      if (existsSync(this.configFile)) {
        const parsed = JSON.parse(readFileSync(this.configFile, 'utf-8')) as unknown;
        const config = (typeof parsed === 'object' && parsed !== null)
          ? parsed as Record<string, unknown>
          : {};
        const savedProvider = typeof config.provider === 'string' ? config.provider as AIProviderType : null;
        if (savedProvider && this.providers.has(savedProvider)) {
          const provider = this.providers.get(savedProvider)!;
          if (provider.isConfigured()) {
            this.currentProvider = savedProvider;
            return;
          }
          // Saved provider exists but not configured, try to fall back to another
        }
      }
    } catch {
      // Config file doesn't exist or is invalid
    }

    // 3. Auto-detect based on which provider has API key configured
    // Check OpenAI first for backward compatibility
    if (this.providers.get('openai')!.isConfigured()) {
      this.currentProvider = 'openai';
      // Don't save auto-detected preference during initialization
      // Let the user explicitly choose to save
      return;
    }

    if (this.providers.get('gemini')!.isConfigured()) {
      this.currentProvider = 'gemini';
      // Don't save auto-detected preference during initialization
      // Let the user explicitly choose to save
      return;
    }

    // No provider configured
    this.currentProvider = null;
  }

  getProvider(): AIProvider | null {
    if (!this.currentProvider) {
      return null;
    }
    return this.providers.get(this.currentProvider) || null;
  }

  async executeQuery(prompt: string, context?: string): Promise<{ success: boolean; response?: string; error?: string }> {
    if (!this.currentProvider) {
      return {
        success: false,
        error: 'No AI provider configured. Please set up OpenAI or Gemini first.'
      };
    }

    const provider = this.providers.get(this.currentProvider);
    if (!provider || !provider.isConfigured()) {
      return {
        success: false,
        error: `${this.currentProvider} provider is not properly configured.`
      };
    }

    try {
      const response = await provider.query(prompt, context);
      return { success: true, response };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }

  getCurrentProviderType(): AIProviderType | null {
    return this.currentProvider;
  }

  getCurrentModelInfo(): { model?: string; preset?: string } | null {
    const provider = this.getProvider();
    if (!provider || !this.currentProvider) {
      return null;
    }

    try {
      // Access the provider's config (works for both OpenAI and Gemini)
      const config = (provider as any).config;
      if (config) {
        return {
          model: config.model,
          preset: config.activePreset
        };
      }
    } catch {
      // Fallback if we can't access the config
    }

    return null;
  }

  setProvider(type: AIProviderType): boolean {
    if (!this.providers.has(type)) {
      console.log(chalk.red(`Unknown provider: ${type}`));
      return false;
    }

    const provider = this.providers.get(type)!;
    if (!provider.isConfigured()) {
      console.log(chalk.yellow(`Provider ${type} is not configured. Please set the API key first.`));
      return false;
    }

    this.currentProvider = type;
    void this.saveProviderPreference(type);
    
    // Note: Provider configuration persistence is handled in the constructor
    // of each provider service when it detects it has an API key
    
    console.log(chalk.green(`✓ Switched to ${type} provider`));
    return true;
  }

  private async saveProviderPreference(type: AIProviderType): Promise<void> {
    try {
      let config: Record<string, unknown> = {};
      
      // Load existing config
      if (existsSync(this.configFile)) {
        const existingContent = readFileSync(this.configFile, 'utf-8');
        const parsed = JSON.parse(existingContent) as unknown;
        if (typeof parsed === 'object' && parsed !== null) {
          config = parsed as Record<string, unknown>;
        }
      }
      
      // Update provider preference
      config.provider = type;
      
      const fs = await import('fs/promises');
      await fs.writeFile(this.configFile, JSON.stringify(config, null, 2));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Failed to save provider preference: ${message}`));
    }
  }

  isConfigured(): boolean {
    return this.currentProvider !== null && this.getProvider()?.isConfigured() === true;
  }

  getConfigInfo(): string {
    if (!this.currentProvider) {
      return chalk.yellow(`No AI provider configured. Available providers:
  
  ${chalk.cyan('OpenAI')}: Set OPENAI_API_KEY environment variable
  ${chalk.cyan('Gemini')}: Set GEMINI_API_KEY environment variable
  
Or use: ${chalk.green('/ai setup <provider> <api-key>')}`);
    }

    const provider = this.getProvider();
    if (!provider) {
      return chalk.red('Error: Provider not available');
    }

    return `${chalk.green(`Current Provider: ${this.currentProvider.toUpperCase()}`)}
${provider.getConfigInfo ? provider.getConfigInfo() : 'No configuration info available'}

${chalk.gray('Switch provider with: /ai provider <openai|gemini>')}`;
  }

  async saveProviderConfig(type: AIProviderType, config: Partial<AIConfig>): Promise<void> {
    const provider = this.providers.get(type);
    if (!provider) {
      throw new Error(`Unknown provider: ${type}`);
    }

    if (provider.saveConfig) {
      await provider.saveConfig(config);
    }

    // Re-select provider after configuration
    this.selectProvider();
  }

  listProviders(): { name: string; configured: boolean; active: boolean }[] {
    const result: { name: string; configured: boolean; active: boolean }[] = [];
    
    for (const [name, provider] of this.providers) {
      result.push({
        name,
        configured: provider.isConfigured(),
        active: name === this.currentProvider
      });
    }

    return result;
  }

  // User Preferences Management
  isAutoExecuteEnabled(): boolean {
    return this.userPreferences.autoExecute;
  }

  async toggleAutoExecute(): Promise<boolean> {
    this.userPreferences.autoExecute = !this.userPreferences.autoExecute;
    await this.saveUserPreferences();
    
    const modeText = this.userPreferences.autoExecute ? 'auto-execute' : 'ask first';
    console.log(chalk.green(`✓ Switched to ${modeText} mode`));
    
    return this.userPreferences.autoExecute;
  }

  getUserPreferences(): UserPreferences {
    return { ...this.userPreferences };
  }

  async setUserPreferences(preferences: Partial<UserPreferences>): Promise<void> {
    this.userPreferences = { ...this.userPreferences, ...preferences };
    await this.saveUserPreferences();
  }

  async setVerbosity(verbosity: UserPreferences['verbosity']): Promise<void> {
    await this.setUserPreferences({ verbosity });
    console.log(chalk.green(`✓ Verbosity set to ${verbosity}`));
  }

  async setConfirmationLevel(level: UserPreferences['confirmationLevel']): Promise<void> {
    await this.setUserPreferences({ confirmationLevel: level });
    console.log(chalk.green(`✓ Confirmation level set to ${level}`));
  }

  getFullConfigInfo(): string {
    const providerInfo = this.getConfigInfo();
    
    const mode = this.userPreferences.autoExecute ? 'Auto-execute' : 'Ask first';
    const modeColor = this.userPreferences.autoExecute ? chalk.green : chalk.yellow;
    
    const userPrefsInfo = `${chalk.blue.bold('User Preferences:')}
  Mode: ${modeColor(mode)}
  Verbosity: ${chalk.cyan(this.userPreferences.verbosity)}
  Confirmation: ${chalk.cyan(this.userPreferences.confirmationLevel)}
  
${chalk.gray('Use Shift+Tab to toggle auto-execute mode')}
${chalk.gray('Config saved to:')} ${chalk.dim(this.configFile)}`;

    return `${providerInfo}\n\n${userPrefsInfo}`;
  }
}
