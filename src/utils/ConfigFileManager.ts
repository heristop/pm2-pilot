import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';

export interface ConfigFileManager {
  readConfig<T = Record<string, unknown>>(): Promise<T>;
  writeConfig<T = Record<string, unknown>>(config: T): Promise<void>;
  updateConfig<T = Record<string, unknown>>(updater: (config: T) => T): Promise<void>;
}

export class SafeConfigFileManager implements ConfigFileManager {
  private readonly lockFile: string;
  private readonly tempFile: string;
  private readonly maxRetries = 5;
  private readonly baseDelay = 100; // ms

  constructor(private readonly configFile: string) {
    this.lockFile = `${configFile}.lock`;
    this.tempFile = `${configFile}.tmp`;
  }

  async readConfig<T = Record<string, unknown>>(): Promise<T> {
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        // Wait for any existing lock to be released
        await this.waitForLockRelease();

        if (!existsSync(this.configFile)) {
          return {} as T;
        }

        const content = await fs.readFile(this.configFile, 'utf-8');
        
        // Validate JSON before parsing
        if (!content.trim()) {
          return {} as T;
        }

        try {
          const parsed = JSON.parse(content);
          if (typeof parsed === 'object' && parsed !== null) {
            return parsed as T;
          }
        } catch {
          // JSON is corrupted, attempt recovery
          console.warn(`Config file corrupted, attempting recovery (attempt ${attempt + 1})`);
          
          if (attempt === this.maxRetries - 1) {
            // Last attempt: return empty config
            console.warn('Config file recovery failed, starting with empty configuration');
            return {} as T;
          }
          
          // Wait before retry
          await this.delay(this.baseDelay * Math.pow(2, attempt));
          continue;
        }
      } catch (error) {
        if (attempt === this.maxRetries - 1) {
          console.error(`Failed to read config after ${this.maxRetries} attempts:`, error);
          return {} as T;
        }
        
        // Wait before retry
        await this.delay(this.baseDelay * Math.pow(2, attempt));
      }
    }

    return {} as T;
  }

  async writeConfig<T = Record<string, unknown>>(config: T): Promise<void> {
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        await this.acquireLock();
        
        try {
          // Validate config before writing
          if (typeof config !== 'object' || config === null) {
            throw new Error('Invalid config object');
          }

          // Serialize and validate JSON
          const serialized = JSON.stringify(config, null, 2);
          JSON.parse(serialized); // Validate it can be parsed back

          // Atomic write: write to temp file first
          await fs.writeFile(this.tempFile, serialized, 'utf-8');
          
          // Verify temp file was written correctly
          const verification = await fs.readFile(this.tempFile, 'utf-8');
          JSON.parse(verification); // Ensure it's valid JSON

          // Atomically move temp file to actual config file
          await fs.rename(this.tempFile, this.configFile);
          
          return; // Success
        } finally {
          await this.releaseLock();
        }
      } catch (error) {
        // Clean up temp file if it exists
        try {
          await fs.unlink(this.tempFile);
        } catch {
          // Ignore cleanup errors
        }

        if (attempt === this.maxRetries - 1) {
          throw new Error(`Failed to write config after ${this.maxRetries} attempts: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        // Wait before retry
        await this.delay(this.baseDelay * Math.pow(2, attempt));
      }
    }
  }

  async updateConfig<T = Record<string, unknown>>(updater: (config: T) => T): Promise<void> {
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        await this.acquireLock();
        
        try {
          // Read current config
          const currentConfig = await this.readConfigUnsafe<T>();
          
          // Apply update
          const updatedConfig = updater(currentConfig);
          
          // Write updated config
          await this.writeConfigUnsafe(updatedConfig);
          
          return; // Success
        } finally {
          await this.releaseLock();
        }
      } catch (error) {
        if (attempt === this.maxRetries - 1) {
          throw new Error(`Failed to update config after ${this.maxRetries} attempts: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        // Wait before retry
        await this.delay(this.baseDelay * Math.pow(2, attempt));
      }
    }
  }

  private async readConfigUnsafe<T = Record<string, unknown>>(): Promise<T> {
    if (!existsSync(this.configFile)) {
      return {} as T;
    }

    const content = await fs.readFile(this.configFile, 'utf-8');
    
    if (!content.trim()) {
      return {} as T;
    }

    const parsed = JSON.parse(content);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as T;
    }
    
    return {} as T;
  }

  private async writeConfigUnsafe<T = Record<string, unknown>>(config: T): Promise<void> {
    // Validate config before writing
    if (typeof config !== 'object' || config === null) {
      throw new Error('Invalid config object');
    }

    const serialized = JSON.stringify(config, null, 2);
    JSON.parse(serialized); // Validate it can be parsed back

    // Atomic write: write to temp file first
    await fs.writeFile(this.tempFile, serialized, 'utf-8');
    
    // Verify temp file was written correctly
    const verification = await fs.readFile(this.tempFile, 'utf-8');
    JSON.parse(verification); // Ensure it's valid JSON

    // Atomically move temp file to actual config file
    await fs.rename(this.tempFile, this.configFile);
  }

  private async acquireLock(): Promise<void> {
    for (let attempt = 0; attempt < this.maxRetries * 2; attempt++) {
      try {
        // Try to create lock file exclusively
        await fs.writeFile(this.lockFile, String(Date.now()), { flag: 'wx' });
        return; // Lock acquired
      } catch (error: any) {
        if (error.code === 'EEXIST') {
          // Lock file exists, check if it's stale
          try {
            const lockContent = await fs.readFile(this.lockFile, 'utf-8');
            const lockTime = parseInt(lockContent, 10);
            const now = Date.now();
            
            // If lock is older than 10 seconds, consider it stale
            if (now - lockTime > 10000) {
              console.warn('Removing stale lock file');
              await fs.unlink(this.lockFile);
              continue; // Retry acquiring lock
            }
          } catch {
            // If we can't read the lock file, try to remove it
            try {
              await fs.unlink(this.lockFile);
            } catch {
              // Ignore errors when removing lock
            }
          }
          
          // Wait before retry
          await this.delay(50 + Math.random() * 50);
        } else {
          throw error;
        }
      }
    }
    
    throw new Error('Failed to acquire config file lock');
  }

  private async releaseLock(): Promise<void> {
    try {
      await fs.unlink(this.lockFile);
    } catch {
      // Ignore errors when releasing lock
    }
  }

  private async waitForLockRelease(): Promise<void> {
    for (let attempt = 0; attempt < 20; attempt++) {
      if (!existsSync(this.lockFile)) {
        return; // No lock exists
      }
      
      // Check if lock is stale
      try {
        const lockContent = await fs.readFile(this.lockFile, 'utf-8');
        const lockTime = parseInt(lockContent, 10);
        const now = Date.now();
        
        if (now - lockTime > 10000) {
          // Stale lock, remove it
          await fs.unlink(this.lockFile);
          return;
        }
      } catch {
        // If we can't read the lock, assume it's gone
        return;
      }
      
      // Wait a bit before checking again
      await this.delay(25 + Math.random() * 25);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Factory function for creating config file managers
export function createConfigManager(configFile: string): ConfigFileManager {
  return new SafeConfigFileManager(configFile);
}