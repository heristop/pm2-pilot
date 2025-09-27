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

export interface ICommandHistoryManager {
  getSessionId(): string;
  isCurrentSession(sessionId?: string | null): boolean;
  loadHistory(): Promise<void>;
  saveHistory(): Promise<void>;
  addCommand(command: string): Promise<void>;
  getCommands(): Promise<string[]>;
  getHistory(): Promise<HistoryEntry[]>;
  searchHistory(term: string, limit?: number): Promise<HistorySearchResult[]>;
  clearHistory(): Promise<void>;
  getStats(): Promise<{
    totalCommands: number;
    uniqueCommands: number;
    currentSession: number;
    oldestCommand?: Date;
    newestCommand?: Date;
  }>;
  getReadlineHistory(): Promise<string[]>;
}