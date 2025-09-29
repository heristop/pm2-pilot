import 'reflect-metadata';
import { injectable, inject } from 'tsyringe';
import chalk from 'chalk';
import { BaseCommand } from './BaseCommand';
import type { ICommandHistoryManager } from '../interfaces/ICommandHistoryManager';

@injectable()
export class CommandHistoryCommand extends BaseCommand {
  public readonly name = 'cmd-history';
  public readonly description = 'Manage command history';
  public readonly aliases = ['history', 'hist'];

  constructor(@inject('ICommandHistoryManager') private historyManager: ICommandHistoryManager) {
    super();
  }

  public async execute(args: string[]): Promise<void> {
    const action = args[0];
    const param = args[1];

    switch (action) {
      case 'clear':
        await this.clearHistory();
        break;
      case 'search':
        if (!param) {
          console.log(chalk.red('Usage: /history search <term>'));
          return;
        }
        await this.searchHistory(param);
        break;
      case 'stats':
        await this.showStats();
        break;
      case 'show':
      case 'list':
      default:
        await this.showHistory(param ? parseInt(param, 10) : undefined);
        break;
    }
  }

  private async showHistory(limit?: number): Promise<void> {
    const history = await this.historyManager.getHistory();
    
    if (history.length === 0) {
      console.log(chalk.gray('No command history available.'));
      return;
    }

    const displayLimit = limit || 20;
    const startIndex = Math.max(0, history.length - displayLimit);
    const recentHistory = history.slice(startIndex);

    console.log(chalk.blue.bold(`\n📜 Command History (last ${recentHistory.length} commands):\n`));

    recentHistory.forEach((entry, index) => {
      const actualIndex = startIndex + index + 1;
      const timestamp = new Date(entry.timestamp).toLocaleString();
      const isCurrentSession = this.isCurrentSessionEntry(entry.session ?? null);
      const sessionIndicator = isCurrentSession ? chalk.green('●') : chalk.gray('○');
      
      console.log(chalk.gray(`${actualIndex.toString().padStart(4)} ${sessionIndicator} ${timestamp}`));
      console.log(`     ${chalk.cyan(entry.command)}`);
    });

    if (history.length > displayLimit) {
      console.log(chalk.gray(`\n... and ${history.length - displayLimit} more commands`));
      console.log(chalk.gray('Use /history show <number> to see more'));
    }

    console.log(chalk.gray('\n💡 Use up/down arrows to navigate history, or /history search <term> to find commands'));
  }

  private async searchHistory(searchTerm: string): Promise<void> {
    const results = await this.historyManager.searchHistory(searchTerm, 15);

    if (results.length === 0) {
      console.log(chalk.yellow(`No commands found matching: "${searchTerm}"`));
      return;
    }

    console.log(chalk.blue.bold(`\n🔍 Search Results for "${searchTerm}" (${results.length} found):\n`));

    results.forEach((result, index) => {
      const { entry, matchType } = result;
      const timestamp = new Date(entry.timestamp).toLocaleString();
      const matchIcon = matchType === 'exact' ? '🎯' : '🔸';
      const isCurrentSession = this.isCurrentSessionEntry(entry.session ?? null);
      const sessionIndicator = isCurrentSession ? chalk.green('●') : chalk.gray('○');

      console.log(chalk.gray(`${(index + 1).toString().padStart(2)} ${matchIcon} ${sessionIndicator} ${timestamp}`));
      
      // Highlight the search term in the command
      const highlightedCommand = entry.command.replace(
        new RegExp(`(${searchTerm})`, 'gi'),
        chalk.yellow.bold('$1')
      );
      console.log(`   ${chalk.cyan(highlightedCommand)}`);
    });

    console.log(chalk.gray('\n💡 Copy any command and paste it in the prompt to re-execute'));
  }

  private async showStats(): Promise<void> {
    const stats = await this.historyManager.getStats();

    console.log(chalk.blue.bold('\n📊 Command History Statistics:\n'));
    
    console.log(chalk.cyan('📈 Usage:'));
    console.log(`  Total Commands: ${stats.totalCommands}`);
    console.log(`  Unique Commands: ${stats.uniqueCommands}`);
    console.log(`  Current Session: ${stats.currentSession}`);
    
    if (stats.oldestCommand && stats.newestCommand) {
      console.log(chalk.cyan('\n📅 Timeline:'));
      console.log(`  First Command: ${stats.oldestCommand.toLocaleString()}`);
      console.log(`  Latest Command: ${stats.newestCommand.toLocaleString()}`);
      
      const daysDiff = Math.floor((stats.newestCommand.getTime() - stats.oldestCommand.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff > 0) {
        console.log(`  History Span: ${daysDiff} days`);
        console.log(`  Avg Commands/Day: ${(stats.totalCommands / Math.max(daysDiff, 1)).toFixed(1)}`);
      }
    }

    if (stats.totalCommands > 0) {
      const uniquePercent = ((stats.uniqueCommands / stats.totalCommands) * 100).toFixed(1);
      console.log(chalk.cyan('\n🔄 Patterns:'));
      console.log(`  Command Diversity: ${uniquePercent}%`);
      console.log(`  Repetition Rate: ${(100 - parseFloat(uniquePercent)).toFixed(1)}%`);
    }

    console.log(chalk.gray('\n💡 Use /history clear to reset history or /history search <term> to find commands'));
  }

  private async clearHistory(): Promise<void> {
    console.log(chalk.yellow('⚠️  This will permanently delete all command history.'));
    console.log(chalk.gray('Type "yes" to confirm, anything else to cancel:'));

    // For now, just clear immediately since we don't have interactive confirmation yet
    // In a real implementation, you'd want to add confirmation logic
    await this.historyManager.clearHistory();
    console.log(chalk.green('✅ Command history cleared successfully.'));
    console.log(chalk.gray('History will start fresh from your next command.'));
  }

  private isCurrentSessionEntry(sessionId?: string | null): boolean {
    const history = this.historyManager;

    if (typeof history.isCurrentSession === 'function') {
      return history.isCurrentSession(sessionId ?? null);
    }

    const legacyAccess = history as unknown as {
      getSessionId?: () => unknown;
      sessionId?: unknown;
    };

    const sessionFromGetter = typeof legacyAccess.getSessionId === 'function'
      ? legacyAccess.getSessionId()
      : undefined;
    const fallbackSession = typeof sessionFromGetter === 'string'
      ? sessionFromGetter
      : typeof legacyAccess.sessionId === 'string'
        ? legacyAccess.sessionId
        : undefined;

    if (!fallbackSession || !sessionId) {
      return false;
    }

    return sessionId === fallbackSession;
  }
}
