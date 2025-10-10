import 'reflect-metadata';
import { injectable, inject } from 'tsyringe';
import type { AIProvider } from './ai-providers/types';
import type { LogEntry } from '../pm2/PM2Client';

export interface ParsedError {
  type: string;
  message: string;
  filePath?: string;
  lineNumber?: number;
  stackTrace?: string;
  processName: string;
  timestamp: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'module' | 'syntax' | 'runtime' | 'network' | 'permission' | 'resource' | 'other';
  context: string;
}

export interface ErrorDiagnosis {
  summary: string;
  rootCause: string;
  actionableSuggestions: string[];
  followUpCommands: string[];
  severity: 'critical' | 'high' | 'medium' | 'low';
  confidence: number;
}

export interface ErrorAnalysisResult {
  hasErrors: boolean;
  errorCount: number;
  parsedErrors: ParsedError[];
  diagnosis?: ErrorDiagnosis;
  quickFix?: string;
}

@injectable()
export class ErrorAnalysisService {
  constructor(@inject('AIProvider') private aiProvider: AIProvider) {}

  async analyzeLogErrors(logs: LogEntry[], _processName?: string): Promise<ErrorAnalysisResult> {
    if (!logs || logs.length === 0) {
      return {
        hasErrors: false,
        errorCount: 0,
        parsedErrors: []
      };
    }

    // Parse errors from logs
    const parsedErrors = await this.parseErrorsFromLogs(logs);
    
    if (parsedErrors.length === 0) {
      return {
        hasErrors: false,
        errorCount: 0,
        parsedErrors: []
      };
    }

    // Get AI diagnosis if provider is available
    let diagnosis: ErrorDiagnosis | undefined;
    let quickFix: string | undefined;

    if (this.aiProvider.isConfigured()) {
      try {
        diagnosis = await this.getDiagnosisFromAI(parsedErrors, logs);
        quickFix = await this.generateQuickFix(parsedErrors[0]); // Focus on most recent/critical error
      } catch (error) {
        console.debug('AI analysis failed, falling back to pattern matching:', error);
        // Fall back to pattern-based analysis
        diagnosis = this.getFallbackDiagnosis(parsedErrors);
      }
    } else {
      // Fall back to pattern-based analysis
      diagnosis = this.getFallbackDiagnosis(parsedErrors);
    }

    return {
      hasErrors: true,
      errorCount: parsedErrors.length,
      parsedErrors,
      diagnosis,
      quickFix
    };
  }

  private async parseErrorsFromLogs(logs: LogEntry[]): Promise<ParsedError[]> {
    const errors: ParsedError[] = [];

    for (const log of logs) {
      if (log.level === 'error' || this.isErrorMessage(log.message)) {
        const parsedError = await this.parseErrorMessage(log);
        if (parsedError) {
          errors.push(parsedError);
        }
      }
    }

    return errors.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  private isErrorMessage(message: string): boolean {
    const errorIndicators = [
      'error', 'exception', 'failed', 'cannot', 'unable', 'not found',
      'ECONNREFUSED', 'ENOTFOUND', 'EACCES', 'ETIMEDOUT', 'ERR_MODULE_NOT_FOUND',
      'TypeError', 'ReferenceError', 'SyntaxError', 'UnhandledPromiseRejectionWarning'
    ];

    const lowerMessage = message.toLowerCase();
    return errorIndicators.some(indicator => lowerMessage.includes(indicator.toLowerCase()));
  }

  private async parseErrorMessage(log: LogEntry): Promise<ParsedError | null> {
    const message = log.message.trim();
    
    // Extract error type and details
    const errorType = this.extractErrorType(message);
    const filePath = this.extractFilePath(message);
    const lineNumber = this.extractLineNumber(message);
    const stackTrace = this.extractStackTrace(message);
    
    // Determine severity and category
    const severity = this.determineSeverity(message, errorType);
    const category = this.categorizeError(message, errorType);

    return {
      type: errorType,
      message: message,
      filePath,
      lineNumber,
      stackTrace,
      processName: log.process,
      timestamp: log.timestamp,
      severity,
      category,
      context: this.extractErrorContext(message)
    };
  }

  private extractErrorType(message: string): string {
    // Enhanced error type extraction
    if (message.includes('ERR_MODULE_NOT_FOUND')) return 'Module Not Found';
    if (message.includes('ECONNREFUSED')) return 'Connection Refused';
    if (message.includes('ENOTFOUND')) return 'Host Not Found';
    if (message.includes('EACCES')) return 'Permission Denied';
    if (message.includes('ETIMEDOUT')) return 'Connection Timeout';
    if (message.includes('TypeError')) return 'Type Error';
    if (message.includes('ReferenceError')) return 'Reference Error';
    if (message.includes('SyntaxError')) return 'Syntax Error';
    if (message.includes('UnhandledPromiseRejectionWarning')) return 'Unhandled Promise Rejection';
    if (message.includes('MaxListenersExceededWarning')) return 'Memory Leak Warning';
    if (message.includes('Error: Cannot find module')) return 'Missing Module';
    
    // Generic error detection
    const errorMatch = message.match(/(\w+Error):/);
    if (errorMatch) return errorMatch[1];
    
    return 'Runtime Error';
  }

  private extractFilePath(message: string): string | undefined {
    // Extract file paths from error messages
    const patterns = [
      /['"`]([^'"`]*\.(js|ts|mjs|cjs|json))['"`]/,
      /at file:\/\/\/([^)\s]+)/,
      /Cannot find module\s+['"`]([^'"`]+)['"`]/,
      /\s+at\s+([^:\s]+\.(js|ts|mjs|cjs)):/,
      /Error.*?([/\w.-]+\.(js|ts|mjs|cjs|json))/
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return undefined;
  }

  private extractLineNumber(message: string): number | undefined {
    const lineMatch = message.match(/:(\d+):\d+/);
    return lineMatch ? parseInt(lineMatch[1], 10) : undefined;
  }

  private extractStackTrace(message: string): string | undefined {
    const lines = message.split('\n');
    const stackLines = lines.filter(line => line.trim().startsWith('at '));
    return stackLines.length > 0 ? stackLines.join('\n') : undefined;
  }

  private determineSeverity(message: string, errorType: string): 'critical' | 'high' | 'medium' | 'low' {
    // Critical errors that prevent startup
    if (errorType === 'Module Not Found' || errorType === 'Syntax Error') return 'critical';
    if (message.includes('Cannot find module') && message.includes('imported from')) return 'critical';
    
    // High severity errors affecting functionality
    if (errorType === 'Connection Refused' || errorType === 'Permission Denied') return 'high';
    if (errorType === 'Type Error' || errorType === 'Reference Error') return 'high';
    
    // Medium severity errors
    if (errorType === 'Connection Timeout' || errorType === 'Host Not Found') return 'medium';
    if (errorType === 'Unhandled Promise Rejection') return 'medium';
    
    // Low severity warnings
    if (errorType === 'Memory Leak Warning') return 'low';
    
    return 'medium';
  }

  private categorizeError(message: string, errorType: string): ParsedError['category'] {
    if (errorType.includes('Module') || message.includes('Cannot find module')) return 'module';
    if (errorType === 'Syntax Error') return 'syntax';
    if (errorType.includes('Connection') || errorType.includes('ECONN') || errorType.includes('ENOTFOUND')) return 'network';
    if (errorType.includes('Permission') || message.includes('EACCES')) return 'permission';
    if (errorType.includes('Memory') || message.includes('MaxListeners')) return 'resource';
    if (errorType.includes('Type') || errorType.includes('Reference')) return 'runtime';
    
    return 'other';
  }

  private extractErrorContext(message: string): string {
    // Extract meaningful context from error message
    const lines = message.split('\n');
    const mainError = lines[0];
    
    // Look for contextual information
    if (message.includes('imported from')) {
      const importMatch = message.match(/imported from (.+)/);
      if (importMatch) {
        return `Error occurred while importing from ${importMatch[1]}`;
      }
    }
    
    if (message.includes('at ')) {
      const locationMatch = message.match(/at ([^(]+)/);
      if (locationMatch) {
        return `Error in function: ${locationMatch[1].trim()}`;
      }
    }
    
    return mainError.length > 100 ? mainError.substring(0, 100) + '...' : mainError;
  }

  private async getDiagnosisFromAI(errors: ParsedError[], logs: LogEntry[]): Promise<ErrorDiagnosis> {
    const prompt = this.buildDiagnosisPrompt(errors, logs);
    const response = await this.aiProvider.query(prompt);
    
    return this.parseDiagnosisResponse(response, errors);
  }

  private buildDiagnosisPrompt(errors: ParsedError[], _logs: LogEntry[]): string {
    const errorSummary = errors.slice(0, 3).map(error => 
      `${error.type}: ${error.message.substring(0, 200)}`
    ).join('\n');

    return `Analyze these PM2 process errors and provide actionable diagnosis:

ERRORS:
${errorSummary}

TASK: Provide intelligent diagnosis with:
1. Root cause analysis
2. Specific actionable fixes
3. Recommended PM2+ commands
4. Prevention strategies

Focus on the most critical issue first. Be specific and practical.

RESPONSE FORMAT:
{
  "summary": "Brief description of main issue",
  "rootCause": "Technical explanation of why this happened", 
  "actionableSuggestions": ["Specific step 1", "Specific step 2", "Specific step 3"],
  "followUpCommands": ["pm2plus command 1", "pm2plus command 2"],
  "severity": "critical|high|medium|low",
  "confidence": 0.95
}`;
  }

  private parseDiagnosisResponse(response: string, errors: ParsedError[]): ErrorDiagnosis {
    try {
      const cleaned = response.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '');
      const parsed = JSON.parse(cleaned);
      
      return {
        summary: parsed.summary || 'Error analysis completed',
        rootCause: parsed.rootCause || 'Unable to determine root cause',
        actionableSuggestions: Array.isArray(parsed.actionableSuggestions) ? parsed.actionableSuggestions : [],
        followUpCommands: Array.isArray(parsed.followUpCommands) ? parsed.followUpCommands : [],
        severity: parsed.severity || 'medium',
        confidence: parsed.confidence || 0.7
      };
    } catch {
      // Fallback to pattern-based analysis if JSON parsing fails
      return this.getFallbackDiagnosis(errors);
    }
  }

  private getFallbackDiagnosis(errors: ParsedError[]): ErrorDiagnosis {
    const mainError = errors[0];
    
    switch (mainError.category) {
      case 'module':
        return {
          summary: 'Module or file not found',
          rootCause: 'The application is trying to load a module or file that doesn\'t exist',
          actionableSuggestions: [
            'Check if the referenced file exists at the specified path',
            'Verify the file path in your PM2 configuration',
            'Run npm install to ensure all dependencies are installed'
          ],
          followUpCommands: ['restart the process after fixing the path'],
          severity: 'critical',
          confidence: 0.8
        };
        
      case 'network':
        return {
          summary: 'Network connectivity issue',
          rootCause: 'Unable to establish network connection to required service',
          actionableSuggestions: [
            'Check if the target service is running and accessible',
            'Verify network configuration and firewall settings',
            'Confirm connection URLs and ports are correct'
          ],
          followUpCommands: ['check process health', 'restart affected processes'],
          severity: 'high',
          confidence: 0.7
        };
        
      case 'permission':
        return {
          summary: 'Permission or access denied',
          rootCause: 'Insufficient permissions to access required resources',
          actionableSuggestions: [
            'Check file and directory permissions',
            'Ensure PM2 is running with appropriate user privileges',
            'Verify write access to log and PID directories'
          ],
          followUpCommands: ['check process status', 'restart with proper permissions'],
          severity: 'high',
          confidence: 0.8
        };
        
      default:
        return {
          summary: 'Application runtime error detected',
          rootCause: 'Runtime error occurred during application execution',
          actionableSuggestions: [
            'Review application code for the reported error',
            'Check application logs for additional context',
            'Consider adding better error handling'
          ],
          followUpCommands: ['show recent logs', 'restart the process'],
          severity: mainError.severity,
          confidence: 0.6
        };
    }
  }

  private async generateQuickFix(error: ParsedError): Promise<string | undefined> {
    if (!this.aiProvider.isConfigured()) {
      return this.getPatternBasedQuickFix(error);
    }

    try {
      const prompt = `Generate a single, specific quick fix command for this error:

ERROR: ${error.type}
MESSAGE: ${error.message.substring(0, 300)}
CATEGORY: ${error.category}

Provide ONE specific action the user can take immediately. Be concrete and actionable.
Format: Just the action, no explanation.`;

      const response = await this.aiProvider.query(prompt);
      return response.trim().replace(/^["']|["']$/g, '');
    } catch {
      return this.getPatternBasedQuickFix(error);
    }
  }

  private getPatternBasedQuickFix(error: ParsedError): string | undefined {
    switch (error.category) {
      case 'module':
        if (error.filePath) {
          return `Check if file exists: ${error.filePath}`;
        }
        return 'Run npm install to install missing dependencies';
        
      case 'network':
        return 'Verify target service is running and accessible';
        
      case 'permission':
        return 'Check file permissions and user access rights';
        
      case 'syntax':
        if (error.filePath && error.lineNumber) {
          return `Fix syntax error in ${error.filePath} at line ${error.lineNumber}`;
        }
        return 'Review code for syntax errors';
        
      default:
        return 'Restart the process to clear temporary issues';
    }
  }
}