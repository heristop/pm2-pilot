import chalk from 'chalk';

export interface LoaderOptions {
  message?: string;
  context?: 'analysis' | 'query' | 'action' | 'general';
  timeout?: number;
}

interface LoaderState {
  interval?: NodeJS.Timeout;
  frameIndex: number;
  isActive: boolean;
  startTime: number;
  currentMessage: string;
}

export class Loader {
  // Global message tracking across all loader instances
  private static lastGlobalMessageIndex: number = -1;
  
  private state: LoaderState = {
    frameIndex: 0,
    isActive: false,
    startTime: 0,
    currentMessage: ''
  };

  private readonly spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  
  private readonly loadingMessages = {
    analysis: [
      '🎮 Parsing your quest objective...',
      '⚔️ Analyzing the process battlefield...',
      '🎯 Identifying target processes like a sniper...',
      '🛡️ Checking process defenses and health bars...',
      '📊 Monitoring system vitals in real-time...',
      '🔍 Scanning PM2 ecosystem for anomalies...',
      '🎲 Rolling for command interpretation...',
      '🕹️ Loading process intelligence data...'
    ],
    query: [
      '🏆 Consulting the PM2 process oracle...',
      '🎮 Querying the system leaderboard...',
      '⚡ Charging up the monitoring array...',
      '🔮 Divining PM2 secrets from the logs...',
      '📈 Calculating performance metrics XP...',
      '🎪 Juggling multiple process threads...',
      '🚀 Launching deep system scan...',
      '🎯 Targeting optimal response patterns...'
    ],
    action: [
      '⚔️ Engaging process combat mode...',
      '🚀 Launching PM2 operation sequence...',
      '🎮 Executing admin privilege commands...',
      '🛠️ Wielding process management tools...',
      '💥 Deploying system changes like a boss...',
      '🎯 Targeting process instances precisely...',
      '🏅 Leveling up your server infrastructure...',
      '⚡ Casting process manipulation spells...'
    ],
    general: [
      '🎮 Loading next server level...',
      '⚡ Processing system game state...',
      '🏅 Calculating process XP gains...',
      '📊 Updating PM2 process leaderboard...',
      '🔧 Tuning performance settings...',
      '🎪 Managing the server circus act...',
      '🚀 Booting up the monitoring dashboard...',
      '🎯 Achieving process management mastery...'
    ]
  };

  private readonly extendedLoadingMessages = [
    '🎮 Boss fight in progress - this might take a while!',
    '☕ Perfect time for a coffee break while the servers work...',
    '🌟 The PM2 AI is being extra thorough with your processes!',
    '🎭 Complex monitoring deserves complex analysis!',
    '🧠 Neural networks grinding through process data!',
    '⚡ System monitoring at maximum overdrive!',
    '🎯 Precision process management takes time!',
    '🚀 Loading the ultimate PM2 experience!'
  ];

  start(options: LoaderOptions = {}): void {
    if (this.state.isActive) {
      this.stop();
    }

    const context = options.context || 'general';
    const messages = this.loadingMessages[context];
    
    // Select one message for this entire API call
    const selectedMessage = options.message || this.selectNewMessage(messages);
    
    this.state = {
      frameIndex: 0,
      isActive: true,
      startTime: Date.now(),
      currentMessage: selectedMessage
    };

    // Hide cursor
    process.stdout.write('\x1B[?25l');

    // Start spinner animation - only animate spinner, keep same message
    this.state.interval = setInterval(() => {
      this.updateDisplay(this.state.currentMessage);
      this.state.frameIndex = (this.state.frameIndex + 1) % this.spinnerFrames.length;
    }, 100);

    // Set timeout if specified
    if (options.timeout) {
      setTimeout(() => {
        if (this.state.isActive) {
          this.stop();
          console.log(chalk.yellow('\n⏰ Operation timed out. The AI might be having a coffee break!'));
        }
      }, options.timeout);
    }

    // Initial display with selected message
    this.updateDisplay(this.state.currentMessage);
  }

  private updateDisplay(message: string): void {
    if (!this.state.isActive) return;

    // Clear current line and move cursor to beginning
    process.stdout.write('\r\x1B[K');
    
    // Display spinner with message
    const spinner = chalk.cyan(this.spinnerFrames[this.state.frameIndex]);
    process.stdout.write(`${spinner} ${message}`);
  }

  private selectNewMessage(messages: string[]): string {
    if (messages.length === 0) return '';
    if (messages.length === 1) return messages[0];
    
    let randomIndex;
    do {
      randomIndex = Math.floor(Math.random() * messages.length);
    } while (randomIndex === Loader.lastGlobalMessageIndex && messages.length > 1);
    
    Loader.lastGlobalMessageIndex = randomIndex;
    return messages[randomIndex] ?? messages[0];
  }


  stop(): void {
    if (!this.state.isActive) return;

    this.state.isActive = false;

    // Clear interval
    if (this.state.interval) {
      clearInterval(this.state.interval);
    }

    // Clear current line and show cursor
    process.stdout.write('\r\x1B[K');
    process.stdout.write('\x1B[?25h');
  }

  success(message: string): void {
    this.stop();
    console.log(chalk.green(`✅ ${message}`));
  }

  error(message: string): void {
    this.stop();
    console.log(chalk.red(`❌ ${message}`));
  }

  info(message: string): void {
    this.stop();
    console.log(chalk.blue(`ℹ️ ${message}`));
  }

  // Static convenience methods
  static async withLoader<T>(
    fn: () => Promise<T>,
    options: LoaderOptions = {}
  ): Promise<T> {
    const loader = new Loader();
    loader.start(options);

    try {
      const result = await fn();
      loader.stop();
      return result;
    } catch (error) {
      loader.stop();
      throw error;
    }
  }

  // Specific context loaders
  static async withAnalysis<T>(fn: () => Promise<T>, message?: string): Promise<T> {
    return this.withLoader(fn, {
      context: 'analysis',
      message,
      timeout: 30000 // 30 seconds for analysis
    });
  }

  static async withQuery<T>(fn: () => Promise<T>, message?: string): Promise<T> {
    return this.withLoader(fn, {
      context: 'query',
      message,
      timeout: 45000 // 45 seconds for AI queries
    });
  }

  static async withAction<T>(fn: () => Promise<T>, message?: string): Promise<T> {
    return this.withLoader(fn, {
      context: 'action',
      message,
      timeout: 20000 // 20 seconds for actions
    });
  }
}
