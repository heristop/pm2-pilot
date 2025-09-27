import { injectable } from 'tsyringe';
import chalk from 'chalk';
import type { ProcessInfo } from '../pm2/PM2Client';
import type { IRenderer } from '../interfaces/IRenderer';

export interface TableColumn {
  header: string;
  key: string;
  width?: number;
  align?: 'left' | 'right' | 'center';
  format?: (value: unknown) => string;
}

@injectable()
export class Renderer implements IRenderer {
  
  private stripAnsi(str: string): string {
    // eslint-disable-next-line no-control-regex
    return str.replace(/\u001b\[.*?m/g, '');
  }

  formatMemory(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  formatUptime(timestamp: number | null | undefined): string {
    if (!timestamp) return 'N/A';
    
    const now = Date.now();
    const uptime = now - timestamp;
    const seconds = Math.floor(uptime / 1000);
    
    if (seconds < 60) return `${seconds}s`;
    
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m`;
    
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }

  colorizeStatus(status: string): string {
    switch (status?.toLowerCase()) {
      case 'online':
      case 'launching':
        return chalk.green(status);
      case 'stopped':
        return chalk.gray(status);
      case 'stopping':
        return chalk.yellow(status);
      case 'errored':
      case 'error':
        return chalk.red(status);
      case 'fork':
        return chalk.blue(status);
      default:
        return chalk.white(status || 'unknown');
    }
  }

  renderTable(data: unknown[], columns: TableColumn[]): void {
    if (!data.length) {
      console.log(chalk.gray('No data to display'));
      return;
    }

    const rows = data.map(item => {
      return columns.map(col => {
        const value = this.getNestedValue(item, col.key);
        return col.format ? col.format(value) : this.formatCellValue(value);
      });
    });

    const widths = columns.map((col, i) => {
      const headerWidth = col.header.length;
      const contentWidth = Math.max(...rows.map(row => this.stripAnsi(row[i] || '').length));
      return col.width || Math.max(headerWidth, contentWidth);
    });

    this.printTableHeader(columns, widths);
    this.printTableSeparator(widths);
    
    rows.forEach(row => {
      this.printTableRow(row, columns, widths);
    });
  }

  private getNestedValue(obj: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>((current, key) => {
      if (current && typeof current === 'object') {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  }

  private formatCellValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    return '';
  }

  private printTableHeader(columns: TableColumn[], widths: number[]): void {
    const headers = columns.map((col, i) => {
      return chalk.bold(col.header.padEnd(widths[i] || 0));
    });
    console.log(`  ${headers.join('  ')}`);
  }

  private printTableSeparator(widths: number[]): void {
    const separator = widths.map(w => '─'.repeat(w)).join('  ');
    console.log(`  ${chalk.gray(separator)}`);
  }

  private printTableRow(row: string[], columns: TableColumn[], widths: number[]): void {
    const cells = row.map((cell, i) => {
      const stripped = this.stripAnsi(cell);
      const padding = (widths[i] || 0) - stripped.length;
      const align = columns[i]?.align || 'left';
      
      switch (align) {
        case 'right':
          return ' '.repeat(padding) + cell;
        case 'center': {
          const leftPad = Math.floor(padding / 2);
          const rightPad = padding - leftPad;
          return ' '.repeat(leftPad) + cell + ' '.repeat(rightPad);
        }
        default:
          return cell + ' '.repeat(padding);
      }
    });
    
    console.log(`  ${cells.join('  ')}`);
  }

  renderProcessList(processes: ProcessInfo[]): void {
    const columns: TableColumn[] = [
      {
        header: 'ID',
        key: 'pm2_env.pm_id',
        width: 4,
        align: 'right'
      },
      {
        header: 'Name',
        key: 'name',
        width: 20
      },
      {
        header: 'Status',
        key: 'pm2_env.status',
        width: 12,
        format: (status) => this.colorizeStatus(typeof status === 'string' ? status : 'unknown')
      },
      {
        header: 'CPU',
        key: 'monit.cpu',
        width: 8,
        align: 'right',
        format: (cpu) => {
          const numericCpu = typeof cpu === 'number' ? cpu : Number(cpu ?? 0);
          return `${Number.isFinite(numericCpu) ? numericCpu : 0}%`;
        }
      },
      {
        header: 'Memory',
        key: 'monit.memory',
        width: 10,
        align: 'right',
        format: (memory) => {
          const numericMemory = typeof memory === 'number' ? memory : Number(memory ?? 0);
          const safeMemory = Number.isFinite(numericMemory) ? numericMemory : 0;
          return this.formatMemory(safeMemory);
        }
      },
      {
        header: 'Uptime',
        key: 'pm2_env.pm_uptime',
        width: 12,
        format: (uptime) => {
          if (typeof uptime === 'number') {
            return this.formatUptime(uptime);
          }
          if (typeof uptime === 'string') {
            const parsed = Number(uptime);
            return Number.isFinite(parsed) ? this.formatUptime(parsed) : this.formatUptime(null);
          }
          return this.formatUptime(null);
        }
      },
      {
        header: 'Restarts',
        key: 'pm2_env.restart_time',
        width: 9,
        align: 'right'
      }
    ];

    this.renderTable(processes, columns);
  }

  renderProcessDetail(process: ProcessInfo): void {
    console.log(chalk.blue.bold(`\n📋 Process Details: ${process.name}`));
    console.log();
    
    const details = [
      ['ID', process.pm2_env.pm_id],
      ['Name', process.name],
      ['Status', this.colorizeStatus(process.pm2_env.status)],
      ['PID', process.pid || 'N/A'],
      ['CPU', `${process.monit.cpu || 0}%`],
      ['Memory', this.formatMemory(process.monit.memory || 0)],
      ['Uptime', this.formatUptime(process.pm2_env.pm_uptime)],
      ['Restarts', process.pm2_env.restart_time || 0],
      ['Exec Mode', process.pm2_env.exec_mode || 'N/A'],
      ['Node Version', process.pm2_env.node_version || 'N/A'],
      ['Watching', process.pm2_env.watching ? 'enabled' : 'disabled'],
      ['Created At', typeof process.pm2_env.created_at === 'number' ? new Date(process.pm2_env.created_at).toLocaleString() : 'N/A']
    ];

    const maxLabelWidth = Math.max(...details.map(([label]) => String(label).length));
    
    details.forEach(([label, value]) => {
      const labelStr = String(label);
      const paddedLabel = chalk.cyan(labelStr.padEnd(maxLabelWidth));
      console.log(`  ${paddedLabel}: ${value}`);
    });
    
    console.log();
  }

  renderMetrics(metrics: Record<string, unknown>): void {
    console.log(chalk.blue.bold('\n📊 System Metrics:\n'));
    // Add metrics rendering logic as needed
    console.log(JSON.stringify(metrics, null, 2));
  }

  renderLogs(logs: string): void {
    console.log(logs);
  }

  renderError(error: string): void {
    console.error(chalk.red(`❌ ${error}`));
  }

  renderSuccess(message: string): void {
    console.log(chalk.green(`✅ ${message}`));
  }

  renderWarning(message: string): void {
    console.log(chalk.yellow(`⚠️  ${message}`));
  }

  renderInfo(message: string): void {
    console.log(chalk.blue(`ℹ️  ${message}`));
  }
}
