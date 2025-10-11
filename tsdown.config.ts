import { defineConfig } from 'tsdown';

const external = [
  'blessed',
  'chalk',
  'commander',
  'dotenv',
  'inquirer',
  'gemini',
  'openai',
  'pm2',
  'reflect-metadata'
];

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts'
    },
    format: ['esm'],
    outDir: 'dist',
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'node22',
    external
  },
  {
    entry: {
      'bin/pm2plus': 'src/bin/pm2plus.ts'
    },
    format: ['esm'],
    outDir: 'dist',
    dts: false,
    sourcemap: false,
    clean: false,
    target: 'node20',
    external,
    noExternal: ['tsyringe'],
    banner: {
      js: '#!/usr/bin/env node'
    }
  }
]);
