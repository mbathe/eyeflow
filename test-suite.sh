#!/bin/bash

# EyeFlow - Local Test Suite
# This script runs all tests locally before pushing to GitHub

set -e

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║           EyeFlow - Comprehensive Test Suite                    ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

FAILED=0
PASSED=0

# Colors
RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
BLUE=$'\033[0;34m'
NC=$'\033[0m' # No Color

# Function to run a test
run_test() {
  local name=$1
  local command=$2
  
  echo "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo "${BLUE}Running: $name${NC}"
  echo "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  
  if eval "$command"; then
    echo "${GREEN}✅ $name PASSED${NC}"
    ((PASSED++))
  else
    echo "${RED}❌ $name FAILED${NC}"
    ((FAILED++))
  fi
  echo ""
}

cd "$(dirname "$0")"

# ═══════════════════════════════════════════════════════════════════════════
# STAGE 1: Setup & Dependencies
# ═══════════════════════════════════════════════════════════════════════════
echo "${YELLOW}📦 STAGE 1: Checking Dependencies${NC}"
echo ""

run_test "Node.js Version Check" "node --version && npm --version"
run_test "Install Dependencies" "cd eyeflow-server && npm ci 2>&1 | tail -3"

cd eyeflow-server

# ═══════════════════════════════════════════════════════════════════════════
# STAGE 2: Linting
# ═══════════════════════════════════════════════════════════════════════════
echo ""
echo "${YELLOW}🔍 STAGE 2: Code Quality & Linting${NC}"
echo ""

run_test "ESLint Check" "npm run lint --if-present || echo 'No lint script'"

# ═══════════════════════════════════════════════════════════════════════════
# STAGE 3: Build
# ═══════════════════════════════════════════════════════════════════════════
echo ""
echo "${YELLOW}🔨 STAGE 3: TypeScript Compilation${NC}"
echo ""

run_test "Build NestJS Application" "npm run build"

# ═══════════════════════════════════════════════════════════════════════════
# STAGE 4: Unit Tests
# ═══════════════════════════════════════════════════════════════════════════
echo ""
echo "${YELLOW}🧪 STAGE 4: Unit Tests${NC}"
echo ""

run_test "Unit Tests" "npm run test -- --passWithNoTests 2>&1 | tail -20"

# ═══════════════════════════════════════════════════════════════════════════
# STAGE 5: E2E Tests (if configured)
# ═══════════════════════════════════════════════════════════════════════════
echo ""
echo "${YELLOW}🔗 STAGE 5: E2E Tests${NC}"
echo ""

run_test "E2E Tests" "npm run test:e2e -- --passWithNoTests 2>&1 | tail -20" || true

# ═══════════════════════════════════════════════════════════════════════════
# STAGE 6: Docker Build Check
# ═══════════════════════════════════════════════════════════════════════════
echo ""
echo "${YELLOW}🐳 STAGE 6: Docker Build Check${NC}"
echo ""

if command -v docker &> /dev/null; then
  run_test "Docker Image Build (NestJS)" "docker build -t eyeflow-server:test . --quiet" || true
else
  echo "${YELLOW}⚠️  Docker not found, skipping Docker build test${NC}"
fi

cd ..

# ═══════════════════════════════════════════════════════════════════════════
# STAGE 7: API Health Check
# ═══════════════════════════════════════════════════════════════════════════
echo ""
echo "${YELLOW}💓 STAGE 7: API Health Check${NC}"
echo ""

if pgrep -f "npm run start" > /dev/null 2>&1; then
  echo "${GREEN}ℹ️  NestJS server is running${NC}"
  
  run_test "Health Endpoint" "curl -s http://localhost:3000/health | jq '.status' | grep -q 'ok'" || true
  run_test "Manifests Endpoint" "curl -s http://localhost:3000/tasks/manifest/connectors | jq '.connectors | length'" || true
  run_test "Approval Stats Endpoint" "curl -s -H 'X-User-ID: test' http://localhost:3000/tasks/approval/stats | jq '.success' | grep -q true" || true
else
  echo "${YELLOW}⚠️  NestJS server not running, skipping API tests${NC}"
  echo "   Start with: cd eyeflow-server && npm run start"
fi

echo ""
echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║                        TEST SUMMARY                             ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "${GREEN}✅ Passed: $PASSED${NC}"
echo "${RED}❌ Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  echo "${GREEN}🎉 ALL TESTS PASSED! Ready to push to GitHub.${NC}"
  echo ""
  echo "Next steps:"
  echo "  1. Review changes: git status"
  echo "  2. Stage changes: git add ."
  echo "  3. Commit: git commit -m 'Your message'"
  echo "  4. Push: git push origin main"
  echo ""
  exit 0
else
  echo "${RED}❌ Some tests failed. Fix the issues before pushing.${NC}"
  echo ""
  exit 1
fi
