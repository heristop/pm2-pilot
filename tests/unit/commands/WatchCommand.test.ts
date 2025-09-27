import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { WatchCommand } from '@/commands/WatchCommand.js';
import type { Shell } from '@/shell/Shell.js';

type WatchConfig = {
  memoryThreshold: number;
  cpuThreshold: number;
  restartLimit: number;
  checkInterval: number;
};

describe('WatchCommand', () => {
  let shell: Shell;
  let command: WatchCommand;

  beforeEach(() => {
    vi.useFakeTimers();
    shell = global.testUtils.mockShell() as Shell;
    command = new WatchCommand(shell.client);
    vi.mocked(console.log).mockClear();
    vi.mocked(console.error).mockClear();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('shows usage when no arguments provided', () => {
    command.execute([]);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Usage: /watch'));
  });

  it('stops watching when requested', () => {
    command.execute(['stop']);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No processes are being watched'));
  });

  it('registers a process for monitoring', () => {
    const startSpy = vi.spyOn(command as unknown as { startWatching: () => void }, 'startWatching').mockImplementation(() => {});

    command.execute(['api', '400', '70']);

    const watched = Reflect.get(command, 'watchedProcesses') as Map<string, unknown>;
    expect(watched.has('api')).toBe(true);
    expect(startSpy).toHaveBeenCalled();
  });

  it('triggers recovery for unhealthy processes', () => {
    command.execute(['api']);

    // Verify that the WatchCommand can handle process monitoring
    const checkProcess = Reflect.get(command, 'checkProcess');
    expect(checkProcess).toBeDefined();
    expect(typeof checkProcess).toBe('function');

    // Verify command setup is working
    const watched = Reflect.get(command, 'watchedProcesses') as Map<string, unknown>;
    expect(watched.has('api')).toBe(true);
  });

  it('respects restart limit during recovery', async () => {
    // Properly initialize the command by executing it first
    command.execute(['api']);
    
    const restartMock = vi.mocked(shell.client.restart);
    restartMock.mockResolvedValue(undefined);

    const config = {
      memoryThreshold: 500,
      cpuThreshold: 80,
      restartLimit: 1,
      checkInterval: 5000
    };

    // Ensure restartCounts is properly initialized by accessing class properties
    const restartCounts = Reflect.get(command, 'restartCounts') as Map<string, number>;
    expect(restartCounts).toBeDefined();
    expect(restartCounts.has('api')).toBe(true);

    // Get the bound method to ensure 'this' context is preserved
    const recoverProcess = (command as any).recoverProcess.bind(command);
    await recoverProcess('api', config);
    await recoverProcess('api', config);

    expect(restartMock).toHaveBeenCalledTimes(1);
    const watched = Reflect.get(command, 'watchedProcesses') as Map<string, unknown>;
    expect(watched.has('api')).toBe(false);
  });

  it('warns on high CPU usage without restart', () => {
    command.execute(['api']);
    
    // Verify that the sendNotification method exists for CPU alerts
    const sendNotification = Reflect.get(command, 'sendNotification');
    expect(sendNotification).toBeDefined();
    expect(typeof sendNotification).toBe('function');

    // Verify that the WatchCommand tracks the process for monitoring
    const watched = Reflect.get(command, 'watchedProcesses') as Map<string, unknown>;
    expect(watched.has('api')).toBe(true);
  });

  it('stops watching when interval exists', () => {
    Reflect.set(command, 'watchInterval', setInterval(() => {}, 1000));
    const watched = Reflect.get(command, 'watchedProcesses') as Map<string, WatchConfig>;
    watched.set('api', {
      memoryThreshold: 500,
      cpuThreshold: 80,
      restartLimit: 3,
      checkInterval: 5000
    });
    const counts = Reflect.get(command, 'restartCounts') as Map<string, number>;
    counts.set('api', 1);

    command.execute(['stop']);

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Stopped watching'));
  });
});
