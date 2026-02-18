# EyeFlow - Test & CI/CD Guide

Complete testing and continuous integration/deployment guide for the EyeFlow approval workflow system.

## 📋 Table of Contents
- [Quick Start](#quick-start)
- [Local Testing](#local-testing)
- [CI/CD Pipeline](#cicd-pipeline)
- [Test Coverage](#test-coverage)
- [Troubleshooting](#troubleshooting)

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Docker (for Docker build tests)
- Git
- PostgreSQL (for E2E tests)

### Running All Tests Locally

```bash
cd eyeflow

# Make scripts executable
chmod +x test-suite.sh
chmod +x api-integration-tests.sh

# Run complete test suite
./test-suite.sh

# Run API integration tests
./api-integration-tests.sh
```

### Push to GitHub with Auto-Testing

```bash
git add .
git commit -m "Your commit message"
git push origin main
# GitHub Actions will automatically run CI/CD pipeline
```

---

## 🧪 Local Testing

### 1. Unit Tests

Run tests for individual services and controllers:

```bash
cd eyeflow-server

# Run all unit tests
npm run test

# Run tests in watch mode (for development)
npm run test -- --watch

# Generate coverage report
npm run test -- --coverage
```

**Test Files:**
- `src/tasks/controllers/tasks.controller.spec.ts` - Controller unit tests
- `src/tasks/services/rule-approval.service.spec.ts` - Approval service tests
- `src/tasks/services/dag-generator.service.spec.ts` - DAG generation tests

### 2. E2E Tests

End-to-end tests that test the complete API:

```bash
cd eyeflow-server

# Run E2E tests
npm run test:e2e

# Run specific E2E suite
npm run test:e2e -- approval-workflow
```

**Test Files:**
- `test/approval-workflow.e2e-spec.ts` - Complete workflow tests
- Routes tested:
  - ✅ GET `/tasks/rules/pending-approval`
  - ✅ GET `/tasks/approval/stats`
  - ✅ GET `/tasks/rules/:id/for-approval`
  - ✅ GET `/tasks/rules/:id/dag`
  - ✅ POST `/tasks/rules/:id/approve`
  - ✅ POST `/tasks/rules/:id/reject`

### 3. API Integration Tests

Test all endpoints in a live server environment:

```bash
# First, start the server in another terminal
cd eyeflow-server
npm run start

# In another terminal, run API tests
cd ..
./api-integration-tests.sh
```

This tests:
- ✅ Route priority (specific routes before generic)
- ✅ Error handling
- ✅ Security headers
- ✅ Response formats
- ✅ HTTP status codes

### 4. Build Verification

Ensure the application builds without errors:

```bash
cd eyeflow-server

# Build the application
npm run build

# This checks:
# ✅ TypeScript compilation
# ✅ No ESLint violations
# ✅ All dependencies resolved
```

---

## 🔄 CI/CD Pipeline

### Workflow Name
**CI/CD Pipeline - EyeFlow Server** (`.github/workflows/ci-cd.yml`)

### Pipeline Stages

The GitHub Actions pipeline runs automatically on:
- **Push to `main` branch** → Full pipeline + deploy
- **Push to `develop` branch** → Tests only
- **Pull requests** → Tests only

#### Stage 1: Lint & Build
```
✓ Checkout code
✓ Setup Node.js 18
✓ Install dependencies
✓ Run ESLint (if configured)
✓ TypeScript compilation
✓ Upload build artifacts
```

#### Stage 2: Unit Tests
```
✓ Run Jest tests
✓ Generate coverage report
✓ Upload to Codecov
```

#### Stage 3: E2E Tests
```
✓ Start PostgreSQL service
✓ Run E2E test suite
✓ Test all approval workflow endpoints
```

#### Stage 4: Security Scan
```
✓ npm audit for vulnerable dependencies
✓ Snyk security scanning
```

#### Stage 5: Docker Build & Push
*Only on main branch, if all tests pass*
```
✓ Build NestJS Server image
✓ Build Python Agent image
✓ Push to GitHub Container Registry (GHCR)
```

#### Stage 6: Deploy
*Only on main branch, if all previous stages pass*
```
✓ Deploy NestJS Server
✓ Deploy Python Agent
✓ Run health checks
```

#### Stage 7: Notify on Failure
```
✓ Create GitHub issue if pipeline fails
✓ Add labels for visibility
```

---

## 📊 Test Coverage

### Controllers
- **tasks.controller.spec.ts** (6 test suites)
  - Pending approval rules
  - Approval statistics
  - Get rule for approval with DAG
  - Approve rule
  - Reject rule with feedback
  - Get DAG visualization
  - Generic rule status endpoint

### Services
- **rule-approval.service.spec.ts** (6 test suites)
  - Get pending approval rules
  - Get rule for approval review
  - Approve rule successfully
  - Reject rule with feedback
  - Update rule with DAG
  - Service initialization

- **dag-generator.service.spec.ts** (5 test suites)
  - Generate DAG from compilation report
  - Handle empty data flow
  - Create edges between nodes
  - Include metadata
  - Calculate node positions

### E2E Tests
- **approval-workflow.e2e-spec.ts** (10+ test cases)
  - Health checks
  - All approval workflow routes
  - Route priority verification
  - Error handling
  - Security headers

### API Integration Tests
- 15+ endpoint tests
- Route priority verification
- Error handling verification
- Response format validation

**Total Test Coverage:** 40+ test cases

---

## 🔐 Security

### Docker Security
```yaml
- NestJS Server runs as non-root user
- Health checks configured
- Resource limits set
- Network policies applied
```

### Dependency Scanning
```yaml
- npm audit runs before push
- Snyk scans for known vulnerabilities
- Failed scans prevent merging
```

### Code Quality
```yaml
- ESLint checks formatting
- TypeScript strict mode enabled
- No console.log in production code
```

---

## 📝 Pre-Push Checklist

Before pushing to GitHub:

```bash
# 1. Run full test suite
./test-suite.sh

# 2. Run API integration tests (if server is running)
./api-integration-tests.sh

# 3. Check git status
git status

# 4. Review your changes
git diff

# 5. Stage and commit
git add .
git commit -m "feat: [description of changes]"

# 6. Push to GitHub
git push origin main
```

---

## 🐛 Troubleshooting

### Tests Failing Locally

**Problem:** "Cannot find module '@nestjs/testing'"

```bash
# Solution: Install dev dependencies
npm install --save-dev @nestjs/testing @nestjs/jwt jest @types/jest ts-jest
npm install --save-dev supertest @types/supertest
```

**Problem:** "PostgreSQL connection failed"

```bash
# Solution: Ensure PostgreSQL is running
docker run --name eyeflow-postgres -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres:14

# Or configure test environment
cp .env.example .env.test
# Edit .env.test with your local PostgreSQL credentials
```

**Problem:** "Server not responding on http://localhost:3000"

```bash
# Solution: Start the server
cd eyeflow-server
npm run start

# In another terminal:
cd ..
./api-integration-tests.sh
```

### GitHub Actions Not Running

**Problem:** Workflow file not recognized

```bash
# Solution: Check the workflow is in correct location
ls -la .github/workflows/ci-cd.yml

# Verify GitHub Actions is enabled
# Settings → Actions → General → Actions permissions
```

**Problem:** Docker images not pushing

```bash
# Solution: Configure GitHub token
# Settings → Secrets and variables → Actions
# Add: GITHUB_TOKEN (auto-generated)
```

### Coverage Reports Missing

**Problem:** "Coverage not found in codecov"

```bash
# Solution: Generate coverage locally
npm run test -- --coverage

# Check coverage directory exists
ls -la coverage/
```

---

## 📚 References

### Test Frameworks
- **Jest** - Testing framework
- **Supertest** - HTTP assertions
- **@nestjs/testing** - NestJS test utilities

### CI/CD
- **GitHub Actions** - Automation platform
- **Docker** - Container orchestration
- **Snyk** - Security scanning

### Documentation
- [Jest Documentation](https://jestjs.io/)
- [NestJS Testing](https://docs.nestjs.com/fundamentals/testing)
- [GitHub Actions](https://docs.github.com/en/actions)

---

## 📞 Support

For issues or questions:
1. Check the [Troubleshooting](#troubleshooting) section
2. Review test output logs
3. Check GitHub Actions workflow logs
4. Create an issue with:
   - Test name and failure
   - Local reproduction steps
   - Environment details

---

## 📜 License

Same as parent EyeFlow project

## ✅ Status

- **Tests:** ✅ All passing
- **Coverage:** 40+ test cases
- **CI/CD:** ✅ Automated on GitHub
- **Deployment:** ✅ Auto-deploy on main branch
