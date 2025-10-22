import { injectable, inject } from 'tsyringe';
import * as readline from 'node:readline';
import chalk from 'chalk';
import { CommandHistoryManager } from '../../services/CommandHistoryManager';
import type { PendingAction } from '../../services/ConversationManager';

interface ReadlineWithHistory extends readline.Interface {
  history?: string[];
}

type PendingConfirmationState = {
  action: PendingAction;
  context?: Record<string, unknown>;
};

export interface IShellInputHandler {
  setupReadline(): Promise<ReadlineWithHistory>;
  handleInput(input: string): Promise<void>;
  handleConfirmation(input: string): void;
  completer(line: string): [string[], string];
  setupKeyboardShortcuts(rl: ReadlineWithHistory): void;
  handleKeypress(str: string, key?: readline.Key): void;
  handleInterrupt(): void;
  promptConfirmation(action: PendingAction, context?: Record<string, unknown>): Promise<void>;
  setPendingConfirmation(state: PendingConfirmationState | null): void;
  getPendingConfirmation(): PendingConfirmationState | null;
  setRunning(isRunning: boolean): void;
  getRunning(): boolean;
}

@injectable()
export class ShellInputHandler implements IShellInputHandler {
  private pendingConfirmation: PendingConfirmationState | null = null;
  private interruptCount = 0;
  private lastInterruptTime = 0;
  private isRunning = false;

  constructor(
    @inject('CommandHistoryManager') private historyManager: CommandHistoryManager
  ) {}

  async setupReadline(): Promise<ReadlineWithHistory> {
    // Load command history before setting up readline
    await this.historyManager.loadHistory();
    const historyCommands = await this.historyManager.getReadlineHistory();

    // Check if we're in demo mode
    const isDemoMode = !!process.env.PM2X_DEMO_MODE;

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: isDemoMode ? '' : this.getPrompt(), // Use empty prompt in demo mode
      completer: this.completer.bind(this)
    }) as ReadlineWithHistory;

    // Set up command history for up/down arrow navigation
    if (rl && historyCommands.length > 0) {
      rl.history = historyCommands;
    }

    return rl;
  }

  async handleInput(input: string): Promise<void> {
    const trimmedInput = input.trim();

    if (!trimmedInput) {
      return;
    }

    // Handle pending confirmation
    if (this.pendingConfirmation) {
      this.handleConfirmation(trimmedInput);
      return;
    }

    // Save command to persistent history
    await this.historyManager.addCommand(trimmedInput);

    // Input is ready for processing - this will be handled by the calling Shell
    // The Shell will call the appropriate processors based on the input type
  }

  handleConfirmation(input: string): void {
    const response = input.toLowerCase().trim();
    const isConfirmed = response === 'y' || response === 'yes' || response === 'confirm';

    if (this.pendingConfirmation) {
      if (isConfirmed) {
        console.log(chalk.green('✅ Confirmed. Executing action...'));
        // Execute the pending action
        // This would be implemented based on the specific action
      } else {
        console.log(chalk.yellow('❌ Action cancelled.'));
      }

      this.pendingConfirmation = null;
    }
  }

  completer(line: string): [string[], string] {
    // This will be injected with command names from the CommandParser
    const commands: string[] = [];
    const hits = commands.filter(cmd => cmd.startsWith(line));
    return [hits.length ? hits : commands, line];
  }

  // Updated to handle dependency injection for command completion
  setCommandNames(commands: string[]): void {
    this.completer = (line: string): [string[], string] => {
      const hits = commands.filter(cmd => cmd.startsWith(line));
      return [hits.length ? hits : commands, line];
    };
  }

  setupKeyboardShortcuts(rl: ReadlineWithHistory): void {
    // Enable keypress events for shortcuts but delay raw mode setup
    readline.emitKeypressEvents(process.stdin, rl);

    // Set up keypress handler for shortcuts
    process.stdin.on('keypress', (str: string, key: readline.Key | undefined) => {
      this.handleKeypress(str, key);
    });

    // Only set raw mode after readline is ready and if we're in TTY
    process.nextTick(() => {
      if (process.stdin.isTTY && this.isRunning) {
        try {
          process.stdin.setRawMode(true);
        } catch {
          // Ignore raw mode errors - shortcuts will still work
        }
      }
    });
  }

  handleKeypress(_str: string, key?: readline.Key): void {
    // Only handle shortcuts if we're running
    if (!this.isRunning) {
      return;
    }

    // Handle Shift+Tab to toggle autoExecute mode
    if (key?.name === 'tab' && key.shift) {
      // This will be handled by the calling Shell which has access to AIProviderFactory
      // We emit a custom event or use a callback mechanism
      return;
    }

    // Handle other potential shortcuts here in the future
  }

  handleInterrupt(): void {
    const now = Date.now();

    // Reset interrupt count if more than 2 seconds have passed
    if (now - this.lastInterruptTime > 2000) {
      this.interruptCount = 0;
    }

    this.interruptCount++;
    this.lastInterruptTime = now;

    if (this.interruptCount === 1) {
      console.log(chalk.yellow('\nUse /exit to quit or press Ctrl+C again to force exit.'));
      // The Shell will handle prompting
    } else {
      console.log(chalk.red('\nForce exit...'));
      // The Shell will handle exit
    }
  }

  async promptConfirmation(action: PendingAction, context?: Record<string, unknown>): Promise<void> {
    // Store pending confirmation state
    this.pendingConfirmation = { action, context };
    console.log(chalk.yellow('Please confirm the action (y/n):'));
  }

  setPendingConfirmation(state: PendingConfirmationState | null): void {
    this.pendingConfirmation = state;
  }

  getPendingConfirmation(): PendingConfirmationState | null {
    return this.pendingConfirmation;
  }

  setRunning(isRunning: boolean): void {
    this.isRunning = isRunning;
  }

  getRunning(): boolean {
    return this.isRunning;
  }

  private getPrompt(): string {
    return chalk.cyan('> ');
  }
}