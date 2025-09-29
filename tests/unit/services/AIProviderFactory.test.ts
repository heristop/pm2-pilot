import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { AIProviderFactory, type AIProviderType } from '@/services/AIProviderFactory.js';
import { OpenAIService } from '@/services/ai-providers/OpenAIService.js';
import { GeminiService } from '@/services/ai-providers/GeminiService.js';
import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';

// Mock the provider services
vi.mock('@/services/ai-providers/OpenAIService.js', () => ({
  OpenAIService: vi.fn()
}));

vi.mock('@/services/ai-providers/GeminiService.js', () => ({
  GeminiService: vi.fn()
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn()
}));

vi.mock('fs/promises', () => ({
  writeFile: vi.fn()
}));

describe('AIProviderFactory', () => {
  const originalEnv = { ...process.env };
  let mockOpenAIService: any;
  let mockGeminiService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    
    // Reset singleton instance
    (AIProviderFactory as any).instance = null;
    
    // Create mock services
    mockOpenAIService = {
      isConfigured: vi.fn(),
      getConfigInfo: vi.fn(),
      saveConfig: vi.fn()
    };
    
    mockGeminiService = {
      isConfigured: vi.fn(),
      getConfigInfo: vi.fn(),
      saveConfig: vi.fn()
    };
    
    vi.mocked(OpenAIService).mockImplementation(() => mockOpenAIService);
    vi.mocked(GeminiService).mockImplementation(() => mockGeminiService);
    
    vi.mocked(fsSync.existsSync).mockReturnValue(false);
    vi.mocked(fsSync.readFileSync).mockReturnValue('{}');
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    
    // Mock console methods to avoid test output pollution
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('Singleton Pattern', () => {
    it('returns the same instance on multiple calls', () => {
      const factory1 = AIProviderFactory.getInstance();
      const factory2 = AIProviderFactory.getInstance();
      
      expect(factory1).toBe(factory2);
    });
  });

  describe('Provider Selection', () => {
    it('selects no provider when none are configured', () => {
      mockOpenAIService.isConfigured.mockReturnValue(false);
      mockGeminiService.isConfigured.mockReturnValue(false);

      const factory = AIProviderFactory.getInstance();
      expect(factory.getCurrentProviderType()).toBeNull();
      expect(factory.getProvider()).toBeNull();
      expect(factory.isConfigured()).toBe(false);
    });

    it('auto-selects OpenAI when only OpenAI is configured', () => {
      mockOpenAIService.isConfigured.mockReturnValue(true);
      mockGeminiService.isConfigured.mockReturnValue(false);

      const factory = AIProviderFactory.getInstance();
      expect(factory.getCurrentProviderType()).toBe('openai');
      expect(factory.getProvider()).toBe(mockOpenAIService);
      expect(factory.isConfigured()).toBe(true);
    });

    it('auto-selects Gemini when only Gemini is configured', () => {
      mockOpenAIService.isConfigured.mockReturnValue(false);
      mockGeminiService.isConfigured.mockReturnValue(true);

      const factory = AIProviderFactory.getInstance();
      expect(factory.getCurrentProviderType()).toBe('gemini');
      expect(factory.getProvider()).toBe(mockGeminiService);
    });

    it('prefers OpenAI when both providers are configured', () => {
      mockOpenAIService.isConfigured.mockReturnValue(true);
      mockGeminiService.isConfigured.mockReturnValue(true);

      const factory = AIProviderFactory.getInstance();
      expect(factory.getCurrentProviderType()).toBe('openai');
      expect(factory.getProvider()).toBe(mockOpenAIService);
    });
  });

  describe('Environment Variable Selection', () => {
    it('uses AI_PROVIDER environment variable when set and configured', () => {
      process.env.AI_PROVIDER = 'gemini';
      mockOpenAIService.isConfigured.mockReturnValue(true);
      mockGeminiService.isConfigured.mockReturnValue(true);

      const factory = AIProviderFactory.getInstance();
      expect(factory.getCurrentProviderType()).toBe('gemini');
      expect(factory.getProvider()).toBe(mockGeminiService);
    });

    it('ignores AI_PROVIDER if the specified provider is not configured', () => {
      process.env.AI_PROVIDER = 'gemini';
      mockOpenAIService.isConfigured.mockReturnValue(true);
      mockGeminiService.isConfigured.mockReturnValue(false);

      const factory = AIProviderFactory.getInstance();
      expect(factory.getCurrentProviderType()).toBe('openai');
    });

    it('ignores invalid AI_PROVIDER values', () => {
      process.env.AI_PROVIDER = 'invalid-provider';
      mockOpenAIService.isConfigured.mockReturnValue(true);
      mockGeminiService.isConfigured.mockReturnValue(false);

      const factory = AIProviderFactory.getInstance();
      expect(factory.getCurrentProviderType()).toBe('openai');
    });
  });

  describe('Config File Selection', () => {
    it('uses provider from config file when available', () => {
      vi.mocked(fsSync.existsSync).mockReturnValue(true);
      vi.mocked(fsSync.readFileSync).mockReturnValue(JSON.stringify({
        provider: 'gemini'
      }));
      mockOpenAIService.isConfigured.mockReturnValue(true);
      mockGeminiService.isConfigured.mockReturnValue(true);

      const factory = AIProviderFactory.getInstance();
      expect(factory.getCurrentProviderType()).toBe('gemini');
    });

    it('falls back to auto-detection if config file provider is not configured', () => {
      vi.mocked(fsSync.existsSync).mockReturnValue(true);
      vi.mocked(fsSync.readFileSync).mockReturnValue(JSON.stringify({
        provider: 'gemini'
      }));
      mockOpenAIService.isConfigured.mockReturnValue(true);
      mockGeminiService.isConfigured.mockReturnValue(false);

      const factory = AIProviderFactory.getInstance();
      expect(factory.getCurrentProviderType()).toBe('openai');
    });

    it('handles invalid config file gracefully', () => {
      vi.mocked(fsSync.existsSync).mockReturnValue(true);
      vi.mocked(fsSync.readFileSync).mockReturnValue('invalid json');
      mockOpenAIService.isConfigured.mockReturnValue(true);
      mockGeminiService.isConfigured.mockReturnValue(false);

      const factory = AIProviderFactory.getInstance();
      expect(factory.getCurrentProviderType()).toBe('openai');
    });
  });

  describe('Provider Switching', () => {
    it('successfully switches to a configured provider', () => {
      mockOpenAIService.isConfigured.mockReturnValue(true);
      mockGeminiService.isConfigured.mockReturnValue(true);

      const factory = AIProviderFactory.getInstance();
      const result = factory.setProvider('gemini');

      expect(result).toBe(true);
      expect(factory.getCurrentProviderType()).toBe('gemini');
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('✓ Switched to gemini provider'));
    });

    it('fails to switch to unconfigured provider', () => {
      mockOpenAIService.isConfigured.mockReturnValue(true);
      mockGeminiService.isConfigured.mockReturnValue(false);

      const factory = AIProviderFactory.getInstance();
      const result = factory.setProvider('gemini');

      expect(result).toBe(false);
      expect(factory.getCurrentProviderType()).toBe('openai'); // Should remain unchanged
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Provider gemini is not configured'));
    });

    it('fails to switch to unknown provider', () => {
      mockOpenAIService.isConfigured.mockReturnValue(true);
      mockGeminiService.isConfigured.mockReturnValue(false);

      const factory = AIProviderFactory.getInstance();
      const result = factory.setProvider('unknown' as AIProviderType);

      expect(result).toBe(false);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Unknown provider: unknown'));
    });

    it('saves provider preference after successful switch', async () => {
      mockOpenAIService.isConfigured.mockReturnValue(true);
      mockGeminiService.isConfigured.mockReturnValue(true);

      const factory = AIProviderFactory.getInstance();
      
      // Clear any previous calls to fs.writeFile from the constructor
      vi.mocked(fs.writeFile).mockClear();
      
      factory.setProvider('gemini');

      // Wait for async save operation
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(fs.writeFile).toHaveBeenCalled();
      const mockCalls = (fs.writeFile as unknown as MockInstance).mock.calls;
      expect(mockCalls).toHaveLength(1);
      const [, content] = mockCalls[0] as [string, string];
      const saved = JSON.parse(content);
      expect(saved.provider).toBe('gemini');
    });
  });

  describe('Configuration Info', () => {
    it('returns configuration info for current provider', () => {
      mockOpenAIService.isConfigured.mockReturnValue(true);
      mockOpenAIService.getConfigInfo.mockReturnValue('OpenAI Config Info');

      const factory = AIProviderFactory.getInstance();
      const info = factory.getConfigInfo();

      expect(info).toContain('Current Provider: OPENAI');
      expect(info).toContain('OpenAI Config Info');
      expect(info).toContain('Switch provider with: /ai provider');
    });

    it('returns setup instructions when no provider is configured', () => {
      mockOpenAIService.isConfigured.mockReturnValue(false);
      mockGeminiService.isConfigured.mockReturnValue(false);

      const factory = AIProviderFactory.getInstance();
      const info = factory.getConfigInfo();

      // Strip ANSI codes and normalize whitespace for reliable testing
      // eslint-disable-next-line no-control-regex
      const cleanInfo = info.replace(/\u001b\[[0-9;]*m/g, '').replace(/\s+/g, ' ');

      expect(cleanInfo).toContain('No AI provider configured');
      expect(cleanInfo).toContain('OpenAI: Set OPENAI_API_KEY environment variable');
      expect(cleanInfo).toContain('Gemini: Set GEMINI_API_KEY environment variable');
      expect(cleanInfo).toContain('/ai setup <provider> <api-key>');
    });

    it('handles missing getConfigInfo method gracefully', () => {
      mockOpenAIService.isConfigured.mockReturnValue(true);
      mockOpenAIService.getConfigInfo = undefined;

      const factory = AIProviderFactory.getInstance();
      const info = factory.getConfigInfo();

      expect(info).toContain('Current Provider: OPENAI');
      expect(info).toContain('No configuration info available');
    });
  });

  describe('Provider Configuration', () => {
    it('saves configuration for specified provider', async () => {
      const factory = AIProviderFactory.getInstance();
      
      await factory.saveProviderConfig('openai', { apiKey: 'test-key', temperature: 0.5 });

      expect(mockOpenAIService.saveConfig).toHaveBeenCalledWith({
        apiKey: 'test-key',
        temperature: 0.5
      });
    });

    it('throws error for unknown provider', async () => {
      const factory = AIProviderFactory.getInstance();
      
      await expect(factory.saveProviderConfig('unknown' as AIProviderType, {})).rejects.toThrow('Unknown provider: unknown');
    });

    it('re-selects provider after configuration', async () => {
      const factory = AIProviderFactory.getInstance();
      const selectSpy = vi.spyOn(factory as any, 'selectProvider');
      
      await factory.saveProviderConfig('gemini', { apiKey: 'test' });

      expect(selectSpy).toHaveBeenCalled();
    });
  });

  describe('Provider Listing', () => {
    it('lists all providers with their status', () => {
      mockOpenAIService.isConfigured.mockReturnValue(true);
      mockGeminiService.isConfigured.mockReturnValue(false);

      const factory = AIProviderFactory.getInstance();
      const providers = factory.listProviders();

      expect(providers).toEqual([
        { name: 'openai', configured: true, active: true },
        { name: 'gemini', configured: false, active: false }
      ]);
    });

    it('marks no provider as active when none are selected', () => {
      mockOpenAIService.isConfigured.mockReturnValue(false);
      mockGeminiService.isConfigured.mockReturnValue(false);

      const factory = AIProviderFactory.getInstance();
      const providers = factory.listProviders();

      expect(providers).toEqual([
        { name: 'openai', configured: false, active: false },
        { name: 'gemini', configured: false, active: false }
      ]);
    });
  });

  describe('Preset Persistence', () => {
    beforeEach(() => {
      // Mock preset functionality
      mockOpenAIService.applyPreset = vi.fn();
      mockOpenAIService.config = { activePreset: null };
      mockGeminiService.applyPreset = vi.fn();
      mockGeminiService.config = { activePreset: null };
    });

    it('getCurrentModelInfo returns preset information from provider config', () => {
      mockOpenAIService.isConfigured.mockReturnValue(true);
      mockOpenAIService.config = {
        model: 'gpt-4',
        activePreset: 'balanced'
      };

      const factory = AIProviderFactory.getInstance();
      const modelInfo = factory.getCurrentModelInfo();

      expect(modelInfo).toEqual({
        model: 'gpt-4',
        preset: 'balanced'
      });
    });

    it('getCurrentModelInfo returns null when no provider is configured', () => {
      mockOpenAIService.isConfigured.mockReturnValue(false);
      mockGeminiService.isConfigured.mockReturnValue(false);

      const factory = AIProviderFactory.getInstance();
      const modelInfo = factory.getCurrentModelInfo();

      expect(modelInfo).toBeNull();
    });

    it('getCurrentModelInfo handles provider config gracefully when unavailable', () => {
      mockOpenAIService.isConfigured.mockReturnValue(true);
      // Don't set config property to simulate error accessing it

      const factory = AIProviderFactory.getInstance();
      const modelInfo = factory.getCurrentModelInfo();

      // When config is unavailable, it should return an object with undefined values
      expect(modelInfo).toEqual({
        model: undefined,
        preset: null
      });
    });

    it('persists preset information across provider switches', async () => {
      // Setup both providers with presets
      mockOpenAIService.isConfigured.mockReturnValue(true);
      mockOpenAIService.config = { model: 'gpt-4', activePreset: 'fast' };
      mockGeminiService.isConfigured.mockReturnValue(true);
      mockGeminiService.config = { model: 'gemini-1.5-pro', activePreset: 'balanced' };

      const factory = AIProviderFactory.getInstance();

      // Start with OpenAI
      expect(factory.getCurrentProviderType()).toBe('openai');
      let modelInfo = factory.getCurrentModelInfo();
      expect(modelInfo?.preset).toBe('fast');

      // Switch to Gemini
      factory.setProvider('gemini');
      modelInfo = factory.getCurrentModelInfo();
      expect(modelInfo?.preset).toBe('balanced');

      // Switch back to OpenAI
      factory.setProvider('openai');
      modelInfo = factory.getCurrentModelInfo();
      expect(modelInfo?.preset).toBe('fast'); // Should preserve original preset
    });

    it('handles preset information for providers without activePreset', () => {
      mockOpenAIService.isConfigured.mockReturnValue(true);
      mockOpenAIService.config = { model: 'gpt-4' }; // No activePreset

      const factory = AIProviderFactory.getInstance();
      const modelInfo = factory.getCurrentModelInfo();

      expect(modelInfo).toEqual({
        model: 'gpt-4',
        preset: undefined
      });
    });
  });

  describe('User Preferences Management', () => {
    it('loads default user preferences when config file does not exist', () => {
      vi.mocked(fsSync.existsSync).mockReturnValue(false);
      
      const factory = AIProviderFactory.getInstance();
      const prefs = factory.getUserPreferences();
      
      expect(prefs).toEqual({
        autoExecute: true,
        verbosity: 'detailed',
        confirmationLevel: 'destructive'
      });
    });

    it('loads user preferences from config file when available', () => {
      vi.mocked(fsSync.existsSync).mockReturnValue(true);
      vi.mocked(fsSync.readFileSync).mockReturnValue(JSON.stringify({
        userPreferences: {
          autoExecute: true,
          verbosity: 'verbose',
          confirmationLevel: 'all'
        }
      }));
      
      const factory = AIProviderFactory.getInstance();
      const prefs = factory.getUserPreferences();
      
      expect(prefs).toEqual({
        autoExecute: true,
        verbosity: 'verbose',
        confirmationLevel: 'all'
      });
    });

    it('falls back to defaults for invalid user preferences', () => {
      vi.mocked(fsSync.existsSync).mockReturnValue(true);
      vi.mocked(fsSync.readFileSync).mockReturnValue(JSON.stringify({
        userPreferences: {
          autoExecute: 'invalid',
          verbosity: 'invalid',
          confirmationLevel: 'invalid'
        }
      }));
      
      const factory = AIProviderFactory.getInstance();
      const prefs = factory.getUserPreferences();
      
      expect(prefs).toEqual({
        autoExecute: true,
        verbosity: 'detailed',
        confirmationLevel: 'destructive'
      });
    });

    it('toggles auto-execute mode and saves preferences', async () => {
      const factory = AIProviderFactory.getInstance();
      
      // Clear any previous calls
      vi.mocked(fs.writeFile).mockClear();
      
      // Initially true (default)
      expect(factory.isAutoExecuteEnabled()).toBe(true);
      
      // Toggle to false
      const result = await factory.toggleAutoExecute();
      expect(result).toBe(false);
      expect(factory.isAutoExecuteEnabled()).toBe(false);
      
      // Check console output
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('✓ Switched to ask first mode'));
      
      // Verify preferences were saved
      expect(fs.writeFile).toHaveBeenCalled();
      const mockCalls = (fs.writeFile as unknown as MockInstance).mock.calls;
      expect(mockCalls).toHaveLength(1);
      const [, content] = mockCalls[0] as [string, string];
      const saved = JSON.parse(content);
      expect(saved.userPreferences.autoExecute).toBe(false);
    });

    it('persists user preferences changes across instances', async () => {
      // First instance: change preferences from default
      const factory1 = AIProviderFactory.getInstance();
      await factory1.setUserPreferences({
        autoExecute: false,
        verbosity: 'concise',
        confirmationLevel: 'none'
      });
      
      // Reset singleton to simulate app restart
      (AIProviderFactory as any).instance = null;
      
      // Simulate config file with saved preferences AFTER resetting singleton
      vi.mocked(fsSync.existsSync).mockReturnValue(true);
      vi.mocked(fsSync.readFileSync).mockReturnValue(JSON.stringify({
        userPreferences: {
          autoExecute: false,
          verbosity: 'concise',
          confirmationLevel: 'none'
        }
      }));
      
      // Second instance: should load saved preferences
      const factory2 = AIProviderFactory.getInstance();
      const prefs = factory2.getUserPreferences();
      
      expect(prefs).toEqual({
        autoExecute: false,
        verbosity: 'concise',
        confirmationLevel: 'none'
      });
      expect(factory2.isAutoExecuteEnabled()).toBe(false);
    });

    it('preserves existing config when saving user preferences', async () => {
      vi.mocked(fsSync.existsSync).mockReturnValue(true);
      vi.mocked(fsSync.readFileSync).mockReturnValue(JSON.stringify({
        provider: 'openai',
        openai: { apiKey: 'test-key' },
        existingData: 'preserved'
      }));
      
      const factory = AIProviderFactory.getInstance();
      await factory.setUserPreferences({ autoExecute: true });
      
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(fs.writeFile).toHaveBeenCalled();
      const mockCalls = (fs.writeFile as unknown as MockInstance).mock.calls;
      expect(mockCalls).toHaveLength(1);
      const [, content] = mockCalls[0] as [string, string];
      const saved = JSON.parse(content);
      
      expect(saved.provider).toBe('openai');
      expect(saved.openai).toEqual({ apiKey: 'test-key' });
      expect(saved.existingData).toBe('preserved');
      expect(saved.userPreferences.autoExecute).toBe(true);
    });
  });

  describe('Session Lifecycle Integration', () => {
    it('persists all settings across complete app restart scenario', async () => {
      // === PHASE 1: Initial setup ===
      mockOpenAIService.isConfigured.mockReturnValue(true);
      mockGeminiService.isConfigured.mockReturnValue(true);
      
      const factory1 = AIProviderFactory.getInstance();
      
      // User configures preferences (change from default)
      await factory1.setUserPreferences({
        autoExecute: false,
        verbosity: 'concise',
        confirmationLevel: 'all'
      });
      
      // User switches provider to Gemini
      factory1.setProvider('gemini');
      
      // Simulate that Gemini has a preset configured
      mockGeminiService.config = { 
        model: 'gemini-1.5-pro', 
        activePreset: 'fast' 
      };
      
      // Verify current state
      expect(factory1.getCurrentProviderType()).toBe('gemini');
      expect(factory1.isAutoExecuteEnabled()).toBe(false);
      const modelInfo1 = factory1.getCurrentModelInfo();
      expect(modelInfo1?.preset).toBe('fast');
      
      // === PHASE 2: Simulate app restart ===
      // Reset singleton to simulate app shutdown/restart
      (AIProviderFactory as any).instance = null;
      
      // Simulate saved config file with all settings
      vi.mocked(fsSync.existsSync).mockReturnValue(true);
      vi.mocked(fsSync.readFileSync).mockReturnValue(JSON.stringify({
        // Provider preference
        provider: 'gemini',
        // User preferences
        userPreferences: {
          autoExecute: false,
          verbosity: 'concise',
          confirmationLevel: 'all'
        },
        // Provider-specific configs would be in separate sections
        gemini: {
          model: 'gemini-1.5-pro',
          activePreset: 'fast'
        }
      }));
      
      // === PHASE 3: Verify restoration ===
      const factory2 = AIProviderFactory.getInstance();
      
      // Check that provider selection was restored
      expect(factory2.getCurrentProviderType()).toBe('gemini');
      
      // Check that user preferences were restored
      const prefs = factory2.getUserPreferences();
      expect(prefs).toEqual({
        autoExecute: false,
        verbosity: 'concise',
        confirmationLevel: 'all'
      });
      expect(factory2.isAutoExecuteEnabled()).toBe(false);
      
      // Check that preset info is available
      const modelInfo2 = factory2.getCurrentModelInfo();
      expect(modelInfo2?.preset).toBe('fast');
      expect(modelInfo2?.model).toBe('gemini-1.5-pro');
    });

    it('handles partial config file gracefully during restart', async () => {
      // Simulate config file with only some settings
      vi.mocked(fsSync.existsSync).mockReturnValue(true);
      vi.mocked(fsSync.readFileSync).mockReturnValue(JSON.stringify({
        provider: 'openai',
        // Missing userPreferences section
      }));
      
      mockOpenAIService.isConfigured.mockReturnValue(true);
      mockGeminiService.isConfigured.mockReturnValue(false);
      
      const factory = AIProviderFactory.getInstance();
      
      // Provider should be restored
      expect(factory.getCurrentProviderType()).toBe('openai');
      
      // User preferences should use defaults
      const prefs = factory.getUserPreferences();
      expect(prefs).toEqual({
        autoExecute: true,
        verbosity: 'detailed',
        confirmationLevel: 'destructive'
      });
    });

    it('recovers from corrupted config file during restart', async () => {
      // Simulate corrupted config file
      vi.mocked(fsSync.existsSync).mockReturnValue(true);
      vi.mocked(fsSync.readFileSync).mockImplementation(() => {
        throw new Error('Corrupted file');
      });
      
      mockOpenAIService.isConfigured.mockReturnValue(true);
      mockGeminiService.isConfigured.mockReturnValue(false);
      
      const factory = AIProviderFactory.getInstance();
      
      // Should fall back to auto-detection
      expect(factory.getCurrentProviderType()).toBe('openai');
      
      // Should use default preferences
      const prefs = factory.getUserPreferences();
      expect(prefs).toEqual({
        autoExecute: true,
        verbosity: 'detailed',
        confirmationLevel: 'destructive'
      });
    });
  });

  describe('Error Handling', () => {
    it('handles save preference errors gracefully', async () => {
      vi.mocked(fs.writeFile).mockRejectedValue(new Error('Permission denied'));
      mockOpenAIService.isConfigured.mockReturnValue(true);
      mockGeminiService.isConfigured.mockReturnValue(true);

      const factory = AIProviderFactory.getInstance();
      factory.setProvider('gemini');

      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to save provider preference'));
    });

    it('handles save user preferences errors gracefully', async () => {
      vi.mocked(fs.writeFile).mockRejectedValue(new Error('Permission denied'));
      
      const factory = AIProviderFactory.getInstance();
      await factory.toggleAutoExecute();

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to save user preferences'));
    });

    it('preserves existing config when saving provider preference', async () => {
      vi.mocked(fsSync.existsSync).mockReturnValue(true);
      vi.mocked(fsSync.readFileSync).mockReturnValue(JSON.stringify({
        existingKey: 'existingValue',
        provider: 'oldProvider'
      }));
      mockGeminiService.isConfigured.mockReturnValue(true);

      const factory = AIProviderFactory.getInstance();
      factory.setProvider('gemini');

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(fs.writeFile).toHaveBeenCalled();
      const mockCalls = (fs.writeFile as unknown as MockInstance).mock.calls;
      expect(mockCalls).toHaveLength(1);
      const [, content] = mockCalls[0] as [string, string];
      const saved = JSON.parse(content);
      expect(saved.existingKey).toBe('existingValue');
      expect(saved.provider).toBe('gemini');
    });
  });
});