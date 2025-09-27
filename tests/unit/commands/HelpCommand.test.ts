import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HelpCommand } from '@/commands/HelpCommand.js';
import type { Shell } from '@/shell/Shell.js';

describe('HelpCommand', () => {
  let mockShell: Shell;
  let mockRegistry: any;
  let command: HelpCommand;

  beforeEach(() => {
    mockShell = global.testUtils.mockShell() as Shell;
    
    mockRegistry = {
      getAllCommands: vi.fn().mockReturnValue([
        { name: 'help', description: 'Show available commands', aliases: ['h'] },
        { name: 'status', description: 'Display process status', aliases: [] }
      ])
    };

    command = new HelpCommand(mockShell, mockRegistry);
  });

  it('should list commands with descriptions', () => {
    command.execute([]);

    expect(mockRegistry.getAllCommands).toHaveBeenCalled();
    const logMock = vi.mocked(console.log);
    expect(logMock).toHaveBeenCalledWith(expect.stringContaining('📚 Available Commands'));
    expect(logMock).toHaveBeenCalledWith(expect.stringContaining('/help'));
    expect(logMock).toHaveBeenCalledWith(expect.stringContaining('/status'));
    expect(logMock).toHaveBeenCalledWith(expect.stringContaining('Press Ctrl+C or use /exit to quit'));
  });

  it('should include aliases when available', () => {
    command.execute([]);

    const logMock = vi.mocked(console.log);
    expect(logMock).toHaveBeenCalledWith(expect.stringContaining('(/h)'));
  });
});
