import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommandAnalyzer } from '@/services/CommandAnalyzer.js';
import type { AIProvider } from '@/services/ai-providers/types.js';
import { Loader } from '@/utils/Loader.js';

vi.spyOn(Loader, 'withAnalysis').mockImplementation(async (fn, _message) => await fn());

describe('CommandAnalyzer', () => {
  let provider: AIProvider & { query: ReturnType<typeof vi.fn> };
  let analyzer: CommandAnalyzer;

  beforeEach(() => {
    provider = {
      isConfigured: vi.fn().mockReturnValue(true),
      query: vi.fn()
    } as unknown as AIProvider & { query: ReturnType<typeof vi.fn> };

    analyzer = new CommandAnalyzer(provider);
  });

  it('falls back to basic analysis when provider is not configured', async () => {
    provider.isConfigured = vi.fn().mockReturnValue(false);

    const result = await analyzer.analyzeCommand('restart api');

    expect(result.intent).toBe('unknown');
    expect(result.canAutoExecute).toBe(false);
    expect(result.needsConfirmation).toBe(true);
  });

  it('builds prompts with available processes and parses AI output', async () => {
    analyzer.setAvailableProcesses(['api', 'worker']);

    provider.query.mockResolvedValueOnce(JSON.stringify({
      intent: 'restart_process',
      targetCommand: 'pm2 restart',
      parameters: { target: 'api', provided: { target: 'api' }, required: [], optional: [] },
      confidence: 0.92,
      safety: 'caution',
      missingParams: [],
      language: 'English',
      needsConfirmation: false,
      canAutoExecute: true
    }));

    const context = {
      previousCommands: ['/status'],
      recentProcesses: ['api'],
      lastMentionedProcess: 'api',
      lastResponse: 'All good'
    };

    const result = await analyzer.analyzeCommand('restart my api process', context);

    expect(provider.query).toHaveBeenCalledTimes(1);
    const prompt = provider.query.mock.calls[0][0];
    expect(prompt).toContain('AVAILABLE PROCESSES: api, worker');
    expect(prompt).toContain('INPUT: "restart my api process"');

    expect(result.intent).toBe('restart_process');
    expect(result.parameters.target).toBe('api');
    expect(result.canAutoExecute).toBe(true);
  });

  it('enhances missing parameters using conversation context', async () => {
    provider.query.mockResolvedValueOnce(JSON.stringify({
      intent: 'stop_process',
      targetCommand: 'pm2 stop',
      parameters: { target: null, provided: {}, required: ['process_name'], optional: [] },
      confidence: 0.95,
      safety: 'caution',
      missingParams: ['process_name'],
      language: 'English',
      needsConfirmation: false,
      canAutoExecute: false
    }));

    const context = {
      lastMentionedProcess: 'worker',
      previousCommands: ['/restart worker'],
      recentProcesses: ['worker'],
      lastResponse: 'done'
    };

    const result = await analyzer.analyzeCommand('stop it', context);

    expect(result.parameters.target).toBe('worker');
    expect(result.missingParams).not.toContain('process_name');
    expect(result.canAutoExecute).toBe(true);
    expect(result.needsConfirmation).toBe(false);
  });

  it('returns fallback analysis when AI response is malformed', async () => {
    provider.query.mockResolvedValueOnce('not-json');

    const result = await analyzer.analyzeCommand('restart api');

    expect(result.intent).toBe('unknown');
    expect(result.confidence).toBe(0.1);
  });
});
