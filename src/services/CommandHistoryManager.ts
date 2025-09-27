import { injectable } from 'tsyringe';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { PM2X_CONFIG } from '../utils/constants';
import type { ICommandHistoryManager } from '../interfaces/ICommandHistoryManager';

export interface HistoryEntry {
  command: string;
  timestamp: number;
  session?: string;
}

export interface HistorySearchResult {
  entry: HistoryEntry;
  index: number;
  matchType: 'exact' | 'partial';
}

@injectable()
export class CommandHistoryManager implements ICommandHistoryManager {
  private historyFile = PM2X_CONFIG.HISTORY_FILE;
  private maxHistorySize = 1000;
  private history: HistoryEntry[] = [];
  private sessionId: string;
  private loaded = false;

  constructor() {
    // Generate unique session ID
    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  isCurrentSession(sessionId?: string | null): boolean {
    return sessionId === this.sessionId;
  }

  async loadHistory(): Promise<void> {
    if (this.loaded) return;

    try {
      const data = await fs.readFile(this.historyFile, 'utf-8');
      const parsed = JSON.parse(data) as HistoryEntry[];
      
      // Validate and filter history entries
      this.history = parsed.filter(entry => 
        entry && 
        typeof entry.command === 'string' && 
        typeof entry.timestamp === 'number' &&
        entry.command.trim().length > 0
      );

      // Sort by timestamp to ensure correct order
      this.history.sort((a, b) => a.timestamp - b.timestamp);

      // Limit to max size
      if (this.history.length > this.maxHistorySize) {
        this.history = this.history.slice(-this.maxHistorySize);
      }

    } catch {
      // File doesn't exist or is corrupted, start with empty history
      this.history = [];
    }

    this.loaded = true;
  }

  async saveHistory(): Promise<void> {
    try {
      // Ensure directory exists
      await fs.mkdir(path.dirname(this.historyFile), { recursive: true });
      
      // Write history to file
      await fs.writeFile(this.historyFile, JSON.stringify(this.history, null, 2));
    } catch (error) {
      console.error('Failed to save command history:', error);
    }
  }

  async addCommand(command: string): Promise<void> {
    if (!this.loaded) {
      await this.loadHistory();
    }

    const trimmedCommand = command.trim();
    
    // Skip empty commands
    if (!trimmedCommand) return;

    // Skip sensitive commands (basic patterns)
    if (this.isSensitiveCommand(trimmedCommand)) return;

    // Check for duplicate of last command
    const lastEntry = this.history[this.history.length - 1];
    if (lastEntry && lastEntry.command === trimmedCommand) {
      // Update timestamp of existing entry instead of duplicating
      lastEntry.timestamp = Date.now();
    } else {
      // Add new entry
      const entry: HistoryEntry = {
        command: trimmedCommand,
        timestamp: Date.now(),
        session: this.sessionId
      };

      this.history.push(entry);

      // Trim history if it exceeds max size
      if (this.history.length > this.maxHistorySize) {
        this.history = this.history.slice(-this.maxHistorySize);
      }
    }

    // Save to disk (async, don't wait)
    this.saveHistory().catch(() => {
      // Ignore save errors to not block command execution
    });
  }

  async getCommands(): Promise<string[]> {
    if (!this.loaded) {
      await this.loadHistory();
    }

    return this.history.map(entry => entry.command);
  }

  async getHistory(): Promise<HistoryEntry[]> {
    if (!this.loaded) {
      await this.loadHistory();
    }

    return [...this.history]; // Return copy to prevent external modifications
  }

  async searchHistory(term: string, limit = 20): Promise<HistorySearchResult[]> {
    if (!this.loaded) {
      await this.loadHistory();
    }

    const results: HistorySearchResult[] = [];
    const lowerTerm = term.toLowerCase();

    // Search from most recent to oldest
    for (let i = this.history.length - 1; i >= 0; i--) {
      const entry = this.history[i];
      if (!entry) {
        continue;
      }
      const lowerCommand = entry.command.toLowerCase();

      let matchType: 'exact' | 'partial' | null = null;

      if (lowerCommand === lowerTerm) {
        matchType = 'exact';
      } else if (lowerCommand.includes(lowerTerm)) {
        matchType = 'partial';
      }

      if (matchType) {
        results.push({
          entry,
          index: i,
          matchType
        });

        if (results.length >= limit) break;
      }
    }

    // Sort by relevance: exact matches first, then by recency
    results.sort((a, b) => {
      if (a.matchType !== b.matchType) {
        return a.matchType === 'exact' ? -1 : 1;
      }
      return b.entry.timestamp - a.entry.timestamp;
    });

    return results;
  }

  async clearHistory(): Promise<void> {
    this.history = [];
    this.loaded = true;

    try {
      await fs.unlink(this.historyFile);
    } catch {
      // File might not exist, that's fine
    }
  }

  async getStats(): Promise<{
    totalCommands: number;
    uniqueCommands: number;
    currentSession: number;
    oldestCommand?: Date;
    newestCommand?: Date;
  }> {
    if (!this.loaded) {
      await this.loadHistory();
    }

    const uniqueCommands = new Set(this.history.map(entry => entry.command));
    const currentSessionCommands = this.history.filter(entry => entry.session === this.sessionId);

    const firstEntry = this.history[0];
    const lastEntry = this.history[this.history.length - 1];

    return {
      totalCommands: this.history.length,
      uniqueCommands: uniqueCommands.size,
      currentSession: currentSessionCommands.length,
      oldestCommand: firstEntry ? new Date(firstEntry.timestamp) : undefined,
      newestCommand: lastEntry ? new Date(lastEntry.timestamp) : undefined
    };
  }

  private isSensitiveCommand(command: string): boolean {
    const sensitivePatterns = [
      /api[_-]?key/i,
      /password/i,
      /secret/i,
      /token/i,
      /auth/i,
      /credential/i,
      /OPENAI_API_KEY/i,
      /export\s+\w*key/i
    ];

    return sensitivePatterns.some(pattern => pattern.test(command));
  }

  // Get commands formatted for readline history (most recent first for up arrow)
  async getReadlineHistory(): Promise<string[]> {
    const commands = await this.getCommands();

    return commands.reverse(); // Readline expects most recent first
  }
}
