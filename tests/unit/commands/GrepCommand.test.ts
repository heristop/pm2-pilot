import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GrepCommand } from '@/commands/GrepCommand.js';
import { exec } from 'child_process';
import type { ChildProcess } from 'child_process';

vi.mock('child_process', () => import('../../__mocks__/child_process.ts'));

describe('GrepCommand', () => {
  let mockPM2Client: any;
  let command: GrepCommand;

  beforeEach(() => {
    mockPM2Client = {
      list: vi.fn().mockResolvedValue([])
    };
    command = new GrepCommand(mockPM2Client);
    vi.mocked(console.log).mockClear();
    vi.mocked(console.error).mockClear();
    exec.mockReset();
    exec.mockImplementation((cmd, cb) => {
      cb?.(null, { stdout: '', stderr: '' });
      return {} as unknown as ChildProcess;
    });
  });

  it('prints usage when no pattern provided', async () => {
    await command.execute([]);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Usage: /grep'));
  });

  it('warns when process list is empty', async () => {
    mockPM2Client.list.mockResolvedValueOnce([]);
    await command.execute(['error']);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No PM2 processes running'));
  });

  it('filters processes by name and searches logs', async () => {
    const processes = [
      global.testUtils.mockProcessInfo({ name: 'api' }),
      global.testUtils.mockProcessInfo({ name: 'worker' })
    ];
    mockPM2Client.list.mockResolvedValueOnce(processes);

    exec.mockImplementationOnce((cmd, cb) => {
      cb?.(null, { stdout: '/tmp/out.log\n', stderr: '' });
      return {} as unknown as ChildProcess;
    });
    exec.mockImplementationOnce((cmd, cb) => {
      cb?.(null, { stdout: '/tmp/err.log\n', stderr: '' });
      return {} as unknown as ChildProcess;
    });
    exec.mockImplementationOnce((cmd, cb) => {
      cb?.(null, { stdout: '12:Something happened\n', stderr: '' });
      return {} as unknown as ChildProcess;
    });
    exec.mockImplementationOnce((cmd, cb) => {
      cb?.(null, { stdout: '', stderr: '' });
      return {} as unknown as ChildProcess;
    });

    await command.execute(['fail', 'api']);

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Searching for'));
    expect(exec).toHaveBeenCalled();
  });

  it('reports unknown processes', async () => {
    mockPM2Client.list.mockResolvedValueOnce([
      global.testUtils.mockProcessInfo({ name: 'api' })
    ]);

    await command.execute(['error', 'worker']);

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Process "worker" not found'));
  });
});
