#!/usr/bin/env node
// Build script for the LET IT DIE Offline save editor.
//
// The editor ships as ONE self-contained index.html (works offline and from disk).
// For readability the source lives in src/ as small files; this script stitches them
// back together. src/index.shell.html is the page skeleton; every @@INCLUDE(path)@@
// marker in it (or in an included file) is replaced by the contents of src/<path>,
// with that file's single trailing newline removed. Nothing else is transformed:
// no minifying, no reformatting, so the output is exactly the concatenated source.
//
// Usage:
//   node build.js            write index.html
//   node build.js --check    exit 1 if index.html is not what the src/ files build to
//                            (run before committing so the pushed page matches src/)
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'index.html');
const MARKER = /@@INCLUDE\(([^)]+)\)@@/g;

function expand(text, depth, stack) {
  if (depth > 5) throw new Error('Includes nested too deeply: ' + stack.join(' -> '));
  return text.replace(MARKER, (_, rel) => {
    const file = path.join(SRC, rel);
    if (!file.startsWith(SRC + path.sep)) throw new Error('Include outside src/: ' + rel);
    if (!fs.existsSync(file)) throw new Error('Missing include: src/' + rel + ' (from ' + stack[stack.length - 1] + ')');
    let body = fs.readFileSync(file, 'utf8');
    body = body.replace(/\r\n/g, '\n');   // tolerate files saved with Windows line endings
    if (body.endsWith('\n')) body = body.slice(0, -1);
    return expand(body, depth + 1, stack.concat(rel));
  });
}

const shell = fs.readFileSync(path.join(SRC, 'index.shell.html'), 'utf8').replace(/\r\n/g, '\n');
const html = expand(shell, 0, ['index.shell.html']);

if (process.argv.includes('--check')) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') : '';
  if (current === html) { console.log('index.html is up to date with src/'); process.exit(0); }
  console.error('index.html is OUT OF DATE: run "node build.js" and commit the result');
  process.exit(1);
}
fs.writeFileSync(OUT, html);
console.log('Built index.html (' + html.length.toLocaleString() + ' characters) from src/');
