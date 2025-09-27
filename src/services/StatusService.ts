import { injectable, inject } from 'tsyringe';
import chalk from 'chalk';
import type { IPM2Client } from '../interfaces/IPM2Client';
import type { IRenderer } from '../interfaces/IRenderer';
import type { IStatusService } from '../interfaces/IStatusService';

export interface StatusDisplayResult {
  success: boolean;
  hasProcesses: boolean;
  message?: string;
}

@injectable()
export class StatusService implements IStatusService {
  constructor(
    @inject('IPM2Client') private client: IPM2Client,
    @inject('IRenderer') private renderer: IRenderer
  ) {}

  async displayAllProcesses(): Promise<StatusDisplayResult> {
    try {
      const processes = await this.client.list();
      
      if (processes.length === 0) {
        console.log(chalk.gray('No PM2 processes running'));
        return { success: true, hasProcesses: false };
      }

      console.log(chalk.blue.bold('\n📊 PM2 Process Status:\n'));
      this.renderer.renderProcessList(processes);
      
      const online = processes.filter(p => p.pm2_env.status === 'online').length;
      const total = processes.length;
      console.log();
      console.log(chalk.gray(`Total ${total === 1 ? 'process' : 'processes'}: ${total} | Online: ${chalk.green(online)} | Offline: ${chalk.red(total - online)}`));
      console.log();
      
      return { success: true, hasProcesses: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Failed to get status: ${message}`));
      return { success: false, hasProcesses: false, message };
    }
  }

  async displayProcessByName(processName: string): Promise<StatusDisplayResult> {
    try {
      const processes = await this.client.list();
      
      if (processes.length === 0) {
        console.log(chalk.gray('No PM2 processes running'));
        return { success: true, hasProcesses: false };
      }

      const filtered = processes.filter(p => 
        p.name.toLowerCase().includes(processName.toLowerCase())
      );
      
      if (filtered.length === 0) {
        console.log(chalk.red(`No processes found matching "${processName}"`));
        return { success: true, hasProcesses: false };
      }
      
      if (filtered.length === 1) {
        const [singleProcess] = filtered;
        if (singleProcess) {
          this.renderer.renderProcessDetail(singleProcess);
        }
      } else {
        console.log(chalk.blue.bold(`\n🔍 Processes matching "${processName}":\n`));
        this.renderer.renderProcessList(filtered);
      }
      
      console.log();
      return { success: true, hasProcesses: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Failed to get status: ${message}`));
      return { success: false, hasProcesses: false, message };
    }
  }

  async getProcessSummary(): Promise<{ hasProcesses: boolean; totalCount: number; onlineCount: number }> {
    try {
      const processes = await this.client.list();
      const onlineProcesses = processes.filter(p => p.pm2_env.status === 'online');
      
      return {
        hasProcesses: processes.length > 0,
        totalCount: processes.length,
        onlineCount: onlineProcesses.length
      };
    } catch {
      return {
        hasProcesses: false,
        totalCount: 0,
        onlineCount: 0
      };
    }
  }
}
