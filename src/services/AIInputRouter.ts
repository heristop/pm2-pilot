import { injectable, inject } from 'tsyringe';
import type { AIProvider } from './ai-providers/types';
import type { IInputAnalyzer } from './ai-input-router/InputAnalyzer';
import type { IEntityExtractor } from './ai-input-router/EntityExtractor';
import type { IActionDetector } from './ai-input-router/ActionDetector';
import type { IPatternMatcher } from './ai-input-router/PatternMatcher';

export interface InputAnalysis {
  intent: 'command' | 'question' | 'hybrid' | 'direct_action';
  confidence: number;
  entities: ExtractedEntity[];
  suggestedActions: Action[];
  requiresConfirmation: boolean;
  originalInput: string;
  processedCommand?: string;
  actionConfidence?: number; // Specific confidence for action execution
}

export interface ExtractedEntity {
  type: 'process' | 'metric' | 'threshold' | 'action' | 'status';
  value: string;
  confidence: number;
  position?: [number, number]; // start, end indices
}

export interface Action {
  type: 'restart' | 'stop' | 'start' | 'status' | 'logs' | 'metrics' | 'info';
  target?: string; // process name or 'all'
  parameters?: Record<string, unknown>;
  safety: 'safe' | 'caution' | 'dangerous';
  description: string;
}

export interface AIActionDetection {
  action: Action['type'] | null;
  target: string | null;
  confidence: number;
  detectedLanguage?: string;
  originalText: string;
}

@injectable()
export class AIInputRouter {
  private processCommands = new Set(['restart', 'stop', 'start', 'kill']);
  private infoCommands = new Set(['status', 'list', 'ps', 'info', 'show']);
  private monitoringCommands = new Set(['logs', 'metrics', 'health', 'watch']);

  constructor(
    @inject('AIProvider') private aiProvider: AIProvider | null = null,
    @inject('InputAnalyzer') private inputAnalyzer: IInputAnalyzer,
    @inject('EntityExtractor') private entityExtractor: IEntityExtractor,
    @inject('ActionDetector') private actionDetector: IActionDetector,
    @inject('PatternMatcher') private patternMatcher: IPatternMatcher
  ) {}


  async analyze(input: string): Promise<InputAnalysis> {
    const trimmedInput = input.trim();

    if (!trimmedInput) {
      return this.inputAnalyzer.createEmptyAnalysis(input);
    }

    // Check for traditional slash commands first
    if (trimmedInput.startsWith('/')) {
      return this.inputAnalyzer.analyzeSlashCommand(trimmedInput);
    }

    // Try AI-powered action detection first if available
    let aiDetection: AIActionDetection | null = null;
    if (this.aiProvider?.isConfigured()) {
      try {
        aiDetection = await this.actionDetector.detectActionsWithAI(trimmedInput);
      } catch (error) {
        // Fall back to traditional analysis if AI fails
        console.debug('AI action detection failed, using traditional analysis:', error);
      }
    }

    // Analyze intent based on patterns with AI detection
    const entities = this.entityExtractor.extractEntities(trimmedInput, aiDetection);
    const intent = this.inputAnalyzer.determineIntent(trimmedInput, entities, aiDetection);
    const actions = this.actionDetector.extractActions(trimmedInput, entities, aiDetection);
    const confidence = this.inputAnalyzer.calculateConfidence(intent, entities, actions);
    const actionConfidence = this.inputAnalyzer.calculateActionConfidence(trimmedInput, intent, entities, actions, aiDetection);
    const requiresConfirmation = this.inputAnalyzer.needsConfirmation(actions);

    return {
      intent,
      confidence,
      entities,
      suggestedActions: actions,
      requiresConfirmation,
      originalInput: input,
      processedCommand: this.inputAnalyzer.generateProcessedCommand(intent, entities, actions),
      actionConfidence
    };
  }

}
