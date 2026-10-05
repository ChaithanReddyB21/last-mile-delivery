'use strict';
// Publish only the browser app and sample scenarios; Python and tests stay in Git.
const fs = require('node:fs'), path = require('node:path');
const output = path.join(__dirname, 'dist');
const files = ['index.html', 'dashboard.html', 'app.js', 'engine.js', 'style.css', 'landing.css', 'favicon.svg', 'README.md', 'data/sample-scenario.json', 'data/sample-reference.json'];
for (const file of files) {
  const destination = path.join(output, file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(__dirname, file), destination);
}
console.log(`Built ${files.length} static files in dist/`);
