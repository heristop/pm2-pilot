import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StopCommand } from '@/commands/StopCommand.js';

// Mock the dependencies
vi.mock('pm2', () => import('../../__mocks__/pm2.js'));

describe('StopCommand', () => {
  let stopCommand: StopCommand;
  let mockPM2Client: any;
  let consoleSpy: any;

  beforeEach(() => {
    // Create mock PM2 client
    mockPM2Client = {
      stop: vi.fn().mockResolvedValue(undefined),
      connect: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([])
    };
    
    stopCommand = new StopCommand(mockPM2Client);
    
    // Mock console methods
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {})
    };
  });

  describe('basic properties', () => {
    it('should have correct name and description', () => {
      expect(stopCommand.name).toBe('stop');
      expect(stopCommand.description).toBe('Stop a PM2 process');
    });
  });

  describe('execute method', () => {
    it('should show usage when no arguments provided', async () => {
      await stopCommand.execute([]);
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Usage: /stop <process-name|process-id>')
      );
    });

    it('should stop a process successfully', async () => {
      await stopCommand.execute(['test-app']);
      
      expect(mockPM2Client.stop).toHaveBeenCalledWith('test-app');
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Stopping process: test-app...')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('✓ Process test-app stopped successfully')
      );
    });

    it('should stop a process by ID', async () => {
      await stopCommand.execute(['0']);
      
      expect(mockPM2Client.stop).toHaveBeenCalledWith('0');
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Stopping process: 0...')
      );
    });

    it('should handle stop errors gracefully', async () => {
      const errorMessage = 'Process not found';
      mockPM2Client.stop = vi.fn().mockRejectedValue(new Error(errorMessage));
      
      await stopCommand.execute(['non-existent']);
      
      expect(mockPM2Client.stop).toHaveBeenCalledWith('non-existent');
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining(`Failed to stop non-existent: ${errorMessage}`)
      );
    });

    it('should handle non-Error exceptions', async () => {
      mockPM2Client.stop = vi.fn().mockRejectedValue('String error');
      
      await stopCommand.execute(['test-app']);
      
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to stop test-app: String error')
      );
    });

    it('should handle multiple process names (first argument only)', async () => {
      await stopCommand.execute(['app1', 'app2', 'app3']);
      
      // Should only stop the first process
      expect(mockPM2Client.stop).toHaveBeenCalledWith('app1');
      expect(mockPM2Client.stop).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('should handle PM2 client connection errors', async () => {
      mockPM2Client.stop = vi.fn().mockRejectedValue(new Error('Not connected to PM2'));
      
      await stopCommand.execute(['test-app']);
      
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to stop test-app: Not connected to PM2')
      );
    });

    it('should handle undefined or null arguments gracefully', async () => {
      await stopCommand.execute([]);
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Usage: /stop <process-name|process-id>')
      );
      expect(mockPM2Client.stop).not.toHaveBeenCalled();
    });
  });
});