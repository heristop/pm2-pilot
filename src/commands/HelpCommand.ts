import 'reflect-metadata';
import { injectable, inject } from 'tsyringe';
import chalk from 'chalk';
import { BaseCommand } from './BaseCommand';
import type { IShell } from '../interfaces/IShell';
import type { ICommandRegistry } from '../interfaces/ICommandRegistry';

@injectable()
export class HelpCommand extends BaseCommand {
  public readonly name = 'help';
  public readonly description = 'Show available commands';
  public readonly aliases = ['h'];

  constructor(
    @inject('IShell') private shell: IShell,
    @inject('ICommandRegistry') private registry: ICommandRegistry
  ) {
    super();
  }

  public execute(): void {
    console.log(chalk.blue.bold('\n📚 Available Commands:'));
    console.log();

    const commands = this.registry.getAllCommands().filter(cmd => !cmd.hidden);
    const maxLength = Math.max(...commands.map((cmd: {name: string}) => cmd.name.length));

    commands.forEach((command: {name: string; description: string; aliases?: string[]}) => {
      const name = chalk.cyan(`/${command.name.padEnd(maxLength)}`);
      const aliases = command.aliases?.length 
        ? chalk.gray(` (${command.aliases.map((a: string) => `/${a}`).join(', ')})`)
        : '';
      console.log(`  ${name}${aliases} - ${command.description}`);
    });

    console.log(chalk.gray('\nPress Ctrl+C or use /exit to quit'));
    console.log();
  }
}
