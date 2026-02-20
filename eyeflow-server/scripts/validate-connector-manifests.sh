#!/bin/bash
# validate-connector-manifests.sh
# Validates connector manifests for compliance before merging PRs
#
# Usage: ./validate-connector-manifests.sh [manifest-files...]

set -e

MANIFESTS="${@:-.}"
SCHEMA_PATH="schemas/llm-connector-manifest.schema.json"
ERRORS=0
WARNINGS=0

echo "🔍 Validating Connector Manifests..."
echo ""

for manifest in $MANIFESTS; do
  if [ ! -f "$manifest" ]; then
    echo "⚠️  File not found: $manifest"
    continue
  fi

  echo "📋 Checking: $manifest"

  # 1. JSON Schema validation
  echo "   → Schema validation..."
  if ! npx ajv test -s "$SCHEMA_PATH" -d "$manifest" > /dev/null 2>&1; then
    echo "   ❌ Schema validation failed"
    ((ERRORS++))
  else
    echo "   ✓ Schema compliant"
  fi

  # 2. Check for required metadata
  echo "   → Metadata check..."
  if ! grep -q '"author"' "$manifest"; then
    echo "   ⚠️  Missing author field"
    ((WARNINGS++))
  fi

  if ! grep -q '"version"' "$manifest"; then
    echo "   ❌ Missing version field (REQUIRED)"
    ((ERRORS++))
  fi

  if ! grep -q '"capabilities"' "$manifest"; then
    echo "   ⚠️  No capabilities declared"
    ((WARNINGS++))
  fi

  # 3. Validate semantic versioning
  echo "   → Semver validation..."
  VERSION=$(grep -oP '"version":\s*"\K[^"]+' "$manifest" || echo "")
  if [[ ! $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+(-(alpha|beta|rc)\.[0-9]+)?$ ]]; then
    echo "   ❌ Invalid semantic version: $VERSION"
    ((ERRORS++))
  else
    echo "   ✓ Version: $VERSION"
  fi

  # 4. Function signature validation
  echo "   → Function signature check..."
  if ! npx ts-node validate-function-signatures.ts "$manifest" > /dev/null 2>&1; then
    echo "   ⚠️  Function signature validation issues"
    ((WARNINGS++))
  fi

  echo ""
done

echo "────────────────────────────────────────"
echo "Summary:"
echo "  ✓ Errors: $ERRORS"
echo "  ⚠️  Warnings: $WARNINGS"

if [ $ERRORS -gt 0 ]; then
  echo ""
  echo "❌ Validation FAILED"
  exit 1
else
  echo ""
  echo "✅ Validation PASSED"
  exit 0
fi
