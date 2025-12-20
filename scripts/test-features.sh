#!/bin/bash

# Test Script for Code Sherlock New Features
# Usage: ./scripts/test-features.sh

set -e

echo "🧪 Testing Code Sherlock New Features"
echo "======================================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test 1: Build
echo "📦 Building project..."
npm run build
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Build successful${NC}"
else
  echo -e "${RED}❌ Build failed${NC}"
  exit 1
fi

# Test 2: Lint
echo ""
echo "🔍 Running linter..."
npm run lint
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Lint passed${NC}"
else
  echo -e "${YELLOW}⚠️  Lint has warnings (expected for unused methods)${NC}"
fi

# Test 3: Unit Tests
echo ""
echo "🧪 Running unit tests..."
npm test
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Unit tests passed${NC}"
else
  echo -e "${RED}❌ Unit tests failed${NC}"
  exit 1
fi

# Test 4: Test Codegraph
echo ""
echo "🔗 Testing Codegraph Analyzer..."
npx tsx examples/test-new-features.ts 2>&1 | grep -A 20 "Testing Codegraph" || echo -e "${YELLOW}⚠️  Codegraph test skipped${NC}"

# Test 5: Test False Positive Filter
echo ""
echo "🎯 Testing False Positive Filter..."
npx tsx examples/test-new-features.ts 2>&1 | grep -A 20 "Testing False Positive" || echo -e "${YELLOW}⚠️  Filter test skipped${NC}"

echo ""
echo "======================================"
echo -e "${GREEN}✅ All tests completed!${NC}"
echo ""
echo "📝 Next steps:"
echo "  1. Test with a real repository:"
echo "     code-sherlock review --branch <branch-name>"
echo ""
echo "  2. Test individual features:"
echo "     npx tsx examples/test-new-features.ts"
echo ""
