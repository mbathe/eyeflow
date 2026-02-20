#!/usr/bin/env node

/**
 * Direct Jest Test Runner
 * Bypasses terminal issues by running Jest programmatically
 */

const { execSync } = require('child_process');
const path = require('path');

const projectRoot = __dirname;  // Should be in eyeflow-server/
const testFile = path.join(projectRoot, 'src/integration-full-pipeline.spec.ts');

console.log('🚀 Starting E2E Pipeline Test Execution...\n');
console.log(`Project Root: ${projectRoot}`);
console.log(`Test File: ${testFile}\n`);

try {
  // Run Jest with proper configuration
  const cmd = `npx jest "${testFile}" --passWithNoTests --verbose --forceExit --detectOpenHandles`;
  
  console.log(`Executing: ${cmd}\n`);
  console.log('─'.repeat(80) + '\n');
  
  const output = execSync(cmd, { 
    cwd: projectRoot,
    stdio: 'inherit',
    encoding: 'utf-8'
  });
  
  console.log('\n' + '─'.repeat(80));
  console.log('\n✅ Test execution completed successfully!\n');
  
} catch (error) {
  console.error('\n❌ Test execution failed!');
  console.error('Error:', error.message);
  process.exit(1);
}
