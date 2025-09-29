import type { Shell } from '../shell/Shell';
import type { Action } from './AIInputRouter';
import type { ProcessInfo } from '../pm2/PM2Client';
import { PM2Manager } from './PM2Manager';

export interface ExecutionResult {
  success: boolean;
  message: string;
  data?: unknown;
  requiresConfirmation?: boolean;
  confirmationPrompt?: string;
}

export interface ExecutionContext {
  shell: Shell;
  userConfirmed?: boolean;
  skipConfirmation?: boolean;
}

export class CommandExecutor {
  private pm2Manager: PM2Manager;

  constructor(private shell: Shell) {
    this.pm2Manager = new PM2Manager(shell.client);
  }

  async executeAction(action: Action, context?: Partial<ExecutionContext>): Promise<ExecutionResult> {
    const execContext: ExecutionContext = {
      shell: this.shell,
      ...context
    };

    // Check if confirmation is needed
    if (this.needsConfirmation(action) && !execContext.skipConfirmation && !execContext.userConfirmed) {
      return {
        success: false,
        message: 'Confirmation required',
        requiresConfirmation: true,
        confirmationPrompt: this.generateConfirmationPrompt(action)
      };
    }

    try {
      switch (action.type) {
        case 'restart':
          return await this.executeRestart(action, execContext);
        case 'stop':
          return await this.executeStop(action, execContext);
        case 'start':
          return await this.executeStart(action, execContext);
        case 'status':
          return await this.executeStatus(action, execContext);
        case 'logs':
          return this.executeLogs(action);
        case 'metrics':
          return await this.executeMetrics(action, execContext);
        case 'info':
          return await this.executeInfo(action, execContext);
        default: {
          const exhaustiveCheck: never = action.type;
          void exhaustiveCheck;
          return {
            success: false,
            message: 'Unknown action type'
          };
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Failed to execute ${action.type}: ${message}`
      };
    }
  }

  async executeMultipleActions(actions: Action[], context?: Partial<ExecutionContext>): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];
    
    for (const action of actions) {
      const result = await this.executeAction(action, context);
      results.push(result);
      
      // Stop execution if an action failed and it's not safe to continue
      if (!result.success && action.safety === 'dangerous') {
        break;
      }
    }
    
    return results;
  }

  private needsConfirmation(action: Action): boolean {
    return action.safety === 'dangerous' || 
           (action.safety === 'caution' && action.target === 'all');
  }

  private generateConfirmationPrompt(action: Action): string {
    const safetyEmoji = action.safety === 'dangerous' ? '⚠️' : '🤔';
    
    if (action.target === 'all') {
      return `${safetyEmoji} Are you sure you want to ${action.type} ALL processes? This will affect your entire PM2 setup. (y/N)`;
    }
    
    if (action.target) {
      return `${safetyEmoji} Are you sure you want to ${action.type} "${action.target}"? (y/N)`;
    }
    
    return `${safetyEmoji} Are you sure you want to execute ${action.type}? (y/N)`;
  }

  private async executeRestart(action: Action, _context: ExecutionContext): Promise<ExecutionResult> {
    if (action.target === 'all') {
      const result = await this.pm2Manager.restartAll();
      return {
        success: result.success,
        message: result.message,
        data: result.processCount ? { processCount: result.processCount } : undefined
      };
    } else if (action.target) {
      const result = await this.pm2Manager.restartProcess(action.target);
      return {
        success: result.success,
        message: result.message
      };
    } else {
      return {
        success: false,
        message: 'No target specified for restart action'
      };
    }
  }

  private async executeStop(action: Action, _context: ExecutionContext): Promise<ExecutionResult> {
    if (action.target === 'all') {
      const result = await this.pm2Manager.stopAll();
      return {
        success: result.success,
        message: result.message,
        data: result.processCount ? { processCount: result.processCount } : undefined
      };
    } else if (action.target) {
      const result = await this.pm2Manager.stopProcess(action.target);
      return {
        success: result.success,
        message: result.message
      };
    } else {
      return {
        success: false,
        message: 'No target specified for stop action'
      };
    }
  }

  private async executeStart(action: Action, context: ExecutionContext): Promise<ExecutionResult> {
    if (action.target === 'all') {
      try {
        const processes = await context.shell.client.list();
        const stoppedProcesses = processes.filter(p => p.pm2_env.status === 'stopped');
        
        if (stoppedProcesses.length === 0) {
          return {
            success: true,
            message: 'No stopped processes to start'
          };
        }

        await context.shell.client.start('all');
        return {
          success: true,
          message: `✅ Started ${stoppedProcesses.length} processes successfully`,
          data: { processCount: stoppedProcesses.length }
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          message: `❌ Failed to start: ${message}`
        };
      }
    } else if (action.target) {
      const result = await this.pm2Manager.startProcess(action.target);
      return {
        success: result.success,
        message: result.message
      };
    } else {
      return {
        success: false,
        message: 'No target specified for start action'
      };
    }
  }

  private async executeStatus(action: Action, context: ExecutionContext): Promise<ExecutionResult> {
    try {
      const processes = await context.shell.client.list();
      
      if (action.target && action.target !== 'all') {
        const process = processes.find(p => p.name === action.target);
        if (!process) {
          return {
            success: false,
            message: `❌ Process "${action.target}" not found`
          };
        }

        const status = this.formatProcessStatus(process);
        return {
          success: true,
          message: status,
          data: process
        };
      } else {
        // Show all processes status
        if (processes.length === 0) {
          return {
            success: true,
            message: 'No PM2 processes running'
          };
        }

        const statusSummary = this.formatProcessListStatus(processes);
        return {
          success: true,
          message: statusSummary,
          data: processes
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `❌ Failed to get status: ${message}`
      };
    }
  }

  private executeLogs(action: Action): ExecutionResult {
    try {
      if (!action.target || action.target === 'all') {
        return {
          success: false,
          message: 'Please specify a process name for logs. Use: logs <process-name>'
        };
      }

      // Note: This would typically start log streaming, but for AI responses we'll return a message
      return {
        success: true,
        message: `📜 Starting log stream for "${action.target}". Use /logs ${action.target} to see live logs.`
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `❌ Failed to access logs: ${message}`
      };
    }
  }

  private async executeMetrics(action: Action, context: ExecutionContext): Promise<ExecutionResult> {
    try {
      const processes = await context.shell.client.list();
      
      if (action.target && action.target !== 'all') {
        const process = processes.find(p => p.name === action.target);
        if (!process) {
          return {
            success: false,
            message: `❌ Process "${action.target}" not found`
          };
        }

        const metrics = this.formatProcessMetrics(process);
        return {
          success: true,
          message: metrics,
          data: process.monit
        };
      } else {
        const metrics = this.formatSystemMetrics(processes);
        return {
          success: true,
          message: metrics,
          data: processes.map(p => ({ name: p.name, ...p.monit }))
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `❌ Failed to get metrics: ${message}`
      };
    }
  }

  private async executeInfo(action: Action, context: ExecutionContext): Promise<ExecutionResult> {
    return this.executeStatus(action, context);
  }

  private formatProcessStatus(process: ProcessInfo): string {
    const status = process.pm2_env.status;
    const colorizedStatus = this.shell.display.colorizeStatus(status);
    const memoryMB = (process.monit.memory ?? 0) / (1024 * 1024);
    const cpu = process.monit.cpu ?? 0;
    
    return `📊 ${process.name}: ${colorizedStatus}\n` +
           `   💾 Memory: ${memoryMB.toFixed(1)}MB\n` +
           `   🔥 CPU: ${cpu.toFixed(1)}%\n` +
           `   🔄 Restarts: ${process.pm2_env.restart_time || 0}`;
  }

  private formatProcessListStatus(processes: ProcessInfo[]): string {
    const online = processes.filter(p => p.pm2_env.status === 'online').length;
    const stopped = processes.filter(p => p.pm2_env.status === 'stopped').length;
    const errored = processes.filter(p => p.pm2_env.status === 'errored').length;
    
    let summary = `📈 Process Summary: ${processes.length} total\n`;
    summary += `   ✅ Online: ${online}\n`;
    if (stopped > 0) summary += `   ⏹️  Stopped: ${stopped}\n`;
    if (errored > 0) summary += `   ❌ Errored: ${errored}\n`;
    
    return summary;
  }

  private formatProcessMetrics(process: ProcessInfo): string {
    const memoryMB = (process.monit.memory ?? 0) / (1024 * 1024);
    const cpu = process.monit.cpu ?? 0;
    
    return `📊 Metrics for ${process.name}:\n` +
           `   💾 Memory: ${memoryMB.toFixed(1)}MB\n` +
           `   🔥 CPU: ${cpu.toFixed(1)}%\n` +
           `   📈 Status: ${process.pm2_env.status}`;
  }

  private formatSystemMetrics(processes: ProcessInfo[]): string {
    const totalMemory = processes.reduce((sum, p) => sum + (p.monit.memory ?? 0), 0) / (1024 * 1024);
    const totalCPU = processes.reduce((sum, p) => sum + (p.monit.cpu ?? 0), 0);
    
    return `📊 System Metrics:\n` +
           `   💾 Total Memory: ${totalMemory.toFixed(1)}MB\n` +
           `   🔥 Total CPU: ${totalCPU.toFixed(1)}%\n` +
           `   📦 Processes: ${processes.length}`;
  }
}
