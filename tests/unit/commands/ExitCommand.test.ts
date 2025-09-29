import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExitCommand } from '@/commands/ExitCommand.js';
import type { IShell } from '@/interfaces/IShell.js';

describe('ExitCommand', () => {
  let mockShell: IShell;
  let command: ExitCommand;
  let shellExitSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockShell = {
      exit: vi.fn()
    } as unknown as IShell;
    
    shellExitSpy = vi.spyOn(mockShell, 'exit');
    command = new ExitCommand(mockShell);
  });

  it('has correct name and aliases', () => {
    expect(command.name).toBe('exit');
    expect(command.aliases).toEqual(['quit', 'q']);
    expect(command.description).toBe('Exit the PM2 CLI');
  });

  it('calls shell.exit when executed', () => {
    command.execute([]);
    expect(shellExitSpy).toHaveBeenCalled();
  });

  it('ignores any arguments passed', () => {
    command.execute(['arg1', 'arg2']);
    expect(shellExitSpy).toHaveBeenCalled();
  });
});