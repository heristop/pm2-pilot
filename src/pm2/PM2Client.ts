import { injectable } from 'tsyringe';
import pm2 from 'pm2';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { IPM2Client } from '../interfaces/IPM2Client';
import type { ProcessInfo } from '../types/pm2';
export type { ProcessInfo };


export interface LogEntry {
  timestamp: string;
  level: 'info' | 'error' | 'warn' | 'debug';
  message: string;
  process: string;
  type: 'out' | 'err';
}

export interface LogsOptions {
  lines?: number;
  errorsOnly?: boolean;
  processName?: string;
  format?: 'raw' | 'json';
}

@injectable()
export class PM2Client implements IPM2Client {
  private connected = false;

  private getExtendedPm2(): {
    ping?: (cb: (err: Error | null) => void) => void;
    update?: (cb: (err: Error | null) => void) => void;
    reset?: (target: string | number, cb: (err: Error | null) => void) => void;
  } {
    return pm2 as unknown as {
      ping?: (cb: (err: Error | null) => void) => void;
      update?: (cb: (err: Error | null) => void) => void;
      reset?: (target: string | number, cb: (err: Error | null) => void) => void;
    };
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      pm2.connect((err) => {
        if (err) {
          reject(new Error(`Failed to connect to PM2: ${err.message}`));
        } else {
          this.connected = true;
          resolve();
        }
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      return new Promise((resolve) => {
        pm2.disconnect();
        this.connected = false;
        resolve();
      });
    }
  }

  async list(): Promise<ProcessInfo[]> {
    if (!this.connected) {
      throw new Error('Not connected to PM2');
    }

    return new Promise((resolve, reject) => {
      pm2.list((err, processes) => {
        if (err) {
          reject(new Error(`Failed to get process list: ${err.message}`));
        } else {
          resolve(processes as ProcessInfo[]);
        }
      });
    });
  }

  async describe(name: string): Promise<ProcessInfo[]> {
    if (!this.connected) {
      throw new Error('Not connected to PM2');
    }

    return new Promise((resolve, reject) => {
      pm2.describe(name, (err, processes) => {
        if (err) {
          reject(new Error(`Failed to describe process ${name}: ${err.message}`));
        } else {
          resolve(processes as ProcessInfo[]);
        }
      });
    });
  }

  async restart(name: string): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to PM2');
    }

    return new Promise((resolve, reject) => {
      pm2.restart(name, (err) => {
        if (err) {
          reject(new Error(`Failed to restart ${name}: ${err.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  async stop(name: string): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to PM2');
    }

    return new Promise((resolve, reject) => {
      pm2.stop(name, (err) => {
        if (err) {
          reject(new Error(`Failed to stop ${name}: ${err.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  async start(name: string): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to PM2');
    }

    return new Promise((resolve, reject) => {
      pm2.start(name, (err) => {
        if (err) {
          reject(new Error(`Failed to start ${name}: ${err.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  async delete(name: string): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to PM2');
    }

    return new Promise((resolve, reject) => {
      pm2.delete(name, (err) => {
        if (err) {
          reject(new Error(`Failed to delete ${name}: ${err.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  async getProcessNames(): Promise<string[]> {
    const processes = await this.list();
    return processes.map(proc => proc.name);
  }


  launchBus(callback: (err: Error | null, bus?: unknown) => void): void {
    if (!this.connected) {
      throw new Error('Not connected to PM2');
    }

    pm2.launchBus((err: Error | null, bus: unknown) => {
      callback(err, bus);
    });
  }

  async logs(options: LogsOptions = {}): Promise<LogEntry[]> {
    if (!this.connected) {
      throw new Error('Not connected to PM2');
    }

    const { lines = 100, errorsOnly = false, processName } = options;
    const logs: LogEntry[] = [];

    try {
      // Get process list to find log file paths
      const processes = processName ? await this.describe(processName) : await this.list();
      
      for (const process of processes) {
        const { pm2_env } = process;
        
        // Read error logs if they exist
        if (pm2_env.pm_err_log_path && existsSync(pm2_env.pm_err_log_path)) {
          const errorLogs = await this.readLogFile(pm2_env.pm_err_log_path, lines, 'err', process.name);
          logs.push(...errorLogs);
        }
        
        // Read output logs if not errors-only and they exist
        if (!errorsOnly && pm2_env.pm_out_log_path && existsSync(pm2_env.pm_out_log_path)) {
          const outLogs = await this.readLogFile(pm2_env.pm_out_log_path, lines, 'out', process.name);
          logs.push(...outLogs);
        }
      }
      
      // Sort by timestamp (most recent first)
      logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      return logs.slice(0, lines);
    } catch (error) {
      throw new Error(`Failed to read logs: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async readLogFile(filePath: string, maxLines: number, type: 'out' | 'err', processName: string): Promise<LogEntry[]> {
    try {
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      
      // Get the last N lines
      const recentLines = lines.slice(-maxLines);
      
      return recentLines.map((line, index) => {
        // Try to parse structured logs or create simple entries
        const logEntry = this.parseLogLine(line, type, processName);
        
        // If no timestamp found, use file modification time with offset
        if (!logEntry.timestamp) {
          const now = new Date();
          const offsetMs = (recentLines.length - index - 1) * 1000; // Rough estimation
          logEntry.timestamp = new Date(now.getTime() - offsetMs).toISOString();
        }
        
        return logEntry;
      });
    } catch {
      // Return empty array if file can't be read
      return [];
    }
  }

  private parseLogLine(line: string, type: 'out' | 'err', processName: string): LogEntry {
    // Try to extract timestamp and level from common log formats
    const timestampRegex = /(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})?)/;
    const levelRegex = /\b(error|err|warn|warning|info|debug)\b/i;
    
    const timestampMatch = line.match(timestampRegex);
    const levelMatch = line.match(levelRegex);
    
    // Determine log level
    let level: LogEntry['level'] = 'info';
    if (type === 'err') {
      level = 'error';
    } else if (levelMatch && levelMatch[1]) {
      const levelStr = levelMatch[1].toLowerCase();
      if (levelStr === 'error' || levelStr === 'err') level = 'error';
      else if (levelStr === 'warn' || levelStr === 'warning') level = 'warn';
      else if (levelStr === 'debug') level = 'debug';
      else level = 'info';
    }
    
    return {
      timestamp: timestampMatch?.[1] || '',
      level,
      message: line,
      process: processName,
      type
    };
  }

  async getErrorLogs(processName?: string, lines: number = 50): Promise<LogEntry[]> {
    return this.logs({
      lines,
      errorsOnly: true,
      processName
    });
  }

  // Additional IPM2Client interface methods
  async reload(name: string): Promise<void> {
    return new Promise((resolve, reject) => {
      pm2.reload(name, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async jlist(): Promise<ProcessInfo[]> {
    return this.list();
  }

  async prettylist(): Promise<string> {
    const processes = await this.list();
    return JSON.stringify(processes, null, 2);
  }

  async ping(): Promise<boolean> {
    return new Promise((resolve) => {
      const pingFn = this.getExtendedPm2().ping;
      if (!pingFn) {
        resolve(true);
        return;
      }

      pingFn((err: Error | null) => {
        resolve(!err);
      });
    });
  }

  async updatePM2(): Promise<void> {
    return new Promise((resolve, reject) => {
      const updateFn = this.getExtendedPm2().update;
      if (!updateFn) {
        resolve();
        return;
      }

      updateFn((err: Error | null) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async reloadLogs(): Promise<void> {
    return new Promise((resolve, reject) => {
      pm2.reloadLogs((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async flush(name?: string): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to PM2');
    }

    return new Promise((resolve, reject) => {
      const target: string | number = name ?? 'all';
      pm2.flush(target, (err: Error | null) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async reset(name?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const resetFn = this.getExtendedPm2().reset;
      if (!resetFn) {
        resolve();
        return;
      }

      const target: string | number = name ?? 'all';
      resetFn(target, (err: Error | null) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}
