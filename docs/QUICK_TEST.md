# Quick Testing Guide

## 🚀 Fastest Way to Test

### **1. Run Test Script**

```bash
# Run comprehensive tests
./scripts/test-features.sh

# Or manually
npm run build
npm test
npx tsx examples/test-new-features.ts
```

### **2. Test with Real Repository**

```bash
# Clone or use existing repo
cd /path/to/your-repo

# Create a test branch
git checkout -b test-code-sherlock
echo "const test = 1;" >> test.js
git add test.js
git commit -m "Test commit"

# Run review
code-sherlock review --branch test-code-sherlock --no-comments
```

### **3. Test Individual Features**

```bash
# Test codegraph (using pre-made test file)
npx tsx test-codegraph.ts

# Test filtering (using pre-made test file)
npx tsx test-filter.ts

# Or test all features at once
npx tsx examples/test-new-features.ts
```

---

## ✅ Expected Results

### **Successful Test Output:**

```
🔗 Testing Codegraph Analyzer...
✅ Dependency graph built
📊 Impact Analysis:
- Affected files: 3
- Severity: high

🎯 Testing False Positive Filtering...
📊 Filtering Results:
- Original comments: 4
- Filtered comments: 2
- Filter rate: 50%

🔧 Testing Linter Integration...
📊 Linter Results:
- Tools used: eslint, prettier

🔒 Testing SAST Integration...
📊 SAST Results:
- Tools used: npm-audit
```

---

## 🎯 Quick Test Checklist

- [ ] Build succeeds: `npm run build`
- [ ] Lint passes: `npm run lint` (warnings OK)
- [ ] Tests pass: `npm test`
- [ ] Codegraph works: See test output
- [ ] Filtering works: See test output
- [ ] Review works: `code-sherlock review --branch <branch>`

---

**That's it!** 🎉
