# Tool Installation Guide

Code Sherlock integrates with various linters and SAST tools. These tools need to be installed separately before they can be used.

## 📋 Installation Methods

### Option 1: Automatic Installation (Recommended)

Code Sherlock can automatically install tools using `npx` for npm-based tools. For other tools, you'll need to install them manually.

### Option 2: Manual Installation

Install tools manually based on your project's needs.

## 🔧 Linter Tools

### ESLint (JavaScript/TypeScript)
**Installation:**
```bash
# Global installation
npm install -g eslint

# Or use npx (no installation needed)
# Code Sherlock uses npx by default
```

**Configuration:**
- Create `.eslintrc.json` in your project root
- Or configure path in `code-sherlock.config.json`:
```json
{
  "linter": {
    "eslint": {
      "configFile": ".eslintrc.json"
    }
  }
}
```

### Prettier (Code Formatting)
**Installation:**
```bash
# Global installation
npm install -g prettier

# Or use npx (no installation needed)
# Code Sherlock uses npx by default
```

**Configuration:**
- Create `.prettierrc` in your project root
- Or configure path in `code-sherlock.config.json`

### TypeScript Compiler
**Installation:**
```bash
# Global installation
npm install -g typescript

# Or use npx (no installation needed)
# Code Sherlock uses npx by default
```

**Configuration:**
- Ensure `tsconfig.json` exists in your project root
- Or configure path in `code-sherlock.config.json`

### Pylint (Python)
**Installation:**
```bash
# Using pip
pip install pylint

# Or using pipx (recommended for CLI tools)
pipx install pylint
```

**Note:** Pylint must be available in your PATH.

### RuboCop (Ruby)
**Installation:**
```bash
# Using gem
gem install rubocop

# Or add to Gemfile
bundle add rubocop
```

**Note:** RuboCop must be available in your PATH.

### golangci-lint (Go)
**Installation:**
```bash
# macOS
brew install golangci-lint

# Linux
curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/master/install.sh | sh -s -- -b $(go env GOPATH)/bin v1.54.2

# Windows
choco install golangci-lint
```

**Note:** golangci-lint must be available in your PATH.

### rust-clippy (Rust)
**Installation:**
```bash
# Clippy comes with Rust
rustup component add clippy

# Or install Rust if not already installed
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

**Note:** rust-clippy must be available in your PATH.

## 🔒 SAST Tools

### Semgrep (Multi-language Security)
**Installation:**
```bash
# Using pip
pip install semgrep

# Or using pipx (recommended)
pipx install semgrep

# Or using Homebrew (macOS)
brew install semgrep

# Or using Docker
docker pull returntocorp/semgrep
```

**Configuration:**
- Semgrep uses `auto` config by default
- Or specify custom rules/config in `code-sherlock.config.json`:
```json
{
  "sast": {
    "semgrep": {
      "config": "p/security-audit",
      "severity": ["ERROR", "WARNING"]
    }
  }
}
```

**Note:** Semgrep must be available in your PATH.

### Bandit (Python Security)
**Installation:**
```bash
# Using pip
pip install bandit

# Or using pipx
pipx install bandit
```

**Configuration:**
- Create `.bandit` config file (optional)
- Or configure in `code-sherlock.config.json`:
```json
{
  "sast": {
    "bandit": {
      "configFile": ".bandit",
      "severityLevel": 1
    }
  }
}
```

**Note:** Bandit must be available in your PATH.

### Gosec (Go Security)
**Installation:**
```bash
# Using go install
go install github.com/securego/gosec/v2/cmd/gosec@latest

# Or using Homebrew
brew install gosec
```

**Note:** Gosec must be available in your PATH.

### Brakeman (Ruby on Rails Security)
**Installation:**
```bash
# Using gem
gem install brakeman

# Or add to Gemfile
bundle add brakeman
```

**Note:** Brakeman must be available in your PATH.

### npm audit (Node.js Dependencies)
**Installation:**
- Comes with npm (no separate installation needed)
- Requires `package.json` in your project

**Configuration:**
```json
{
  "sast": {
    "npmAudit": {
      "auditLevel": "moderate"
    }
  }
}
```

### Snyk (Multi-language Security)
**Installation:**
```bash
# Using npm
npm install -g snyk

# Or using Homebrew
brew tap snyk/tap
brew install snyk
```

**Setup Required:**
1. Create account at https://snyk.io
2. Authenticate: `snyk auth`
3. Configure in `code-sherlock.config.json`:
```json
{
  "sast": {
    "snyk": {
      "org": "your-org-name",
      "severityThreshold": "high"
    }
  }
}
```

### SonarQube (Code Quality & Security)
**Installation:**
- Requires SonarQube server setup
- Install SonarScanner CLI:
```bash
# macOS
brew install sonar-scanner

# Or download from https://docs.sonarqube.org/latest/analysis/scan/sonarscanner/
```

**Setup Required:**
1. Set up SonarQube server
2. Configure in `code-sherlock.config.json`:
```json
{
  "sast": {
    "sonarqube": {
      "projectKey": "your-project-key",
      "serverUrl": "http://localhost:9000",
      "token": "your-sonarqube-token"
    }
  }
}
```

## ✅ Verifying Installation

You can verify tools are installed by running:

```bash
# Check ESLint
npx eslint --version

# Check Prettier
npx prettier --version

# Check TypeScript
npx tsc --version

# Check Semgrep
semgrep --version

# Check Bandit
bandit --version

# Check Gosec
gosec --version

# Check Brakeman
brakeman --version

# Check npm audit (comes with npm)
npm --version

# Check Snyk
snyk --version
```

## 🚀 Quick Setup Script

Create a setup script to install commonly used tools:

```bash
#!/bin/bash
# setup-tools.sh

echo "Installing Code Sherlock tools..."

# JavaScript/TypeScript tools (via npx - no installation needed)
echo "✓ ESLint, Prettier, TypeScript available via npx"

# Python tools
if command -v pip &> /dev/null; then
    pip install --user semgrep bandit pylint
    echo "✓ Python tools installed"
fi

# Go tools
if command -v go &> /dev/null; then
    go install github.com/securego/gosec/v2/cmd/gosec@latest
    echo "✓ Go tools installed"
fi

# Ruby tools
if command -v gem &> /dev/null; then
    gem install rubocop brakeman
    echo "✓ Ruby tools installed"
fi

echo "Setup complete!"
```

## 📝 Project-Specific Installation

### For Node.js Projects
Add to `package.json`:
```json
{
  "devDependencies": {
    "eslint": "^8.55.0",
    "prettier": "^3.1.1",
    "typescript": "^5.3.0"
  }
}
```

Then run: `npm install`

### For Python Projects
Add to `requirements-dev.txt`:
```
semgrep
bandit
pylint
```

Then run: `pip install -r requirements-dev.txt`

### For Go Projects
Tools are typically installed globally or via `go install`.

### For Ruby Projects
Add to `Gemfile`:
```ruby
group :development do
  gem 'rubocop'
  gem 'brakeman'
end
```

Then run: `bundle install`

## ⚠️ Troubleshooting

### Tool Not Found Errors

If you see errors like "command not found":

1. **Check PATH**: Ensure tool is in your PATH
   ```bash
   echo $PATH
   which tool-name
   ```

2. **Use npx for npm tools**: Code Sherlock uses `npx` for npm-based tools, which downloads them on-demand

3. **Install globally**: Some tools need global installation
   ```bash
   npm install -g tool-name
   # or
   pip install tool-name
   ```

4. **Check tool availability**: Code Sherlock will skip tools that aren't available and continue with others

### Permission Errors

If you get permission errors:

- **npm**: Use `npm install -g` with appropriate permissions or use `npx`
- **pip**: Use `pip install --user` or `pipx install`
- **gem**: Use `gem install --user-install` or `bundle install`

### Configuration Not Found

If tools can't find their config files:

1. Ensure config files exist in project root
2. Or specify full paths in `code-sherlock.config.json`
3. Check working directory settings

## 🔄 Updating Tools

Keep tools updated for best results:

```bash
# npm tools
npm update -g eslint prettier typescript

# Python tools
pip install --upgrade semgrep bandit pylint

# Go tools
go install github.com/securego/gosec/v2/cmd/gosec@latest

# Ruby tools
gem update rubocop brakeman
```

## 📚 Additional Resources

- [ESLint Documentation](https://eslint.org/docs/latest/)
- [Prettier Documentation](https://prettier.io/docs/en/)
- [Semgrep Documentation](https://semgrep.dev/docs/)
- [Bandit Documentation](https://bandit.readthedocs.io/)
- [Gosec Documentation](https://github.com/securego/gosec)

---

**Note**: Code Sherlock will gracefully handle missing tools - it will skip unavailable tools and continue with the review using available tools and AI analysis.
