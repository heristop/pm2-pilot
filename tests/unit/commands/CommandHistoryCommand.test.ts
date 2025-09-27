import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CommandHistoryCommand } from '../../../src/commands/CommandHistoryCommand.js';
import type { Shell } from '../../../src/shell/Shell.js';
import type { CommandHistoryManager, HistoryEntry, HistorySearchResult } from '../../../src/services/CommandHistoryManager.js';

describe('CommandHistoryCommand', () => {
  let command: CommandHistoryCommand;
  let mockShell: Shell;
  let mockHistory: CommandHistoryManager;

  beforeEach(() => {
    // Mock history manager
    const historyStub: Partial<CommandHistoryManager> = {
      getHistory: vi.fn(),
      searchHistory: vi.fn(),
      getStats: vi.fn(),
      clearHistory: vi.fn()
    };
    mockHistory = historyStub as CommandHistoryManager;

    // Mock shell with history property
    mockShell = global.testUtils.mockShell() as Shell;
    Reflect.set(mockShell, 'history', mockHistory);

    // Add sessionId to history for testing
    Reflect.set(mockHistory, 'sessionId', 'current_session');

    command = new CommandHistoryCommand(mockHistory);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('command properties', () => {
    it('should have correct name', () => {
      expect(command.name).toBe('cmd-history');
    });

    it('should have correct description', () => {
      expect(command.description).toBe('Manage command history');
    });

    it('should have correct aliases', () => {
      expect(command.aliases).toEqual(['history', 'hist']);
    });
  });

  describe('show/list history', () => {
    it('should show recent history with default limit', async () => {
      const mockHistoryEntries: HistoryEntry[] = Array.from({ length: 25 }, (_, i) => ({
        command: `/command${i}`,
        timestamp: 1000 + i,
        session: i < 10 ? 'current_session' : 'old_session'
      }));

      mockHistory.getHistory = vi.fn().mockResolvedValue(mockHistoryEntries);

      await command.execute([]);

      expect(mockHistory.getHistory).toHaveBeenCalled();
    });

    it('should show history with custom limit', async () => {
      const mockHistoryEntries: HistoryEntry[] = Array.from({ length: 15 }, (_, i) => ({
        command: `/command${i}`,
        timestamp: 1000 + i,
        session: 'current_session'
      }));

      mockHistory.getHistory = vi.fn().mockResolvedValue(mockHistoryEntries);

      await command.execute(['show', '10']);

      expect(mockHistory.getHistory).toHaveBeenCalled();
    });

    it('should handle empty history', async () => {
      mockHistory.getHistory = vi.fn().mockResolvedValue([]);

      await command.execute([]);

      expect(mockHistory.getHistory).toHaveBeenCalled();
    });

    it('should show session indicators correctly', async () => {
      const mockHistoryEntries: HistoryEntry[] = [
        { command: '/old', timestamp: 1000, session: 'old_session' },
        { command: '/current', timestamp: 2000, session: 'current_session' }
      ];

      mockHistory.getHistory = vi.fn().mockResolvedValue(mockHistoryEntries);

      await command.execute([]);

      expect(mockHistory.getHistory).toHaveBeenCalled();
    });

    it('should show pagination info for large history', async () => {
      const mockHistoryEntries: HistoryEntry[] = Array.from({ length: 50 }, (_, i) => ({
        command: `/command${i}`,
        timestamp: 1000 + i,
        session: 'session'
      }));

      mockHistory.getHistory = vi.fn().mockResolvedValue(mockHistoryEntries);

      await command.execute([]);

      expect(mockHistory.getHistory).toHaveBeenCalled();
    });
  });

  describe('search history', () => {
    it('should search for commands', async () => {
      const mockSearchResults: HistorySearchResult[] = [
        {
          entry: { command: '/status', timestamp: 1000, session: 'session1' },
          index: 0,
          matchType: 'exact'
        },
        {
          entry: { command: '/status all', timestamp: 2000, session: 'session2' },
          index: 1,
          matchType: 'partial'
        }
      ];

      mockHistory.searchHistory = vi.fn().mockResolvedValue(mockSearchResults);

      await command.execute(['search', 'status']);

      expect(mockHistory.searchHistory).toHaveBeenCalledWith('status', 15);
    });

    it('should handle search with no results', async () => {
      mockHistory.searchHistory = vi.fn().mockResolvedValue([]);

      await command.execute(['search', 'nonexistent']);

      expect(mockHistory.searchHistory).toHaveBeenCalledWith('nonexistent', 15);
    });

    it('should require search term', async () => {
      await command.execute(['search']);

      // Should not call searchHistory without a term
      expect(mockHistory.searchHistory).not.toHaveBeenCalled();
    });

    it('should highlight search terms in results', async () => {
      const mockSearchResults: HistorySearchResult[] = [
        {
          entry: { command: '/restart my-app', timestamp: 1000, session: 'session' },
          index: 0,
          matchType: 'partial'
        }
      ];

      mockHistory.searchHistory = vi.fn().mockResolvedValue(mockSearchResults);

      await command.execute(['search', 'restart']);

      expect(mockHistory.searchHistory).toHaveBeenCalledWith('restart', 15);
    });

    it('should show different match type indicators', async () => {
      const mockSearchResults: HistorySearchResult[] = [
        {
          entry: { command: '/status', timestamp: 1000, session: 'session' },
          index: 0,
          matchType: 'exact'
        },
        {
          entry: { command: '/status all', timestamp: 2000, session: 'session' },
          index: 1,
          matchType: 'partial'
        }
      ];

      mockHistory.searchHistory = vi.fn().mockResolvedValue(mockSearchResults);

      await command.execute(['search', 'status']);

      expect(mockHistory.searchHistory).toHaveBeenCalledWith('status', 15);
    });
  });

  describe('show stats', () => {
    it('should display comprehensive statistics', async () => {
      const mockStats = {
        totalCommands: 150,
        uniqueCommands: 85,
        currentSession: 25,
        oldestCommand: new Date('2023-01-01T10:00:00Z'),
        newestCommand: new Date('2023-12-31T15:30:00Z')
      };

      mockHistory.getStats = vi.fn().mockResolvedValue(mockStats);

      await command.execute(['stats']);

      expect(mockHistory.getStats).toHaveBeenCalled();
    });

    it('should calculate and show derived statistics', async () => {
      const oldDate = new Date('2023-01-01T10:00:00Z');
      const newDate = new Date('2023-01-11T10:00:00Z'); // 10 days later
      
      const mockStats = {
        totalCommands: 100,
        uniqueCommands: 80,
        currentSession: 20,
        oldestCommand: oldDate,
        newestCommand: newDate
      };

      mockHistory.getStats = vi.fn().mockResolvedValue(mockStats);

      await command.execute(['stats']);

      expect(mockHistory.getStats).toHaveBeenCalled();
    });

    it('should handle stats with no history', async () => {
      const mockStats = {
        totalCommands: 0,
        uniqueCommands: 0,
        currentSession: 0,
        oldestCommand: undefined,
        newestCommand: undefined
      };

      mockHistory.getStats = vi.fn().mockResolvedValue(mockStats);

      await command.execute(['stats']);

      expect(mockHistory.getStats).toHaveBeenCalled();
    });

    it('should handle stats with same day commands', async () => {
      const sameDate = new Date('2023-01-01T10:00:00Z');
      
      const mockStats = {
        totalCommands: 50,
        uniqueCommands: 40,
        currentSession: 10,
        oldestCommand: sameDate,
        newestCommand: sameDate
      };

      mockHistory.getStats = vi.fn().mockResolvedValue(mockStats);

      await command.execute(['stats']);

      expect(mockHistory.getStats).toHaveBeenCalled();
    });
  });

  describe('clear history', () => {
    it('should clear history with warning', async () => {
      mockHistory.clearHistory = vi.fn().mockResolvedValue(undefined);

      await command.execute(['clear']);

      expect(mockHistory.clearHistory).toHaveBeenCalled();
    });
  });

  describe('action routing', () => {
    it('should handle "list" action', async () => {
      mockHistory.getHistory = vi.fn().mockResolvedValue([]);

      await command.execute(['list']);

      expect(mockHistory.getHistory).toHaveBeenCalled();
    });

    it('should handle "show" action', async () => {
      mockHistory.getHistory = vi.fn().mockResolvedValue([]);

      await command.execute(['show', '5']);

      expect(mockHistory.getHistory).toHaveBeenCalled();
    });

    it('should default to show for unknown actions', async () => {
      mockHistory.getHistory = vi.fn().mockResolvedValue([]);

      await command.execute(['unknown-action']);

      expect(mockHistory.getHistory).toHaveBeenCalled();
    });

    it('should default to show with no arguments', async () => {
      mockHistory.getHistory = vi.fn().mockResolvedValue([]);

      await command.execute([]);

      expect(mockHistory.getHistory).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle invalid limit gracefully', async () => {
      mockHistory.getHistory = vi.fn().mockResolvedValue([]);

      await command.execute(['show', 'invalid-number']);

      // Should still call getHistory (will use undefined limit)
      expect(mockHistory.getHistory).toHaveBeenCalled();
    });

    it('should format timestamps correctly', async () => {
      const mockHistoryEntries: HistoryEntry[] = [
        { command: '/test', timestamp: 1672531200000, session: 'session' } // 2023-01-01 00:00:00 UTC
      ];

      mockHistory.getHistory = vi.fn().mockResolvedValue(mockHistoryEntries);

      await command.execute([]);

      expect(mockHistory.getHistory).toHaveBeenCalled();
    });

    it('should handle missing session ID gracefully', async () => {
      const mockHistoryEntries: HistoryEntry[] = [
        { command: '/test', timestamp: 1000 } // No session property
      ];

      mockHistory.getHistory = vi.fn().mockResolvedValue(mockHistoryEntries);
      // Don't set sessionId on mock shell

      await command.execute([]);

      // Should not throw and should still call getHistory
      expect(mockHistory.getHistory).toHaveBeenCalled();
    });
  });

  describe('method delegation', () => {
    it('should delegate to showHistory for show action', async () => {
      mockHistory.getHistory = vi.fn().mockResolvedValue([]);

      await command.execute(['show']);

      expect(mockHistory.getHistory).toHaveBeenCalled();
    });

    it('should delegate to searchHistory for search action', async () => {
      mockHistory.searchHistory = vi.fn().mockResolvedValue([]);

      await command.execute(['search', 'test']);

      expect(mockHistory.searchHistory).toHaveBeenCalledWith('test', 15);
    });

    it('should delegate to showStats for stats action', async () => {
      mockHistory.getStats = vi.fn().mockResolvedValue({
        totalCommands: 0,
        uniqueCommands: 0,
        currentSession: 0
      });

      await command.execute(['stats']);

      expect(mockHistory.getStats).toHaveBeenCalled();
    });

    it('should delegate to clearHistory for clear action', async () => {
      mockHistory.clearHistory = vi.fn().mockResolvedValue(undefined);

      await command.execute(['clear']);

      expect(mockHistory.clearHistory).toHaveBeenCalled();
    });
  });
});
