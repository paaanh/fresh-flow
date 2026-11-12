// Self-hosted TinyMCE: copy the editor from node_modules to /public/tinymce (served as static files).
// Runs after `npm install` / `npm ci` (also inside Docker), so no API key or CDN is needed.
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', 'tinymce');
const dest = path.join(__dirname, '..', 'public', 'tinymce');
if (!fs.existsSync(src)) {
  console.warn('[copy-tinymce] tinymce is not installed, skipping');
  process.exit(0);
}
fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, {
  recursive: true,
  filter: file => !/[\/](node_modules|.*\.d\.ts|README\.md|CHANGELOG\.md|composer\.json|bower\.json)$/.test(file),
});
console.log('[copy-tinymce] copied to public/tinymce');
