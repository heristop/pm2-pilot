export interface ProcessInfo {
  pid: number;
  name: string;
  status: string;
  cpu: number;
  memory: number;
  uptime: number;
  restarts: number;
  user: string;
  watching: boolean;
  unstable_restarts: number;
  created_at: number;
  pm2_env: {
    pm_id: number;
    name: string;
    status: string;
    pm_uptime: number | null;
    restart_time: number;
    unstable_restarts: number;
    created_at: number | null;
    watching: boolean;
    username: string;
    exec_mode: string;
    node_version: string;
    pm_exec_path?: string;
    args?: string[];
    instances?: number;
    env?: Record<string, string>;
    pm_cwd?: string;
    pm_err_log_path?: string;
    pm_out_log_path?: string;
    merge_logs?: boolean;
    autorestart?: boolean;
    watch?: boolean;
    max_memory_restart?: string;
    node_args?: string[];
    [key: string]: unknown;
  };
  monit: {
    memory: number;
    cpu: number;
  };
}