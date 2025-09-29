import 'reflect-metadata';
import { injectable, inject } from 'tsyringe';
import chalk from 'chalk';
import { BaseCommand } from './BaseCommand';
import type { IPM2Client } from '../interfaces/IPM2Client';

interface WatchConfig {
  memoryThreshold: number; // MB
  cpuThreshold: number; // percentage
  restartLimit: number; // max restarts before alert
  checkInterval: number; // ms
}

@injectable()
export class WatchCommand extends BaseCommand {
  public readonly name = 'watch';
  public readonly description = 'Monitor and auto-recover processes';
  public readonly aliases = ['w'];
  private watchInterval: NodeJS.Timeout | null = null;
  private watchedProcesses = new Map<string, WatchConfig>();
  private restartCounts = new Map<string, number>();

  constructor(@inject('IPM2Client') private pm2Client: IPM2Client) {
    super();
  }

  public execute(args: string[]): void {
    if (args.length === 0) {
      console.log(chalk.red('Usage: /watch <process-name> [memory-threshold-mb] [cpu-threshold-%]'));
      console.log(chalk.gray('Example: /watch my-app 500 80'));
      console.log(chalk.gray('Stop watching: /watch stop'));
      return;
    }

    if (args[0] === 'stop') {
      this.stopWatching();
      return;
    }

    const processName = args[0]!; // Safe because we checked args.length > 0
    const memoryThreshold = parseInt(args[1] || '500');
    const cpuThreshold = parseInt(args[2] || '80');

    const config: WatchConfig = {
      memoryThreshold,
      cpuThreshold,
      restartLimit: 3,
      checkInterval: 5000
    };

    this.watchedProcesses.set(processName, config);
    this.restartCounts.set(processName, 0);

    console.log(chalk.blue.bold(`\n👁️  Watching process: ${processName}`));
    console.log(chalk.gray(`Memory threshold: ${memoryThreshold}MB`));
    console.log(chalk.gray(`CPU threshold: ${cpuThreshold}%`));
    console.log(chalk.gray(`Auto-restart on threshold breach: enabled`));
    console.log(chalk.gray(`Check interval: ${config.checkInterval}ms\n`));

    if (!this.watchInterval) {
      this.startWatching();
    }
  }

  private startWatching(): void {
    this.watchInterval = setInterval(() => {
      (async () => {
        for (const [processName, config] of this.watchedProcesses) {
          await this.checkProcess(processName, config);
        }
      })().catch((error) => {
        console.error('Error during watch check:', error);
      });
    }, 5000);

    console.log(chalk.green('✓ Auto-recovery watch started'));
  }

  private async checkProcess(processName: string, config: WatchConfig): Promise<void> {
    try {
      const processes = await this.pm2Client.describe(processName);
      
      if (processes.length === 0) {
        console.log(chalk.yellow(`⚠️  Process ${processName} not found`));
        return;
      }

      const process = processes[0]!;
      const memoryMB = (process.monit.memory || 0) / (1024 * 1024);
      const cpu = process.monit.cpu || 0;
      const status = process.pm2_env.status;

      // Check if process needs recovery
      if (status === 'errored' || status === 'stopped') {
        console.log(chalk.red(`🔥 Process ${processName} is ${status}. Attempting recovery...`));
        await this.recoverProcess(processName, config);
        return;
      }

      // Check memory threshold
      if (memoryMB > config.memoryThreshold) {
        console.log(chalk.yellow(`⚠️  Memory alert: ${processName} using ${memoryMB.toFixed(1)}MB (threshold: ${config.memoryThreshold}MB)`));
        await this.recoverProcess(processName, config);
        return;
      }

      // Check CPU threshold
      if (cpu > config.cpuThreshold) {
        console.log(chalk.yellow(`⚠️  CPU alert: ${processName} at ${cpu}% (threshold: ${config.cpuThreshold}%)`));
        // For CPU, we might just log a warning instead of restarting
        this.sendNotification(`High CPU usage on ${processName}: ${cpu}%`);
      }

    } catch (error) {
      console.error(chalk.red(`Failed to check ${processName}:`, error));
    }
  }

  private async recoverProcess(processName: string, config: WatchConfig): Promise<void> {
    const restartCount = this.restartCounts.get(processName) || 0;
    
    if (restartCount >= config.restartLimit) {
      console.log(chalk.red(`🛑 Max restart limit reached for ${processName}. Manual intervention required.`));
      this.sendNotification(`CRITICAL: ${processName} exceeded restart limit!`);
      this.watchedProcesses.delete(processName);
      return;
    }

    try {
      console.log(chalk.yellow(`♻️  Restarting ${processName}...`));
      await this.pm2Client.restart(processName);
      this.restartCounts.set(processName, restartCount + 1);
      console.log(chalk.green(`✓ ${processName} restarted successfully (${restartCount + 1}/${config.restartLimit})`));
      
      // Reset counter after successful period
      setTimeout(() => {
        this.restartCounts.set(processName, 0);
      }, 60000); // Reset after 1 minute of stability
      
    } catch (error) {
      console.error(chalk.red(`Failed to restart ${processName}:`, error));
    }
  }

  private sendNotification(message: string): void {
    // This will be enhanced with actual notifications later
    console.log(chalk.bgYellow.black(` ALERT: ${message} `));
  }

  private stopWatching(): void {
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
      this.watchedProcesses.clear();
      this.restartCounts.clear();
      console.log(chalk.yellow('⏹️  Stopped watching all processes'));
    } else {
      console.log(chalk.gray('No processes are being watched'));
    }
  }
}
