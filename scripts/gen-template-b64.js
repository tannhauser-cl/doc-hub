#!/usr/bin/env node
/**
 * gen-template-b64.js
 *
 * Converts a plain-text NDA/template file to a base64-encoded string
 * suitable for embedding in Apps Script (e.g. as a Blob for DriveApp).
 *
 * Usage:
 *   node scripts/gen-template-b64.js path/to/template.txt
 *
 * Output: prints the base64 string to stdout.
 */

const fs = require('fs');
const path = require('path');

const [, , templatePath] = process.argv;

if (!templatePath) {
  console.error('Usage: node scripts/gen-template-b64.js <path-to-template.txt>');
  process.exit(1);
}

const resolved = path.resolve(templatePath);

if (!fs.existsSync(resolved)) {
  console.error(`File not found: ${resolved}`);
  process.exit(1);
}

const content = fs.readFileSync(resolved, 'utf8');
const b64 = Buffer.from(content, 'utf8').toString('base64');
console.log(b64);
