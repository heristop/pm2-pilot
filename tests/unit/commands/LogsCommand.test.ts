import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LogsCommand } from '@/commands/LogsCommand.js';
import type { LogEntry } from '@/pm2/PM2Client.js';

vi.mock('child_process', () => import('../../__mocks__/child_process.ts'));

describe('LogsCommand', () => {
  let mockPM2Client: any;
  let command: LogsCommand;

  beforeEach(() => {
    // Create mock PM2 client
    mockPM2Client = {
      list: vi.fn().mockResolvedValue([]),
      launchBus: vi.fn(),
      getErrorLogs: vi.fn().mockResolvedValue([])
    };
    
    command = new LogsCommand(mockPM2Client);
    vi.mocked(console.log).mockClear();
    vi.mocked(console.error).mockClear();
  });

  it('shows usage when no arguments provided', async () => {
    await command.execute([]);

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Logs Command Options'));
  });

  it('warns when the process cannot be found', async () => {
    mockPM2Client.list.mockResolvedValueOnce([]);

    await command.execute(['api']);

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Process "api" not found'));
  });

  it('starts log streaming for a matching process', async () => {
    const bus = {
      on: vi.fn(),
      close: vi.fn()
    };

    mockPM2Client.list.mockResolvedValueOnce([
      global.testUtils.mockProcessInfo({ name: 'api', pm2_env: { pm_id: 1 } })
    ]);

    mockPM2Client.launchBus.mockImplementationOnce((callback) => {
      callback(null, bus as unknown);
    });

    const sigintSpy = vi.spyOn(process, 'on').mockImplementation(() => process);

    await command.execute(['api']);

    expect(mockPM2Client.launchBus).toHaveBeenCalled();
    expect(bus.on).toHaveBeenCalledWith('log:out', expect.any(Function));
    expect(bus.on).toHaveBeenCalledWith('log:err', expect.any(Function));
    expect(sigintSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));

    const outHandler = bus.on.mock.calls.find(([event]) => event === 'log:out')?.[1] as (data: any) => void;
    const errHandler = bus.on.mock.calls.find(([event]) => event === 'log:err')?.[1] as (data: any) => void;
    expect(outHandler).toBeTruthy();
    expect(errHandler).toBeTruthy();

    outHandler({ process: { name: 'api', pm_id: 1 }, data: ' output line ' });
    errHandler({ process: { name: 'api', pm_id: 1 }, data: ' error line ' });

    const sigintHandler = sigintSpy.mock.calls[0][1] as () => void;
    sigintHandler();

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Log streaming stopped'));

    sigintSpy.mockRestore();
  });

  it('handles bus launch errors gracefully', async () => {
    mockPM2Client.list.mockResolvedValueOnce([
      global.testUtils.mockProcessInfo({ name: 'api', pm2_env: { pm_id: 1 } })
    ]);

    mockPM2Client.launchBus.mockImplementationOnce((callback) => {
      callback(new Error('bus failure'), null as unknown as object);
    });

    await command.execute(['api']);

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to launch PM2 bus'));
  });

  it('analyzes error logs and shows insights', async () => {
    const logs: LogEntry[] = [
      {
        timestamp: '2024-01-01T00:00:00.000Z',
        level: 'error',
        message: 'ECONNREFUSED: connection refused',
        process: 'api',
        type: 'err'
      },
      {
        timestamp: '2024-01-01T01:00:00.000Z',
        level: 'error',
        message: 'Error: Cannot find module "missing"',
        process: 'api',
        type: 'err'
      },
      {
        timestamp: '2024-01-01T02:00:00.000Z',
        level: 'error',
        message: 'UnhandledPromiseRejectionWarning: boom',
        process: 'worker',
        type: 'err'
      },
      {
        timestamp: '2024-01-01T03:00:00.000Z',
        level: 'error',
        message: 'TypeError: cannot read property foo of undefined',
        process: 'worker',
        type: 'err'
      },
      {
        timestamp: '2024-01-01T04:00:00.000Z',
        level: 'error',
        message: 'Unexpected failure',
        process: 'api',
        type: 'err'
      }
    ];

    mockPM2Client.getErrorLogs.mockResolvedValueOnce(logs);

    await command.execute(['analyze']);

    expect(mockPM2Client.getErrorLogs).toHaveBeenCalledWith(undefined, 100);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Analyzing error logs'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Error Pattern Summary'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Recent Error Logs'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Recommendations'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Check if target services are running'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Time span'));
  });

  it('falls back to generic recommendations when error type is unknown', async () => {
    const logs: LogEntry[] = [
      {
        timestamp: '2024-01-02T00:00:00.000Z',
        level: 'error',
        message: 'Random crash without signature',
        process: 'api',
        type: 'err'
      }
    ];

    mockPM2Client.getErrorLogs.mockResolvedValueOnce(logs);

    await command.execute(['analyze', 'api']);

    expect(mockPM2Client.getErrorLogs).toHaveBeenCalledWith('api', 100);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Recommendations'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Review application logs for patterns'));
  });

  it('informs when no error logs are found during analysis', async () => {
    mockPM2Client.getErrorLogs.mockResolvedValueOnce([]);

    await command.execute(['analyze', 'worker']);

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No error logs found for process "worker"'));
  });

  it('reports failures while analyzing logs', async () => {
    mockPM2Client.getErrorLogs.mockRejectedValueOnce(new Error('analysis failed'));

    await command.execute(['analyze']);

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to analyze logs'));
  });

  it('shows formatted recent error logs', async () => {
    const logs: LogEntry[] = [
      {
        timestamp: '2024-01-03T00:00:00.000Z',
        level: 'error',
        message: 'Critical failure occurred',
        process: 'api',
        type: 'err'
      },
      {
        timestamp: '2024-01-03T00:05:00.000Z',
        level: 'warn',
        message: 'Potential issue detected',
        process: 'worker',
        type: 'err'
      }
    ];

    mockPM2Client.getErrorLogs.mockResolvedValueOnce(logs);

    await command.execute(['errors']);

    expect(mockPM2Client.getErrorLogs).toHaveBeenCalledWith(undefined, 50);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Recent Error Logs'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Showing 2 most recent error entries'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('❌'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('⚠️'));
  });

  it('informs when no recent error logs are available', async () => {
    mockPM2Client.getErrorLogs.mockResolvedValueOnce([]);

    await command.execute(['errors', 'api']);

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No error logs found for process "api"'));
  });

  it('reports failures while loading recent error logs', async () => {
    mockPM2Client.getErrorLogs.mockRejectedValueOnce(new Error('load failed'));

    await command.execute(['errors']);

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to show error logs'));
  });

});
