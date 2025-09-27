import { vi } from 'vitest';

// Mock OpenAI class
export default class OpenAI {
  constructor(_config: any) {
    // Mock constructor
  }

  chat = {
    completions: {
      create: vi.fn().mockResolvedValue({
        choices: [{
          message: {
            content: 'Mock AI response: The process appears to be running normally with good performance metrics.'
          }
        }]
      })
    }
  };
}