#!/usr/bin/env node

/**
 * Test Database Sync - Critical errors that cause process failure
 */

console.log('💾 Database Sync starting...');

// Simulate immediate critical error that would cause PM2 to restart
setTimeout(() => {
  console.error('Error [ERR_MODULE_NOT_FOUND]: Cannot find module \'./config/database.json\'');
  console.error('    at ModuleLoader.resolve (node:internal/modules/esm/loader:582:38)');
  console.error('    at async main (/app/sync.js:15:18)');
  
  // This would normally cause the process to exit, but we'll keep it running for demo
  console.error('[CRITICAL] Failed to load database configuration');
}, 1000);

// Simulate additional critical errors
setTimeout(() => {
  console.error('TypeError: Cannot read properties of undefined (reading \'connectionString\')');
  console.error('    at DatabaseSync.connect (/app/sync.js:45:12)');
  console.error('    at async DatabaseSync.start (/app/sync.js:23:5)');
}, 3000);

// Simulate connection timeouts
setTimeout(() => {
  console.error('[ERROR] ETIMEDOUT: Connection timeout after 30000ms');
  console.error('[ERROR] Failed to establish database connection');
  console.error('[ERROR] Sync operation aborted');
}, 6000);

// Simulate failed sync attempts
let syncAttempt = 0;
const attemptSync = () => {
  syncAttempt++;
  console.log(`[INFO] Attempting database sync #${syncAttempt}`);
  
  setTimeout(() => {
    console.error(`[ERROR] Sync attempt #${syncAttempt} failed`);
    console.error('Error: Connection lost during transaction');
    console.error('SQLSTATE[HY000]: General error: 2006 MySQL server has gone away');
  }, 2000);
};

// Try to sync every 10 seconds (and fail each time)
setInterval(attemptSync, 10000);

// Initial sync attempt
setTimeout(attemptSync, 2000);

// Simulate critical application errors
setTimeout(() => {
  console.error('UnhandledPromiseRejectionWarning: TypeError: Cannot destructure property \'host\' of \'undefined\'');
  console.error('    at DatabaseSync.constructor (/app/sync.js:12:9)');
  console.error('(node:1) [DEP0018] DeprecationWarning: Unhandled promise rejections are deprecated');
}, 9000);

process.on('SIGINT', () => {
  console.log('🛑 Database Sync shutting down...');
  process.exit(1); // Exit with error code
});