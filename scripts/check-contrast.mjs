#!/usr/bin/env node
/**
 * check-contrast.mjs —— 语义色对比度检查（design.md 2.3.1 对比度承诺、spec 4.2-4）
 * 解析 tokens.css 双主题值，断言语义色与对应背景组合文本对比度 ≥ 4.5:1（WCAG AA）。
 * 深色语义浅底为半透明 rgba —— 与页面底色合成后计算。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const TOKENS_CSS = join(process.cwd(), 'src', 'ui', 'tokens', 'tokens.css');
const AA_THRESHOLD = 4.5;

/** 检查组合：{文本令牌, 背景令牌}（浅色与深色两模式各算一遍） */
const PAIRS = [
  ['--pad2-color-success-text', '--pad2-color-success-bg'],
  ['--pad2-color-warning-text', '--pad2-color-warning-bg'],
  ['--pad2-color-danger-text', '--pad2-color-danger-bg'],
  ['--pad2-color-info', '--pad2-color-info-bg'],
  ['--pad2-color-text-primary', '--pad2-color-bg-page'],
  ['--pad2-color-text-secondary', '--pad2-color-bg-surface'],
];

function parseTokens(css) {
  const themes = { light: {}, dark: {} };
  const rootMatch = css.match(/:root\s*\{([\s\S]*?)\}/);
  const darkMatch = css.match(/\[data-theme="dark"\]\s*\{([\s\S]*?)\}/);
  const fill = (block, target) => {
    for (const m of block.matchAll(/(--pad2-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      target[m[1]] = m[2].trim();
    }
  };
  if (!rootMatch || !darkMatch) {
    console.error('✗ 无法解析 tokens.css（缺少 :root 或 [data-theme="dark"] 段）');
    process.exit(1);
  }
  fill(rootMatch[1], themes.light);
  fill(darkMatch[1], themes.dark);
  return themes;
}

function parseColor(value) {
  const hex = value.match(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1];
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: 1,
    };
  }
  const rgb = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)$/);
  if (rgb) {
    return {
      r: Number(rgb[1]),
      g: Number(rgb[2]),
      b: Number(rgb[3]),
      a: rgb[4] === undefined ? 1 : Number(rgb[4]),
    };
  }
  return null;
}

/** 半透明色与底色合成 */
function composite(fg, bg) {
  if (fg.a >= 1) return fg;
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  };
}

function luminance({ r, g, b }) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

const css = readFileSync(TOKENS_CSS, 'utf8');
const themes = parseTokens(css);
const PAGE_BG = {
  light: parseColor(themes.light['--pad2-color-bg-page']),
  dark: parseColor(themes.dark['--pad2-color-bg-page']),
};

const failures = [];
let checked = 0;

for (const [themeName, tokens] of Object.entries(themes)) {
  for (const [fgToken, bgToken] of PAIRS) {
    const fgRaw = tokens[fgToken];
    const bgRaw = tokens[bgToken];
    const fg = parseColor(fgRaw ?? '');
    const bg = parseColor(bgRaw ?? '');
    if (!fg || !bg) {
      failures.push(`${themeName}: 解析失败 ${fgToken}=${fgRaw} / ${bgToken}=${bgRaw}`);
      continue;
    }
    const bgComposited = composite(bg, PAGE_BG[themeName]);
    const ratio = contrastRatio(fg, bgComposited);
    checked += 1;
    const pass = ratio >= AA_THRESHOLD;
    console.log(
      `${pass ? '✓' : '✗'} [${themeName}] ${fgToken.replace('--pad2-color-', '')} on ${bgToken.replace('--pad2-color-', '')}: ${ratio.toFixed(2)}:1`,
    );
    if (!pass) {
      failures.push(
        `${themeName}: ${fgToken} on ${bgToken} = ${ratio.toFixed(2)}:1 (< ${AA_THRESHOLD}:1)`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error(`\n✗ 对比度检查失败：${failures.length}/${checked} 组合不达标\n`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
} else {
  console.log(`\n✓ 对比度检查通过：${checked} 组合全部 ≥ ${AA_THRESHOLD}:1（WCAG AA）`);
}