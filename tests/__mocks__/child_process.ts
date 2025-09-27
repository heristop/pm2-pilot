import { vi } from 'vitest';

export const exec = vi.fn((command: string, callback?: (error: Error | null, result: { stdout: string; stderr: string }) => void) => {
  callback?.(null, { stdout: '', stderr: '' });
  return {} as unknown as import('child_process').ChildProcess;
});

export default {
  exec
};
