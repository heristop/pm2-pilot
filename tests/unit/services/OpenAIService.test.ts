import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenAIService } from '@/services/ai-providers/OpenAIService.js';
import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import { Loader } from '@/utils/Loader.js';
import OpenAI from 'openai';

// Mock fs modules
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn()
}));

vi.mock('fs/promises', () => ({
  writeFile: vi.fn(),
  readFile: vi.fn(),
  rename: vi.fn(),
  unlink: vi.fn()
}));

// Mock os.homedir
vi.mock('os', () => ({
  homedir: vi.fn().mockReturnValue('/home/user')
}));

// Mock Loader
vi.mock('@/utils/Loader.js', () => ({
  Loader: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    stop: vi.fn()
  }))
}));

// Mock OpenAI client
const mockOpenAIResponse = {
  choices: [{
    message: {
      content: 'Mocked AI response'
    }
  }]
};

const mockOpenAIClient = {
  chat: {
    completions: {
      create: vi.fn().mockResolvedValue(mockOpenAIResponse)
    }
  }
};

vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => mockOpenAIClient)
  };
});

describe('OpenAIService', () => {
  const originalEnv = { ...process.env };
  let service: OpenAIService;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    vi.mocked(fsSync.existsSync).mockReturnValue(false);
    vi.mocked(fsSync.readFileSync).mockReturnValue('{}');
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue('{}');
    vi.mocked(fs.rename).mockResolvedValue(undefined);
    vi.mocked(fs.unlink).mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Constructor and Configuration', () => {
    it('should create service with default configuration when no config file exists', () => {
      vi.mocked(fsSync.existsSync).mockReturnValue(false);
      
      service = new OpenAIService();
      
      expect(service.isConfigured()).toBe(false);
      expect(service.getConfigInfo()).toContain('OpenAI not configured');
    });

    it('should load configuration from environment variable', () => {
      process.env.OPENAI_API_KEY = 'sk-test123';
      
      service = new OpenAIService();
      
      expect(service.isConfigured()).toBe(true);
      expect(OpenAI).toHaveBeenCalledWith({ apiKey: 'sk-test123' });
    });

    it('should load configuration from config file', () => {
      vi.mocked(fsSync.existsSync).mockReturnValue(true);
      vi.mocked(fsSync.readFileSync).mockReturnValue(JSON.stringify({
        openai: {
          apiKey: 'sk-file123',
          model: 'gpt-3.5-turbo',
          temperature: 0.5,
          maxTokens: 2000
        }
      }));
      
      service = new OpenAIService();
      
      expect(service.isConfigured()).toBe(true);
      expect(OpenAI).toHaveBeenCalledWith({ apiKey: 'sk-file123' });
    });

    it('should prioritize environment variable over config file', () => {
      process.env.OPENAI_API_KEY = 'sk-env123';
      vi.mocked(fsSync.existsSync).mockReturnValue(true);
      vi.mocked(fsSync.readFileSync).mockReturnValue(JSON.stringify({
        openai: {
          apiKey: 'sk-file123'
        }
      }));
      
      service = new OpenAIService();
      
      expect(service.isConfigured()).toBe(true);
      expect(OpenAI).toHaveBeenCalledWith({ apiKey: 'sk-env123' });
    });

    it('should handle invalid config file gracefully', () => {
      vi.mocked(fsSync.existsSync).mockReturnValue(true);
      vi.mocked(fsSync.readFileSync).mockImplementation(() => {
        throw new Error('Invalid JSON');
      });
      
      service = new OpenAIService();
      
      expect(service.isConfigured()).toBe(false);
    });

    it('should handle config file without openai section', () => {
      vi.mocked(fsSync.existsSync).mockReturnValue(true);
      vi.mocked(fsSync.readFileSync).mockReturnValue(JSON.stringify({
        gemini: { apiKey: 'other-key' }
      }));
      
      service = new OpenAIService();
      
      expect(service.isConfigured()).toBe(false);
    });
  });

  describe('Query Method', () => {
    beforeEach(() => {
      process.env.OPENAI_API_KEY = 'sk-test123';
      service = new OpenAIService();
    });

    it('should throw error when not configured', async () => {
      delete process.env.OPENAI_API_KEY;
      service = new OpenAIService();
      
      await expect(service.query('test prompt')).rejects.toThrow(
        'OpenAI API is not configured. Please set OPENAI_API_KEY environment variable.'
      );
    });

    it('should make API call with default parameters for gpt-4.1 model', async () => {
      const result = await service.query('test prompt');
      
      expect(mockOpenAIClient.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-4.1',
        messages: [
          { role: 'system', content: expect.stringContaining('PM2-X') },
          { role: 'user', content: 'test prompt' }
        ],
        max_tokens: 1000,
        temperature: 0.7
      });
      expect(result).toBe('Mocked AI response');
    });

    it('should include context in user message when provided', async () => {
      await service.query('test prompt', 'test context');
      
      expect(mockOpenAIClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'system', content: expect.stringContaining('PM2-X') },
            { role: 'user', content: 'Context:\ntest context\n\nQuestion: test prompt' }
          ]
        })
      );
    });

    it('should use custom model and parameters from config for traditional model', async () => {
      vi.mocked(fsSync.existsSync).mockReturnValue(true);
      vi.mocked(fsSync.readFileSync).mockReturnValue(JSON.stringify({
        openai: {
          apiKey: 'sk-test123',
          model: 'gpt-3.5-turbo',
          temperature: 0.5,
          maxTokens: 2000
        }
      }));
      
      service = new OpenAIService();
      await service.query('test prompt');
      
      expect(mockOpenAIClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-3.5-turbo',
          temperature: 0.5,
          max_tokens: 2000
        })
      );
    });

    it('should start and stop loader during query', async () => {
      const mockLoader = {
        start: vi.fn(),
        stop: vi.fn()
      };
      vi.mocked(Loader).mockImplementation(() => mockLoader);
      
      await service.query('test prompt');
      
      expect(mockLoader.start).toHaveBeenCalledWith({ message: 'Thinking...', context: 'query' });
      expect(mockLoader.stop).toHaveBeenCalled();
    });

    it('should handle rate limit errors', async () => {
      const rateError = new Error('rate limit exceeded');
      mockOpenAIClient.chat.completions.create.mockRejectedValueOnce(rateError);
      
      await expect(service.query('test prompt')).rejects.toThrow(
        'Rate limit exceeded. Please try again later.'
      );
    });

    it('should handle API key errors', async () => {
      const apiKeyError = new Error('invalid api key');
      mockOpenAIClient.chat.completions.create.mockRejectedValueOnce(apiKeyError);
      
      await expect(service.query('test prompt')).rejects.toThrow(
        'Invalid API key. Please check your OpenAI API key.'
      );
    });

    it('should handle generic API errors', async () => {
      const genericError = new Error('Network error');
      mockOpenAIClient.chat.completions.create.mockRejectedValueOnce(genericError);
      
      await expect(service.query('test prompt')).rejects.toThrow(
        'OpenAI API error: Network error'
      );
    });

    it('should handle non-Error exceptions', async () => {
      mockOpenAIClient.chat.completions.create.mockRejectedValueOnce('string error');
      
      await expect(service.query('test prompt')).rejects.toThrow(
        'Unknown error occurred during AI query'
      );
    });

    it('should stop loader on error', async () => {
      const mockLoader = {
        start: vi.fn(),
        stop: vi.fn()
      };
      vi.mocked(Loader).mockImplementation(() => mockLoader);
      
      mockOpenAIClient.chat.completions.create.mockRejectedValueOnce(new Error('test error'));
      
      await expect(service.query('test prompt')).rejects.toThrow();
      expect(mockLoader.stop).toHaveBeenCalled();
    });

    it('should handle empty response from API', async () => {
      mockOpenAIClient.chat.completions.create.mockResolvedValueOnce({
        choices: [{ message: { content: null } }]
      });
      
      const result = await service.query('test prompt');
      expect(result).toBe('No response from AI');
    });

    it('should handle missing choices in API response', async () => {
      mockOpenAIClient.chat.completions.create.mockResolvedValueOnce({
        choices: []
      });
      
      const result = await service.query('test prompt');
      expect(result).toBe('No response from AI');
    });
  });

  describe('Model-Aware Parameter Handling', () => {
    it('should use max_completion_tokens for GPT-5 series models', async () => {
      vi.mocked(fsSync.existsSync).mockReturnValue(true);
      vi.mocked(fsSync.readFileSync).mockReturnValue(JSON.stringify({
        openai: {
          apiKey: 'sk-test123',
          model: 'gpt-5',
          maxTokens: 1500
        }
      }));
      
      service = new OpenAIService();
      await service.query('test prompt');
      
      expect(mockOpenAIClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-5',
          max_completion_tokens: 2000
        })
      );
      expect(mockOpenAIClient.chat.completions.create).toHaveBeenCalledWith(
        expect.not.objectContaining({
          max_tokens: expect.anything(),
          temperature: expect.anything()
        })
      );
    });

    it('should use max_completion_tokens for o1 series models', async () => {
      vi.mocked(fsSync.existsSync).mockReturnValue(true);
      vi.mocked(fsSync.readFileSync).mockReturnValue(JSON.stringify({
        openai: {
          apiKey: 'sk-test123',
          model: 'o1-mini',
          maxTokens: 800
        }
      }));
      
      service = new OpenAIService();
      await service.query('test prompt');
      
      expect(mockOpenAIClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'o1-mini',
          max_completion_tokens: 2000
        })
      );
      expect(mockOpenAIClient.chat.completions.create).toHaveBeenCalledWith(
        expect.not.objectContaining({
          max_tokens: expect.anything(),
          temperature: expect.anything()
        })
      );
    });

    it('should use max_tokens and temperature for GPT-4 models', async () => {
      vi.mocked(fsSync.existsSync).mockReturnValue(true);
      vi.mocked(fsSync.readFileSync).mockReturnValue(JSON.stringify({
        openai: {
          apiKey: 'sk-test123',
          model: 'gpt-4',
          temperature: 0.3,
          maxTokens: 1200
        }
      }));
      
      service = new OpenAIService();
      await service.query('test prompt');
      
      expect(mockOpenAIClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4',
          temperature: 0.3,
          max_tokens: 1200
        })
      );
      expect(mockOpenAIClient.chat.completions.create).toHaveBeenCalledWith(
        expect.not.objectContaining({
          max_completion_tokens: expect.anything()
        })
      );
    });

    it('should use max_tokens and temperature for GPT-3.5 models', async () => {
      vi.mocked(fsSync.existsSync).mockReturnValue(true);
      vi.mocked(fsSync.readFileSync).mockReturnValue(JSON.stringify({
        openai: {
          apiKey: 'sk-test123',
          model: 'gpt-3.5-turbo',
          temperature: 0.9,
          maxTokens: 500
        }
      }));
      
      service = new OpenAIService();
      await service.query('test prompt');
      
      expect(mockOpenAIClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-3.5-turbo',
          temperature: 0.9,
          max_tokens: 500
        })
      );
      expect(mockOpenAIClient.chat.completions.create).toHaveBeenCalledWith(
        expect.not.objectContaining({
          max_completion_tokens: expect.anything()
        })
      );
    });

    it('should detect reasoning models correctly', async () => {
      const reasoningModels = ['gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'o1', 'o1-mini', 'o1-preview', 'o3', 'o3-mini'];
      
      for (const model of reasoningModels) {
        vi.mocked(fsSync.existsSync).mockReturnValue(true);
        vi.mocked(fsSync.readFileSync).mockReturnValue(JSON.stringify({
          openai: {
            apiKey: 'sk-test123',
            model,
            maxTokens: 1000
          }
        }));
        
        service = new OpenAIService();
        await service.query('test prompt');
        
        expect(mockOpenAIClient.chat.completions.create).toHaveBeenCalledWith(
          expect.objectContaining({
            model,
            max_completion_tokens: 2000
          })
        );
        expect(mockOpenAIClient.chat.completions.create).toHaveBeenCalledWith(
          expect.not.objectContaining({
            temperature: expect.anything()
          })
        );
        
        // Reset mocks for next iteration
        mockOpenAIClient.chat.completions.create.mockClear();
      }
    });

    it('should detect traditional models correctly', async () => {
      const traditionalModels = ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo', 'gpt-3.5-turbo-16k'];
      
      for (const model of traditionalModels) {
        vi.mocked(fsSync.existsSync).mockReturnValue(true);
        vi.mocked(fsSync.readFileSync).mockReturnValue(JSON.stringify({
          openai: {
            apiKey: 'sk-test123',
            model,
            temperature: 0.5,
            maxTokens: 1000
          }
        }));
        
        service = new OpenAIService();
        await service.query('test prompt');
        
        expect(mockOpenAIClient.chat.completions.create).toHaveBeenCalledWith(
          expect.objectContaining({
            model,
            temperature: 0.5,
            max_tokens: 1000
          })
        );
        expect(mockOpenAIClient.chat.completions.create).toHaveBeenCalledWith(
          expect.not.objectContaining({
            max_completion_tokens: expect.anything()
          })
        );
        
        // Reset mocks for next iteration
        mockOpenAIClient.chat.completions.create.mockClear();
      }
    });
  });

  describe('Configuration Info', () => {
    it('should show not configured message when no API key', () => {
      service = new OpenAIService();
      
      const info = service.getConfigInfo();
      expect(info).toContain('OpenAI not configured');
      expect(info).toContain('Set OPENAI_API_KEY environment variable');
    });

    it('should show masked API key when configured', () => {
      process.env.OPENAI_API_KEY = 'sk-1234567890abcdef';
      service = new OpenAIService();
      
      const info = service.getConfigInfo();
      // Strip ANSI codes and normalize whitespace for reliable testing
      // eslint-disable-next-line no-control-regex
      const cleanInfo = info.replace(/\u001b\[[0-9;]*m/g, '').replace(/\s+/g, ' ');

      expect(cleanInfo).toContain('OpenAI Configuration');
      expect(cleanInfo).toContain('sk-12345...cdef');
      expect(cleanInfo).toContain('gpt-4.1');
      expect(cleanInfo).toContain('Temperature: 0.7');
      expect(cleanInfo).toContain('Max Tokens: 1000');
    });

    it('should handle short API keys', () => {
      process.env.OPENAI_API_KEY = 'short';
      service = new OpenAIService();
      
      const info = service.getConfigInfo();
      expect(info).toContain('short...hort');
    });

    it('should show custom configuration values', () => {
      vi.mocked(fsSync.existsSync).mockReturnValue(true);
      vi.mocked(fsSync.readFileSync).mockReturnValue(JSON.stringify({
        openai: {
          apiKey: 'sk-test123',
          model: 'gpt-3.5-turbo',
          temperature: 0.5,
          maxTokens: 2000
        }
      }));
      
      service = new OpenAIService();
      const info = service.getConfigInfo();
      // Strip ANSI codes and normalize whitespace for reliable testing
      // eslint-disable-next-line no-control-regex
      const cleanInfo = info.replace(/\u001b\[[0-9;]*m/g, '').replace(/\s+/g, ' ');

      expect(cleanInfo).toContain('gpt-3.5-turbo');
      expect(cleanInfo).toContain('Temperature: 0.5');
      expect(cleanInfo).toContain('Max Tokens: 2000');
    });
  });

  describe('Save Configuration', () => {
    beforeEach(() => {
      service = new OpenAIService();
    });

    it('should save new configuration to file', async () => {
      vi.mocked(fsSync.existsSync).mockReturnValue(false);
      vi.mocked(fs.writeFile).mockResolvedValue();
      
      await service.saveConfig({
        apiKey: 'sk-new123',
        model: 'gpt-3.5-turbo',
        temperature: 0.8
      });
      
      // SafeConfigFileManager writes to .tmp files first, so check those calls
      expect(fs.writeFile).toHaveBeenCalled();
      const writeFileCalls = (fs.writeFile as vi.Mock).mock.calls;
      const tempFileCall = writeFileCalls.find(call => call[0].includes('.tmp'));
      expect(tempFileCall).toBeDefined();

      const [, payload] = tempFileCall;
      const saved = JSON.parse(payload as string);
      expect(saved.openai).toEqual({
        apiKey: 'sk-new123',
        model: 'gpt-3.5-turbo',
        temperature: 0.8,
        maxTokens: 1000,
        activePreset: 'smart'
      });
    });

    it('should merge with existing configuration file', async () => {
      vi.mocked(fsSync.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        gemini: { apiKey: 'existing-key' },
        other: { setting: 'value' }
      }));
      vi.mocked(fs.writeFile).mockResolvedValue();
      
      await service.saveConfig({ apiKey: 'sk-new123' });
      
      // SafeConfigFileManager writes to .tmp files first, so check those calls
      expect(fs.writeFile).toHaveBeenCalled();
      const writeFileCalls = (fs.writeFile as vi.Mock).mock.calls;
      const tempFileCall = writeFileCalls.find(call => call[0].includes('.tmp'));
      expect(tempFileCall).toBeDefined();

      const [, payload] = tempFileCall;
      const saved = JSON.parse(payload as string);
      expect(saved).toEqual({
        gemini: { apiKey: 'existing-key' },
        other: { setting: 'value' },
        openai: {
          apiKey: 'sk-new123',
          model: 'gpt-4.1',
          temperature: 0.7,
          maxTokens: 1000,
          activePreset: 'smart'
        }
      });
    });

    it('should re-initialize client when API key is updated', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue();
      
      await service.saveConfig({ apiKey: 'sk-new123' });
      
      expect(OpenAI).toHaveBeenCalledWith({ apiKey: 'sk-new123' });
    });

    it('should not re-initialize client when API key is not updated', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue();
      const initialCallCount = vi.mocked(OpenAI).mock.calls.length;
      
      await service.saveConfig({ model: 'gpt-3.5-turbo' });
      
      expect(vi.mocked(OpenAI).mock.calls.length).toBe(initialCallCount);
    });

    it('should handle file read errors during merge', async () => {
      vi.mocked(fsSync.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFile).mockRejectedValue(new Error('Read error'));
      vi.mocked(fs.writeFile).mockResolvedValue();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      // Should not throw, should handle gracefully and log error
      await service.saveConfig({ apiKey: 'sk-new123' });
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle file write errors', async () => {
      vi.mocked(fs.writeFile).mockRejectedValue(new Error('Write error'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      await service.saveConfig({ apiKey: 'sk-new123' });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to save configuration: Failed to update config after 5 attempts: Write error')
      );
      
      consoleSpy.mockRestore();
    });

    it('should handle non-Error exceptions during save', async () => {
      vi.mocked(fs.writeFile).mockRejectedValue('string error');
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      await service.saveConfig({ apiKey: 'sk-new123' });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to save configuration: Failed to update config after 5 attempts: string error')
      );
      
      consoleSpy.mockRestore();
    });

    it('should save configuration successfully without logging', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue();

      await expect(service.saveConfig({ apiKey: 'sk-new123' })).resolves.not.toThrow();
      expect(service.isConfigured()).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle config file with invalid JSON structure', () => {
      vi.mocked(fsSync.existsSync).mockReturnValue(true);
      vi.mocked(fsSync.readFileSync).mockReturnValue('{"invalid": json}');
      
      expect(() => new OpenAIService()).not.toThrow();
    });

    it('should handle missing API key gracefully in all methods', () => {
      service = new OpenAIService();
      
      expect(service.isConfigured()).toBe(false);
      expect(() => service.getConfigInfo()).not.toThrow();
    });

    it('should preserve existing config when partially updating', async () => {
      process.env.OPENAI_API_KEY = 'sk-initial123';
      service = new OpenAIService();
      vi.mocked(fs.writeFile).mockResolvedValue();
      
      await service.saveConfig({ temperature: 0.9 });
      
      // SafeConfigFileManager writes to .tmp files first, so check those calls
      expect(fs.writeFile).toHaveBeenCalled();
      const writeFileCalls = (fs.writeFile as vi.Mock).mock.calls;
      const tempFileCall = writeFileCalls.find(call => call[0].includes('.tmp'));
      expect(tempFileCall).toBeDefined();

      const [, payload] = tempFileCall;
      expect(payload).toContain('"apiKey": "sk-initial123"');
      expect(payload).toContain('"temperature": 0.9');
    });
  });
});