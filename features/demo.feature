Feature: PM2+ Demo - Orchestrated Showcase
  As a potential user of PM2+
  I want to see a polished demonstration of its key features
  So that I can understand its value proposition and capabilities

  Background: Demo Environment Setup
    Given I have a clean PM2+ demo environment
    And the following test processes are running:
      | name           | status  | cpu | memory | errors |
      | api-server     | online  | 2.3 | 45MB   | yes    |
      | worker-queue   | online  | 1.2 | 32MB   | no     |
      | database-sync  | errored | 0.0 | 0MB    | yes    |
    And the demo recorder is active with:
      | width  | 120 |
      | height | 30  |
      | fps    | 10  |

  @demo @main-flow
  Scenario: Complete PM2+ Demo Flow (50 seconds)
    # Scene 1: Status Overview (0-10s)
    When I run the PM2+ command "/status"
    Then I should see the process status table within 2 seconds
    And the output should show all 3 processes with their status
    
    When I pause for 3 seconds
    And I ask "my processes have errors, can you help me analyze them?"
    Then the AI should respond with error detection within 3 seconds
    And suggest using intelligent log analysis commands
    
    # Scene 2: Intelligent Log Analysis (10-25s)
    When I pause for 2 seconds
    And I run the PM2+ command "/logs smart api-server"
    Then I should see the intelligent log analysis output within 3 seconds
    And the analysis should include:
      | 🚨 Error Detection    |
      | 📊 AI Diagnosis       |
      | 🔍 Root Cause         |
      | 💡 Recommendations    |
      | ⚡ Quick Fix          |
      | 📈 Confidence Score   |
    
    # Scene 3: Comprehensive Diagnosis (25-35s)
    When I pause for 3 seconds
    And I run the PM2+ command "/doctor logs"
    Then I should see the comprehensive diagnosis within 4 seconds
    And the report should show:
      | 📋 Log Analysis Report |
      | Error breakdown by category |
      | Severity assessment |
      | Actionable recommendations |
    
    # Scene 4: Critical Issues Focus (35-45s)
    When I pause for 2 seconds
    And I ask "show me the most critical issues"
    Then the AI should highlight critical errors within 3 seconds
    And prioritize recommendations by severity
    And suggest immediate actions
    
    # Scene 5: Clean Exit (45-50s)
    When I pause for 2 seconds
    And I run the PM2+ command "/exit"
    Then the session should end gracefully within 5 seconds
    And display a professional closing message

  @demo @error-showcase
  Scenario: Error Analysis Deep Dive Demo
    Given the "api-server" process has realistic error logs:
      """
      [2024-12-25 10:30:15] ERROR: ECONNREFUSED connection to database on port 5432
      [2024-12-25 10:30:16] ERROR: UnhandledPromiseRejectionWarning: Error: Connection timeout
      [2024-12-25 10:30:17] ERROR: ReferenceError: config is not defined at /app/server.js:45:12
      [2024-12-25 10:30:18] WARN: High memory usage detected: 89% of 100MB limit
      [2024-12-25 10:30:19] ERROR: ERR_MODULE_NOT_FOUND: Cannot find module 'missing-dependency'
      """
    
    When I run "/logs smart api-server" 
    Then the AI analysis should categorize errors as:
      | network: 2 error(s) |
      | runtime: 1 error(s) |
      | module: 1 error(s) |
      | performance: 1 warning(s) |
    
    And provide specific recommendations for each category:
      | Network | Check database connection, verify port 5432 is accessible |
      | Runtime | Review config initialization at server.js:45 |
      | Module | Install missing dependency or update imports |
      | Performance | Monitor memory usage, consider increasing limits |

  @demo @natural-language
  Scenario: Natural Language Interaction Demo
    When I ask "what's the status of my applications?"
    Then the AI should understand this means show process status
    And respond with process information in natural language
    
    When I ask "the first one seems problematic"
    Then the AI should understand "first one" refers to "api-server"
    And offer to analyze its logs or status
    
    When I ask "show me what's wrong"
    Then the AI should provide error analysis for the referenced process
    And suggest specific debugging steps

  @demo @multilingual
  Scenario Outline: Multilingual Demo Support
    When I ask "<query>" in <language>
    Then the AI should understand the intent regardless of language
    And respond appropriately with error analysis
    
    Examples:
      | language | query |
      | French   | "montre-moi les erreurs" |
      | Spanish  | "muéstrame los errores" |
      | German   | "zeige mir die Fehler" |
      | Italian  | "mostrami gli errori" |

  @demo @performance
  Scenario: Demo Performance Validation
    Given the demo recorder is measuring response times
    
    When I run any PM2+ command during the demo
    Then the command should complete within 3 seconds
    And the UI should remain responsive throughout
