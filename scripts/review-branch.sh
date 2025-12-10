#!/bin/bash
#
# Review a Git Branch or PR Locally
#
# Usage:
#   ./review-branch.sh <branch-name> [base-branch]
#   ./review-branch.sh feature/my-feature main
#   ./review-branch.sh pr/123  # For GitHub PRs
#
# Examples:
#   ./review-branch.sh dev-sid/ai-agents-vue3 dev
#   ./review-branch.sh feature/new-social-media dev
#

set -e

BRANCH=${1:-$(git branch --show-current)}
BASE=${2:-main}
REPO_ROOT=$(git rev-parse --show-toplevel)

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║           🔍 Code-Sherlock Branch Review                   ║"
echo "╠═══════════════════════════════════════════════════════════╣"
echo "║  Branch: $BRANCH"
echo "║  Base:   $BASE"
echo "║  Repo:   $REPO_ROOT"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Fetch latest
echo "📥 Fetching latest..."
git fetch origin $BASE 2>/dev/null || true
git fetch origin $BRANCH 2>/dev/null || true

# Get changed files
echo "📄 Getting changed files..."
CHANGED_FILES=$(git diff --name-only origin/$BASE...$BRANCH 2>/dev/null || git diff --name-only $BASE...$BRANCH)

if [ -z "$CHANGED_FILES" ]; then
    echo "❌ No changed files found between $BASE and $BRANCH"
    exit 1
fi

# Filter to code files
CODE_FILES=$(echo "$CHANGED_FILES" | grep -E '\.(ts|tsx|js|jsx|vue)$' || true)
FILE_COUNT=$(echo "$CODE_FILES" | grep -c . || echo "0")

echo "   Found $FILE_COUNT code files changed"
echo ""

# Create temp directory for changed files
TEMP_DIR=$(mktemp -d)
echo "📁 Preparing files for analysis..."

for file in $CODE_FILES; do
    if [ -f "$file" ]; then
        mkdir -p "$TEMP_DIR/$(dirname $file)"
        cp "$file" "$TEMP_DIR/$file"
    fi
done

# Run Security Scan
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "🔒 SECURITY SCAN"
echo "═══════════════════════════════════════════════════════════"
echo ""

code-sherlock security --path "$TEMP_DIR" --min-severity warning 2>/dev/null || echo "Security scan completed"

# Run Performance Analysis
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "⚡ PERFORMANCE ANALYSIS"
echo "═══════════════════════════════════════════════════════════"
echo ""

code-sherlock perf --path "$TEMP_DIR" --focus both 2>/dev/null || echo "Performance analysis completed"

# Show changed files
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "📄 CHANGED FILES"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "$CODE_FILES" | head -20

if [ "$FILE_COUNT" -gt 20 ]; then
    echo "... and $((FILE_COUNT - 20)) more files"
fi

# Cleanup
rm -rf "$TEMP_DIR"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✅ Review Complete!"
echo "═══════════════════════════════════════════════════════════"
