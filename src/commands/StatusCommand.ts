import 'reflect-metadata';
import { injectable, inject } from 'tsyringe';
import { BaseCommand } from './BaseCommand';
import { StatusService } from '../services/StatusService';

@injectable()
export class StatusCommand extends BaseCommand {
  public readonly name = 'status';
  public readonly description = 'Show PM2 process status';
  public readonly aliases = ['ps'];

  constructor(
    @inject('StatusService') private statusService: StatusService
  ) {
    super();
  }

  public async execute(args: string[]): Promise<void> {
    const processName = args[0];

    if (processName) {
      await this.statusService.displayProcessByName(processName);
    } else {
      await this.statusService.displayAllProcesses();
    }
  }
}