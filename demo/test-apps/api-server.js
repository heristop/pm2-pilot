#!/usr/bin/env node

/**
 * Test API Server - Generates realistic errors for PM2+ demo
 */

import http from 'http';

console.log('🚀 API Server starting...');

// Simulate module not found error with proper async handling
void (async () => {
  try {
    // This will fail and generate the exact error from our tests
    await import('./non-existent-module.js');
  } catch {
    console.error('Error [ERR_MODULE_NOT_FOUND]: Cannot find module \'/Users/alexandre_mogere/Workspace/pm2x/demo/test-apps/non-existent-module.js\' imported from /Users/alexandre_mogere/Workspace/pm2x/demo/test-apps/api-server.js');
    console.error('    at ModuleLoader.resolve (node:internal/modules/esm/loader:582:38)');
    console.error('    at finalizeResolution (node:internal/modules/esm/resolve:257:11)');
  }
})();

// Simulate database connection error
setTimeout(() => {
  console.error('[ERROR] Connection timeout to database');
  console.error('[ERROR] Failed to process request: ECONNREFUSED');
  console.warn('[WARN] High memory usage detected');
}, 2000);

// Simulate runtime errors
setTimeout(() => {
  console.error('TypeError: Cannot read property \'config\' of undefined');
  console.error('    at DatabaseManager.connect (/app/src/database.js:45:12)');
  console.error('    at Server.start (/app/src/server.js:23:8)');
}, 4000);

// Create a simple HTTP server that runs normally
const server = http.createServer((req, res) => {
  // Simulate occasional errors
  if (Math.random() < 0.3) {
    console.error(`[ERROR] Request failed: ${req.url} - ${new Date().toISOString()}`);
    res.writeHead(500);
    res.end('Internal Server Error');
    return;
  }
  
  console.log(`[INFO] ${req.method} ${req.url} - ${new Date().toISOString()}`);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
});

server.listen(38451, () => {
  console.log('✅ API Server running on port 38451');
});

// Simulate periodic issues
setInterval(() => {
  if (Math.random() < 0.2) {
    console.error('[ERROR] Database connection lost');
    console.error('ECONNREFUSED: Connection refused to database on port 5432');
  }
}, 10000);

setInterval(() => {
  if (Math.random() < 0.1) {
    console.error('UnhandledPromiseRejectionWarning: Error: Connection timeout');
    console.error('ReferenceError: config is not defined at line 45');
  }
}, 15000);

// Keep process alive
process.on('SIGINT', () => {
  console.log('🛑 API Server shutting down...');
  server.close(() => {
    process.exit(0);
  });
});