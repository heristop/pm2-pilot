import { vi } from 'vitest';

export const __esModule = true;
export const access = vi.fn().mockResolvedValue(undefined);
export const readFile = vi.fn().mockResolvedValue('{}');
export const writeFile = vi.fn().mockResolvedValue(undefined);
export const unlink = vi.fn().mockResolvedValue(undefined);

export default {
  access,
  readFile,
  writeFile,
  unlink
};
