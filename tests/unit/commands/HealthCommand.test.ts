import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HealthCommand } from '@/commands/HealthCommand.js';

describe('HealthCommand', () => {
  let mockPM2Client: any;
  let mockRenderer: any;
  let command: HealthCommand;

  beforeEach(() => {
    mockPM2Client = {
      list: vi.fn().mockResolvedValue([])
    };
    mockRenderer = {
      colorizeStatus: vi.fn().mockImplementation((status: string) => status),
      formatMemory: vi.fn().mockImplementation((bytes: number) => `${bytes}B`),
      formatUptime: vi.fn().mockImplementation((uptime: number) => `${uptime}s`)
    };
    command = new HealthCommand(mockPM2Client, mockRenderer);
    vi.mocked(console.log).mockClear();
    vi.mocked(console.error).mockClear();
  });

  it('handles empty process lists', async () => {
    mockPM2Client.list.mockResolvedValueOnce([]);

    await command.execute([]);

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No PM2 processes running'));
  });

  it('reports when specific process is missing', async () => {
    mockPM2Client.list.mockResolvedValueOnce([
      global.testUtils.mockProcessInfo({ name: 'api' })
    ]);

    await command.execute(['worker']);

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Process "worker" not found'));
  });

  it('runs health checks and prints score', async () => {
    const healthy = global.testUtils.mockProcessInfo({
      name: 'api',
      monit: { cpu: 20, memory: 100 * 1024 * 1024 },
      pm2_env: {
        status: 'online',
        restart_time: 1,
        pm_uptime: Date.now() - 2 * 60 * 60 * 1000,
        unstable_restarts: 0
      }
    });

    const busy = global.testUtils.mockProcessInfo({
      name: 'worker',
      monit: { cpu: 95, memory: 600 * 1024 * 1024 },
      pm2_env: {
        status: 'online',
        restart_time: 5,
        pm_uptime: Date.now() - 5 * 60 * 1000,
        unstable_restarts: 2
      }
    });

    mockPM2Client.list.mockResolvedValueOnce([healthy, busy]);

    await command.execute([]);

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('🏥 PM2 Health Check Report'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Health Score'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Overall Health Score'));
  });
});
