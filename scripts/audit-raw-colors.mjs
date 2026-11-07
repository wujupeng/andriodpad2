import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const cssDir = join(root, 'src');

const rawColorRe = /#[0-9a-fA-F]{3,8}\b|rgba?\s*\(/g;
const violations = [];

function scanDir(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      scanDir(full);
    } else if (entry.endsWith('.module.css') || entry.endsWith('.css')) {
      if (full.includes('tokens.css') || full.includes('transitions.css')) continue;
      const content = readFileSync(full, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        rawColorRe.lastIndex = 0;
        if (rawColorRe.test(lines[i])) {
          violations.push({ file: relative(root, full), line: i + 1, content: lines[i].trim() });
        }
      }
    }
  }
}

scanDir(cssDir);
const result = { violationCount: violations.length, violations: violations.slice(0, 20) };
console.log(JSON.stringify(result, null, 2));
process.exit(violations.length === 0 ? 0 : 1);