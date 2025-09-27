import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConversationManager, type PendingAction } from '@/services/ConversationManager.js';
import type { CommandAnalysis } from '@/services/CommandAnalyzer.js';
import type { AIProvider } from '@/services/ai-providers/types.js';

const buildAnalysis = (overrides: Partial<CommandAnalysis> = {}): CommandAnalysis => ({
  intent: 'restart_process',
  targetCommand: 'pm2 restart',
  parameters: {
    target: 'api',
    required: [],
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

describe('ConversationManager', () => {
  let manager: ConversationManager;
  let mockAIProvider: AIProvider;

  beforeEach(() => {
    mockAIProvider = {
      query: vi.fn().mockResolvedValue('["api-server"]'),
      queryWithHistory: vi.fn(),
      isConfigured: vi.fn().mockReturnValue(true),
      getConfigInfo: vi.fn().mockReturnValue('mock provider'),
      saveConfig: vi.fn()
    };
    manager = new ConversationManager(mockAIProvider);
  });

  it('captures turns and builds conversation context', async () => {
    await manager.addTurn('restart api', buildAnalysis(), { success: true, message: 'done' });
    await manager.addTurn('status api', buildAnalysis({ intent: 'show_status', parameters: { target: 'api', required: [], optional: [], provided: { target: 'api' } } }), { success: true, message: 'ok' });

    const context = await manager.getContext();

    expect(context.lastMentionedProcess).toBe('api');
    expect(context.previousCommands).toHaveLength(2);
    expect(context.recentProcesses).toContain('api');
    expect(context.lastResponse).toBe('ok');
  });

  it('manages pending actions and supports numbered selections', () => {
    const actions: PendingAction[] = [
      { id: '1', label: 'restart api', command: 'pm2 restart api', analysis: buildAnalysis(), safety: 'caution' },
      { id: '2', label: 'stop api', command: 'pm2 stop api', analysis: buildAnalysis({ intent: 'stop_process' }), safety: 'dangerous' }
    ];

    manager.setPendingActions(actions);

    expect(manager.isNumberedSelection('2')).toBe(true);
    expect(manager.getActionByNumber(2)).toEqual(actions[1]);

    manager.clearPendingActions();
    expect(manager.getPendingActions()).toHaveLength(0);
  });

  it('extracts process names from commands and resolves pronouns', async () => {
    const analysis = buildAnalysis({
      parameters: { target: 'my-app', required: [], optional: [], provided: { target: 'my-app' } },
      originalInput: 'restart my-app'
    });

    await manager.addTurn('restart my-app', analysis, { success: true, message: 'ok' });

    const context = await manager.getContext();
    expect(context.lastMentionedProcess).toBe('my-app');

    const pronounTarget = manager.resolvePronoun('it', context);
    expect(pronounTarget).toBe('my-app');
  });

  it('reports conversation statistics', async () => {
    await manager.addTurn('restart api', buildAnalysis(), { success: true, message: 'done' });
    await manager.addTurn('restart api', buildAnalysis({ originalInput: 'restart api again' }), { success: false, message: 'failed' });

    const stats = manager.getStatistics();
    expect(stats.totalCommands).toBe(2);
    expect(stats.successRate).toBeCloseTo(0.5, 1);
    expect(stats.recentActivity).toBeGreaterThanOrEqual(1);
  });

  describe('getMessagesForAI', () => {
    it('returns empty array when no conversation history exists', () => {
      const messages = manager.getMessagesForAI();
      expect(messages).toEqual([]);
    });

    it('converts info_request turns to conversation messages', async () => {
      // Add an info request turn
      const infoAnalysis = buildAnalysis({
        intent: 'info_request',
        originalInput: 'what are my processes?'
      });
      
      await manager.addTurn('what are my processes?', infoAnalysis, {
        success: true,
        message: 'You have 2 processes: api (online), worker (stopped)',
        command: 'info_request'
      });

      const messages = manager.getMessagesForAI();
      
      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual({
        role: 'user',
        content: 'what are my processes?',
        timestamp: expect.any(Date)
      });
      expect(messages[1]).toEqual({
        role: 'assistant',
        content: 'You have 2 processes: api (online), worker (stopped)',
        timestamp: expect.any(Date)
      });
    });

    it('ignores non-info_request turns in conversation history', async () => {
      // Add a command turn (should be ignored)
      await manager.addTurn('restart api', buildAnalysis(), { success: true, message: 'done' });
      
      // Add an info request turn (should be included)
      const infoAnalysis = buildAnalysis({
        intent: 'info_request',
        originalInput: 'how is api doing?'
      });
      await manager.addTurn('how is api doing?', infoAnalysis, {
        success: true,
        message: 'API is healthy',
        command: 'info_request'
      });

      const messages = manager.getMessagesForAI();
      
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('how is api doing?');
      expect(messages[1].content).toBe('API is healthy');
    });

    it('handles turns without responses gracefully', async () => {
      const infoAnalysis = buildAnalysis({
        intent: 'info_request',
        originalInput: 'show status'
      });
      
      // Add turn without result
      await manager.addTurn('show status', infoAnalysis);

      const messages = manager.getMessagesForAI();
      
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({
        role: 'user',
        content: 'show status',
        timestamp: expect.any(Date)
      });
    });

    it('limits history to last 5 turns', async () => {
      // Add 7 info request turns
      for (let i = 1; i <= 7; i++) {
        const infoAnalysis = buildAnalysis({
          intent: 'info_request',
          originalInput: `question ${i}`
        });
        
        await manager.addTurn(`question ${i}`, infoAnalysis, {
          success: true,
          message: `answer ${i}`,
          command: 'info_request'
        });
      }

      const messages = manager.getMessagesForAI();
      
      // Should only have last 5 turns (5 questions + 5 answers = 10 messages)
      expect(messages).toHaveLength(10);
      
      // Check first message is from turn 3 (since we keep last 5 turns out of 7)
      expect(messages[0].content).toBe('question 3');
      expect(messages[1].content).toBe('answer 3');
      
      // Check last message is from turn 7
      expect(messages[8].content).toBe('question 7');
      expect(messages[9].content).toBe('answer 7');
    });

    it('maintains chronological order in conversation messages', async () => {
      // Add multiple info requests
      const questions = ['what processes?', 'is api healthy?', 'what about worker?'];
      const answers = ['3 processes', 'api is good', 'worker needs restart'];
      
      for (let i = 0; i < questions.length; i++) {
        const question = questions[i];
        const infoAnalysis = buildAnalysis({
          intent: 'info_request',
          originalInput: question
        });
        
        await manager.addTurn(question, infoAnalysis, {
          success: true,
          message: answers[i],
          command: 'info_request'
        });
      }

      const messages = manager.getMessagesForAI();
      
      expect(messages).toHaveLength(6);
      // Should be: user1, assistant1, user2, assistant2, user3, assistant3
      expect(messages[0]).toEqual(expect.objectContaining({ role: 'user', content: 'what processes?' }));
      expect(messages[1]).toEqual(expect.objectContaining({ role: 'assistant', content: '3 processes' }));
      expect(messages[2]).toEqual(expect.objectContaining({ role: 'user', content: 'is api healthy?' }));
      expect(messages[3]).toEqual(expect.objectContaining({ role: 'assistant', content: 'api is good' }));
      expect(messages[4]).toEqual(expect.objectContaining({ role: 'user', content: 'what about worker?' }));
      expect(messages[5]).toEqual(expect.objectContaining({ role: 'assistant', content: 'worker needs restart' }));
    });
  });
});
