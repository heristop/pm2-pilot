Feature: PM2+ Natural Language Conversation
  As a developer managing PM2 processes
  I want to interact with PM2+ using natural language
  So that I can quickly understand and debug my applications

  Scenario: Complete conversation flow from discovery to debugging
    Given I have the following PM2 processes running:
      | name           | status  | cpu | memory | errors |
      | api-server     | online  | 2.3 | 45MB   | yes    |
      | worker-queue   | online  | 1.2 | 32MB   | no     |
      | database-sync  | errored | 0.0 | 0MB    | yes    |
    # Scene 1: Server Discovery
    When I ask "what are my active servers?"
    Then I should see a process list containing:
      | api-server |
      | worker-queue |
      | database-sync |
    And the response should indicate "api-server" is "online"
    And the response should indicate "database-sync" is "errored"

    # Scene 2: Status Deep Dive (using context)
    When I ask "tell me about the first one"
    Then the AI should understand I mean "api-server"
    And I should see detailed status including:
      | CPU: 2.3% |
      | Memory: 45MB |
      | Status: online |

    # Scene 3: Log Investigation (pronoun resolution)
    When I ask "show me its logs"
    Then the AI should understand "its" refers to "api-server"
    And I should see logs containing error entries:
      """
      [ERROR] Connection timeout to database
      [ERROR] Failed to process request: ECONNREFUSED
      [WARN] High memory usage detected
      """

    # Scene 4: Error Analysis Request
    When I ask "I see errors, can you help me analyze and debug them?"
    Then the AI should provide debugging assistance
    And the AI should suggest PM2+ natural language commands like:
      | "check error patterns" |
      | "analyze performance issues" |
      | "restart api-server" |
    But the AI should NOT suggest raw PM2 commands like:
      | pm2 logs api-server --lines 100 |
      | pm2 restart 0 |

    # Scene 5: Pending Actions Created
    And a pending action should be created for analysis

  Scenario Outline: Language-agnostic confirmation recognition
    Given I have a pending action to "restart api-server"
    When I confirm with "<confirmation>"
    Then the AI should recognize this as "execute_pending" intent
    And the pending action should be executed

    Examples:
      | confirmation | language |
      | yes          | English  |
      | oui          | French   |
      | sí, hazlo    | Spanish  |
      | do it        | English  |
      | go ahead     | English  |
      | proceed      | English  |
      | execute      | English  |
      | confirm      | English  |
      | sure         | English  |
      | ok           | English  |

  Scenario: Context maintained across conversation
    Given I have the following PM2 processes running:
      | name           | status  | cpu | memory | errors |
      | api-server     | online  | 2.3 | 45MB   | yes    |
      | worker-queue   | online  | 1.2 | 32MB   | no     |
      | database-sync  | errored | 0.0 | 0MB    | yes    |
    When I ask "show my processes"
    And I ask "how is the api-server doing?"
    And I ask "what about worker-queue?"
    And I ask "and the last one?"
    Then each response should use the correct process context:
      | question | context |
      | how is the api-server doing? | api-server |
      | what about worker-queue? | worker-queue |
      | and the last one? | database-sync |

  Scenario: System prompt prevents raw PM2 commands
    Given I have the following PM2 processes running:
      | name           | status  | cpu | memory | errors |
      | api-server     | online  | 2.3 | 45MB   | yes    |
      | worker-queue   | online  | 1.2 | 32MB   | no     |
      | database-sync  | errored | 0.0 | 0MB    | yes    |
    When I ask "how do I check my logs?"
    Then the AI should suggest "show logs" or "check logs for [process]"
    And the AI should NOT suggest "pm2 logs"
    
    When I ask "I need to restart my server"
    Then the AI should suggest "restart api-server" or "restart your server"
    And the AI should NOT suggest "pm2 restart api-server"

  Scenario: Intelligent log analysis with AI error diagnosis
    Given I have the following PM2 processes running:
      | name           | status  | cpu | memory | errors |
      | test-app       | online  | 1.5 | 35MB   | yes    |
      | worker-service | online  | 0.8 | 28MB   | no     |
    And the process "test-app" has recent error logs:
      """
      Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/Users/alexandre_mogere/Workspace/pm2-cli/test-app.js' imported from /Users/alexandre_mogere/Library/pnpm/nodejs/22.11.0/lib/node_modules/pm2/lib/ProcessContainerFork.js
      at ModuleLoader.resolve (node:internal/modules/esm/loader:582:38)
      at finalizeResolution (node:internal/modules/esm/resolve:257:11)
      TypeError: Cannot read property 'config' of undefined
      """
    
    # Scene 1: User requests logs
    When I ask "execute moi les logs"
    Then the AI should understand I want to show logs for "test-app"
    And I should see the error logs displayed
    
    # Scene 2: AI automatically detects and analyzes errors
    And the system should automatically detect errors in the logs
    And I should see an AI diagnosis containing:
      | 🚨 Error Detected | Module Not Found |
      | 📋 Analysis | Cannot find module '/Users/.../test-app.js' |
      | 🔍 Root Cause | File path doesn't exist or is misconfigured |
      | 💡 Suggested Actions | Check if file exists, Update PM2 config, Restart process |
      | ⚡ Quick Fix | Check if file exists: /Users/.../test-app.js |
    
    # Scene 3: Follow-up diagnostic commands suggested
    And the AI should suggest follow-up actions like:
      | "restart test-app" |
      | "check process status" |
      | "diagnose test-app" |
    
    # Scene 4: User can get more detailed analysis
    When I ask "can you help me diagnose this further?"
    Then the AI should provide comprehensive error analysis
    And suggest using "doctor logs" for detailed diagnosis

  Scenario: Smart logs command with error analysis
    Given I have the following PM2 processes running:
      | name      | status  | cpu | memory | errors |
      | api-app   | online  | 2.1 | 42MB   | yes    |
      | queue-app | errored | 0.0 | 0MB    | yes    |
    And the process "api-app" has recent error logs:
      """
      ECONNREFUSED: Connection refused to database on port 5432
      UnhandledPromiseRejectionWarning: Error: Connection timeout
      ReferenceError: config is not defined at line 45
      """
    
    When I use the "/logs smart api-app" command
    Then I should see recent logs displayed with timestamps
    And I should see an error analysis section showing:
      | 🚨 Detected X error(s) |
      | 🔥 CRITICAL/HIGH ISSUE DETECTED |
      | 📊 AI Diagnosis summary |
      | 🔍 Root Cause explanation |
      | 💡 Recommended Actions list |
      | ⚡ Quick Fix suggestion |
      | 📈 Analysis Confidence percentage |

  Scenario: Doctor command with log specialization
    Given I have the following PM2 processes running:
      | name        | status  | cpu | memory | errors |
      | web-server  | online  | 1.8 | 38MB   | yes    |
      | background  | online  | 0.5 | 22MB   | yes    |
    And recent error logs contain critical module loading failures
    
    When I use the "/doctor logs" command
    Then I should see a comprehensive log analysis report with:
      | 📋 Log Analysis Report |
      | Target: All processes |
      | Analyzed: X log entries |
      | Generated timestamp |
    And error breakdown by category showing:
      | module: X error(s) |
      | network: X error(s) |  
      | runtime: X error(s) |
    And actionable recommendations prioritized by severity
    
    When I use the "/doctor errors web-server" command
    Then I should see an error-focused diagnosis with:
      | 🚨 Error-Focused Diagnosis |
      | 🔥 Found X error(s) requiring attention |
      | 🎯 Critical Error Focus |
      | ⏰ Error Timeline (Most Recent) |

  Scenario: Proactive error detection in natural language queries
    Given I have the following PM2 processes running:
      | name          | status  | cpu | memory | errors |
      | payment-api   | online  | 3.2 | 55MB   | yes    |
      | notification  | online  | 1.1 | 30MB   | no     |
    And "payment-api" has critical database connection errors
    
    When I ask "how are my processes doing?"
    Then the AI response should include recent error analysis
    And mention that "payment-api has critical errors detected"
    And suggest immediate actions like "restart payment-api" or "check logs"
    
    When I ask "show me what's wrong with payment-api"
    Then the AI should automatically include error context in the response
    And provide specific error details from recent logs
    And suggest diagnostic commands like "doctor logs payment-api"

  Scenario: Error analysis confidence and fallback behavior
    Given I have the following PM2 processes running:
      | name     | status  | cpu | memory | errors |
      | test-svc | online  | 1.0 | 25MB   | yes    |
    And the AI service is not configured
    
    When I use the "/logs smart test-svc" command
    Then the system should fall back to pattern-based error analysis
    And still provide basic error categorization
    And show simplified recommendations
    But not show AI confidence percentages
    
    When the AI service becomes available
    And I use the "/logs smart test-svc" command again
    Then I should see enhanced AI-powered analysis
    And confidence percentages should be displayed
    And more sophisticated root cause analysis should be provided