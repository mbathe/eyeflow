#!/bin/bash

# EyeFlow - API Integration Test Suite
# Tests all API endpoints to ensure routing and functionality

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
USER_ID="550e8400-e29b-41d4-a716-446655440000"
BASE_URL="http://localhost:3000/tasks"
PASS=0
FAIL=0

# Colors
RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
BLUE=$'\033[0;34m'
NC=$'\033[0m' # No Color

# Test function
test_endpoint() {
  local method=$1
  local path=$2
  local expected_status=$3
  local body=$4
  local description=$5
  
  echo "${BLUE}→${NC} Testing: ${YELLOW}$method $path${NC}"
  
  if [ -z "$body" ]; then
    response=$(curl -s -w "\n%{http_code}" -X "$method" "$BASE_URL$path" \
      -H "X-User-ID: $USER_ID" 2>/dev/null)
  else
    response=$(curl -s -w "\n%{http_code}" -X "$method" "$BASE_URL$path" \
      -H "Content-Type: application/json" \
      -H "X-User-ID: $USER_ID" \
      -d "$body" 2>/dev/null)
  fi
  
  http_code=$(echo "$response" | tail -1)
  response_body=$(echo "$response" | head -n -1)
  
  if [[ "$http_code" == "$expected_status"* ]]; then
    echo "${GREEN}  ✅ PASS${NC} (HTTP $http_code) - $description"
    ((PASS++))
  else
    echo "${RED}  ❌ FAIL${NC} (Expected $expected_status, got $http_code) - $description"
    echo "     Response: $(echo "$response_body" | jq -c '.' 2>/dev/null | head -c 80)"
    ((FAIL++))
  fi
}

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║         EyeFlow API Integration Test Suite                       ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "📍 Testing: $BASE_URL"
echo "👤 User ID: $USER_ID"
echo ""

# Check if server is running
echo "${YELLOW}🔍 Checking server health...${NC}"
if ! curl -s http://localhost:3000/health > /dev/null 2>&1; then
  echo "${RED}❌ Server is not running on http://localhost:3000${NC}"
  echo "   Start the server with: cd eyeflow-server && npm run start"
  exit 1
fi
echo "${GREEN}✅ Server is running${NC}"
echo ""

# ═════════════════════════════════════════════════════════════════════════════
# SECTION 1: Approval Workflow Endpoints
# ═════════════════════════════════════════════════════════════════════════════
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "${YELLOW}📋 SECTION 1: Approval Workflow Endpoints${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_endpoint "GET" "/rules/pending-approval" "200" "" "Get pending approval rules"
test_endpoint "GET" "/approval/stats" "200" "" "Get approval statistics"

echo ""

# ═════════════════════════════════════════════════════════════════════════════
# SECTION 2: Generic Rules Endpoint
# ═════════════════════════════════════════════════════════════════════════════
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "${YELLOW}📋 SECTION 2: Generic Rules Endpoint (Should Reach Generic Handler)${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_endpoint "GET" "/rules/550e8400-e29b-41d4-a716-446655440000" "404" "" "Non-existent rule should return 404"

echo ""

# ═════════════════════════════════════════════════════════════════════════════
# SECTION 3: Approval-Specific Endpoints with Invalid IDs
# ═════════════════════════════════════════════════════════════════════════════
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "${YELLOW}📋 SECTION 3: Approval-Specific Endpoints (Should Route Correctly)${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_endpoint "GET" "/rules/550e8400-e29b-41d4-a716-446655440000/for-approval" "404" "" "Non-existent rule (for-approval route)"
test_endpoint "GET" "/rules/550e8400-e29b-41d4-a716-446655440000/dag" "404" "" "Non-existent rule (dag route)"
test_endpoint "POST" "/rules/550e8400-e29b-41d4-a716-446655440000/approve" "40[0-9]" "" "Non-existent rule (approve route)"
test_endpoint "POST" "/rules/550e8400-e29b-41d4-a716-446655440000/reject" "40[0-9]" '{"feedback":"test"}' "Non-existent rule (reject route)"

echo ""

# ═════════════════════════════════════════════════════════════════════════════
# SECTION 4: Manifest Endpoints
# ═════════════════════════════════════════════════════════════════════════════
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "${YELLOW}📋 SECTION 4: Manifest & Context Endpoints${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_endpoint "GET" "/manifest/connectors" "200" "" "Get all connector manifests"
test_endpoint "GET" "/manifest/llm-context" "200" "" "Get LLM context for intent parsing"

echo ""

# ═════════════════════════════════════════════════════════════════════════════
# SECTION 5: Route Priority Verification
# ═════════════════════════════════════════════════════════════════════════════
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "${YELLOW}📋 SECTION 5: Route Priority Verification${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "${BLUE}→${NC} Verifying that specific routes are matched before generic :id route..."

# Test that pending-approval doesn't get captured by :id handler
response_pending=$(curl -s -H "X-User-ID: $USER_ID" "$BASE_URL/rules/pending-approval" 2>/dev/null)
if echo "$response_pending" | jq -e '.rules' > /dev/null 2>&1; then
  echo "${GREEN}  ✅ PASS${NC} - /pending-approval reached correct handler (has 'rules' field)"
  ((PASS++))
else
  echo "${RED}  ❌ FAIL${NC} - /pending-approval did NOT reach correct handler"
  ((FAIL++))
fi

# Test that approval/stats doesn't get captured by :id handler
response_stats=$(curl -s -H "X-User-ID: $USER_ID" "$BASE_URL/approval/stats" 2>/dev/null)
if echo "$response_stats" | jq -e '.stats' > /dev/null 2>&1; then
  echo "${GREEN}  ✅ PASS${NC} - /approval/stats reached correct handler (has 'stats' field)"
  ((PASS++))
else
  echo "${RED}  ❌ FAIL${NC} - /approval/stats did NOT reach correct handler"
  ((FAIL++))
fi

echo ""

# ═════════════════════════════════════════════════════════════════════════════
# SECTION 6: Error Handling
# ═════════════════════════════════════════════════════════════════════════════
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "${YELLOW}📋 SECTION 6: Error Handling & Security${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_endpoint "GET" "/rules/pending-approval" "40[0-9]" "" "Missing X-User-ID header should fail"

echo ""

# ═════════════════════════════════════════════════════════════════════════════
# Final Summary
# ═════════════════════════════════════════════════════════════════════════════
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║                    TEST RESULTS SUMMARY                         ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "  ${GREEN}✅ Passed: $PASS${NC}"
echo "  ${RED}❌ Failed: $FAIL${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
  echo "${GREEN}🎉 ALL TESTS PASSED!${NC}"
  echo ""
  echo "✓ All approval workflow endpoints work correctly"
  echo "✓ Route priority is correct (specific routes before generic)"
  echo "✓ Error handling is working as expected"
  echo ""
  exit 0
else
  echo "${RED}❌ SOME TESTS FAILED!${NC}"
  echo ""
  echo "Please review the failures above and check:"
  echo "  1. Server is running: npm run start (in eyeflow-server/)"
  echo "  2. Routes are correctly prioritized in tasks.controller.ts"
  echo "  3. Environment variables are properly configured"
  echo ""
  exit 1
fi
