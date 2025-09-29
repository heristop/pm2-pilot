import { injectable, inject } from 'tsyringe';
import type { IPM2Client } from '../interfaces/IPM2Client';
import type { IPM2Manager } from '../interfaces/IPM2Manager';

export interface ProcessOperationResult {
  success: boolean;
  message: string;
  processCount?: number;
  error?: string;
}

@injectable()
export class PM2Manager implements IPM2Manager {
  constructor(@inject('IPM2Client') private client: IPM2Client) {}

  async restartAll(): Promise<ProcessOperationResult> {
    try {
      const processes = await this.client.list();

      if (processes.length === 0) {
        return {
          success: true,
          message: 'No processes to restart',
          processCount: 0
        };
      }

      await this.client.restart('all');

      return {
        success: true,
        message: `✅ Restarted ${processes.length} processes successfully`,
        processCount: processes.length
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        message: 'Failed to restart processes',
        error: message
      };
    }
  }

  async restartProcess(name: string): Promise<ProcessOperationResult> {
    try {
      await this.client.restart(name);
      
      return {
        success: true,
        message: `✅ Restarted "${name}" successfully`
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        message: `Failed to restart "${name}"`,
        error: message
      };
    }
  }

  async stopAll(): Promise<ProcessOperationResult> {
    try {
      const processes = await this.client.list();
      const onlineProcesses = processes.filter(p => p.pm2_env.status === 'online');
      
      if (onlineProcesses.length === 0) {
        return {
          success: true,
          message: 'No online processes to stop',
          processCount: 0
        };
      }

      await this.client.stop('all');

      return {
        success: true,
        message: `✅ Stopped ${onlineProcesses.length} processes successfully`,
        processCount: onlineProcesses.length
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        message: 'Failed to stop processes',
        error: message
      };
    }
  }

  async stopProcess(name: string): Promise<ProcessOperationResult> {
    try {
      await this.client.stop(name);

      return {
        success: true,
        message: `✅ Stopped "${name}" successfully`
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        message: `Failed to stop "${name}"`,
        error: message
      };
    }
  }

  async startProcess(name: string): Promise<ProcessOperationResult> {
    try {
      await this.client.start(name);

      return {
        success: true,
        message: `✅ Started "${name}" successfully`
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        message: `Failed to start "${name}"`,
        error: message
      };
    }
  }

  async deleteProcess(name: string): Promise<ProcessOperationResult> {
    try {
      await this.client.delete(name);

      return {
        success: true,
        message: `✅ Deleted "${name}" successfully`
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        message: `Failed to delete "${name}"`,
        error: message
      };
    }
  }

  async reloadProcess(name: string): Promise<ProcessOperationResult> {
    try {
      await this.client.reload(name);

      return {
        success: true,
        message: `✅ Reloaded "${name}" successfully`
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        message: `Failed to reload "${name}"`,
        error: message
      };
    }
  }

  async getProcessStatus(): Promise<{ hasProcesses: boolean; processCount: number; onlineCount: number }> {
    try {
      const processes = await this.client.list();
      const onlineProcesses = processes.filter(p => p.pm2_env.status === 'online');
      
      return {
        hasProcesses: processes.length > 0,
        processCount: processes.length,
        onlineCount: onlineProcesses.length
      };
    } catch {

      return {
        hasProcesses: false,
        processCount: 0,
        onlineCount: 0
      };
    }
  }
}