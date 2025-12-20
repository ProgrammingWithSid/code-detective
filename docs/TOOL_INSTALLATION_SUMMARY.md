# Tool Installation Summary

## When Are Tools Installed?

**Tools are NOT automatically installed by Code Sherlock.** You need to install them manually before using Code Sherlock's linter and SAST features.

## Installation Timeline

### 1. **Before Using Code Sherlock**
Install the tools you want to use based on your project's needs:

```bash
# For JavaScript/TypeScript projects
npm install -g eslint prettier typescript  # Or use npx (no install needed)

# For Python projects
pip install semgrep bandit pylint

# For Go projects
go install github.com/securego/gosec/v2/cmd/gosec@latest

# For Ruby projects
gem install rubocop brakeman
```

### 2. **During Code Sherlock Execution**
- Code Sherlock checks if configured tools are available
- If tools are missing, it shows a warning but continues
- Available tools are used for analysis
- Missing tools are skipped gracefully

### 3. **Tool Availability Check**
Code Sherlock automatically checks tool availability when you run a review:

```
⚠️  Some linter tools are not available:
   ❌ Missing tools:
      - pylint
        Install: pip install pylint
        Error: Command not found in PATH
```

## Installation Methods

### Method 1: npx (No Installation Needed)
For npm-based tools (ESLint, Prettier, TypeScript), Code Sherlock uses `npx` which downloads tools on-demand:

- ✅ No installation required
- ✅ Always uses latest version
- ⚠️ Requires internet connection
- ⚠️ Slightly slower first run

### Method 2: Global Installation
Install tools globally so they're available system-wide:

```bash
npm install -g eslint
pip install semgrep
gem install rubocop
```

- ✅ Faster execution
- ✅ Works offline
- ⚠️ Need to update manually
- ⚠️ May conflict with project-specific versions

### Method 3: Project Dependencies
Add tools as project dependencies:

```json
// package.json
{
  "devDependencies": {
    "eslint": "^8.55.0",
    "prettier": "^3.1.1"
  }
}
```

Then run: `npm install`

- ✅ Version controlled
- ✅ Consistent across team
- ✅ Project-specific versions
- ⚠️ Need to install per project

## Recommended Approach

1. **For npm tools**: Use npx (default) - no installation needed
2. **For other tools**: Install globally or via package manager
3. **For CI/CD**: Install as part of build pipeline
4. **For teams**: Document required tools in project README

## What Happens If Tools Are Missing?

Code Sherlock handles missing tools gracefully:

1. ✅ Checks tool availability before running
2. ⚠️ Shows warning if tools are missing
3. ✅ Continues with available tools
4. ✅ Falls back to AI review if no tools available
5. ✅ Still provides comprehensive review

**You don't need all tools** - install only what you need for your project type.

## Quick Start

1. **Install Code Sherlock**: `npm install -g code-sherlock`
2. **Configure tools** in `code-sherlock.config.json`
3. **Install required tools** (see [TOOL_INSTALLATION.md](./TOOL_INSTALLATION.md))
4. **Run review**: `code-sherlock review --branch feature-branch`

Code Sherlock will tell you which tools are missing and how to install them!

## See Also

- [Full Installation Guide](./TOOL_INSTALLATION.md) - Detailed instructions for each tool
- [Improvements Guide](./IMPROVEMENTS.md) - Feature overview and recommendations
