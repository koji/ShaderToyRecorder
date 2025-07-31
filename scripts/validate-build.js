#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_DIR = path.join(__dirname, "..", "dist");
const REQUIRED_FILES = [
  "manifest.json",
  "assets",
  "src/popup/popup.html",
  "src/offscreen/offscreen.html",
];

const REQUIRED_ASSET_PATTERNS = [
  /content\.ts-.*\.js$/,
  /background\.ts-.*\.js$/,
  /popup\.html-.*\.js$/,
];

const REQUIRED_PERMISSIONS = [
  "scripting",
  "activeTab",
  "tabCapture",
  "offscreen",
];

console.log("🔍 Validating Chrome extension build...\n");

// Check if dist directory exists
if (!fs.existsSync(DIST_DIR)) {
  console.error("❌ Build directory not found. Run npm run build first.");
  process.exit(1);
}

let errors = 0;
let warnings = 0;

// Validate required files exist
console.log("📁 Checking required files...");
for (const file of REQUIRED_FILES) {
  const filePath = path.join(DIST_DIR, file);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Missing required file: ${file}`);
    errors++;
  } else {
    console.log(`✅ Found: ${file}`);
  }
}

// Validate required asset patterns exist
console.log("\n📦 Checking required assets...");
const assetsDir = path.join(DIST_DIR, "assets");
if (fs.existsSync(assetsDir)) {
  const assetFiles = fs.readdirSync(assetsDir);

  for (const pattern of REQUIRED_ASSET_PATTERNS) {
    const found = assetFiles.some((file) => pattern.test(file));
    if (!found) {
      console.error(`❌ Missing required asset matching pattern: ${pattern}`);
      errors++;
    } else {
      const matchingFile = assetFiles.find((file) => pattern.test(file));
      console.log(`✅ Found asset: ${matchingFile}`);
    }
  }
} else {
  console.error("❌ Assets directory not found");
  errors++;
}

// Validate manifest.json
console.log("\n📋 Validating manifest.json...");
try {
  const manifestPath = path.join(DIST_DIR, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  // Check manifest version
  if (manifest.manifest_version !== 3) {
    console.error("❌ Manifest version should be 3");
    errors++;
  } else {
    console.log("✅ Manifest version 3");
  }

  // Check required permissions
  for (const permission of REQUIRED_PERMISSIONS) {
    if (!manifest.permissions?.includes(permission)) {
      console.error(`❌ Missing required permission: ${permission}`);
      errors++;
    } else {
      console.log(`✅ Permission: ${permission}`);
    }
  }

  // Check content scripts
  if (!manifest.content_scripts || manifest.content_scripts.length === 0) {
    console.error("❌ No content scripts defined");
    errors++;
  } else {
    console.log("✅ Content scripts defined");
  }

  // Check background script
  if (!manifest.background?.service_worker) {
    console.error("❌ No background service worker defined");
    errors++;
  } else {
    console.log("✅ Background service worker defined");
  }
} catch (error) {
  console.error("❌ Failed to parse manifest.json:", error.message);
  errors++;
}

// Check file sizes
console.log("\n📊 Checking file sizes...");
const MAX_SIZE_MB = 5; // Chrome Web Store limit is much higher, but we want to keep it small
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

function getDirectorySize(dirPath) {
  let totalSize = 0;

  function calculateSize(currentPath) {
    const stats = fs.statSync(currentPath);
    if (stats.isDirectory()) {
      const files = fs.readdirSync(currentPath);
      for (const file of files) {
        calculateSize(path.join(currentPath, file));
      }
    } else {
      totalSize += stats.size;
    }
  }

  calculateSize(dirPath);
  return totalSize;
}

const totalSize = getDirectorySize(DIST_DIR);
const sizeMB = (totalSize / (1024 * 1024)).toFixed(2);

if (totalSize > MAX_SIZE_BYTES) {
  console.warn(
    `⚠️  Extension size (${sizeMB}MB) exceeds recommended limit (${MAX_SIZE_MB}MB)`
  );
  warnings++;
} else {
  console.log(`✅ Extension size: ${sizeMB}MB (within limits)`);
}

// Check for source maps in production
console.log("\n🗺️  Checking source maps...");
const sourceMapFiles = [];
function findSourceMaps(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      findSourceMaps(filePath);
    } else if (file.endsWith(".map")) {
      sourceMapFiles.push(path.relative(DIST_DIR, filePath));
    }
  }
}

findSourceMaps(DIST_DIR);

if (sourceMapFiles.length > 0) {
  console.log("✅ Source maps generated for debugging:");
  sourceMapFiles.forEach((file) => console.log(`   - ${file}`));
} else {
  console.log("ℹ️  No source maps found (hidden source maps may be enabled)");
}

// Check for console.log statements in production files
console.log("\n🧹 Checking for console statements in production build...");
let consoleStatements = 0;

function checkForConsole(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      checkForConsole(filePath);
    } else if (file.endsWith(".js")) {
      const content = fs.readFileSync(filePath, "utf8");
      const matches = content.match(/console\.(log|warn|error|debug|info)/g);
      if (matches) {
        consoleStatements += matches.length;
      }
    }
  }
}

checkForConsole(DIST_DIR);

if (consoleStatements > 0) {
  console.warn(
    `⚠️  Found ${consoleStatements} console statements in production build`
  );
  warnings++;
} else {
  console.log("✅ No console statements found in production build");
}

// Summary
console.log("\n📋 Build Validation Summary:");
console.log(`✅ Passed: ${REQUIRED_FILES.length - errors} checks`);
if (errors > 0) {
  console.log(`❌ Errors: ${errors}`);
}
if (warnings > 0) {
  console.log(`⚠️  Warnings: ${warnings}`);
}

if (errors === 0) {
  console.log(
    "\n🎉 Build validation passed! Extension is ready for deployment."
  );
  process.exit(0);
} else {
  console.log("\n💥 Build validation failed. Please fix the errors above.");
  process.exit(1);
}
