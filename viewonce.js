import fs from 'node:fs';
import path from 'node:path';

// Baileys 7.0.0-rc14 needs both fixes for outgoing View Once media:
// 1) calculate the encrypted stanza's mediatype from normalized wrapped content;
// 2) add WhatsApp Web's <meta view_once="true"/> stanza node.
// This script is deliberately version-pinned and fails loudly if the expected
// Baileys source layout changes, rather than silently deploying an unpatched bot.
const target = process.env.BAILEYS_PATCH_TARGET || path.join(
  process.cwd(),
  'node_modules', '@whiskeysockets', 'baileys', 'lib', 'Socket', 'messages-send.js'
);

if (!fs.existsSync(target)) {
  throw new Error(`[HUNTER X PATCH] Baileys send module not found: ${target}`);
}

let source = fs.readFileSync(target, 'utf8');
if (source.includes('HUNTER_X_VIEWONCE_PATCH_V1')) {
  console.log('[HUNTER X PATCH] Baileys View Once compatibility patch already applied.');
  process.exit(0);
}

const rawMediaType = 'const mediaType = getMediaType(message);';
const fixedMediaType = 'const mediaType = getMediaType(normalizeMessageContent(message) || message);';
if (source.includes(rawMediaType)) {
  source = source.replace(rawMediaType, fixedMediaType);
} else if (!source.includes(fixedMediaType)) {
  throw new Error('[HUNTER X PATCH] Could not locate Baileys media-type line. Refusing an unpatched View Once deployment.');
}

const extraAttrsAnchor = 'const extraAttrs = {};';
const viewOnceGuard = `const extraAttrs = {};\n\t\t\t// HUNTER_X_VIEWONCE_PATCH_V1: recognize nested WhatsApp View Once wrappers.\n\t\t\tconst hunterXIsViewOnce = (() => {\n\t\t\t\tlet content = message;\n\t\t\t\tfor (let i = 0; i < 5 && content; i++) {\n\t\t\t\t\tif (content.viewOnceMessage || content.viewOnceMessageV2 || content.viewOnceMessageV2Extension) return true;\n\t\t\t\t\tif (content.ephemeralMessage?.message) { content = content.ephemeralMessage.message; continue; }\n\t\t\t\t\tbreak;\n\t\t\t\t}\n\t\t\t\treturn false;\n\t\t\t})();`;
if (!source.includes('HUNTER_X_VIEWONCE_PATCH_V1')) {
  const anchorIndex = source.indexOf(extraAttrsAnchor);
  if (anchorIndex < 0) throw new Error('[HUNTER X PATCH] Could not locate Baileys relayMessage attributes block.');
  source = source.slice(0, anchorIndex) + viewOnceGuard + source.slice(anchorIndex + extraAttrsAnchor.length);
}

const sendAnchor = 'await sendNode(stanza);';
const sendIndex = source.lastIndexOf(sendAnchor);
if (sendIndex < 0) throw new Error('[HUNTER X PATCH] Could not locate final Baileys stanza send point.');
const metaNode = `if (hunterXIsViewOnce) {\n\t\t\t\t(stanza.content || (stanza.content = [])).push({ tag: 'meta', attrs: { view_once: 'true' } });\n\t\t\t}\n\t\t\t`;
source = source.slice(0, sendIndex) + metaNode + source.slice(sendIndex);

fs.writeFileSync(target, source, 'utf8');
console.log('[HUNTER X PATCH] Applied Baileys View Once mediatype + stanza metadata fixes.');
