# PM2+

Modern interactive CLI for PM2 process management with AI assistance, built with TypeScript, ESM, and pnpm.

## ✨ Demo

![PM2+ AI-Powered Demo](docs/showcase-demo.gif)

> **🎬 See PM2+ in Action:** Watch how PM2+ intelligently analyzes process errors, provides AI-powered diagnosis, and suggests actionable solutions—all through natural language interaction!

## Features

### 🤖 AI-Powered Intelligence

- **Smart Log Analysis** - Automatic error detection and categorization
- **Intelligent Diagnosis** - AI-powered root cause analysis with actionable suggestions
- **Natural Language Interface** - Ask questions in any language, get instant help
- **Proactive Error Alerts** - Automatically detects and explains critical issues
- **Multi-Provider AI Support** - Works with OpenAI GPT and Google Gemini

### 🚀 Enhanced PM2 Experience

- **Interactive Shell Interface** - Slash commands and natural language
- **Real-time Process Monitoring** - Live metrics and performance data
- **Smart Log Streaming** - Enhanced log viewing with error analysis
- **Colorized Output** - Beautiful, readable terminal interface
- **Auto-Recovery System** - Process health monitoring with automatic restart
- **Safe Configuration Management** - Enterprise-grade config handling with file locking and atomic writes

### 🔧 Developer Experience

- **TypeScript** - Full type safety and modern development
- **ESM Modules** - Modern JavaScript with pnpm package management
- **Comprehensive Testing** - Unit tests and BDD scenarios with Cucumber
- **Fast Performance** - Optimized for quick process operations

## Requirements

- Node.js >= 22.0.0
- PM2 installed globally (`npm install -g pm2`)
- pnpm package manager

## Installation

### Global Installation (Recommended)

Install PM2+ globally to use it anywhere:

```bash
npm install -g pm2-plus
```

After installation, start the interactive CLI:

```bash
pm2plus
```

## Available Commands

Once you start the CLI with `pnpm start`, you'll enter an interactive shell where you can use these commands:

### 🔧 Process Management

- `/status` or `/ps` - Show PM2 process status
- `/list` or `/ls` - List all PM2 processes
- `/restart <name>` - Restart a specific process
- `/stop <name>` - Stop a specific process
- `/start <name>` - Start a specific process
- `/all <operation>` - Batch operations on all processes

### 🏥 Health & Recovery

- `/health` or `/check` - Run comprehensive health checks
- `/watch <name> [mem] [cpu]` - Auto-recovery monitoring with thresholds
- `/watch stop` - Stop watching processes

### 📊 Monitoring & Analytics

- `/metrics` or `/m` - System metrics and health score
- `/history` - Performance history and trends
- `/history collect` - Start collecting metrics
- `/history clear` - Clear history data

### 📜 Intelligent Log Management

- `/logs <name>` - Stream real-time logs with automatic error detection
- `/logs smart <name>` - AI-powered log analysis with error diagnosis
- `/grep <pattern> [name]` - Search across all logs
- `/errors` or `/err` - Show recent errors only

### 💾 Configuration

- `/save [filename]` - Save PM2 ecosystem configuration
- `/load [filename]` - Load saved configuration

### 🤖 AI-Powered Features

- `/ai <question>` - Ask AI assistant about processes
- `/ai config` - Show AI configuration status
- `/ai provider <openai|gemini>` - Switch AI provider
- `/ai providers` - List available AI providers
- `/ai presets` - Show speed/quality presets for current provider
- `/ai preset <name>` - Apply speed preset (lightning, fast, smart, reasoning)
- `/diagnose [process]` - AI-powered issue diagnosis
- `/doctor logs [process]` - Comprehensive log analysis and error diagnosis  
- `/doctor errors [process]` - Focused error analysis with critical issue detection
- `/optimize [process]` - Get AI optimization suggestions

### 🛠️ Utility

- `/help` or `/h` - Show available commands
- `/clear` or `/cls` - Clear the terminal screen
- `/history` - View and search command history
- `/exit`, `/quit`, or `/q` - Exit the CLI

## Usage Examples

```bash
# Start the interactive CLI
pm2plus

# Basic monitoring:
PM2+ /status
PM2+ /metrics
PM2+ /health

# Intelligent log analysis:
PM2+ /logs smart my-app             # AI-powered error analysis
PM2+ /doctor logs                   # Comprehensive diagnosis
PM2+ /doctor errors my-app          # Critical error focus

# Advanced features:
PM2+ /watch my-app 500 80           # Auto-restart if >500MB or >80% CPU
PM2+ /grep "error" my-app           # Search logs for errors
PM2+ /all restart                   # Restart all processes

# AI-powered insights (requires OpenAI or Gemini API key):
PM2+ my app is slow, can you help?  # Natural language
PM2+ /ai why is my-app slow?        # Direct AI query
PM2+ /diagnose my-app               # Process diagnosis
PM2+ /optimize                      # Optimization suggestions

# Configuration:
PM2+ /save production-config
PM2+ /load production-config
PM2+ /exit
```

## AI Assistant Setup

The AI features support both OpenAI and Google Gemini. Choose your preferred provider:

### OpenAI Setup

```bash
# Option 1: Environment variable
export OPENAI_API_KEY=your-openai-api-key

# Option 2: Configure via CLI
PM2+ /ai provider openai
PM2+ /ai config
```

### Google Gemini Setup

```bash
# Option 1: Environment variable
export GEMINI_API_KEY=your-gemini-api-key

# Option 2: Configure via CLI
PM2+ /ai provider gemini
PM2+ /ai config
```

### Provider Management

```bash
# List available providers
PM2+ /ai providers

# Switch between providers
PM2+ /ai provider gemini
PM2+ /ai provider openai

# Check current configuration
PM2+ /ai config

# Speed presets for optimal performance
PM2+ /ai presets                  # Show available speed presets
PM2+ /ai preset lightning         # GPT-5 nano - Ultra fast responses
PM2+ /ai preset fast              # GPT-4o - Balanced speed and quality (recommended)
PM2+ /ai preset smart             # GPT-5 - Highest intelligence for complex analysis
PM2+ /ai preset reasoning         # GPT-5 mini - Deep thinking for complex problems
```

## Configuration Management

PM2+ uses a unified configuration file in your home directory with **safe concurrent access**:

- **Location**: `~/.pm2plus-config.json`
- **Features**:
  - **Thread-safe configuration**: Uses file locking to prevent corruption
  - **Atomic writes**: Prevents race conditions during config updates
  - **Auto-recovery**: Rebuilds corrupted config files automatically
- **Contents**:
  - AI provider selection (OpenAI/Gemini)  
  - API keys for each provider
  - Model presets and active selections
  - User preferences (auto-execute mode, verbosity, confirmation level)
  - Provider-specific configurations

This single file manages all PM2+ settings with enterprise-grade reliability and concurrent access protection.

```bash
# View current configuration
PM2+ /ai config

# The config file structure:
{
  "provider": "openai",
  "userPreferences": {
    "autoExecute": false,
    "verbosity": "detailed", 
    "confirmationLevel": "destructive"
  },
  "openai": {
    "apiKey": "sk-...",
    "model": "gpt-4o",
    "activePreset": "fast"
  },
  "gemini": {
    "apiKey": "AI...",
    "model": "gemini-2.5-flash"
  }
}
```

## 🤖 AI-First Interface Vision

PM2+ is evolving toward an AI-native experience where natural language becomes the primary interface:

### Current Interface

```bash
PM2+ my app is slow
❌ Commands must start with /. Type /help for available commands.

PM2+ /ai my app is slow
🤖 AI Assistant is thinking...
[AI response without actions]
```

### Future AI-First Interface

```bash
PM2+ my app is slow
🤖 Analyzing your processes...
I can see that "my-app" is using 85% CPU and 420MB memory. This could be causing slowness.

Let me check the logs for errors:
[Automatically shows recent errors]

Suggestions:
• Restart the process: restart my-app
• Check memory usage: /metrics my-app
• Would you like me to restart it now?

PM2+ yes restart it
🔄 Restarting my-app...
✅ my-app restarted successfully
📊 New metrics: CPU 12%, Memory 89MB - much better!
```

### Natural Language Examples

```bash
# Process troubleshooting
PM2+ why did my-app crash?
🤖 Analyzing crash logs... Found memory limit exceeded at 2:34 AM
🔧 Suggesting: increase max_memory_restart to 800MB

# Batch operations
PM2+ restart all errored processes
🤖 Found 3 errored processes: api-server, worker-1, notifications
🔄 Restarting all... Done! All processes now online.

# Performance optimization
PM2+ optimize my cluster setup
🤖 Analysis: Your 4 instances are underutilized (avg 15% CPU)
💡 Recommendation: Reduce to 2 instances to save 180MB memory
🚀 Would you like me to scale down automatically?

# Learning and discovery
PM2+ how do I monitor memory usage over time?
🤖 I can help! Use `/history collect` to start tracking, then `/history` to view trends.
📊 Starting collection now... You'll have data in 30 seconds.
```

### Benefits of AI-First Approach

- **Zero Learning Curve**: Start with natural language immediately
- **Contextual Actions**: AI automatically includes current system state
- **Proactive Suggestions**: Get optimization recommendations without asking
- **Intelligent Automation**: AI executes common tasks with confirmation
- **Conversational Workflow**: Build solutions through natural dialogue

## 🚀 Key Features That Surpass PM2

### ✨ Exclusive Features Not in PM2

1. **AI-Powered Assistant** - Ask natural language questions about your processes
2. **Smart Diagnosis** - AI analyzes process issues and suggests solutions
3. **Optimization AI** - Get personalized performance improvement recommendations
4. **Auto-Recovery System** - Automatically restart processes on memory/CPU thresholds
5. **Health Checks** - Comprehensive health scoring with detailed diagnostics
6. **Performance History** - Track and analyze metrics over time with trends
7. **Smart Batch Operations** - Safe bulk operations with confirmation
8. **Log Search Engine** - Grep across all process logs instantly
9. **Error Aggregation** - View all errors from all processes in one place
10. **Safe Configuration Management** - Enterprise-grade config handling with file locking and atomic writes

### 💪 Enhanced Over PM2

- **Smoother UX** - Interactive shell eliminates repetitive `pm2` typing
- **Colored Output** - Beautiful, readable terminal output
- **Unified Dashboard** - All metrics in one clean view
- **Smart Alerts** - Proactive notifications for issues
- **Session Persistence** - Stay in context while monitoring

### 🛡️ Production-Ready Features

- Graceful error handling
- Auto-recovery from crashes
- Performance trend analysis
- Configuration backup/restore
- Health monitoring dashboard

## Contributing

Contributions are welcome! Please see the [Contributing Guide](CONTRIBUTING.md) for details on:

- Development setup and workflow
- Code style and testing requirements
- Pull request process
- Project architecture and structure

For technical details, see:

- [Architecture Overview](docs/architecture.md)
- [AI Workflow Design](docs/ai-workflow.md)

## License

MIT License - see [LICENSE](LICENSE) file for details.
