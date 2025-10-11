#!/usr/bin/env tsx

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import chalk from 'chalk';
import * as readline from 'readline';

const DEMO_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PM2X_PATH = path.resolve(DEMO_DIR, '../dist/bin/pm2plus.js');
const ECOSYSTEM_PATH = path.join(DEMO_DIR, 'ecosystem.demo.json');

interface GuidanceStep {
  title: string;
  description: string;
  suggestions: string[];
  hints?: string[];
}

const GUIDANCE_STEPS: GuidanceStep[] = [
  {
    title: "🔍 Explore System Status",
    description: "Start by checking what processes are running",
    suggestions: [
      "/status",
      "show my processes",
      "how are my applications doing?"
    ],
    hints: [
      "Use '/status' for a detailed process table",
      "Try natural language: 'what processes are running?'"
    ]
  },
  {
    title: "🚨 Investigate Issues",
    description: "Look into the problematic processes",
    suggestions: [
      "what's wrong with database-sync?",
      "analyze my errors",
      "my processes have errors, can you help me?"
    ],
    hints: [
      "PM2+ can understand natural language queries",
      "Ask about specific processes by name"
    ]
  },
  {
    title: "📊 Smart Log Analysis",
    description: "Use AI-powered log analysis for deeper insights",
    suggestions: [
      "/logs smart api-server",
      "/doctor logs",
      "show me error patterns"
    ],
    hints: [
      "Smart logs use AI to categorize and analyze errors",
      "The doctor command provides comprehensive diagnosis"
    ]
  },
  {
    title: "💡 Get Recommendations",
    description: "Ask for specific help and actionable advice",
    suggestions: [
      "show me the most critical issues",
      "what should I fix first?",
      "how do I resolve these database errors?"
    ],
    hints: [
      "PM2+ provides prioritized recommendations",
      "Ask follow-up questions for more details"
    ]
  },
  {
    title: "🔧 Take Action",
    description: "Explore management commands",
    suggestions: [
      "/restart database-sync",
      "/health",
      "/metrics"
    ],
    hints: [
      "You can restart, stop, or monitor processes",
      "Use '/help' to see all available commands"
    ]
  }
];

class GuidedDemo {
  private currentStep = 0;
  private pm2xProcess?: ChildProcess;
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async startDemoProcesses(): Promise<void> {
    console.log(chalk.blue('🚀 Starting PM2+ Guided Demo...'));
    console.log(chalk.gray('Setting up demo processes...\n'));

    // Stop any existing PM2 processes
    console.log(chalk.yellow('⚙️ Cleaning up existing processes...'));
    await new Promise<void>((resolve) => {
      const cleanup = spawn('pm2', ['delete', 'all'], { stdio: 'pipe' });
      cleanup.on('close', () => resolve());
    });

    // Start demo processes
    console.log(chalk.yellow('📦 Starting demo processes...'));
    await new Promise<void>((resolve, reject) => {
      const pm2Start = spawn('pm2', ['start', ECOSYSTEM_PATH], {
        stdio: 'pipe',
        cwd: DEMO_DIR
      });
      
      pm2Start.on('close', (code) => {
        if (code === 0) {
          console.log(chalk.green('✅ Demo processes started successfully'));
          resolve();
        } else {
          console.log(chalk.red('❌ Failed to start demo processes'));
          reject(new Error(`PM2 start failed with code ${code}`));
        }
      });
    });

    // Wait for processes to initialize
    console.log(chalk.yellow('⏳ Waiting for processes to initialize...'));
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  showWelcome(): void {
    console.clear();
    console.log(chalk.cyan('\n╔══════════════════════════════════════════════════════════════════════════════╗'));
    console.log(chalk.cyan('║') + chalk.white.bold('                         🎯 PM2+ Guided Demo                                  ') + chalk.cyan('║'));
    console.log(chalk.cyan('║') + chalk.blue('                   Interactive tutorial with live guidance                     ') + chalk.cyan('║'));
    console.log(chalk.cyan('╚══════════════════════════════════════════════════════════════════════════════╝'));
    
    console.log(chalk.white('\n📋 What you\'ll learn:'));
    console.log(chalk.gray('   • How to check process status and health'));
    console.log(chalk.gray('   • AI-powered error analysis and diagnosis'));
    console.log(chalk.gray('   • Natural language interaction with PM2+'));
    console.log(chalk.gray('   • Smart log analysis and recommendations'));
    
    console.log(chalk.cyan('\n🎮 How it works:'));
    console.log(chalk.gray('   • Follow the guided steps shown in the sidebar'));
    console.log(chalk.gray('   • Try the suggested commands or explore on your own'));
    console.log(chalk.gray('   • Type "next" to move to the next step'));
    console.log(chalk.gray('   • Type "help" to see guidance panel again'));
    console.log(chalk.gray('   • Type "/exit" to quit the demo'));
  }

  showGuidance(): void {
    const step = GUIDANCE_STEPS[this.currentStep];
    if (!step) return;

    console.log(chalk.bgBlue.white.bold(`\n ▼ STEP ${this.currentStep + 1}/${GUIDANCE_STEPS.length}: ${step.title} `));
    console.log(chalk.blue('┌' + '─'.repeat(78) + '┐'));
    console.log(chalk.blue('│') + ` ${step.description.padEnd(76)} ` + chalk.blue('│'));
    console.log(chalk.blue('├' + '─'.repeat(78) + '┤'));
    console.log(chalk.blue('│') + chalk.yellow(' 💡 Try these commands:'.padEnd(77)) + chalk.blue('│'));
    
    step.suggestions.forEach(suggestion => {
      const displayText = `   • "${suggestion}"`;
      console.log(chalk.blue('│') + chalk.gray(displayText.padEnd(77)) + chalk.blue('│'));
    });
    
    if (step.hints) {
      console.log(chalk.blue('├' + '─'.repeat(78) + '┤'));
      console.log(chalk.blue('│') + chalk.cyan(' 🔥 Tips:'.padEnd(77)) + chalk.blue('│'));
      step.hints.forEach(hint => {
        const displayText = `   • ${hint}`;
        console.log(chalk.blue('│') + chalk.white(displayText.padEnd(77)) + chalk.blue('│'));
      });
    }
    
    console.log(chalk.blue('└' + '─'.repeat(78) + '┘'));
    console.log(chalk.gray('Type "next" for next step • "help" to show this panel • "/exit" to quit\n'));
  }

  async launchPM2X(): Promise<void> {
    console.log(chalk.blue('🚀 Launching PM2+ with guidance...\n'));
    
    this.pm2xProcess = spawn('node', [PM2X_PATH], {
      stdio: ['pipe', 'inherit', 'inherit'],
      env: {
        ...process.env,
        PM2X_DEMO_MODE: 'guided',
        COLUMNS: process.stdout.columns?.toString() || '120',
        LINES: process.stdout.rows?.toString() || '30'
      }
    });

    // Set up input handling to intercept special commands
    this.setupInputHandling();

    // Handle PM2+ exit
    this.pm2xProcess.on('close', (code) => {
      console.log(chalk.blue('\n🎉 Thanks for completing the PM2+ Guided Demo!'));
      console.log(chalk.gray('You\'ve learned how to use PM2+ for process management and error analysis.'));
      process.exit(code || 0);
    });

    // Handle script interruption
    process.on('SIGINT', () => {
      console.log(chalk.yellow('\n🛑 Interrupting guided demo...'));
      this.pm2xProcess?.kill('SIGINT');
    });
  }

  setupInputHandling(): void {
    this.rl.on('line', (input: string) => {
      const trimmed = input.trim().toLowerCase();
      
      if (trimmed === 'next') {
        this.nextStep();
        return;
      }
      
      if (trimmed === 'help') {
        this.showGuidance();
        return;
      }
      
      if (trimmed === 'steps') {
        this.showAllSteps();
        return;
      }
      
      // Forward input to PM2+
      if (this.pm2xProcess?.stdin) {
        this.pm2xProcess.stdin.write(input + '\n');
      }
    });
  }

  nextStep(): void {
    if (this.currentStep < GUIDANCE_STEPS.length - 1) {
      this.currentStep++;
      this.showGuidance();
    } else {
      console.log(chalk.green('\n🎉 You\'ve completed all guided steps!'));
      console.log(chalk.gray('Continue exploring PM2+ or type "/exit" to finish the demo.'));
    }
  }

  showAllSteps(): void {
    console.log(chalk.cyan('\n📚 All Demo Steps:'));
    GUIDANCE_STEPS.forEach((step, index) => {
      const marker = index === this.currentStep ? '▶' : index < this.currentStep ? '✓' : '○';
      const color = index === this.currentStep ? chalk.yellow : index < this.currentStep ? chalk.green : chalk.gray;
      console.log(color(`   ${marker} Step ${index + 1}: ${step.title}`));
    });
    console.log();
  }

  async run(): Promise<void> {
    await this.startDemoProcesses();
    this.showWelcome();
    
    console.log(chalk.yellow('\nPress Enter to start the guided demo...'));
    await new Promise<void>((resolve) => {
      this.rl.once('line', () => resolve());
    });
    
    console.clear();
    this.showGuidance();
    await this.launchPM2X();
  }
}

async function main(): Promise<void> {
  try {
    const demo = new GuidedDemo();
    await demo.run();
  } catch (error) {
    console.error(chalk.red('❌ Guided demo failed:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run the guided demo
main().catch((error) => {
  console.error(chalk.red('Unexpected error:'), error);
  process.exit(1);
});