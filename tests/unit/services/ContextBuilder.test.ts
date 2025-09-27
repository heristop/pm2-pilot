import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContextBuilder } from '@/services/ContextBuilder.js';
import type { Shell } from '@/shell/Shell.js';
import type { ProcessInfo } from '@/pm2/PM2Client.js';

const createProcess = (overrides: Partial<ProcessInfo> = {}): ProcessInfo => {
  const base = global.testUtils.mockProcessInfo();
  return {
    ...base,
    ...overrides,
    pm2_env: {
      ...base.pm2_env,
      ...overrides.pm2_env
    },
    monit: {
      ...base.monit,
      ...overrides.monit
    }
  } as ProcessInfo;
};

describe('ContextBuilder', () => {
  let mockShell: Shell;
  let builder: ContextBuilder;

  beforeEach(() => {
    mockShell = global.testUtils.mockShell() as Shell;
    builder = new ContextBuilder(mockShell.client);
  });

  it('builds detailed context for a specific process', async () => {
    const process = createProcess({
      name: 'api-service',
      pid: 4321,
      pm2_env: {
        status: 'online',
        pm_uptime: Date.now() - 5 * 60 * 1000,
        watching: true,
        max_memory_restart: '500M',
        exec_mode: 'cluster',
        instances: 2,
        node_version: '22.1.0'
      },
      monit: {
        memory: 700 * 1024 * 1024,
        cpu: 85
      }
    });

    vi.mocked(mockShell.client.list).mockResolvedValueOnce([process]);

    const context = await builder.buildProcessContext('api-service');

    expect(context).toContain('Process: api-service');
    expect(context).toContain('PID: 4321');
    expect(context).toContain('Memory: 700.0MB');
    expect(context).toContain('CPU: 85%');
    expect(context).toContain('File watching: enabled');
    expect(context).toContain('Max memory restart: 500M');
  });

  it('throws when the requested process is missing', async () => {
    vi.mocked(mockShell.client.list).mockResolvedValueOnce([]);

    await expect(builder.buildProcessContext('missing-app')).rejects.toThrow('Process missing-app not found');
  });

  it('summarises and highlights issues across all processes', async () => {
    const healthy = createProcess({
      name: 'healthy-app',
      pm2_env: { status: 'online', restart_time: 1 },
      monit: { memory: 120 * 1024 * 1024, cpu: 10 }
    });

    const problematic = createProcess({
      name: 'problem-app',
      pm2_env: {
        status: 'errored',
        restart_time: 8,
        unstable_restarts: 2
      },
      monit: {
        memory: 800 * 1024 * 1024,
        cpu: 95
      }
    });

    vi.mocked(mockShell.client.list).mockResolvedValueOnce([healthy, problematic]);

    const context = await builder.buildProcessContext();

    expect(context).toContain('Total processes: 2');
    expect(context).toContain('Online: 1, Errored: 1, Stopped: 0');
    expect(context).toContain('- problem-app: errored');
    expect(context).toContain('Identified issues:');
    expect(context).toContain('problem-app: High memory usage');
    expect(context).toContain('problem-app: High CPU usage');
    expect(context).toContain('problem-app: Frequent restarts');
    expect(context).toContain('problem-app: Process in error state');
    expect(context).toContain('problem-app: Unstable');
  });

  it('calculates uptime across different ranges', () => {
    const calculate = (builder as unknown as { calculateUptime: (timestamp: number | undefined) => string }).calculateUptime;
    const now = Date.now();

    expect(calculate(undefined)).toBe('N/A');
    expect(calculate(now - 45 * 1000)).toBe('45s');
    expect(calculate(now - 5 * 60 * 1000)).toBe('5m');
    expect(calculate(now - 2 * 60 * 60 * 1000)).toBe('2h 0m');
    expect(calculate(now - 3 * 24 * 60 * 60 * 1000)).toBe('3d 0h');
  });

  it('provides placeholder contexts for errors and historical data', () => {
    expect(builder.buildErrorContext('api-service')).toContain('api-service');
    expect(builder.buildHistoricalContext()).toContain('all processes');
  });
});
