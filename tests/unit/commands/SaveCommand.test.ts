import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SaveCommand } from '@/commands/SaveCommand.js';
import { writeFile } from 'node:fs/promises';
import { exec } from 'child_process';

vi.mock('child_process', () => import('../../__mocks__/child_process.ts'));

vi.mock('fs/promises', () => import('../../__mocks__/fs/promises.ts'));

describe('SaveCommand', () => {
  let mockPM2Client: any;
  let mockRenderer: any;
  let command: SaveCommand;

  beforeEach(() => {
    mockPM2Client = {
      list: vi.fn().mockResolvedValue([])
    };
    mockRenderer = {
      colorizeStatus: vi.fn().mockImplementation((status: string) => status),
      formatMemory: vi.fn().mockImplementation((bytes: number) => `${bytes}B`),
      formatUptime: vi.fn().mockImplementation((uptime: number) => `${uptime}s`)
    };
    command = new SaveCommand(mockPM2Client, mockRenderer);
    vi.mocked(console.log).mockClear();
    vi.mocked(console.error).mockClear();
    vi.mocked(exec).mockClear();
    vi.mocked(writeFile).mockClear();
  });

  it('saves ecosystem and detailed configuration successfully', async () => {
    const processes = [
      global.testUtils.mockProcessInfo({ name: 'api' }),
      global.testUtils.mockProcessInfo({ name: 'worker', pm2_env: { status: 'stopped' } })
    ];
    mockPM2Client.list.mockResolvedValueOnce(processes);

    await command.execute([]);

    expect(exec).toHaveBeenCalledWith('pm2 ecosystem', expect.any(Function));
    expect(writeFile).toHaveBeenCalled();

    const [, payload] = vi.mocked(writeFile).mock.calls[0];
    const parsed = JSON.parse(payload as string);
    expect(parsed.processes).toHaveLength(2);
    expect(parsed.processes[0]).toMatchObject({ name: 'api' });

    const logMock = vi.mocked(console.log);
    expect(logMock).toHaveBeenCalledWith(expect.stringContaining('💾 Saving PM2 ecosystem configuration'));
    expect(logMock).toHaveBeenCalledWith(expect.stringContaining('✓ Ecosystem saved to'));
    expect(logMock).toHaveBeenCalledWith(expect.stringContaining('📋 Saved processes'));
  });

  it('logs an error when saving fails', async () => {
    mockPM2Client.list.mockRejectedValueOnce(new Error('pm2 list failed'));

    await command.execute([]);

    const errorMock = vi.mocked(console.error);
    expect(errorMock).toHaveBeenCalledWith(expect.stringContaining('Failed to save configuration: pm2 list failed'));
  });
});
