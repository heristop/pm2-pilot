import * as path from 'node:path';
import { homedir } from 'node:os';

/**
 * PM2-X configuration constants
 */
export const PM2X_CONFIG = {
  CONFIG_FILE: path.join(homedir(), '.pm2x-config.json'),
  HISTORY_FILE: path.join(homedir(), '.pm2x-command-history.json'),
} as const;

/**
 * UI and formatting constants
 */
export const UI_CONSTANTS = {
  SPINNER_FRAMES: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  SUCCESS_ICON: '✅',
  ERROR_ICON: '❌',
  WARNING_ICON: '⚠️',
  INFO_ICON: 'ℹ️',
  AI_ICON: '🤖',
} as const;