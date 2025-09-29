import { vi } from 'vitest';

// Mock PM2 module
export default {
  connect: vi.fn((callback) => {
    callback(null);
  }),
  
  disconnect: vi.fn((callback) => {
    if (callback) callback(null);
  }),
  
  list: vi.fn((callback) => {
    const mockProcesses = [
      global.testUtils.mockProcessInfo({
        name: 'test-app-1',
        pm2_env: { ...global.testUtils.mockProcessInfo().pm2_env, pm_id: 0, name: 'test-app-1' }
      }),
      global.testUtils.mockProcessInfo({
        name: 'test-app-2',
        pm2_env: { ...global.testUtils.mockProcessInfo().pm2_env, pm_id: 1, name: 'test-app-2' }
      })
    ];
    callback(null, mockProcesses);
  }),
  
  describe: vi.fn((processName, callback) => {
    const process = global.testUtils.mockProcessInfo({
      name: processName,
      pm2_env: { ...global.testUtils.mockProcessInfo().pm2_env, name: processName }
    });
    callback(null, [process]);
  }),
  
  restart: vi.fn((processName, callback) => {
    callback(null, {});
  }),
  
  stop: vi.fn((processName, callback) => {
    callback(null, {});
  }),
  
  start: vi.fn((processName, callback) => {
    callback(null, {});
  }),
  
  delete: vi.fn((processName, callback) => {
    callback(null, {});
  }),
  
  flush: vi.fn((processName, callback) => {
    callback(null);
  }),
  
  launchBus: vi.fn((callback) => {
    const mockBus = {
      on: vi.fn(),
      close: vi.fn()
    };
    callback(null, mockBus);
  })
};