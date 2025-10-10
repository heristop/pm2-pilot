import { injectable, inject } from 'tsyringe';
import type { Action, ExtractedEntity, AIActionDetection } from '../AIInputRouter';
import type { AIProvider } from '../ai-providers/types';

export interface IActionDetector {
  extractActions(input: string, entities: ExtractedEntity[], aiDetection?: AIActionDetection | null): Action[];
  getSafetyLevel(actionType: Action['type']): Action['safety'];
  detectActionsWithAI(input: string): Promise<AIActionDetection>;
  normalizeDetection(parsed: unknown, originalText: string): AIActionDetection;
}

@injectable()
export class ActionDetector implements IActionDetector {
  constructor(@inject('AIProvider') private aiProvider: AIProvider | null = null) {}

  extractActions(input: string, entities: ExtractedEntity[], aiDetection?: AIActionDetection | null): Action[] {
    const actions: Action[] = [];
    const lowerInput = input.toLowerCase();

    // Prioritize AI-detected actions if available and confident
    if (aiDetection?.action && aiDetection.confidence > 0.5) {
      const target = aiDetection.target === 'all' ? 'all' : aiDetection.target;
      const description = target
        ? `${aiDetection.action} ${target}`
        : aiDetection.action;

      actions.push({
        type: aiDetection.action,
        target: target ?? undefined,
        safety: this.getSafetyLevel(aiDetection.action),
        description: description
      });

      return actions; // Return AI-detected action as primary
    }

    // Extract actions from entities (fallback)
    const actionEntities = entities.filter(e => e.type === 'action');
    const processEntities = entities.filter(e => e.type === 'process');

    // Handle batch operations first (takes precedence)
    if (lowerInput.includes('all') || lowerInput.includes('everything')) {
      if (actionEntities.length > 0) {
        const actionType = actionEntities[0]?.value as Action['type'] | undefined;
        
        if (!actionType) {
          return actions;
        }

        actions.push({
          type: actionType,
          target: 'all',
          safety: 'dangerous',
          description: `${actionType} all processes`
        });
      }
    } else {
      // Handle specific process or general actions
      actionEntities.forEach(actionEntity => {
        const actionType = actionEntity.value as Action['type'];

        if (processEntities.length > 0) {
          // Specific process actions
          processEntities.forEach(processEntity => {
            actions.push({
              type: actionType,
              target: processEntity.value,
              safety: this.getSafetyLevel(actionType),
              description: `${actionType} ${processEntity.value}`
            });
          });
        } else {
          // General action
          actions.push({
            type: actionType,
            safety: this.getSafetyLevel(actionType),
            description: actionType
          });
        }
      });
    }

    return actions;
  }

  getSafetyLevel(actionType: Action['type']): Action['safety'] {
    switch (actionType) {
      case 'stop':
        return 'dangerous';
      case 'restart':
        return 'caution';
      case 'start':
        return 'caution';
      case 'status':
      case 'logs':
      case 'metrics':
      case 'info':
        return 'safe';
      default:
        return 'safe';
    }
  }

  async detectActionsWithAI(input: string): Promise<AIActionDetection> {
    if (!this.aiProvider) {
      return {
        action: null,
        target: null,
        confidence: 0,
        detectedLanguage: 'Unknown',
        originalText: input
      };
    }

    const prompt = `You are a PM2+ action detector. Analyze the user input and determine if it contains a process management command in ANY language.

INPUT: "${input}"

TASK: Extract action information if present, respond with JSON only:

VALID ACTIONS: restart, stop, start, status, logs, metrics, info
VALID TARGETS: specific process name, "all", or null

EXAMPLES:
- "reload my instances" → {"action": "restart", "target": "all", "confidence": 0.9, "detectedLanguage": "English"}
- "restart my-app" → {"action": "restart", "target": "my-app", "confidence": 0.95, "detectedLanguage": "English"}
- "stop everything" → {"action": "stop", "target": "all", "confidence": 0.9, "detectedLanguage": "English"}
- "how are things?" → {"action": null, "target": null, "confidence": 0, "detectedLanguage": "English"}
- "stop all" → {"action": "stop", "target": "all", "confidence": 0.9, "detectedLanguage": "English"}

OUTPUT ONLY valid JSON in this format:
{"action": "...", "target": "...", "confidence": 0.0, "detectedLanguage": "..."}`;

    try {
      const response = await this.aiProvider.query(prompt);
      const cleanResponse = response.trim().replace(/```json|```/g, '');
      const parsed = JSON.parse(cleanResponse) as unknown;

      return this.normalizeDetection(parsed, input);
    } catch {
      // Return null detection if AI fails
      return {
        action: null,
        target: null,
        confidence: 0,
        detectedLanguage: 'Unknown',
        originalText: input
      };
    }
  }

  normalizeDetection(parsed: unknown, originalText: string): AIActionDetection {
    if (typeof parsed !== 'object' || parsed === null) {
      return {
        action: null,
        target: null,
        confidence: 0,
        detectedLanguage: 'Unknown',
        originalText
      };
    }

    const record = parsed as Record<string, unknown>;
    const actionValueRaw = record['action'];
    const targetValueRaw = record['target'];
    const confidenceValueRaw = record['confidence'];
    const languageValueRaw = record['detectedLanguage'];

    const actionValue = typeof actionValueRaw === 'string' ? actionValueRaw : null;
    const targetValue = typeof targetValueRaw === 'string' ? targetValueRaw : null;
    const confidenceValue = typeof confidenceValueRaw === 'number' ? confidenceValueRaw : 0;
    const languageValue = typeof languageValueRaw === 'string' ? languageValueRaw : 'Unknown';

    const validActions: Array<AIActionDetection['action']> = ['restart', 'stop', 'start', 'status', 'logs', 'metrics', 'info'];
    const action = actionValue && validActions.includes(actionValue as AIActionDetection['action'])
      ? actionValue as AIActionDetection['action']
      : null;

    return {
      action,
      target: targetValue,
      confidence: Math.max(0, Math.min(1, confidenceValue)),
      detectedLanguage: languageValue,
      originalText
    };
  }
}