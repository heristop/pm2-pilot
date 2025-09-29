import { injectable, inject } from 'tsyringe';
import chalk from 'chalk';
import { AIProviderFactory } from '../../services/AIProviderFactory';
import type { IPM2Client } from '../../interfaces/IPM2Client';

export interface IShellUIManager {
  showWelcome(): Promise<void>;
  showBanner(isWide: boolean): void;
  showSystemStatus(): Promise<void>;
  showSmartSuggestions(): Promise<void>;
  showCommandsAndHelp(isWide: boolean): void;
  showAIStatus(): void;
  refreshAIStatus(): void;
  displayAIStatus(): void;
  showStatusLine(): void;
  getPrompt(): string;
  renderOutput(output: unknown, processName?: string): void;
  renderError(error: Error): void;
  clearScreen(): void;
  displayIntelligentResponse(response: import('../../services/ExecutionManager').ExecutionResponse): void;
  handleLowConfidenceInput(input: string): Promise<void>;
}

@injectable()
export class ShellUIManager implements IShellUIManager {
  constructor(
    @inject('IPM2Client') private pm2Client: IPM2Client,
    @inject('AIProviderFactory') private aiProviderFactory: AIProviderFactory
  ) {}

  async showWelcome(): Promise<void> {
    const terminalWidth = process.stdout.columns || 80;
    const isWide = terminalWidth >= 80;

    // Enhanced ASCII banner
    this.showBanner(isWide);

    // System status section
    await this.showSystemStatus();

    // Smart suggestions section
    await this.showSmartSuggestions();

    // Commands and help section
    this.showCommandsAndHelp(isWide);

    // AI configuration notice
    this.showAIStatus();
  }

  showBanner(isWide: boolean): void {
    if (isWide) {
      console.log(chalk.cyan.bold('\n╔══════════════════════════════════════════════════════════════════════════════╗'));
      console.log(chalk.cyan.bold('║') + chalk.white.bold('                             🚀 PM2-X v0.1.0                                  ') + chalk.cyan.bold('║'));
      console.log(chalk.cyan.bold('║') + chalk.blue.bold('                    Interactive Process Manager with AI                       ') + chalk.cyan.bold('║'));
      console.log(chalk.cyan.bold('╚══════════════════════════════════════════════════════════════════════════════╝'));
    } else {
      console.log(chalk.cyan.bold('\n┌─────────────────────────────────────────┐'));
      console.log(chalk.cyan.bold('│') + chalk.white.bold('           🚀 PM2-X v0.1.0          ') + chalk.cyan.bold('│'));
      console.log(chalk.cyan.bold('│') + chalk.blue.bold('     Interactive Process Manager    ') + chalk.cyan.bold('│'));
      console.log(chalk.cyan.bold('└─────────────────────────────────────────┘'));
    }
    console.log();
  }

  async showSystemStatus(): Promise<void> {
    try {
      const processes = await this.pm2Client.list();
      const online = processes.filter(p => p.pm2_env.status === 'online').length;
      const errored = processes.filter(p => p.pm2_env.status === 'errored').length;
      const stopped = processes.filter(p => p.pm2_env.status === 'stopped').length;
      const total = processes.length;

      console.log(chalk.white.bold('📊 System Overview'));
      console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));

      if (total === 0) {
        console.log(chalk.yellow('   No PM2 processes found'));
        console.log(chalk.gray('   Ready to start managing your applications'));
      } else {
        const statusLine = [
          online > 0 ? chalk.green(`✓ ${online} online`) : null,
          errored > 0 ? chalk.red(`✗ ${errored} errored`) : null,
          stopped > 0 ? chalk.yellow(`⏸ ${stopped} stopped`) : null
        ].filter(Boolean).join(chalk.gray(' │ '));

        console.log(`   ${chalk.white(`Total ${total === 1 ? 'process' : 'processes'}: ${total}`)} ${statusLine ? `(${statusLine})` : ''}`);

        // Health indicator
        const healthScore = total > 0 ? Math.round((online / total) * 100) : 100;
        const healthIcon = healthScore >= 80 ? '🟢' : healthScore >= 50 ? '🟡' : '🔴';
        console.log(`   ${healthIcon} System health: ${healthScore}%`);
      }

      // PM2 connection status
      console.log(chalk.green('   🔗 PM2 connected'));
      console.log();
    } catch {
      console.log(chalk.white.bold('📊 System Overview'));
      console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
      console.log(chalk.red('   ⚠️ Unable to connect to PM2'));
      console.log(chalk.gray('   Please ensure PM2 is installed and running'));
      console.log();
    }
  }

  async showSmartSuggestions(): Promise<void> {
    try {
      const processes = await this.pm2Client.list();

      if (processes.length === 0) {
        // No processes - suggest getting started
        const noProcessSuggestions = [
          { text: '"start my-app"', desc: 'Launch your application' },
          { text: '"load my-config"', desc: 'Load saved PM2 configuration' },
          { text: '"help"', desc: 'See what I can do' },
          { text: '"show me examples"', desc: 'Display sample configurations' },
          { text: '"watch a folder"', desc: 'Set up file watching' },
          { text: '"create a cluster"', desc: 'Launch multiple instances' }
        ];

        const shuffledSuggestions = [...noProcessSuggestions].sort(() => Math.random() - 0.5);
        const selectedSuggestions = shuffledSuggestions.slice(0, Math.min(3, noProcessSuggestions.length));

        console.log(chalk.cyan.bold('🎯 Get started:'));
        console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
        selectedSuggestions.forEach(suggestion => {
          console.log(chalk.gray(`   • ${suggestion.text} - ${suggestion.desc}`));
        });
      } else {
        // Processes exist - analyze and suggest relevant actions
        const online = processes.filter(p => p.pm2_env.status === 'online').length;
        const errored = processes.filter(p => p.pm2_env.status === 'errored').length;
        const stopped = processes.filter(p => p.pm2_env.status === 'stopped').length;

        console.log(chalk.cyan.bold(`🎯 Try asking (${processes.length} ${processes.length === 1 ? 'process' : 'processes'} found):`));
        console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));

        let suggestions: Array<{ text: string; desc: string }> = [];

        if (errored > 0) {
          suggestions = [
            { text: '"fix my errored processes"', desc: 'Handle failed processes' },
            { text: '"what went wrong?"', desc: 'Diagnose issues' },
            { text: '"diagnose the crashes"', desc: 'Analyze failure patterns' },
            { text: '"check error logs"', desc: 'View crash details' },
            { text: '"auto-restart failed apps"', desc: 'Enable auto-recovery' }
          ];
        } else if (online > 0) {
          suggestions = [
            { text: '"how are my processes doing?"', desc: 'Check health' },
            { text: '"show me performance"', desc: 'View metrics' },
            { text: '"what\'s eating my memory?"', desc: 'Find memory-hungry processes' },
            { text: '"which app is using most CPU?"', desc: 'Identify CPU-intensive processes' },
            { text: '"show me the logs"', desc: 'View recent application logs' },
            { text: '"optimize my setup"', desc: 'Get performance recommendations' },
            { text: '"scale up my apps"', desc: 'Increase process instances' },
            { text: '"which processes need attention?"', desc: 'Find problematic processes' },
            { text: '"save my current setup"', desc: 'Export PM2 configuration' },
            { text: '"monitor real-time stats"', desc: 'Watch live metrics' },
            { text: '"restart everything cleanly"', desc: 'Graceful full restart' },
            { text: '"show me error logs"', desc: 'View recent errors' }
          ];
        }

        if (stopped > 0) {
          const stoppedSuggestions = [
            { text: '"start stopped processes"', desc: 'Resume paused apps' },
            { text: '"wake up sleeping apps"', desc: 'Start stopped processes' },
            { text: '"why did they stop?"', desc: 'Investigate stop reasons' }
          ];
          suggestions = suggestions.concat(stoppedSuggestions);
        }

        // Always add some general suggestions
        const generalSuggestions = [
          { text: '"restart slow apps"', desc: 'Refresh underperforming processes' }
        ];
        suggestions = suggestions.concat(generalSuggestions);

        // Pick 3 random suggestions (or all if less than 3)
        const shuffledSuggestions = [...suggestions].sort(() => Math.random() - 0.5);
        const selectedSuggestions = shuffledSuggestions.slice(0, Math.min(3, suggestions.length));

        selectedSuggestions.forEach(suggestion => {
          console.log(chalk.gray(`   • ${suggestion.text} - ${suggestion.desc}`));
        });
      }
      console.log();
    } catch {
      // Fallback suggestions if PM2 connection fails
      const fallbackSuggestions = [
        { text: '"show my processes"', desc: 'See what\'s running' },
        { text: '"start my-app"', desc: 'Launch an application' },
        { text: '"help me get started"', desc: 'Learn the basics' },
        { text: '"connect to PM2"', desc: 'Establish PM2 connection' }
      ];

      const shuffledSuggestions = [...fallbackSuggestions].sort(() => Math.random() - 0.5);
      const selectedSuggestions = shuffledSuggestions.slice(0, Math.min(3, fallbackSuggestions.length));

      console.log(chalk.cyan.bold('🎯 Try asking:'));
      console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
      selectedSuggestions.forEach(suggestion => {
        console.log(chalk.gray(`   • ${suggestion.text} - ${suggestion.desc}`));
      });
      console.log();
    }
  }

  showCommandsAndHelp(isWide: boolean): void {
    console.log(chalk.white.bold('🎮 Quick Reference'));
    console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));

    if (isWide) {
      console.log(chalk.cyan('   Commands:     ') + chalk.gray('/status, /restart, /health, /help, /logs, /metrics'));
      console.log(chalk.cyan('   Shortcuts:    ') + chalk.gray('shift+tab (toggle auto-execute), ctrl+c (exit)'));
      console.log(chalk.cyan('   AI Features:  ') + chalk.gray('Natural language processing, smart suggestions'));
    } else {
      console.log(chalk.cyan('   Commands: ') + chalk.gray('/status, /restart, /health'));
      console.log(chalk.cyan('   Shortcuts:') + chalk.gray(' shift+tab, ctrl+c'));
      console.log(chalk.cyan('   AI Mode:  ') + chalk.gray('Natural language support'));
    }

    console.log(chalk.green('   💬 Just tell me what you want to do with your processes!'));
    console.log();
  }

  showAIStatus(): void {
    this.displayAIStatus();
  }

  refreshAIStatus(): void {
    this.displayAIStatus();
  }

  displayAIStatus(): void {
    const aiFactory = AIProviderFactory.getInstance();

    if (!aiFactory.isConfigured()) {
      console.log(chalk.white.bold('🤖 AI Enhancement'));
      console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
      console.log(chalk.yellow('   ⚡ Unlock advanced AI features:'));
      console.log(chalk.gray('   • OpenAI: Set OPENAI_API_KEY environment variable'));
      console.log(chalk.gray('   • Gemini: Set GEMINI_API_KEY environment variable'));
      console.log(chalk.gray('   • Or use: /ai setup <provider> <api-key>'));
      console.log();
    } else {
      console.log(chalk.white.bold('🤖 AI Status'));
      console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
      console.log(chalk.green('   ✓ AI features enabled and ready'));
      const currentProvider = this.aiProviderFactory.getCurrentProviderType();
      const _aiProvider = this.aiProviderFactory.getProvider();

      // Get current model info from the provider
      let modelInfo = '';
      const modelData = this.aiProviderFactory.getCurrentModelInfo();
      if (modelData) {
        if (modelData.preset) {
          // If there's an active preset, show it
          modelInfo = ` (${modelData.preset} preset: ${modelData.model})`;
        } else if (modelData.model) {
          // Otherwise just show the model
          modelInfo = ` (${modelData.model})`;
        }
      }

      console.log(`   Provider: ${chalk.cyan(currentProvider?.toUpperCase() || 'Unknown')}${chalk.gray(modelInfo)}`);
      const autoMode = this.aiProviderFactory.isAutoExecuteEnabled();
      const modeText = autoMode ? chalk.green('⚡ Auto-execute') : chalk.yellow('🛡️ Ask first');
      const shortcutHint = chalk.gray('(Shift+Tab to switch)');
      console.log(`   Mode: ${modeText} ${shortcutHint}`);
      console.log();
    }
  }

  showStatusLine(): void {
    const autoMode = this.aiProviderFactory.isAutoExecuteEnabled();
    const statusText = autoMode
      ? chalk.green('  ⚡ auto-execute ') + chalk.gray('· shift+tab to switch mode')
      : chalk.gray('  🛡️ ask first ') + chalk.gray('· shift+tab to switch mode');
    console.log(statusText);
  }

  getPrompt(): string {
    return chalk.cyan('pm2x> ');
  }

  renderOutput(output: unknown, processName?: string): void {
    if (processName) {
      console.log(chalk.gray(`[${processName}]`), output);
    } else {
      console.log(output);
    }
  }

  renderError(error: Error): void {
    console.error(chalk.red('Error:'), error.message);
  }

  clearScreen(): void {
    console.clear();
  }

  displayIntelligentResponse(response: import('../../services/ExecutionManager').ExecutionResponse): void {
    // Display execution result if action was performed
    if (response.executed && response.result) {
      console.log(response.message);
      return;
    }

    // Display message
    if (response.message) {
      console.log(response.message);
    }

    // Display pending actions (numbered)
    if (response.pendingActions.length > 0) {
      console.log('\n💡 Suggested actions:');
      response.pendingActions.forEach((action, index) => {
        const safetyIcon = action.safety === 'dangerous' ? '⚠️' : action.safety === 'caution' ? '🔶' : '✅';
        console.log(chalk.gray(`   ${index + 1}. ${safetyIcon} ${action.label} - ${action.analysis.targetCommand}`));
      });
      console.log(chalk.gray('   Type the number to execute the action'));
    }

    // Display parameter request if needed
    if (response.missingParameters?.length) {
      console.log(chalk.yellow(`\n⚠️ Missing: ${response.missingParameters.join(', ')}`));
    }
  }

  async handleLowConfidenceInput(input: string): Promise<void> {
    console.log(chalk.yellow(`🤔 I'm not sure how to help with "${input}"`));
    console.log(chalk.gray('\n💡 Here are some ways to interact with me:'));

    // Show context-aware suggestions
    try {
      const processes = await this.pm2Client.list();

      if (processes.length > 0) {
        console.log(chalk.cyan('\n🗣️  Natural language (try first):'));
        console.log(chalk.gray('   • "show my processes" or "how are things?"'));
        console.log(chalk.gray('   • "restart slow apps" or "fix performance"'));
        console.log(chalk.gray('   • "why is my-app slow?" or "check health"'));
        console.log(chalk.gray('   • "start my-app" or "optimize my setup"'));

        console.log(chalk.cyan('\n⌨️  Commands (fallback):'));
        console.log(chalk.gray('   • /status, /restart, /health, /help'));
      } else {
        console.log(chalk.cyan('\n🗣️  Natural language (try first):'));
        console.log(chalk.gray('   • "help me get started" or "what can you do?"'));
        console.log(chalk.gray('   • "start my-app" or "launch my application"'));
        console.log(chalk.gray('   • "load my config" or "setup my processes"'));

        console.log(chalk.cyan('\n⌨️  Commands (fallback):'));
        console.log(chalk.gray('   • /help, /start, /load'));
      }
    } catch {
      console.log(chalk.cyan('\n🔧 Try these approaches:'));
      console.log(chalk.gray('   • Natural: "help", "show status", "start my-app"'));
      console.log(chalk.gray('   • Commands: /help, /status, /start'));
    }

    console.log(chalk.gray('\n✨ Tip: I work with both natural language and /commands!'));
  }
}