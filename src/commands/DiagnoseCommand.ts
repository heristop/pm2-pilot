import 'reflect-metadata';
import { injectable, inject } from 'tsyringe';
import chalk from 'chalk';
import { BaseCommand } from './BaseCommand';
import { AIProviderFactory } from '../services/AIProviderFactory';
import { ContextBuilder } from '../services/ContextBuilder';
import { ErrorAnalysisService } from '../services/ErrorAnalysisService';
import type { IPM2Client } from '../interfaces/IPM2Client';

@injectable()
export class DiagnoseCommand extends BaseCommand {
  public readonly name = 'diagnose';
  public readonly description = 'AI-powered diagnosis of PM2 process issues';
  public readonly aliases = ['doctor'];
  
  private aiProviderFactory: AIProviderFactory;
  private contextBuilder: ContextBuilder;

  constructor(
    @inject('AIProviderFactory') private aiProviderFactory: AIProviderFactory,
    @inject('ContextBuilder') private contextBuilder: ContextBuilder,
    @inject('ErrorAnalysisService') private errorAnalysisService: ErrorAnalysisService,
    @inject('IPM2Client') private pm2Client: IPM2Client
  ) {
    super();
  }

  public async execute(args: string[]): Promise<void> {
    const firstArg = args[0];
    
    // Handle subcommands
    if (firstArg === 'logs') {
      await this.diagnoseLogs(args[1]); // Optional process name
      return;
    }
    
    if (firstArg === 'errors') {
      await this.diagnoseErrors(args[1]); // Optional process name
      return;
    }
    
    // Default behavior: process diagnosis
    const processName = firstArg;

    const aiService = this.aiProviderFactory.getProvider();
    if (!aiService || !aiService.isConfigured()) {
      console.log(chalk.red('❌ AI service not configured'));
      console.log(chalk.gray('Set your API key:'));
      console.log(chalk.gray('  • OpenAI: /ai setup openai your-key'));
      console.log(chalk.gray('  • Gemini: /ai setup gemini your-key'));
      console.log(chalk.gray('  • Or use environment variables: OPENAI_API_KEY, GEMINI_API_KEY'));
      return;
    }

    try {
      console.log(chalk.blue(`🔍 Diagnosing ${processName || 'all processes'}...`));
      
      // Build comprehensive context
      const context = await this.contextBuilder.buildProcessContext(processName);
      
      // Create diagnosis prompt
      const prompt = this.buildDiagnosisPrompt(processName);
      
      // Get AI analysis
      const response = await aiService.query(prompt, context);
      
      // Display diagnosis
      this.displayDiagnosis(response, processName);
      
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`❌ Diagnosis failed: ${message}`));
    }
  }

  private buildDiagnosisPrompt(processName?: string): string {
    if (processName) {
      return `Perform a comprehensive diagnosis of the PM2 process "${processName}". 
Analyze the metrics, performance data, and configuration to identify:
1. Current health status
2. Potential issues or risks
3. Performance bottlenecks
4. Configuration problems
5. Recommended actions

Provide specific, actionable recommendations with PM2 commands where applicable.`;
    }

    return `Perform a system-wide diagnosis of all PM2 processes.
Analyze the overall ecosystem health including:
1. Resource utilization patterns
2. Process stability
3. Performance bottlenecks
4. System-wide issues
5. Optimization opportunities

Prioritize the most critical issues and provide actionable recommendations.`;
  }

  private displayDiagnosis(response: string, processName?: string): void {
    console.log(chalk.blue.bold('\n🏥 AI Diagnosis Report\n'));
    console.log(chalk.cyan(`Target: ${processName || 'All processes'}`));
    console.log(chalk.gray(`Generated: ${new Date().toLocaleString()}`));
    console.log(chalk.gray('─'.repeat(50)));
    console.log();

    // Format and display the response
    this.formatDiagnosisResponse(response);
    
    console.log();
    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.yellow('💡 Tip: Use /optimize for specific optimization suggestions'));
  }

  private async diagnoseLogs(processName?: string): Promise<void> {
    const aiService = this.aiProviderFactory.getProvider();
    if (!aiService || !aiService.isConfigured()) {
      console.log(chalk.red('❌ AI service not configured'));
      console.log(chalk.gray('Set your API key with /ai setup'));
      return;
    }

    try {
      console.log(chalk.blue(`🔍 Analyzing logs ${processName ? `for ${processName}` : 'across all processes'}...`));
      
      // Get recent logs for analysis
      const logs = await this.pm2Client.getErrorLogs(processName, 100);
      
      if (logs.length === 0) {
        console.log(chalk.green(`✅ No recent logs found ${processName ? `for ${processName}` : ''}`));
        return;
      }

      // Perform AI-powered error analysis
      const errorAnalysis = await this.errorAnalysisService.analyzeLogErrors(logs, processName);
      
      // Display comprehensive log diagnosis
      console.log(chalk.blue.bold('\n📋 Log Analysis Report\n'));
      console.log(chalk.cyan(`Target: ${processName || 'All processes'}`));
      console.log(chalk.gray(`Analyzed: ${logs.length} log entries`));
      console.log(chalk.gray(`Generated: ${new Date().toLocaleString()}`));
      console.log(chalk.gray('─'.repeat(50)));

      if (errorAnalysis.hasErrors) {
        this.displayDetailedErrorAnalysis(errorAnalysis);
      } else {
        console.log(chalk.green.bold('\n✅ No errors detected in recent logs'));
        console.log(chalk.gray('All monitored processes appear to be running normally.'));
        
        // Still show some recent log samples for context
        console.log(chalk.cyan.bold('\n📊 Recent Log Activity:'));
        logs.slice(0, 5).forEach(log => {
          const timestamp = chalk.gray(new Date(log.timestamp).toLocaleString());
          const levelIcon = this.getLogLevelIcon(log.level);
          console.log(`${timestamp} ${levelIcon} [${log.process}] ${log.message.trim().substring(0, 100)}...`);
        });
      }
      
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`❌ Log diagnosis failed: ${message}`));
    }
  }

  private async diagnoseErrors(processName?: string): Promise<void> {
    const aiService = this.aiProviderFactory.getProvider();
    if (!aiService || !aiService.isConfigured()) {
      console.log(chalk.red('❌ AI service not configured'));
      console.log(chalk.gray('Set your API key with /ai setup'));
      return;
    }

    try {
      console.log(chalk.red.bold('🚨 Error-Focused Diagnosis\n'));
      console.log(chalk.blue(`🔍 Analyzing errors ${processName ? `for ${processName}` : 'across all processes'}...`));
      
      // Get recent error logs specifically
      const errorLogs = await this.pm2Client.getErrorLogs(processName, 150);
      const actualErrors = errorLogs.filter(log => 
        log.level === 'error' || this.isErrorMessage(log.message)
      );
      
      if (actualErrors.length === 0) {
        console.log(chalk.green(`✅ No recent errors found ${processName ? `for ${processName}` : ''}`));
        console.log(chalk.gray('All processes appear to be error-free.'));
        return;
      }

      // Perform focused error analysis
      const errorAnalysis = await this.errorAnalysisService.analyzeLogErrors(actualErrors, processName);
      
      console.log(chalk.red.bold(`🔥 Found ${actualErrors.length} error(s) requiring attention`));
      console.log(chalk.gray('─'.repeat(50)));

      if (errorAnalysis.hasErrors && errorAnalysis.diagnosis) {
        this.displayCriticalErrorFocus(errorAnalysis);
      }
      
      // Show error timeline
      this.displayErrorTimeline(errorAnalysis.parsedErrors || []);
      
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`❌ Error diagnosis failed: ${message}`));
    }
  }

  private displayDetailedErrorAnalysis(analysis: any): void {
    if (!analysis.diagnosis) return;

    const { diagnosis, parsedErrors } = analysis;
    
    // Severity and overview
    const severityColor = this.getSeverityColor(diagnosis.severity);
    const severityIcon = this.getSeverityIcon(diagnosis.severity);
    
    console.log(severityColor.bold(`\n${severityIcon} ${diagnosis.severity.toUpperCase()} ISSUES DETECTED`));
    console.log(chalk.white.bold(`📊 ${diagnosis.summary}`));
    
    if (diagnosis.rootCause) {
      console.log(chalk.cyan.bold('\n🔍 Root Cause Analysis:'));
      console.log(chalk.gray(`   ${diagnosis.rootCause}`));
    }

    // Show error breakdown by category
    if (parsedErrors && parsedErrors.length > 0) {
      console.log(chalk.cyan.bold('\n📋 Error Breakdown:'));
      const errorsByCategory = this.groupErrorsByCategory(parsedErrors);
      
      Object.entries(errorsByCategory).forEach(([category, errors]: [string, any[]]) => {
        console.log(chalk.yellow(`   ${category}: ${errors.length} error(s)`));
        const recentError = errors[0];
        if (recentError) {
          console.log(chalk.gray(`     Latest: ${recentError.type} in ${recentError.processName}`));
        }
      });
    }

    // Actionable recommendations
    if (diagnosis.actionableSuggestions && diagnosis.actionableSuggestions.length > 0) {
      console.log(chalk.green.bold('\n✅ Recommended Actions:'));
      diagnosis.actionableSuggestions.forEach((suggestion: string, index: number) => {
        console.log(chalk.green(`   ${index + 1}. ${suggestion}`));
      });
    }

    // Quick fix
    if (analysis.quickFix) {
      console.log(chalk.yellow.bold('\n⚡ Quick Fix:'));
      console.log(chalk.yellow(`   ${analysis.quickFix}`));
    }

    // Follow-up commands
    if (diagnosis.followUpCommands && diagnosis.followUpCommands.length > 0) {
      console.log(chalk.magenta.bold('\n🎯 Suggested Commands:'));
      diagnosis.followUpCommands.forEach((command: string, index: number) => {
        console.log(chalk.magenta(`   ${index + 1}. ${command}`));
      });
    }

    // Confidence indicator
    if (diagnosis.confidence) {
      const confidencePercent = Math.round(diagnosis.confidence * 100);
      const confidenceColor = confidencePercent >= 80 ? chalk.green : confidencePercent >= 60 ? chalk.yellow : chalk.red;
      console.log(confidenceColor(`\n📈 Analysis Confidence: ${confidencePercent}%`));
    }
  }

  private displayCriticalErrorFocus(analysis: any): void {
    const { diagnosis, parsedErrors } = analysis;
    
    console.log(chalk.red.bold('🎯 Critical Error Focus:'));
    console.log(chalk.white(`   ${diagnosis.summary}`));
    
    if (parsedErrors && parsedErrors.length > 0) {
      const criticalErrors = parsedErrors.filter((e: any) => e.severity === 'critical' || e.severity === 'high');
      
      if (criticalErrors.length > 0) {
        console.log(chalk.red.bold(`\n🔥 ${criticalErrors.length} Critical/High Severity Error(s):`));
        criticalErrors.slice(0, 3).forEach((error: any, index: number) => {
          console.log(chalk.red(`   ${index + 1}. ${error.type} in ${error.processName}`));
          if (error.filePath) {
            console.log(chalk.gray(`      File: ${error.filePath}`));
          }
          console.log(chalk.gray(`      Time: ${new Date(error.timestamp).toLocaleString()}`));
        });
      }
    }

    if (diagnosis.actionableSuggestions && diagnosis.actionableSuggestions.length > 0) {
      console.log(chalk.yellow.bold('\n⚡ Immediate Actions Required:'));
      diagnosis.actionableSuggestions.slice(0, 3).forEach((suggestion: string, index: number) => {
        console.log(chalk.yellow(`   ${index + 1}. ${suggestion}`));
      });
    }
  }

  private displayErrorTimeline(errors: any[]): void {
    if (!errors || errors.length === 0) return;

    console.log(chalk.cyan.bold('\n⏰ Error Timeline (Most Recent):'));
    
    const recentErrors = errors.slice(0, 10);
    recentErrors.forEach((error, index) => {
      const timestamp = new Date(error.timestamp).toLocaleString();
      const severityIcon = this.getSeverityIcon(error.severity);
      
      console.log(`   ${timestamp} ${severityIcon} [${error.processName}] ${error.type}`);
      if (error.filePath && index < 3) { // Show file paths for first few errors
        console.log(chalk.gray(`      ${error.filePath}`));
      }
    });
  }

  private groupErrorsByCategory(errors: any[]): Record<string, any[]> {
    return errors.reduce((groups, error) => {
      const category = error.category || 'other';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(error);
      return groups;
    }, {});
  }

  private isErrorMessage(message: string): boolean {
    const errorIndicators = [
      'error', 'exception', 'failed', 'cannot', 'unable', 'not found',
      'ECONNREFUSED', 'ENOTFOUND', 'EACCES', 'ETIMEDOUT', 'ERR_MODULE_NOT_FOUND',
      'TypeError', 'ReferenceError', 'SyntaxError'
    ];
    
    const lowerMessage = message.toLowerCase();
    return errorIndicators.some(indicator => lowerMessage.includes(indicator.toLowerCase()));
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

  private formatDiagnosisResponse(response: string): void {
    const sections = response.split('\n\n');
    
    sections.forEach((section, index) => {
      const lines = section.split('\n');
      const firstLine = lines[0];
      
      // Skip empty sections
      if (!firstLine || lines.length === 0) return;
      
      // Check if this looks like a header
      if (firstLine.includes(':') && lines.length > 1) {
        // Header with content
        console.log(chalk.cyan.bold(firstLine));
        lines.slice(1).forEach(line => {
          if (line.trim().startsWith('•') || line.trim().startsWith('-')) {
            console.log(chalk.yellow(`  ${line.trim()}`));
          } else if (line.trim().startsWith('✓')) {
            console.log(chalk.green(`  ${line.trim()}`));
          } else if (line.trim().startsWith('⚠') || line.trim().startsWith('!')) {
            console.log(chalk.yellow(`  ${line.trim()}`));
          } else if (line.trim().startsWith('❌') || line.trim().startsWith('✗')) {
            console.log(chalk.red(`  ${line.trim()}`));
          } else {
            console.log(`  ${line}`);
          }
        });
      } else if (firstLine.match(/^\d+\./)) {
        // Numbered list
        console.log(chalk.cyan.bold(firstLine));
        lines.slice(1).forEach(line => {
          console.log(`   ${line}`);
        });
      } else {
        // Regular content
        section.split('\n').forEach(line => {
          if (line.trim().startsWith('•') || line.trim().startsWith('-')) {
            console.log(chalk.yellow(line));
          } else {
            console.log(line);
          }
        });
      }
      
      if (index < sections.length - 1) {
        console.log(); // Space between sections
      }
    });
  }
}
