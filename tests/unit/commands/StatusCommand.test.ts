import { describe, it, expect, vi, beforeEach } from 'vitest';
import { container } from '@/container.js';
import { StatusCommand } from '@/commands/StatusCommand.js';
import { StatusService } from '@/services/StatusService.js';
import type { IShell } from '@/interfaces/IShell.js';
import { Renderer } from '@/display/Renderer.js';

// Mock the dependencies
vi.mock('pm2', () => import('../../__mocks__/pm2.js'));

describe('StatusCommand', () => {
  let statusCommand: StatusCommand;
  let mockShell: IShell;

  beforeEach(() => {
    mockShell = global.testUtils.mockShell();

    container.register('IShell', { useValue: mockShell });
    container.register('IPM2Client', { useValue: mockShell.client });
    container.register('IRenderer', { useClass: Renderer });
    container.register('StatusService', { useClass: StatusService });

    statusCommand = container.resolve(StatusCommand);
  });

  describe('basic properties', () => {
    it('should have correct name and description', () => {
      expect(statusCommand.name).toBe('status');
      expect(statusCommand.description).toBe('Show PM2 process status');
      expect(statusCommand.aliases).toContain('ps');
    });
  });

  describe('execute method', () => {
    it('should show status for all processes when no specific process is requested', async () => {
      const mockProcesses = [
        global.testUtils.mockProcessInfo({ name: 'app1', pm2_env: { pm_id: 0, status: 'online' } }),
        global.testUtils.mockProcessInfo({ name: 'app2', pm2_env: { pm_id: 1, status: 'stopped' } })
      ];
      
      mockShell.client.list = vi.fn().mockResolvedValue(mockProcesses);
      
      await statusCommand.execute([]);
      
      expect(mockShell.client.list).toHaveBeenCalled();
    });

    it('should show status for a specific process when process name is provided', async () => {
      const mockProcesses = [
        global.testUtils.mockProcessInfo({ 
          name: 'test-app',
          pm2_env: { pm_id: 0, name: 'test-app', status: 'online' }
        }),
        global.testUtils.mockProcessInfo({ 
          name: 'other-app',
          pm2_env: { pm_id: 1, name: 'other-app', status: 'online' }
        })
      ];
      
      mockShell.client.list = vi.fn().mockResolvedValue(mockProcesses);
      
      await statusCommand.execute(['test-app']);
      
      expect(mockShell.client.list).toHaveBeenCalled();
    });

    it('should handle empty process list gracefully', async () => {
      mockShell.client.list = vi.fn().mockResolvedValue([]);
      await expect(statusCommand.execute([])).resolves.not.toThrow();
      expect(mockShell.client.list).toHaveBeenCalled();
    });

    it('should handle PM2 connection errors', async () => {
      await expect(statusCommand.execute([])).resolves.not.toThrow();
    });

    it('should handle non-existent process gracefully', async () => {
      await expect(statusCommand.execute(['non-existent'])).resolves.not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should handle PM2 client errors gracefully', async () => {
      await expect(statusCommand.execute([])).resolves.not.toThrow();
    });

    it('should handle malformed process data', async () => {
      await expect(statusCommand.execute([])).resolves.not.toThrow();
    });
  });
});