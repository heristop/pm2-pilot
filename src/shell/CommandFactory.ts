import type { ICommand } from '../interfaces/ICommandRegistry';

// Import all commands
import { HelpCommand } from '../commands/HelpCommand';
import { ExitCommand } from '../commands/ExitCommand';
import { StatusCommand } from '../commands/StatusCommand';
import { ListCommand } from '../commands/ListCommand';
import { LogsCommand } from '../commands/LogsCommand';
import { RestartCommand } from '../commands/RestartCommand';
import { StopCommand } from '../commands/StopCommand';
import { StartCommand } from '../commands/StartCommand';
import { ClearCommand } from '../commands/ClearCommand';
import { MetricsCommand } from '../commands/MetricsCommand';
import { WatchCommand } from '../commands/WatchCommand';
import { AllCommand } from '../commands/AllCommand';
import { GrepCommand } from '../commands/GrepCommand';
import { ErrorsCommand } from '../commands/ErrorsCommand';
import { SaveCommand } from '../commands/SaveCommand';
import { LoadCommand } from '../commands/LoadCommand';
import { HealthCommand } from '../commands/HealthCommand';
import { AICommand } from '../commands/AICommand';
import { DiagnoseCommand } from '../commands/DiagnoseCommand';
import { OptimizeCommand } from '../commands/OptimizeCommand';
import { CommandHistoryCommand } from '../commands/CommandHistoryCommand';

export class CommandFactory {
  static createCommands(container: any): ICommand[] {
    return [
      container.resolve(HelpCommand),
      container.resolve(ExitCommand),
      container.resolve(StatusCommand),
      container.resolve(ListCommand),
      container.resolve(LogsCommand),
      container.resolve(RestartCommand),
      container.resolve(StopCommand),
      container.resolve(StartCommand),
      container.resolve(ClearCommand),
      container.resolve(MetricsCommand),
      container.resolve(WatchCommand),
      container.resolve(AllCommand),
      container.resolve(GrepCommand),
      container.resolve(ErrorsCommand),
      container.resolve(SaveCommand),
      container.resolve(LoadCommand),
      container.resolve(HealthCommand),
      container.resolve(AICommand),
      container.resolve(DiagnoseCommand),
      container.resolve(OptimizeCommand),
      container.resolve(CommandHistoryCommand)
    ];
  }
}