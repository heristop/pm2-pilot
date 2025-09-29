import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PM2Manager } from '@/services/PM2Manager.js';
import type { IPM2Client } from '@/interfaces/IPM2Client.js';
import type { ProcessInfo } from '@/pm2/PM2Client.js';

describe('PM2Manager', () => {
  let pm2Manager: PM2Manager;
  let mockClient: IPM2Client;

  const mockProcessInfo: ProcessInfo = {
    pid: 1234,
    name: 'test-app',
    status: 'online',
    cpu: 10,
    memory: 100000000,
    uptime: Date.now() - 10000,
    restarts: 0,
    user: 'testuser',
    watching: false,
    unstable_restarts: 0,
    created_at: Date.now() - 10000,
    pm2_env: {
      pm_id: 0,
      name: 'test-app',
      status: 'online',
      pm_uptime: Date.now() - 10000,
      restart_time: 0,
      unstable_restarts: 0,
      created_at: Date.now() - 10000,
      watching: false,
      username: 'testuser',
      exec_mode: 'fork',
      node_version: 'v18.0.0'
    },
    monit: {
      memory: 100000000,
      cpu: 10
    }
  };

  beforeEach(() => {
    mockClient = {
      list: vi.fn(),
      restart: vi.fn(),
      stop: vi.fn(),
      start: vi.fn(),
      delete: vi.fn(),
      reload: vi.fn(),
      describe: vi.fn(),
      jlist: vi.fn(),
      prettylist: vi.fn(),
      ping: vi.fn(),
      updatePM2: vi.fn(),
      reloadLogs: vi.fn(),
      flush: vi.fn(),
      reset: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      getProcessNames: vi.fn(),
      launchBus: vi.fn(),
      logs: vi.fn(),
      getErrorLogs: vi.fn()
    };

    pm2Manager = new PM2Manager(mockClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('restartAll', () => {
    it('should restart all processes successfully', async () => {
      const processes = [mockProcessInfo, { ...mockProcessInfo, name: 'test-app-2' }];
      vi.mocked(mockClient.list).mockResolvedValue(processes);
      vi.mocked(mockClient.restart).mockResolvedValue();

      const result = await pm2Manager.restartAll();

      expect(result).toEqual({
        success: true,
        message: '✅ Restarted 2 processes successfully',
        processCount: 2
      });
      expect(mockClient.list).toHaveBeenCalledOnce();
      expect(mockClient.restart).toHaveBeenCalledWith('all');
    });

    it('should handle case when no processes exist', async () => {
      vi.mocked(mockClient.list).mockResolvedValue([]);

      const result = await pm2Manager.restartAll();

      expect(result).toEqual({
        success: true,
        message: 'No processes to restart',
        processCount: 0
      });
      expect(mockClient.list).toHaveBeenCalledOnce();
      expect(mockClient.restart).not.toHaveBeenCalled();
    });

    it('should handle restart errors', async () => {
      const error = new Error('PM2 restart failed');
      vi.mocked(mockClient.list).mockResolvedValue([mockProcessInfo]);
      vi.mocked(mockClient.restart).mockRejectedValue(error);

      const result = await pm2Manager.restartAll();

      expect(result).toEqual({
        success: false,
        message: 'Failed to restart processes',
        error: 'PM2 restart failed'
      });
    });

    it('should handle non-Error objects', async () => {
      vi.mocked(mockClient.list).mockResolvedValue([mockProcessInfo]);
      vi.mocked(mockClient.restart).mockRejectedValue('string error');

      const result = await pm2Manager.restartAll();

      expect(result).toEqual({
        success: false,
        message: 'Failed to restart processes',
        error: 'string error'
      });
    });
  });

  describe('restartProcess', () => {
    it('should restart a specific process successfully', async () => {
      vi.mocked(mockClient.restart).mockResolvedValue();

      const result = await pm2Manager.restartProcess('test-app');

      expect(result).toEqual({
        success: true,
        message: '✅ Restarted "test-app" successfully'
      });
      expect(mockClient.restart).toHaveBeenCalledWith('test-app');
    });

    it('should handle restart errors', async () => {
      const error = new Error('Process not found');
      vi.mocked(mockClient.restart).mockRejectedValue(error);

      const result = await pm2Manager.restartProcess('test-app');

      expect(result).toEqual({
        success: false,
        message: 'Failed to restart "test-app"',
        error: 'Process not found'
      });
    });

    it('should handle non-Error objects', async () => {
      vi.mocked(mockClient.restart).mockRejectedValue('string error');

      const result = await pm2Manager.restartProcess('test-app');

      expect(result).toEqual({
        success: false,
        message: 'Failed to restart "test-app"',
        error: 'string error'
      });
    });
  });

  describe('stopAll', () => {
    it('should stop all online processes successfully', async () => {
      const processes = [
        mockProcessInfo,
        { ...mockProcessInfo, name: 'test-app-2', pm2_env: { ...mockProcessInfo.pm2_env, status: 'online' } },
        { ...mockProcessInfo, name: 'test-app-3', pm2_env: { ...mockProcessInfo.pm2_env, status: 'stopped' } }
      ];
      vi.mocked(mockClient.list).mockResolvedValue(processes);
      vi.mocked(mockClient.stop).mockResolvedValue();

      const result = await pm2Manager.stopAll();

      expect(result).toEqual({
        success: true,
        message: '✅ Stopped 2 processes successfully',
        processCount: 2
      });
      expect(mockClient.list).toHaveBeenCalledOnce();
      expect(mockClient.stop).toHaveBeenCalledWith('all');
    });

    it('should handle case when no online processes exist', async () => {
      const stoppedProcess = { ...mockProcessInfo, pm2_env: { ...mockProcessInfo.pm2_env, status: 'stopped' } };
      vi.mocked(mockClient.list).mockResolvedValue([stoppedProcess]);

      const result = await pm2Manager.stopAll();

      expect(result).toEqual({
        success: true,
        message: 'No online processes to stop',
        processCount: 0
      });
      expect(mockClient.list).toHaveBeenCalledOnce();
      expect(mockClient.stop).not.toHaveBeenCalled();
    });

    it('should handle stop errors', async () => {
      const error = new Error('PM2 stop failed');
      vi.mocked(mockClient.list).mockResolvedValue([mockProcessInfo]);
      vi.mocked(mockClient.stop).mockRejectedValue(error);

      const result = await pm2Manager.stopAll();

      expect(result).toEqual({
        success: false,
        message: 'Failed to stop processes',
        error: 'PM2 stop failed'
      });
    });
  });

  describe('stopProcess', () => {
    it('should stop a specific process successfully', async () => {
      vi.mocked(mockClient.stop).mockResolvedValue();

      const result = await pm2Manager.stopProcess('test-app');

      expect(result).toEqual({
        success: true,
        message: '✅ Stopped "test-app" successfully'
      });
      expect(mockClient.stop).toHaveBeenCalledWith('test-app');
    });

    it('should handle stop errors', async () => {
      const error = new Error('Process not found');
      vi.mocked(mockClient.stop).mockRejectedValue(error);

      const result = await pm2Manager.stopProcess('test-app');

      expect(result).toEqual({
        success: false,
        message: 'Failed to stop "test-app"',
        error: 'Process not found'
      });
    });
  });

  describe('startProcess', () => {
    it('should start a specific process successfully', async () => {
      vi.mocked(mockClient.start).mockResolvedValue();

      const result = await pm2Manager.startProcess('test-app');

      expect(result).toEqual({
        success: true,
        message: '✅ Started "test-app" successfully'
      });
      expect(mockClient.start).toHaveBeenCalledWith('test-app');
    });

    it('should handle start errors', async () => {
      const error = new Error('Process not found');
      vi.mocked(mockClient.start).mockRejectedValue(error);

      const result = await pm2Manager.startProcess('test-app');

      expect(result).toEqual({
        success: false,
        message: 'Failed to start "test-app"',
        error: 'Process not found'
      });
    });
  });

  describe('deleteProcess', () => {
    it('should delete a specific process successfully', async () => {
      vi.mocked(mockClient.delete).mockResolvedValue();

      const result = await pm2Manager.deleteProcess('test-app');

      expect(result).toEqual({
        success: true,
        message: '✅ Deleted "test-app" successfully'
      });
      expect(mockClient.delete).toHaveBeenCalledWith('test-app');
    });

    it('should handle delete errors', async () => {
      const error = new Error('Process not found');
      vi.mocked(mockClient.delete).mockRejectedValue(error);

      const result = await pm2Manager.deleteProcess('test-app');

      expect(result).toEqual({
        success: false,
        message: 'Failed to delete "test-app"',
        error: 'Process not found'
      });
    });
  });

  describe('reloadProcess', () => {
    it('should reload a specific process successfully', async () => {
      vi.mocked(mockClient.reload).mockResolvedValue();

      const result = await pm2Manager.reloadProcess('test-app');

      expect(result).toEqual({
        success: true,
        message: '✅ Reloaded "test-app" successfully'
      });
      expect(mockClient.reload).toHaveBeenCalledWith('test-app');
    });

    it('should handle reload errors', async () => {
      const error = new Error('Process not found');
      vi.mocked(mockClient.reload).mockRejectedValue(error);

      const result = await pm2Manager.reloadProcess('test-app');

      expect(result).toEqual({
        success: false,
        message: 'Failed to reload "test-app"',
        error: 'Process not found'
      });
    });
  });

  describe('getProcessStatus', () => {
    it('should return process status with processes available', async () => {
      const processes = [
        mockProcessInfo,
        { ...mockProcessInfo, name: 'test-app-2', pm2_env: { ...mockProcessInfo.pm2_env, status: 'online' } },
        { ...mockProcessInfo, name: 'test-app-3', pm2_env: { ...mockProcessInfo.pm2_env, status: 'stopped' } }
      ];
      vi.mocked(mockClient.list).mockResolvedValue(processes);

      const result = await pm2Manager.getProcessStatus();

      expect(result).toEqual({
        hasProcesses: true,
        processCount: 3,
        onlineCount: 2
      });
      expect(mockClient.list).toHaveBeenCalledOnce();
    });

    it('should return process status with no processes', async () => {
      vi.mocked(mockClient.list).mockResolvedValue([]);

      const result = await pm2Manager.getProcessStatus();

      expect(result).toEqual({
        hasProcesses: false,
        processCount: 0,
        onlineCount: 0
      });
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(mockClient.list).mockRejectedValue(new Error('PM2 connection failed'));

      const result = await pm2Manager.getProcessStatus();

      expect(result).toEqual({
        hasProcesses: false,
        processCount: 0,
        onlineCount: 0
      });
    });
  });
});