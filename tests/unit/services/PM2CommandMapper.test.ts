import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PM2CommandMapper } from '@/services/PM2CommandMapper.js';
import type { Shell } from '@/shell/Shell.js';
import type { CommandAnalysis } from '@/services/CommandAnalyzer.js';

const buildAnalysis = (overrides: Partial<CommandAnalysis> = {}): CommandAnalysis => ({
  intent: 'restart_process',
  targetCommand: 'pm2 restart',
  parameters: {
    target: 'api',
    required: ['process name'],
    optional: [],
    provided: { target: 'api' }
  },
  confidence: 0.9,
  safety: 'caution',
  missingParams: [],
  language: 'English',
  originalInput: 'restart api',
  needsConfirmation: false,
  canAutoExecute: true,
  ...overrides
});

describe('PM2CommandMapper', () => {
  let mapper: PM2CommandMapper;
  let shell: Shell;

  beforeEach(() => {
    shell = global.testUtils.mockShell() as Shell;
    shell.client.logs = vi.fn().mockResolvedValue(['log entry']);
    shell.client.describe = vi.fn().mockResolvedValue([{ name: 'api' }]);

    mapper = new PM2CommandMapper(shell.client);
    vi.mocked(shell.client.list).mockResolvedValue([global.testUtils.mockProcessInfo({ name: 'api' })]);
  });

  it('maps analysis to PM2 command with targets', async () => {
    const analysis = buildAnalysis();

    const command = await mapper.mapToCommand(analysis);

    expect(command).not.toBeNull();
    expect(command?.args).toEqual(expect.arrayContaining(['restart', 'api']));
    expect(command?.availableTargets).toContain('api');
  });

  it('executes mapped command via PM2 client', async () => {
    const command = await mapper.mapToCommand(buildAnalysis());
    const result = await mapper.executeCommand(command!);

    expect(shell.client.restart).toHaveBeenCalledWith('api');
    expect(result.success).toBe(true);
    expect(result.message).toContain('completed successfully');
  });

  it('handles execution errors gracefully', async () => {
    vi.mocked(shell.client.restart).mockRejectedValueOnce(new Error('boom'));
    const command = await mapper.mapToCommand(buildAnalysis());

    const result = await mapper.executeCommand(command!);

    expect(result.success).toBe(false);
    expect(result.message).toContain('failed');
  });

  it('validates targets with fuzzy matching and special keywords', async () => {
    const command = await mapper.mapToCommand(buildAnalysis({ parameters: { target: 'api', required: [], optional: [], provided: { target: 'api' } } }));
    command!.availableTargets = ['my-api-service'];

    expect(mapper.validateTarget(command!, 'all')).toBe(true);
    expect(mapper.validateTarget(command!, 'my api service')).toBe(true);
    expect(mapper.validateTarget(command!, 'unknown')).toBe(true);

    command!.availableTargets = undefined;
    expect(mapper.validateTarget(command!, 'another')).toBe(true);
  });

  it('adjusts safety level for operations targeting all processes', async () => {
    const command = await mapper.mapToCommand(buildAnalysis());
    expect(mapper.getSafetyLevel(command!, 'api')).toBe('caution');
    expect(mapper.getSafetyLevel(command!, 'all')).toBe('dangerous');
  });
});
