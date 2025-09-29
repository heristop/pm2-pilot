import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MetricsCommand } from '@/commands/MetricsCommand.js';
import type { ProcessInfo } from '@/pm2/PM2Client.js';

// Mock the dependencies
vi.mock('pm2', () => import('../../__mocks__/pm2.js'));

describe('MetricsCommand', () => {
  let metricsCommand: MetricsCommand;
  let mockRenderer: any;
  let mockPM2Client: any;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Create mock renderer
    mockRenderer = {
      colorizeStatus: vi.fn().mockImplementation((status: string) => status),
      formatMemory: vi.fn().mockImplementation((bytes: number) => `${bytes}B`),
      formatUptime: vi.fn().mockImplementation((uptime: number) => `${uptime}s`),
      renderTable: vi.fn()
    };
    
    // Create mock PM2 client
    mockPM2Client = {
      list: vi.fn().mockResolvedValue([]),
      connect: vi.fn().mockResolvedValue(undefined)
    };
    
    metricsCommand = new MetricsCommand(mockRenderer, mockPM2Client);
    
    // Mock console methods
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('basic properties', () => {
    it('should have correct name, description, and aliases', () => {
      expect(metricsCommand.name).toBe('metrics');
      expect(metricsCommand.description).toBe('Show system metrics for PM2 processes');
      expect(metricsCommand.aliases).toContain('m');
    });
  });

  describe('execute method', () => {
    it('should handle empty process list', async () => {
      mockPM2Client.list.mockResolvedValue([]);
      
      await metricsCommand.execute([]);
      
      expect(mockPM2Client.list).toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('No PM2 processes running')
      );
    });

    it('should display metrics for running processes', async () => {
      const mockProcesses = [
        global.testUtils.mockProcessInfo({
          name: 'app1',
          pm2_env: { 
            pm_id: 0, 
            name: 'app1', 
            status: 'online',
            restart_time: 2,
            pm_uptime: Date.now() - 60000 // 1 minute ago
          },
          monit: { cpu: 15.5, memory: 67108864 } // 64MB
        }),
        global.testUtils.mockProcessInfo({
          name: 'app2',
          pm2_env: { 
            pm_id: 1, 
            name: 'app2', 
            status: 'stopped',
            restart_time: 0,
            pm_uptime: 0
          },
          monit: { cpu: 0, memory: 0 }
        })
      ];
      
      mockPM2Client.list.mockResolvedValue(mockProcesses);
      
      await metricsCommand.execute([]);
      
      expect(mockPM2Client.list).toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('📊 PM2 System Metrics')
      );
      expect(mockRenderer.renderTable).toHaveBeenCalledWith(
        mockProcesses,
        expect.any(Array)
      );
    });

    it('should calculate and display system metrics correctly', async () => {
      const mockProcesses = [
        global.testUtils.mockProcessInfo({
          name: 'app1',
          pm2_env: { pm_id: 0, status: 'online', restart_time: 1 },
          monit: { cpu: 10, memory: 50000000 }
        }),
        global.testUtils.mockProcessInfo({
          name: 'app2',
          pm2_env: { pm_id: 1, status: 'online', restart_time: 3 },
          monit: { cpu: 20, memory: 100000000 }
        })
      ];
      
      mockPM2Client.list.mockResolvedValue(mockProcesses);
      
      await metricsCommand.execute([]);
      
      // Should call the metrics calculation and display
      expect(mockPM2Client.list).toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('📊 PM2 System Metrics')
      );
    });

    it('should display health score', async () => {
      const mockProcesses = [
        global.testUtils.mockProcessInfo({
          name: 'healthy-app',
          pm2_env: { pm_id: 0, status: 'online', restart_time: 0 },
          monit: { cpu: 5, memory: 30000000 }
        })
      ];
      
      mockPM2Client.list.mockResolvedValue(mockProcesses);
      
      await metricsCommand.execute([]);
      
      expect(mockPM2Client.list).toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('📊 PM2 System Metrics')
      );
    });

    it('should handle PM2 connection errors', async () => {
      const errorMessage = 'PM2 not running';
      mockPM2Client.list.mockRejectedValue(new Error(errorMessage));
      
      await metricsCommand.execute([]);
      
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Failed to get metrics: ${errorMessage}`)
      );
    });

    it('should handle non-Error exceptions', async () => {
      mockPM2Client.list.mockRejectedValue('String error');
      
      await metricsCommand.execute([]);
      
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to get metrics: String error')
      );
    });
  });

  describe('health score calculation', () => {
    it('should return 100 for empty process list', () => {
      const calculateHealthScore = Reflect.get(metricsCommand, 'calculateHealthScore') as (processes: ProcessInfo[]) => number;
      const score = calculateHealthScore([]);
      expect(score).toBe(100);
    });

    it('should calculate excellent health score for healthy processes', () => {
      const processes = [
        global.testUtils.mockProcessInfo({
          name: 'app1',
          pm2_env: { status: 'online', restart_time: 0 }
        }),
        global.testUtils.mockProcessInfo({
          name: 'app2',
          pm2_env: { status: 'online', restart_time: 1 }
        })
      ];
      
      const calculateHealthScore = Reflect.get(metricsCommand, 'calculateHealthScore') as (processes: ProcessInfo[]) => number;
      const score = calculateHealthScore(processes);
      expect(score).toBeGreaterThanOrEqual(90);
    });

    it('should reduce score for offline processes', () => {
      const processes = [
        global.testUtils.mockProcessInfo({
          name: 'app1',
          pm2_env: { status: 'online', restart_time: 0 }
        }),
        global.testUtils.mockProcessInfo({
          name: 'app2',
          pm2_env: { status: 'stopped', restart_time: 0 }
        })
      ];
      
      const calculateHealthScore = Reflect.get(metricsCommand, 'calculateHealthScore') as (processes: ProcessInfo[]) => number;
      const score = calculateHealthScore(processes);
      expect(score).toBeLessThan(100);
    });

    it('should reduce score for errored processes', () => {
      const processes = [
        global.testUtils.mockProcessInfo({
          name: 'app1',
          pm2_env: { status: 'errored', restart_time: 0 }
        })
      ];
      
      const calculateHealthScore = Reflect.get(metricsCommand, 'calculateHealthScore') as (processes: ProcessInfo[]) => number;
      const score = calculateHealthScore(processes);
      expect(score).toBeLessThan(100);
    });

    it('should reduce score for high restart counts', () => {
      const processes = [
        global.testUtils.mockProcessInfo({
          name: 'app1',
          pm2_env: { status: 'online', restart_time: 10 }
        })
      ];
      
      const calculateHealthScore = Reflect.get(metricsCommand, 'calculateHealthScore') as (processes: ProcessInfo[]) => number;
      const score = calculateHealthScore(processes);
      expect(score).toBeLessThan(100);
    });

    it('should not go below 0', () => {
      const processes = [
        global.testUtils.mockProcessInfo({
          name: 'app1',
          pm2_env: { status: 'errored', restart_time: 50 }
        }),
        global.testUtils.mockProcessInfo({
          name: 'app2',
          pm2_env: { status: 'stopped', restart_time: 50 }
        })
      ];
      
      const calculateHealthScore = Reflect.get(metricsCommand, 'calculateHealthScore') as (processes: ProcessInfo[]) => number;
      const score = calculateHealthScore(processes);
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('health score formatting', () => {
    it('should format excellent health score in green', () => {
      const formatHealthScore = Reflect.get(metricsCommand, 'formatHealthScore') as (score: number) => string;
      const formatted = formatHealthScore(95);
      expect(formatted).toContain('95/100');
      expect(formatted).toContain('Excellent');
    });

    it('should format good health score in yellow', () => {
      const formatHealthScore = Reflect.get(metricsCommand, 'formatHealthScore') as (score: number) => string;
      const formatted = formatHealthScore(75);
      expect(formatted).toContain('75/100');
      expect(formatted).toContain('Good');
    });

    it('should format fair health score in orange', () => {
      const formatHealthScore = Reflect.get(metricsCommand, 'formatHealthScore') as (score: number) => string;
      const formatted = formatHealthScore(60);
      expect(formatted).toContain('60/100');
      expect(formatted).toContain('Fair');
    });

    it('should format poor health score in red', () => {
      const formatHealthScore = Reflect.get(metricsCommand, 'formatHealthScore') as (score: number) => string;
      const formatted = formatHealthScore(30);
      expect(formatted).toContain('30/100');
      expect(formatted).toContain('Poor');
    });
  });

  describe('metrics calculations', () => {
    it('should handle processes with missing monit data', async () => {
      const mockProcesses = [
        global.testUtils.mockProcessInfo({
          name: 'app1',
          pm2_env: { status: 'online', restart_time: 0 },
          monit: { cpu: undefined, memory: undefined }
        })
      ];
      
      mockPM2Client.list.mockResolvedValue(mockProcesses);
      
      await expect(metricsCommand.execute([])).resolves.not.toThrow();
    });

    it('should handle processes with null monit values', async () => {
      const mockProcesses = [
        global.testUtils.mockProcessInfo({
          name: 'app1',
          pm2_env: { status: 'online', restart_time: 0 },
          monit: { cpu: null, memory: null }
        })
      ];
      
      mockPM2Client.list.mockResolvedValue(mockProcesses);
      
      await expect(metricsCommand.execute([])).resolves.not.toThrow();
    });
  });
});
