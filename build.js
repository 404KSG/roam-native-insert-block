const fs = require('fs');
const path = require('path');

const SOURCE_FILE = 'src/index.js';
const OUTPUT_FILE = 'extension.js';

function buildES6Module() {
  console.log('🔨 Building ES6 module for Roam Plugin Depot...');

  // Read source file (IIFE format)
  const sourceCode = fs.readFileSync(SOURCE_FILE, 'utf-8');

  // Remove IIFE wrapper: (() => { ... })();
  // Match the pattern and extract the content
  const iifePattern = /^\(\(\) => \{([\s\S]*)\}\)\(\);?\s*$/;
  const match = sourceCode.match(iifePattern);

  if (!match) {
    throw new Error('Source file is not in IIFE format');
  }

  const coreCode = match[1].trim();
  const directExecutionPattern = /\n\s*unloadExisting\(\);\s*\n\s*loadPlugin\(\);\s*\n\s*window\.nativeInsertBlockPlugin = mainApp;\s*$/;

  if (!directExecutionPattern.test(coreCode)) {
    throw new Error('Could not find the direct roam/js startup block');
  }

  // The IIFE source starts itself when pasted into {{[[roam/js]]}}. The
  // Marketplace module must only start through its lifecycle hook.
  const moduleCode = coreCode.replace(directExecutionPattern, '').trimEnd();

  // Add export default block
  const exportBlock = `

export default {
  onload: () => {
    unloadExisting();
    loadPlugin();
    window.nativeInsertBlockPlugin = mainApp;
  },
  onunload: () => {
    unloadExisting();
  },
};
`;

  const es6Code = moduleCode + exportBlock;

  // Write output file
  fs.writeFileSync(OUTPUT_FILE, es6Code, 'utf-8');

  console.log(`✅ Built: ${OUTPUT_FILE}`);
  console.log(`📦 File size: ${(fs.statSync(OUTPUT_FILE).size / 1024).toFixed(2)} KB`);
}

function watchMode() {
  console.log('👀 Watching for changes...');
  fs.watch(SOURCE_FILE, (eventType) => {
    if (eventType === 'change') {
      console.log(`\n📝 ${SOURCE_FILE} changed, rebuilding...`);
      try {
        buildES6Module();
      } catch (error) {
        console.error('❌ Build failed:', error.message);
      }
    }
  });
}

// Main execution
try {
  buildES6Module();

  // Check for watch flag
  if (process.argv.includes('--watch')) {
    watchMode();
  }
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}
