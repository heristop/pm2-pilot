import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import { CommandHistoryManager, HistoryEntry } from '../../../src/services/CommandHistoryManager.js';
import { PM2X_CONFIG } from '../../../src/utils/constants.js';

// Mock fs/promises
vi.mock('fs/promises');
const mockFs = vi.mocked(fs);

// Mock homedir
vi.mock('os', () => ({
  homedir: () => '/home/test'
}));

describe('CommandHistoryManager', () => {
  let manager: CommandHistoryManager;
  let consoleErrorSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new CommandHistoryManager();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('loadHistory', () => {
    it('should load valid history from file', async () => {
      const mockHistory: HistoryEntry[] = [
        { command: '/status', timestamp: 1000 },
        { command: '/list', timestamp: 2000 }
      ];
      
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockHistory));

      await manager.loadHistory();
      const history = await manager.getHistory();

      expect(history).toEqual(mockHistory);
      expect(mockFs.readFile).toHaveBeenCalledWith(PM2X_CONFIG.HISTORY_FILE, 'utf-8');
    });

    it('should handle non-existent file gracefully', async () => {
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'));

      await manager.loadHistory();
      const history = await manager.getHistory();

      expect(history).toEqual([]);
    });

    it('should filter invalid history entries', async () => {
      const mockHistory = [
        { command: '/status', timestamp: 1000 }, // valid
        { command: '', timestamp: 2000 }, // invalid - empty command
        { command: '/list' }, // invalid - missing timestamp
        null, // invalid - null entry
        { command: '  ', timestamp: 3000 }, // invalid - whitespace only
        { command: '/restart', timestamp: 4000 } // valid
      ];
      
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockHistory));

      await manager.loadHistory();
      const history = await manager.getHistory();

      expect(history).toEqual([
        { command: '/status', timestamp: 1000 },
        { command: '/restart', timestamp: 4000 }
      ]);
    });

    it('should sort history by timestamp', async () => {
      const mockHistory: HistoryEntry[] = [
        { command: '/list', timestamp: 3000 },
        { command: '/status', timestamp: 1000 },
        { command: '/restart', timestamp: 2000 }
      ];
      
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockHistory));

      await manager.loadHistory();
      const history = await manager.getHistory();

      expect(history).toEqual([
        { command: '/status', timestamp: 1000 },
        { command: '/restart', timestamp: 2000 },
        { command: '/list', timestamp: 3000 }
      ]);
    });

    it('should limit history to max size', async () => {
      // Create history with 1001 entries (exceeds default max of 1000)
      const mockHistory: HistoryEntry[] = Array.from({ length: 1001 }, (_, i) => ({
        command: `/command${i}`,
        timestamp: i
      }));
      
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockHistory));

      await manager.loadHistory();
      const history = await manager.getHistory();

      expect(history).toHaveLength(1000);
      expect(history[0].command).toBe('/command1'); // First entry should be removed
      expect(history[999].command).toBe('/command1000'); // Last entry preserved
    });

    it('should only load once', async () => {
      mockFs.readFile.mockResolvedValue('[]');

      await manager.loadHistory();
      await manager.loadHistory(); // Second call

      expect(mockFs.readFile).toHaveBeenCalledTimes(1);
    });
  });

  describe('saveHistory', () => {
    it('should save history to file', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      await manager.saveHistory();

      expect(mockFs.mkdir).toHaveBeenCalledWith('/home/test', { recursive: true });
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        PM2X_CONFIG.HISTORY_FILE,
        '[]'
      );
    });

    it('should handle save errors gracefully', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockRejectedValue(new Error('Permission denied'));

      await manager.saveHistory();

      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to save command history:', expect.any(Error));
    });
  });

  describe('addCommand', () => {
    beforeEach(() => {
      mockFs.readFile.mockResolvedValue('[]');
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
    });

    it('should add new command', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(12345);

      await manager.addCommand('/status');
      const history = await manager.getHistory();

      expect(history).toHaveLength(1);
      expect(history[0].command).toBe('/status');
      expect(history[0].timestamp).toBe(12345);
      expect(history[0].session).toMatch(/^session_/);
    });

    it('should skip empty commands', async () => {
      await manager.addCommand('');
      await manager.addCommand('   ');
      
      const history = await manager.getHistory();
      expect(history).toHaveLength(0);
    });

    it('should skip sensitive commands', async () => {
      await manager.addCommand('export API_KEY=secret');
      await manager.addCommand('set password=123');
      await manager.addCommand('token authentication');
      
      const history = await manager.getHistory();
      expect(history).toHaveLength(0);
    });

    it('should update timestamp of duplicate last command', async () => {
      vi.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(2000);

      await manager.addCommand('/status');
      await manager.addCommand('/status'); // Duplicate
      
      const history = await manager.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].timestamp).toBe(2000); // Updated timestamp
    });

    it('should add different commands separately', async () => {
      await manager.addCommand('/status');
      await manager.addCommand('/list');
      
      const history = await manager.getHistory();
      expect(history).toHaveLength(2);
    });

    it('should trim history when exceeding max size', async () => {
      // Mock a manager with smaller max size for testing
      const smallManager = new (class extends CommandHistoryManager {
        constructor() {
          super();
          Reflect.set(this, 'maxHistorySize', 2);
        }
      })();

      mockFs.readFile.mockResolvedValue('[]');

      await smallManager.addCommand('/status');
      await smallManager.addCommand('/list');
      await smallManager.addCommand('/restart'); // Should remove first
      
      const history = await smallManager.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0].command).toBe('/list');
      expect(history[1].command).toBe('/restart');
    });
  });

  describe('getCommands', () => {
    it('should return array of commands', async () => {
      const mockHistory: HistoryEntry[] = [
        { command: '/status', timestamp: 1000 },
        { command: '/list', timestamp: 2000 }
      ];
      
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockHistory));

      const commands = await manager.getCommands();
      expect(commands).toEqual(['/status', '/list']);
    });

    it('should return empty array for empty history', async () => {
      mockFs.readFile.mockResolvedValue('[]');

      const commands = await manager.getCommands();
      expect(commands).toEqual([]);
    });
  });

  describe('searchHistory', () => {
    beforeEach(async () => {
      const mockHistory: HistoryEntry[] = [
        { command: '/status', timestamp: 1000 },
        { command: '/list apps', timestamp: 2000 },
        { command: '/restart app1', timestamp: 3000 },
        { command: '/status all', timestamp: 4000 },
        { command: '/stop app1', timestamp: 5000 }
      ];
      
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockHistory));
      await manager.loadHistory();
    });

    it('should find exact matches', async () => {
      const results = await manager.searchHistory('/status');

      expect(results).toHaveLength(2);
      expect(results[0].matchType).toBe('exact');
      expect(results[0].entry.command).toBe('/status');
      expect(results[1].matchType).toBe('partial');
      expect(results[1].entry.command).toBe('/status all');
    });

    it('should find partial matches', async () => {
      const results = await manager.searchHistory('app1');

      expect(results).toHaveLength(2);
      expect(results.every(r => r.entry.command.includes('app1'))).toBe(true);
    });

    it('should respect search limit', async () => {
      const results = await manager.searchHistory('/', 2);

      expect(results).toHaveLength(2);
    });

    it('should sort by relevance (exact first, then by recency)', async () => {
      const results = await manager.searchHistory('/status');

      expect(results[0].matchType).toBe('exact');
      expect(results[0].entry.command).toBe('/status');
      expect(results[1].matchType).toBe('partial');
      expect(results[1].entry.command).toBe('/status all');
    });

    it('should return empty array for no matches', async () => {
      const results = await manager.searchHistory('nonexistent');

      expect(results).toEqual([]);
    });
  });

  describe('clearHistory', () => {
    it('should clear history and delete file', async () => {
      mockFs.readFile.mockResolvedValue('[{"command":"/status","timestamp":1000}]');
      mockFs.unlink.mockResolvedValue(undefined);

      await manager.loadHistory(); // Load some history first
      let history = await manager.getHistory();
      expect(history).toHaveLength(1);

      await manager.clearHistory();
      history = await manager.getHistory();

      expect(history).toEqual([]);
      expect(mockFs.unlink).toHaveBeenCalledWith(PM2X_CONFIG.HISTORY_FILE);
    });

    it('should handle file deletion errors gracefully', async () => {
      mockFs.unlink.mockRejectedValue(new Error('File not found'));

      await manager.clearHistory();
      
      // Should not throw error
      const history = await manager.getHistory();
      expect(history).toEqual([]);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      const sessionId = Reflect.get(manager, 'sessionId') as string | undefined;
      const mockHistory: HistoryEntry[] = [
        { command: '/status', timestamp: 1000, session: 'old_session' },
        { command: '/list', timestamp: 2000, session: sessionId },
        { command: '/status', timestamp: 3000, session: sessionId }, // Duplicate command
        { command: '/restart', timestamp: 4000, session: sessionId }
      ];
      
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockHistory));

      const stats = await manager.getStats();

      expect(stats.totalCommands).toBe(4);
      expect(stats.uniqueCommands).toBe(3); // /status, /list, /restart
      expect(stats.currentSession).toBe(3); // Commands from current session
      expect(stats.oldestCommand).toEqual(new Date(1000));
      expect(stats.newestCommand).toEqual(new Date(4000));
    });

    it('should handle empty history', async () => {
      mockFs.readFile.mockResolvedValue('[]');

      const stats = await manager.getStats();

      expect(stats.totalCommands).toBe(0);
      expect(stats.uniqueCommands).toBe(0);
      expect(stats.currentSession).toBe(0);
      expect(stats.oldestCommand).toBeUndefined();
      expect(stats.newestCommand).toBeUndefined();
    });
  });

  describe('getReadlineHistory', () => {
    it('should return commands in reverse order', async () => {
      const mockHistory: HistoryEntry[] = [
        { command: '/status', timestamp: 1000 },
        { command: '/list', timestamp: 2000 },
        { command: '/restart', timestamp: 3000 }
      ];
      
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockHistory));

      const readlineHistory = await manager.getReadlineHistory();
      
      expect(readlineHistory).toEqual(['/restart', '/list', '/status']);
    });
  });

  describe('sensitive command detection', () => {
    beforeEach(() => {
      mockFs.readFile.mockResolvedValue('[]');
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
    });

    it('should detect various sensitive patterns', async () => {
      const sensitiveCommands = [
        'export API_KEY=secret',
        'set PASSWORD=123',
        'configure secret token',
        'auth bearer token',
        'credential setup',
        'OPENAI_API_KEY=sk-123',
        'export MY_KEY=value'
      ];

      for (const cmd of sensitiveCommands) {
        await manager.addCommand(cmd);
      }

      const history = await manager.getHistory();
      expect(history).toHaveLength(0);
    });

    it('should allow non-sensitive commands', async () => {
      const nonSensitiveCommands = [
        '/status',
        '/list applications',
        '/restart myapp',
        'configure database',
        'setup environment'
      ];

      for (const cmd of nonSensitiveCommands) {
        await manager.addCommand(cmd);
      }

      const history = await manager.getHistory();
      expect(history).toHaveLength(nonSensitiveCommands.length);
    });
  });
});
