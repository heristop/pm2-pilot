import 'reflect-metadata';
import { injectable, inject } from 'tsyringe';
import chalk from 'chalk';
import { BaseCommand } from './BaseCommand';
import { AIProviderFactory } from '../services/AIProviderFactory';
import { ContextBuilder } from '../services/ContextBuilder';

@injectable()
export class OptimizeCommand extends BaseCommand {
  public readonly name = 'optimize';
  public readonly description = 'Get AI-powered optimization suggestions';
  public readonly aliases = ['tune'];
  
  private aiProviderFactory: AIProviderFactory;
  private contextBuilder: ContextBuilder;

  constructor(
    @inject('AIProviderFactory') private aiProviderFactory: AIProviderFactory,
    @inject('ContextBuilder') private contextBuilder: ContextBuilder
  ) {
    super();
  }

  public async execute(args: string[]): Promise<void> {
    const processName = args[0];

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
      console.log(chalk.blue(`⚡ Analyzing optimization opportunities for ${processName || 'all processes'}...`));
      
      // Build context
      const context = await this.contextBuilder.buildProcessContext(processName);
      
      // Create optimization prompt
      const prompt = this.buildOptimizationPrompt(processName);
      
      // Get AI recommendations
      const response = await aiService.query(prompt, context);
      
      // Display optimization suggestions
      this.displayOptimizations(response, processName);
      
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`❌ Optimization analysis failed: ${message}`));
    }
  }

  private buildOptimizationPrompt(processName?: string): string {
    if (processName) {
      return `Analyze the PM2 process "${processName}" and provide specific optimization recommendations.
Focus on:
1. Memory usage optimization
2. CPU performance improvements
3. PM2 configuration tuning
4. Restart frequency reduction
5. Resource allocation improvements

Provide specific PM2 commands and configuration changes where possible.
Prioritize recommendations by impact and ease of implementation.`;
    }

    return `Analyze the entire PM2 ecosystem and provide optimization recommendations.
Consider:
1. Resource allocation across processes
2. Load balancing opportunities
3. Memory and CPU optimization
4. Process configuration improvements
5. System-wide performance tuning
6. Scaling strategies

Provide actionable recommendations with specific commands and configuration examples.`;
  }

  private displayOptimizations(response: string, processName?: string): void {
    console.log(chalk.green.bold('\n⚡ Optimization Recommendations\n'));
    console.log(chalk.cyan(`Target: ${processName || 'All processes'}`));
    console.log(chalk.gray(`Generated: ${new Date().toLocaleString()}`));
    console.log(chalk.gray('─'.repeat(50)));
    console.log();

    this.formatOptimizationResponse(response);
    
    console.log();
    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.blue('💡 Apply changes gradually and monitor the results'));
  }

  private formatOptimizationResponse(response: string): void {
    const sections = response.split('\n\n');
    let priorityLevel = 1;
    
    sections.forEach((section, index) => {
      const lines = section.split('\n');
      const firstLine = lines[0];
      
      // Skip empty sections
      if (!firstLine || lines.length === 0) return;
      
      // Check for different types of content
      if (firstLine.toLowerCase().includes('high priority') || firstLine.toLowerCase().includes('critical')) {
        console.log(chalk.red.bold(`🔥 ${firstLine}`));
        this.formatRecommendationContent(lines.slice(1));
      } else if (firstLine.toLowerCase().includes('medium priority') || firstLine.toLowerCase().includes('recommended')) {
        console.log(chalk.yellow.bold(`⚠️  ${firstLine}`));
        this.formatRecommendationContent(lines.slice(1));
      } else if (firstLine.toLowerCase().includes('low priority') || firstLine.toLowerCase().includes('optional')) {
        console.log(chalk.green.bold(`💡 ${firstLine}`));
        this.formatRecommendationContent(lines.slice(1));
      } else if (firstLine.includes(':') && lines.length > 1) {
        console.log(chalk.cyan.bold(`${priorityLevel}. ${firstLine}`));
        this.formatRecommendationContent(lines.slice(1));
        priorityLevel++;
      } else if (firstLine.match(/^\d+\./)) {
        console.log(chalk.cyan.bold(firstLine));
        this.formatRecommendationContent(lines.slice(1));
      } else {
        // Regular content
        this.formatRecommendationContent(lines);
      }
      
      if (index < sections.length - 1) {
        console.log();
      }
    });
  }

  private formatRecommendationContent(lines: string[]): void {
    lines.forEach(line => {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('pm2 ') || trimmed.startsWith('pnpm ') || trimmed.startsWith('npm ')) {
        // Command to execute
        console.log(chalk.bgBlue.white(` ${trimmed} `));
      } else if (trimmed.startsWith('•') || trimmed.startsWith('-')) {
        // Bullet point
        console.log(chalk.yellow(`    ${trimmed}`));
      } else if (trimmed.startsWith('✓')) {
        // Success/benefit
        console.log(chalk.green(`    ${trimmed}`));
      } else if (trimmed.startsWith('⚠') || trimmed.startsWith('Warning:')) {
        // Warning
        console.log(chalk.yellow(`    ${trimmed}`));
      } else if (trimmed.length > 0) {
        // Regular text
        console.log(`    ${trimmed}`);
      }
    });
  }
}
