import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { MockedFunction } from 'vitest';
import { AllCommand } from '@/commands/AllCommand.js';
import inquirer from 'inquirer';

vi.mock('inquirer', () => import('../../__mocks__/inquirer.ts'));

describe('AllCommand', () => {
  let command: AllCommand;
  let mockPM2Client: any;
  let mockRenderer: any;
  let promptMock: MockedFunction<typeof inquirer.prompt>;

  beforeEach(() => {
    // Create mock PM2 client
    mockPM2Client = {
      list: vi.fn().mockResolvedValue([]),
      restart: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      start: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined)
    };
    
    // Create mock renderer
    mockRenderer = {
      colorizeStatus: vi.fn().mockImplementation((status: string) => status),
      formatMemory: vi.fn().mockImplementation((bytes: number) => `${bytes}B`),
      formatUptime: vi.fn().mockImplementation((uptime: number) => `${uptime}s`),
      renderTable: vi.fn()
    };
    
    command = new AllCommand(mockPM2Client, mockRenderer);
    promptMock = vi.mocked(inquirer.prompt);
    promptMock.mockClear();
  });

  it('should show usage when no operation is provided', async () => {
    await command.execute([]);

    const logMock = vi.mocked(console.log);
    expect(logMock).toHaveBeenCalledWith(expect.stringContaining('Usage: /all <operation>'));
  });

  it('should warn when operation is invalid', async () => {
    await command.execute(['invalid']);

    const logMock = vi.mocked(console.log);
    expect(logMock).toHaveBeenCalledWith(expect.stringContaining('Invalid operation'));
  });

  it('should stop when there are no processes', async () => {
    mockPM2Client.list.mockResolvedValueOnce([]);

    await command.execute(['restart']);

    const logMock = vi.mocked(console.log);
    expect(mockPM2Client.list).toHaveBeenCalled();
    expect(logMock).toHaveBeenCalledWith(expect.stringContaining('No PM2 processes found'));
    expect(promptMock).not.toHaveBeenCalled();
  });

  it('should cancel when user rejects the confirmation prompt', async () => {
    const processList = [
      global.testUtils.mockProcessInfo({ name: 'api-server' }),
      global.testUtils.mockProcessInfo({ name: 'worker' })
    ];
    mockPM2Client.list.mockResolvedValueOnce(processList);
    promptMock.mockResolvedValueOnce({ confirm: false });

    await command.execute(['restart']);

    const logMock = vi.mocked(console.log);
    expect(promptMock).toHaveBeenCalled();
    expect(logMock).toHaveBeenCalledWith(expect.stringContaining('Operation cancelled'));
    expect(mockPM2Client.restart).not.toHaveBeenCalled();
  });

  it('should run the selected operation for each process and handle failures', async () => {
    const processList = [
      global.testUtils.mockProcessInfo({ name: 'app-success' }),
      global.testUtils.mockProcessInfo({ name: 'app-fail' })
    ];
    mockPM2Client.list.mockResolvedValueOnce(processList);
    promptMock.mockResolvedValueOnce({ confirm: true });

    mockPM2Client.restart.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('boom'));

    await command.execute(['restart']);

    expect(mockPM2Client.restart).toHaveBeenNthCalledWith(1, 'app-success');
    expect(mockPM2Client.restart).toHaveBeenNthCalledWith(2, 'app-fail');

    const logMock = vi.mocked(console.log);
    expect(logMock).toHaveBeenCalledWith(expect.stringContaining('app-success restarted successfully'));
    expect(logMock).toHaveBeenCalledWith(expect.stringContaining('Failed to restart app-fail'));
    expect(logMock).toHaveBeenCalledWith(expect.stringContaining('✅ Batch restart completed'));
  });

  it.each([
    ['stop', 'stop'],
    ['start', 'start'],
    ['delete', 'delete']
  ] as const)('should call client.%s when operation is %s', async (operation, method) => {
    mockPM2Client.list.mockResolvedValueOnce([
      global.testUtils.mockProcessInfo({ name: 'target-app' })
    ]);
    promptMock.mockResolvedValueOnce({ confirm: true });

    const clientMethod = Reflect.get(mockPM2Client, method) as MockedFunction<(name: string) => Promise<void>>;
    clientMethod.mockResolvedValueOnce(undefined);

    await command.execute([operation]);

    expect(clientMethod).toHaveBeenCalledWith('target-app');
  });

  it('should report errors from the batch execution flow', async () => {
    mockPM2Client.list.mockRejectedValueOnce(new Error('list failed'));

    await command.execute(['restart']);

    const errorMock = vi.mocked(console.error);
    expect(errorMock).toHaveBeenCalledWith(expect.stringContaining('Failed to perform batch operation'));
  });

  it('should map operations to emoji icons', () => {
    const getEmoji = (command as unknown as { getOperationEmoji: (op: string) => string }).getOperationEmoji;

    expect(getEmoji('restart')).toBe('♻️');
    expect(getEmoji('stop')).toBe('⏹️');
    expect(getEmoji('start')).toBe('▶️');
    expect(getEmoji('delete')).toBe('🗑️');
    expect(getEmoji('unknown')).toBe('🔄');
  });
});
