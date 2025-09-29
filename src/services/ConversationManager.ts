import { injectable, inject } from 'tsyringe';
import type { ConversationContext } from './CommandAnalyzer';
import type { CommandAnalysis } from './CommandAnalyzer';
import type { ExecutionResult } from './PM2CommandMapper';
import type { ConversationMessage } from './ai-providers/types';
import type { AIProvider } from './ai-providers/types';

export interface ConversationTurn {
  input: string;
  analysis: CommandAnalysis;
  result?: ExecutionResult;
  timestamp: Date;
  pendingActions?: PendingAction[];
}

export interface PendingAction {
  id: string;
  label: string;
  command: string;
  analysis: CommandAnalysis;
  safety: 'safe' | 'caution' | 'dangerous';
}

@injectable()
export class ConversationManager {
  private conversationHistory: ConversationTurn[] = [];
  private pendingActions: PendingAction[] = [];
  private maxHistorySize = 10;

  constructor(@inject('AIProvider') private aiProvider: AIProvider) {}

  async addTurn(input: string, analysis: CommandAnalysis, result?: ExecutionResult): Promise<void> {
    const turn: ConversationTurn = {
      input,
      analysis,
      result,
      timestamp: new Date(),
      pendingActions: [...this.pendingActions]
    };

    this.conversationHistory.push(turn);
    
    // Keep history manageable
    if (this.conversationHistory.length > this.maxHistorySize) {
      this.conversationHistory = this.conversationHistory.slice(-this.maxHistorySize);
    }

    // Update context based on the turn
    await this.updateContextFromTurn(turn);
  }

  async getContext(): Promise<ConversationContext> {
    const recent = this.conversationHistory.slice(-3);
    
    return {
      lastMentionedProcess: await this.extractLastMentionedProcess(),
      previousCommands: recent.map(turn => turn.input),
      recentProcesses: await this.extractRecentProcesses(),
      lastResponse: this.getLastResponse()
    };
  }

  setPendingActions(actions: PendingAction[]): void {
    this.pendingActions = [...actions];
  }

  getPendingActions(): PendingAction[] {
    return [...this.pendingActions];
  }

  clearPendingActions(): void {
    this.pendingActions = [];
  }

  getActionByNumber(number: number): PendingAction | null {
    if (number < 1 || number > this.pendingActions.length) {
      return null;
    }
    const action = this.pendingActions[number - 1];
    return action ?? null;
  }

  isNumberedSelection(input: string): boolean {
    const trimmed = input.trim();
    const num = parseInt(trimmed, 10);
    return !isNaN(num) && num >= 1 && num <= this.pendingActions.length;
  }

  async extractProcessNames(text: string): Promise<string[]> {
    // If AI provider is not configured, fall back to simple regex
    if (!this.aiProvider.isConfigured()) {
      const matches = text.match(/\b([a-zA-Z0-9\-_]+(?:\.[a-zA-Z0-9]+)?)\b/g) || [];
      return matches.filter(match => 
        match.length > 2 && 
        !/^\d+$/.test(match) && // Not just numbers
        !/^(the|and|or|but|in|on|at|to|for|of|with|my|your|his|her|its|our|their|all|some|any)$/i.test(match)
      );
    }

    try {
      const prompt = `PM2-X Process Name Extractor. Analyze user input for process names.

INPUT: "${text}"

TASK: Extract potential process/application names from user input.

RULES:
1. Include: Technical identifiers, app names, service names
2. Include: Hyphenated names (api-server, worker-queue)  
3. Include: Dotted names (app.js, service.py)
4. Exclude: Common words, articles, pronouns
5. Exclude: Generic terms (server, app, process, service)
6. Language agnostic, typo tolerant
7. Minimum 3 characters, no standalone numbers

EXAMPLES:
- "restart api-server" → ["api-server"]
- "show logs for my-app.js" → ["my-app.js"]  
- "the worker-queue is slow" → ["worker-queue"]
- "start the application" → []
- "check database-sync status" → ["database-sync"]
- "redémarre mon api-server" → ["api-server"]

JSON RESPONSE (array only):
["process_name_1", "process_name_2"]`;

      const response = await this.aiProvider.query(prompt);
      const cleanResponse = response.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '');
      
      try {
        const parsed = JSON.parse(cleanResponse);
        return Array.isArray(parsed) ? parsed.filter(name => typeof name === 'string' && name.length > 0) : [];
      } catch {
        // If JSON parsing fails, fall back to simple extraction
        return this.extractProcessNamesFallback(text);
      }
    } catch {
      // If LLM call fails, fall back to simple extraction
      return this.extractProcessNamesFallback(text);
    }
  }

  private extractProcessNamesFallback(text: string): string[] {
    const matches = text.match(/\b([a-zA-Z0-9\-_]+(?:\.[a-zA-Z0-9]+)?)\b/g) || [];
    return matches.filter(match => 
      match.length > 2 && 
      !/^\d+$/.test(match) && // Not just numbers
      !/^(the|and|or|but|in|on|at|to|for|of|with|my|your|his|her|its|our|their|all|some|any)$/i.test(match)
    );
  }

  async extractLastProcessFromCommand(analysis: CommandAnalysis): Promise<string | undefined> {
    // Extract process from the command analysis
    const target = analysis.parameters.target;
    if (target && target !== 'all') {
      return target;
    }

    // Try to extract from the original input
    const processNames = await this.extractProcessNames(analysis.originalInput);
    return processNames.length > 0 ? processNames[0] : undefined;
  }

  private async updateContextFromTurn(turn: ConversationTurn): Promise<void> {
    // Update last mentioned process
    const processFromCommand = await this.extractLastProcessFromCommand(turn.analysis);
    if (processFromCommand) {
      // Update context will be handled by getContext()
    }
  }

  private async extractLastMentionedProcess(): Promise<string | undefined> {
    // Look through recent history for process mentions
    for (let i = this.conversationHistory.length - 1; i >= 0; i--) {
      const turn = this.conversationHistory[i];
      const process = await this.extractLastProcessFromCommand(turn.analysis);
      if (process) {
        return process;
      }
    }
    return undefined;
  }

  private async extractRecentProcesses(): Promise<string[]> {
    const processes = new Set<string>();
    
    // Collect processes from recent turns
    const recentTurns = this.conversationHistory.slice(-5);
    for (const turn of recentTurns) {
      const process = await this.extractLastProcessFromCommand(turn.analysis);
      if (process && process !== 'all') {
        processes.add(process);
      }
    }

    return Array.from(processes);
  }

  private getLastResponse(): string | undefined {
    const lastTurn = this.conversationHistory[this.conversationHistory.length - 1];
    if (!lastTurn || !lastTurn.result) {
      return undefined;
    }
    return lastTurn.result.message;
  }

  // Helper methods for pronoun resolution
  resolvePronoun(pronoun: string, context: ConversationContext): string | null {
    const lowerPronoun = pronoun.toLowerCase();
    
    // French pronouns
    if (['le', 'la', 'les', 'lui', 'eux'].includes(lowerPronoun)) {
      return context.lastMentionedProcess || null;
    }
    
    // English pronouns  
    if (['it', 'them', 'that', 'this'].includes(lowerPronoun)) {
      return context.lastMentionedProcess || null;
    }

    // Spanish pronouns
    if (['lo', 'la', 'los', 'las', 'eso', 'esa'].includes(lowerPronoun)) {
      return context.lastMentionedProcess || null;
    }

    return null;
  }

  getMessagesForAI(): ConversationMessage[] {
    const messages: ConversationMessage[] = [];
    
    // Get last 5 turns for context (configurable)
    const maxHistoryForAI = 5;
    const recentTurns = this.conversationHistory.slice(-maxHistoryForAI);
    
    recentTurns.forEach(turn => {
      // Only add info_request turns to maintain conversation flow
      if (turn.analysis.intent === 'info_request') {
        // Add user message
        messages.push({ 
          role: 'user', 
          content: turn.input,
          timestamp: turn.timestamp 
        });
        
        // Add assistant response if available
        if (turn.result?.message) {
          messages.push({ 
            role: 'assistant', 
            content: turn.result.message,
            timestamp: turn.timestamp 
          });
        }
      }
    });
    
    return messages;
  }

  generateContextPrompt(): string {
    if (this.conversationHistory.length === 0) {
      return '';
    }

    const recentTurns = this.conversationHistory.slice(-3);
    const contextLines = recentTurns.map(turn => {
      const result = turn.result ? ` → ${turn.result.success ? 'Success' : 'Failed'}` : '';
      return `User: "${turn.input}"${result}`;
    });

    return `Recent conversation:\n${contextLines.join('\n')}`;
  }

  hasSimilarRecentCommand(analysis: CommandAnalysis): boolean {
    // Check if we've seen a similar command recently
    const recentTurns = this.conversationHistory.slice(-3);
    
    return recentTurns.some(turn => 
      turn.analysis.intent === analysis.intent &&
      turn.analysis.parameters.target === analysis.parameters.target
    );
  }

  getStatistics(): { totalCommands: number; successRate: number; recentActivity: number } {
    const total = this.conversationHistory.length;
    const successful = this.conversationHistory.filter(turn => turn.result?.success).length;
    const recent = this.conversationHistory.filter(turn => 
      Date.now() - turn.timestamp.getTime() < 5 * 60 * 1000 // Last 5 minutes
    ).length;

    return {
      totalCommands: total,
      successRate: total > 0 ? successful / total : 0,
      recentActivity: recent
    };
  }
}
