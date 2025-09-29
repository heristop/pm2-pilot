import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StartCommand } from '@/commands/StartCommand.js';

// Mock the dependencies
vi.mock('pm2', () => import('../../__mocks__/pm2.js'));

describe('StartCommand', () => {
  let startCommand: StartCommand;
  let mockPM2Client: any;
  let consoleSpy: any;

  beforeEach(() => {
    // Create mock PM2 client
    mockPM2Client = {
      start: vi.fn().mockResolvedValue(undefined),
      connect: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([])
    };
    
    startCommand = new StartCommand(mockPM2Client);
    
    // Mock console methods
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {})
    };
  });

  describe('basic properties', () => {
    it('should have correct name and description', () => {
      expect(startCommand.name).toBe('start');
      expect(startCommand.description).toBe('Start a PM2 process');
    });
  });

  describe('execute method', () => {
    it('should show usage when no arguments provided', async () => {
      await startCommand.execute([]);
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Usage: /start <process-name|process-id>')
      );
    });

    it('should start a process successfully', async () => {
      await startCommand.execute(['test-app']);
      
      expect(mockPM2Client.start).toHaveBeenCalledWith('test-app');
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Starting process: test-app...')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('✓ Process test-app started successfully')
      );
    });

    it('should start a process by ID', async () => {
      await startCommand.execute(['0']);
      
      expect(mockPM2Client.start).toHaveBeenCalledWith('0');
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Starting process: 0...')
      );
    });

    it('should handle start errors gracefully', async () => {
      const errorMessage = 'Process not found';
      mockPM2Client.start = vi.fn().mockRejectedValue(new Error(errorMessage));
      
      await startCommand.execute(['non-existent']);
      
      expect(mockPM2Client.start).toHaveBeenCalledWith('non-existent');
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining(`Failed to start non-existent: ${errorMessage}`)
      );
    });

    it('should handle non-Error exceptions', async () => {
      mockPM2Client.start = vi.fn().mockRejectedValue('String error');
      
      await startCommand.execute(['test-app']);
      
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to start test-app: String error')
      );
    });

    it('should handle multiple process names (first argument only)', async () => {
      await startCommand.execute(['app1', 'app2', 'app3']);
      
      // Should only start the first process
      expect(mockPM2Client.start).toHaveBeenCalledWith('app1');
      expect(mockPM2Client.start).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('should handle PM2 client connection errors', async () => {
      mockPM2Client.start = vi.fn().mockRejectedValue(new Error('Not connected to PM2'));
      
      await startCommand.execute(['test-app']);
      
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to start test-app: Not connected to PM2')
      );
    });

    it('should handle undefined or null arguments gracefully', async () => {
      await startCommand.execute([]);
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Usage: /start <process-name|process-id>')
      );
      expect(mockPM2Client.start).not.toHaveBeenCalled();
    });
  });
});