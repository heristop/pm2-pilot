import { injectable, inject } from 'tsyringe';
import chalk from 'chalk';
import { CommandParser } from '../CommandParser';
import { AIInputRouter } from '../../services/AIInputRouter';
import { AIProviderFactory } from '../../services/AIProviderFactory';
import { CommandAnalyzer } from '../../services/CommandAnalyzer';
import { ExecutionManager, type ExecutionResponse } from '../../services/ExecutionManager';
import type { IPM2Client } from '../../interfaces/IPM2Client';

export interface IShellCommandRouter {
  processAIFirstInput(input: string): Promise<void>;
  processSlashCommand(input: string): Promise<void>;
  processNaturalLanguageInput(input: string): Promise<ExecutionResponse>;
}

@injectable()
export class ShellCommandRouter implements IShellCommandRouter {
  constructor(
    @inject('CommandParser') private commandParser: CommandParser,
    @inject('AIInputRouter') private aiRouter: AIInputRouter,
    @inject('AIProviderFactory') private aiProviderFactory: AIProviderFactory,
    @inject('CommandAnalyzer') private commandAnalyzer: CommandAnalyzer,
    @inject('ExecutionManager') private executionManager: ExecutionManager,
    @inject('IPM2Client') private pm2Client: IPM2Client
  ) {}

  async processAIFirstInput(input: string): Promise<void> {
    // Traditional slash commands bypass AI routing
    if (input.startsWith('/')) {
      await this.processSlashCommand(input);
      return;
    }

    try {
      const response = await this.processNaturalLanguageInput(input);
      // Display the AI response
      this.displayIntelligentResponse(response);
    } catch {
      // Fallback to AI service for error handling
      console.log(chalk.red('❌ Unable to process natural language input - AI not configured'));
      console.log(chalk.gray('Set up an AI provider with: /ai setup <provider> <api-key>'));
    }
  }

  async processSlashCommand(input: string): Promise<void> {
    await this.commandParser.execute(input);
  }

  async processNaturalLanguageInput(input: string): Promise<ExecutionResponse> {
    // Get available processes for better pronoun resolution
    try {
      const processes = await this.pm2Client.list();
      const processNames = processes.map(p => p.name);
      this.commandAnalyzer.setAvailableProcesses(processNames);
    } catch {
      // If PM2 fails, continue without process list
    }

    // Use new intelligent command analysis workflow
    const context = await this.executionManager.getConversationManager().getContext();
    const analysis = await this.commandAnalyzer.analyzeCommand(input, context);

    // Process through execution manager with AUTO/MANUAL mode handling
    const executionOptions = {
      autoMode: this.aiProviderFactory.isAutoExecuteEnabled(),
      verbose: true
    };

    const response = await this.executionManager.processCommand(input, analysis, executionOptions);
    return response;
  }

  private displayIntelligentResponse(response: ExecutionResponse): void {
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
}