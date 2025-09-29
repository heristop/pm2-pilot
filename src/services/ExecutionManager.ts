import { injectable, inject } from 'tsyringe';
import type { CommandAnalysis } from './CommandAnalyzer';
import type { PM2Command, ExecutionResult } from './PM2CommandMapper';
import type { PendingAction } from './ConversationManager';
import { PM2CommandMapper } from './PM2CommandMapper';
import { ConversationManager } from './ConversationManager';
import { AIProviderFactory } from './AIProviderFactory';
import { ErrorAnalysisService } from './ErrorAnalysisService';
import type { IPM2Client } from '../interfaces/IPM2Client';
import chalk from 'chalk';
import type { ProcessInfo } from '../pm2/PM2Client';

export interface ExecutionOptions {
  autoMode: boolean;
  skipConfirmation?: boolean;
  verbose?: boolean;
}

export interface ExecutionResponse {
  executed: boolean;
  result?: ExecutionResult;
  pendingActions: PendingAction[];
  message: string;
  needsUserInput: boolean;
  missingParameters?: string[];
}

@injectable()
export class ExecutionManager {
  constructor(
    @inject('IPM2Client') private pm2Client: IPM2Client,
    @inject('PM2CommandMapper') private commandMapper: PM2CommandMapper,
    @inject('ConversationManager') private conversationManager: ConversationManager,
    @inject('AIProviderFactory') private aiProviderFactory: AIProviderFactory,
    @inject('ErrorAnalysisService') private errorAnalysisService: ErrorAnalysisService
  ) {}

  async processCommand(input: string, analysis: CommandAnalysis, options: ExecutionOptions): Promise<ExecutionResponse> {
    
    // Handle execute_pending intent - LLM understands confirmations naturally
    if (analysis.intent === 'execute_pending') {
      return await this.handleExecutePending(input, analysis);
    }

    // Handle info requests differently - they need AI responses, not PM2 commands
    if (analysis.intent === 'info_request') {
      return await this.handleInfoRequest(input, analysis);
    }

    // Map analysis to PM2 command
    const pm2Command = await this.commandMapper.mapToCommand(analysis);
    
    if (!pm2Command) {
      return this.createErrorResponse(`Unknown command: ${analysis.intent}`);
    }

    // Validate command and parameters
    const validation = this.validateCommand(pm2Command, analysis);
    if (!validation.valid) {
      return this.createValidationResponse(validation);
    }

    // Determine execution path based on mode and safety
    const shouldExecute = this.shouldAutoExecute(analysis, pm2Command, options);
    
    if (shouldExecute) {
      // Auto-execute
      const result = await this.executeCommand(pm2Command);
      await this.conversationManager.addTurn(input, analysis, result);
      
      return {
        executed: true,
        result,
        pendingActions: [],
        message: this.formatExecutionMessage(result, true),
        needsUserInput: false
      };
    } else {
      // Create pending action for user confirmation
      const pendingAction = this.createPendingAction(analysis, pm2Command);
      this.conversationManager.setPendingActions([pendingAction]);
      
      return {
        executed: false,
        pendingActions: [pendingAction],
        message: this.formatConfirmationMessage(analysis, pm2Command),
        needsUserInput: true
      };
    }
  }

  private async handleInfoRequest(input: string, analysis: CommandAnalysis): Promise<ExecutionResponse> {
    try {
      // Execute relevant command first to get real data
      const realDataContext = await this.executeRelevantCommand(analysis.originalInput);
      
      // Get conversation history for chat continuity
      const conversationHistory = this.conversationManager.getMessagesForAI();
      
      // Build full context with both conversation and real-time data
      const contextPrompt = this.conversationManager.generateContextPrompt();
      const contextWithHistory = contextPrompt && contextPrompt.trim() !== '' 
        ? `${contextPrompt}\n\n${realDataContext}`
        : realDataContext;
      
      // Query AI service for informational response with real data and conversation context
      let aiResponse: string;
      const aiProvider = this.aiProviderFactory.getProvider();
      if (aiProvider && aiProvider.isConfigured()) {
        // Use queryWithHistory for proper chat mode with conversation continuity
        aiResponse = await aiProvider.queryWithHistory(
          analysis.originalInput, 
          conversationHistory,  // Pass actual conversation history
          contextWithHistory   // Include both conversation context and real data
        );
      } else {
        // Use real data in fallback response too
        const processes = await this.pm2Client.list();
        aiResponse = this.generateFallbackInfoResponse(analysis.originalInput, processes);
      }
      
      // Record this interaction
      await this.conversationManager.addTurn(input, analysis, {
        success: true,
        message: aiResponse,
        command: 'info_request'
      });
      
      return {
        executed: true,
        result: {
          success: true,
          message: aiResponse,
          command: 'info_request'
        },
        pendingActions: [],
        message: chalk.blue('🤖 ') + aiResponse,
        needsUserInput: false
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createErrorResponse(`Failed to process information request: ${errorMessage}`);
    }
  }

  private async executeRelevantCommand(userInput: string): Promise<string> {
    const lowerInput = userInput.toLowerCase();
    
    try {
      // Command decision tree - map questions to actual PM2 operations
      if (lowerInput.includes('list') || lowerInput.includes('show') || lowerInput.includes('what are') || 
          (lowerInput.includes('name') && (lowerInput.includes('server') || lowerInput.includes('process')))) {
        
                const processes = await this.pm2Client.list();        const processData = this.formatDetailedProcessData(processes);
        
        // Extract process names for easy AI identification
        const processNames = processes.map(p => p.name);
        
        return `PM2 Status Command Results:
PROCESS NAMES: ${processNames.join(', ')}

${processData}

User Question: ${userInput}`;
      }
      
      if (lowerInput.includes('log') || lowerInput.includes('error') || lowerInput.includes('issue')) {
        // For log-related questions, get process info AND analyze recent errors
        const processes = await this.pm2Client.list();
        const processNames = processes.map(p => p.name);
        
        // Analyze recent error logs for intelligence
        const errorLogs = await this.pm2Client.getErrorLogs(undefined, 50);
        const errorAnalysis = await this.errorAnalysisService.analyzeLogErrors(errorLogs);
        
        let logContext = `PM2 Process Status:\n${this.formatDetailedProcessData(processes)}\n\nAvailable processes for logs: ${processNames.join(', ')}`;
        
        // Add error analysis if errors were found
        if (errorAnalysis.hasErrors) {
          logContext += `\n\n🚨 RECENT ERROR ANALYSIS:\n`;
          logContext += `- Found ${errorAnalysis.errorCount} error(s) in recent logs\n`;
          
          if (errorAnalysis.diagnosis) {
            logContext += `- Issue: ${errorAnalysis.diagnosis.summary}\n`;
            logContext += `- Severity: ${errorAnalysis.diagnosis.severity}\n`;
            logContext += `- Root Cause: ${errorAnalysis.diagnosis.rootCause}\n`;
            
            if (errorAnalysis.diagnosis.actionableSuggestions.length > 0) {
              logContext += `- Suggested Actions:\n`;
              errorAnalysis.diagnosis.actionableSuggestions.slice(0, 3).forEach((suggestion, i) => {
                logContext += `  ${i + 1}. ${suggestion}\n`;
              });
            }
            
            if (errorAnalysis.quickFix) {
              logContext += `- Quick Fix: ${errorAnalysis.quickFix}\n`;
            }
          }
          
          // Add details about the most recent errors
          if (errorAnalysis.parsedErrors.length > 0) {
            const recentError = errorAnalysis.parsedErrors[0];
            logContext += `\nMost Recent Error:\n`;
            logContext += `- Type: ${recentError.type}\n`;
            logContext += `- Process: ${recentError.processName}\n`;
            logContext += `- Time: ${new Date(recentError.timestamp).toLocaleString()}\n`;
            if (recentError.filePath) {
              logContext += `- File: ${recentError.filePath}\n`;
            }
          }
        } else {
          logContext += `\n\n✅ No recent errors detected in logs.`;
        }
        
        logContext += `\n\nUser Question: ${userInput}`;
        return logContext;
      }
      
      if (lowerInput.includes('health') || lowerInput.includes('performance') || lowerInput.includes('cpu') || lowerInput.includes('memory')) {
        // For health questions, get detailed metrics
        const processes = await this.pm2Client.list();
        const healthData = this.formatHealthData(processes);
        
        return `PM2 Health Metrics:\n${healthData}\n\nUser Question: ${userInput}`;
      }
      
      // Default: get basic process status for any other info request
      const processes = await this.pm2Client.list();
      const processData = this.formatDetailedProcessData(processes);
      const processNames = processes.map(p => p.name);
      
      return `Current PM2 Status:
PROCESS NAMES: ${processNames.join(', ')}

${processData}

User Question: ${userInput}`;
      
    } catch (error) {
      return `Error retrieving PM2 data: ${error instanceof Error ? error.message : String(error)}\n\nUser Question: ${userInput}`;
    }
  }

  private formatDetailedProcessData(processes: ProcessInfo[]): string {
    if (processes.length === 0) {
      return 'No PM2 processes are currently running.';
    }

    let output = `Total ${processes.length === 1 ? 'process' : 'processes'}: ${processes.length}\n\n`;
    
    processes.forEach(proc => {
      const status = proc.pm2_env.status;
      const name = proc.name;
      const pid = proc.pid ?? 0;
      const cpu = proc.monit?.cpu ?? 0;
      const memory = this.formatMemory(proc.monit?.memory ?? 0);
      const uptime = this.formatUptime(proc.pm2_env.pm_uptime);
      const restarts = proc.pm2_env.restart_time || 0;
      
      output += `Process: ${name}\n`;
      output += `  Status: ${status}\n`;
      output += `  PID: ${pid || 'N/A'}\n`;
      output += `  CPU: ${cpu}%\n`;
      output += `  Memory: ${memory}\n`;
      output += `  Uptime: ${uptime}\n`;
      output += `  Restarts: ${restarts}\n\n`;
    });

    return output;
  }

  private formatHealthData(processes: ProcessInfo[]): string {
    if (processes.length === 0) {
      return 'No processes to analyze.';
    }

    const online = processes.filter(p => p.pm2_env.status === 'online').length;
    const errored = processes.filter(p => p.pm2_env.status === 'errored').length;
    const stopped = processes.filter(p => p.pm2_env.status === 'stopped').length;
    
    const totalCpu = processes.reduce((sum, p) => sum + (p.monit?.cpu ?? 0), 0);
    const totalMemory = processes.reduce((sum, p) => sum + (p.monit?.memory ?? 0), 0);
    const avgCpu = processes.length > 0 ? (totalCpu / processes.length).toFixed(1) : '0';
    
    let output = `Health Summary:\n`;
    output += `  Online: ${online}/${processes.length}\n`;
    output += `  Errored: ${errored}\n`;
    output += `  Stopped: ${stopped}\n`;
    output += `  Average CPU: ${avgCpu}%\n`;
    output += `  Total Memory: ${this.formatMemory(totalMemory)}\n\n`;
    
    // Add per-process details
    output += this.formatDetailedProcessData(processes);
    
    return output;
  }

  private formatMemory(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  private formatUptime(timestamp: number | null): string {
    if (!timestamp) return 'N/A';
    const now = Date.now();
    const uptime = now - timestamp;
    const seconds = Math.floor(uptime / 1000);
    
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m`;
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }

  private buildProcessContext(processes: ProcessInfo[]): string {
    if (processes.length === 0) {
      return 'No PM2 processes are currently running.';
    }

    const online = processes.filter(p => p.pm2_env.status === 'online');
    const stopped = processes.filter(p => p.pm2_env.status === 'stopped');
    const errored = processes.filter(p => p.pm2_env.status === 'errored');

    let context = `Current PM2 Process Status:\n`;
    context += `Total ${processes.length === 1 ? 'process' : 'processes'}: ${processes.length}\n`;
    
    if (online.length > 0) {
      context += `Online processes (${online.length}): ${online.map(p => p.name).join(', ')}\n`;
    }
    if (stopped.length > 0) {
      context += `Stopped processes (${stopped.length}): ${stopped.map(p => p.name).join(', ')}\n`;
    }
    if (errored.length > 0) {
      context += `Errored processes (${errored.length}): ${errored.map(p => p.name).join(', ')}\n`;
    }

    return context;
  }

  private generateFallbackInfoResponse(question: string, processes: ProcessInfo[]): string {
    const lowerQuestion = question.toLowerCase();
    
    // Questions about listing/showing processes (should be info_request, not show_status)
    if (lowerQuestion.includes('list') || (lowerQuestion.includes('show') && (lowerQuestion.includes('server') || lowerQuestion.includes('process'))) || lowerQuestion.includes('what are')) {
      if (processes.length === 0) {
        return 'You don\'t have any processes running in PM2 right now. You can start processes with "pm2 start <app-name>".';
      } else {
        const processInfo = processes.map(p => `${p.name} (${p.pm2_env.status})`).join(', ');
        return `Your PM2 processes: ${processInfo}`;
      }
    }
    
    // Common questions about process names (what is the name of my server?)
    if (lowerQuestion.includes('name') && (lowerQuestion.includes('server') || lowerQuestion.includes('app') || lowerQuestion.includes('process'))) {
      if (processes.length === 0) {
        return 'You don\'t have any processes running in PM2 right now.';
      }

      if (processes.length === 1) {
        const [singleProcess] = processes;
        return singleProcess ? `Your server/process is named "${singleProcess.name}".` : 'Process information unavailable.';
      }

      return `You have ${processes.length} ${processes.length === 1 ? 'process' : 'processes'}: ${processes.map(p => p.name).join(', ')}.`;
    }
    
    // Questions about process count
    if (lowerQuestion.includes('how many') || lowerQuestion.includes('count')) {
      const online = processes.filter(p => p.pm2_env.status === 'online').length;
      return `You have ${processes.length} total processes, with ${online} currently online.`;
    }
    
    // Questions about status/health
    if (lowerQuestion.includes('status') || lowerQuestion.includes('health') || lowerQuestion.includes('how') || lowerQuestion.includes('doing')) {
      if (processes.length === 0) {
        return 'No processes are running. You can start processes with "pm2 start <app-name>" or "start my app".';
      }
      
      const online = processes.filter(p => p.pm2_env.status === 'online').length;
      const errored = processes.filter(p => p.pm2_env.status === 'errored').length;
      
      if (errored > 0) {
        return `You have ${errored} errored processes that need attention. ${online} processes are running normally.`;
      } else if (online === processes.length) {
        return `All ${processes.length} processes are running smoothly! 🎉`;
      } else {
        return `${online} out of ${processes.length} processes are currently online.`;
      }
    }
    
    // Default fallback
    return `I can help you with PM2 process management. Try asking "show my processes" to see your current status, or ask specific questions about your processes.`;
  }

  private async handleExecutePending(input: string, _analysis: CommandAnalysis): Promise<ExecutionResponse> {
    const pendingActions = this.conversationManager.getPendingActions();
    
    if (pendingActions.length === 0) {
      return {
        executed: false,
        pendingActions: [],
        message: chalk.yellow('No pending actions to execute.'),
        needsUserInput: false
      };
    }

    // Execute the first/most recent pending action
    const action = pendingActions[0];
    const pm2Command = await this.commandMapper.mapToCommand(action.analysis);
    
    if (!pm2Command) {
      return this.createErrorResponse(`Failed to map action: ${action.analysis.intent}`);
    }

    const result = await this.executeCommand(pm2Command);
    await this.conversationManager.addTurn(input, action.analysis, result);
    this.conversationManager.clearPendingActions();
    
    return {
      executed: true,
      result,
      pendingActions: [],
      message: this.formatExecutionMessage(result, false),
      needsUserInput: false
    };
  }

  private validateCommand(command: PM2Command, analysis: CommandAnalysis): { valid: boolean; missing: string[]; message?: string } {
    const missing: string[] = [];

    // Check if target is required but missing
    if (command.requiresTarget && !analysis.parameters.target) {
      missing.push('process name or target');
    }

    // Validate target if provided
    if (analysis.parameters.target && !this.commandMapper.validateTarget(command, analysis.parameters.target)) {
      return {
        valid: false,
        missing: [],
        message: `Invalid target: "${analysis.parameters.target}". Available processes can be checked with status command.`
      };
    }

    return {
      valid: missing.length === 0,
      missing,
      message: missing.length > 0 ? `Missing required parameters: ${missing.join(', ')}` : undefined
    };
  }

  private shouldAutoExecute(analysis: CommandAnalysis, command: PM2Command, options: ExecutionOptions): boolean {
    // Never auto-execute if not in auto mode
    if (!options.autoMode) {
      return false;
    }

    // Never auto-execute dangerous commands
    const target = analysis.parameters.target ?? undefined;
    const effectiveSafety = this.commandMapper.getSafetyLevel(command, target);
    if (effectiveSafety === 'dangerous') {
      return false;
    }

    // Auto-execute if explicitly marked as safe for auto-execution
    if (analysis.canAutoExecute) {
      return true;
    }

    // Auto-execute safe commands with high confidence
    if (effectiveSafety === 'safe' && analysis.confidence >= 0.7) {
      return true;
    }

    // Auto-execute caution commands with very high confidence and specific target
    if (effectiveSafety === 'caution' &&
        analysis.confidence >= 0.8 &&
        target &&
        target !== 'all') {
      return true;
    }

    return false;
  }

  private async executeCommand(command: PM2Command): Promise<ExecutionResult> {
    return await this.commandMapper.executeCommand(command);
  }

  private createPendingAction(analysis: CommandAnalysis, command: PM2Command): PendingAction {
    const target = analysis.parameters.target ?? '';
    const effectiveSafety = this.commandMapper.getSafetyLevel(command, target || undefined);
    
    return {
      id: `action_${Date.now()}`,
      label: `${command.args[0]} ${target}`.trim(),
      command: `${command.command} ${command.args.join(' ')}`,
      analysis,
      safety: effectiveSafety
    };
  }

  private createErrorResponse(message: string): ExecutionResponse {
    return {
      executed: false,
      pendingActions: [],
      message: chalk.red(`❌ ${message}`),
      needsUserInput: false
    };
  }

  private createValidationResponse(validation: { missing: string[]; message?: string }): ExecutionResponse {
    const message = validation.message || `Missing required parameters: ${validation.missing.join(', ')}`;
    
    return {
      executed: false,
      pendingActions: [],
      message: chalk.yellow(`⚠️ ${message}`),
      needsUserInput: true,
      missingParameters: validation.missing
    };
  }

  private formatExecutionMessage(result: ExecutionResult, wasAutoExecuted: boolean): string {
    let message = result.message;
    
    if (wasAutoExecuted) {
      message = `🤖 ${message}`;
    }
    
    if (result.output) {
      message += `\n${result.output}`;
    }
    
    return message;
  }

  private formatConfirmationMessage(analysis: CommandAnalysis, command: PM2Command): string {
    const target = analysis.parameters.target || 'specified target';
    const effectiveSafety = this.commandMapper.getSafetyLevel(command, analysis.parameters.target ?? undefined);
    
    let message = `🤖 I understand you want to ${command.description.toLowerCase()}`;
    if (analysis.parameters.target) {
      message += ` for ${target}`;
    }
    message += '.';

    // Add safety warning for dangerous operations
    if (effectiveSafety === 'dangerous') {
      message += ` ${chalk.red('⚠️ This is a potentially dangerous operation.')}`;
    }

    message += '\n\n💡 Suggested actions:';
    
    return message;
  }

  // Public methods for Shell integration
  getConversationManager(): ConversationManager {
    return this.conversationManager;
  }

  async askForMissingParameter(parameterName: string, analysis: CommandAnalysis): Promise<string> {
    // This would be implemented to interactively ask for missing parameters
    // For now, return a prompt message
    switch (parameterName) {
      case 'process name or target': {
        const processes = await this.getAvailableProcesses();
        if (processes.length > 0) {
          return `Which process would you like to ${analysis.intent.replace('_', ' ')}? Available: ${processes.join(', ')}`;
        } else {
          return `Please specify the process name you want to ${analysis.intent.replace('_', ' ')}.`;
        }
      }
      default:
        return `Please provide ${parameterName}.`;
    }
  }

  private async getAvailableProcesses(): Promise<string[]> {
    try {
      const processes = await this.pm2Client.list();
      return processes.map(p => p.name);
    } catch {
      return [];
    }
  }

  // Method to check current auto mode
  isAutoMode(): boolean {
    return this.aiProviderFactory.isAutoExecuteEnabled();
  }

  // Method to get statistics for debugging
  getStats() {
    return this.conversationManager.getStatistics();
  }

  // Helper method to create diagnostic pending actions based on error analysis
  async createDiagnosticActions(errorAnalysis: any): Promise<PendingAction[]> {
    const actions: PendingAction[] = [];
    
    if (!errorAnalysis.hasErrors || !errorAnalysis.diagnosis) {
      return actions;
    }

    const { diagnosis, parsedErrors } = errorAnalysis;
    
    // Create actions based on follow-up commands suggested by AI
    if (diagnosis.followUpCommands && diagnosis.followUpCommands.length > 0) {
      diagnosis.followUpCommands.forEach((command: string, index: number) => {
        actions.push({
          id: `diagnostic_${index + 1}`,
          label: command,
          command: this.mapFollowUpCommandToPM2(command),
          analysis: {
            intent: 'info_request',
            targetCommand: command,
            parameters: { target: null, required: [], optional: [], provided: {} },
            confidence: 0.8,
            safety: 'safe',
            missingParams: [],
            language: 'English',
            originalInput: command,
            needsConfirmation: false,
            canAutoExecute: true
          },
          safety: 'safe'
        });
      });
    }

    // Add process-specific restart action for critical errors
    if (diagnosis.severity === 'critical' && parsedErrors.length > 0) {
      const errorProcess = parsedErrors[0].processName;
      actions.push({
        id: 'restart_errored_process',
        label: `Restart ${errorProcess} to clear critical errors`,
        command: `pm2 restart ${errorProcess}`,
        analysis: {
          intent: 'restart_process',
          targetCommand: 'pm2 restart',
          parameters: { target: errorProcess, required: ['target'], optional: [], provided: { target: errorProcess } },
          confidence: 0.9,
          safety: 'caution',
          missingParams: [],
          language: 'English',
          originalInput: `restart ${errorProcess}`,
          needsConfirmation: true,
          canAutoExecute: false
        },
        safety: 'caution'
      });
    }

    return actions;
  }

  private mapFollowUpCommandToPM2(command: string): string {
    const lowerCommand = command.toLowerCase();
    
    if (lowerCommand.includes('restart')) {
      return 'pm2 restart all';
    }
    if (lowerCommand.includes('logs')) {
      return 'pm2 logs';
    }
    if (lowerCommand.includes('status') || lowerCommand.includes('health')) {
      return 'pm2 status';
    }
    if (lowerCommand.includes('stop')) {
      return 'pm2 stop all';
    }
    
    // Default to info request for analysis commands
    return command;
  }
}
