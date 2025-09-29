import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ErrorsCommand } from '@/commands/ErrorsCommand.js';

describe('ErrorsCommand', () => {
  let mockShell: any;
  let mockPM2Client: any;
  let command: ErrorsCommand;

  beforeEach(() => {
    vi.useFakeTimers();
    
    mockShell = {
      prompt: vi.fn()
    };
    
    mockPM2Client = {
      list: vi.fn().mockResolvedValue([]),
      launchBus: vi.fn().mockResolvedValue({ on: vi.fn(), close: vi.fn() })
    };
    
    command = new ErrorsCommand(mockShell, mockPM2Client);
    vi.mocked(console.log).mockClear();
    vi.mocked(console.error).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('warns when no processes are available', async () => {
    mockPM2Client.list.mockResolvedValueOnce([]);

    await command.execute([]);

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No PM2 processes running'));
  });

  it('logs bus launch failures', async () => {
    mockPM2Client.list.mockResolvedValueOnce([global.testUtils.mockProcessInfo()]);
    mockPM2Client.launchBus.mockImplementationOnce((callback) => {
      callback(new Error('bus down'), null);
    });

    await command.execute(['5']);

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to launch PM2 bus'));
  });

  it('collects and prints error messages', async () => {
    const bus = {
      on: vi.fn(),
      close: vi.fn()
    };

    mockPM2Client.list.mockResolvedValueOnce([
      global.testUtils.mockProcessInfo({ name: 'api' }),
      global.testUtils.mockProcessInfo({ name: 'worker' })
    ]);

    mockPM2Client.launchBus.mockImplementationOnce((callback) => {
      callback(null, bus as unknown);
    });

    await command.execute(['2']);

    const errorHandler = bus.on.mock.calls.find(([event]) => event === 'log:err')?.[1] as (data: any) => void;
    expect(errorHandler).toBeTruthy();

    errorHandler({ process: { name: 'api', pm_id: 1 }, data: ' failure ' });
    await vi.runAllTimersAsync();

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Collecting error logs'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('📍 api'));
    expect(mockShell.prompt).toHaveBeenCalled();
  });
});
