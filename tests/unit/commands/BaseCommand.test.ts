import { describe, it, expect } from 'vitest';
import { BaseCommand } from '@/commands/BaseCommand.js';
import type { Shell } from '@/shell/Shell.js';

class TestCommand extends BaseCommand {
  public readonly name = 'test';
  public readonly description = 'Demo command';
  public readonly aliases = ['t', 'demo'];

  execute(_args?: string[]): void {}
}

describe('BaseCommand', () => {
  it('formats help text with aliases', () => {
    const command = new TestCommand(global.testUtils.mockShell() as Shell);

    const help = command.getHelp();

    expect(help).toContain('/test');
    expect(help).toContain('/t');
    expect(help).toContain('/demo');
    expect(help).toContain('Demo command');
  });
});
