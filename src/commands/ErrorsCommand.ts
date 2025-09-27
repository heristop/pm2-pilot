import 'reflect-metadata';
import { injectable, inject } from 'tsyringe';
import chalk from 'chalk';
import { BaseCommand } from './BaseCommand';
import type { IShell } from '../interfaces/IShell';
import type { IPM2Client } from '../interfaces/IPM2Client';

// PM2 Bus types
interface PM2BusData {
  process: {
    name: string;
    pm_id: number;
  };
  data: string;
}

interface PM2Bus {
  on(event: 'log:err', callback: (data: PM2BusData) => void): void;
  close(): void;
}

@injectable()
export class ErrorsCommand extends BaseCommand {
  public readonly name = 'errors';
  public readonly description = 'Show recent errors from all processes';
  public readonly aliases = ['err'];
  private errorWatcher: PM2Bus | null = null;

  constructor(
    @inject('IShell') private shell: IShell,
    @inject('IPM2Client') private pm2Client: IPM2Client
  ) {
    super();
  }

  public async execute(args: string[]): Promise<void> {
    const lines = parseInt(args[0] || '20');
    
    try {
      const processes = await this.pm2Client.list();
      
      if (processes.length === 0) {
        console.log(chalk.gray('No PM2 processes running'));
        return;
      }

      console.log(chalk.red.bold(`\n🚨 Recent Errors (last ${lines} per process):\n`));

      // Stream errors from all processes
      this.pm2Client.launchBus((err, bus) => {
        if (err) {
          console.error(chalk.red(`Failed to launch PM2 bus: ${err.message}`));
          return;
        }

        this.errorWatcher = bus as PM2Bus;
        let errorCount = 0;
        const processErrors = new Map<string, string[]>();

        // Collect initial errors
        (bus as PM2Bus).on('log:err', (packet: PM2BusData) => {
          const processName = packet.process.name;
          const errorLine = packet.data.trim();
          
          if (!processErrors.has(processName)) {
            processErrors.set(processName, []);
          }
          
          const errors = processErrors.get(processName)!;
          errors.push(errorLine);
          
          // Keep only last N errors per process
          if (errors.length > lines) {
            errors.shift();
          }
          
          errorCount++;
        });

        // Display collected errors after a short delay
        setTimeout(() => {
          if (errorCount === 0) {
            console.log(chalk.green('✓ No recent errors found!'));
          } else {
            processErrors.forEach((errors, processName) => {
              if (errors.length > 0) {
                console.log(chalk.red(`\n📍 ${processName}:`));
                errors.forEach(error => {
                  const timestamp = new Date().toISOString();
                  console.log(chalk.gray(`  [${timestamp}]`) + chalk.red(` ${error}`));
                });
              }
            });
            console.log(chalk.gray(`\n  Total errors found: ${errorCount}`));
          }
          
          this.stopErrorWatching();
          this.shell.prompt();
        }, 2000);

        console.log(chalk.gray('Collecting error logs... (2 seconds)'));
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Failed to get errors: ${message}`));
    }
  }

  private stopErrorWatching(): void {
    if (this.errorWatcher) {
      this.errorWatcher.close();
      this.errorWatcher = null;
    }
  }
}
