import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClearCommand } from '@/commands/ClearCommand.js';
import type { Shell } from '@/shell/Shell.js';

describe('ClearCommand', () => {
  let shell: Shell;
  let command: ClearCommand;
  let clearSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    shell = global.testUtils.mockShell() as Shell;
    command = new ClearCommand(shell);
    clearSpy = vi.spyOn(console, 'clear').mockImplementation(() => {});
  });

  it('has correct name and aliases', () => {
    expect(command.name).toBe('clear');
    expect(command.aliases).toEqual(['cls']);
    expect(command.description).toBe('Clear the terminal screen');
  });

  it('calls console.clear when executed', () => {
    command.execute([]);
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });

  it('ignores any arguments passed', () => {
    command.execute(['arg1', 'arg2']);
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });
});