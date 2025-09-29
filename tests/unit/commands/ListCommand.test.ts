import { describe, it, expect, vi, beforeEach } from 'vitest';
import { container } from '@/container.js';
import { ListCommand } from '@/commands/ListCommand.js';
import { StatusCommand } from '@/commands/StatusCommand.js';
import { StatusService } from '@/services/StatusService.js';
import type { IShell } from '@/interfaces/IShell.js';
import { Renderer } from '@/display/Renderer.js';

// Mock the dependencies
vi.mock('pm2', () => import('../../__mocks__/pm2.js'));

describe('ListCommand', () => {
  let listCommand: ListCommand;
  let mockShell: IShell;

  beforeEach(() => {
    mockShell = global.testUtils.mockShell();
    container.register('IShell', { useValue: mockShell });
    container.register('IPM2Client', { useValue: mockShell.client });
    container.register('IRenderer', { useClass: Renderer });
    container.registerSingleton('StatusService', StatusService);
    container.registerSingleton('StatusCommand', StatusCommand);
    listCommand = container.resolve(ListCommand);
  });

  describe('basic properties', () => {
    it('should have correct name, description, and aliases', () => {
      expect(listCommand.name).toBe('list');
      expect(listCommand.description).toBe('List all PM2 processes (alias for status)');
      expect(listCommand.aliases).toContain('ls');
    });
  });

  describe('execute method', () => {
    it('should delegate to StatusCommand with args', async () => {
      const mockStatusCommand = {
        execute: vi.fn().mockResolvedValue()
      };
      
      const spy = vi.spyOn(container, 'resolve').mockReturnValue(mockStatusCommand as any);
      
      const args = ['test-arg'];
      await listCommand.execute(args);
      
      expect(spy).toHaveBeenCalledWith(StatusCommand);
      expect(mockStatusCommand.execute).toHaveBeenCalledWith(args);
      
      spy.mockRestore();
    });

    it('should delegate to StatusCommand with empty args', async () => {
      const mockStatusCommand = {
        execute: vi.fn().mockResolvedValue()
      };
      
      const spy = vi.spyOn(container, 'resolve').mockReturnValue(mockStatusCommand as any);
      
      await listCommand.execute([]);
      
      expect(spy).toHaveBeenCalledWith(StatusCommand);
      expect(mockStatusCommand.execute).toHaveBeenCalledWith([]);
      
      spy.mockRestore();
    });

    it('should handle StatusCommand errors', async () => {
      const mockStatusCommand = {
        execute: vi.fn().mockRejectedValue(new Error('StatusCommand failed'))
      };
      
      const spy = vi.spyOn(container, 'resolve').mockReturnValue(mockStatusCommand as any);
      
      await expect(listCommand.execute([])).rejects.toThrow('StatusCommand failed');
      
      spy.mockRestore();
    });
  });
});