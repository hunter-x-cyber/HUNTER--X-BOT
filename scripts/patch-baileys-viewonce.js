import fs from 'node:fs';
import path from 'node:path';

// Compatibility patch for outgoing View Once messages on Baileys 7.x.
// It is deliberately narrow: only the message-send module is changed.
const packageRoot = path.join(process.cwd(), 'node_modules', '@whiskeysockets', 'baileys');
const explicitTarget = process.env.BAILEYS_PATCH_TARGET;

function walk(dir, depth = 0) {
  if (depth > 6 || !fs.existsSync(dir)) return [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  const found = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(full, depth + 1));
    else if (/^messages-send\.(?:js|cjs|mjs)$/i.test(entry.name)) found.push(full);
  }
  return found;
}

const candidates = explicitTarget
  ? [explicitTarget]
  : [
      path.join(packageRoot, 'lib', 'Socket', 'messages-send.js'),
      path.join(packageRoot, 'dist', 'Socket', 'messages-send.js'),
      ...walk(packageRoot)
    ];

let target = null;
let source = null;
for (const candidate of [...new Set(candidates)]) {
  if (!fs.existsSync(candidate)) continue;
  const text = fs.readFileSync(candidate, 'utf8');
  if ((/getMediaType\s*\(\s*message\s*\)/.test(text) || text.includes('HUNTER_X_VIEWONCE_PATCH_V2')) && /sendNode\s*\(\s*stanza\s*\)/.test(text)) {
    target = candidate;
    source = text;
    break;
  }
}

if (!target || source === null) {
  console.error('[HUNTER X PATCH] Could not locate a compatible Baileys messages-send module. Checked:');
  for (const candidate of [...new Set(candidates)]) console.error(` - ${candidate}`);
  console.error('[HUNTER X PATCH] Confirm @whiskeysockets/baileys is installed and its package layout is supported.');
  process.exit(1);
}

const marker = 'HUNTER_X_VIEWONCE_PATCH_V2';
if (source.includes(marker)) {
  console.log(`[HUNTER X PATCH] Already applied: ${target}`);
  process.exit(0);
}

// The upstream send path calculates the encrypted stanza mediatype from the
// outer wrapper. Normalize first so image/video/audio inside View Once wrappers
// are identified correctly.
const mediaTypePattern = /const\s+mediaType\s*=\s*getMediaType\(\s*message\s*\)\s*;/;
if (!mediaTypePattern.test(source)) {
  console.error(`[HUNTER X PATCH] Found ${target}, but its mediaType expression is different. No file changed.`);
  process.exit(1);
}
source = source.replace(mediaTypePattern,
  `const mediaType = getMediaType(normalizeMessageContent(message) || message); // ${marker}`);

// Identify the relayMessage extraAttrs object. Accept compiled JS and TS-like
// declarations because npm package builds can differ in emitted formatting.
const extraAttrsPattern = /const\s+extraAttrs(?:\s*:\s*[^=\n]+)?\s*=\s*\{\s*\}\s*;/;
if (!extraAttrsPattern.test(source)) {
  console.error(`[HUNTER X PATCH] Found ${target}, but could not identify relayMessage extraAttrs. No file changed.`);
  process.exit(1);
}
const viewOnceGuard = `const extraAttrs = {};\n\t\t// ${marker}: mark outgoing View Once stanza metadata.\n\t\tconst hunterXIsViewOnce = (() => {\n\t\t\tlet content = message;\n\t\t\tfor (let i = 0; i < 5 && content; i++) {\n\t\t\t\tif (content.viewOnceMessage || content.viewOnceMessageV2 || content.viewOnceMessageV2Extension) return true;\n\t\t\t\tif (content.ephemeralMessage?.message) { content = content.ephemeralMessage.message; continue; }\n\t\t\t\tbreak;\n\t\t\t}\n\t\t\treturn false;\n\t\t})();`;
source = source.replace(extraAttrsPattern, viewOnceGuard);

// Patch only the final relay stanza send, not the separate newsletter branch.
const sendPattern = /await\s+sendNode\(\s*stanza\s*\)\s*;/g;
const sendMatches = [...source.matchAll(sendPattern)];
if (sendMatches.length < 2) {
  console.error(`[HUNTER X PATCH] Found ${target}, but expected both newsletter and regular stanza send points; found ${sendMatches.length}. No file changed.`);
  process.exit(1);
}
const last = sendMatches[sendMatches.length - 1];
const insertion = `if (hunterXIsViewOnce) {\n\t\t\t\t(stanza.content || (stanza.content = [])).push({ tag: 'meta', attrs: { view_once: 'true' } });\n\t\t\t}\n\t\t\t`;
const at = last.index;
source = source.slice(0, at) + insertion + source.slice(at);

// Sanity-check all three edits before writing anything.
if (!source.includes(marker) || !source.includes("view_once: 'true'") ||
    !source.includes('getMediaType(normalizeMessageContent(message) || message)')) {
  console.error('[HUNTER X PATCH] Internal validation failed. No file changed.');
  process.exit(1);
}

fs.writeFileSync(target, source, 'utf8');
console.log(`[HUNTER X PATCH] Applied outgoing View Once compatibility fix to ${target}`);
