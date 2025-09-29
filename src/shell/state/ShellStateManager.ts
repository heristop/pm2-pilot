import { injectable, inject } from 'tsyringe';
import chalk from 'chalk';
import { AIProviderFactory } from '../../services/AIProviderFactory';
import type { IPM2Client } from '../../interfaces/IPM2Client';

export interface IShellStateManager {
  isRunning(): boolean;
  setRunning(running: boolean): void;
  isAutoExecuteEnabled(): boolean;
  toggleAutoExecuteMode(): Promise<boolean>;
  showAutoExecuteModeSwitch(): void;
  cleanup(): Promise<void>;
}

@injectable()
export class ShellStateManager implements IShellStateManager {
  private running = false;

  constructor(
    @inject('AIProviderFactory') private aiProviderFactory: AIProviderFactory,
    @inject('IPM2Client') private pm2Client: IPM2Client
  ) {}

  isRunning(): boolean {
    return this.running;
  }

  setRunning(running: boolean): void {
    this.running = running;
  }

  isAutoExecuteEnabled(): boolean {
    return this.aiProviderFactory.isAutoExecuteEnabled();
  }

  async toggleAutoExecuteMode(): Promise<boolean> {
    const newMode = await this.aiProviderFactory.toggleAutoExecute();
    return newMode;
  }

  showAutoExecuteModeSwitch(): void {
    const autoMode = this.aiProviderFactory.isAutoExecuteEnabled();

    // Show immediate mode switch feedback
    const modeText = autoMode ? chalk.green('⚡ Auto-execute') : chalk.yellow('🛡️ Ask first');
    console.log(chalk.blue(`🔄 Mode switched to: ${modeText}`));
  }

  async cleanup(): Promise<void> {
    console.log(chalk.blue('Goodbye! 👋'));
    this.running = false;

    // Clean up raw mode if it was enabled
    if (process.stdin.isTTY) {
      try {
        process.stdin.setRawMode(false);
      } catch {
        // Ignore cleanup errors
      }
    }

    if (this.pm2Client) {
      await this.pm2Client.disconnect();
    }
  }
}