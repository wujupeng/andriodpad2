import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tokensPath = join(__dirname, '..', 'src', 'ui', 'tokens', 'tokens.css');
const css = readFileSync(tokensPath, 'utf-8');

function extractKeys(block) {
  const keys = new Set();
  const re = /(--pad2-[a-zA-Z0-9-]+)\s*:/g;
  let m;
  while ((m = re.exec(block)) !== null) keys.add(m[1]);
  return keys;
}

function extractBlock(css, selector) {
  const idx = css.indexOf(selector);
  if (idx === -1) return '';
  const braceStart = css.indexOf('{', idx);
  let depth = 0;
  let end = braceStart;
  for (let i = braceStart; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  return css.slice(braceStart + 1, end);
}

const lightBlock = extractBlock(css, ':root');
const darkBlock = extractBlock(css, '[data-theme="dark"]');
const lightKeys = extractKeys(lightBlock);
const darkKeys = extractKeys(darkBlock);

const onlyInLight = [...lightKeys].filter(k => !darkKeys.has(k));
const onlyInDark = [...darkKeys].filter(k => !lightKeys.has(k));

const newTokens = ['--pad2-duration-page-transition', '--pad2-duration-list-stagger'];
const newTokensInBoth = newTokens.every(k => lightKeys.has(k) && darkKeys.has(k));

const result = {
  lightKeyCount: lightKeys.size,
  darkKeyCount: darkKeys.size,
  onlyInDark,
  newTokensInBoth,
  aligned: onlyInDark.length === 0 && newTokensInBoth,
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.aligned ? 0 : 1);