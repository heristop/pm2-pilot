import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ExecutionManager } from '@/services/ExecutionManager.js';
import type { CommandAnalysis } from '@/services/CommandAnalyzer.js';
import type { PM2Command } from '@/services/PM2CommandMapper.js';
import type { Shell } from '@/shell/Shell.js';

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

describe('ExecutionManager', () => {
  let shell: Shell;
  let manager: ExecutionManager;
  let mockCommandMapper: any;
  let mockConversationManager: any;
  let mockAIProviderFactory: any;

  beforeEach(() => {
    shell = global.testUtils.mockShell() as Shell;
    
    mockCommandMapper = {
      mapToCommand: vi.fn(),
      validateTarget: vi.fn(),
      getSafetyLevel: vi.fn(),
      executeCommand: vi.fn()
    };
    
    mockConversationManager = {
      setPendingActions: vi.fn(),
      getPendingActions: vi.fn().mockReturnValue([]),
      clearPendingActions: vi.fn(),
      addTurn: vi.fn(),
      getActionByNumber: vi.fn(),
      addPendingAction: vi.fn(),
      getMessagesForAI: vi.fn().mockReturnValue([]),
      generateContextPrompt: vi.fn().mockReturnValue('')
    };
    
    mockAIProviderFactory = {
      getInstance: vi.fn(),
      isConfigured: vi.fn().mockReturnValue(true),
      getProvider: vi.fn(),
      isAutoExecuteEnabled: vi.fn().mockReturnValue(true)
    };
    
    manager = new ExecutionManager(
      shell.client,
      mockCommandMapper,
      mockConversationManager,
      mockAIProviderFactory
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('auto-executes safe commands when auto mode is enabled', async () => {
    const analysis = buildAnalysis({ canAutoExecute: true, confidence: 0.95 });
    const pm2Command: PM2Command = {
      command: 'pm2',
      args: ['restart', 'api'],
      description: 'Restart process',
      safety: 'safe',
      requiresTarget: true
    };

    mockCommandMapper.mapToCommand.mockResolvedValue(pm2Command);
    mockCommandMapper.validateTarget.mockReturnValue(true);
    mockCommandMapper.getSafetyLevel.mockReturnValue('caution');
    mockCommandMapper.executeCommand.mockResolvedValue({
      success: true,
      message: 'done'
    });

    const response = await manager.processCommand('restart api', analysis, { autoMode: true });

    expect(response.executed).toBe(true);
    expect(response.pendingActions).toHaveLength(0);
    expect(response.message).toContain('🤖');
    expect(mockCommandMapper.executeCommand).toHaveBeenCalled();
  });

  it('returns pending action when confirmation is required', async () => {
    const analysis = buildAnalysis({ canAutoExecute: false, confidence: 0.8 });
    const pm2Command: PM2Command = {
      command: 'pm2',
      args: ['stop', 'api'],
      description: 'Stop process',
      safety: 'dangerous',
      requiresTarget: true
    };

    mockCommandMapper.mapToCommand.mockResolvedValue(pm2Command);
    mockCommandMapper.validateTarget.mockReturnValue(true);
    mockCommandMapper.getSafetyLevel.mockReturnValue('dangerous');

    const response = await manager.processCommand('stop api', analysis, { autoMode: true });

    expect(response.executed).toBe(false);
    expect(response.pendingActions).toHaveLength(1);
    expect(response.needsUserInput).toBe(true);
    expect(response.message).toContain('Suggested actions');
  });

  it('handles informational intents using fallback responses', async () => {
    const analysis = buildAnalysis({
      intent: 'info_request',
      parameters: { target: undefined, required: [], optional: [], provided: {} },
      originalInput: 'what are my processes?'
    });

    vi.mocked(shell.client.list).mockResolvedValue([
      global.testUtils.mockProcessInfo({ name: 'api', pm2_env: { status: 'online' } })
    ]);

    const mockProvider = {
      isConfigured: vi.fn().mockReturnValue(false),
      query: vi.fn(),
      queryWithHistory: vi.fn()
    };
    mockAIProviderFactory.getProvider.mockReturnValue(mockProvider);

    const response = await manager.processCommand('what are my processes?', analysis, { autoMode: true });

    expect(response.executed).toBe(true);
    expect(response.message).toContain('🤖');
    expect(response.needsUserInput).toBe(false);
  });

  it('executes pending action when user confirms with execute_pending intent', async () => {
    const analysis = buildAnalysis();
    const pm2Command: PM2Command = {
      command: 'pm2',
      args: ['restart', 'api'],
      description: 'Restart process',
      safety: 'safe',
      requiresTarget: true
    };

    mockCommandMapper.mapToCommand.mockResolvedValue(pm2Command);
    mockCommandMapper.validateTarget.mockReturnValue(true);
    mockCommandMapper.getSafetyLevel.mockReturnValue('safe');
    mockCommandMapper.executeCommand.mockResolvedValue({
      success: true,
      message: 'restart ok'
    });

    // Set up pending action
    const pendingAction = {
      id: 'action_1',
      label: 'restart api',
      command: 'pm2 restart api',
      analysis,
      safety: 'safe' as const
    };
    mockConversationManager.getPendingActions.mockReturnValue([pendingAction]);

    // First call creates pending action
    const initial = await manager.processCommand(
      'restart api',
      { ...analysis, canAutoExecute: false, confidence: 0.6 },
      { autoMode: true }
    );
    expect(initial.pendingActions).toHaveLength(1);

    // User confirms with natural language
    const confirmAnalysis = buildAnalysis({ intent: 'execute_pending' });
    const confirmation = await manager.processCommand('yes', confirmAnalysis, { autoMode: true });

    expect(mockCommandMapper.mapToCommand).toHaveBeenCalledTimes(2);
    expect(mockCommandMapper.executeCommand).toHaveBeenCalled();
    expect(confirmation.executed).toBe(true);
    expect(confirmation.pendingActions).toHaveLength(0);
  });

  it('returns error when command mapping fails', async () => {
    const analysis = buildAnalysis();
    mockCommandMapper.mapToCommand.mockResolvedValue(null as unknown as PM2Command);

    const response = await manager.processCommand('unknown', analysis, { autoMode: true });

    expect(response.executed).toBe(false);
    expect(response.message).toContain('Unknown command');
  });

  it('prompts for missing process target when required', async () => {
    const analysis = buildAnalysis({
      parameters: { target: undefined, required: [], optional: [], provided: {} }
    });
    const pm2Command: PM2Command = {
      command: 'pm2',
      args: ['restart'],
      description: 'Restart process',
      safety: 'caution',
      requiresTarget: true
    };

    mockCommandMapper.mapToCommand.mockResolvedValue(pm2Command);

    const response = await manager.processCommand('restart', analysis, { autoMode: true });

    expect(response.executed).toBe(false);
    expect(response.missingParameters).toEqual(expect.arrayContaining(['process name or target']));
    expect(response.needsUserInput).toBe(true);
  });

  it('warns when provided target is invalid', async () => {
    const analysis = buildAnalysis({ parameters: { target: 'ghost', required: [], optional: [], provided: { target: 'ghost' } } });
    const pm2Command: PM2Command = {
      command: 'pm2',
      args: ['restart', 'ghost'],
      description: 'Restart process',
      safety: 'caution',
      requiresTarget: true
    };

    mockCommandMapper.mapToCommand.mockResolvedValue(pm2Command);
    mockCommandMapper.validateTarget.mockReturnValue(false);

    const response = await manager.processCommand('restart ghost', analysis, { autoMode: true });

    expect(response.executed).toBe(false);
    expect(response.message).toContain('Invalid target');
    expect(response.needsUserInput).toBe(true);
  });

  it('defers execution when auto mode is disabled', async () => {
    const analysis = buildAnalysis({ canAutoExecute: true });
    const pm2Command: PM2Command = {
      command: 'pm2',
      args: ['restart', 'api'],
      description: 'Restart process',
      safety: 'safe',
      requiresTarget: true
    };

    mockCommandMapper.mapToCommand.mockResolvedValue(pm2Command);
    mockCommandMapper.validateTarget.mockReturnValue(true);
    mockCommandMapper.getSafetyLevel.mockReturnValue('safe');

    const response = await manager.processCommand('restart api', analysis, { autoMode: false });

    expect(response.executed).toBe(false);
    expect(response.pendingActions).toHaveLength(1);
    expect(response.needsUserInput).toBe(true);
  });

  it('handles execute_pending intent when there are no pending actions', async () => {
    const analysis = buildAnalysis({ intent: 'execute_pending' });
    mockConversationManager.getPendingActions.mockReturnValue([]);

    const response = await manager.processCommand('yes', analysis, { autoMode: true });

    expect(response.executed).toBe(false);
    expect(response.message).toContain('No pending actions');
    expect(response.needsUserInput).toBe(false);
  });

  it('executes first pending action with execute_pending intent', async () => {
    const analysis = buildAnalysis({ intent: 'execute_pending' });
    const pm2Command: PM2Command = {
      command: 'pm2',
      args: ['restart', 'api'],
      description: 'Restart process',
      safety: 'safe',
      requiresTarget: true
    };

    const pendingAction = {
      id: 'action_1',
      label: 'restart api',
      command: 'pm2 restart api',
      analysis: buildAnalysis({ intent: 'restart_process' }),
      safety: 'safe' as const
    };

    mockConversationManager.getPendingActions.mockReturnValue([pendingAction]);
    mockCommandMapper.mapToCommand.mockResolvedValue(pm2Command);
    mockCommandMapper.executeCommand.mockResolvedValue({
      success: true,
      message: 'restart completed'
    });

    const response = await manager.processCommand('do it', analysis, { autoMode: true });

    expect(response.executed).toBe(true);
    expect(response.pendingActions).toHaveLength(0);
    expect(mockConversationManager.clearPendingActions).toHaveBeenCalled();
    expect(mockCommandMapper.executeCommand).toHaveBeenCalledWith(pm2Command);
  });

  it('surfaces failures from the AI service when info requests error', async () => {
    const analysis = buildAnalysis({
      intent: 'info_request',
      parameters: { target: undefined, required: [], optional: [], provided: {} },
      originalInput: 'show my processes'
    });

    vi.mocked(shell.client.list).mockResolvedValue([
      global.testUtils.mockProcessInfo({ name: 'api', pm2_env: { status: 'online' } })
    ]);

    const failingAI = {
      isConfigured: () => true,
      query: vi.fn().mockRejectedValue(new Error('AI offline')),
      queryWithHistory: vi.fn().mockRejectedValue(new Error('AI offline'))
    };

    const mockFactory = {
      getProvider: () => failingAI
    };

    Reflect.set(manager, 'aiProviderFactory', mockFactory);

    const response = await manager.processCommand('show my processes', analysis, { autoMode: true });

    expect(failingAI.queryWithHistory).toHaveBeenCalled();
    expect(response.executed).toBe(false);
    expect(response.message).toContain('Failed to process information request');
  });

  it('handles info requests that fall through to default path using pm2Client', async () => {
    const analysis = buildAnalysis({
      intent: 'info_request',
      parameters: { target: undefined, required: [], optional: [], provided: {} },
      originalInput: 'tell me about my system'
    });

    vi.mocked(shell.client.list).mockResolvedValue([
      global.testUtils.mockProcessInfo({ name: 'api', pm2_env: { status: 'online' } })
    ]);

    const mockProvider = {
      isConfigured: vi.fn().mockReturnValue(false),
      query: vi.fn(),
      queryWithHistory: vi.fn()
    };
    mockAIProviderFactory.getProvider.mockReturnValue(mockProvider);

    const response = await manager.processCommand('tell me about my system', analysis, { autoMode: true });

    expect(response.executed).toBe(true);
    expect(response.message).toContain('🤖');
    expect(response.needsUserInput).toBe(false);
    expect(vi.mocked(shell.client.list)).toHaveBeenCalled();
  });

  it('passes conversation history to AI provider for context continuity', async () => {
    const analysis = buildAnalysis({
      intent: 'info_request',
      parameters: { target: undefined, required: [], optional: [], provided: {} },
      originalInput: 'what about the worker process?'
    });

    vi.mocked(shell.client.list).mockResolvedValue([
      global.testUtils.mockProcessInfo({ name: 'worker', pm2_env: { status: 'online' } })
    ]);

    // Mock AI provider with queryWithHistory
    const mockProvider = {
      isConfigured: vi.fn().mockReturnValue(true),
      queryWithHistory: vi.fn().mockResolvedValue('Worker process is healthy and running normally'),
      query: vi.fn()
    };
    mockAIProviderFactory.getProvider.mockReturnValue(mockProvider);

    // Setup conversation history in the mock
    mockConversationManager.getMessagesForAI.mockReturnValue([
      { role: 'user', content: 'what are my processes?', timestamp: new Date() },
      { role: 'assistant', content: 'You have api and worker processes', timestamp: new Date() }
    ]);
    mockConversationManager.generateContextPrompt.mockReturnValue('Recent conversation:\nUser: "what are my processes?" → Success');

    const response = await manager.processCommand('what about the worker process?', analysis, { autoMode: true });

    expect(response.executed).toBe(true);
    expect(response.message).toContain('Worker process is healthy and running normally');
    
    // Verify queryWithHistory was called with conversation context
    expect(mockProvider.queryWithHistory).toHaveBeenCalledWith(
      'what about the worker process?',
      [
        expect.objectContaining({ role: 'user', content: 'what are my processes?' }),
        expect.objectContaining({ role: 'assistant', content: 'You have api and worker processes' })
      ],
      expect.stringContaining('Recent conversation')
    );
    
    // Verify regular query was not called
    expect(mockProvider.query).not.toHaveBeenCalled();
  });

  describe('executeRelevantCommand method coverage', () => {
    let mockErrorAnalysisService: any;

    beforeEach(() => {
      mockErrorAnalysisService = {
        analyzeLogErrors: vi.fn().mockResolvedValue({
          hasErrors: true,
          errorCount: 2,
          diagnosis: {
            summary: 'Connection issues detected',
            severity: 'high',
            rootCause: 'Database connection timeout',
            actionableSuggestions: ['Check database connectivity', 'Restart affected services'],
            followUpCommands: ['pm2 restart api']
          },
          quickFix: 'Restart database connection pool'
        })
      };
      
      // Replace the error analysis service in the manager
      const managerWithServices = new ExecutionManager(
        shell.client,
        mockCommandMapper,
        mockConversationManager,
        mockAIProviderFactory,
        mockErrorAnalysisService
      );
      manager = managerWithServices;
    });

    it('should handle list/show process requests', async () => {
      const testCases = [
        'list all processes',
        'show my processes', 
        'what are my running processes',
        'what is the name of my server process'
      ];

      vi.mocked(shell.client.list).mockResolvedValue([
        global.testUtils.mockProcessInfo({ name: 'api-server', pm2_env: { status: 'online' } }),
        global.testUtils.mockProcessInfo({ name: 'worker', pm2_env: { status: 'stopped' } })
      ]);

      for (const input of testCases) {
        const analysis = buildAnalysis({
          intent: 'info_request',
          originalInput: input
        });

        const response = await manager.processCommand(input, analysis, { autoMode: true });
        
        expect(response.executed).toBe(true);
        expect(response.message).toContain('api-server');
        expect(response.message).toContain('worker');
        expect(vi.mocked(shell.client.list)).toHaveBeenCalled();
      }
    });

    it('should handle log/error related requests with fallback response', async () => {
      // Make AI not configured to trigger fallback
      const mockProvider = {
        isConfigured: vi.fn().mockReturnValue(false),
        query: vi.fn(),
        queryWithHistory: vi.fn()
      };
      mockAIProviderFactory.getProvider.mockReturnValue(mockProvider);

      vi.mocked(shell.client.list).mockResolvedValue([
        global.testUtils.mockProcessInfo({ name: 'api-server', pm2_env: { status: 'online' } })
      ]);

      // Test general info request that uses fallback
      const analysis = buildAnalysis({
        intent: 'info_request',
        originalInput: 'how are my processes doing?'
      });

      const response = await manager.processCommand('how are my processes doing?', analysis, { autoMode: true });
      
      expect(response.executed).toBe(true);
      // The fallback response is used when AI is not configured
      expect(response.message).toContain('processes are running smoothly');
      expect(vi.mocked(shell.client.list)).toHaveBeenCalled();
    });

    it('should handle log requests when no errors are found', async () => {
      mockErrorAnalysisService.analyzeLogErrors.mockResolvedValue({
        hasErrors: false,
        errorCount: 0,
        diagnosis: null
      });

      vi.mocked(shell.client.list).mockResolvedValue([
        global.testUtils.mockProcessInfo({ name: 'api-server', pm2_env: { status: 'online' } })
      ]);
      
      vi.mocked(shell.client.getErrorLogs).mockResolvedValue([]);

      const analysis = buildAnalysis({
        intent: 'info_request',
        originalInput: 'show me the error logs'
      });

      const response = await manager.processCommand('show me the error logs', analysis, { autoMode: true });
      
      expect(response.executed).toBe(true);
      expect(response.message).toContain('processes are running smoothly');
    });

    it('should handle general system queries', async () => {
      vi.mocked(shell.client.list).mockResolvedValue([
        global.testUtils.mockProcessInfo({ name: 'api', pm2_env: { status: 'online' } })
      ]);

      const analysis = buildAnalysis({
        intent: 'info_request',
        originalInput: 'tell me about my system performance'
      });

      const response = await manager.processCommand('tell me about my system performance', analysis, { autoMode: true });
      
      expect(response.executed).toBe(true);
      expect(vi.mocked(shell.client.list)).toHaveBeenCalled();
    });

    it('should handle errors in executeRelevantCommand gracefully', async () => {
      vi.mocked(shell.client.list).mockRejectedValue(new Error('PM2 connection failed'));

      const analysis = buildAnalysis({
        intent: 'info_request',
        originalInput: 'show me my processes'
      });

      const response = await manager.processCommand('show me my processes', analysis, { autoMode: true });
      
      expect(response.executed).toBe(false);
      expect(response.message).toContain('Failed to process information request');
    });
  });

  describe('validation and utility methods', () => {
    it('should validate commands correctly', () => {
      const pm2Command: PM2Command = {
        command: 'pm2',
        args: ['restart'],
        description: 'Restart process',
        safety: 'caution',
        requiresTarget: true
      };

      // Test missing target
      const analysis1 = buildAnalysis({
        parameters: { target: undefined, required: [], optional: [], provided: {} }
      });
      
      const validation1 = (manager as any).validateCommand(pm2Command, analysis1);
      expect(validation1.valid).toBe(false);
      expect(validation1.missing).toContain('process name or target');

      // Test invalid target
      mockCommandMapper.validateTarget.mockReturnValue(false);
      const analysis2 = buildAnalysis({
        parameters: { target: 'invalid', required: [], optional: [], provided: { target: 'invalid' } }
      });
      
      const validation2 = (manager as any).validateCommand(pm2Command, analysis2);
      expect(validation2.valid).toBe(false);
      expect(validation2.message).toContain('Invalid target');

      // Test valid command
      mockCommandMapper.validateTarget.mockReturnValue(true);
      const analysis3 = buildAnalysis({
        parameters: { target: 'api', required: [], optional: [], provided: { target: 'api' } }
      });
      
      const validation3 = (manager as any).validateCommand(pm2Command, analysis3);
      expect(validation3.valid).toBe(true);
    });

    it('should determine auto-execution correctly', () => {
      const safePM2Command: PM2Command = {
        command: 'pm2',
        args: ['list'],
        description: 'List processes',
        safety: 'safe',
        requiresTarget: false
      };

      const dangerousPM2Command: PM2Command = {
        command: 'pm2',
        args: ['delete', 'all'],
        description: 'Delete all processes',
        safety: 'dangerous',
        requiresTarget: false
      };

      // Test auto-execute enabled with safe command
      const safeAnalysis = buildAnalysis({ canAutoExecute: true, confidence: 0.95 });
      const shouldExecute1 = (manager as any).shouldAutoExecute(safeAnalysis, safePM2Command, { autoMode: true });
      expect(shouldExecute1).toBe(true);

      // Test dangerous command should not auto-execute
      mockCommandMapper.getSafetyLevel.mockReturnValue('dangerous');
      const shouldExecute2 = (manager as any).shouldAutoExecute(safeAnalysis, dangerousPM2Command, { autoMode: true });
      expect(shouldExecute2).toBe(false);

      // Test auto mode disabled
      const shouldExecute3 = (manager as any).shouldAutoExecute(safeAnalysis, safePM2Command, { autoMode: false });
      expect(shouldExecute3).toBe(false);

      // Test low confidence
      const lowConfidenceAnalysis = buildAnalysis({ canAutoExecute: true, confidence: 0.5 });
      const shouldExecute4 = (manager as any).shouldAutoExecute(lowConfidenceAnalysis, safePM2Command, { autoMode: true });
      expect(shouldExecute4).toBe(false);
    });

    it('should create proper error responses', () => {
      const errorResponse = (manager as any).createErrorResponse('Test error message');
      
      expect(errorResponse.executed).toBe(false);
      expect(errorResponse.message).toContain('Test error message');
      expect(errorResponse.needsUserInput).toBe(false);
      expect(errorResponse.pendingActions).toHaveLength(0);
    });

    it('should create proper validation responses', () => {
      const validation = {
        missing: ['process name'],
        message: 'Missing required parameter'
      };
      
      const validationResponse = (manager as any).createValidationResponse(validation);
      
      expect(validationResponse.executed).toBe(false);
      expect(validationResponse.needsUserInput).toBe(true);
      expect(validationResponse.missingParameters).toEqual(['process name']);
      expect(validationResponse.message).toContain('Missing required parameter');
    });

    it('should format execution messages correctly', () => {
      const successResult = {
        success: true,
        message: 'Process restarted successfully',
        command: 'pm2 restart api'
      };

      const autoMessage = (manager as any).formatExecutionMessage(successResult, true);
      expect(autoMessage).toContain('🤖');
      expect(autoMessage).toContain('Process restarted successfully');

      const manualMessage = (manager as any).formatExecutionMessage(successResult, false);
      expect(manualMessage).toBe('Process restarted successfully');

      const failureResult = {
        success: false,
        message: 'Process not found',
        command: 'pm2 restart invalid'
      };

      const failureMessage = (manager as any).formatExecutionMessage(failureResult, false);
      expect(failureMessage).toBe('Process not found');
    });

    it('should create pending actions correctly', () => {
      const analysis = buildAnalysis();
      const pm2Command: PM2Command = {
        command: 'pm2',
        args: ['restart', 'api'],
        description: 'Restart process',
        safety: 'caution',
        requiresTarget: true
      };

      mockCommandMapper.getSafetyLevel.mockReturnValue('caution');
      const pendingAction = (manager as any).createPendingAction(analysis, pm2Command);
      
      expect(pendingAction.id).toBeDefined();
      expect(pendingAction.label).toContain('restart');
      expect(pendingAction.command).toBe('pm2 restart api');
      expect(pendingAction.analysis).toBe(analysis);
      expect(pendingAction.safety).toBe('caution');
    });
  });

  describe('edge cases and error scenarios', () => {
    it('should handle command execution failures', async () => {
      const analysis = buildAnalysis({ canAutoExecute: true });
      const pm2Command: PM2Command = {
        command: 'pm2',
        args: ['restart', 'api'],
        description: 'Restart process',
        safety: 'safe',
        requiresTarget: true
      };

      mockCommandMapper.mapToCommand.mockResolvedValue(pm2Command);
      mockCommandMapper.validateTarget.mockReturnValue(true);
      mockCommandMapper.executeCommand.mockResolvedValue({
        success: false,
        message: 'Execution failed',
        command: 'pm2 restart api'
      });

      const response = await manager.processCommand('restart api', analysis, { autoMode: true });

      expect(response.executed).toBe(true);
      expect(response.result?.success).toBe(false);
    });

    it('should handle complex validation scenarios', async () => {
      const analysis = buildAnalysis({
        parameters: { target: 'nonexistent', required: ['target'], optional: [], provided: { target: 'nonexistent' } }
      });
      const pm2Command: PM2Command = {
        command: 'pm2',
        args: ['restart', 'nonexistent'],
        description: 'Restart process',
        safety: 'caution',
        requiresTarget: true
      };

      mockCommandMapper.mapToCommand.mockResolvedValue(pm2Command);
      mockCommandMapper.validateTarget.mockReturnValue(false);

      const response = await manager.processCommand('restart nonexistent', analysis, { autoMode: true });

      expect(response.executed).toBe(false);
      expect(response.needsUserInput).toBe(true);
      expect(response.message).toContain('Invalid target');
    });
  });
});
