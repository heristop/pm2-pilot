import 'reflect-metadata';
import 'dotenv/config';
import { initializeContainer, container, registerCommands } from '../container';
import { Shell } from '../shell/Shell';

async function main() {
  try {
    // Initialize dependency injection container
    initializeContainer();
    registerCommands(container);
    
    const shell = container.resolve(Shell);

    await shell.start();
  } catch (error) {
    console.error('Error starting PM2 CLI:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
