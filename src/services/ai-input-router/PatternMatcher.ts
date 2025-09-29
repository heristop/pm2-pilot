import { injectable } from 'tsyringe';

export interface IPatternMatcher {
  getPattern(patternName: string): RegExp | undefined;
  testPattern(patternName: string, input: string): boolean;
  getCommandPatterns(): Map<string, RegExp>;
}

@injectable()
export class PatternMatcher implements IPatternMatcher {
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

  getPattern(patternName: string): RegExp | undefined {
    return this.commandPatterns.get(patternName);
  }

  testPattern(patternName: string, input: string): boolean {
    const pattern = this.commandPatterns.get(patternName);
    return pattern ? pattern.test(input) : false;
  }

  getCommandPatterns(): Map<string, RegExp> {
    return new Map(this.commandPatterns);
  }
}