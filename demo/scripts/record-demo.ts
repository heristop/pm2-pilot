#!/usr/bin/env tsx

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'node:fs/promises';
import chalk from 'chalk';

const DEMO_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUTPUT_DIR = path.join(DEMO_DIR, 'output');

interface VHSRecordingOptions {
  outputName: string;
  title: string;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
}

class VHSDemoRecorder {
  private options: VHSRecordingOptions;

  constructor(options: Partial<VHSRecordingOptions> = {}) {
    this.options = {
      outputName: 'showcase-demo',
      title: 'PM2+ AI-Powered Process Manager Demo',
      width: 1200,
      height: 800,
      fontSize: 14,
      fontFamily: 'Menlo',
      ...options
    };
  }

  private get tapeFilePath(): string {
    return path.join(OUTPUT_DIR, `${this.options.outputName}.tape`);
  }

  private get gifFilePath(): string {
    return path.join(OUTPUT_DIR, `${this.options.outputName}.gif`);
  }

  async ensureOutputDirectory(): Promise<void> {
    try {
      await fs.access(OUTPUT_DIR);
    } catch {
      await fs.mkdir(OUTPUT_DIR, { recursive: true });
      console.log(chalk.blue(`📁 Created output directory: ${OUTPUT_DIR}`));
    }
  }

  async generateTapeFile(): Promise<void> {
    const tapeContent = `Output ${this.options.outputName}.gif

Set FontSize ${this.options.fontSize}
Set FontFamily "${this.options.fontFamily}"
Set Width ${this.options.width}
Set Height ${this.options.height}
Set Shell "bash"
Set TypingSpeed 60ms

# Run the actual live demo showcase - this shows the real PM2+ AI interface
Type "pnpm run demo:showcase"
Enter
Sleep 85s

# Demo completes automatically, no additional commands needed
`;

    await fs.writeFile(this.tapeFilePath, tapeContent);
    console.log(chalk.green(`📄 Generated VHS tape: ${this.tapeFilePath}`));
  }

  async recordDemo(): Promise<void> {
    console.log(chalk.yellow('🎞️  Starting VHS recording...'));
    console.log(chalk.gray(`   Output: ${this.gifFilePath}`));
    console.log(chalk.gray(`   Dimensions: ${this.options.width}x${this.options.height}`));
    console.log(chalk.gray(`   Font: ${this.options.fontFamily} ${this.options.fontSize}px`));

    return new Promise((resolve, reject) => {
      const vhsProcess = spawn('vhs', [this.tapeFilePath], {
        stdio: 'inherit',
        cwd: OUTPUT_DIR
      });

      vhsProcess.on('close', (code) => {
        if (code === 0) {
          console.log(chalk.green('✅ VHS recording completed successfully!'));
          console.log(chalk.gray(`🎞️  Saved: ${this.gifFilePath}`));
          resolve();
        } else {
          console.log(chalk.red(`❌ VHS recording failed with exit code: ${code}`));
          reject(new Error(`VHS recording failed with code ${code}`));
        }
      });

      vhsProcess.on('error', (error) => {
        console.log(chalk.red(`❌ VHS recording error: ${error.message}`));
        reject(error);
      });

      // Handle interruption gracefully
      process.on('SIGINT', () => {
        console.log(chalk.yellow('🛑 Recording interrupted by user'));
        vhsProcess.kill('SIGINT');
      });
    });
  }

  async getFileSizes(): Promise<{ gif: string; tape: string }> {
    const formatSize = (bytes: number): string => {
      if (bytes < 1024) return `${bytes}B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    };

    const gifStats = await fs.stat(this.gifFilePath);
    const tapeStats = await fs.stat(this.tapeFilePath);

    return {
      gif: formatSize(gifStats.size),
      tape: formatSize(tapeStats.size)
    };
  }

  async showSummary(): Promise<void> {
    const sizes = await this.getFileSizes();

    console.log(chalk.white('📁 Generated Files:'));
    console.log(chalk.gray(`   🎞️  VHS GIF: ${path.basename(this.gifFilePath)} (${sizes.gif})`));
    console.log(chalk.gray(`   📄 VHS Tape: ${path.basename(this.tapeFilePath)} (${sizes.tape})`));

    console.log(chalk.white('📂 Output Directory:'));
    console.log(chalk.blue(`   ${OUTPUT_DIR}`));

    console.log(chalk.green('🎉 VHS demo recording completed!'));
  }

  async record(): Promise<void> {
    try {
      await this.ensureOutputDirectory();
      await this.generateTapeFile();
      await this.recordDemo();
      await this.showSummary();
    } catch (error) {
      console.error(chalk.red('❌ VHS demo recording failed:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }
}

async function checkTool(toolName: string): Promise<boolean> {
  return new Promise((resolve) => {
    const check = spawn('which', [toolName], { stdio: 'pipe' });
    check.on('close', (code) => {
      resolve(code === 0);
    });
    check.on('error', () => {
      resolve(false);
    });
  });
}

async function main(): Promise<void> {
  console.log(chalk.blue('🔍 Checking VHS availability...'));

  // Check if VHS is available
  const vhsAvailable = await checkTool('vhs');
  if (!vhsAvailable) {
    console.error(chalk.red(`❌ VHS not found. Please install it first.`));
    console.log(chalk.gray(`   Install with: brew install vhs`));
    console.log(chalk.gray(`   Or visit: https://github.com/charmbracelet/vhs`));
    process.exit(1);
  }

  console.log(chalk.green(`✅ VHS found - Enhanced emoji GIF recording enabled`));
  console.log(''); // Add spacing

  const recorder = new VHSDemoRecorder();
  await recorder.record();
}

// Run the VHS demo recorder
main().catch((error) => {
  console.error(chalk.red('Unexpected error:'), error);
  process.exit(1);
});