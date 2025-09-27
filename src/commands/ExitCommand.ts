import 'reflect-metadata';
import { injectable, inject } from 'tsyringe';
import { BaseCommand } from './BaseCommand';
import type { IShell } from '../interfaces/IShell';

@injectable()
export class ExitCommand extends BaseCommand {
  public readonly name = 'exit';
  public readonly description = 'Exit the PM2 CLI';
  public readonly aliases = ['quit', 'q'];

  constructor(@inject('IShell') private shell: IShell) {
    super();
  }

  public execute(_args: string[]): void {
    // In demo mode with auto-exit enabled, force immediate exit
    if (process.env.PM2X_AUTO_EXIT === 'true') {
      process.exit(0);
    }
    
    this.shell.exit();
  }
}