#!/usr/bin/env node
/**
 * check-design-tokens.mjs —— 令牌合规检查（design.md 1.1.3-A、CON-07/CON-08）
 * 扫描 src/ 全部源码：硬编码色值（hex / rgb()/rgba() 裸值）与 emoji 字符。
 * 白名单：src/ui/tokens/tokens.css（唯一允许裸色值文件）。
 * 发现违规 → 输出文件+行号清单，退出码 1。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC_ROOT = join(process.cwd(), 'src');
const WHITELIST = new Set([
  join(SRC_ROOT, 'ui', 'tokens', 'tokens.css').replaceAll('\\', '/'),
]);

const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/g;
const RGB_FUNC = /\brgba?\(\s*\d/g;
/** Unicode emoji 区段（表情/符号；不含 CJK、ASCII 与纯箭头符号区 U+2190-21FF） */
const EMOJI =
  /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F0FF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/gu;

const violations = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full);
    } else if (/\.(ts|tsx|css|html)$/.test(entry)) {
      scanFile(full);
    }
  }
}

function scanFile(file) {
  const norm = file.replaceAll('\\', '/');
  const content = readFileSync(file, 'utf8');
  const lines = content.split('\n');
  const whitelisted = WHITELIST.has(norm);

  lines.forEach((line, i) => {
    const lineNo = i + 1;
    const rel = relative(process.cwd(), file).replaceAll('\\', '/');
    if (!whitelisted) {
      for (const m of line.matchAll(HEX_COLOR)) {
        violations.push({
          file: rel,
          line: lineNo,
          kind: 'hex-color',
          detail: m[0],
        });
      }
      if (RGB_FUNC.test(line)) {
        violations.push({ file: rel, line: lineNo, kind: 'rgb-func', detail: 'rgb()/rgba() literal' });
      }
    }
    const emojiMatch = line.match(EMOJI);
    if (emojiMatch) {
      violations.push({
        file: rel,
        line: lineNo,
        kind: 'emoji',
        detail: emojiMatch.join(' '),
      });
    }
  });
}

walk(SRC_ROOT);

if (violations.length > 0) {
  console.error(`✗ 令牌合规检查失败：${violations.length} 处违规\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.kind}]  ${v.detail}`);
  }
  process.exit(1);
} else {
  console.log('✓ 令牌合规检查通过：无硬编码色值、无 emoji 图标');
}