import 'reflect-metadata';
import { injectable, inject } from 'tsyringe';
import chalk from 'chalk';
import { BaseCommand } from './BaseCommand';
import type { LogEntry } from '../pm2/PM2Client';
import type { IPM2Client } from '../interfaces/IPM2Client';
import { ErrorAnalysisService, type ErrorAnalysisResult } from '../services/ErrorAnalysisService';

// PM2 Bus types
interface PM2BusData {
  process: {
    name: string;
    pm_id: number;
  };
  data: string;
}

interface PM2Bus {
  on(event: 'log:out' | 'log:err', callback: (data: PM2BusData) => void): void;
  close(): void;
}

interface ErrorPatternStats {
  patterns: Map<string, number>;
  processes: Set<string>;
  timeStats: {
    first: string;
    last: string;
    count: number;
  };
}

@injectable()
export class LogsCommand extends BaseCommand {
  public readonly name = 'logs';
  public readonly description = 'Show logs for PM2 processes';
  private logWatcher: PM2Bus | null = null;

  constructor(
    @inject('IPM2Client') private pm2Client: IPM2Client,
    @inject('ErrorAnalysisService') private errorAnalysisService: ErrorAnalysisService
  ) {
    super();
  }

  public async execute(args: string[]): Promise<void> {
    const action = args[0];
    const processName = args[1];
    
    // Handle different log actions
    if (action === 'analyze' || action === 'analyse') {
      await this.analyzeLogs(processName);
      return;
    }
    
    if (action === 'errors') {
      await this.showErrorLogs(processName);
      return;
    }
    
    if (action === 'smart' || action === 'intelligent') {
      await this.showSmartLogs(processName);
      return;
    }
    
    // Default behavior: streaming logs (backward compatibility)
    const targetProcessName = action; // First arg is process name in legacy mode
    
    if (!targetProcessName) {
      console.log(chalk.yellow('📜 Logs Command Options:'));
      console.log(chalk.gray('  /logs <process-name>     - Stream live logs'));
      console.log(chalk.gray('  /logs smart [process]    - Show logs with AI error analysis'));
      console.log(chalk.gray('  /logs analyze [process]  - Analyze error logs'));
      console.log(chalk.gray('  /logs errors [process]   - Show recent error logs'));
      console.log(chalk.gray('Example: /logs my-app'));
      return;
    }

    try {
      const processes = await this.pm2Client.list();
      const targetProcess = processes.find(p => 
        p.name === targetProcessName || 
        p.pm2_env.pm_id.toString() === targetProcessName
      );

      if (!targetProcess) {
        console.log(chalk.red(`Process "${targetProcessName}" not found`));
        return;
      }

      console.log(chalk.blue.bold(`\n📜 Streaming logs for: ${targetProcess.name} (Press Ctrl+C to stop)\n`));
      
      this.startLogStreaming(targetProcess.name);
      
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Failed to get logs: ${message}`));
    }
  }

  private startLogStreaming(processName: string): void {
    try {
      this.pm2Client.launchBus((err, bus) => {
        if (err) {
          console.error(chalk.red(`Failed to launch PM2 bus: ${err.message}`));
          return;
        }

        this.logWatcher = bus as PM2Bus;

        (bus as PM2Bus).on('log:out', (packet: PM2BusData) => {
          if (packet.process.name === processName) {
            const timestamp = chalk.gray(new Date().toISOString());
            const processInfo = chalk.blue(`[${packet.process.name}:${packet.process.pm_id}]`);
            console.log(`${timestamp} ${processInfo} ${packet.data.trim()}`);
          }
        });

        (bus as PM2Bus).on('log:err', (packet: PM2BusData) => {
          if (packet.process.name === processName) {
            const timestamp = chalk.gray(new Date().toISOString());
            const processInfo = chalk.red(`[${packet.process.name}:${packet.process.pm_id}]`);
            console.log(`${timestamp} ${processInfo} ${chalk.red(packet.data.trim())}`);
          }
        });

        console.log(chalk.gray(`Watching logs for ${processName}... (Press Ctrl+C to stop)`));
      });

      process.on('SIGINT', () => {
        this.stopLogStreaming();
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Failed to stream logs: ${message}`));
    }
  }

  private stopLogStreaming(): void {
    if (this.logWatcher) {
      this.logWatcher.close();
      this.logWatcher = null;
    }
    console.log(chalk.yellow('\nLog streaming stopped'));
  }

  private async analyzeLogs(processName?: string): Promise<void> {
    try {
      console.log(chalk.blue.bold('🔍 Analyzing error logs...\n'));
      
      const errorLogs = await this.pm2Client.getErrorLogs(processName, 100);
      
      if (errorLogs.length === 0) {
        if (processName) {
          console.log(chalk.green(`✅ No error logs found for process "${processName}"`));
        } else {
          console.log(chalk.green('✅ No error logs found across all processes'));
        }
        return;
      }

      // Analyze error patterns
      const errorStats = this.analyzeErrorPatterns(errorLogs);
      
      console.log(chalk.red.bold(`❌ Found ${errorLogs.length} error entries`));
      console.log(chalk.gray(`📊 Analysis across ${errorStats.processes.size} process(es)\n`));
      
      // Show error summary
      this.displayErrorSummary(errorStats);
      
      // Show recent errors
      console.log(chalk.yellow.bold('🕒 Recent Error Logs:'));
      this.displayRecentErrors(errorLogs.slice(0, 10));
      
      // Show recommendations
      this.displayErrorRecommendations(errorStats);
      
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Failed to analyze logs: ${message}`));
    }
  }

  private async showErrorLogs(processName?: string): Promise<void> {
    try {
      console.log(chalk.red.bold('📋 Recent Error Logs\n'));
      
      const errorLogs = await this.pm2Client.getErrorLogs(processName, 50);
      
      if (errorLogs.length === 0) {
        if (processName) {
          console.log(chalk.green(`✅ No error logs found for process "${processName}"`));
        } else {
          console.log(chalk.green('✅ No error logs found across all processes'));
        }
        return;
      }

      console.log(chalk.gray(`Showing ${errorLogs.length} most recent error entries:\n`));
      
      errorLogs.forEach((log, index) => {
        const timestamp = chalk.gray(new Date(log.timestamp).toLocaleString());
        const processInfo = chalk.red(`[${log.process}]`);
        const levelIcon = log.level === 'error' ? '❌' : '⚠️';
        
        console.log(`${timestamp} ${levelIcon} ${processInfo}`);
        console.log(chalk.red(`   ${log.message.trim()}`));
        
        if (index < errorLogs.length - 1) console.log();
      });
      
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Failed to show error logs: ${message}`));
    }
  }

  private analyzeErrorPatterns(logs: LogEntry[]): ErrorPatternStats {
    const patterns = new Map<string, number>();
    const processes = new Set<string>();
    const timeStats = { first: '', last: '', count: logs.length };
    
    logs.forEach(log => {
      processes.add(log.process);
      
      // Extract error patterns (simplified)
      const errorType = this.extractErrorType(log.message);
      patterns.set(errorType, (patterns.get(errorType) || 0) + 1);
      
      if (!timeStats.first || log.timestamp < timeStats.first) {
        timeStats.first = log.timestamp;
      }
      if (!timeStats.last || log.timestamp > timeStats.last) {
        timeStats.last = log.timestamp;
      }
    });

    return { patterns, processes, timeStats };
  }

  private extractErrorType(message: string): string {
    // Common Node.js/JavaScript error patterns
    if (message.includes('ECONNREFUSED')) return 'Connection Refused';
    if (message.includes('ENOTFOUND')) return 'Host Not Found';
    if (message.includes('EACCES')) return 'Permission Denied';
    if (message.includes('TypeError')) return 'Type Error';
    if (message.includes('ReferenceError')) return 'Reference Error';
    if (message.includes('SyntaxError')) return 'Syntax Error';
    if (message.includes('Error: Cannot find module')) return 'Missing Module';
    if (message.includes('UnhandledPromiseRejectionWarning')) return 'Unhandled Promise';
    if (message.includes('ETIMEDOUT')) return 'Connection Timeout';
    if (message.includes('MaxListenersExceededWarning')) return 'Memory Leak Warning';
    
    return 'Other Error';
  }

  private displayErrorSummary(stats: ErrorPatternStats): void {
    console.log(chalk.cyan.bold('📊 Error Pattern Summary:'));
    
    const sortedPatterns = Array.from(stats.patterns.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    sortedPatterns.forEach(([pattern, count]) => {
      const percentage = ((count / stats.timeStats.count) * 100).toFixed(1);
      console.log(chalk.gray(`   ${pattern}: ${count} occurrences (${percentage}%)`));
    });
    
    if (stats.timeStats.first && stats.timeStats.last) {
      const duration = new Date(stats.timeStats.last).getTime() - new Date(stats.timeStats.first).getTime();
      const hours = Math.round(duration / (1000 * 60 * 60));
      console.log(chalk.gray(`   Time span: ${hours} hours`));
    }
    
    console.log();
  }

  private displayRecentErrors(logs: LogEntry[]): void {
    logs.forEach((log, index) => {
      const timestamp = chalk.gray(new Date(log.timestamp).toLocaleString());
      const processInfo = chalk.red(`[${log.process}]`);
      
      console.log(`${timestamp} ❌ ${processInfo}`);
      console.log(chalk.red(`   ${log.message.trim()}`));
      
      if (index < logs.length - 1) console.log();
    });
    
    console.log();
  }

  private displayErrorRecommendations(stats: ErrorPatternStats): void {
    console.log(chalk.magenta.bold('💡 Recommendations:'));
    
    const topError = Array.from(stats.patterns.entries())[0];
    if (!topError) return;
    
    const [errorType] = topError;
    
    switch (errorType) {
      case 'Connection Refused':
        console.log(chalk.gray('   • Check if target services are running'));
        console.log(chalk.gray('   • Verify connection URLs and ports'));
        break;
      case 'Missing Module':
        console.log(chalk.gray('   • Run npm install to ensure dependencies'));
        console.log(chalk.gray('   • Check for typos in require/import paths'));
        break;
      case 'Permission Denied':
        console.log(chalk.gray('   • Check file/directory permissions'));
        console.log(chalk.gray('   • Consider running with proper user privileges'));
        break;
      case 'Unhandled Promise':
        console.log(chalk.gray('   • Add proper error handling to async code'));
        console.log(chalk.gray('   • Consider using process.on("unhandledRejection")'));
        break;
      default:
        console.log(chalk.gray('   • Review application logs for patterns'));
        console.log(chalk.gray('   • Consider adding more detailed error logging'));
    }
    
    if (stats.processes.size > 1) {
      console.log(chalk.gray('   • Focus on processes with highest error rates'));
    }
    
    console.log();
  }

  private async showSmartLogs(processName?: string): Promise<void> {
    try {
      console.log(chalk.blue.bold('🧠 Smart Logs with AI Analysis\n'));
      
      // Get recent logs (including both normal and error logs)
      const allLogs = await this.pm2Client.getErrorLogs(processName, 100);
      
      if (allLogs.length === 0) {
        if (processName) {
          console.log(chalk.green(`✅ No recent logs found for process "${processName}"`));
        } else {
          console.log(chalk.green('✅ No recent logs found across all processes'));
        }
        return;
      }

      // Analyze logs with AI
      console.log(chalk.gray('🔍 Analyzing logs with AI...'));
      const analysis = await this.errorAnalysisService.analyzeLogErrors(allLogs, processName);

      // Show recent logs first
      console.log(chalk.cyan.bold('📋 Recent Logs:'));
      this.displayRecentLogs(allLogs.slice(0, 10));

      // Show AI analysis if errors were found
      if (analysis.hasErrors) {
        console.log(chalk.red.bold(`\n🚨 Detected ${analysis.errorCount} error(s)`));
        await this.displayErrorAnalysis(analysis);
      } else {
        console.log(chalk.green.bold('\n✅ No errors detected in recent logs'));
        console.log(chalk.gray('All processes appear to be running normally.'));
      }
      
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Failed to analyze smart logs: ${message}`));
    }
  }

  private async displayErrorAnalysis(analysis: ErrorAnalysisResult): Promise<void> {
    if (!analysis.diagnosis) return;

    const { diagnosis } = analysis;
    
    // Show severity indicator
    const severityColor = this.getSeverityColor(diagnosis.severity);
    const severityIcon = this.getSeverityIcon(diagnosis.severity);
    
    console.log(severityColor.bold(`\n${severityIcon} ${diagnosis.severity.toUpperCase()} ISSUE DETECTED`));
    console.log(chalk.cyan.bold('📊 AI Diagnosis:'));
    console.log(chalk.white(`   ${diagnosis.summary}`));
    
    if (diagnosis.rootCause) {
      console.log(chalk.cyan.bold('\n🔍 Root Cause:'));
      console.log(chalk.gray(`   ${diagnosis.rootCause}`));
    }

    if (diagnosis.actionableSuggestions.length > 0) {
      console.log(chalk.yellow.bold('\n💡 Recommended Actions:'));
      diagnosis.actionableSuggestions.forEach((suggestion, index) => {
        console.log(chalk.yellow(`   ${index + 1}. ${suggestion}`));
      });
    }

    if (analysis.quickFix) {
      console.log(chalk.green.bold('\n⚡ Quick Fix:'));
      console.log(chalk.green(`   ${analysis.quickFix}`));
    }

    if (diagnosis.followUpCommands.length > 0) {
      console.log(chalk.magenta.bold('\n🎯 Follow-up Commands:'));
      diagnosis.followUpCommands.forEach((command, index) => {
        console.log(chalk.magenta(`   ${index + 1}. ${command}`));
      });
    }

    // Show confidence level
    if (diagnosis.confidence) {
      const confidencePercent = Math.round(diagnosis.confidence * 100);
      console.log(chalk.gray(`\n📈 Analysis Confidence: ${confidencePercent}%`));
    }
  }

  private displayRecentLogs(logs: LogEntry[]): void {
    logs.forEach((log, index) => {
      const timestamp = chalk.gray(new Date(log.timestamp).toLocaleString());
      const levelIcon = this.getLogLevelIcon(log.level);
      const processInfo = chalk.blue(`[${log.process}]`);
      
      console.log(`${timestamp} ${levelIcon} ${processInfo}`);
      console.log(chalk.gray(`   ${log.message.trim()}`));
      
      if (index < logs.length - 1) console.log();
    });
    
    console.log();
  }

  private getLogLevelIcon(level: string): string {
    switch (level) {
      case 'error': return '❌';
      case 'warn': return '⚠️';
      case 'info': return 'ℹ️';
      case 'debug': return '🐛';
      default: return '📝';
    }
  }

  private getSeverityColor(severity: string) {
    switch (severity) {
      case 'critical': return chalk.red;
      case 'high': return chalk.red;
      case 'medium': return chalk.yellow;
      case 'low': return chalk.blue;
      default: return chalk.gray;
    }
  }

  private getSeverityIcon(severity: string): string {
    switch (severity) {
      case 'critical': return '🔥';
      case 'high': return '❌';
      case 'medium': return '⚠️';
      case 'low': return 'ℹ️';
      default: return '📋';
    }
  }

  // Enhanced analyze method with better AI integration
  async analyzeLogsWithAI(processName?: string): Promise<ErrorAnalysisResult | null> {
    try {
      const errorLogs = await this.pm2Client.getErrorLogs(processName, 100);
      return await this.errorAnalysisService.analyzeLogErrors(errorLogs, processName);
    } catch (error) {
      console.debug('AI log analysis failed:', error);
      return null;
    }
  }
}
