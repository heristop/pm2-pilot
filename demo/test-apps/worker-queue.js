#!/usr/bin/env node

/**
 * Test Worker Queue - Generates different types of errors for demo
 */

console.log('⚙️ Worker Queue starting...');

// Simulate normal startup
setTimeout(() => {
  console.log('[INFO] Worker queue initialized');
  console.log('[INFO] Connected to Redis queue');
}, 1000);

// Simulate network errors
setTimeout(() => {
  console.error('[ERROR] ENOTFOUND: Host not found - redis.internal.com');
  console.error('[ERROR] Failed to connect to message queue');
}, 3000);

// Simulate permission errors
setTimeout(() => {
  console.error('[ERROR] EACCES: Permission denied accessing /var/log/worker.log');
  console.error('Error: EACCES: permission denied, open \'/var/log/worker.log\'');
}, 5000);

// Main worker loop
let jobCount = 0;

const processJob = () => {
  jobCount++;
  
  // Simulate successful job processing
  if (Math.random() < 0.7) {
    console.log(`[INFO] Processed job #${jobCount} successfully`);
  } else {
    // Simulate job failures
    console.error(`[ERROR] Job #${jobCount} failed: Invalid payload format`);
    console.error('SyntaxError: Unexpected token } in JSON at position 45');
  }
};

// Process jobs every 3 seconds
const jobInterval = setInterval(processJob, 3000);

// Simulate memory leak warnings
setTimeout(() => {
  console.warn('MaxListenersExceededWarning: Possible EventEmitter memory leak detected');
  console.warn('11 listeners added to [Redis]. Use emitter.setMaxListeners() to increase limit');
}, 8000);

// Simulate runtime errors periodically
setInterval(() => {
  if (Math.random() < 0.15) {
    console.error('ReferenceError: queueProcessor is not defined');
    console.error('    at Worker.processMessage (/app/worker.js:67:5)');
  }
}, 12000);

process.on('SIGINT', () => {
  console.log('🛑 Worker Queue shutting down...');
  clearInterval(jobInterval);
  process.exit(0);
});