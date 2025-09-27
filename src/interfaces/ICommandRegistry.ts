export interface ICommand {
  readonly name: string;
  readonly description: string;
  readonly aliases?: string[];
  readonly hidden?: boolean;
  execute(args: string[]): Promise<void> | void;
  getHelp(): string;
}

export interface ICommandRegistry {
  register(command: ICommand): void;
  getCommand(name: string): ICommand | undefined;
  getAllCommands(): ICommand[];
  getCommandNames(): string[];
}