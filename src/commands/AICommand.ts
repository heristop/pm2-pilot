import 'reflect-metadata';
import { injectable, inject } from 'tsyringe';
import chalk from 'chalk';
import { BaseCommand } from './BaseCommand';
import { AIProviderFactory, type AIProviderType } from '../services/AIProviderFactory';
import { ContextBuilder } from '../services/ContextBuilder';
import type { AIProvider } from '../services/ai-providers/types';
import type { IShell } from '../interfaces/IShell';

interface PresetProvider extends AIProvider {
  getPresetsInfo(): string;
  applyPreset(presetName: string): Promise<boolean>;
}

function isPresetProvider(provider: AIProvider): provider is PresetProvider {
  return 'getPresetsInfo' in provider && 'applyPreset' in provider;
}

@injectable()
export class AICommand extends BaseCommand {
  public readonly name = 'ai';
  public readonly description = 'Ask AI assistant about PM2 processes';
  public readonly aliases = ['ask'];
  
  private aiProviderFactory: AIProviderFactory;
  private contextBuilder: ContextBuilder;

  constructor(
    @inject('IShell') private shell: IShell,
    @inject('AIProviderFactory') private aiProviderFactory: AIProviderFactory,
    @inject('ContextBuilder') private contextBuilder: ContextBuilder
  ) {
    super();
  }

  public async execute(args: string[]): Promise<void> {
    if (args.length === 0) {
      this.showHelp();
      return;
    }

    const subcommand = args[0];
    const subArgs = args.slice(1);

    switch (subcommand) {
      case 'config':
        this.showConfig();
        break;
      case 'setup':
        await this.setupConfig(subArgs);
        break;
      case 'provider':
        this.handleProvider(subArgs);
        break;
      case 'providers':
      case 'list':
        this.listProviders();
        break;
      case 'presets':
        this.showPresets();
        break;
      case 'preset':
        await this.handlePreset(subArgs);
        break;
      default:
        // Treat as a query
        const query = args.join(' ');
        await this.handleQuery(query);
        break;
    }
  }

  private showHelp(): void {
    console.log(chalk.blue.bold('\n🤖 AI Assistant Commands:\n'));
    console.log(chalk.cyan('  /ai <question>') + ' - Ask AI about your processes');
    console.log(chalk.cyan('  /ai config') + ' - Show AI configuration');
    console.log(chalk.cyan('  /ai setup <provider> <api-key>') + ' - Set API key for provider');
    console.log(chalk.cyan('  /ai provider <openai|gemini>') + ' - Switch AI provider');
    console.log(chalk.cyan('  /ai providers') + ' - List available providers');
    console.log(chalk.cyan('  /ai presets') + ' - Show speed/quality presets');
    console.log(chalk.cyan('  /ai preset <name>') + ' - Apply speed preset (lightning, fast, smart, reasoning)');
    console.log();
    console.log(chalk.gray('Examples:'));
    console.log(chalk.gray('  /ai why is my-app using so much memory?'));
    console.log(chalk.gray('  /ai setup openai sk-...'));
    console.log(chalk.gray('  /ai preset lightning      # GPT-5 nano - Ultra fast'));
    console.log(chalk.gray('  /ai preset smart          # GPT-5 full - Highest intelligence'));
    console.log();
    console.log(chalk.yellow('Note: Requires API key for OpenAI or Gemini'));
  }

  private async handleQuery(query: string): Promise<void> {
    const aiService = this.aiProviderFactory.getProvider();
    
    if (!aiService || !aiService.isConfigured()) {
      console.log(chalk.red('❌ AI service not configured'));
      console.log(chalk.gray('Set your API key:'));
      console.log(chalk.gray('  • OpenAI: /ai setup openai your-key'));
      console.log(chalk.gray('  • Gemini: /ai setup gemini your-key'));
      console.log(chalk.gray('  • Or use environment variables: OPENAI_API_KEY, GEMINI_API_KEY'));
      return;
    }

    try {
      console.log(chalk.blue('🤖 AI Assistant is thinking...'));
      
      // Build context from current PM2 state
      const context = await this.contextBuilder.buildProcessContext();
      
      // Query the AI with context
      const response = await aiService.query(query, context);
      
      // Display the response
      console.log(chalk.blue.bold('\n🤖 AI Analysis:\n'));
      this.formatAIResponse(response);
      console.log();
      
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`❌ AI query failed: ${message}`));
      
      if (message.includes('rate limit')) {
        console.log(chalk.yellow('💡 Try again in a few minutes'));
      } else if (message.includes('api key')) {
        console.log(chalk.yellow('💡 Check your OpenAI API key configuration'));
      }
    }
  }

  private formatAIResponse(response: string): void {
    // Split response into paragraphs and format nicely
    const paragraphs = response.split('\n\n');
    
    paragraphs.forEach(paragraph => {
      if (paragraph.trim().startsWith('•') || paragraph.trim().startsWith('-')) {
        // Format bullet points
        const lines = paragraph.split('\n');
        lines.forEach(line => {
          if (line.trim().startsWith('•') || line.trim().startsWith('-')) {
            console.log(chalk.yellow(`  ${line.trim()}`));
          } else {
            console.log(`  ${line}`);
          }
        });
      } else if (paragraph.includes(':')) {
        // Format headers/sections
        const lines = paragraph.split('\n');
        lines.forEach(line => {
          if (line.includes(':') && !line.startsWith(' ')) {
            console.log(chalk.cyan.bold(line));
          } else {
            console.log(line);
          }
        });
      } else {
        // Regular paragraph
        console.log(paragraph);
      }
      console.log(); // Empty line between paragraphs
    });
  }

  private showConfig(): void {
    const configInfo = this.aiProviderFactory.getConfigInfo();
    console.log(chalk.blue.bold('\n🔧 AI Configuration:\n'));
    console.log(configInfo);
  }

  private async setupConfig(args: string[]): Promise<void> {
    if (args.length < 2) {
      console.log(chalk.red('Usage: /ai setup <provider> <api-key>'));
      console.log(chalk.gray('Examples:'));
      console.log(chalk.gray('  /ai setup openai sk-...'));
      console.log(chalk.gray('  /ai setup gemini AI...'));
      return;
    }

    const provider = args[0]!.toLowerCase() as AIProviderType;
    const apiKey = args[1]!;
    
    if (provider !== 'openai' && provider !== 'gemini') {
      console.log(chalk.red('❌ Invalid provider. Use "openai" or "gemini"'));
      return;
    }
    
    try {
      await this.aiProviderFactory.saveProviderConfig(provider, { apiKey });
      
      // Auto-switch to the configured provider
      if (this.aiProviderFactory.setProvider(provider)) {
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`❌ Failed to save configuration: ${message}`));
    }
  }

  private handleProvider(args: string[]): void {
    if (args.length === 0) {
      console.log(chalk.red('Usage: /ai provider <openai|gemini>'));
      this.listProviders();
      return;
    }

    const provider = args[0]!.toLowerCase() as AIProviderType;
    
    if (provider !== 'openai' && provider !== 'gemini') {
      console.log(chalk.red('❌ Invalid provider. Use "openai" or "gemini"'));
      return;
    }

    const success = this.aiProviderFactory.setProvider(provider);
    if (success) {
      console.log(chalk.green(`✅ Switched to ${provider.toUpperCase()} provider`));
      if (this.shell.refreshAIStatus) {
        this.shell.refreshAIStatus();
      }
    } else {
      console.log(chalk.yellow(`💡 To configure ${provider}, use: /ai setup ${provider} <api-key>`));
    }
  }

  private listProviders(): void {
    const providers = this.aiProviderFactory.listProviders();
    
    console.log(chalk.blue.bold('\n🤖 Available AI Providers:\n'));
    
    providers.forEach(provider => {
      const statusIcon = provider.configured ? '✅' : '❌';
      const activeIcon = provider.active ? '👉' : '  ';
      const nameColor = provider.active ? chalk.cyan.bold : chalk.white;
      
      console.log(`${activeIcon} ${statusIcon} ${nameColor(provider.name.toUpperCase())} ${provider.configured ? chalk.green('(configured)') : chalk.gray('(not configured)')}`);
    });
    
    console.log();
    console.log(chalk.gray('Use /ai setup <provider> <api-key> to configure'));
    console.log(chalk.gray('Use /ai provider <provider> to switch'));
  }

  private showPresets(): void {
    const aiService = this.aiProviderFactory.getProvider();
    
    if (!aiService || !aiService.isConfigured()) {
      console.log(chalk.red('❌ AI service not configured'));
      console.log(chalk.gray('Set your API key first with: /ai setup <provider> <api-key>'));
      return;
    }

    // Check if service supports presets
    if (isPresetProvider(aiService)) {
      console.log(aiService.getPresetsInfo());
    } else {
      console.log(chalk.yellow('⚠️ Speed presets are not available for this provider'));
      console.log(chalk.gray('Switch to OpenAI or Gemini: /ai provider <openai|gemini>'));
    }
  }

  private async handlePreset(args: string[]): Promise<void> {
    if (args.length === 0) {
      console.log(chalk.red('Usage: /ai preset <name>'));
      console.log(chalk.gray('Available presets: lightning, fast, smart, reasoning'));
      this.showPresets();
      return;
    }

    const presetName = args[0];
    const aiService = this.aiProviderFactory.getProvider();
    
    if (!aiService || !aiService.isConfigured()) {
      console.log(chalk.red('❌ AI service not configured'));
      console.log(chalk.gray('Set your API key first with: /ai setup <provider> <api-key>'));
      return;
    }

    // Check if service supports presets
    if (isPresetProvider(aiService)) {
      const success = await aiService.applyPreset(presetName!);
      if (success && this.shell.refreshAIStatus) {
        this.shell.refreshAIStatus();
      }
    } else {
      console.log(chalk.yellow('⚠️ Speed presets are not available for this provider'));
      console.log(chalk.gray('Switch to OpenAI or Gemini: /ai provider <openai|gemini>'));
    }
  }
}
