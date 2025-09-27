import 'reflect-metadata';
import { injectable } from 'tsyringe';
import { BaseCommand } from './BaseCommand';
import { StatusCommand } from './StatusCommand';
import { container } from '../container';

@injectable()
export class ListCommand extends BaseCommand {
  public readonly name = 'list';
  public readonly description = 'List all PM2 processes (alias for status)';
  public readonly aliases = ['ls'];

  constructor() {
    super();
  }

  public async execute(args: string[]): Promise<void> {
    const statusCommand = container.resolve(StatusCommand);
    await statusCommand.execute(args);
  }
}