import { container } from 'tsyringe';

// Import concrete implementations
import { PM2Client } from './pm2/PM2Client';
import { Renderer } from './display/Renderer';
import { PM2Manager } from './services/PM2Manager';
import { StatusService } from './services/StatusService';
import { CommandHistoryManager } from './services/CommandHistoryManager';

import { AIProviderFactory } from './services/AIProviderFactory';
import { ContextBuilder } from './services/ContextBuilder';

import { CommandParser } from './shell/CommandParser';
import { AIInputRouter } from './services/AIInputRouter';
import { CommandAnalyzer } from './services/CommandAnalyzer';
import { ExecutionManager } from './services/ExecutionManager';

// Import extracted Shell classes
import { ShellUIManager } from './shell/ui/ShellUIManager';
import { ShellInputHandler } from './shell/input/ShellInputHandler';
import { ShellCommandRouter } from './shell/routing/ShellCommandRouter';
import { ShellStateManager } from './shell/state/ShellStateManager';

// Import extracted AIInputRouter classes
import { InputAnalyzer } from './services/ai-input-router/InputAnalyzer';
import { EntityExtractor } from './services/ai-input-router/EntityExtractor';
import { ActionDetector } from './services/ai-input-router/ActionDetector';
import { PatternMatcher } from './services/ai-input-router/PatternMatcher';

import { CommandRegistry } from './shell/CommandRegistry';

import { PM2CommandMapper } from './services/PM2CommandMapper';
import { ConversationManager } from './services/ConversationManager';
import { ErrorAnalysisService } from './services/ErrorAnalysisService';

import { Shell } from './shell/Shell';

import { CommandFactory } from './shell/CommandFactory';

// DI Container setup for PM2-X
// This file configures the dependency injection container for the application

export { container };

// Initialize the container with core services
export function initializeContainer(): void {
  // Register core services
  container.registerSingleton('IShell', Shell);
  container.registerSingleton('IPM2Client', PM2Client);
  container.register('IRenderer', { useClass: Renderer });
  container.register('Renderer', { useClass: Renderer });
  container.register('IPM2Manager', { useClass: PM2Manager });
  container.register('IStatusService', { useClass: StatusService });
  container.register('ICommandHistoryManager', { useClass: CommandHistoryManager });
  container.registerSingleton('ICommandRegistry', CommandRegistry);
  container.register('PM2CommandMapper', { useClass: PM2CommandMapper });
  container.register('ConversationManager', { useClass: ConversationManager });
  container.register('ErrorAnalysisService', { useClass: ErrorAnalysisService });
  
  // Register AI services
  container.register('AIProviderFactory', { 
    useFactory: () => AIProviderFactory.getInstance() 
  });
  container.register('ContextBuilder', { useClass: ContextBuilder });
  container.register('CommandParser', { useClass: CommandParser });
  container.register('AIInputRouter', { useClass: AIInputRouter });
  container.register('CommandAnalyzer', { useClass: CommandAnalyzer });
  container.register('ExecutionManager', { useClass: ExecutionManager });

  // Register extracted Shell classes
  container.register('ShellUIManager', { useClass: ShellUIManager });
  container.register('ShellInputHandler', { useClass: ShellInputHandler });
  container.register('ShellCommandRouter', { useClass: ShellCommandRouter });
  container.register('ShellStateManager', { useClass: ShellStateManager });

  // Register extracted AIInputRouter classes
  container.register('InputAnalyzer', { useClass: InputAnalyzer });
  container.register('EntityExtractor', { useClass: EntityExtractor });
  container.register('ActionDetector', { useClass: ActionDetector });
  container.register('PatternMatcher', { useClass: PatternMatcher });

  container.register('AIProvider', {
    useFactory: (container) => {
      const factory = container.resolve(AIProviderFactory);
      return factory.getProvider();
    }
  });

  // Register concrete classes as well for backward compatibility
  container.register('PM2Manager', { useClass: PM2Manager });
  container.register('StatusService', { useClass: StatusService });
  container.register('CommandHistoryManager', { useClass: CommandHistoryManager });
}

export function registerCommands(container: any): void {
  const commands = CommandFactory.createCommands(container);
  const registry = container.resolve('ICommandRegistry');
  commands.forEach(command => registry.register(command));
}

// Helper function to resolve services
export function resolve<T>(token: string | symbol | Function): T {
  return container.resolve(token as any);
}

// Helper function to register services
export function register(token: string | symbol | Function, provider: any): void {
  container.register(token as any, provider);
}