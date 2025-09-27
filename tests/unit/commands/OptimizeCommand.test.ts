import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OptimizeCommand } from '@/commands/OptimizeCommand.js';
import type { Shell } from '@/shell/Shell.js';
import type { AIProvider } from '@/services/ai-providers/types.js';

describe('OptimizeCommand', () => {
  let shell: Shell;
  let command: OptimizeCommand;

  beforeEach(() => {
    shell = global.testUtils.mockShell() as Shell;
    command = new OptimizeCommand(shell);
    vi.mocked(console.log).mockClear();
    vi.mocked(console.error).mockClear();
    
    // Reset any previous factory mocks
    vi.clearAllMocks();
  });

  it('requires AI configuration', async () => {
    const aiStub: Pick<AIProvider, 'isConfigured' | 'query'> = {
      isConfigured: () => false,
      query: vi.fn()
    };
    
    // Mock the factory to return our stub
    const mockFactory = { getProvider: vi.fn().mockReturnValue(aiStub) };
    (command as any).aiProviderFactory = mockFactory;

    await command.execute([]);

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('❌ AI service not configured'));
  });

  it('requests optimization suggestions', async () => {
    const query = vi.fn().mockResolvedValue('High Priority:\n• Restart pm2');
    const buildProcessContext = vi.fn().mockResolvedValue('context');

    const aiStub: Pick<AIProvider, 'isConfigured' | 'query'> = {
      isConfigured: () => true,
      query
    };
    
    // Mock the factory to return our stub
    const mockFactory = { getProvider: vi.fn().mockReturnValue(aiStub) };
    (command as any).aiProviderFactory = mockFactory;
    (command as any).contextBuilder = { buildProcessContext };

    await command.execute(['api']);

    expect(buildProcessContext).toHaveBeenCalledWith('api');
    expect(query).toHaveBeenCalledWith(expect.stringContaining('Analyze the PM2 process "api"'), 'context');
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Optimization Recommendations'));

    vi.mocked(console.log).mockClear();
    (command as any).formatOptimizationResponse('High Priority:\n• Step\n\npm2 restart app');
    expect(console.log).toHaveBeenCalled();
  });

  it('handles optimization failures', async () => {
    const aiStub: Pick<AIProvider, 'isConfigured' | 'query'> = {
      isConfigured: () => true,
      query: vi.fn().mockRejectedValue(new Error('boom'))
    };
    
    // Mock the factory to return our stub
    const mockFactory = { getProvider: vi.fn().mockReturnValue(aiStub) };
    (command as any).aiProviderFactory = mockFactory;
    (command as any).contextBuilder = { buildProcessContext: vi.fn().mockResolvedValue('ctx') };

    await command.execute([]);

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Optimization analysis failed'));
  });
});
