import { injectable, inject } from 'tsyringe';
import type { AIProvider } from './ai-providers/types';
import { Loader } from '../utils/Loader';

export interface CommandAnalysis {
  intent: string;
  targetCommand: string;
  parameters: {
    target?: string | null;
    required: string[];
    optional: string[];
    provided: Record<string, unknown>;
  };
  confidence: number;
  safety: 'safe' | 'caution' | 'dangerous';
  missingParams: string[];
  language: string;
  originalInput: string;
  needsConfirmation: boolean;
  canAutoExecute: boolean;
}

export interface ConversationContext {
  lastMentionedProcess?: string;
  previousCommands: string[];
  recentProcesses: string[];
  lastResponse?: string;
}

@injectable()
export class CommandAnalyzer {
  private availableProcesses: string[] = [];
  
  constructor(@inject('AIProvider') private aiProvider: AIProvider) {}
  
  setAvailableProcesses(processes: string[]): void {
    this.availableProcesses = processes;
  }

  async analyzeCommand(input: string, context?: ConversationContext): Promise<CommandAnalysis> {
    if (!this.aiProvider.isConfigured()) {
      return this.createFallbackAnalysis(input);
    }

    return await Loader.withAnalysis(async () => {
      const prompt = this.buildAnalysisPrompt(input, context);
      
      try {
        const response = await this.aiProvider.query(prompt);
        const analysis = this.parseAIResponse(response, input);
        
        // Post-process with context resolution
        return this.enhanceWithContext(analysis, context);
      } catch (error) {
        console.debug('AI command analysis failed:', error);
        return this.createFallbackAnalysis(input);
      }
    }, this.getAnalysisMessage(input));
  }

  private getAnalysisMessage(input: string): string {
    const lowerInput = input.toLowerCase();
    
    // Detect language to provide appropriate message
    if (this.isFrench(lowerInput)) {
      return '🇫🇷 Connexion au daemon PM2...';
    }
    
    if (this.isSpanish(lowerInput)) {
      return '🇪🇸 Conectando con PM2...';
    }
    
    // Detect command type for contextual messages
    if (lowerInput.includes('restart') || lowerInput.includes('redémarre') || lowerInput.includes('reinicia')) {
      return '🔄  Preparing process restart...'
    }
    
    if (lowerInput.includes('stop') || lowerInput.includes('arrête') || lowerInput.includes('para')) {
      return '⏹️  Stopping process gracefully...';
    }
    
    if (lowerInput.includes('start') || lowerInput.includes('lance') || lowerInput.includes('inicia')) {
      return '🚀  Launching process...'
    }
    
    if (lowerInput.includes('status') || lowerInput.includes('état') || lowerInput.includes('estado')) {
      return '📊  Gathering process intel...'
    }
    
    return '⚙️  Connecting to PM2 daemon...';
  }

  private isFrench(input: string): boolean {
    const frenchWords = ['redémarre', 'arrête', 'lance', 'mon', 'mes', 'le', 'la', 'les', 'comment', 'va'];
    return frenchWords.some(word => input.includes(word));
  }

  private isSpanish(input: string): boolean {
    const spanishWords = ['reinicia', 'para', 'inicia', 'mi', 'mis', 'el', 'la', 'los', 'las', 'cómo', 'está'];
    return spanishWords.some(word => input.includes(word));
  }

  private buildAnalysisPrompt(input: string, context?: ConversationContext): string {
    const contextInfo = context ? this.buildContextString(context) : '';
    
    return `PM2 Pilot Command Analyzer. Map user input to PM2 commands.

INPUT: "${input}"
${contextInfo}

INTENTS:
- info_request: Questions (what/how/which/list)
- execute_pending: Confirmations (yes/do it/execute/proceed - ANY language)
- restart_process: Restart/reload processes
- stop_process: Stop processes  
- start_process: Start processes
- show_status: Process table only
- show_logs: Show logs
- delete_process: Delete processes
- show_info: Process info
- show_monit: Monitor
- save_config: Save list
- startup_config: Startup script

RULES:
1. Questions → info_request
2. Confirmations (any language) → execute_pending  
3. Actions → specific intent
4. Language agnostic, typo tolerant
5. Extract process names, resolve "my app/server"

SAFETY:
- safe: auto-execute
- caution: confirm for "all"
- dangerous: always confirm

JSON RESPONSE:
{
  "intent": "execute_pending",
  "targetCommand": "pm2 restart",
  "parameters": {
    "target": "process_name|all|null",
    "required": [],
    "optional": [],
    "provided": {}
  },
  "confidence": 0.95,
  "safety": "safe",
  "missingParams": [],
  "language": "English",
  "needsConfirmation": false,
  "canAutoExecute": true
}`;
  }

  private buildContextString(context: ConversationContext): string {
    let contextStr = 'CONVERSATION CONTEXT:\n';
    
    // CRITICAL: Include available processes for pronoun resolution
    if (this.availableProcesses.length > 0) {
      contextStr += `- AVAILABLE PROCESSES: ${this.availableProcesses.join(', ')}\n`;
      contextStr += `- When user says "my server/app", resolve to one of these process names\n`;
    }
    
    if (context.lastMentionedProcess) {
      contextStr += `- Last mentioned process: "${context.lastMentionedProcess}"\n`;
    }
    
    if (context.recentProcesses.length > 0) {
      contextStr += `- Recent processes: ${context.recentProcesses.join(', ')}\n`;
    }
    
    if (context.previousCommands.length > 0) {
      contextStr += `- Previous commands: ${context.previousCommands.slice(-3).join(', ')}\n`;
    }
    
    return contextStr;
  }

  private parseAIResponse(response: string, originalInput: string): CommandAnalysis {
    try {
      const cleanResponse = response.trim().replace(/```json|```/g, '');
      const parsed = JSON.parse(cleanResponse) as unknown;
      return this.normalizeAnalysis(parsed, originalInput);
    } catch {
      return this.createFallbackAnalysis(originalInput);
    }
  }

  private normalizeAnalysis(parsed: unknown, originalInput: string): CommandAnalysis {
    if (typeof parsed !== 'object' || parsed === null) {
      return this.createFallbackAnalysis(originalInput);
    }

    const record = parsed as Record<string, unknown>;
    const intent = typeof record.intent === 'string' ? record.intent : 'unknown';
    const targetCommand = typeof record.targetCommand === 'string' ? record.targetCommand : '';
    const parameters = this.normalizeParameters(record.parameters);
    const confidence = typeof record.confidence === 'number' ? record.confidence : 0;
    const safety = this.normalizeSafety(record.safety);
    const missingParams = Array.isArray(record.missingParams)
      ? record.missingParams.filter((item): item is string => typeof item === 'string')
      : [];
    const language = typeof record.language === 'string' ? record.language : 'Unknown';
    const needsConfirmation = typeof record.needsConfirmation === 'boolean' ? record.needsConfirmation : false;
    const canAutoExecute = typeof record.canAutoExecute === 'boolean' ? record.canAutoExecute : false;

    return {
      intent,
      targetCommand,
      parameters,
      confidence,
      safety,
      missingParams,
      language,
      originalInput,
      needsConfirmation,
      canAutoExecute
    };
  }

  private normalizeParameters(value: unknown): CommandAnalysis['parameters'] {
    const base: CommandAnalysis['parameters'] = {
      target: null,
      required: [],
      optional: [],
      provided: {}
    };

    if (typeof value !== 'object' || value === null) {
      return base;
    }

    const record = value as Record<string, unknown>;
    const target = typeof record.target === 'string' ? record.target : null;
    const required = Array.isArray(record.required)
      ? record.required.filter((item): item is string => typeof item === 'string')
      : [];
    const optional = Array.isArray(record.optional)
      ? record.optional.filter((item): item is string => typeof item === 'string')
      : [];
    const provided = this.normalizeProvided(record.provided);

    return {
      target,
      required,
      optional,
      provided
    };
  }

  private normalizeProvided(value: unknown): Record<string, unknown> {
    if (typeof value !== 'object' || value === null) {
      return {};
    }

    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => typeof key === 'string');

    return Object.fromEntries(entries);
  }

  private normalizeSafety(value: unknown): CommandAnalysis['safety'] {
    if (value === 'safe' || value === 'caution' || value === 'dangerous') {
      return value;
    }
    return 'safe';
  }

  private enhanceWithContext(analysis: CommandAnalysis, context?: ConversationContext): CommandAnalysis {
    if (!context) return analysis;

    // Resolve pronouns and missing targets
    if (!analysis.parameters.target && context.lastMentionedProcess) {
      analysis.parameters.target = context.lastMentionedProcess;
      analysis.parameters.provided.target = context.lastMentionedProcess;
      analysis.missingParams = analysis.missingParams.filter(p => p !== 'process_name');
    }

    // Update auto-execution logic based on missing params
    analysis.canAutoExecute = analysis.missingParams.length === 0 && 
                             analysis.confidence >= 0.7 && 
                             analysis.safety !== 'dangerous';

    analysis.needsConfirmation = analysis.safety === 'dangerous' || 
                                analysis.confidence < 0.8 || 
                                analysis.missingParams.length > 0;

    return analysis;
  }

  private createFallbackAnalysis(input: string): CommandAnalysis {
    return {
      intent: 'unknown',
      targetCommand: '',
      parameters: {
        required: [],
        optional: [],
        provided: {}
      },
      confidence: 0.1,
      safety: 'safe',
      missingParams: [],
      language: 'Unknown',
      originalInput: input,
      needsConfirmation: true,
      canAutoExecute: false
    };
  }
}
