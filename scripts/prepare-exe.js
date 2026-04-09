// Copies .next/static/ and public/ into .next/standalone/ so that the
// Next.js standalone server.js finds them at the correct __dirname-relative paths.
// This mirrors the layout the Dockerfile creates, but for pkg bundling.
'use strict';

const fs = require('fs');
const path = require('path');

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    entry.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}

const root = path.resolve(__dirname, '..');

copyDir(
  path.join(root, '.next', 'static'),
  path.join(root, '.next', 'standalone', '.next', 'static')
);
copyDir(
  path.join(root, 'public'),
  path.join(root, '.next', 'standalone', 'public')
);

console.log('Assets prepared for pkg bundling.');
