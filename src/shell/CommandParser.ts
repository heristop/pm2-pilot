import { injectable, inject } from 'tsyringe';
import type { ICommandRegistry } from '../interfaces/ICommandRegistry';

interface ParsedCommand {
  command: string;
  args: string[];
}

@injectable()
export class CommandParser {
  constructor(@inject('ICommandRegistry') private registry: ICommandRegistry) {}

  async execute(input: string): Promise<void> {
    const parsed = this.parse(input);
    const command = this.registry.getCommand(parsed.command);
    
    if (!command) {
      throw new Error(`Unknown command: /${parsed.command}. Type /help for available commands.`);
    }

    await command.execute(parsed.args);
  }

  private parse(input: string): ParsedCommand {
    const trimmed = input.trim();
    if (!trimmed.startsWith('/')) {
      throw new Error('Commands must start with /');
    }

    const parts = trimmed.slice(1).split(/\s+/);
    const [command, ...args] = parts;

    if (!command) {
      throw new Error('Command name is missing.');
    }

    return { command, args };
  }

  getCommandNames(): string[] {
    return this.registry.getCommandNames().map(name => `/${name}`).sort();
  }

  getCommands() {
    return this.registry.getAllCommands().filter(cmd => !cmd.hidden);
  }
}
