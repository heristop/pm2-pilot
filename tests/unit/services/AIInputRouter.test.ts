import { describe, it, expect, beforeEach } from 'vitest';
import { AIInputRouter } from '../../../src/services/AIInputRouter.js';
import { InputAnalyzer } from '../../../src/services/ai-input-router/InputAnalyzer.js';
import { EntityExtractor } from '../../../src/services/ai-input-router/EntityExtractor.js';
import { ActionDetector } from '../../../src/services/ai-input-router/ActionDetector.js';
import { PatternMatcher } from '../../../src/services/ai-input-router/PatternMatcher.js';

describe('AIInputRouter', () => {
  let router: AIInputRouter;
  let inputAnalyzer: InputAnalyzer;
  let entityExtractor: EntityExtractor;
  let actionDetector: ActionDetector;
  let patternMatcher: PatternMatcher;

  beforeEach(() => {
    inputAnalyzer = new InputAnalyzer();
    entityExtractor = new EntityExtractor();
    actionDetector = new ActionDetector(null); // No AI provider for tests
    patternMatcher = new PatternMatcher();

    router = new AIInputRouter(null, inputAnalyzer, entityExtractor, actionDetector, patternMatcher);
  });

  describe('Intent Detection', () => {
    it('should detect traditional slash commands', async () => {
      const result = await router.analyze('/status');
      expect(result.intent).toBe('command');
      expect(result.confidence).toBe(1.0);
      expect(result.processedCommand).toBe('/status');
    });

    it('should detect direct commands without slash', async () => {
      const result = await router.analyze('status');
      expect(result.intent).toBe('command');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should detect restart actions', async () => {
      const result = await router.analyze('restart my-app');
      expect(result.intent).toBe('command'); // Direct command detection
      expect(result.suggestedActions.length).toBeGreaterThan(0);
      const restartAction = result.suggestedActions.find(a => a.type === 'restart');
      expect(restartAction).toBeDefined();
      expect(restartAction?.target).toBe('my-app');
    });

    it('should detect questions', async () => {
      const result = await router.analyze('why is my app slow?');
      expect(result.intent).toBe('question'); // Pure question
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should detect batch operations', async () => {
      const result = await router.analyze('restart all');
      expect(result.intent).toBe('command'); // Direct command
      expect(result.suggestedActions).toHaveLength(1);
      expect(result.suggestedActions[0].target).toBe('all');
      expect(result.suggestedActions[0].safety).toBe('dangerous');
    });
  });

  describe('Entity Extraction', () => {
    it('should extract process names', async () => {
      const result = await router.analyze('restart my-api-server');
      const processEntities = result.entities.filter(e => e.type === 'process');
      expect(processEntities.length).toBeGreaterThan(0);
      expect(processEntities.some(e => e.value === 'my-api-server')).toBe(true);
    });

    it('should extract actions', async () => {
      const result = await router.analyze('stop the database process');
      const actionEntities = result.entities.filter(e => e.type === 'action');
      expect(actionEntities).toHaveLength(1);
      expect(actionEntities[0].value).toBe('stop');
    });

    it('should extract metrics keywords', async () => {
      const result = await router.analyze('check memory usage');
      const metricEntities = result.entities.filter(e => e.type === 'metric');
      expect(metricEntities.length).toBeGreaterThan(0);
      expect(metricEntities.some(e => e.value === 'memory')).toBe(true);
    });
  });

  describe('Safety Classification', () => {
    it('should mark stop actions as dangerous', async () => {
      const result = await router.analyze('stop my-app');
      expect(result.suggestedActions[0].safety).toBe('dangerous');
    });

    it('should mark restart actions as caution', async () => {
      const result = await router.analyze('restart my-app');
      expect(result.suggestedActions[0].safety).toBe('caution');
    });

    it('should mark status actions as safe', async () => {
      const result = await router.analyze('status my-app');
      expect(result.suggestedActions[0].safety).toBe('safe');
    });

    it('should require confirmation for batch operations', async () => {
      const result = await router.analyze('restart all');
      expect(result.requiresConfirmation).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty input', async () => {
      const result = await router.analyze('');
      expect(result.intent).toBe('question');
      expect(result.confidence).toBe(0);
    });

    it('should handle low confidence input', async () => {
      const result = await router.analyze('random gibberish xyz123');
      expect(result.confidence).toBeLessThan(0.8);
    });

    it('should filter common words from process names', async () => {
      const result = await router.analyze('restart the app');
      const processEntities = result.entities.filter(e => e.type === 'process');
      // Should not include 'the' as a process name
      expect(processEntities.every(e => e.value !== 'the')).toBe(true);
    });
  });

  describe('Command Generation', () => {
    it('should generate processedCommand for clear actions', async () => {
      const result = await router.analyze('restart my-app');
      expect(result.processedCommand).toContain('/restart');
      expect(result.processedCommand).toContain('my-app');
    });

    it('should generate processedCommand for status checks', async () => {
      const result = await router.analyze('status');
      expect(result.processedCommand).toContain('/status');
    });

    it('should not generate processedCommand for questions', async () => {
      const result = await router.analyze('why is my app slow?');
      expect(result.processedCommand).toBeUndefined();
    });
  });
});