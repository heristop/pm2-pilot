import 'reflect-metadata';
import { injectable, inject } from 'tsyringe';
import chalk from 'chalk';
import { BaseCommand } from './BaseCommand';
import type { ProcessInfo } from '../pm2/PM2Client';
import type { IPM2Client } from '../interfaces/IPM2Client';
import type { IRenderer } from '../interfaces/IRenderer';

@injectable()
export class MetricsCommand extends BaseCommand {
  public readonly name = 'metrics';
  public readonly description = 'Show system metrics for PM2 processes';
  public readonly aliases = ['m'];

  constructor(
    @inject('IRenderer') private renderer: IRenderer,
    @inject('IPM2Client') private pm2Client: IPM2Client
  ) {
    super();
  }

  public async execute(): Promise<void> {
    try {
      const processes = await this.pm2Client.list();
      
      if (processes.length === 0) {
        console.log(chalk.gray('No PM2 processes running'));
        return;
      }

      console.log(chalk.blue.bold('\n📊 PM2 System Metrics\n'));

      let totalCPU = 0;
      let totalMemory = 0;
      const onlineProcesses = processes.filter(p => p.pm2_env.status === 'online');

      processes.forEach(process => {
        totalCPU += process.monit.cpu || 0;
        totalMemory += process.monit.memory || 0;
      });

      const systemMetrics = [
        ['Total Processes', processes.length.toString()],
        ['Online Processes', chalk.green(onlineProcesses.length.toString())],
        ['Offline Processes', chalk.red((processes.length - onlineProcesses.length).toString())],
        ['Total CPU Usage', `${totalCPU.toFixed(2)}%`],
        ['Total Memory Usage', this.renderer.formatMemory(totalMemory)],
        ['Average CPU per Process', `${(totalCPU / processes.length || 0).toFixed(2)}%`],
        ['Average Memory per Process', this.renderer.formatMemory(totalMemory / processes.length || 0)]
      ];

      const maxLabelWidth = Math.max(...systemMetrics.map(([label]) => label!.length));
      
      systemMetrics.forEach(([label, value]) => {
        const paddedLabel = chalk.cyan(label!.padEnd(maxLabelWidth));
        console.log(`  ${paddedLabel}: ${value}`);
      });

      console.log();

      console.log(chalk.blue.bold('📈 Process Breakdown:\n'));

      const columns = [
        { header: 'Name', key: 'name', width: 20 },
        { 
          header: 'Status', 
          key: 'pm2_env.status',
          width: 12,
          format: (status: unknown) => this.renderer.colorizeStatus(status as string)
        },
        { 
          header: 'CPU %', 
          key: 'monit.cpu',
          width: 8,
          align: 'right' as const,
          format: (cpu: unknown) => `${((cpu as number) || 0).toFixed(1)}%`
        },
        { 
          header: 'Memory', 
          key: 'monit.memory',
          width: 10,
          align: 'right' as const,
          format: (memory: unknown) => this.renderer.formatMemory((memory as number) || 0)
        },
        { 
          header: 'Uptime', 
          key: 'pm2_env.pm_uptime',
          width: 12,
          format: (uptime: unknown) => this.renderer.formatUptime(uptime as number)
        },
        { 
          header: 'Restarts', 
          key: 'pm2_env.restart_time',
          width: 9,
          align: 'right' as const
        }
      ];

      this.renderer.renderTable(processes, columns);

      const healthScore = this.calculateHealthScore(processes);
      console.log();
      console.log(`${chalk.blue('System Health Score:')} ${this.formatHealthScore(healthScore)}`);
      console.log();

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Failed to get metrics: ${message}`));
    }
  }

  private calculateHealthScore(processes: ProcessInfo[]): number {
    if (processes.length === 0) return 100;

    const onlineCount = processes.filter(p => p.pm2_env.status === 'online').length;
    const erroredCount = processes.filter(p => p.pm2_env.status === 'errored').length;
    const avgRestarts = processes.reduce((sum, p) => sum + (p.pm2_env.restart_time || 0), 0) / processes.length;
    
    let score = 100;
    
    score -= (processes.length - onlineCount) * 20;
    score -= erroredCount * 30;
    score -= Math.min(avgRestarts * 2, 30);
    
    return Math.max(0, Math.round(score));
  }

  private formatHealthScore(score: number): string {
    if (score >= 90) return chalk.green(`${score}/100 (Excellent)`);
    if (score >= 70) return chalk.yellow(`${score}/100 (Good)`);
    if (score >= 50) return chalk.hex('#FFA500')(`${score}/100 (Fair)`);
    return chalk.red(`${score}/100 (Poor)`);
  }
}
