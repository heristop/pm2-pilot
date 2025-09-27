import 'reflect-metadata';
import { injectable, inject } from 'tsyringe';
import chalk from 'chalk';
import { BaseCommand } from './BaseCommand';
import type { ProcessInfo } from '../types/pm2';
import type { IPM2Client } from '../interfaces/IPM2Client';

interface HealthCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  details?: string;
}

@injectable()
export class HealthCommand extends BaseCommand {
  public readonly name = 'health';
  public readonly description = 'Run health checks on PM2 processes';
  public readonly aliases = ['check'];

  constructor(
    @inject('IPM2Client') private pm2Client: IPM2Client,
    @inject('IRenderer') private renderer: IRenderer
  ) {
    super();
  }

  public async execute(args: string[]): Promise<void> {
    const processName = args[0];
    
    try {
      const processes = await this.pm2Client.list();
      
      if (processes.length === 0) {
        console.log(chalk.gray('No PM2 processes running'));
        return;
      }

      const targetProcesses = processName
        ? processes.filter(p => p.name === processName)
        : processes;

      if (targetProcesses.length === 0) {
        console.log(chalk.red(`Process "${processName}" not found`));
        return;
      }

      console.log(chalk.blue.bold('\n🏥 PM2 Health Check Report\n'));

      let totalScore = 0;
      let maxScore = 0;

      for (const process of targetProcesses) {
        const checks = this.runHealthChecks(process);
        const { score, max } = this.displayHealthChecks(process.name, checks);
        totalScore += score;
        maxScore += max;
      }

      // Overall health score
      const percentage = Math.round((totalScore / maxScore) * 100);
      console.log(chalk.blue.bold('\n📊 Overall Health Score:'));
      this.displayHealthBar(percentage);
      console.log();

      // Recommendations
      if (percentage < 50) {
        console.log(chalk.red.bold('⚠️  Critical Issues Detected:'));
        console.log(chalk.red('  • Multiple processes need attention'));
        console.log(chalk.red('  • Consider running /all restart for recovery'));
      } else if (percentage < 80) {
        console.log(chalk.yellow.bold('⚠️  Some Issues Detected:'));
        console.log(chalk.yellow('  • Review individual process health'));
        console.log(chalk.yellow('  • Monitor for recurring issues'));
      } else {
        console.log(chalk.green.bold('✅ System Health: Good'));
        console.log(chalk.green('  • All processes running smoothly'));
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Failed to run health checks: ${message}`));
    }
  }

  private runHealthChecks(process: ProcessInfo): HealthCheck[] {
    const checks: HealthCheck[] = [];

    // Check 1: Process Status
    checks.push({
      name: 'Process Status',
      status: process.pm2_env.status === 'online' ? 'pass' : 'fail',
      message: `Status: ${process.pm2_env.status}`,
      details: process.pm2_env.status !== 'online' ? 'Process is not running' : undefined
    });

    // Check 2: Memory Usage
    const memoryMB = (process.monit.memory || 0) / (1024 * 1024);
    const memoryThreshold = 500; // MB
    checks.push({
      name: 'Memory Usage',
      status: memoryMB < memoryThreshold ? 'pass' : memoryMB < memoryThreshold * 1.5 ? 'warn' : 'fail',
      message: `Using ${memoryMB.toFixed(1)}MB`,
      details: memoryMB > memoryThreshold ? `Exceeds threshold of ${memoryThreshold}MB` : undefined
    });

    // Check 3: CPU Usage
    const cpu = process.monit.cpu || 0;
    checks.push({
      name: 'CPU Usage',
      status: cpu < 70 ? 'pass' : cpu < 90 ? 'warn' : 'fail',
      message: `${cpu}% CPU`,
      details: cpu > 70 ? 'High CPU usage detected' : undefined
    });

    // Check 4: Restart Frequency
    const restarts = process.pm2_env.restart_time || 0;
    checks.push({
      name: 'Restart Stability',
      status: restarts < 3 ? 'pass' : restarts < 10 ? 'warn' : 'fail',
      message: `${restarts} restarts`,
      details: restarts > 3 ? 'Frequent restarts detected' : undefined
    });

    // Check 5: Uptime
    const uptime = Date.now() - (process.pm2_env.pm_uptime || Date.now());
    const uptimeMinutes = uptime / (1000 * 60);
    checks.push({
      name: 'Uptime',
      status: uptimeMinutes > 60 ? 'pass' : uptimeMinutes > 10 ? 'warn' : 'fail',
      message: this.renderer.formatUptime(process.pm2_env.pm_uptime || Date.now()),
      details: uptimeMinutes < 10 ? 'Recently started or restarted' : undefined
    });

    // Check 6: Error Rate (if we had error logs)
    const unstableRestarts = process.pm2_env.unstable_restarts || 0;
    checks.push({
      name: 'Error Recovery',
      status: unstableRestarts === 0 ? 'pass' : unstableRestarts < 3 ? 'warn' : 'fail',
      message: `${unstableRestarts} unstable restarts`,
      details: unstableRestarts > 0 ? 'Process has been unstable' : undefined
    });

    return checks;
  }

  private displayHealthChecks(processName: string, checks: HealthCheck[]): { score: number, max: number } {
    console.log(chalk.cyan(`\n📍 ${processName}:`));
    
    let score = 0;
    const max = checks.length * 2; // 2 points per check

    checks.forEach(check => {
      const icon = this.getStatusIcon(check.status);
      const color = this.getStatusColor(check.status);
      
      console.log(`  ${icon} ${color(check.name)}: ${check.message}`);
      if (check.details) {
        console.log(chalk.gray(`     └─ ${check.details}`));
      }

      // Calculate score
      if (check.status === 'pass') score += 2;
      else if (check.status === 'warn') score += 1;
    });

    const percentage = Math.round((score / max) * 100);
    console.log(chalk.gray(`  Health Score: ${percentage}%`));

    return { score, max };
  }

  private getStatusIcon(status: 'pass' | 'warn' | 'fail'): string {
    switch (status) {
      case 'pass': return chalk.green('✓');
      case 'warn': return chalk.yellow('⚠');
      case 'fail': return chalk.red('✗');
    }
  }

  private getStatusColor(status: 'pass' | 'warn' | 'fail'): (text: string) => string {
    switch (status) {
      case 'pass': return chalk.green;
      case 'warn': return chalk.yellow;
      case 'fail': return chalk.red;
    }
  }

  private displayHealthBar(percentage: number): void {
    const barLength = 30;
    const filled = Math.round((percentage / 100) * barLength);
    const empty = barLength - filled;
    
    let color: (text: string) => string;
    if (percentage >= 80) color = chalk.green;
    else if (percentage >= 50) color = chalk.yellow;
    else color = chalk.red;
    
    const bar = color('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
    console.log(`  ${bar} ${color(`${percentage}%`)}`);
  }
}
