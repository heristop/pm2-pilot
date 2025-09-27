import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ErrorAnalysisService } from '@/services/ErrorAnalysisService.js';
import type { AIProvider } from '@/services/ai-providers/types.js';
import type { LogEntry } from '@/pm2/PM2Client.js';

describe('ErrorAnalysisService', () => {
  let service: ErrorAnalysisService;
  let mockAIProvider: AIProvider;

  beforeEach(() => {
    mockAIProvider = {
      isConfigured: vi.fn().mockReturnValue(true),
      query: vi.fn().mockResolvedValue('{"summary":"AI analysis","rootCause":"Test cause","actionableSuggestions":["Fix it"],"followUpCommands":["restart"],"severity":"high","confidence":0.9}')
    };
    service = new ErrorAnalysisService(mockAIProvider);
  });

  describe('analyzeLogErrors', () => {
    it('should return no errors for empty logs', async () => {
      const result = await service.analyzeLogErrors([]);
      
      expect(result).toEqual({
        hasErrors: false,
        errorCount: 0,
        parsedErrors: []
      });
    });

    it('should return no errors for null/undefined logs', async () => {
      const result = await service.analyzeLogErrors(null as any);
      
      expect(result).toEqual({
        hasErrors: false,
        errorCount: 0,
        parsedErrors: []
      });
    });

    it('should analyze logs with errors when AI is configured', async () => {
      const logs: LogEntry[] = [
        {
          level: 'error',
          message: 'Error [ERR_MODULE_NOT_FOUND]: Cannot find module \'/app/missing.js\'',
          timestamp: '2024-01-01T10:00:00Z',
          process: 'api-server'
        }
      ];

      const result = await service.analyzeLogErrors(logs);

      expect(result.hasErrors).toBe(true);
      expect(result.errorCount).toBe(1);
      expect(result.parsedErrors).toHaveLength(1);
      expect(result.diagnosis).toBeDefined();
      expect(result.quickFix).toBeDefined();
    });

    it('should handle logs with no actual errors', async () => {
      const logs: LogEntry[] = [
        {
          level: 'info',
          message: 'Server started successfully',
          timestamp: '2024-01-01T10:00:00Z',
          process: 'api-server'
        }
      ];

      const result = await service.analyzeLogErrors(logs);

      expect(result.hasErrors).toBe(false);
      expect(result.errorCount).toBe(0);
      expect(result.parsedErrors).toHaveLength(0);
    });

    it('should fall back to pattern matching when AI is not configured', async () => {
      vi.mocked(mockAIProvider.isConfigured).mockReturnValue(false);
      
      const logs: LogEntry[] = [
        {
          level: 'error',
          message: 'TypeError: Cannot read property \'config\' of undefined',
          timestamp: '2024-01-01T10:00:00Z',
          process: 'api-server'
        }
      ];

      const result = await service.analyzeLogErrors(logs);

      expect(result.hasErrors).toBe(true);
      expect(result.diagnosis).toBeDefined();
      expect(result.diagnosis?.summary).toContain('runtime error');
    });

    it('should fall back to pattern matching when AI fails', async () => {
      vi.mocked(mockAIProvider.query).mockRejectedValue(new Error('AI failed'));
      
      const logs: LogEntry[] = [
        {
          level: 'error',
          message: 'Error [ERR_MODULE_NOT_FOUND]: Cannot find module \'/app/missing.js\'',
          timestamp: '2024-01-01T10:00:00Z',
          process: 'api-server'
        }
      ];

      const result = await service.analyzeLogErrors(logs);

      expect(result.hasErrors).toBe(true);
      expect(result.diagnosis).toBeDefined();
      expect(result.diagnosis?.summary).toContain('Module or file not found');
    });
  });

  describe('error detection and parsing', () => {
    it('should detect error messages by level', async () => {
      const logs: LogEntry[] = [
        {
          level: 'error',
          message: 'Something went wrong',
          timestamp: '2024-01-01T10:00:00Z',
          process: 'test'
        }
      ];

      const result = await service.analyzeLogErrors(logs);
      expect(result.parsedErrors).toHaveLength(1);
    });

    it('should detect error messages by content patterns', async () => {
      const errorMessages = [
        'error occurred',
        'exception thrown',
        'failed to connect',
        'cannot access file',
        'unable to process',
        'not found',
        'ECONNREFUSED',
        'ENOTFOUND',
        'EACCES',
        'ETIMEDOUT',
        'ERR_MODULE_NOT_FOUND',
        'TypeError: something',
        'ReferenceError: variable',
        'SyntaxError: invalid',
        'UnhandledPromiseRejectionWarning'
      ];

      for (const message of errorMessages) {
        const logs: LogEntry[] = [
          {
            level: 'info',
            message,
            timestamp: '2024-01-01T10:00:00Z',
            process: 'test'
          }
        ];

        const result = await service.analyzeLogErrors(logs);
        expect(result.parsedErrors).toHaveLength(1);
      }
    });
  });

  describe('error type extraction', () => {
    const testCases = [
      { message: 'Error [ERR_MODULE_NOT_FOUND]: Cannot find module', expected: 'Module Not Found' },
      { message: 'connect ECONNREFUSED 127.0.0.1:3000', expected: 'Connection Refused' },
      { message: 'getaddrinfo ENOTFOUND localhost', expected: 'Host Not Found' },
      { message: 'open EACCES /restricted/file', expected: 'Permission Denied' },
      { message: 'connect ETIMEDOUT', expected: 'Connection Timeout' },
      { message: 'TypeError: Cannot read property', expected: 'Type Error' },
      { message: 'ReferenceError: variable is not defined', expected: 'Reference Error' },
      { message: 'SyntaxError: Unexpected token', expected: 'Syntax Error' },
      { message: 'UnhandledPromiseRejectionWarning: Error', expected: 'Unhandled Promise Rejection' },
      { message: 'MaxListenersExceededWarning: Possible EventEmitter memory leak', expected: 'Memory Leak Warning' },
      { message: 'Error: Cannot find module "missing"', expected: 'Missing Module' },
      { message: 'CustomError: Something went wrong', expected: 'CustomError' },
      { message: 'Unknown error occurred', expected: 'Runtime Error' }
    ];

    testCases.forEach(({ message, expected }) => {
      it(`should extract "${expected}" from "${message}"`, async () => {
        const logs: LogEntry[] = [
          {
            level: 'error',
            message,
            timestamp: '2024-01-01T10:00:00Z',
            process: 'test'
          }
        ];

        const result = await service.analyzeLogErrors(logs);
        expect(result.parsedErrors[0]?.type).toBe(expected);
      });
    });
  });

  describe('file path extraction', () => {
    const testCases = [
      { message: 'Cannot find module \'/app/server.js\'', expected: '/app/server.js' },
      { message: 'Error in "./src/utils.ts"', expected: './src/utils.ts' },
      { message: 'at file:///home/user/app.mjs', expected: 'home/user/app.mjs' },
      { message: 'at /workspace/src/index.js:45:12', expected: undefined },
      { message: 'Error loading config.json file', expected: 'config.js' },
      { message: 'No file path in this message', expected: undefined }
    ];

    testCases.forEach(({ message, expected }) => {
      it(`should extract file path "${expected}" from "${message}"`, async () => {
        const logs: LogEntry[] = [
          {
            level: 'error',
            message,
            timestamp: '2024-01-01T10:00:00Z',
            process: 'test'
          }
        ];

        const result = await service.analyzeLogErrors(logs);
        expect(result.parsedErrors[0]?.filePath).toBe(expected);
      });
    });
  });

  describe('line number extraction', () => {
    it('should extract line numbers from stack traces', async () => {
      const logs: LogEntry[] = [
        {
          level: 'error',
          message: 'Error at /app/server.js:45:12',
          timestamp: '2024-01-01T10:00:00Z',
          process: 'test'
        }
      ];

      const result = await service.analyzeLogErrors(logs);
      expect(result.parsedErrors[0]?.lineNumber).toBe(45);
    });

    it('should return undefined when no line number found', async () => {
      const logs: LogEntry[] = [
        {
          level: 'error',
          message: 'Error with no line number',
          timestamp: '2024-01-01T10:00:00Z',
          process: 'test'
        }
      ];

      const result = await service.analyzeLogErrors(logs);
      expect(result.parsedErrors[0]?.lineNumber).toBeUndefined();
    });
  });

  describe('stack trace extraction', () => {
    it('should extract stack traces from multiline errors', async () => {
      const logs: LogEntry[] = [
        {
          level: 'error',
          message: 'TypeError: Cannot read property\n    at Object.<anonymous> (/app/server.js:10:5)\n    at Module._compile (module.js:456:26)',
          timestamp: '2024-01-01T10:00:00Z',
          process: 'test'
        }
      ];

      const result = await service.analyzeLogErrors(logs);
      expect(result.parsedErrors[0]?.stackTrace).toContain('at Object.<anonymous>');
      expect(result.parsedErrors[0]?.stackTrace).toContain('at Module._compile');
    });

    it('should return undefined when no stack trace found', async () => {
      const logs: LogEntry[] = [
        {
          level: 'error',
          message: 'Simple error message',
          timestamp: '2024-01-01T10:00:00Z',
          process: 'test'
        }
      ];

      const result = await service.analyzeLogErrors(logs);
      expect(result.parsedErrors[0]?.stackTrace).toBeUndefined();
    });
  });

  describe('severity determination', () => {
    const severityTests = [
      { message: 'Error [ERR_MODULE_NOT_FOUND]: Cannot find module', expected: 'critical' },
      { message: 'SyntaxError: Unexpected token', expected: 'critical' },
      { message: 'TypeError: Cannot read property', expected: 'high' },
      { message: 'ReferenceError: variable is not defined', expected: 'high' },
      { message: 'connect ECONNREFUSED', expected: 'high' },
      { message: 'open EACCES /file', expected: 'high' },
      { message: 'connect ETIMEDOUT', expected: 'medium' },
      { message: 'getaddrinfo ENOTFOUND', expected: 'medium' },
      { message: 'UnhandledPromiseRejectionWarning', expected: 'medium' },
      { message: 'MaxListenersExceededWarning', expected: 'low' },
      { message: 'Unknown error', expected: 'medium' }
    ];

    severityTests.forEach(({ message, expected }) => {
      it(`should determine severity "${expected}" for "${message}"`, async () => {
        const logs: LogEntry[] = [
          {
            level: 'error',
            message,
            timestamp: '2024-01-01T10:00:00Z',
            process: 'test'
          }
        ];

        const result = await service.analyzeLogErrors(logs);
        expect(result.parsedErrors[0]?.severity).toBe(expected);
      });
    });
  });

  describe('error categorization', () => {
    const categoryTests = [
      { message: 'Error [ERR_MODULE_NOT_FOUND]: Cannot find module', expected: 'module' },
      { message: 'SyntaxError: Unexpected token', expected: 'syntax' },
      { message: 'connect ECONNREFUSED', expected: 'network' },
      { message: 'getaddrinfo ENOTFOUND', expected: 'other' },
      { message: 'open EACCES /file', expected: 'permission' },
      { message: 'TypeError: Cannot read property', expected: 'runtime' },
      { message: 'ReferenceError: variable is not defined', expected: 'runtime' },
      { message: 'MaxListenersExceededWarning', expected: 'resource' },
      { message: 'Unknown error type', expected: 'other' }
    ];

    categoryTests.forEach(({ message, expected }) => {
      it(`should categorize "${message}" as "${expected}"`, async () => {
        const logs: LogEntry[] = [
          {
            level: 'error',
            message,
            timestamp: '2024-01-01T10:00:00Z',
            process: 'test'
          }
        ];

        const result = await service.analyzeLogErrors(logs);
        expect(result.parsedErrors[0]?.category).toBe(expected);
      });
    });
  });

  describe('error context extraction', () => {
    it('should extract import context', async () => {
      const logs: LogEntry[] = [
        {
          level: 'error',
          message: 'Error [ERR_MODULE_NOT_FOUND]: Cannot find module imported from /app/server.js',
          timestamp: '2024-01-01T10:00:00Z',
          process: 'test'
        }
      ];

      const result = await service.analyzeLogErrors(logs);
      expect(result.parsedErrors[0]?.context).toContain('Error occurred while importing');
    });

    it('should extract function context', async () => {
      const logs: LogEntry[] = [
        {
          level: 'error',
          message: 'TypeError: Cannot read property\n    at myFunction (/app/server.js:10:5)',
          timestamp: '2024-01-01T10:00:00Z',
          process: 'test'
        }
      ];

      const result = await service.analyzeLogErrors(logs);
      expect(result.parsedErrors[0]?.context).toContain('myFunction');
    });

    it('should truncate long messages', async () => {
      const longMessage = 'Error: ' + 'x'.repeat(200);
      const logs: LogEntry[] = [
        {
          level: 'error',
          message: longMessage,
          timestamp: '2024-01-01T10:00:00Z',
          process: 'test'
        }
      ];

      const result = await service.analyzeLogErrors(logs);
      expect(result.parsedErrors[0]?.context.length).toBeLessThanOrEqual(103); // 100 + '...'
    });
  });

  describe('AI diagnosis', () => {
    it('should parse valid JSON response from AI', async () => {
      const aiResponse = '{"summary":"Test summary","rootCause":"Test cause","actionableSuggestions":["Fix 1","Fix 2"],"followUpCommands":["restart"],"severity":"high","confidence":0.9}';
      vi.mocked(mockAIProvider.query).mockResolvedValue(aiResponse);

      const logs: LogEntry[] = [
        {
          level: 'error',
          message: 'Test error',
          timestamp: '2024-01-01T10:00:00Z',
          process: 'test'
        }
      ];

      const result = await service.analyzeLogErrors(logs);
      
      expect(result.diagnosis?.summary).toBe('Test summary');
      expect(result.diagnosis?.rootCause).toBe('Test cause');
      expect(result.diagnosis?.actionableSuggestions).toEqual(['Fix 1', 'Fix 2']);
      expect(result.diagnosis?.followUpCommands).toEqual(['restart']);
      expect(result.diagnosis?.severity).toBe('high');
      expect(result.diagnosis?.confidence).toBe(0.9);
    });

    it('should handle JSON response with code blocks', async () => {
      const aiResponse = '```json\n{"summary":"Test","rootCause":"Cause","actionableSuggestions":[],"followUpCommands":[],"severity":"medium","confidence":0.8}\n```';
      vi.mocked(mockAIProvider.query).mockResolvedValue(aiResponse);

      const logs: LogEntry[] = [
        {
          level: 'error',
          message: 'Test error',
          timestamp: '2024-01-01T10:00:00Z',
          process: 'test'
        }
      ];

      const result = await service.analyzeLogErrors(logs);
      expect(result.diagnosis?.summary).toBe('Test');
    });

    it('should fall back when AI response is invalid JSON', async () => {
      vi.mocked(mockAIProvider.query).mockResolvedValue('Invalid JSON response');

      const logs: LogEntry[] = [
        {
          level: 'error',
          message: 'Error [ERR_MODULE_NOT_FOUND]: Cannot find module',
          timestamp: '2024-01-01T10:00:00Z',
          process: 'test'
        }
      ];

      const result = await service.analyzeLogErrors(logs);
      expect(result.diagnosis?.summary).toContain('Module or file not found');
    });
  });

  describe('fallback diagnosis', () => {
    beforeEach(() => {
      vi.mocked(mockAIProvider.isConfigured).mockReturnValue(false);
    });

    it('should provide module error diagnosis', async () => {
      const logs: LogEntry[] = [
        {
          level: 'error',
          message: 'Error [ERR_MODULE_NOT_FOUND]: Cannot find module',
          timestamp: '2024-01-01T10:00:00Z',
          process: 'test'
        }
      ];

      const result = await service.analyzeLogErrors(logs);
      const diagnosis = result.diagnosis!;
      
      expect(diagnosis.summary).toContain('Module or file not found');
      expect(diagnosis.severity).toBe('critical');
      expect(diagnosis.actionableSuggestions).toContain('Check if the referenced file exists at the specified path');
    });

    it('should provide network error diagnosis', async () => {
      const logs: LogEntry[] = [
        {
          level: 'error',
          message: 'connect ECONNREFUSED 127.0.0.1:3000',
          timestamp: '2024-01-01T10:00:00Z',
          process: 'test'
        }
      ];

      const result = await service.analyzeLogErrors(logs);
      const diagnosis = result.diagnosis!;
      
      expect(diagnosis.summary).toContain('Network connectivity issue');
      expect(diagnosis.severity).toBe('high');
      expect(diagnosis.actionableSuggestions).toContain('Check if the target service is running and accessible');
    });

    it('should provide permission error diagnosis', async () => {
      const logs: LogEntry[] = [
        {
          level: 'error',
          message: 'open EACCES /restricted/file',
          timestamp: '2024-01-01T10:00:00Z',
          process: 'test'
        }
      ];

      const result = await service.analyzeLogErrors(logs);
      const diagnosis = result.diagnosis!;
      
      expect(diagnosis.summary).toContain('Permission or access denied');
      expect(diagnosis.severity).toBe('high');
      expect(diagnosis.actionableSuggestions).toContain('Check file and directory permissions');
    });

    it('should provide generic runtime error diagnosis', async () => {
      const logs: LogEntry[] = [
        {
          level: 'error',
          message: 'Unknown runtime error',
          timestamp: '2024-01-01T10:00:00Z',
          process: 'test'
        }
      ];

      const result = await service.analyzeLogErrors(logs);
      const diagnosis = result.diagnosis!;
      
      expect(diagnosis.summary).toContain('Application runtime error detected');
      expect(diagnosis.actionableSuggestions).toContain('Review application code for the reported error');
    });
  });

  describe('quick fix generation', () => {
    it('should generate AI-based quick fix when configured', async () => {
      vi.mocked(mockAIProvider.query).mockResolvedValueOnce('{"summary":"","rootCause":"","actionableSuggestions":[],"followUpCommands":[],"severity":"medium","confidence":0.8}');
      vi.mocked(mockAIProvider.query).mockResolvedValueOnce('"Check if file exists: /app/missing.js"');

      const logs: LogEntry[] = [
        {
          level: 'error',
          message: 'Error [ERR_MODULE_NOT_FOUND]: Cannot find module \'/app/missing.js\'',
          timestamp: '2024-01-01T10:00:00Z',
          process: 'test'
        }
      ];

      const result = await service.analyzeLogErrors(logs);
      expect(result.quickFix).toBe('Check if file exists: /app/missing.js');
    });

    it('should fall back to pattern-based quick fix when AI fails', async () => {
      vi.mocked(mockAIProvider.query).mockResolvedValueOnce('{"summary":"","rootCause":"","actionableSuggestions":[],"followUpCommands":[],"severity":"medium","confidence":0.8}');
      vi.mocked(mockAIProvider.query).mockRejectedValueOnce(new Error('AI failed'));

      const logs: LogEntry[] = [
        {
          level: 'error',
          message: 'Error [ERR_MODULE_NOT_FOUND]: Cannot find module \'/app/missing.js\'',
          timestamp: '2024-01-01T10:00:00Z',
          process: 'test'
        }
      ];

      const result = await service.analyzeLogErrors(logs);
      expect(result.quickFix).toBe('Check if file exists: /app/missing.js');
    });

    it('should provide fallback diagnosis for different error categories', async () => {
      vi.mocked(mockAIProvider.isConfigured).mockReturnValue(false);

      const testCases = [
        { message: 'Error [ERR_MODULE_NOT_FOUND]: Cannot find module', expectedCategory: 'module' },
        { message: 'connect ECONNREFUSED', expectedCategory: 'network' },
        { message: 'open EACCES /file', expectedCategory: 'permission' },
        { message: 'SyntaxError: Unexpected token at line 45', expectedCategory: 'syntax' },
        { message: 'Unknown error', expectedCategory: 'other' }
      ];

      for (const { message, expectedCategory } of testCases) {
        const logs: LogEntry[] = [
          {
            level: 'error',
            message,
            timestamp: '2024-01-01T10:00:00Z',
            process: 'test'
          }
        ];

        const result = await service.analyzeLogErrors(logs);
        expect(result.parsedErrors[0]?.category).toBe(expectedCategory);
        expect(result.diagnosis).toBeDefined();
      }
    });

    it('should provide diagnosis for syntax errors with file path and line number', async () => {
      vi.mocked(mockAIProvider.isConfigured).mockReturnValue(false);

      const logs: LogEntry[] = [
        {
          level: 'error',
          message: 'SyntaxError: Unexpected token at /app/server.js:45:12',
          timestamp: '2024-01-01T10:00:00Z',
          process: 'test'
        }
      ];

      const result = await service.analyzeLogErrors(logs);
      expect(result.diagnosis).toBeDefined();
      expect(result.parsedErrors[0]?.lineNumber).toBe(45);
    });
  });

  describe('error sorting', () => {
    it('should sort errors by timestamp (newest first)', async () => {
      const logs: LogEntry[] = [
        {
          level: 'error',
          message: 'Older error',
          timestamp: '2024-01-01T09:00:00Z',
          process: 'test'
        },
        {
          level: 'error',
          message: 'Newer error',
          timestamp: '2024-01-01T11:00:00Z',
          process: 'test'
        },
        {
          level: 'error',
          message: 'Middle error',
          timestamp: '2024-01-01T10:00:00Z',
          process: 'test'
        }
      ];

      const result = await service.analyzeLogErrors(logs);
      
      expect(result.parsedErrors[0]?.message).toBe('Newer error');
      expect(result.parsedErrors[1]?.message).toBe('Middle error');
      expect(result.parsedErrors[2]?.message).toBe('Older error');
    });
  });
});