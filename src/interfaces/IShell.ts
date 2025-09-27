import type { PM2Client } from '../pm2/PM2Client';
import type { Renderer } from '../display/Renderer';
import type { CommandHistoryManager } from '../services/CommandHistoryManager';
import type { CommandParser } from '../shell/CommandParser';
import type { PendingAction } from '../services/ConversationManager';

export interface IShell {
  executeCommand(input: string): Promise<void>;
  clearScreen(): void;
  renderOutput(output: unknown, processName?: string): void;
  renderError(error: Error): void;
  promptConfirmation(action: PendingAction, context?: Record<string, unknown>): Promise<void>;
  getCommandHistory(): Promise<string[]>;
  setShowHelp(show: boolean): void;
  refreshAIStatus(): void;
  exit(): void;
  prompt(): void;
  
  // Expose services that commands need
  readonly client: PM2Client;
  readonly display: Renderer;
  readonly history: CommandHistoryManager;
  readonly parser?: CommandParser; // For HelpCommand
}
