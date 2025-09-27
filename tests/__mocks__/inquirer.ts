import { vi } from 'vitest';

// Mock inquirer module
export default {
  prompt: vi.fn().mockImplementation((questions) => {
    // Default responses for common prompts
    const defaultResponses: Record<string, any> = {
      confirm: true,
      input: 'test-input',
      choice: 'test-choice'
    };
    
    if (Array.isArray(questions)) {
      const responses: Record<string, any> = {};
      questions.forEach((question: any) => {
        responses[question.name] = defaultResponses[question.type] || question.default || '';
      });
      return Promise.resolve(responses);
    }
    
    return Promise.resolve(defaultResponses);
  })
};