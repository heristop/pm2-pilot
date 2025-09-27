import type { ICommand } from '../interfaces/ICommandRegistry';

export abstract class BaseCommand implements ICommand {
  abstract readonly name: string;
  abstract readonly description: string;
  
  readonly aliases?: string[] = [];
  readonly hidden?: boolean = false;

  constructor() {}

  abstract execute(args: string[]): Promise<void> | void;

  getHelp(): string {
    const aliases = this.aliases?.length ? ` (aliases: ${this.aliases.map(a => `/${a}`).join(', ')})` : '';
    return `/${this.name}${aliases} - ${this.description}`;
  }
}