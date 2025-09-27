import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LoadCommand } from '@/commands/LoadCommand.js';
import * as fs from 'node:fs/promises';
import inquirer from 'inquirer';
import { exec } from 'child_process';

vi.mock('inquirer', () => import('../../__mocks__/inquirer.ts'));
vi.mock('child_process', () => import('../../__mocks__/child_process.ts'));
vi.mock('fs/promises', () => import('../../__mocks__/fs/promises.ts'));

describe('LoadCommand', () => {
  let mockPM2Client: any;
  let mockRenderer: any;
  let command: LoadCommand;

  beforeEach(() => {
    mockPM2Client = {
      list: vi.fn().mockResolvedValue([
        global.testUtils.mockProcessInfo({ name: 'api' }),
        global.testUtils.mockProcessInfo({ name: 'worker', pm2_env: { status: 'stopped' } })
      ])
    };
    mockRenderer = {
      colorizeStatus: vi.fn().mockImplementation((status: string) => status),
      formatMemory: vi.fn().mockImplementation((bytes: number) => `${bytes}B`),
      formatUptime: vi.fn().mockImplementation((uptime: number) => `${uptime}s`)
    };
    command = new LoadCommand(mockPM2Client, mockRenderer);

    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
      timestamp: '2024-01-01T00:00:00Z',
      processes: [
        { name: 'api', exec_mode: 'cluster' },
        { name: 'worker', exec_mode: 'fork' }
      ]
    }));
    vi.mocked(inquirer.prompt).mockResolvedValue({ confirm: true });
  });

  it('loads configuration and lists resulting processes', async () => {
    await command.execute(['ecosystem.config.js']);

    expect(fs.access).toHaveBeenCalled();
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('pm2 start'), expect.any(Function));
    expect(mockPM2Client.list).toHaveBeenCalled();

    const logMock = vi.mocked(console.log);
    expect(logMock).toHaveBeenCalledWith(expect.stringContaining('Configuration loaded successfully'));
    expect(logMock).toHaveBeenCalledWith(expect.stringContaining('api'));
    expect(logMock).toHaveBeenCalledWith(expect.stringContaining('worker'));
  });

  it('cancels when user declines confirmation', async () => {
    vi.mocked(inquirer.prompt).mockResolvedValueOnce({ confirm: false });

    await command.execute(['ecosystem.config.js']);

    expect(exec).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Load cancelled'));
  });

  it('reports missing configuration file', async () => {
    const enoent = Object.assign(new Error('missing'), { code: 'ENOENT' });
    vi.mocked(fs.access).mockRejectedValueOnce(enoent);

    await command.execute(['missing.config.js']);

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Configuration file not found'));
  });
});
