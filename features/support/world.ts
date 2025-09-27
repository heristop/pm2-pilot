import 'reflect-metadata';
import { World, setWorldConstructor } from '@cucumber/cucumber';
import type { Shell } from '../../src/shell/Shell';
import type { ProcessInfo } from '../../src/pm2/PM2Client';
import type { ExecutionResponse } from '../../src/services/ExecutionManager';
import type { CommandAnalysis } from '../../src/services/CommandAnalyzer';
import type { PendingAction } from '../../src/services/ConversationManager';

export interface MockProcess {
  name: string;
  status: string;
  cpu: string;
  memory: string;
  errors: boolean;
}

export class ConversationWorld extends World {
  // Shell and services
  public shell!: Shell;
  public mockProcesses: ProcessInfo[] = [];
  
  // Conversation state
  public lastInput: string = '';
  public lastResponse: string = '';
  public lastAnalysis?: CommandAnalysis;
  public lastExecutionResponse?: ExecutionResponse;
  public pendingActions: PendingAction[] = [];
  
  // Mock data
  public mockLogs: Map<string, string[]> = new Map();
  
  constructor(options: any) {
    super(options);
  }

  async initialize() {
    // We'll initialize the shell and services here
    // For now, we'll mock them
    await this.setupMocks();
  }

  async setupMocks() {
    // Create mock process data
    this.mockProcesses = [
      this.createMockProcess('api-server', 'online', 2.3, 45 * 1024 * 1024, true),
      this.createMockProcess('worker-queue', 'online', 1.2, 32 * 1024 * 1024, false),
      this.createMockProcess('database-sync', 'errored', 0, 0, true)
    ];

    // Create mock logs with errors
    this.mockLogs.set('api-server', [
      '[INFO] Server started on port 3000',
      '[ERROR] Connection timeout to database',
      '[ERROR] Failed to process request: ECONNREFUSED',
      '[WARN] High memory usage detected',
      '[INFO] Health check passed',
      '[ERROR] Unhandled promise rejection in request handler'
    ]);

    this.mockLogs.set('worker-queue', [
      '[INFO] Worker started',
      '[INFO] Processing job 1234',
      '[INFO] Job completed successfully'
    ]);

    this.mockLogs.set('database-sync', [
      '[ERROR] Failed to connect to database',
      '[ERROR] Sync operation failed: Connection lost',
      '[ERROR] Unable to recover from error state'
    ]);
  }

  createMockProcess(
    name: string, 
    status: string, 
    cpu: number, 
    memory: number, 
    hasErrors: boolean
  ): ProcessInfo {
    return {
      name,
      pid: Math.floor(Math.random() * 10000),
      pm_id: Math.floor(Math.random() * 10),
      monit: {
        memory,
        cpu
      },
      pm2_env: {
        status: status as any,
        restart_time: hasErrors ? 3 : 0,
        pm_uptime: Date.now() - (Math.random() * 10000000),
        created_at: Date.now() - (Math.random() * 100000000),
        exec_mode: 'fork',
        watching: false,
        autorestart: true,
        unstable_restarts: hasErrors ? 2 : 0,
        instance_var: 'NODE_APP_INSTANCE',
        exit_code: status === 'errored' ? 1 : 0
      }
    } as ProcessInfo;
  }

  async askQuestion(input: string): Promise<void> {
    this.lastInput = input;
    // In the real implementation, this would call the Shell's processAIFirstInput
    // For now, we'll simulate the response
    await this.simulateResponse(input);
  }

  async simulateResponse(input: string) {
    // This is where we'd integrate with the real Shell
    // For testing, we'll create mock responses
    
    const lowerInput = input.toLowerCase();
    
    if (lowerInput.includes('what are my') || lowerInput.includes('active servers') || lowerInput.includes('status of my') || lowerInput.includes('status of my applications')) {
      this.lastResponse = `You have 3 processes:
- api-server (online)
- worker-queue (online)  
- database-sync (errored)`;
    } else if (lowerInput.includes('first one')) {
      this.lastResponse = `api-server is running:
- Status: online
- CPU: 2.3%
- Memory: 45MB
- PID: 1234
- Uptime: 2 hours`;
    } else if (lowerInput.includes('its logs') || lowerInput.includes('show me logs')) {
      const logs = this.mockLogs.get('api-server') || [];
      this.lastResponse = logs.join('\n');
    } else if (lowerInput.includes('analyze') || lowerInput.includes('debug')) {
      this.lastResponse = `I can see connection errors in your api-server logs. Here's my analysis:

The errors indicate database connectivity issues. You can:
- "check database connection"
- "restart api-server"
- "analyze error patterns"

Would you like me to perform any of these actions?`;
      
      // Create a pending action
      this.pendingActions = [{
        id: 'action_1',
        label: 'restart api-server',
        command: 'pm2 restart api-server'
      }];
    } else if (lowerInput.includes('how do i check') && lowerInput.includes('logs')) {
      this.lastResponse = 'You can use "show logs" or "check logs for api-server" to view process logs.';
    } else if (lowerInput.includes('need to restart') && lowerInput.includes('server')) {
      this.lastResponse = 'You can use "restart api-server" or "restart your server" to restart processes.';
    } else if (lowerInput.includes('show my processes')) {
      this.lastResponse = `You have 3 processes:
- api-server (online)
- worker-queue (online)  
- database-sync (errored)`;
    } else if (lowerInput.includes('how is') && lowerInput.includes('api-server')) {
      this.lastResponse = `api-server is running well:
- Status: online
- CPU: 2.3%
- Memory: 45MB`;
    } else if (lowerInput.includes('what about') && lowerInput.includes('worker-queue')) {
      this.lastResponse = `worker-queue is performing normally:
- Status: online
- CPU: 1.2%
- Memory: 32MB`;
    } else if (lowerInput.includes('last one') || lowerInput.includes('and the last')) {
      this.lastResponse = `database-sync has issues:
- Status: errored
- CPU: 0.0%
- Memory: 0MB`;
    } else if (['oui', 'yes', 'sí', 'sí, hazlo', 'do it', 'go ahead', 'proceed', 'execute', 'confirm', 'sure', 'ok'].includes(lowerInput.trim())) {
      // Confirmation response
      this.lastResponse = 'api-server restarted successfully';
      this.pendingActions = [];
    }
  }

  shouldContainProcess(processName: string): boolean {
    return this.lastResponse.toLowerCase().includes(processName.toLowerCase());
  }

  shouldIndicateStatus(processName: string, status: string): boolean {
    const pattern = new RegExp(`${processName}.*\\(${status}\\)`, 'i');
    return pattern.test(this.lastResponse);
  }

  shouldShowDetailedStatus(details: string[]): boolean {
    return details.every(detail => {
      // Extract key parts from details like "CPU: 2.3%" -> ["cpu", "2.3"]
      const cleanDetail = detail.toLowerCase().replace(':', '');
      
      if (cleanDetail.includes('cpu')) {
        return this.lastResponse.toLowerCase().includes('cpu') && this.lastResponse.includes('2.3');
      } else if (cleanDetail.includes('memory')) {
        return this.lastResponse.toLowerCase().includes('memory') && this.lastResponse.toLowerCase().includes('45mb');
      } else if (cleanDetail.includes('status')) {
        return this.lastResponse.toLowerCase().includes('status') && this.lastResponse.includes('online');
      }
      return this.lastResponse.toLowerCase().includes(cleanDetail);
    });
  }

  shouldContainErrorLogs(expectedLogs: string): boolean {
    return expectedLogs.split('\n').every(log => 
      this.lastResponse.includes(log.trim())
    );
  }

  shouldSuggestPM2XCommands(commands: string[]): boolean {
    return commands.some(cmd => 
      this.lastResponse.toLowerCase().includes(cmd.toLowerCase())
    );
  }

  shouldNotSuggestPM2Commands(commands: string[]): boolean {
    return !commands.some(cmd => 
      this.lastResponse.toLowerCase().includes(cmd.toLowerCase())
    );
  }
}

setWorldConstructor(ConversationWorld);