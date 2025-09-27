export interface ProcessOperationResult {
  success: boolean;
  message: string;
  processCount?: number;
  error?: string;
}

export interface IPM2Manager {
  restartAll(): Promise<ProcessOperationResult>;
  restartProcess(name: string): Promise<ProcessOperationResult>;
  stopAll(): Promise<ProcessOperationResult>;
  stopProcess(name: string): Promise<ProcessOperationResult>;
  startProcess(name: string): Promise<ProcessOperationResult>;
  deleteProcess(name: string): Promise<ProcessOperationResult>;
  reloadProcess(name: string): Promise<ProcessOperationResult>;
  getProcessStatus(): Promise<{ hasProcesses: boolean; processCount: number; onlineCount: number }>;
}