import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DiagnoseCommand } from '@/commands/DiagnoseCommand.js';
import type { Shell } from '@/shell/Shell.js';
import type { AIProvider } from '@/services/ai-providers/types.js';

describe('DiagnoseCommand', () => {
  let _shell: Shell;
  let command: DiagnoseCommand;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let mockAIProvider: AIProvider;
  let mockContextBuilder: any;
  let mockFactory: any;
  
  const setInternal = (key: string, value: unknown) => {
    Reflect.set(command, key, value);
  };
  const getMethod = <T>(key: string): T => Reflect.get(command, key) as T;

  beforeEach(() => {
    _shell = global.testUtils.mockShell() as Shell;
    logSpy = vi.mocked(console.log);
    errorSpy = vi.mocked(console.error);
    logSpy.mockClear();
    errorSpy.mockClear();
    
    // Reset any previous factory mocks
    vi.clearAllMocks();
    
    // Setup common mocks
    mockAIProvider = {
      isConfigured: vi.fn().mockReturnValue(true),
      query: vi.fn().mockResolvedValue('AI diagnosis response')
    };
    
    mockContextBuilder = {
      buildProcessContext: vi.fn().mockResolvedValue('process context')
    };
    
    mockFactory = {
      getProvider: vi.fn().mockReturnValue(mockAIProvider)
    };
    
    // Create command with all required dependencies
    command = new DiagnoseCommand(
      mockFactory as any,
      mockContextBuilder as any,
      {} as any, // ErrorAnalysisService mock
      {} as any  // IPM2Client mock
    );
  });

  it('asks for configuration when AI is not ready', async () => {
    const aiStub: Pick<AIProvider, 'isConfigured' | 'query'> = {
      isConfigured: () => false,
      query: vi.fn()
    };
    
    const testFactory = { getProvider: vi.fn().mockReturnValue(aiStub) };
    const testCommand = new DiagnoseCommand(
      testFactory as any,
      mockContextBuilder as any,
      {} as any,
      {} as any
    );

    await testCommand.execute([]);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('❌ AI service not configured'));
  });

  it('builds context and displays diagnosis output', async () => {
    // Use the default mocks from beforeEach
    await command.execute(['api']);

    expect(mockContextBuilder.buildProcessContext).toHaveBeenCalledWith('api');
    expect(mockAIProvider.query).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('🔍 Diagnosing'));
  });

  it('handles AI failures gracefully', async () => {
    const aiStub: Pick<AIProvider, 'isConfigured' | 'query'> = {
      isConfigured: () => true,
      query: vi.fn().mockRejectedValue(new Error('boom'))
    };
    
    const testFactory = { getProvider: vi.fn().mockReturnValue(aiStub) };
    const testCommand = new DiagnoseCommand(
      testFactory as any,
      mockContextBuilder as any,
      {} as any,
      {} as any
    );

    await testCommand.execute([]);

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Diagnosis failed'));
  });

  describe('command metadata', () => {
    it('has correct name, aliases, and description', () => {
      expect(command.name).toBe('diagnose');
      expect(command.aliases).toEqual(['doctor']);
      expect(command.description).toBe('AI-powered diagnosis of PM2 process issues');
    });
  });

  describe('argument handling', () => {
    it('should handle single process argument', async () => {
      await command.execute(['api-server']);

      expect(mockContextBuilder.buildProcessContext).toHaveBeenCalledWith('api-server');
      expect(mockAIProvider.query).toHaveBeenCalled();
    });

    it('should handle multiple process arguments (uses first argument)', async () => {
      await command.execute(['api-server', 'worker-queue']);

      expect(mockContextBuilder.buildProcessContext).toHaveBeenCalledWith('api-server');
      expect(mockAIProvider.query).toHaveBeenCalled();
    });

    it('should handle no arguments (all processes)', async () => {
      await command.execute([]);

      expect(mockContextBuilder.buildProcessContext).toHaveBeenCalledWith(undefined);
      expect(mockAIProvider.query).toHaveBeenCalled();
    });

    it('should handle empty array arguments', async () => {
      await command.execute([]);

      expect(mockContextBuilder.buildProcessContext).toHaveBeenCalledWith(undefined);
    });
  });

  describe('error handling', () => {
    it('should handle context builder failures', async () => {
      mockContextBuilder.buildProcessContext.mockRejectedValue(new Error('Context build failed'));
      setInternal('aiProviderFactory', mockFactory);
      setInternal('contextBuilder', mockContextBuilder);

      await command.execute(['api-server']);

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Diagnosis failed'));
    });

    it('should propagate AI provider factory failures', async () => {
      const errorFactory = {
        getProvider: vi.fn().mockImplementation(() => {
          throw new Error('Factory failed');
        })
      };
      const errorCommand = new DiagnoseCommand(
        errorFactory as any,
        mockContextBuilder as any,
        {} as any,
        {} as any
      );

      // The factory error should be thrown, not caught
      await expect(errorCommand.execute(['api-server'])).rejects.toThrow('Factory failed');
    });

    it('should handle undefined context gracefully', async () => {
      mockContextBuilder.buildProcessContext.mockResolvedValue(undefined);
      setInternal('aiProviderFactory', mockFactory);
      setInternal('contextBuilder', mockContextBuilder);

      await command.execute([]);

      expect(mockAIProvider.query).toHaveBeenCalledWith(expect.stringContaining('Perform a system-wide diagnosis'), undefined);
    });

    it('should handle empty context string', async () => {
      mockContextBuilder.buildProcessContext.mockResolvedValue('');
      setInternal('aiProviderFactory', mockFactory);
      setInternal('contextBuilder', mockContextBuilder);

      await command.execute([]);

      expect(mockAIProvider.query).toHaveBeenCalledWith(expect.stringContaining('Perform a system-wide diagnosis'), '');
    });
  });

  describe('output formatting', () => {
    it('should format diagnosis with header and emojis', async () => {
      setInternal('aiProviderFactory', mockFactory);
      setInternal('contextBuilder', mockContextBuilder);

      await command.execute(['api-server']);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('🏥 AI Diagnosis Report'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('AI diagnosis response'));
    });

    it('should format complex diagnosis response', async () => {
      const complexResponse = `Summary:\n• Critical issue detected\n• Multiple errors found\n\nHigh Priority:\n• Fix database connection\n• Restart failed processes\n\n1. Immediate Actions:\n- Check configuration\n- Verify network connectivity\n\n2. Long-term Solutions:\n- Implement error handling\n- Add monitoring`;
      mockAIProvider.query.mockResolvedValue(complexResponse);
      setInternal('aiProviderFactory', mockFactory);
      setInternal('contextBuilder', mockContextBuilder);

      await command.execute(['api-server']);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('🏥 AI Diagnosis Report'));
    });

    it('should handle multiline responses correctly', async () => {
      const multilineResponse = 'Line 1\nLine 2\nLine 3';
      mockAIProvider.query.mockResolvedValue(multilineResponse);
      setInternal('aiProviderFactory', mockFactory);
      setInternal('contextBuilder', mockContextBuilder);

      await command.execute([]);

      const formatResponse = getMethod<(response: string) => void>('formatDiagnosisResponse');
      formatResponse(multilineResponse);
      
      expect(logSpy).toHaveBeenCalled();
    });

    it('should handle empty AI response', async () => {
      mockAIProvider.query.mockResolvedValue('');
      setInternal('aiProviderFactory', mockFactory);
      setInternal('contextBuilder', mockContextBuilder);

      await command.execute([]);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('🏥 AI Diagnosis Report'));
    });

    it('should handle AI response with special characters', async () => {
      const specialResponse = 'Response with émojis 🚀 and special chars: <>{}[]';
      mockAIProvider.query.mockResolvedValue(specialResponse);
      setInternal('aiProviderFactory', mockFactory);
      setInternal('contextBuilder', mockContextBuilder);

      await command.execute([]);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(specialResponse));
    });
  });

  describe('diagnosis prompt building', () => {
    it('should include comprehensive diagnosis prompt', async () => {
      setInternal('aiProviderFactory', mockFactory);
      setInternal('contextBuilder', mockContextBuilder);

      await command.execute(['api-server']);

      expect(mockAIProvider.query).toHaveBeenCalledWith(
        expect.stringContaining('Perform a comprehensive diagnosis'),
        'process context'
      );

      const [prompt] = vi.mocked(mockAIProvider.query).mock.calls[0];
      expect(prompt).toContain('comprehensive diagnosis');
      expect(prompt).toContain('actionable recommendations');
      expect(prompt).toContain('PM2 commands');
    });

    it('should include context in AI query', async () => {
      const customContext = 'Custom process context data';
      mockContextBuilder.buildProcessContext.mockResolvedValue(customContext);
      setInternal('aiProviderFactory', mockFactory);
      setInternal('contextBuilder', mockContextBuilder);

      await command.execute(['custom-process']);

      expect(mockAIProvider.query).toHaveBeenCalledWith(
        expect.stringContaining('Perform a comprehensive diagnosis'),
        customContext
      );
    });
  });

  describe('response formatting edge cases', () => {
    it('should handle responses with bullet points', () => {
      const response = '• Point 1\n• Point 2\n• Point 3';
      const formatResponse = getMethod<(response: string) => void>('formatDiagnosisResponse');
      
      formatResponse(response);
      
      expect(logSpy).toHaveBeenCalled();
    });

    it('should handle responses with numbered lists', () => {
      const response = '1. First item\n2. Second item\n3. Third item';
      const formatResponse = getMethod<(response: string) => void>('formatDiagnosisResponse');
      
      formatResponse(response);
      
      expect(logSpy).toHaveBeenCalled();
    });

    it('should handle responses with priority sections', () => {
      const response = 'High Priority:\n• Critical fix\n\nMedium Priority:\n• Minor adjustment';
      const formatResponse = getMethod<(response: string) => void>('formatDiagnosisResponse');
      
      formatResponse(response);
      
      expect(logSpy).toHaveBeenCalled();
    });

    it('should handle very long responses', () => {
      const longResponse = 'x'.repeat(5000);
      const formatResponse = getMethod<(response: string) => void>('formatDiagnosisResponse');
      
      formatResponse(longResponse);
      
      expect(logSpy).toHaveBeenCalled();
    });
  });

  describe('integration scenarios', () => {
    it('should work with realistic process names', async () => {
      const processNames = ['api-server', 'worker-queue', 'database-sync', 'redis-cache'];
      setInternal('aiProviderFactory', mockFactory);
      setInternal('contextBuilder', mockContextBuilder);

      for (const processName of processNames) {
        mockContextBuilder.buildProcessContext.mockClear();
        await command.execute([processName]);
        expect(mockContextBuilder.buildProcessContext).toHaveBeenCalledWith(processName);
      }
    });

    it('should handle rapid consecutive calls', async () => {
      setInternal('aiProviderFactory', mockFactory);
      setInternal('contextBuilder', mockContextBuilder);

      const promises = [
        command.execute(['process1']),
        command.execute(['process2']),
        command.execute(['process3'])
      ];

      await Promise.all(promises);

      expect(mockAIProvider.query).toHaveBeenCalledTimes(3);
    });

    it('should handle process names with special characters', async () => {
      const specialProcessName = 'api-server_v2.1-beta';
      setInternal('aiProviderFactory', mockFactory);
      setInternal('contextBuilder', mockContextBuilder);

      await command.execute([specialProcessName]);

      expect(mockContextBuilder.buildProcessContext).toHaveBeenCalledWith(specialProcessName);
    });
  });

  describe('subcommands', () => {
    let mockPM2Client: any;
    let mockErrorAnalysisService: any;

    beforeEach(() => {
      mockPM2Client = {
        getErrorLogs: vi.fn().mockResolvedValue([
          {
            level: 'error',
            message: 'Test error message',
            timestamp: '2024-01-01T10:00:00Z',
            process: 'test-process'
          }
        ])
      };

      mockErrorAnalysisService = {
        analyzeLogErrors: vi.fn().mockResolvedValue({
          hasErrors: true,
          errorCount: 1,
          parsedErrors: [{
            type: 'Test Error',
            message: 'Test error message',
            severity: 'high',
            category: 'runtime'
          }],
          diagnosis: {
            summary: 'Test diagnosis',
            rootCause: 'Test cause',
            actionableSuggestions: ['Fix it'],
            followUpCommands: ['restart'],
            severity: 'high',
            confidence: 0.9
          }
        })
      };
    });

    describe('logs subcommand', () => {
      it('should handle logs subcommand for specific process', async () => {
        const testCommand = new DiagnoseCommand(
          mockFactory as any,
          mockContextBuilder as any,
          mockErrorAnalysisService as any,
          mockPM2Client as any
        );

        await testCommand.execute(['logs', 'api-server']);

        expect(mockPM2Client.getErrorLogs).toHaveBeenCalledWith('api-server', 100);
        expect(mockErrorAnalysisService.analyzeLogErrors).toHaveBeenCalled();
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('🔍 Analyzing logs'));
      });

      it('should handle logs subcommand for all processes', async () => {
        const testCommand = new DiagnoseCommand(
          mockFactory as any,
          mockContextBuilder as any,
          mockErrorAnalysisService as any,
          mockPM2Client as any
        );

        await testCommand.execute(['logs']);

        expect(mockPM2Client.getErrorLogs).toHaveBeenCalledWith(undefined, 100);
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('across all processes'));
      });

      it('should handle logs subcommand when AI not configured', async () => {
        const unconfiguredAI = { isConfigured: () => false, query: vi.fn() };
        const unconfiguredFactory = { getProvider: vi.fn().mockReturnValue(unconfiguredAI) };
        
        const testCommand = new DiagnoseCommand(
          unconfiguredFactory as any,
          mockContextBuilder as any,
          mockErrorAnalysisService as any,
          mockPM2Client as any
        );

        await testCommand.execute(['logs', 'test']);

        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('❌ AI service not configured'));
        expect(mockPM2Client.getErrorLogs).not.toHaveBeenCalled();
      });

      it('should handle logs subcommand with no logs found', async () => {
        mockPM2Client.getErrorLogs.mockResolvedValue([]);
        
        const testCommand = new DiagnoseCommand(
          mockFactory as any,
          mockContextBuilder as any,
          mockErrorAnalysisService as any,
          mockPM2Client as any
        );

        await testCommand.execute(['logs', 'test']);

        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('✅ No recent logs found'));
      });

      it('should handle logs subcommand with no errors in logs', async () => {
        mockErrorAnalysisService.analyzeLogErrors.mockResolvedValue({
          hasErrors: false,
          errorCount: 0,
          parsedErrors: []
        });
        
        const testCommand = new DiagnoseCommand(
          mockFactory as any,
          mockContextBuilder as any,
          mockErrorAnalysisService as any,
          mockPM2Client as any
        );

        await testCommand.execute(['logs', 'test']);

        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('✅ No errors detected'));
      });

      it('should handle logs subcommand errors gracefully', async () => {
        mockPM2Client.getErrorLogs.mockRejectedValue(new Error('PM2 error'));
        
        const testCommand = new DiagnoseCommand(
          mockFactory as any,
          mockContextBuilder as any,
          mockErrorAnalysisService as any,
          mockPM2Client as any
        );

        await testCommand.execute(['logs', 'test']);

        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Log diagnosis failed'));
      });
    });

    describe('errors subcommand', () => {
      it('should handle errors subcommand for specific process', async () => {
        const testCommand = new DiagnoseCommand(
          mockFactory as any,
          mockContextBuilder as any,
          mockErrorAnalysisService as any,
          mockPM2Client as any
        );

        await testCommand.execute(['errors', 'api-server']);

        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('🚨 Error-Focused Diagnosis'));
      });

      it('should handle errors subcommand when AI not configured', async () => {
        const unconfiguredAI = { isConfigured: () => false, query: vi.fn() };
        const unconfiguredFactory = { getProvider: vi.fn().mockReturnValue(unconfiguredAI) };
        
        const testCommand = new DiagnoseCommand(
          unconfiguredFactory as any,
          mockContextBuilder as any,
          mockErrorAnalysisService as any,
          mockPM2Client as any
        );

        await testCommand.execute(['errors', 'test']);

        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('❌ AI service not configured'));
      });
    });
  });

  describe('private methods coverage', () => {
    it('should test displayDiagnosis method', async () => {
      await command.execute(['test-process']);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('🏥 AI Diagnosis Report'));
    });

    it('should test buildDiagnosisPrompt for specific process', () => {
      const buildPrompt = command as any;
      const prompt = buildPrompt.buildDiagnosisPrompt('test-process');
      expect(prompt).toContain('comprehensive diagnosis');
      expect(prompt).toContain('test-process');
    });

    it('should test buildDiagnosisPrompt for all processes', () => {
      const buildPrompt = command as any;
      const prompt = buildPrompt.buildDiagnosisPrompt();
      expect(prompt).toContain('system-wide diagnosis');
    });
  });
});
