import 'reflect-metadata';
import { injectable, inject } from 'tsyringe';
import chalk from 'chalk';
import { BaseCommand } from './BaseCommand';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { IPM2Client } from '../interfaces/IPM2Client';

const execAsync = promisify(exec);

@injectable()
export class GrepCommand extends BaseCommand {
  public readonly name = 'grep';
  public readonly description = 'Search across all process logs';
  public readonly aliases = ['search'];

  constructor(@inject('IPM2Client') private pm2Client: IPM2Client) {
    super();
  }

  public async execute(args: string[]): Promise<void> {
    if (args.length === 0) {
      console.log(chalk.red('Usage: /grep <pattern> [process-name]'));
      console.log(chalk.gray('Example: /grep "error" my-app'));
      console.log(chalk.gray('Example: /grep "ERROR|WARN" (search all processes)'));
      return;
    }

    const [pattern, processName] = args as [string, string?];

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

      console.log(chalk.blue.bold(`\n🔍 Searching for: "${pattern}" in ${targetProcesses.length} process(es)\n`));

      for (const process of targetProcesses) {
        if (process.name) {
          await this.searchProcessLogs(process.name, pattern);
        }
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Failed to search logs: ${message}`));
    }
  }

  private async searchProcessLogs(processName: string, pattern: string): Promise<void> {
    try {
      // Get PM2 log paths
      const { stdout: logPath } = await execAsync(`pm2 info ${processName} | grep "out log path" | awk '{print $5}'`);
      const { stdout: errorPath } = await execAsync(`pm2 info ${processName} | grep "error log path" | awk '{print $5}'`);

      const outLogPath = logPath.trim();
      const errLogPath = errorPath.trim();

      console.log(chalk.cyan(`\n📄 ${processName}:`));

      // Search in out logs
      if (outLogPath) {
        try {
          const { stdout: outMatches } = await execAsync(`grep -n "${pattern}" "${outLogPath}" | tail -20`);
          if (outMatches) {
            console.log(chalk.gray('  Output log matches:'));
            outMatches.split('\n').filter(line => line).forEach(line => {
              const [lineNum, ...content] = line.split(':');
              console.log(`    ${chalk.gray(lineNum + ':')} ${this.highlightPattern(content.join(':'), pattern)}`);
            });
          }
        } catch {
          // No matches in out log
        }
      }

      // Search in error logs
      if (errLogPath) {
        try {
          const { stdout: errMatches } = await execAsync(`grep -n "${pattern}" "${errLogPath}" | tail -20`);
          if (errMatches) {
            console.log(chalk.red('  Error log matches:'));
            errMatches.split('\n').filter(line => line).forEach(line => {
              const [lineNum, ...content] = line.split(':');
              console.log(`    ${chalk.gray(lineNum + ':')} ${chalk.red(this.highlightPattern(content.join(':'), pattern))}`);
            });
          }
        } catch {
          // No matches in error log
        }
      }

    } catch {
      console.log(chalk.gray(`  Could not search logs for ${processName}`));
    }
  }

  private highlightPattern(text: string, pattern: string): string {
    const regex = new RegExp(`(${pattern})`, 'gi');
    return text.replace(regex, chalk.bgYellow.black('$1'));
  }
}
