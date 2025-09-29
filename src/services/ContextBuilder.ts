import 'reflect-metadata';
import { injectable, inject } from 'tsyringe';
import type { ProcessInfo } from '../pm2/PM2Client';

@injectable()
export class ContextBuilder {
  constructor(@inject('IPM2Client') private pm2Client: IPM2Client) {}

  async buildProcessContext(processName?: string): Promise<string> {
    const processes = await this.pm2Client.list();
    
    if (processName) {
      const process = processes.find(p => p.name === processName);

      if (!process) {
        throw new Error(`Process ${processName} not found`);
      }

      return this.buildSingleProcessContext(process);
    }
    
    return this.buildAllProcessesContext(processes);
  }

  private buildSingleProcessContext(process: ProcessInfo): string {
    const context = [];
    
    // Basic information
    context.push(`Process: ${process.name}`);
    context.push(`Status: ${process.pm2_env.status}`);
    context.push(`PID: ${process.pid || 'N/A'}`);
    
    // Performance metrics
    const memoryMB = (process.monit.memory || 0) / (1024 * 1024);
    context.push(`Memory: ${memoryMB.toFixed(1)}MB`);
    context.push(`CPU: ${process.monit.cpu || 0}%`);
    
    // Stability metrics
    context.push(`Restarts: ${process.pm2_env.restart_time || 0}`);
    context.push(`Unstable restarts: ${process.pm2_env.unstable_restarts || 0}`);
    
    // Uptime
    const uptime = this.calculateUptime(process.pm2_env.pm_uptime);
    context.push(`Uptime: ${uptime}`);
    
    // Configuration
    context.push(`Exec mode: ${process.pm2_env.exec_mode || 'fork'}`);
    context.push(`Instances: ${process.pm2_env.instances || 1}`);
    context.push(`Node version: ${process.pm2_env.node_version || 'unknown'}`);
    
    // Environment
    if (process.pm2_env.watching) {
      context.push('File watching: enabled');
    }
    
    if (process.pm2_env.max_memory_restart) {
      context.push(`Max memory restart: ${process.pm2_env.max_memory_restart}`);
    }
    
    return context.join('\n');
  }

  private buildAllProcessesContext(processes: ProcessInfo[]): string {
    const context = [];
    
    // Summary
    const onlineCount = processes.filter(p => p.pm2_env.status === 'online').length;
    const erroredCount = processes.filter(p => p.pm2_env.status === 'errored').length;
    const stoppedCount = processes.filter(p => p.pm2_env.status === 'stopped').length;
    
    context.push(`Total ${processes.length === 1 ? 'process' : 'processes'}: ${processes.length}`);
    context.push(`Online: ${onlineCount}, Errored: ${erroredCount}, Stopped: ${stoppedCount}`);
    
    // Overall resource usage
    const totalCPU = processes.reduce((sum, p) => sum + (p.monit.cpu || 0), 0);
    const totalMemory = processes.reduce((sum, p) => sum + (p.monit.memory || 0), 0);
    const totalMemoryMB = totalMemory / (1024 * 1024);
    
    context.push(`Total CPU usage: ${totalCPU.toFixed(1)}%`);
    context.push(`Total memory usage: ${totalMemoryMB.toFixed(1)}MB`);
    
    // Process list with key metrics
    context.push('\nProcess details:');
    processes.forEach(p => {
      const memMB = (p.monit.memory || 0) / (1024 * 1024);
      context.push(`- ${p.name}: ${p.pm2_env.status}, CPU: ${p.monit.cpu || 0}%, Memory: ${memMB.toFixed(1)}MB, Restarts: ${p.pm2_env.restart_time || 0}`);
    });
    
    // Issues summary
    const issues = this.identifyIssues(processes);

    if (issues.length > 0) {
      context.push('\nIdentified issues:');
      issues.forEach(issue => context.push(`- ${issue}`));
    }
    
    return context.join('\n');
  }

  private identifyIssues(processes: ProcessInfo[]): string[] {
    const issues: string[] = [];
    
    processes.forEach(p => {
      // High memory usage
      const memMB = (p.monit.memory || 0) / (1024 * 1024);
      
      if (memMB > 500) {
        issues.push(`${p.name}: High memory usage (${memMB.toFixed(1)}MB)`);
      }
      
      // High CPU usage
      if ((p.monit.cpu || 0) > 80) {
        issues.push(`${p.name}: High CPU usage (${p.monit.cpu}%)`);
      }
      
      // Frequent restarts
      if ((p.pm2_env.restart_time || 0) > 5) {
        issues.push(`${p.name}: Frequent restarts (${p.pm2_env.restart_time} times)`);
      }
      
      // Errored status
      if (p.pm2_env.status === 'errored') {
        issues.push(`${p.name}: Process in error state`);
      }
      
      // Unstable
      if ((p.pm2_env.unstable_restarts || 0) > 0) {
        issues.push(`${p.name}: Unstable (${p.pm2_env.unstable_restarts} unstable restarts)`);
      }
    });
    
    return issues;
  }

  private calculateUptime(timestamp: number | null | undefined): string {
    if (!timestamp) return 'N/A';
    
    const now = Date.now();
    const uptime = now - timestamp;
    const seconds = Math.floor(uptime / 1000);
    
    if (seconds < 60) return `${seconds}s`;
    
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m`;
    
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }

  buildErrorContext(processName?: string): string {
    // This would ideally fetch recent error logs
    // For now, we'll return a placeholder
    return `Recent errors for ${processName || 'all processes'} would be included here`;
  }

  buildHistoricalContext(processName?: string): string {
    // This would fetch historical metrics if available
    return `Historical trends for ${processName || 'all processes'} would be included here`;
  }
}
