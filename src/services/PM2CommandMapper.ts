import { injectable, inject } from 'tsyringe';
import type { CommandAnalysis } from './CommandAnalyzer';
import type { LogEntry, ProcessInfo } from '../pm2/PM2Client';

export interface PM2Command {
  command: string;
  args: string[];
  description: string;
  safety: 'safe' | 'caution' | 'dangerous';
  requiresTarget: boolean;
  availableTargets?: string[];
}

export interface ExecutionResult {
  success: boolean;
  message: string;
  output?: string;
  error?: string;
  command?: string;
}

@injectable()
export class PM2CommandMapper {
  private commandMap: Map<string, PM2Command> = new Map();

  constructor(@inject('IPM2Client') private pm2Client: IPM2Client) {
    this.initializeCommandMap();
  }

  private initializeCommandMap(): void {
    // Process management commands
    this.commandMap.set('restart_process', {
      command: 'pm2',
      args: ['restart'],
      description: 'Restart processes',
      safety: 'caution',
      requiresTarget: true
    });

    this.commandMap.set('stop_process', {
      command: 'pm2', 
      args: ['stop'],
      description: 'Stop processes',
      safety: 'dangerous',
      requiresTarget: true
    });

    this.commandMap.set('start_process', {
      command: 'pm2',
      args: ['start'],
      description: 'Start processes',
      safety: 'caution',
      requiresTarget: true
    });

    this.commandMap.set('reload_process', {
      command: 'pm2',
      args: ['reload'],
      description: 'Graceful reload processes',
      safety: 'caution',
      requiresTarget: true
    });

    this.commandMap.set('delete_process', {
      command: 'pm2',
      args: ['delete'],
      description: 'Delete processes',
      safety: 'dangerous',
      requiresTarget: true
    });

    // Information commands
    this.commandMap.set('show_status', {
      command: 'pm2',
      args: ['status'],
      description: 'Show process status',
      safety: 'safe',
      requiresTarget: false
    });

    this.commandMap.set('show_list', {
      command: 'pm2',
      args: ['list'],
      description: 'List all processes',
      safety: 'safe',
      requiresTarget: false
    });

    this.commandMap.set('show_logs', {
      command: 'pm2',
      args: ['logs'],
      description: 'Show process logs',
      safety: 'safe',
      requiresTarget: false
    });

    this.commandMap.set('show_error_logs', {
      command: 'pm2',
      args: ['error_logs'],
      description: 'Show error logs only',
      safety: 'safe',
      requiresTarget: false
    });

    this.commandMap.set('show_info', {
      command: 'pm2',
      args: ['info'],
      description: 'Show detailed process information',
      safety: 'safe',
      requiresTarget: true
    });

    this.commandMap.set('show_monit', {
      command: 'pm2',
      args: ['monit'],
      description: 'Monitor processes',
      safety: 'safe',
      requiresTarget: false
    });

    // System commands
    this.commandMap.set('save_config', {
      command: 'pm2',
      args: ['save'],
      description: 'Save current process list',
      safety: 'safe',
      requiresTarget: false
    });

    this.commandMap.set('startup_config', {
      command: 'pm2',
      args: ['startup'],
      description: 'Setup startup script',
      safety: 'caution',
      requiresTarget: false
    });
  }

  async mapToCommand(analysis: CommandAnalysis): Promise<PM2Command | null> {
    const command = this.commandMap.get(analysis.intent);
    
    if (!command) {
      return null;
    }

    // Clone the command to avoid modifying the original
    const mappedCommand: PM2Command = {
      ...command,
      args: [...command.args]
    };

    // Add target if provided and required
    if (command.requiresTarget && analysis.parameters.target) {
      mappedCommand.args.push(analysis.parameters.target);
    }

    // Get available targets for validation
    if (command.requiresTarget) {
      mappedCommand.availableTargets = await this.getAvailableProcesses();
    }

    return mappedCommand;
  }

  async executeCommand(command: PM2Command): Promise<ExecutionResult> {
    try {
      const fullCommand = `${command.command} ${command.args.join(' ')}`;
      
      // Use the shell's PM2 client for execution
      const result = await this.executeViaPM2Client(command);
      
      return {
        success: true,
        message: `✅ ${command.description} completed successfully`,
        output: result,
        command: fullCommand
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return {
        success: false,
        message: `❌ ${command.description} failed: ${errorMessage}`,
        error: errorMessage,
        command: `${command.command} ${command.args.join(' ')}`
      };
    }
  }

  private async executeViaPM2Client(command: PM2Command): Promise<string> {
    const pm2Client = this.pm2Client;
    const action = command.args[0];
    const target = command.args[1];

    switch (action) {
      case 'restart':
        if (target === 'all') {
          const processes = await pm2Client.list();
          for (const proc of processes) {
            await pm2Client.restart(proc.name);
          }
          return `Restarted ${processes.length} processes`;
        } else if (target) {
          await pm2Client.restart(target);
          return `Restarted ${target}`;
        }
        throw new Error('No target specified for restart');

      case 'stop':
        if (target === 'all') {
          const processes = await pm2Client.list();
          for (const proc of processes) {
            await pm2Client.stop(proc.name);
          }
          return `Stopped ${processes.length} processes`;
        } else if (target) {
          await pm2Client.stop(target);
          return `Stopped ${target}`;
        }
        throw new Error('No target specified for stop');

      case 'start':
        if (target) {
          await pm2Client.start(target);
          return `Started ${target}`;
        }
        throw new Error('No target specified for start');

      case 'status':
      case 'list': {
        const processes = await pm2Client.list();
        return this.formatProcessList(processes);
      }

      case 'logs':
        if (target) {
          const logs = await pm2Client.logs({ processName: target, lines: 50 });
          return this.formatLogs(logs);
        } else {
          const logs = await pm2Client.logs({ lines: 50 });
          return this.formatLogs(logs);
        }

      case 'error_logs':
        if (target) {
          const errorLogs = await pm2Client.getErrorLogs(target, 50);
          return this.formatLogs(errorLogs);
        } else {
          const errorLogs = await pm2Client.getErrorLogs(undefined, 50);
          return this.formatLogs(errorLogs);
        }

      case 'info':
        if (target) {
          const info = await pm2Client.describe(target);
          return JSON.stringify(info, null, 2);
        }
        throw new Error('No target specified for info');

      default:
        throw new Error(`Unsupported action: ${action}`);
    }
  }

  private formatProcessList(processes: ProcessInfo[]): string {
    if (processes.length === 0) {
      return 'No processes found';
    }

    const online = processes.filter(p => p.pm2_env.status === 'online').length;
    const stopped = processes.filter(p => p.pm2_env.status === 'stopped').length;
    const errored = processes.filter(p => p.pm2_env.status === 'errored').length;

    let summary = `📈 Process Summary: ${processes.length} total\n`;
    if (online > 0) summary += `✅ Online: ${online}\n`;
    if (stopped > 0) summary += `⏸️ Stopped: ${stopped}\n`;
    if (errored > 0) summary += `❌ Errored: ${errored}`;

    return summary.trim();
  }

  private async getAvailableProcesses(): Promise<string[]> {
    try {
      const processes = await this.pm2Client.list();
      return processes.map(p => p.name);
    } catch {
      return [];
    }
  }

  private formatLogs(logs: LogEntry[]): string {
    if (logs.length === 0) {
      return 'No log entries found';
    }

    const formattedLogs = logs.map(log => {
      const timestamp = new Date(log.timestamp).toLocaleString();
      const level = log.level.toUpperCase();
      const processInfo = `[${log.process}]`;
      const levelIcon = log.level === 'error' ? '❌' : log.level === 'warn' ? '⚠️' : 'ℹ️';
      
      return `${timestamp} ${levelIcon} ${level} ${processInfo}: ${log.message.trim()}`;
    });

    return formattedLogs.join('\n');
  }

  validateTarget(command: PM2Command, target?: string): boolean {
    if (!command.requiresTarget) {
      return true;
    }

    if (!target) {
      return false;
    }

    // Special targets
    if (target === 'all' || target === 'everything') {
      return true;
    }

    // Check against available processes if we have them
    if (command.availableTargets) {
      // Exact match
      if (command.availableTargets.includes(target)) {
        return true;
      }
      
      // Fuzzy matching for typos and variations
      const normalizedTarget = target.toLowerCase().replace(/[-_\s]/g, '');
      const matches = command.availableTargets.filter(process => {
        const normalizedProcess = process.toLowerCase().replace(/[-_\s]/g, '');
        return normalizedProcess.includes(normalizedTarget) || 
               normalizedTarget.includes(normalizedProcess) ||
               this.calculateSimilarity(normalizedTarget, normalizedProcess) > 0.7;
      });
      
      if (matches.length > 0) {
        return true;
      }
    }

    // If no available targets list, assume valid for now
    return true;
  }

  private calculateSimilarity(str1: string, str2: string): number {
    if (str1.length === 0) return str2.length === 0 ? 1 : 0;
    if (str2.length === 0) return 0;

    const matrix: number[][] = Array.from({ length: str2.length + 1 }, () =>
      Array.from({ length: str1.length + 1 }, () => 0)
    );

    // Initialize matrix - we know these indices are valid
    const firstRow = matrix[0];
    if (firstRow) {
      for (let i = 0; i <= str1.length; i++) firstRow[i] = i;
    }
    
    for (let j = 0; j <= str2.length; j++) {
      const row = matrix[j];
      if (row) row[0] = j;
    }

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        const currentRow = matrix[j];
        const prevRow = matrix[j - 1];
        
        if (currentRow && prevRow) {
          currentRow[i] = Math.min(
            (currentRow[i - 1] || 0) + 1,
            (prevRow[i] || 0) + 1,
            (prevRow[i - 1] || 0) + indicator
          );
        }
      }
    }

    const maxLength = Math.max(str1.length, str2.length);
    const lastRow = matrix[str2.length];
    const finalValue = lastRow?.[str1.length] || 0;
    return (maxLength - finalValue) / maxLength;
  }

  getSafetyLevel(command: PM2Command, target?: string): 'safe' | 'caution' | 'dangerous' {
    // Override safety for dangerous operations on 'all'
    if (target === 'all' && (command.safety === 'caution' || command.safety === 'dangerous')) {
      return 'dangerous';
    }

    return command.safety;
  }
}
