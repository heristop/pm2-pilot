import { injectable, inject } from 'tsyringe';
import * as readline from 'node:readline';
import chalk from 'chalk';
import { CommandParser } from './CommandParser';
import { Renderer } from '../display/Renderer';
import { AIInputRouter } from '../services/AIInputRouter';
import { AIProviderFactory } from '../services/AIProviderFactory';
import { CommandAnalyzer } from '../services/CommandAnalyzer';
import { ExecutionManager } from '../services/ExecutionManager';
import { CommandHistoryManager } from '../services/CommandHistoryManager';
import type { IShellUIManager } from './ui/ShellUIManager';
import type { IShellInputHandler } from './input/ShellInputHandler';
import type { IShellCommandRouter } from './routing/ShellCommandRouter';
import type { IShellStateManager } from './state/ShellStateManager';
import type { PendingAction } from '../services/ConversationManager';
import type { IShell } from '../interfaces/IShell';
import type { IPM2Client } from '../interfaces/IPM2Client';

interface ReadlineWithHistory extends readline.Interface {
  history?: string[];
}

type PendingConfirmationState = {
  action: PendingAction;
  context?: Record<string, unknown>;
};

@injectable()
export class Shell implements IShell {
  private rl: ReadlineWithHistory | null = null;
  private commandParser: CommandParser;
  private pm2Client: PM2Client;
  private renderer: Renderer;
  private aiRouter: AIInputRouter;
  private aiProviderFactory: AIProviderFactory;
  private commandAnalyzer: CommandAnalyzer;
  private executionManager: ExecutionManager;
  private historyManager: CommandHistoryManager;
  private uiManager: IShellUIManager;
  private inputHandler: IShellInputHandler;
  private commandRouter: IShellCommandRouter;
  private stateManager: IShellStateManager;
  private isRunning: boolean = false;
  private pendingConfirmation: PendingConfirmationState | null = null;
  private interruptCount = 0;
  private lastInterruptTime = 0;

  constructor(
    @inject('IPM2Client') private pm2Client: IPM2Client,
    @inject('AIProviderFactory') private aiProviderFactory: AIProviderFactory,
    @inject('CommandParser') private commandParser: CommandParser,
    @inject('Renderer') private renderer: Renderer,
    @inject('AIInputRouter') private aiRouter: AIInputRouter,
    @inject('CommandAnalyzer') private commandAnalyzer: CommandAnalyzer,
    @inject('ExecutionManager') private executionManager: ExecutionManager,
    @inject('CommandHistoryManager') private historyManager: CommandHistoryManager,
    @inject('ICommandRegistry') private registry: ICommandRegistry,
    @inject('ShellUIManager') uiManager: IShellUIManager,
    @inject('ShellInputHandler') inputHandler: IShellInputHandler,
    @inject('ShellCommandRouter') commandRouter: IShellCommandRouter,
    @inject('ShellStateManager') stateManager: IShellStateManager
  ) {
    this.uiManager = uiManager;
    this.inputHandler = inputHandler;
    this.commandRouter = commandRouter;
    this.stateManager = stateManager;
  }


  async start(): Promise<void> {
    try {
      await this.pm2Client.connect();
      await this.setupReadline();
      this.stateManager.setRunning(true);
      this.isRunning = true;

      // Small delay to ensure readline is fully ready
      await new Promise(resolve => setTimeout(resolve, 10));

      await this.uiManager.showWelcome();
      this.prompt();
    } catch {
      console.error(chalk.red('Error: Could not connect to PM2. Make sure PM2 is installed and running.'));
      console.error(chalk.gray('Try: npm install -g pm2'));
      process.exit(1);
    }
  }

  private async setupReadline(): Promise<void> {
    this.rl = await this.inputHandler.setupReadline();

    // Set command names for completion
    this.inputHandler.setCommandNames(this.commandParser.getCommandNames());

    // Set up event handlers
    this.rl.on('line', (input: string) => {
      this.handleInput(input).catch((error) => {
        console.error('Error handling input:', error);
      });
    });

    this.rl.on('close', () => {
      if (this.isRunning) {
        this.exit();
      }
    });

    // Handle SIGINT (Ctrl+C)
    this.rl.on('SIGINT', this.handleInterrupt.bind(this));

    // Set up keypress handling for shortcuts (only when needed)
    this.setupKeyboardShortcuts();
  }

  public refreshAIStatus(): void {
    this.uiManager.refreshAIStatus();
  }

  private async handleInput(input: string): Promise<void> {
    const trimmedInput = input.trim();

    // In demo mode, ensure newline after command for better formatting
    if (process.env.PM2X_DEMO_MODE && trimmedInput) {
      console.log(); // Add newline after the command in demo mode
    }

    if (!trimmedInput) {
      this.prompt();
      return;
    }

    // Handle input processing
    await this.inputHandler.handleInput(trimmedInput);

    // Handle pending confirmation
    if (this.inputHandler.getPendingConfirmation()) {
      return; // Don't prompt yet, waiting for confirmation
    }

    try {
      // Route through command router
      await this.commandRouter.processAIFirstInput(trimmedInput);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Error: ${message}`));
    }

    this.prompt();
  }


  private handleInterrupt(): void {
    const now = Date.now();

    // Reset interrupt count if more than 2 seconds have passed
    if (now - this.lastInterruptTime > 2000) {
      this.interruptCount = 0;
    }

    this.interruptCount++;
    this.lastInterruptTime = now;

    if (this.interruptCount === 1) {
      console.log(chalk.yellow('\nUse /exit to quit or press Ctrl+C again to force exit.'));
      this.prompt();
    } else {
      console.log(chalk.red('\nForce exit...'));
      this.exit();
    }
  }


  private setupKeyboardShortcuts(): void {
    if (this.rl) {
      this.inputHandler.setupKeyboardShortcuts(this.rl);
      this.inputHandler.setRunning(this.isRunning);
    }
  }

  private async toggleAutoExecuteMode(): Promise<void> {
    await this.stateManager.toggleAutoExecuteMode();

    // Clear current line completely and show updated status
    if (this.rl) {
      this.rl.clearLine(0);
      this.rl.prompt(true);
    }
    process.stdout.write('\x1b[2K\r'); // Clear line and return to start

    // Show mode switch feedback
    this.stateManager.showAutoExecuteModeSwitch();

    // Refresh the full AI status display
    this.refreshAIStatus();

    this.prompt();
  }

  prompt(): void {
    if (this.rl && this.isRunning) {
      // In demo mode, write prompt inline with command input
      if (process.env.PM2X_DEMO_MODE) {
        process.stdout.write(this.uiManager.getPrompt());
      } else {
        this.rl.prompt();
      }
    }
  }

  isAutoExecuteEnabled(): boolean {
    return this.stateManager.isAutoExecuteEnabled();
  }

  // IShell interface implementation
  async executeCommand(input: string): Promise<void> {
    await this.handleInput(input);
  }

  clearScreen(): void {
    this.uiManager.clearScreen();
  }

  renderOutput(output: unknown, processName?: string): void {
    this.uiManager.renderOutput(output, processName);
  }

  renderError(error: Error): void {
    this.uiManager.renderError(error);
  }

  async promptConfirmation(action: PendingAction, context?: Record<string, unknown>): Promise<void> {
    await this.inputHandler.promptConfirmation(action, context);
    this.prompt();
  }

  async getCommandHistory(): Promise<string[]> {
    const history = await this.historyManager.getHistory();
    return history.map(h => h.command);
  }

  setShowHelp(show: boolean): void {
    // This could control a help display flag if needed
    if (show) {
      console.log(chalk.cyan('Type /help for available commands'));
    }
  }

  exit(): void {
    this.isRunning = false;
    this.stateManager.setRunning(false);

    void this.stateManager.cleanup().then(() => {
      if (this.rl) {
        this.rl.close();
      }
      process.exit(0);
    });
  }

  get client(): PM2Client {
    return this.pm2Client;
  }

  get display(): Renderer {
    return this.renderer;
  }

  get history(): CommandHistoryManager {
    return this.historyManager;
  }

  get parser(): CommandParser {
    return this.commandParser;
  }
}
