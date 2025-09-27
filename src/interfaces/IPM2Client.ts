import type { ProcessInfo } from '../types/pm2';

export interface IPM2Client {
  list(): Promise<ProcessInfo[]>;
  start(name: string): Promise<void>;
  stop(name: string): Promise<void>;
  restart(name: string): Promise<void>;
  delete(name: string): Promise<void>;
  reload(name: string): Promise<void>;
  logs(options?: { lines?: number; errorsOnly?: boolean; processName?: string; format?: 'raw' | 'json' }): Promise<{ timestamp: string; level: 'info' | 'error' | 'warn' | 'debug'; message: string; process: string; type: 'out' | 'err' }[]>;
  describe(name: string): Promise<ProcessInfo[]>;
  jlist(): Promise<ProcessInfo[]>;
  prettylist(): Promise<string>;
  ping(): Promise<boolean>;
  updatePM2(): Promise<void>;
  reloadLogs(): Promise<void>;
  flush(name?: string): Promise<void>;
  reset(name?: string): Promise<void>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getProcessNames(): Promise<string[]>;
  launchBus(callback: (err: Error | null, bus?: unknown) => void): void;
  getErrorLogs(processName?: string, lines?: number): Promise<{ timestamp: string; level: 'info' | 'error' | 'warn' | 'debug'; message: string; process: string; type: 'out' | 'err' }[]>;
}