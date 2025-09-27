export interface StatusDisplayResult {
  success: boolean;
  hasProcesses: boolean;
  message?: string;
}

export interface IStatusService {
  displayAllProcesses(): Promise<StatusDisplayResult>;
  displayProcessByName(processName: string): Promise<StatusDisplayResult>;
  getProcessSummary(): Promise<{ hasProcesses: boolean; totalCount: number; onlineCount: number }>;
}