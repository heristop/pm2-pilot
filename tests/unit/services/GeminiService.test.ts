import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GeminiService } from '@/services/ai-providers/GeminiService.js';
import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import { Loader } from '@/utils/Loader.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

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

vi.mock('os', () => ({
  homedir: vi.fn().mockReturnValue('/home/user')
}));

const createMockGeminiResponse = (text: string) => ({
  response: {
    text: () => text
  }
});

const createMockChat = (response: string) => ({
  sendMessage: vi.fn().mockResolvedValue(createMockGeminiResponse(response))
});

const createMockGeminiModel = (response: string) => ({
  generateContent: vi.fn().mockResolvedValue(createMockGeminiResponse(response)),
  startChat: vi.fn().mockReturnValue(createMockChat(response))
});

const createMockGoogleAI = (response: string) => ({
  getGenerativeModel: vi.fn().mockReturnValue(createMockGeminiModel(response))
});

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn(),
  HarmCategory: {
    HARM_CATEGORY_HARASSMENT: 'harassment',
    HARM_CATEGORY_HATE_SPEECH: 'hate_speech'
  },
  HarmBlockThreshold: {
    BLOCK_ONLY_HIGH: 'block_only_high'
  }
}));

describe('GeminiService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    vi.mocked(fsSync.existsSync).mockReturnValue(false);
    vi.mocked(fsSync.readFileSync).mockReturnValue('{}');
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue('{}');
    vi.mocked(fs.rename).mockResolvedValue(undefined);
    vi.mocked(fs.unlink).mockResolvedValue(undefined);
    vi.spyOn(Loader.prototype, 'start').mockImplementation(() => {});
    vi.spyOn(Loader.prototype, 'stop').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('is not configured when no API key is provided', () => {
    const service = new GeminiService();
    expect(service.isConfigured()).toBe(false);
  });

  it('initializes GoogleGenerativeAI client when API key exists', () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    const mockClient = createMockGoogleAI('hello');
    const GoogleAIMock = vi.mocked(GoogleGenerativeAI);
    GoogleAIMock.mockImplementation(() => mockClient as unknown as GoogleGenerativeAI);

    const service = new GeminiService();

    expect(service.isConfigured()).toBe(true);
    expect(GoogleGenerativeAI).toHaveBeenCalledWith('test-gemini-key');
  });

  it('loads configuration from config file', () => {
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fsSync.readFileSync).mockReturnValue(JSON.stringify({
      gemini: {
        apiKey: 'file-key',
        model: 'gemini-2.5-flash-lite',
        temperature: 0.5,
        maxTokens: 2000
      }
    }));

    const service = new GeminiService();
    expect(service.isConfigured()).toBe(true);
  });

  it('prioritizes environment variable over config file', () => {
    process.env.GEMINI_API_KEY = 'env-key';
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fsSync.readFileSync).mockReturnValue(JSON.stringify({
      gemini: {
        apiKey: 'file-key',
        model: 'gemini-2.5-flash-lite'
      }
    }));

    const mockClient = createMockGoogleAI('response');
    const GoogleAIMock = vi.mocked(GoogleGenerativeAI);
    GoogleAIMock.mockImplementation(() => mockClient as unknown as GoogleGenerativeAI);

    new GeminiService();

    expect(GoogleGenerativeAI).toHaveBeenCalledWith('env-key');
  });

  it('saves configuration to file with gemini section', async () => {
    process.env.GEMINI_API_KEY = 'env-key';
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
      provider: 'openai',
      openai: { model: 'gpt-4' }
    }));

    const service = new GeminiService();

    await service.saveConfig({ 
      apiKey: 'new-key',
      temperature: 0.8,
      maxTokens: 1500
    });

    expect(fs.writeFile).toHaveBeenCalled();

    // SafeConfigFileManager writes to .tmp files first, so we need to check those calls
    const writeFileCalls = (fs.writeFile as vi.Mock).mock.calls;
    const tempFileCall = writeFileCalls.find(call => call[0].includes('.tmp'));
    expect(tempFileCall).toBeDefined();

    const [, payload] = tempFileCall;
    const saved = JSON.parse(payload as string);

    expect(saved.gemini).toEqual({
      apiKey: 'new-key',
      model: 'gemini-2.5-flash-lite',
      temperature: 0.8,
      maxTokens: 1500
    });
    expect(saved.provider).toBe('openai'); // Should preserve other config
    expect(saved.openai).toEqual({ model: 'gpt-4' }); // Should preserve other providers
  });

  it('returns informative configuration summary when configured', () => {
    process.env.GEMINI_API_KEY = 'fake_test_key_12345678901234567890';
    const service = new GeminiService();

    const info = service.getConfigInfo();
    // Strip ANSI codes and normalize whitespace for reliable testing
    // eslint-disable-next-line no-control-regex
    const cleanInfo = info.replace(/\u001b\[[0-9;]*m/g, '').replace(/\s+/g, ' ');

    expect(cleanInfo).toContain('Gemini AI Configuration:');
    expect(cleanInfo).toContain('gemini-2.5-flash-lite');
    expect(cleanInfo).toContain('API Key:');
    expect(cleanInfo).toContain('...');
    expect(cleanInfo).toContain('Temperature: 0.7');
    expect(cleanInfo).toContain('Max Tokens: 1000');
  });

  it('returns not configured message when no API key', () => {
    const service = new GeminiService();

    const info = service.getConfigInfo();
    expect(info).toContain('Gemini AI not configured');
    expect(info).toContain('Set GEMINI_API_KEY environment variable');
  });

  it('throws descriptive error when API key missing during query', async () => {
    const service = new GeminiService();
    await expect(service.query('hello')).rejects.toThrow(
      'Gemini API is not configured. Please set GEMINI_API_KEY environment variable.'
    );
  });

  it('executes query with proper model configuration', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const mockModel = createMockGeminiModel('AI response');
    const mockClient = {
      getGenerativeModel: vi.fn().mockReturnValue(mockModel)
    };
    const GoogleAIMock = vi.mocked(GoogleGenerativeAI);
    GoogleAIMock.mockImplementation(() => mockClient as unknown as GoogleGenerativeAI);

    const service = new GeminiService();
    const result = await service.query('test question');

    expect(result).toBe('AI response');
    expect(mockClient.getGenerativeModel).toHaveBeenCalledWith({
      model: 'gemini-2.5-flash-lite',
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1000
      },
      safetySettings: [
        {
          category: 'harassment',
          threshold: 'block_only_high'
        },
        {
          category: 'hate_speech',
          threshold: 'block_only_high'
        }
      ],
      systemInstruction: expect.any(String)
    });
    expect(mockModel.startChat).toHaveBeenCalledWith({ history: [] });
    expect(mockModel.startChat().sendMessage).toHaveBeenCalledWith('test question');
  });

  it('includes context in prompt when provided', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const mockModel = createMockGeminiModel('AI response');
    const mockClient = {
      getGenerativeModel: vi.fn().mockReturnValue(mockModel)
    };
    const GoogleAIMock = vi.mocked(GoogleGenerativeAI);
    GoogleAIMock.mockImplementation(() => mockClient as unknown as GoogleGenerativeAI);

    const service = new GeminiService();
    await service.query('test question', 'PM2 processes: app1, app2');

    expect(mockModel.startChat().sendMessage).toHaveBeenCalledWith(
      'Context:\nPM2 processes: app1, app2\n\nQuestion: test question'
    );
  });

  it('uses custom model and temperature from config', async () => {
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fsSync.readFileSync).mockReturnValue(JSON.stringify({
      gemini: {
        apiKey: 'config-key',
        model: 'gemini-pro-vision',
        temperature: 0.9,
        maxTokens: 2048
      }
    }));

    const mockModel = createMockGeminiModel('custom response');
    const mockClient = {
      getGenerativeModel: vi.fn().mockReturnValue(mockModel)
    };
    const GoogleAIMock = vi.mocked(GoogleGenerativeAI);
    GoogleAIMock.mockImplementation(() => mockClient as unknown as GoogleGenerativeAI);

    const service = new GeminiService();
    await service.query('test');

    expect(mockClient.getGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-pro-vision',
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens: 2048
        },
        systemInstruction: expect.any(String)
      })
    );
  });

  it('handles Gemini API errors with descriptive messages', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const mockChat = {
      sendMessage: vi.fn().mockRejectedValue(new Error('quota exceeded'))
    };
    const mockModel = {
      generateContent: vi.fn().mockRejectedValue(new Error('quota exceeded')),
      startChat: vi.fn().mockReturnValue(mockChat)
    };
    const mockClient = {
      getGenerativeModel: vi.fn().mockReturnValue(mockModel)
    };
    const GoogleAIMock = vi.mocked(GoogleGenerativeAI);
    GoogleAIMock.mockImplementation(() => mockClient as unknown as GoogleGenerativeAI);

    const service = new GeminiService();

    await expect(service.query('test')).rejects.toThrow('Gemini API error: quota exceeded');
  });

  it('uses Loader for query progress indication', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const mockModel = createMockGeminiModel('response');
    const mockClient = {
      getGenerativeModel: vi.fn().mockReturnValue(mockModel)
    };
    const GoogleAIMock = vi.mocked(GoogleGenerativeAI);
    GoogleAIMock.mockImplementation(() => mockClient as unknown as GoogleGenerativeAI);

    const startSpy = vi.spyOn(Loader.prototype, 'start');
    const stopSpy = vi.spyOn(Loader.prototype, 'stop');

    const service = new GeminiService();
    await service.query('test');

    expect(startSpy).toHaveBeenCalledWith({ message: 'Thinking...', context: 'query' });
    expect(stopSpy).toHaveBeenCalled();
  });

  it('stops loader on error', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const mockChat = {
      sendMessage: vi.fn().mockRejectedValue(new Error('test error'))
    };
    const mockModel = {
      generateContent: vi.fn().mockRejectedValue(new Error('test error')),
      startChat: vi.fn().mockReturnValue(mockChat)
    };
    const mockClient = {
      getGenerativeModel: vi.fn().mockReturnValue(mockModel)
    };
    const GoogleAIMock = vi.mocked(GoogleGenerativeAI);
    GoogleAIMock.mockImplementation(() => mockClient as unknown as GoogleGenerativeAI);

    const stopSpy = vi.spyOn(Loader.prototype, 'stop');

    const service = new GeminiService();
    
    await expect(service.query('test')).rejects.toThrow();
    expect(stopSpy).toHaveBeenCalled();
  });
});