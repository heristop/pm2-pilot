import { describe, it, expect, vi, beforeEach } from 'vitest';
import { container } from '@/container.js';
import { AICommand } from '@/commands/AICommand.js';
import type { IShell } from '@/interfaces/IShell.js';
import type { AIProvider } from '@/services/ai-providers/types.js';
import type { ContextBuilder } from '@/services/ContextBuilder.js';
import type { AIProviderFactory } from '@/services/AIProviderFactory.js';

// Mock the dependencies
vi.mock('pm2', () => import('../../__mocks__/pm2.js'));
vi.mock('openai', () => import('../../__mocks__/openai.js'));

describe('AICommand', () => {
  let aiCommand: AICommand;
  let mockShell: IShell;
  let mockAiProviderFactory: AIProviderFactory;
  let mockContextBuilder: ContextBuilder;
  let consoleSpy: any;

  beforeEach(() => {
    mockShell = global.testUtils.mockShell();
    mockAiProviderFactory = {
      getInstance: vi.fn(),
      getProvider: vi.fn(),
      isConfigured: vi.fn(),
      getConfigInfo: vi.fn(),
      saveProviderConfig: vi.fn(),
      setProvider: vi.fn(),
      listProviders: vi.fn(),
    } as any;
    mockContextBuilder = {
      buildProcessContext: vi.fn(),
    } as any;

    container.register('IShell', { useValue: mockShell });
    container.register('AIProviderFactory', { useValue: mockAiProviderFactory });
    container.register('ContextBuilder', { useValue: mockContextBuilder });

    aiCommand = container.resolve(AICommand);
    
    // Mock console methods
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {})
    };
  });



  describe('basic properties', () => {
    it('should have correct name, description, and aliases', () => {
      expect(aiCommand.name).toBe('ai');
      expect(aiCommand.description).toBe('Ask AI assistant about PM2 processes');
      expect(aiCommand.aliases).toContain('ask');
    });
  });

  describe('execute method', () => {
    it('should show help when no arguments provided', async () => {
      await aiCommand.execute([]);
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('🤖 AI Assistant Commands:')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('/ai <question>')
      );
    });

    it('should show config when config subcommand is used', async () => {
      await aiCommand.execute(['config']);
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('🔧 AI Configuration:')
      );
    });

    it('should handle setup subcommand with provider and API key', async () => {
      mockAiProviderFactory.saveProviderConfig = vi.fn().mockResolvedValue(undefined);
      mockAiProviderFactory.setProvider = vi.fn().mockReturnValue(true);

      await aiCommand.execute(['setup', 'openai', 'test-api-key']);
      
      expect(mockAiProviderFactory.saveProviderConfig).toHaveBeenCalledWith('openai', { apiKey: 'test-api-key' });
      expect(mockAiProviderFactory.setProvider).toHaveBeenCalledWith('openai');
    });

    it('should show usage for setup without provider and API key', async () => {
      await aiCommand.execute(['setup']);
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Usage: /ai setup <provider> <api-key>')
      );
    });

    it('should handle query when AI service is not configured', async () => {
      mockAiProviderFactory.getProvider = vi.fn().mockReturnValue(null);
      mockAiProviderFactory.isConfigured = vi.fn().mockReturnValue(false);
      
      await aiCommand.execute(['why', 'is', 'my', 'app', 'slow']);
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('❌ AI service not configured')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Set your API key:')
      );
    });

    it('should handle query when AI service is configured', async () => {
      const mockAIService: Partial<AIProvider> = {
        isConfigured: vi.fn().mockReturnValue(true),
        query: vi.fn().mockResolvedValue('Mock AI response: The process appears to be running normally.'),
        getConfigInfo: vi.fn().mockReturnValue('OpenAI configured'),
        saveConfig: vi.fn()
      };
      
      mockAiProviderFactory.getProvider = vi.fn().mockReturnValue(mockAIService);
      mockAiProviderFactory.isConfigured = vi.fn().mockReturnValue(true);
      
      mockContextBuilder.buildProcessContext = vi.fn().mockResolvedValue('Mock process context');
      
      await aiCommand.execute(['why', 'is', 'my', 'app', 'slow']);
      
      expect(mockContextBuilder.buildProcessContext).toHaveBeenCalled();
      expect(mockAIService.query).toHaveBeenCalledWith(
        'why is my app slow',
        'Mock process context'
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('🤖 AI Analysis:')
      );
    });

    it('should handle AI query errors', async () => {
      const mockAIService: Partial<AIProvider> = {
        isConfigured: vi.fn().mockReturnValue(true),
        query: vi.fn().mockRejectedValue(new Error('API rate limit exceeded')),
        getConfigInfo: vi.fn(),
        saveConfig: vi.fn()
      };
      
      mockAiProviderFactory.getProvider = vi.fn().mockReturnValue(mockAIService);
      mockAiProviderFactory.isConfigured = vi.fn().mockReturnValue(true);
      
      mockContextBuilder.buildProcessContext = vi.fn().mockResolvedValue('context');
      
      await aiCommand.execute(['test', 'query']);
      
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('❌ AI query failed: API rate limit exceeded')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('💡 Try again in a few minutes')
      );
    });

    it('should handle API key related errors', async () => {
      const mockAIService: Partial<AIProvider> = {
        isConfigured: vi.fn().mockReturnValue(true),
        query: vi.fn().mockRejectedValue(new Error('Invalid api key')),
        getConfigInfo: vi.fn(),
        saveConfig: vi.fn()
      };
      
      mockAiProviderFactory.getProvider = vi.fn().mockReturnValue(mockAIService);
      mockAiProviderFactory.isConfigured = vi.fn().mockReturnValue(true);
      
      mockContextBuilder.buildProcessContext = vi.fn().mockResolvedValue('context');
      
      await aiCommand.execute(['test', 'query']);
      
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('❌ AI query failed: Invalid api key')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('💡 Check your OpenAI API key configuration')
      );
    });
  });

  describe('response formatting', () => {
    it('should format AI responses with bullet points', async () => {
      const mockAIService: Partial<AIProvider> = {
        isConfigured: vi.fn().mockReturnValue(true),
        query: vi.fn().mockResolvedValue('• First point\n• Second point\n\nRegular paragraph'),
        getConfigInfo: vi.fn(),
        saveConfig: vi.fn()
      };
      
      mockAiProviderFactory.getProvider = vi.fn().mockReturnValue(mockAIService);
      mockAiProviderFactory.isConfigured = vi.fn().mockReturnValue(true);
      
      mockContextBuilder.buildProcessContext = vi.fn().mockResolvedValue('context');
      
      await aiCommand.execute(['test', 'query']);
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('  • First point')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('  • Second point')
      );
    });

    it('should format responses with headers', async () => {
      const mockAIService: Partial<AIProvider> = {
        isConfigured: vi.fn().mockReturnValue(true),
        query: vi.fn().mockResolvedValue('Analysis Results:\nThe process is healthy'),
        getConfigInfo: vi.fn(),
        saveConfig: vi.fn()
      };
      
      mockAiProviderFactory.getProvider = vi.fn().mockReturnValue(mockAIService);
      mockAiProviderFactory.isConfigured = vi.fn().mockReturnValue(true);
      
      mockContextBuilder.buildProcessContext = vi.fn().mockResolvedValue('context');
      
      await aiCommand.execute(['test', 'query']);
      
      // Should format the header with color
      expect(consoleSpy.log).toHaveBeenCalled();
    });
  });

  describe('setup command', () => {
    it('should handle setup config failure', async () => {
      mockAiProviderFactory.saveProviderConfig = vi.fn().mockRejectedValue(new Error('Save failed'));
      
      await aiCommand.execute(['setup', 'openai', 'test-key']);
      
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to save configuration:')
      );
    });

  });

  describe('config display', () => {
    it('should display config info from factory', async () => {
      mockAiProviderFactory.getConfigInfo = vi.fn().mockReturnValue('Mock configuration info');
      
      await aiCommand.execute(['config']);
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('🔧 AI Configuration:')
      );
      expect(mockAiProviderFactory.getConfigInfo).toHaveBeenCalled();
    });
  });

  describe('provider management', () => {
    it('should handle provider subcommand', async () => {
      mockAiProviderFactory.setProvider = vi.fn().mockReturnValue(true);
      mockAiProviderFactory.getProvider = vi.fn().mockReturnValue({ isConfigured: () => true });
      
      const mockShellRefresh = vi.fn();
      (mockShell as any).refreshAIStatus = mockShellRefresh;
      
      await aiCommand.execute(['provider', 'openai']);
      
      expect(mockAiProviderFactory.setProvider).toHaveBeenCalledWith('openai');
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('✅ Switched to OPENAI provider')
      );
      expect(mockShellRefresh).toHaveBeenCalled();
    });

    it('should handle provider subcommand when provider not configured', async () => {
      mockAiProviderFactory.setProvider = vi.fn().mockReturnValue(false);
      
      await aiCommand.execute(['provider', 'gemini']);
      
      expect(mockAiProviderFactory.setProvider).toHaveBeenCalledWith('gemini');
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('💡 To configure gemini, use: /ai setup gemini <api-key>')
      );
    });

    it('should show usage for provider without argument', async () => {
      mockAiProviderFactory.listProviders = vi.fn().mockReturnValue([]);
      await aiCommand.execute(['provider']);
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Usage: /ai provider <openai|gemini>')
      );
    });

    it('should handle invalid provider', async () => {
      await aiCommand.execute(['provider', 'invalid']);
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('❌ Invalid provider. Use "openai" or "gemini"')
      );
    });

    it('should list providers', async () => {
      const mockProviders = [
        { name: 'openai', configured: true, active: true },
        { name: 'gemini', configured: false, active: false }
      ];
      
      mockAiProviderFactory.listProviders = vi.fn().mockReturnValue(mockProviders);
      
      await aiCommand.execute(['providers']);
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('🤖 Available AI Providers:')
      );
      expect(mockAiProviderFactory.listProviders).toHaveBeenCalled();
    });

    it('should handle list alias for providers', async () => {
      const mockProviders = [];
      mockAiProviderFactory.listProviders = vi.fn().mockReturnValue(mockProviders);
      
      await aiCommand.execute(['list']);
      
      expect(mockAiProviderFactory.listProviders).toHaveBeenCalled();
    });
  });

  describe('preset management', () => {
    it('should show presets when AI service supports them', async () => {
      const mockAIService = {
        isConfigured: vi.fn().mockReturnValue(true),
        getPresetsInfo: vi.fn().mockReturnValue('Mock presets info'),
        applyPreset: vi.fn().mockResolvedValue(true),
        query: vi.fn(),
        getConfigInfo: vi.fn(),
        saveConfig: vi.fn()
      };
      
      mockAiProviderFactory.getProvider = vi.fn().mockReturnValue(mockAIService);
      
      await aiCommand.execute(['presets']);
      
      expect(mockAIService.getPresetsInfo).toHaveBeenCalled();
      expect(consoleSpy.log).toHaveBeenCalledWith('Mock presets info');
    });

    it('should show error when presets not supported', async () => {
      const mockAIService = {
        isConfigured: vi.fn().mockReturnValue(true),
        query: vi.fn(),
        getConfigInfo: vi.fn(),
        saveConfig: vi.fn()
        // No preset methods
      };
      
      mockAiProviderFactory.getProvider = vi.fn().mockReturnValue(mockAIService);
      
      await aiCommand.execute(['presets']);
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('⚠️ Speed presets are not available for this provider')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Switch to OpenAI or Gemini')
      );
    });

    it('should show error when service not configured for presets', async () => {
      mockAiProviderFactory.getProvider = vi.fn().mockReturnValue(null);
      
      await aiCommand.execute(['presets']);
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('❌ AI service not configured')
      );
    });

    it('should apply preset successfully', async () => {
      const mockAIService = {
        isConfigured: vi.fn().mockReturnValue(true),
        getPresetsInfo: vi.fn().mockReturnValue('Mock presets info'),
        applyPreset: vi.fn().mockResolvedValue(true),
        query: vi.fn(),
        getConfigInfo: vi.fn(),
        saveConfig: vi.fn()
      };
      
      const _mockFactory = {
        getProvider: vi.fn().mockReturnValue(mockAIService)
      };
      
      const mockShellRefresh = vi.fn();
      (mockShell as any).refreshAIStatus = mockShellRefresh;
      
      mockAiProviderFactory.getProvider = vi.fn().mockReturnValue(mockAIService);
      
      await aiCommand.execute(['preset', 'fast']);
      
      expect(mockAIService.applyPreset).toHaveBeenCalledWith('fast');
      expect(mockShellRefresh).toHaveBeenCalled();
    });

    it('should handle preset failure', async () => {
      const mockAIService = {
        isConfigured: vi.fn().mockReturnValue(true),
        getPresetsInfo: vi.fn().mockReturnValue('Mock presets info'),
        applyPreset: vi.fn().mockResolvedValue(false),
        query: vi.fn(),
        getConfigInfo: vi.fn(),
        saveConfig: vi.fn()
      };
      
      const _mockFactory = {
        getProvider: vi.fn().mockReturnValue(mockAIService)
      };
      
      const mockShellRefresh = vi.fn();
      (mockShell as any).refreshAIStatus = mockShellRefresh;
      
      mockAiProviderFactory.getProvider = vi.fn().mockReturnValue(mockAIService);
      
      await aiCommand.execute(['preset', 'invalid']);
      
      expect(mockAIService.applyPreset).toHaveBeenCalledWith('invalid');
      expect(mockShellRefresh).not.toHaveBeenCalled();
    });

    it('should show usage for preset without argument', async () => {
      const mockAIService = {
        isConfigured: vi.fn().mockReturnValue(true),
        getPresetsInfo: vi.fn().mockReturnValue('Mock presets info'),
        applyPreset: vi.fn().mockResolvedValue(true),
        query: vi.fn(),
        getConfigInfo: vi.fn(),
        saveConfig: vi.fn()
      };
      
      const _mockFactory = {
        getProvider: vi.fn().mockReturnValue(mockAIService)
      };
      
      mockAiProviderFactory.getProvider = vi.fn().mockReturnValue(mockAIService);
      
      await aiCommand.execute(['preset']);
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Usage: /ai preset <name>')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Available presets: lightning, fast, smart, reasoning')
      );
      expect(mockAIService.getPresetsInfo).toHaveBeenCalled();
    });

    it('should handle preset when service not configured', async () => {
      mockAiProviderFactory.getProvider = vi.fn().mockReturnValue(null);
      
      await aiCommand.execute(['preset', 'fast']);
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('❌ AI service not configured')
      );
    });

    it('should handle preset when service does not support presets', async () => {
      const mockAIService = {
        isConfigured: vi.fn().mockReturnValue(true),
        query: vi.fn(),
        getConfigInfo: vi.fn(),
        saveConfig: vi.fn()
        // No preset methods
      };
      
      const _mockFactory = {
        getProvider: vi.fn().mockReturnValue(mockAIService)
      };
      
      mockAiProviderFactory.getProvider = vi.fn().mockReturnValue(mockAIService);
      
      await aiCommand.execute(['preset', 'fast']);
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('⚠️ Speed presets are not available for this provider')
      );
    });
  });

  describe('setup command validation', () => {
    it('should reject invalid provider in setup', async () => {
      await aiCommand.execute(['setup', 'invalid', 'api-key']);
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('❌ Invalid provider. Use "openai" or "gemini"')
      );
    });

    it('should handle setup with insufficient arguments', async () => {
      await aiCommand.execute(['setup', 'openai']);
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Usage: /ai setup <provider> <api-key>')
      );
    });
  });
});
