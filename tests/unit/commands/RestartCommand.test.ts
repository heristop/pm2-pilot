import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RestartCommand } from '@/commands/RestartCommand.js';

// Mock the dependencies
vi.mock('pm2', () => import('../../__mocks__/pm2.js'));

describe('RestartCommand', () => {
  let restartCommand: RestartCommand;
  let mockPM2Client: any;
  let consoleSpy: any;

  beforeEach(() => {
    // Create mock PM2 client
    mockPM2Client = {
      restart: vi.fn().mockResolvedValue(undefined),
      connect: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([])
    };
    
    restartCommand = new RestartCommand(mockPM2Client);
    
    // Mock console methods
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {})
    };
  });

  describe('basic properties', () => {
    it('should have correct name and description', () => {
      expect(restartCommand.name).toBe('restart');
      expect(restartCommand.description).toBe('Restart a PM2 process');
    });
  });

  describe('execute method', () => {
    it('should show usage when no arguments provided', async () => {
      await restartCommand.execute([]);
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Usage: /restart <process-name|process-id>')
      );
    });

    it('should restart a process successfully', async () => {
      await restartCommand.execute(['test-app']);
      
      expect(mockPM2Client.restart).toHaveBeenCalledWith('test-app');
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Restarting process: test-app...')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('✓ Process test-app restarted successfully')
      );
    });

    it('should restart a process by ID', async () => {
      await restartCommand.execute(['0']);
      
      expect(mockPM2Client.restart).toHaveBeenCalledWith('0');
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Restarting process: 0...')
      );
    });

    it('should handle restart errors gracefully', async () => {
      const errorMessage = 'Process not found';
      mockPM2Client.restart = vi.fn().mockRejectedValue(new Error(errorMessage));
      
      await restartCommand.execute(['non-existent']);
      
      expect(mockPM2Client.restart).toHaveBeenCalledWith('non-existent');
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining(`Failed to restart non-existent: ${errorMessage}`)
      );
    });

    it('should handle non-Error exceptions', async () => {
      mockPM2Client.restart = vi.fn().mockRejectedValue('String error');
      
      await restartCommand.execute(['test-app']);
      
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to restart test-app: String error')
      );
    });

    it('should handle multiple process names (first argument only)', async () => {
      await restartCommand.execute(['app1', 'app2', 'app3']);
      
      // Should only restart the first process
      expect(mockPM2Client.restart).toHaveBeenCalledWith('app1');
      expect(mockPM2Client.restart).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('should handle PM2 client connection errors', async () => {
      mockPM2Client.restart = vi.fn().mockRejectedValue(new Error('Not connected to PM2'));
      
      await restartCommand.execute(['test-app']);
      
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to restart test-app: Not connected to PM2')
      );
    });

    it('should handle undefined or null arguments gracefully', async () => {
      await restartCommand.execute([]);
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Usage: /restart <process-name|process-id>')
      );
      expect(mockPM2Client.restart).not.toHaveBeenCalled();
    });
  });
});