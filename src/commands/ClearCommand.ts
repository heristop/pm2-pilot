import 'reflect-metadata';
import { injectable } from 'tsyringe';
import { BaseCommand } from './BaseCommand';

@injectable()
export class ClearCommand extends BaseCommand {
  public readonly name = 'clear';
  public readonly description = 'Clear the terminal screen';
  public readonly aliases = ['cls'];

  constructor() {
    super();
  }

  public execute(): void {
    console.clear();
  }
}