import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommandExecutor } from '@/services/CommandExecutor.js';
import type { Shell } from '@/shell/Shell.js';
import type { Action } from '@/services/AIInputRouter.js';

describe('CommandExecutor', () => {
  let executor: CommandExecutor;
  let shell: Shell;

  const createAction = (overrides: Partial<Action>): Action => ({
    type: 'restart',
    safety: 'safe',
    description: 'Restart process',
    ...overrides
  } as Action);

  beforeEach(() => {
    shell = global.testUtils.mockShell() as Shell;
    executor = new CommandExecutor(shell);
    vi.mocked(shell.client.list).mockResolvedValue([global.testUtils.mockProcessInfo({ name: 'api', pm2_env: { status: 'online' } })]);
  });

  it('requests confirmation for dangerous operations on all processes', async () => {
    const action = createAction({ type: 'stop', target: 'all', safety: 'dangerous', description: 'Stop everything' });

    const result = await executor.executeAction(action);

    expect(result.success).toBe(false);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.confirmationPrompt).toContain('Are you sure you want to stop ALL processes');
  });

  it('restarts a specific process successfully', async () => {
    const action = createAction({ target: 'api' });

    const result = await executor.executeAction(action, { userConfirmed: true });

    expect(shell.client.restart).toHaveBeenCalledWith('api');
    expect(result.success).toBe(true);
    expect(result.message).toContain('Restarted "api" successfully');
  });

  it('restarts all processes and reports the count', async () => {
    const processes = [
      global.testUtils.mockProcessInfo({ name: 'api' }),
      global.testUtils.mockProcessInfo({ name: 'worker' })
    ];
    vi.mocked(shell.client.list).mockResolvedValueOnce(processes);

    const action = createAction({ target: 'all', description: 'Restart all', safety: 'caution' });
    const result = await executor.executeAction(action, { userConfirmed: true, skipConfirmation: true });

    expect(shell.client.restart).toHaveBeenCalledWith('all');
    expect(result.success).toBe(true);
    expect(result.data?.processCount).toBe(2);
  });

  it('returns an error when restart target is missing', async () => {
    const action = createAction({ target: undefined });

    const result = await executor.executeAction(action, { userConfirmed: true });

    expect(result.success).toBe(false);
    expect(result.message).toContain('No target specified');
  });

  it('captures failures from restart operations', async () => {
    const action = createAction({ target: 'api' });
    vi.mocked(shell.client.restart).mockRejectedValueOnce(new Error('boom'));

    const result = await executor.executeAction(action, { userConfirmed: true });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Failed to restart');
  });

  it('stops execution sequence when a dangerous action fails', async () => {
    const stopAction = createAction({ type: 'stop', safety: 'dangerous', target: 'api', description: 'Stop process' });
    vi.mocked(shell.client.stop).mockRejectedValueOnce(new Error('boom'));

    const actions: Action[] = [stopAction, createAction({ target: 'api' })];
    const results = await executor.executeMultipleActions(actions, { userConfirmed: true });

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(shell.client.restart).not.toHaveBeenCalled();
  });

  it('formats status for a single process', async () => {
    const action = createAction({ type: 'status', target: 'api', description: 'Show status' });
    vi.mocked(shell.display.colorizeStatus).mockImplementation(status => status.toUpperCase());

    const result = await executor.executeAction(action, { userConfirmed: true, skipConfirmation: true });

    expect(result.success).toBe(true);
    expect(result.message).toContain('api');
    expect(result.message).toContain('Memory');
  });

  it('returns helpful message when requesting logs without target', async () => {
    const action = createAction({ type: 'logs', target: undefined, description: 'Show logs' });

    const result = await executor.executeAction(action, { userConfirmed: true });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Please specify a process name');
  });

  it('returns metrics summary when no specific target provided', async () => {
    const processes = [
      global.testUtils.mockProcessInfo({ name: 'api', monit: { memory: 200 * 1024 * 1024, cpu: 15 } }),
      global.testUtils.mockProcessInfo({ name: 'worker', monit: { memory: 150 * 1024 * 1024, cpu: 25 } })
    ];
    vi.mocked(shell.client.list).mockResolvedValueOnce(processes);

    const action = createAction({ type: 'metrics', description: 'Show metrics' });
    const result = await executor.executeAction(action, { userConfirmed: true });

    expect(result.success).toBe(true);
    expect(result.message).toContain('System Metrics');
    expect(result.message).toContain('Total Memory');
  });

  it('summarizes status for individual processes', async () => {
    vi.mocked(shell.client.list).mockResolvedValueOnce([
      global.testUtils.mockProcessInfo({ name: 'api' })
    ]);

    const action = createAction({ type: 'status', description: 'Show status', target: 'missing' });
    const result = await executor.executeAction(action, {});
    expect(result.success).toBe(false);

    const actionAll = createAction({ type: 'status', description: 'Show status', target: undefined });
    const resultAll = await executor.executeAction(actionAll, {});
    expect(resultAll.success).toBe(true);
    expect(resultAll.message).toContain('Process Summary');
  });

  it('stops all processes when requested', async () => {
    vi.mocked(shell.client.list).mockResolvedValueOnce([
      global.testUtils.mockProcessInfo({ pm2_env: { status: 'online' } }),
      global.testUtils.mockProcessInfo({ pm2_env: { status: 'online' } })
    ]);

    const action = createAction({ type: 'stop', target: 'all', safety: 'caution', description: 'Stop all' });
    const result = await executor.executeAction(action, { userConfirmed: true });

    expect(shell.client.stop).toHaveBeenCalledWith('all');
    expect(result.success).toBe(true);
  });

  it('streams logs for a specific process', async () => {
    const action = createAction({ type: 'logs', target: 'api', description: 'Logs', safety: 'safe' });

    const result = await executor.executeAction(action, {});

    expect(result.success).toBe(true);
    expect(result.message).toContain('Starting log stream');
  });

  it('reports missing metrics target', async () => {
    vi.mocked(shell.client.list).mockResolvedValueOnce([]);

    const action = createAction({ type: 'metrics', target: 'missing', description: 'Metrics', safety: 'safe' });
    const result = await executor.executeAction(action, {});

    expect(result.success).toBe(false);
    expect(result.message).toContain('not found');
  });

  it('starts all processes when requested', async () => {
    vi.mocked(shell.client.list).mockResolvedValueOnce([
      global.testUtils.mockProcessInfo({ pm2_env: { status: 'stopped' } }),
      global.testUtils.mockProcessInfo({ pm2_env: { status: 'stopped' } })
    ]);

    const action = createAction({ type: 'start', target: 'all', safety: 'caution', description: 'Start all' });
    const result = await executor.executeAction(action, { userConfirmed: true });

    expect(shell.client.start).toHaveBeenCalledWith('all');
    expect(result.success).toBe(true);
  });

  it('fails when start target missing', async () => {
    const action = createAction({ type: 'start', target: undefined, safety: 'safe', description: 'Start missing' });
    const result = await executor.executeAction(action, {});
    expect(result.success).toBe(false);
    expect(result.message).toContain('No target specified');
  });

  it('reports when there are no online processes to stop', async () => {
    vi.mocked(shell.client.list).mockResolvedValueOnce([
      global.testUtils.mockProcessInfo({ pm2_env: { status: 'stopped' } })
    ]);

    const action = createAction({ type: 'stop', target: 'all', safety: 'caution', description: 'Stop all' });
    const result = await executor.executeAction(action, { userConfirmed: true });

    expect(result.success).toBe(true);
    expect(result.message).toContain('No online processes to stop');
  });

  it('reports when there are no stopped processes to start', async () => {
    vi.mocked(shell.client.list).mockResolvedValueOnce([
      global.testUtils.mockProcessInfo({ pm2_env: { status: 'online' } })
    ]);

    const action = createAction({ type: 'start', target: 'all', safety: 'caution', description: 'Start all' });
    const result = await executor.executeAction(action, { userConfirmed: true });

    expect(result.success).toBe(true);
    expect(result.message).toContain('No stopped processes to start');
  });
});
