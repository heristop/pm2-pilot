import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ClearCommand } from '@/commands/ClearCommand.js';
import { ExitCommand } from '@/commands/ExitCommand.js';
import type { IShell } from '@/interfaces/IShell.js';

describe('Utility Commands', () => {
  let clearSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearSpy = vi.spyOn(console, 'clear').mockImplementation(() => {});
  });

  afterEach(() => {
    clearSpy.mockRestore();
  });

  it('ClearCommand should clear the console output', () => {
    const command = new ClearCommand();

    command.execute();

    expect(clearSpy).toHaveBeenCalled();
  });

  it('ExitCommand should call shell.exit', () => {
    const mockShell = {
      exit: vi.fn()
    } as unknown as IShell;
    
    const shellExitSpy = vi.spyOn(mockShell, 'exit');
    const command = new ExitCommand(mockShell);

    command.execute([] as string[]);

    expect(shellExitSpy).toHaveBeenCalled();
  });
});
