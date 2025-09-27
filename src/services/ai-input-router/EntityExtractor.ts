import { injectable } from 'tsyringe';
import type { ExtractedEntity, AIActionDetection, Action } from '../AIInputRouter';

export interface IEntityExtractor {
  extractEntities(input: string, aiDetection?: AIActionDetection | null): ExtractedEntity[];
  isCommonWord(word: string): boolean;
}

@injectable()
export class EntityExtractor implements IEntityExtractor {
  private actionKeywords: Map<string, Action['type']> = new Map();

  constructor() {
    this.initializeActionKeywords();
  }

  private initializeActionKeywords(): void {
    this.actionKeywords.set('restart', 'restart');
    this.actionKeywords.set('reboot', 'restart');
    this.actionKeywords.set('reload', 'restart');
    this.actionKeywords.set('stop', 'stop');
    this.actionKeywords.set('kill', 'stop');
    this.actionKeywords.set('terminate', 'stop');
    this.actionKeywords.set('start', 'start');
    this.actionKeywords.set('launch', 'start');
    this.actionKeywords.set('run', 'start');
    this.actionKeywords.set('status', 'status');
    this.actionKeywords.set('info', 'status');
    this.actionKeywords.set('state', 'status');
    this.actionKeywords.set('logs', 'logs');
    this.actionKeywords.set('log', 'logs');
    this.actionKeywords.set('metrics', 'metrics');
  }

  extractEntities(input: string, aiDetection?: AIActionDetection | null): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    const lowerInput = input.toLowerCase();

    // Add AI-detected action first if available
    if (aiDetection && aiDetection.action && aiDetection.confidence > 0.5) {
      entities.push({
        type: 'action',
        value: aiDetection.action,
        confidence: aiDetection.confidence
      });

      if (aiDetection.target && aiDetection.target !== 'all') {
        entities.push({
          type: 'process',
          value: aiDetection.target,
          confidence: aiDetection.confidence
        });
      }
    }

    // Extract process names (alphanumeric with hyphens/underscores)
    const processMatches = input.match(/\b([a-zA-Z0-9\-_]+(?:\.[a-zA-Z0-9]+)?)\b/g);
    if (processMatches) {
      processMatches.forEach(match => {
        // Skip common words that aren't process names
        if (!this.isCommonWord(match)) {
          entities.push({
            type: 'process',
            value: match,
            confidence: 0.7
          });
        }
      });
    }

    // Extract actions
    for (const [keyword, actionType] of this.actionKeywords) {
      if (lowerInput.includes(keyword)) {
        entities.push({
          type: 'action',
          value: actionType,
          confidence: 0.9
        });
      }
    }

    // Extract metrics
    const metricKeywords = ['memory', 'cpu', 'usage', 'performance', 'speed'];
    metricKeywords.forEach(keyword => {
      if (lowerInput.includes(keyword)) {
        entities.push({
          type: 'metric',
          value: keyword,
          confidence: 0.8
        });
      }
    });

    // Extract status keywords
    const statusKeywords = ['online', 'offline', 'errored', 'stopped', 'running'];
    statusKeywords.forEach(keyword => {
      if (lowerInput.includes(keyword)) {
        entities.push({
          type: 'status',
          value: keyword,
          confidence: 0.8
        });
      }
    });

    return entities;
  }

  isCommonWord(word: string): boolean {
    const commonWords = new Set([
      'is', 'are', 'was', 'were', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before',
      'after', 'above', 'below', 'between', 'among', 'this', 'that', 'these', 'those',
      'my', 'your', 'his', 'her', 'its', 'our', 'their', 'all', 'some', 'any', 'no',
      'not', 'can', 'could', 'should', 'would', 'will', 'may', 'might', 'must',
      'slow', 'fast', 'why', 'what', 'how', 'when', 'where', 'who', 'which',
      // Add action keywords to prevent them from being treated as process names
      'restart', 'reboot', 'reload', 'stop', 'kill', 'terminate', 'start', 'launch', 'run',
      'status', 'info', 'state', 'logs', 'log', 'metrics', 'show', 'display', 'list', 'check'
    ]);
    return commonWords.has(word.toLowerCase());
  }
}