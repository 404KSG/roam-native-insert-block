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

  // Add export default block
  const exportBlock = `

export default {
  onload: ({ extensionAPI }) => {
    // 加载插件
    unloadExisting();
    loadPlugin();
    window.nativeInsertBlockPlugin = mainApp;
  },
  onunload: () => {
    // 卸载插件
    unloadExisting();
  },
}
`;

  const es6Code = coreCode + exportBlock;

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
