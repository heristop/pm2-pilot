#!/usr/bin/env tsx

import 'dotenv/config';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import chalk from 'chalk';

const DEMO_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PM2X_PATH = path.resolve(DEMO_DIR, '../dist/bin/pm2plus.js');
const PM2_PATH = path.resolve(DEMO_DIR, '../node_modules/.bin/pm2');
const ECOSYSTEM_PATH = path.join(DEMO_DIR, 'ecosystem.demo.json');

interface DemoCommand {
  command: string;
  description: string;
  delay: number;
  typingSpeed?: number;
}

class TypewriterEffect {
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static async typeCommand(pm2xProcess: ChildProcess, command: string, speed = 80): Promise<void> {

    if (!pm2xProcess.stdin) return;
    
    for (const char of command) {
      pm2xProcess.stdin.write(char);
      await this.delay(speed);
    }
    
    pm2xProcess.stdin.write('\r');
  }
}

class AutoDemo {
  private pm2xProcess?: ChildProcess;
  private demoSequence: DemoCommand[] = [
    {
      command: '/status',
      description: '🔍 Checking process status and health overview',
      delay: 2,
      typingSpeed: 100
    },
    {
      command: 'my processes have errors, can you help me analyze them?',
      description: '🚨 Asking AI to investigate error patterns',
      delay: 18,
      typingSpeed: 80
    },
    {
      command: '/logs smart api-server',
      description: '📊 Running intelligent AI-powered log analysis',
      delay: 15,
      typingSpeed: 95
    },
    {
      command: '/doctor logs',
      description: '🩺 Getting comprehensive diagnostic report',
      delay: 18,
      typingSpeed: 90
    },
    {
      command: 'show me the most critical issues',
      description: '🔥 Prioritizing critical problems for immediate action',
      delay: 20,
      typingSpeed: 85
    },
    {
      command: '/exit',
      description: '👋 Exiting PM2+ demo gracefully',
      delay: 3,
      typingSpeed: 120
    }
  ];

  async startDemoProcesses(): Promise<void> {
    console.log(chalk.blue('🚀 Starting PM2+ Auto Demo...'));
    console.log(chalk.gray('Setting up demo environment...\n'));

    // Stop any existing PM2 processes
    console.log(chalk.yellow('⚙️ Cleaning up existing processes...'));
    await new Promise<void>((resolve, reject) => {
      const cleanup = spawn(PM2_PATH, ['delete', 'all'], { stdio: 'inherit' });

      // Add 10-second timeout
      const timeout = setTimeout(() => {
        cleanup.kill();
        reject(new Error('PM2 cleanup timeout'));
      }, 10000);

      // Handle close event with timeout cleanup
      cleanup.on('close', (code) => {
        clearTimeout(timeout);
        console.log(chalk.gray(`PM2 cleanup completed with code ${code}`));
        resolve();
      });

      // Handle error events gracefully
      cleanup.on('error', (error) => {
        clearTimeout(timeout);
        console.log(chalk.yellow(`PM2 cleanup error (continuing): ${error.message}`));
        resolve(); // Continue even if cleanup fails
      });
    });

    // Start demo processes
    console.log(chalk.yellow('📦 Starting demo processes...'));
    await new Promise<void>((resolve, reject) => {
      const pm2Start = spawn(PM2_PATH, ['start', ECOSYSTEM_PATH], {
        stdio: 'inherit', // Show PM2 output instead of hiding it
        cwd: DEMO_DIR
      });

      // Add 30-second timeout for PM2 start
      const timeout = setTimeout(() => {
        pm2Start.kill();
        reject(new Error('PM2 start timeout after 30 seconds'));
      }, 30000);

      // Enhanced close event handling
      pm2Start.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          console.log(chalk.green('✅ Demo processes started successfully'));
          resolve();
        } else {
          console.log(chalk.red(`❌ Failed to start demo processes (exit code: ${code})`));
          reject(new Error(`PM2 start failed with code ${code}`));
        }
      });

      // Critical: Handle error events that were missing
      pm2Start.on('error', (error) => {
        clearTimeout(timeout);
        console.log(chalk.red(`❌ PM2 start error: ${error.message}`));
        reject(error);
      });
    });

    // Wait for processes to initialize
    console.log(chalk.yellow('⏳ Waiting for processes to initialize...'));
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  showIntro(): void {
    console.log(chalk.cyan('\n╔══════════════════════════════════════════════════════════════════════════════╗'));
    console.log(chalk.cyan('║') + chalk.white.bold('                              🎬 PM2+ Auto Demo                               ') + chalk.cyan('║'));
    console.log(chalk.cyan('║') + chalk.blue('                    Watch PM2+ showcase its AI capabilities                   ') + chalk.cyan('║'));
    console.log(chalk.cyan('╚══════════════════════════════════════════════════════════════════════════════╝'));
    
    console.log(chalk.white('\n🎯 What you\'ll see:'));
    console.log(chalk.gray('   • Real-time process monitoring and status checks'));
    console.log(chalk.gray('   • AI-powered error detection and analysis'));
    console.log(chalk.gray('   • Intelligent log processing with root cause analysis'));
    console.log(chalk.gray('   • Automated diagnosis and actionable recommendations'));
    console.log(chalk.gray('   • Natural language interaction with PM2+ AI'));
    
    console.log(chalk.cyan('\n⏱️  Demo Timeline:'));
    console.log(chalk.gray('   • ~60 seconds of automated demonstration'));
    console.log(chalk.gray('   • Real AI responses (not simulated)'));
    console.log(chalk.gray('   • Live process management scenarios'));
    
    console.log(chalk.yellow('\n📺 Sit back and watch PM2+ in action!\n'));
  }

  async launchPM2X(): Promise<void> {
    console.log(chalk.blue('🚀 Launching PM2+...\n'));
    
    this.pm2xProcess = spawn('node', [PM2X_PATH], {
      stdio: ['pipe', 'inherit', 'inherit'],
      env: {
        ...process.env,
        PM2X_DEMO_MODE: 'auto',
        COLUMNS: process.stdout.columns?.toString() || '120',
        LINES: process.stdout.rows?.toString() || '30',
        // Ensure API keys are available for real AI responses
        OPENAI_API_KEY: process.env.OPENAI_API_KEY || process.env.DEMO_OPENAI_API_KEY,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY || process.env.DEMO_GEMINI_API_KEY
      }
    });

    // Wait for PM2+ to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Start the automated demo sequence
    await this.runDemoSequence();

    // Handle PM2+ exit
    this.pm2xProcess.on('close', (code) => {
      console.log(chalk.green('\n🎉 PM2+ Auto Demo Completed!'));
      console.log(chalk.gray('Thank you for watching PM2+ demonstrate its AI-powered process management.'));
      process.exit(code || 0);
    });

    // Handle script interruption
    process.on('SIGINT', () => {
      console.log(chalk.yellow('\n🛑 Demo interrupted by user'));
      this.pm2xProcess?.kill('SIGINT');
    });
  }

  private isAICommand(command: string): boolean {
    // Commands that trigger AI responses (natural language or AI-powered commands)
    return !command.startsWith('/') || command.startsWith('/logs') || command.startsWith('/doctor');
  }

  async runDemoSequence(): Promise<void> {
    for (let i = 0; i < this.demoSequence.length; i++) {
      const step = this.demoSequence[i];

      // Show what we're about to do
      console.log(chalk.bgBlue.white.bold(`\n ▶ STEP ${i + 1}/${this.demoSequence.length}: ${step.description} `));
      console.log(chalk.blue('┌' + '─'.repeat(78) + '┐'));
      console.log(chalk.blue('│') + chalk.white(` Executing: "${step.command}"`.padEnd(78)) + chalk.blue('│'));
      console.log(chalk.blue('└' + '─'.repeat(78) + '┘'));

      // Type and execute the command immediately (no pre-delay)
      if (this.pm2xProcess?.stdin) {
        await TypewriterEffect.typeCommand(this.pm2xProcess, step.command, step.typingSpeed);

        // Use step.delay as response wait time
        if (this.isAICommand(step.command)) {
          console.log(chalk.yellow('\n⏳ Waiting for AI analysis to complete...'));
          // Use step delay for AI response timing
          await new Promise(resolve => setTimeout(resolve, step.delay * 1000));
        } else {
          // Use step delay for regular command timing
          await new Promise(resolve => setTimeout(resolve, step.delay * 1000));
        }
      }
    }
  }

  private checkAIConfiguration(): boolean {
    const hasOpenAI = !!(process.env.OPENAI_API_KEY || process.env.DEMO_OPENAI_API_KEY);
    const hasGemini = !!(process.env.GEMINI_API_KEY || process.env.DEMO_GEMINI_API_KEY);

    if (!hasOpenAI && !hasGemini) {
      console.log(chalk.red('\n❌ No AI API keys configured!'));
      console.log(chalk.yellow('\nTo enable real AI responses, set one of:'));
      console.log(chalk.gray('  export OPENAI_API_KEY="your-openai-key"'));
      console.log(chalk.gray('  export GEMINI_API_KEY="your-gemini-key"'));
      console.log(chalk.gray('\nOr for demo-specific keys:'));
      console.log(chalk.gray('  export DEMO_OPENAI_API_KEY="your-openai-key"'));
      console.log(chalk.gray('  export DEMO_GEMINI_API_KEY="your-gemini-key"'));
      console.log(chalk.yellow('\n⚠️  Demo will run but AI commands will show configuration errors.\n'));
      return false;
    }

    const provider = hasOpenAI ? 'OpenAI' : 'Gemini';
    console.log(chalk.green(`✅ ${provider} API key detected - Real AI responses enabled!\n`));
    return true;
  }

  async run(): Promise<void> {
    await this.startDemoProcesses();
    this.showIntro();

    // Check AI configuration
    this.checkAIConfiguration();

    console.log(chalk.yellow('▶️  Starting demo...\n'));
    await new Promise(resolve => setTimeout(resolve, 1000));

    await this.launchPM2X();
  }
}

async function main(): Promise<void> {
  try {
    const demo = new AutoDemo();
    await demo.run();
  } catch (error) {
    console.error(chalk.red('❌ Auto demo failed:'), error instanceof Error ? error.message : String(error));
    console.log(chalk.cyan('\n💡 Try running \'pnpm demo:ecosystem\' to test just the PM2 processes'));
    console.log(chalk.gray('   This helps debug if the issue is with process startup or the demo script'));
    process.exit(1);
  }
}

// Run the autonomous demo
main().catch((error) => {
  console.error(chalk.red('Unexpected error:'), error);
  console.log(chalk.cyan('\n💡 Try running \'pnpm demo:ecosystem\' to test just the PM2 processes'));
  process.exit(1);
});