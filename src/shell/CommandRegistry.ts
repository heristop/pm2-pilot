import type { ICommand, ICommandRegistry } from '../interfaces/ICommandRegistry';

export class CommandRegistry implements ICommandRegistry {
  private commands = new Map<string, ICommand>();
  private aliases = new Map<string, string>();

  register(command: ICommand): void {
    this.commands.set(command.name, command);
    
    if (command.aliases) {
      for (const alias of command.aliases) {
        this.aliases.set(alias, command.name);
      }
    }
  }

  getCommand(name: string): ICommand | undefined {
    const commandName = this.aliases.get(name) || name;
    return this.commands.get(commandName);
  }

  getAllCommands(): ICommand[] {
    return Array.from(this.commands.values());
  }

  getCommandNames(): string[] {
    return Array.from(this.commands.keys());
  }
}