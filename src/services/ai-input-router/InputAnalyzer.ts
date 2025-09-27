import { injectable } from 'tsyringe';
import type { InputAnalysis, ExtractedEntity, Action, AIActionDetection } from '../AIInputRouter';

export interface IInputAnalyzer {
  createEmptyAnalysis(input: string): InputAnalysis;
  analyzeSlashCommand(input: string): InputAnalysis;
  determineIntent(input: string, entities: ExtractedEntity[], aiDetection?: AIActionDetection | null): InputAnalysis['intent'];
  calculateConfidence(intent: InputAnalysis['intent'], entities: ExtractedEntity[], actions: Action[]): number;
  calculateActionConfidence(input: string, intent: InputAnalysis['intent'], entities: ExtractedEntity[], actions: Action[], aiDetection?: AIActionDetection | null): number;
  generateProcessedCommand(intent: InputAnalysis['intent'], entities: ExtractedEntity[], actions: Action[]): string | undefined;
  needsConfirmation(actions: Action[]): boolean;
  hasQuestionWords(input: string): boolean;
}

@injectable()
export class InputAnalyzer implements IInputAnalyzer {
  private commandPatterns: Map<string, RegExp> = new Map();

  constructor() {
    this.initializePatterns();
  }

  private initializePatterns(): void {
    // Traditional slash commands
    this.commandPatterns.set('slash_command', /^\/\w+/);

    // Direct commands without slash
    this.commandPatterns.set('direct_command', /^(status|list|ps|restart|stop|start|logs|metrics|health|help|exit|quit)\b/i);

    // Process-specific actions
    this.commandPatterns.set('restart_process', /(?:restart|reboot|reload)\s+([a-zA-Z0-9\-_]+)/i);
    this.commandPatterns.set('stop_process', /(?:stop|kill|terminate)\s+([a-zA-Z0-9\-_]+)/i);
    this.commandPatterns.set('start_process', /(?:start|launch|run)\s+([a-zA-Z0-9\-_]+)/i);
    this.commandPatterns.set('logs_process', /(?:logs?|log)\s+(?:for\s+)?([a-zA-Z0-9\-_]+)/i);
    this.commandPatterns.set('status_process', /(?:status|state|info)\s+(?:of\s+)?([a-zA-Z0-9\-_]+)/i);

    // Batch operations
    this.commandPatterns.set('restart_all', /(?:restart|reboot|reload)\s+(?:all|everything)/i);
    this.commandPatterns.set('stop_all', /(?:stop|kill|terminate)\s+(?:all|everything)/i);
    this.commandPatterns.set('start_all', /(?:start|launch|run)\s+(?:all|everything)/i);

    // Direct action patterns (imperative commands)
    this.commandPatterns.set('imperative_restart', /^(?:restart|reboot|reload|refresh)\s+/i);
    this.commandPatterns.set('imperative_stop', /^(?:stop|kill|terminate|shutdown)\s+/i);
    this.commandPatterns.set('imperative_start', /^(?:start|launch|run|begin)\s+/i);
    this.commandPatterns.set('imperative_show', /^(?:show|display|list|check)\s+/i);

    // Questions and analysis
    this.commandPatterns.set('why_question', /(?:why|what|how|when)\s+(?:is|was|did|does|can|will)/i);
    this.commandPatterns.set('performance_question', /(?:slow|fast|memory|cpu|performance|usage|resource)/i);
    this.commandPatterns.set('error_question', /(?:error|crash|fail|problem|issue|broken|wrong)/i);
    this.commandPatterns.set('help_question', /(?:help|how\s+to|what\s+(?:is|are)|explain|show\s+me)/i);
  }

  createEmptyAnalysis(input: string): InputAnalysis {
    return {
      intent: 'question',
      confidence: 0,
      entities: [],
      suggestedActions: [],
      requiresConfirmation: false,
      originalInput: input,
      actionConfidence: 0
    };
  }

  analyzeSlashCommand(input: string): InputAnalysis {
    return {
      intent: 'command',
      confidence: 1.0,
      entities: [],
      suggestedActions: [],
      requiresConfirmation: false,
      originalInput: input,
      processedCommand: input
    };
  }

  determineIntent(input: string, entities: ExtractedEntity[], aiDetection?: AIActionDetection | null): InputAnalysis['intent'] {
    // Check for traditional slash commands first
    if (input.startsWith('/')) {
      return 'command';
    }

    // Check AI detection for high-confidence actions
    if (aiDetection && aiDetection.action && aiDetection.confidence >= 0.8) {
      return 'direct_action';
    }

    // Check for direct commands without slash
    if (this.commandPatterns.get('direct_command')?.test(input)) {
      return 'command';
    }

    // Check for imperative/direct action commands
    const isImperative = this.commandPatterns.get('imperative_restart')?.test(input) ||
                        this.commandPatterns.get('imperative_stop')?.test(input) ||
                        this.commandPatterns.get('imperative_start')?.test(input) ||
                        this.commandPatterns.get('imperative_show')?.test(input);

    const hasAction = entities.some(e => e.type === 'action');
    const hasProcess = entities.some(e => e.type === 'process');

    // Direct action: clear imperative command with process target
    if (isImperative && hasProcess) {
      return 'direct_action';
    }

    // Direct action: clear action without ambiguity
    if (hasAction && hasProcess && !this.hasQuestionWords(input)) {
      return 'direct_action';
    }

    // Traditional command patterns
    if (hasAction && !hasProcess) {
      return 'command';
    }

    // Check for questions
    if (this.commandPatterns.get('why_question')?.test(input) ||
        this.commandPatterns.get('help_question')?.test(input)) {
      return 'question';
    }

    // Check for performance/error related queries
    if (this.commandPatterns.get('performance_question')?.test(input) ||
        this.commandPatterns.get('error_question')?.test(input)) {
      return hasAction ? 'hybrid' : 'question';
    }

    // Hybrid: action + question elements
    if (hasAction && this.hasQuestionWords(input)) {
      return 'hybrid';
    }

    // Default to question for natural language
    return 'question';
  }

  hasQuestionWords(input: string): boolean {
    const questionWords = /\b(why|what|how|when|where|who|which|can|could|should|would|will|may|might)\b/i;
    return questionWords.test(input);
  }

  calculateConfidence(
    intent: InputAnalysis['intent'],
    entities: ExtractedEntity[],
    actions: Action[]
  ): number {
    let confidence = 0;

    // Base confidence by intent
    switch (intent) {
      case 'command':
        confidence = 0.9;
        break;
      case 'direct_action':
        confidence = 0.85;
        break;
      case 'hybrid':
        confidence = 0.8;
        break;
      case 'question':
        confidence = 0.6;
        break;
    }

    // Boost confidence based on entities
    if (entities.length > 0) {
      const avgEntityConfidence = entities.reduce((sum, e) => sum + e.confidence, 0) / entities.length;
      confidence = Math.min(1.0, confidence + (avgEntityConfidence * 0.2));
    }

    // Boost confidence if we found clear actions
    if (actions.length > 0) {
      confidence = Math.min(1.0, confidence + 0.1);
    }

    return Math.round(confidence * 100) / 100;
  }

  calculateActionConfidence(
    input: string,
    intent: InputAnalysis['intent'],
    entities: ExtractedEntity[],
    actions: Action[],
    aiDetection?: AIActionDetection | null
  ): number {
    if (actions.length === 0) return 0;

    // If we have AI detection with high confidence, use it directly
    if (aiDetection && aiDetection.action && aiDetection.confidence > 0.7) {
      return aiDetection.confidence;
    }

    let actionConfidence = 0;

    // Base confidence by intent type
    switch (intent) {
      case 'direct_action':
        actionConfidence = 0.9; // High confidence for direct actions
        break;
      case 'command':
        actionConfidence = 0.8;
        break;
      case 'hybrid':
        actionConfidence = 0.6;
        break;
      default:
        actionConfidence = 0.3;
    }

    // Check for imperative patterns (boost confidence)
    const hasImperative = this.commandPatterns.get('imperative_restart')?.test(input) ||
                         this.commandPatterns.get('imperative_stop')?.test(input) ||
                         this.commandPatterns.get('imperative_start')?.test(input) ||
                         this.commandPatterns.get('imperative_show')?.test(input);

    if (hasImperative) {
      actionConfidence = Math.min(1.0, actionConfidence + 0.1);
    }

    // Boost confidence if we have clear process targets
    const processEntities = entities.filter(e => e.type === 'process');
    if (processEntities.length === 1) {
      actionConfidence = Math.min(1.0, actionConfidence + 0.1);
    } else if (processEntities.length > 1) {
      actionConfidence = Math.max(0.4, actionConfidence - 0.1); // Multiple targets reduce confidence
    }

    // Reduce confidence if there are question words
    if (this.hasQuestionWords(input)) {
      actionConfidence = Math.max(0.2, actionConfidence - 0.2);
    }

    // Boost confidence for specific action patterns
    const [firstAction] = actions;
    if (actions.length === 1 && firstAction?.target) {
      actionConfidence = Math.min(1.0, actionConfidence + 0.1);
    }

    return Math.round(actionConfidence * 100) / 100;
  }

  generateProcessedCommand(
    intent: InputAnalysis['intent'],
    entities: ExtractedEntity[],
    actions: Action[]
  ): string | undefined {
    if (intent === 'command' && actions.length > 0) {
      const action = actions[0];
      if (action.target) {
        return `/${action.type} ${action.target}`;
      } else {
        return `/${action.type}`;
      }
    }
    return undefined;
  }

  needsConfirmation(actions: Action[]): boolean {
    return actions.some(action => action.safety === 'dangerous' || action.safety === 'caution');
  }
}