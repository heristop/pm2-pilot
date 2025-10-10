import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

describe('generate-version script', () => {
  const tempDir = path.resolve(__dirname, 'temp');
  const packageJsonPath = path.resolve(tempDir, 'package.json');
  const versionTsPath = path.resolve(tempDir, 'src', 'version.ts');
  const scriptPath = path.resolve(__dirname, '../../../scripts/generate-version.cjs');

  beforeAll(async () => {
    await fs.mkdir(tempDir, { recursive: true });
    await fs.mkdir(path.resolve(tempDir, 'src'), { recursive: true });
    const packageJsonContent = JSON.stringify({ version: '1.2.3' });
    await fs.writeFile(packageJsonPath, packageJsonContent);
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should create version.ts with the correct version from package.json', async () => {
    execSync(`node ${scriptPath}`, { cwd: tempDir });

    const versionTsContent = await fs.readFile(versionTsPath, 'utf-8');
    expect(versionTsContent).toBe("export const VERSION = '1.2.3';\n");
  });
});
