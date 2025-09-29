import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PM2Client } from '@/pm2/PM2Client.js';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';

// Mock the PM2 module
vi.mock('pm2', () => import('../../__mocks__/pm2.js'));
vi.mock('fs', () => ({ existsSync: vi.fn(), readFileSync: vi.fn() }));
vi.mock('fs/promises', () => ({ readFile: vi.fn() }));

describe('PM2Client', () => {
  let pm2Client: PM2Client;

  beforeEach(() => {
    pm2Client = new PM2Client();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('connection management', () => {
    it('should connect to PM2 successfully', async () => {
      await expect(pm2Client.connect()).resolves.not.toThrow();
    });

    it('should disconnect from PM2 successfully', async () => {
      await pm2Client.connect();
      await expect(pm2Client.disconnect()).resolves.not.toThrow();
    });

    it('should handle connection errors', async () => {
      const pm2 = await import('pm2');
      vi.mocked(pm2.default.connect).mockImplementation((callback) => {
        callback(new Error('Connection failed'));
      });

      await expect(pm2Client.connect()).rejects.toThrow('Failed to connect to PM2: Connection failed');
    });
  });

  describe('process operations', () => {
    beforeEach(async () => {
      // Set up PM2 mock to connect successfully
      const pm2 = await import('pm2');
      vi.mocked(pm2.default.connect).mockImplementation((callback) => {
        callback(null);
      });
      await pm2Client.connect();
    });

    it('should list processes successfully', async () => {
      const processes = await pm2Client.list();
      
      expect(processes).toHaveLength(2);
      expect(processes[0]).toHaveProperty('name', 'test-app-1');
      expect(processes[1]).toHaveProperty('name', 'test-app-2');
    });

    it('should describe a specific process', async () => {
      const processes = await pm2Client.describe('test-app');
      
      expect(processes).toHaveLength(1);
      expect(processes[0]).toHaveProperty('name', 'test-app');
    });

    it('should restart a process', async () => {
      await expect(pm2Client.restart('test-app')).resolves.not.toThrow();
    });

    it('should stop a process', async () => {
      await expect(pm2Client.stop('test-app')).resolves.not.toThrow();
    });

    it('should start a process', async () => {
      await expect(pm2Client.start('test-app')).resolves.not.toThrow();
    });

    it('should delete a process', async () => {
      await expect(pm2Client.delete('test-app')).resolves.not.toThrow();
    });

    it('should flush logs', async () => {
      await expect(pm2Client.flush()).resolves.not.toThrow();
    });
  });

  describe('bus operations', () => {
    beforeEach(async () => {
      // Set up PM2 mock to connect successfully
      const pm2 = await import('pm2');
      vi.mocked(pm2.default.connect).mockImplementation((callback) => {
        callback(null);
      });
      await pm2Client.connect();
    });

    it('should launch PM2 bus successfully', () => {
      const callback = vi.fn();
      
      pm2Client.launchBus(callback);
      
      expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({
        on: expect.any(Function),
        close: expect.any(Function)
      }));
    });
  });

  describe('error handling', () => {
    it('should throw error when not connected', async () => {
      await expect(pm2Client.list()).rejects.toThrow('Not connected to PM2');
      await expect(pm2Client.restart('test')).rejects.toThrow('Not connected to PM2');
      await expect(pm2Client.stop('test')).rejects.toThrow('Not connected to PM2');
      await expect(pm2Client.start('test')).rejects.toThrow('Not connected to PM2');
      await expect(pm2Client.delete('test')).rejects.toThrow('Not connected to PM2');
      await expect(pm2Client.flush()).rejects.toThrow('Not connected to PM2');
    });

    it('should handle PM2 operation errors', async () => {
      // Set up PM2 mock to connect successfully first
      const pm2 = await import('pm2');
      vi.mocked(pm2.default.connect).mockImplementation((callback) => {
        callback(null);
      });
      await pm2Client.connect();
      
      // Then set up restart to fail
      vi.mocked(pm2.default.restart).mockImplementation((name, callback) => {
        callback(new Error('Restart failed'));
      });

      await expect(pm2Client.restart('test-app')).rejects.toThrow('Failed to restart test-app: Restart failed');
    });
  });

  describe('logs retrieval', () => {
    beforeEach(async () => {
      const pm2 = await import('pm2');
      vi.mocked(pm2.default.connect).mockImplementation((callback) => {
        callback(null);
      });
      await pm2Client.connect();
    });

    it('aggregates process logs from files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.readFile).mockResolvedValue(
        '2024-01-01T00:00:00Z info server started\n2024-01-01T00:01:00Z warn memory high'
      );

      const logs = await pm2Client.logs({ lines: 5 });

      const messages = logs.map(log => log.message);
      expect(messages.some(msg => msg.includes('server started'))).toBe(true);
    });

    it('handles unreadable log files gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.readFile).mockRejectedValue(new Error('no access'));

      const logs = await pm2Client.logs({ lines: 5 });
      expect(logs).toEqual([]);
    });
  });
});
