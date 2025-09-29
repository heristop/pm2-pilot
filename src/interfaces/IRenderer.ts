import type { ProcessInfo } from '../pm2/PM2Client';

export interface TableColumn {
  header: string;
  key: string;
  width: number;
  align?: 'left' | 'right' | 'center';
  format?: (value: unknown) => string;
}

export interface IRenderer {
  renderProcessList(processes: ProcessInfo[]): void;
  renderProcessDetail(process: ProcessInfo): void;
  renderMetrics(metrics: any): void;
  renderLogs(logs: string): void;
  renderError(error: string): void;
  renderSuccess(message: string): void;
  renderWarning(message: string): void;
  renderInfo(message: string): void;
  renderTable(data: any[], columns: TableColumn[]): void;
  colorizeStatus(status: string): string;
  formatMemory(bytes: number): string;
  formatUptime(uptime: number): string;
}