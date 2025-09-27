import 'reflect-metadata';
import { beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

// Global test setup
beforeAll(() => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.PM2_CLI_TEST = 'true';
  
  // Mock console methods to reduce noise in tests
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  // Cleanup after all tests
  vi.restoreAllMocks();
});

beforeEach(() => {
  // Reset all mocks before each test
  vi.clearAllMocks();
});

afterEach(() => {
  // Cleanup after each test
  vi.clearAllTimers();
});

// Global test utilities
declare global {
  var testUtils: {
    mockProcessInfo: (overrides?: Partial<any>) => any;
    mockShell: () => any;
    mockPM2Client: () => any;
  };
}

// Test utilities
global.testUtils = {
  mockProcessInfo: (overrides = {}) => ({
    pid: 12345,
    name: 'test-process',
    status: 'online',
    cpu: 1.5,
    memory: 104857600, // 100MB in bytes
    uptime: 3600000, // 1 hour in ms
    restarts: 0,
    user: 'testuser',
    watching: false,
    unstable_restarts: 0,
    created_at: Date.now() - 3600000,
    pm2_env: {
      pm_id: 0,
      name: 'test-process',
      status: 'online',
      pm_uptime: Date.now() - 3600000,
      restart_time: 0,
      unstable_restarts: 0,
      created_at: Date.now() - 3600000,
      watching: false,
      username: 'testuser',
      exec_mode: 'fork',
      node_version: '22.0.0',
      pm_exec_path: '/path/to/app.js',
      args: [],
      instances: 1,
      env: {},
      pm_cwd: '/path/to/app',
      pm_err_log_path: '/path/to/err.log',
      pm_out_log_path: '/path/to/out.log',
      merge_logs: false,
      autorestart: true,
      watch: false,
      max_memory_restart: undefined,
      node_args: []
    },
    monit: {
      memory: 104857600,
      cpu: 1.5
    },
    ...overrides
  }),

  mockShell: () => ({
    client: global.testUtils.mockPM2Client(),
    display: {
      formatMemory: vi.fn((bytes: number) => `${Math.round(bytes / 1024 / 1024)}MB`),
      formatUptime: vi.fn((uptime: number) => `${Math.round((Date.now() - uptime) / 1000)}s`),
      colorizeStatus: vi.fn((status: string) => status),
      renderTable: vi.fn(),
      renderProcessStatus: vi.fn(),
      renderProcessList: vi.fn(),
      renderProcessDetail: vi.fn()
    },
    exit: vi.fn(),
    prompt: vi.fn()
  }),

  mockPM2Client: () => ({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([global.testUtils.mockProcessInfo()]),
    describe: vi.fn().mockResolvedValue([global.testUtils.mockProcessInfo()]),
    restart: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    flush: vi.fn().mockResolvedValue(undefined),
    logs: vi.fn().mockResolvedValue([]),
    getErrorLogs: vi.fn().mockResolvedValue([]),
    launchBus: vi.fn().mockImplementation((callback) => {
      callback(null, {
        on: vi.fn(),
        close: vi.fn()
      });
    })
  })
};