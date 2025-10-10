# Contributing to PM2+

Thank you for your interest in contributing to PM2+! This guide will help you get started with development and contributing to the project.

## Development Setup

### Prerequisites

- Node.js >= 22.0.0
- PM2 installed globally (`npm install -g pm2`)
- pnpm package manager

### Getting Started

```bash
# Clone the repository
git clone https://github.com/heristop/pm2-plus.git
cd pm2-plus

# Install dependencies
pnpm install

# Build the project
pnpm run build

# Run the CLI locally
pnpm start

# Or run in development mode with auto-reload
pnpm dev
```

## Development Commands

### Building and Running

```bash
# Build the project
pnpm run build

# Run the CLI locally
pnpm start

# Run in development mode with auto-reload
pnpm dev

# Clean build artifacts
pnpm run clean
```

### Testing

```bash
# Run unit tests
pnpm test

# Run tests with coverage
pnpm run test:coverage

# Run tests in watch mode
pnpm run test:watch

# Run tests with UI
pnpm run test:ui

# Run Cucumber BDD tests
pnpm run test:cucumber
```

### Code Quality

```bash
# Lint code
pnpm run lint

# Fix linting issues
pnpm run lint:fix

# Type checking
pnpm run typecheck

# Run all quality checks (used in CI)
pnpm run ci:quality
```

### Demo and Testing

```bash
# Automated showcase demo
pnpm run demo:showcase

# Interactive guided demo
pnpm run demo:interactive

# Record demo for documentation
pnpm run demo:record

# End-to-end demo testing
pnpm run demo:test

# Clean demo output files
pnpm run demo:clean
```

## Project Structure

```text
src/
├── bin/                   # CLI entry point
├── commands/              # Slash command implementations
├── display/               # UI and rendering components
├── interfaces/            # TypeScript interfaces
├── services/              # Core business logic
│   ├── ai-providers/      # AI provider integrations
│   ├── ai-input-router/   # AI command routing
│   └── ...
├── shell/                 # Interactive shell components
│   ├── input/             # Input handling
│   ├── routing/           # Command routing
│   ├── state/             # State management
│   └── ui/                # Shell UI components
└── utils/                 # Utility functions

demo/                      # Demo scripts and examples
tests/                     # Test files
features/                  # Cucumber BDD scenarios
```

## Architecture

PM2+ uses a modular architecture with dependency injection for maintainability and extensibility.

For detailed technical documentation, see:

- **[Architecture Overview](docs/architecture.md)** - System design, components, and data flow
- **[AI Workflow Design](docs/ai-workflow.md)** - AI-first interface vision and implementation

## Contributing Guidelines

### Pull Request Process

1. **Fork** the repository
2. **Create a feature branch** from `main`
3. **Make your changes** following the code style guidelines
4. **Add tests** for new functionality
5. **Run quality checks**: `pnpm run ci:quality`
6. **Update documentation** if needed
7. **Submit a pull request** with a clear description

### Code Style Requirements

- **TypeScript**: Use strict typing, avoid `any`
- **ESM Modules**: Use modern import/export syntax
- **Formatting**: Code is automatically formatted with lint-staged
- **Testing**: Add unit tests for new features
- **Documentation**: Update JSDoc comments for public APIs

### Testing Requirements

- **Unit Tests**: Use Vitest for unit testing
- **Integration Tests**: Use Cucumber for BDD scenarios
- **Coverage**: Maintain test coverage above 80%
- **Demo Tests**: Ensure demo scripts work correctly

### Development Workflow

1. **Start with an issue**: Create or find an existing issue
2. **Development setup**: Follow the setup guide above
3. **Make changes**: Focus on single responsibility
4. **Test thoroughly**: Run all tests and demos
5. **Quality checks**: Ensure lint and typecheck pass
6. **Documentation**: Update README or docs if needed

### Debugging Tips

```bash
# Test specific scenarios
pnpm run test -- --grep "specific test pattern"

# Run only Cucumber features
pnpm run test:cucumber -- --tags "@your-tag"
```

## License

By contributing to PM2+, you agree that your contributions will be licensed under the MIT License.

## Getting Help

- **Issues**: Report bugs or request features via GitHub Issues
- **Discussions**: Join community discussions for questions
- **Documentation**: Check the main README for user-focused documentation

Thank you for contributing to PM2+! 🚀
