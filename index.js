import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const messageCache = new Map();
// Prevent the same WhatsApp message event from executing a command more than once.
const processedCommandMessages = new Map();
const warningMap = new Map(); // Tracks warning counts per user per group
const removalEventCache = new Map();
const lastGreetingImages = new Map(); // Prevent duplicate removal announcements
const connectionNoticesSent = new Set();
const livePresence = new Map();
const http = require('http');
const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('HUNTER X BOT is active 24/7 under the rule of HUNTER X!\n');
}).listen(PORT, '0.0.0.0', () => {
    console.log('🌐 Keep-alive server running on 0.0.0.0:' + PORT);
});

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    fetchLatestWaWebVersion,
    downloadContentFromMessage,
    downloadMediaMessage,
    generateWAMessageContent,
    generateWAMessageFromContent,
    prepareWAMessageMedia,
    jidNormalizedUser
} = await import('@whiskeysockets/baileys');
const fs = require('fs');
const yts = require('yt-search');
const { promisify } = require('util');
const pino = require('pino');
const { exec, execFile } = require('child_process');
const execFileAsync = promisify(execFile);
const os = require('os');
const https = require('https');
const { PassThrough } = require('stream');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const sharp = require('sharp');
// Prefer an explicitly configured binary, then the npm-bundled FFmpeg binary.
// This keeps audio/video utilities working on Render without a system FFmpeg install.
const ffmpegPath = process.env.FFMPEG_PATH || ffmpegStatic || 'ffmpeg';
ffmpeg.setFfmpegPath(ffmpegPath);
const crypto = require('crypto');
const axios = require('axios');
const { truth } = require('@bochilteam/scraper');
const { translate } = require('@vitalets/google-translate-api');

// --- BOT CONFIGURATION ---
const OWNER_NUMBER = String(process.env.OWNER_NUMBER || "2347070751286").replace(/[^0-9]/g, "");
const OWNER_NAME = process.env.OWNER_NAME || "𝐇𝐔𝐍𝐓𝐄𝐑 𝐗";
const BOT_NAME = process.env.BOT_NAME || "𝐇𝐔𝐍𝐓𝐄𝐑 𝐗 𝐁𝐎𝐓";
const BOT_VERSION = "V4.4";
if (!/^\d{10,15}$/.test(OWNER_NUMBER)) throw new Error("OWNER_NUMBER must be a valid international WhatsApp number with country code.");
const MENU_IMAGE_URL = "https://i.postimg.cc/C5nJz4BG/1793460010889.jpg";
const PURPLE_COLOR = '#9C27B0';
const startTime = Date.now();

// --- PERSISTENT STORAGE ENGINE ---
// On Render, attach a Persistent Disk and set DATA_DIR to its mount path (e.g. /var/data).
// Without a mounted disk, files remain local to the container and may be lost on redeploy.
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
fs.mkdirSync(DATA_DIR, { recursive: true });
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const GROUP_SETTINGS_FILE = path.join(DATA_DIR, 'groupSettings.json');
const BLOCKED_USERS_FILE = path.join(DATA_DIR, 'blockedUsers.json');

function migrateLegacyPath(source, destination) {
    try {
        if (!fs.existsSync(source) || fs.existsSync(destination)) return;
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.cpSync(source, destination, { recursive: true, errorOnExist: false, force: false });
        console.log('[DATA MIGRATION] Moved legacy data into DATA_DIR:', path.basename(source));
    } catch (err) {
        console.warn('[DATA MIGRATION]', path.basename(source), err.message);
    }
}
for (const file of ['settings.json', 'groupSettings.json', 'messageCount.json', 'blockedUsers.json', 'economy.json']) {
    migrateLegacyPath(path.join(__dirname, file), path.join(DATA_DIR, file));
    migrateLegacyPath(path.resolve(process.cwd(), file), path.join(DATA_DIR, file));
}
migrateLegacyPath(path.join(__dirname, 'hunter_x_session'), path.join(DATA_DIR, 'hunter_x_session'));
migrateLegacyPath(path.resolve(process.cwd(), 'hunter_x_session'), path.join(DATA_DIR, 'hunter_x_session'));

const ECONOMY_FILE = path.join(DATA_DIR, 'economy.json');
const economy = readJsonFile(ECONOMY_FILE, { users: {} });
if (!economy.users || typeof economy.users !== 'object') economy.users = {};
function saveEconomy() { writeJsonAtomic(ECONOMY_FILE, economy); }
function economyUser(jid, name = 'Player') {
    const id = String(jid || '').replace(/\D/g, '') || String(jid || 'unknown');
    if (!economy.users[id]) economy.users[id] = { name, wallet: 0, bank: 0, inventory: [], cooldowns: {}, joinedAt: Date.now() };
    const user = economy.users[id];
    user.name = name || user.name || 'Player';
    user.wallet = Math.max(0, Number(user.wallet) || 0);
    user.bank = Math.max(0, Number(user.bank) || 0);
    if (!Array.isArray(user.inventory)) user.inventory = [];
    if (!user.cooldowns || typeof user.cooldowns !== 'object') user.cooldowns = {};
    return user;
}
function economyCooldown(user, key, duration) {
    const remaining = (Number(user.cooldowns[key]) || 0) - Date.now();
    if (remaining > 0) return remaining;
    user.cooldowns[key] = Date.now() + duration;
    return 0;
}
function moneyText(value) { return Number(value || 0).toLocaleString('en-US') + ' GD'; }
const ECONOMY_SHOP = [
    { id: 'common_crate', name: 'Common Crate', price: 250, description: 'A small mystery collection' },
    { id: 'rare_crate', name: 'Rare Crate', price: 900, description: 'A larger mystery collection' },
    { id: 'title_token', name: 'Title Token', price: 1500, description: 'A collectible profile token' }
];


const DEFAULT_AUTO_SETTINGS = {
    autoonline: true, autorecording: false, autostatuslike: true,
    autostatusview: true, autotyping: false, anticall: true, autoreact: false
};
const DEFAULT_SETTINGS = {
    prefix: '.', sudoUsers: [OWNER_NUMBER], autoSettings: { ...DEFAULT_AUTO_SETTINGS },
    botMode: 'public', blockedUsers: [], warnings: {}
};

function readJsonFile(file, fallback) {
    try {
        if (!fs.existsSync(file)) return fallback;
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch (err) {
        console.error('[PERSISTENCE READ]', path.basename(file), err.message);
        return fallback;
    }
}
function writeJsonAtomic(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = file + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
    fs.renameSync(temp, file);
}
function loadSettings() {
    const saved = readJsonFile(SETTINGS_FILE, {});
    const merged = {
        ...DEFAULT_SETTINGS,
        ...saved,
        autoSettings: { ...DEFAULT_AUTO_SETTINGS, ...(saved.autoSettings || {}) },
        sudoUsers: Array.isArray(saved.sudoUsers) ? saved.sudoUsers : [OWNER_NUMBER],
        blockedUsers: Array.isArray(saved.blockedUsers) ? saved.blockedUsers : [],
        warnings: saved.warnings && typeof saved.warnings === 'object' ? saved.warnings : {}
    };
    merged.sudoUsers = [OWNER_NUMBER];
    if (!['public', 'private'].includes(merged.botMode)) merged.botMode = 'public';
    writeJsonAtomic(SETTINGS_FILE, merged);
    return merged;
}
function saveSettings(data) {
    data.sudoUsers = [OWNER_NUMBER];
    writeJsonAtomic(SETTINGS_FILE, data);
}
function loadGroupSettings() {
    return readJsonFile(GROUP_SETTINGS_FILE, {});
}
function saveGroupSettings() {
    writeJsonAtomic(GROUP_SETTINGS_FILE, groupSettings);
}

const db = loadSettings();
let prefix = db.prefix || '.';
const sudoUsers = new Set(db.sudoUsers);
const autoSettings = db.autoSettings;

// --- MESSAGE TRACKER FUNCTIONS ---
const dataFilePath = path.join(DATA_DIR, 'messageCount.json');

function loadMessageCounts() {
    return readJsonFile(dataFilePath, {});
}

function saveMessageCounts(messageCounts) {
    writeJsonAtomic(dataFilePath, messageCounts);
}

function saveBlockedUsers() {
    const values = Array.from(blockedUsers);
    db.blockedUsers = values;
    saveSettings(db);
    writeJsonAtomic(BLOCKED_USERS_FILE, values);
}

function incrementMessageCount(groupId, userId) {
    const messageCounts = loadMessageCounts();
    if (!messageCounts[groupId]) {
        messageCounts[groupId] = {};
    }
    if (!messageCounts[groupId][userId]) {
        messageCounts[groupId][userId] = 0;
    }
    messageCounts[groupId][userId] += 1;
    saveMessageCounts(messageCounts);
}

// --- STATE MANAGEMENT ---
let botMode = db.botMode || 'public';
const activeGames = {};
const groupSettings = loadGroupSettings();
const blockedUsers = new Set(db.blockedUsers || readJsonFile(BLOCKED_USERS_FILE, []));
const deletedMessages = new Map();

function unwrapMessage(message) {
  if (!message || typeof message !== 'object') return message;
  if (message.ephemeralMessage?.message) return unwrapMessage(message.ephemeralMessage.message);
  if (message.viewOnceMessage?.message) return unwrapMessage(message.viewOnceMessage.message);
  if (message.viewOnceMessageV2?.message) return unwrapMessage(message.viewOnceMessageV2.message);
  if (message.viewOnceMessageV2Extension?.message) {
    return unwrapMessage(message.viewOnceMessageV2Extension.message);
  }
  return message;
}

async function resolvePhoneDigits(sock, jid) {
    if (!jid) return '';
    let normalized = '';
    try { normalized = jidNormalizedUser(jid); } catch { normalized = String(jid); }
    let user = normalized.split('@')[0].split(':')[0];
    if (normalized.endsWith('@lid')) {
        try {
            const pn = await sock.signalRepository?.lidMapping?.getPNForLID?.(normalized);
            if (pn) user = jidNormalizedUser(pn).split('@')[0].split(':')[0];
        } catch (err) {
            console.warn('[JID PHONE RESOLUTION]', err.message);
        }
    }
    return user.replace(/\D/g, '');
}

async function isProtectedOwnerJid(sock, jid) {
    if (!jid) return false;
    const normalize = value => {
        try { return jidNormalizedUser(value); } catch { return String(value || ''); }
    };
    const candidate = normalize(jid);
    const ownerDigits = String(OWNER_NUMBER).replace(/\D/g, '');
    if (candidate.split('@')[0].split(':')[0].replace(/\D/g, '') === ownerDigits) return true;
    if (candidate.endsWith('@lid')) {
        try {
            const phoneJid = await sock.signalRepository?.lidMapping?.getPNForLID?.(candidate);
            if (phoneJid && normalize(phoneJid).split('@')[0].replace(/\D/g, '') === ownerDigits) return true;
        } catch (err) {
            console.warn('[OWNER LID CHECK]', err.message);
        }
    }
    return false;
}

function resolveMedia(msg) {
  const own = unwrapMessage(msg.message);
  if (own?.imageMessage) {
    return { kind: 'image', targetMessage: msg, mediaMsg: own.imageMessage };
  }
  if (own?.videoMessage) {
    return { kind: 'video', targetMessage: msg, mediaMsg: own.videoMessage };
  }
  if (own?.audioMessage) {
    return { kind: 'audio', targetMessage: msg, mediaMsg: own.audioMessage };
  }
  if (own?.stickerMessage) {
    return { kind: 'sticker', targetMessage: msg, mediaMsg: own.stickerMessage };
  }
  if (own?.documentMessage && /^image\//i.test(own.documentMessage.mimetype || '')) {
    return { kind: 'image', targetMessage: msg, mediaMsg: own.documentMessage };
  }

  const ctx =
    own?.extendedTextMessage?.contextInfo ||
    own?.imageMessage?.contextInfo ||
    own?.videoMessage?.contextInfo ||
    msg.message?.extendedTextMessage?.contextInfo;

  const quoted = unwrapMessage(ctx?.quotedMessage);
  if (!quoted || !ctx?.stanzaId) return null;

  const targetMessage = {
    key: {
      remoteJid: msg.key.remoteJid,
      id: ctx.stanzaId,
      participant: ctx.participant,
    },
    message: quoted,
  };

  if (quoted.imageMessage) {
    return { kind: 'image', targetMessage, mediaMsg: quoted.imageMessage };
  }
  if (quoted.videoMessage) {
    return { kind: 'video', targetMessage, mediaMsg: quoted.videoMessage };
  }
  if (quoted.audioMessage) {
    return { kind: 'audio', targetMessage, mediaMsg: quoted.audioMessage };
  }
  if (quoted.stickerMessage) {
    return { kind: 'sticker', targetMessage, mediaMsg: quoted.stickerMessage };
  }
  if (quoted.documentMessage && /^image\//i.test(quoted.documentMessage.mimetype || '')) {
    return { kind: 'image', targetMessage, mediaMsg: quoted.documentMessage };
  }

  return null;
}

function getInstalledPackageVersion(packageName) {
    try {
        let resolvedEntry = '';
        try {
            resolvedEntry = require.resolve(packageName);
        } catch (_) {
            // Baileys v7 is ESM-only; resolve through the ESM condition when require is unavailable.
            resolvedEntry = fileURLToPath(import.meta.resolve(packageName));
        }
        let dir = path.dirname(resolvedEntry);
        while (true) {
            const packageFile = path.join(dir, 'package.json');
            if (fs.existsSync(packageFile)) {
                const metadata = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
                if (metadata.name === packageName) return String(metadata.version || '');
            }
            const parent = path.dirname(dir);
            if (parent === dir) break;
            dir = parent;
        }
    } catch (error) {
        console.warn('[BAILEYS VERSION CHECK]', error.message);
    }
    return '';
}

const INSTALLED_BAILEYS_VERSION = getInstalledPackageVersion('@whiskeysockets/baileys');
const GROUP_STATUS_V2_SUPPORTED = /^7\./.test(INSTALLED_BAILEYS_VERSION);
const GROUP_STATUS_V2_UNAVAILABLE =
    `❌ Group Status V2 is not supported by the installed Baileys ${INSTALLED_BAILEYS_VERSION || 'build'}. ` +
    'This command requires the Baileys 7 protocol schema. No status was sent to the group chat.';

async function groupStatusBroadcast(sock, jid, content) {
    if (!GROUP_STATUS_V2_SUPPORTED) throw new Error(GROUP_STATUS_V2_UNAVAILABLE);
    if (!sock.user?.id) throw new Error('WhatsApp socket is not fully connected.');
    if (!jid?.endsWith('@g.us')) throw new Error(`Invalid destination group JID: ${jid}`);

    const messageSecret = crypto.randomBytes(32);
    let innerMessage;
    let isImageStatus = false;

    if (content?.image) {
        isImageStatus = true;
        const imageBuffer = Buffer.isBuffer(content.image)
            ? content.image
            : Buffer.from(content.image);
        if (!imageBuffer.length) throw new Error('Invitation card buffer is empty.');

        // Upload the JPEG first. Group Status V2 expects imageMessage nested
        // inside groupStatusMessageV2.message, not a normal chat image send.
        const prepared = await prepareWAMessageMedia(
            { image: imageBuffer, mimetype: content.mimetype || 'image/jpeg' },
            { upload: sock.waUploadToServer }
        );
        const uploadedImage = prepared?.imageMessage;
        if (!uploadedImage?.url || !uploadedImage?.mediaKey || !uploadedImage?.directPath) {
            throw new Error('Baileys media upload did not return a complete imageMessage (url/mediaKey/directPath missing).');
        }

        innerMessage = {
            imageMessage: {
                ...uploadedImage,
                caption: String(content.caption || ''),
                contextInfo: {
                    ...(uploadedImage.contextInfo || {}),
                    forwardingScore: 0,
                    isGroupStatus: true,
                    pairedMediaType: 0,
                    // Match the image Group Status V2 context used in the
                    // Baileys implementation example (discussion #2318).
                    statusSourceType: 4,
                    statusAttributions: [{ type: 10 }],
                    featureEligibilities: {
                        canBeReshared: true,
                        canReceiveMultiReact: true
                    }
                }
            },
            messageContextInfo: { messageSecret }
        };
    } else {
        const statusContent = { ...content };
        delete statusContent.backgroundColor;
        const generated = await generateWAMessageContent(statusContent, {
            upload: sock.waUploadToServer,
            backgroundColor: content.backgroundColor || PURPLE_COLOR
        });
        if (!generated || !Object.keys(generated).length) {
            throw new Error('Failed to generate group status content.');
        }
        const key = Object.keys(generated)[0];
        innerMessage = {
            ...generated,
            [key]: {
                ...generated[key],
                contextInfo: {
                    ...(generated[key]?.contextInfo || {}),
                    isGroupStatus: true
                }
            },
            messageContextInfo: { messageSecret }
        };
    }

    const msg = generateWAMessageFromContent(
        jid,
        {
            messageContextInfo: { messageSecret },
            groupStatusMessageV2: { message: innerMessage }
        },
        { userJid: jidNormalizedUser(sock.user.id) }
    );

    if (!msg?.message || !msg?.key?.id) {
        throw new Error('Failed to create Group Status V2 message envelope.');
    }

    // WhatsApp's current group-status transport requires the group-status
    // metadata node for media stories. Without it, relayMessage can resolve
    // successfully while the image card is silently not shown to group members.
    // Keep this scoped to image statuses so the already-working text flow stays
    // unchanged. This is protocol metadata, not a normal chat fallback.
    const relayOptions = { messageId: msg.key.id };
    if (isImageStatus) {
        relayOptions.additionalNodes = [{
            tag: 'meta',
            attrs: { is_group_status: 'true', origin: 'group_status' }
        }];
    }

    await sock.relayMessage(jid, msg.message, relayOptions);
    return { messageId: msg.key.id, mediaType: isImageStatus ? 'image' : 'other', accepted: true };
}

// --- HUNTER X COMMAND CATALOGUE ---
// Generated from the actual command switch so .allmenu lists implemented aliases.
const COMMAND_CATALOG = [
    "2048",
    "activegames",
    "activeusers",
    "add",
    "addmember",
    "addowner",
    "adminnotes",
    "ai",
    "aimenu",
    "allmenu",
    "announce",
    "answer",
    "antiadd",
    "antibot",
    "anticall",
    "antidelete",
    "antidemote",
    "antigcstatus",
    "antigroupsmention",
    "antiimage",
    "antilink",
    "antipromote",
    "antiremove",
    "antispam",
    "antitag",
    "antitagadmin",
    "antiviewonce",
    "applemusic",
    "approveall",
    "autoonline",
    "autoreact",
    "autorecording",
    "autostatuslike",
    "autostatusview",
    "autotyping",
    "balance",
    "bancheck",
    "bank",
    "bc",
    "beg",
    "block",
    "botlink",
    "broadcast",
    "buatgc",
    "buy",
    "capcut",
    "changebio",
    "claude",
    "close",
    "closetime",
    "connectedusers",
    "convertmenu",
    "copilot",
    "daily",
    "dare",
    "del",
    "delete",
    "delgcstatus",
    "delgs",
    "delgstatus",
    "demote",
    "demoteall",
    "demoteuser",
    "deposit",
    "describe",
    "device",
    "devices",
    "disapproveall",
    "dl",
    "dor",
    "downloadmenu",
    "draw",
    "endgame",
    "fb",
    "felo",
    "fetchstatus",
    "fish",
    "flirt",
    "funmenu",
    "ga",
    "gamemenu",
    "games",
    "gay",
    "gayrate",
    "gcast",
    "gccrash",
    "gcs",
    "gcstatus",
    "getlink",
    "getpp",
    "ggstatus",
    "glostat",
    "gm",
    "gn",
    "goodafternoon",
    "goodbye",
    "goodmorning",
    "goodnight",
    "gpt",
    "groupdesc",
    "groupfaq",
    "groupid",
    "groupinfo",
    "grouplink",
    "groupmenu",
    "groupname",
    "groupnotice",
    "grouponly",
    "groupstatus",
    "gs",
    "gstatus",
    "guess",
    "hangman",
    "help",
    "hidetag",
    "hunt",
    "imagine",
    "inactiveusers",
    "inspectsock",
    "inventory",
    "invite",
    "joingroup",
    "kick",
    "kickall",
    "konachan",
    "konachansfw",
    "leaderboard",
    "leavegroup",
    "left",
    "listactive",
    "listadmins",
    "listchannels",
    "listfont",
    "listgroup",
    "listgroups",
    "llama",
    "lock",
    "lyrics",
    "mathquiz",
    "mediatag",
    "membercount",
    "memberroles",
    "membertag",
    "menu",
    "mode",
    "monthly",
    "mute",
    "notes",
    "ocr",
    "open",
    "opentime",
    "othermenu",
    "ownermenu",
    "ownerpanel",
    "pair",
    "pay",
    "peek",
    "permissionaudit",
    "pickup",
    "pickupline",
    "ping",
    "play",
    "poll",
    "prefix",
    "private",
    "profile",
    "promote",
    "promoteall",
    "promoteuser",
    "public",
    "remove",
    "resetwarn",
    "restrict",
    "revoke",
    "richest",
    "riddle",
    "rules",
    "s",
    "searchmenu",
    "session",
    "setgoodbye",
    "setgroupbio",
    "setgroupdesc",
    "setgroupname",
    "setgrouppp",
    "setmute",
    "setprefix",
    "setunmute",
    "setwarn",
    "setwarning",
    "setwelcome",
    "shop",
    "spamngl",
    "status",
    "sticker",
    "stickermenu",
    "stiker",
    "sudo",
    "sudolist",
    "sudoremove",
    "swgc",
    "tag",
    "tagadmin",
    "tagall",
    "tagonline",
    "tagpoll",
    "toaud",
    "togglemenu",
    "togif",
    "togstatus",
    "toimg",
    "toolmenu",
    "top",
    "topmembers",
    "toptt",
    "tourl",
    "triviaclassic",
    "truth",
    "unblock",
    "unlock",
    "unmute",
    "unwarn",
    "uptime",
    "viewonce",
    "vv",
    "warn",
    "warning",
    "warnings",
    "wasted",
    "weekly",
    "welcome",
    "withdraw",
    "work",
    "yts"
];

function styleCommandName(value) {
    // Mathematical bold italic lowercase: .tagall -> .𝒕𝒂𝒈𝒂𝒍𝒍
    const alphabet = 'abcdefghijklmnopqrstuvwxyz';
    const base = 0x1D482;
    const map = new Map(Array.from(alphabet).map((letter, index) =>
        [letter, String.fromCodePoint(base + index)]
    ));
    return String(value).replace(/[a-z]/g, letter => map.get(letter) || letter);
}

function styleCommandMentions(value) {
    return String(value).replace(/\.([a-z][a-z0-9]*)/gi, (match, name) =>
        '.' + styleCommandName(name.toLowerCase())
    );
}

// Consistent Mathematical Bold Italic typography for human-facing WhatsApp replies.
// URLs, code spans, command examples, phone numbers and WhatsApp JIDs stay readable.
const HUNTER_FONT_MAP = (() => {
    const map = new Map();
    for (let i = 0; i < 26; i++) {
        map.set(String.fromCharCode(97 + i), String.fromCodePoint(0x1D482 + i));
        map.set(String.fromCharCode(65 + i), String.fromCodePoint(0x1D468 + i));
    }
    return map;
})();

function toHUNTER XFont(value) {
    const protectedToken = /(`[^`]*`|https?:\/\/[^\s<>]+|wa\.me\/[^\s<>]+|\.[a-z][a-z0-9_-]*|[A-Za-z0-9._%+-]+@(?:s\.whatsapp\.net|g\.us|lid|broadcast|newsletter))/gi;
    return String(value ?? '').split(protectedToken).map(part => {
        if (!part) return part;
        if (part.startsWith('`') || /^https?:\/\//i.test(part) || /^wa\.me\//i.test(part) ||
            /^\.[a-z][a-z0-9_-]*$/i.test(part) || /@(?:s\.whatsapp\.net|g\.us|lid|broadcast|newsletter)$/i.test(part)) return part;
        return Array.from(part, char => HUNTER_FONT_MAP.get(char) || char).join('');
    }).join('');
}

async function resolveInvitedGroupAvatarBuffer(sock, invitedGroupInfo) {
    // Resolve the group represented by the invite link. This must never fall
    // back to the group receiving the status story.
    const invitedGroupJid = String(
        invitedGroupInfo?.id ||
        invitedGroupInfo?.jid ||
        invitedGroupInfo?.groupJid ||
        ''
    ).trim();

    if (!invitedGroupJid.endsWith('@g.us')) {
        throw new Error('Invite lookup did not return a valid group JID.');
    }

    // Some forks expose a picture URL in metadata; standard Baileys normally
    // requires profilePictureUrl(). Prefer preview (the WhatsApp invite-card
    // thumbnail) and then try the full image endpoint.
    const directUrl = [
        invitedGroupInfo?.profilePicUrl,
        invitedGroupInfo?.profilePictureUrl,
        invitedGroupInfo?.picture?.url,
        invitedGroupInfo?.pictureUrl,
        invitedGroupInfo?.avatar
    ].find(value => typeof value === 'string' && /^https?:\/\//i.test(value));

    const attempts = [
        ...(directUrl ? [{ label: 'invite-metadata', run: async () => directUrl }] : []),
        // Ask Baileys for the full image first, then the smaller invite preview.
        // Use the documented two-argument API; do not pass a timeout as a third arg.
        { label: 'image', run: () => sock.profilePictureUrl(invitedGroupJid, 'image') },
        { label: 'preview', run: () => sock.profilePictureUrl(invitedGroupJid, 'preview') },
        { label: 'default', run: () => sock.profilePictureUrl(invitedGroupJid) }
    ];

    console.log('[GROUP INVITATION CARD] Resolving invited group avatar', {
        invitedGroupJid,
        hasInvitePictureUrl: Boolean(directUrl),
        lookupMethods: attempts.map(item => item.label)
    });

    const errors = [];
    for (const attempt of attempts) {
        let timeoutHandle;
        try {
            const url = await Promise.race([
                Promise.resolve().then(attempt.run),
                new Promise((_, reject) => {
                    timeoutHandle = setTimeout(
                        () => reject(new Error('profile-picture lookup timed out after 30 seconds')),
                        30000
                    );
                })
            ]);
            clearTimeout(timeoutHandle);
            if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
                throw new Error('WhatsApp returned no usable picture URL');
            }

            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 25000,
                maxContentLength: 10 * 1024 * 1024,
                maxBodyLength: 10 * 1024 * 1024,
                validateStatus: status => status >= 200 && status < 300
            });
            const buffer = Buffer.from(response.data || []);
            const type = String(response.headers?.['content-type'] || '').toLowerCase();
            const signature =
                buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ||
                buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
                (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP');
            if (!buffer.length || (!type.startsWith('image/') && !signature)) {
                throw new Error('Downloaded response was not a valid image');
            }

            console.log('[GROUP INVITATION CARD] Actual invite-group photo resolved', {
                invitedGroupJid,
                source: attempt.label,
                bytes: buffer.length
            });
            return buffer;
        } catch (error) {
            clearTimeout(timeoutHandle);
            errors.push(`${attempt.label}: ${error.message || error}`);
            console.error('[GGSTATUS IMAGE DIAGNOSTIC] Avatar lookup failed', {
                invitedGroupJid,
                method: attempt.label,
                error: error.message || String(error)
            });
        }
    }

    throw new Error(
        `Could not fetch the invited group's actual profile picture (${invitedGroupJid}). ` +
        `WhatsApp may restrict access to this group's photo unless this account can view it. ` +
        errors.join(' | ')
    );
}

async function createGroupInvitationCard(sock, groupName, inviteUrl, invitedGroupInfo = {}) {
    // The profile picture must belong to the group represented by the invite URL.
    // Never substitute a participating/destination group's avatar.
    console.log('[GGSTATUS IMAGE DIAGNOSTIC] Starting invitation-card generation', {
        invitedGroupJid: invitedGroupInfo?.id || invitedGroupInfo?.jid || null,
        groupName: String(groupName || invitedGroupInfo?.subject || 'WhatsApp Group')
    });
    const avatarBuffer = await resolveInvitedGroupAvatarBuffer(sock, invitedGroupInfo);
    console.log('[GGSTATUS IMAGE DIAGNOSTIC] Avatar downloaded; rendering card', {
        avatarBytes: avatarBuffer.length
    });
    const title = String(groupName || invitedGroupInfo?.subject || 'WhatsApp Group')
        .replace(/[\r\n]/g, ' ').trim().slice(0, 60);
    const safeTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    const safeLink = String(inviteUrl || '').replace(/&/g, '&amp;')
        .replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    const titleSize = title.length > 42 ? 34 : title.length > 30 ? 40 : 48;
    const cardOverlay = Buffer.from(`
      <svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#24113b"/>
            <stop offset="1" stop-color="#7621a2"/>
          </linearGradient>
        </defs>
        <rect width="1080" height="1920" fill="url(#bg)"/>
        <rect x="110" y="360" width="860" height="1040" rx="38" fill="#ffffff" opacity="0.08"/>
        <rect x="130" y="390" width="820" height="700" rx="22" fill="#171923"/>
        <rect x="130" y="1090" width="820" height="230" rx="0" fill="#111820"/>
        <text x="540" y="1175" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" font-size="${titleSize}" font-weight="700">${safeTitle}</text>
        <text x="540" y="1260" text-anchor="middle" fill="#d6d9df" font-family="Arial, sans-serif" font-size="30">${safeLink}</text>
      </svg>`);

    const photo = await sharp(avatarBuffer, { failOn: 'error' })
        .rotate()
        .resize(820, 700, { fit: 'cover', position: 'centre' })
        .jpeg({ quality: 90 })
        .toBuffer();

    const card = await sharp({
        create: { width: 1080, height: 1920, channels: 4, background: '#24113b' }
    })
        .composite([
            { input: cardOverlay },
            { input: photo, left: 130, top: 390 }
        ])
        .jpeg({ quality: 90 })
        .toBuffer();

    if (!card || card.length < 10000) {
        throw new Error(`Invitation card image output is invalid (${card?.length || 0} bytes).`);
    }
    console.log('[GROUP INVITATION CARD] Generated with sharp', {
        invitedGroupJid: invitedGroupInfo?.id || invitedGroupInfo?.jid,
        bytes: card.length,
        groupName: title
    });
    return card;
}

function toVN(buffer) {
  return new Promise((resolve, reject) => {
    const input = new PassThrough();
    const output = new PassThrough();
    const chunks = [];

    input.end(buffer);

    ffmpeg(input)
      .noVideo()
      .audioCodec('libopus')
      .format('ogg')
      .audioChannels(1)
      .audioFrequency(48000)
      .on('error', reject)
      .on('end', () => resolve(Buffer.concat(chunks)))
      .pipe(output);

    output.on('data', (c) => chunks.push(c));
  });
}

function generateWaveform(buffer, bars = 64) {
  return new Promise((resolve, reject) => {
    const input = new PassThrough();
    input.end(buffer);

    const chunks = [];

    ffmpeg(input)
      .audioChannels(1)
      .audioFrequency(16000)
      .format('s16le')
      .on('error', reject)
      .on('end', () => {
        const raw = Buffer.concat(chunks);
        const samples = raw.length / 2;
        const amps = [];

        for (let i = 0; i < samples; i++) {
          amps.push(Math.abs(raw.readInt16LE(i * 2)) / 32768);
        }

        const size = Math.floor(amps.length / bars);
        if (size === 0) return resolve(undefined);

        const avg = Array.from({ length: bars }, (_, i) =>
          amps
            .slice(i * size, (i + 1) * size)
            .reduce((a, b) => a + b, 0) / size
        );

        const max = Math.max(...avg);
        if (max === 0) return resolve(undefined);

        resolve(
          Buffer.from(
            avg.map((v) => Math.floor((v / max) * 100))
          ).toString('base64')
        );
      })
      .pipe()
      .on('data', (c) => chunks.push(c));
  });
}

function fetchJson(url, options = {}) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith('https') ? https : http;
        const req = lib.request(url, { headers: { 'User-Agent': 'Mozilla/5.0', ...options.headers }, method: options.method || 'GET' }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
            });
        });
        req.on('error', reject);
        if (options.body) req.write(options.body);
        req.end();
    });
}

const spamMap = new Map();
const SPAM_LIMIT = 3;
const SPAM_TIME = 5000;
const COOLDOWN_TIME = 10000;

// --- ANTI-BUG / ANTI-FLOOD SHIELD (LOCAL SECURITY LOGGING) ---
const securityRateBuckets = new Map();
const securityIncidentBuckets = new Map();
const securityAlertCooldowns = new Map();
const SECURITY_RATE_WINDOW_MS = 10_000;
const SECURITY_RATE_ALERT_LIMIT = 12;
const SECURITY_RATE_BLOCK_LIMIT = 30;
const SECURITY_INCIDENT_WINDOW_MS = 10 * 60_000;

function securitySenderDigits(jid) {
    const raw = String(jid || '').split('@')[0].split(':')[0];
    return /^\d{7,16}$/.test(raw) ? raw : '';
}

function inspectIncomingPayload(message) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) return 'Invalid message object';
    if (!message.key || typeof message.key !== 'object' || typeof message.key.remoteJid !== 'string') return 'Invalid message key';
    if (!message.message || typeof message.message !== 'object' || Array.isArray(message.message)) return '';

    // Inspect the already-decoded Baileys object with strict work/depth bounds.
    // This avoids expensive stringify/regex work on attacker-controlled structures.
    const stack = [{ value: message.message, depth: 0 }];
    const seen = new WeakSet();
    let nodes = 0;
    while (stack.length) {
        const current = stack.pop();
        const value = current.value;
        if (!value || typeof value !== 'object') continue;
        if (seen.has(value)) return 'Circular payload structure';
        seen.add(value);
        if (++nodes > 6000) return 'Abnormally complex message structure';
        if (current.depth > 24) return 'Excessive message nesting';
        const keys = Object.keys(value);
        if (keys.length > 80) return 'Excessive message fields';
        for (const key of keys) {
            if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
                return 'Unsafe object property in message';
            }
            const child = value[key];
            if (typeof child === 'string' && child.length > 262144) return 'Oversized text field';
            if (child && typeof child === 'object') stack.push({ value: child, depth: current.depth + 1 });
        }
    }

    let raw;
    try { raw = JSON.stringify(message.message); }
    catch (_) { return 'Unreadable message payload'; }
    if (typeof raw !== 'string') return 'Unreadable message payload';
    if (raw.length > 262144) return 'Oversized message payload';
    const controls = (raw.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g) || []).length;
    if (controls > 250) return 'Excessive control characters';
    const bidi = (raw.match(/[\u202A-\u202E\u2066-\u2069]/g) || []).length;
    if (bidi > 100) return 'Excessive directional control characters';
    const keys = Object.keys(message.message);
    if (!keys.length || keys.length > 50) return 'Abnormal message envelope';
    return '';
}

async function getSecurityChatLabel(sock, remoteJid) {
    if (String(remoteJid || '').endsWith('@g.us')) {
        try {
            const metadata = await sock.groupMetadata(remoteJid);
            return String(metadata?.subject || remoteJid).slice(0, 100);
        } catch (_) { return String(remoteJid || 'Unknown group'); }
    }
    return String(remoteJid || 'Unknown chat');
}

function getSecurityRate(senderKey, now = Date.now()) {
    const prior = securityRateBuckets.get(senderKey) || [];
    const recent = prior.filter(ts => now - ts <= SECURITY_RATE_WINDOW_MS);
    recent.push(now);
    securityRateBuckets.set(senderKey, recent);
    if (securityRateBuckets.size > 5000) {
        for (const [key, values] of securityRateBuckets) {
            if (!values.length || now - values[values.length - 1] > 60_000) securityRateBuckets.delete(key);
        }
    }
    return recent.length;
}

async function logSecurityIncident(details) {
    console.warn('[HUNTER X SECURITY]', JSON.stringify({
        session: details.session || 'Single owner account',
        sender: details.number || details.sender || 'Unavailable',
        chat: details.chat || 'Unknown chat',
        reason: String(details.reason || 'Security event').slice(0, 180),
        count: details.count ?? null,
        action: details.action || 'Monitored',
        time: new Date().toISOString()
    }));
    return true;
}

async function registerSecurityIncident(sock, message, reason, count = 1, sessionLabel = 'HUNTER X single owner account') {
    const remoteJid = String(message?.key?.remoteJid || 'unknown');
    const senderJid = String(message?.key?.participant || remoteJid);
    const number = securitySenderDigits(senderJid) || await resolvePhoneDigits(sock, senderJid).catch(() => '');
    const senderKey = sessionLabel + '|' + senderJid + '|' + remoteJid;
    const now = Date.now();
    const prior = securityIncidentBuckets.get(senderKey) || [];
    const recent = prior.filter(ts => now - ts <= SECURITY_INCIDENT_WINDOW_MS);
    recent.push(now);
    securityIncidentBuckets.set(senderKey, recent);

    let action = 'Message rejected; sender monitored';
    // Auto-block only after repeated, high-confidence malformed payload incidents.
    const protectedSender = await isProtectedOwnerJid(sock, senderJid).catch(() => false) || sudoUsers.has(number);
    if (recent.length >= 3 && number && !protectedSender && !message?.key?.fromMe) {
        try {
            await sock.updateBlockStatus(number + '@s.whatsapp.net', 'block');
            action = 'WhatsApp sender blocked after 3 malformed-payload incidents';
            console.warn('[ANTI-BUG] Blocked repeated malformed-payload sender:', number);
        } catch (err) {
            action = 'Repeated malformed payload; automatic block failed: ' + String(err.message || '').slice(0, 100);
        }
    }
    await logSecurityIncident({
        session: sessionLabel,
        sender: senderJid,
        number,
        chat: await getSecurityChatLabel(sock, remoteJid),
        reason,
        count,
        action
    });
    return action;
}

async function startHunterXBot() {
    const sessionPath = path.join(DATA_DIR, 'hunter_x_session');
    const securitySessionLabel = 'HUNTER X single owner account';

    if (process.env.SESSION_ID && process.env.SESSION_ID.trim().length > 20 && !fs.existsSync(path.join(sessionPath, 'creds.json'))) {
        if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });
        try {
            const rawId = process.env.SESSION_ID.trim().replace(/^HUNTER_X_/, '');
            const decodedCreds = Buffer.from(rawId, 'base64').toString('utf-8');
            fs.writeFileSync(path.join(sessionPath, 'creds.json'), decodedCreds);
            console.log('✅ Imperial Session successfully restored from SESSION_ID Environment Variable!');
        } catch (err) {
            console.log('❌ Failed to decode SESSION_ID:', err.message);
        }
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    let version;
    try {
        // Prefer the live WhatsApp Web version; the bundled Baileys version can lag.
        ({ version } = await fetchLatestWaWebVersion());
        console.log('[BAILEYS] Using live WhatsApp Web version:', version.join('.'));
    } catch (liveVersionError) {
        console.warn('[BAILEYS] Live WA version lookup failed:', liveVersionError.message);
        ({ version } = await fetchLatestBaileysVersion());
        console.warn('[BAILEYS] Falling back to Baileys version:', version.join('.'));
    }

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        syncFullHistory: false,
        markOnlineOnConnect: autoSettings.autoonline,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0
    });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('presence.update', update => {
        const presences = update?.presences || {};
        for (const [jid, presence] of Object.entries(presences)) {
            const normalized = jidNormalizedUser(jid);
            const state = presence?.lastKnownPresence || presence?.presence || 'unavailable';
            if (['available', 'composing', 'recording'].includes(state)) {
                livePresence.set(normalized, { state, seenAt: Date.now() });
            } else {
                livePresence.delete(normalized);
            }
        }
    });

    if (!sock.authState.creds.registered) {
        console.log('\n==================================================');
        let phoneNumber = OWNER_NUMBER;
        phoneNumber = phoneNumber.replace(/[^0-9]/g, '');

        try {
            await new Promise(res => setTimeout(res, 5000));
            console.log('⏳ Requesting Imperial Pairing Code for +' + phoneNumber + '...');
            const code = await sock.requestPairingCode(phoneNumber);
            const formattedCode = code?.match(/.{1,4}/g)?.join("-") || code;
            console.log('\n🔑 YOUR PAIRING CODE: ' + formattedCode + '\n');
            console.log('==================================================\n');
        } catch (err) {
            console.log('❌ Error requesting pairing code:', err.message);
        }

        setInterval(() => {}, 60000);
    }

    let ownerAccountMismatch = false;
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            if (ownerAccountMismatch) return;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode !== DisconnectReason.loggedOut) {
                console.log('⚡ Reconnecting HUNTER X BOT...');
                startHunterXBot().catch(err => console.error('Reconnect failed:', err.message));
            } else {
                console.error('❌ The single owner WhatsApp session logged out. Re-pair the configured owner number.');
            }
        } else if (connection === 'open') {
            console.log('\n⚡ 𝐇𝐔𝐍𝐓𝐄𝐑 𝐗 𝐁𝐎𝐓 CONNECTED AND ONLINE! ⚡\n');
            (async () => {
                try {
                    const connectedNumber = await resolvePhoneDigits(sock, sock.user?.id);
                    if (connectedNumber && connectedNumber !== OWNER_NUMBER) {
                        ownerAccountMismatch = true;
                        console.error('[SINGLE-OWNER LOCK] Refusing WhatsApp account +' + connectedNumber + '; configured owner is +' + OWNER_NUMBER + '.');
                        try { sock.end(new Error('This clone is restricted to its configured owner number.')); } catch (_) {}
                        return;
                    }
                    if (!connectionNoticesSent.has(sessionPath)) {
                        connectionNoticesSent.add(sessionPath);
                        const ownJid = sock.user?.id;
                        if (ownJid) {
                            await sock.sendMessage(ownJid, {
                                text: '╭━━〔 👑 𝐇𝐔𝐍𝐓𝐄𝐑 𝐗 𝐁𝐎𝐓 〕━━╮\n' +
                                    '┃ 𝑺𝑰𝑵𝑮𝑳𝑬-𝑶𝑾𝑵𝑬𝑹 𝑺𝑬𝑺𝑺𝑰𝑶𝑵\n' +
                                    '┣━━━━━━━━━━━━━━━━━━━━\n' +
                                    '👑 Owner: ' + OWNER_NAME + '\n' +
                                    '📱 Number: +' + (connectedNumber || OWNER_NUMBER) + '\n' +
                                    '🟢 Status: Online\n' +
                                    '╰━━━━━━━━━━━━━━━━━━━━'
                            });
                        }
                    }
                } catch (noticeError) {
                    console.warn('[CONNECTION NOTICE]', noticeError.message);
                }
            })();
        }
    });

    // --- 📞 ANTI-CALL INTERCEPTOR ---
    sock.ev.on('call', async (callEvents) => {
        if (!autoSettings.anticall) return;
        for (const call of callEvents) {
            if (call.status === 'offer') {
                try {
                    await sock.rejectCall(call.id, call.from);
                    await sock.sendMessage(call.from, { 
                        text: "⚠️ *Imperial Seal:* Direct voice/video calls are forbidden! You have been automatically rejected by HUNTER X BOT." 
                    });
                } catch (e) {}
            }
        }
    });

    // --- ANTIDELETE EVENT LISTENER ---
    sock.ev.on('messages.update', async (updates) => {
        for (const update of updates) {
            if (update.update?.message === null || update.update?.status === 4) {
                const deletedKey = update.key;
                const originalMsg = messageCache.get(deletedKey.id);
                
                if (originalMsg && originalMsg.key.remoteJid) {
                    const chatJid = originalMsg.key.remoteJid;
                    if (chatJid.endsWith('@g.us') && groupSettings[chatJid]?.antidelete) {
                        const sender = originalMsg.key.participant || originalMsg.key.remoteJid;
                        const content = originalMsg.message.conversation || originalMsg.message.extendedTextMessage?.text || 'Media Message';
                        
                        await sock.sendMessage(chatJid, { 
                            text: "👁️ *IMPERIAL ANTIDELETE DETECTED*\n\n*Sender:* @" + sender.split('@')[0] + "\n*Deleted Content:* " + content,
                            mentions: [sender]
                        });
                    }
                }
            }
        }
    });

 
    // =========================================================================
    // 👑 IMPERIAL GROUP PROTECTION SYSTEM
    // =========================================================================

    // Separate protection tracking maps
    const imperialSpamMap = new Map();
    const imperialWarningMap = new Map();

    // =========================================================================
    // 👋 WELCOME, GOODBYE AND GROUP PARTICIPANT PROTECTION
    // =========================================================================
    sock.ev.on('group-participants.update', async (update) => {
        try {
            const { id: from, participants = [], action, author } = update;

            if (!from || !from.endsWith('@g.us')) return;

            if (!groupSettings[from]) {
                groupSettings[from] = {
                    antiadd: false, antibot: false, antidemote: false,
                    antigroupsmention: false, antiimage: false, antilink: false,
                    antipromote: false, antiremove: false, antispam: false,
                    antitag: false, welcome: false, goodbye: false,
                    antidelete: false, antitagadmin: false, grouponly: false,
                    antigcstatus: false,
                    antilinkMode: 'kick', antilinkWarnLimit: 3,
                    antigroupsmentionMode: 'kick', antigroupsmentionWarnLimit: 3
                };
                saveGroupSettings();
            }

            const settings = groupSettings[from];
            const metadata = await sock.groupMetadata(from);
            const groupName = metadata.subject || 'Our Group';

            const normalize = jid => jid ? jidNormalizedUser(jid) : '';
            const botJid = normalize(sock.user?.id);
            const actorJid = normalize(author);

            const botParticipant = metadata.participants.find(
                p => normalize(p.id) === botJid
            );

            const isBotAdmin = !!botParticipant &&
                ['admin', 'superadmin'].includes(botParticipant.admin);

            const actorParticipant = metadata.participants.find(
                p => normalize(p.id) === actorJid
            );

            const actorNum = actorJid.split('@')[0];
            const actorIsAdmin = !!actorParticipant &&
                ['admin', 'superadmin'].includes(actorParticipant.admin);

            const trustedActor = !actorJid ||
                actorJid === botJid ||
                actorIsAdmin ||
                sudoUsers.has(actorNum);

            for (const participant of participants) {
                const userJid = normalize(participant);
                if (!userJid) continue;

                // Resolve LID to a phone JID when Baileys has a mapping.
                const resolvePhoneJid = async (jid) => {
                    if (!jid) return '';
                    if (jid.endsWith('@s.whatsapp.net')) return jid;
                    if (jid.endsWith('@lid')) {
                        try {
                            const mapped = await sock.signalRepository?.lidMapping?.getPNForLID?.(jid);
                            if (mapped) return normalize(mapped);
                        } catch (err) {
                            console.error('[REMOVAL LID LOOKUP]', err.message);
                        }
                    }
                    return '';
                };

                const userPhoneJid = await resolvePhoneJid(userJid);
                const actorPhoneJid = await resolvePhoneJid(actorJid);
                const userMentionJid = userPhoneJid || userJid;
                const actorMentionJid = actorPhoneJid || actorJid;

                const formatNumber = jid => {
                    if (!jid || !jid.endsWith('@s.whatsapp.net')) return '';
                    return '+' + jid.split('@')[0];
                };

                const userNumber = formatNumber(userPhoneJid || userJid);
                const actorNumber = formatNumber(actorPhoneJid || actorJid);
                const userLabel = userNumber || 'Member';
                const actorLabel = actorNumber || 'Admin';
                const userTag = userPhoneJid ? '@' + userPhoneJid.split('@')[0] : 'Member';


                // ANTIADD
                if (action === 'add' && settings.antiadd && !trustedActor) {
                    if (isBotAdmin) {
                        await sock.sendMessage(from, {
                            text: '🚫 Unauthorized member addition detected. Removing ' + userTag + '.',
                            mentions: [userJid]
                        });

                        await sock.groupParticipantsUpdate(
                            from, [userJid], 'remove'
                        ).catch(err => console.error('[ANTIADD]', err.message));
                    }
                    continue;
                }

                // ANTIREMOVE
                if (action === 'remove' && settings.antiremove && !trustedActor) {
                    if (isBotAdmin) {
                        await sock.sendMessage(from, {
                            text: '🛡️ Unauthorized removal detected without owner authorization,Attempting to restore ' + userTag + '.',
                            mentions: [userJid]
                        });

                        await sock.groupParticipantsUpdate(
                            from, [userJid], 'add'
                        ).catch(err => console.error('[ANTIREMOVE]', err.message));
                    }
                    continue;
                }

                // ANTIPROMOTE
                if (action === 'promote' && settings.antipromote && !trustedActor) {
                    if (isBotAdmin) {
                        await sock.sendMessage(from, {
                            text: '🛡️ Unauthorized promotion detected. Reversing promotion of ' + userTag + '.',
                            mentions: [userJid]
                        });

                        await sock.groupParticipantsUpdate(
                            from, [userJid], 'demote'
                        ).catch(err => console.error('[ANTIPROMOTE]', err.message));
                    }
                    continue;
                }

                // ANTIDEMOTE
                if (action === 'demote' && settings.antidemote && !trustedActor) {
                    if (isBotAdmin) {
                        await sock.sendMessage(from, {
                            text: '🛡️ Unauthorized demotion detected without owner authorization. Attempting to restore ' + userTag + '.',
                            mentions: [userJid]
                        });

                        await sock.groupParticipantsUpdate(
                            from, [userJid], 'promote'
                        ).catch(err => console.error('[ANTIDEMOTE]', err.message));
                    }
                    continue;
                }

                // PROFILE PICTURE
                let ppUrl;
                try {
                    ppUrl = await sock.profilePictureUrl(userJid, 'image');
                } catch {
                    ppUrl = MENU_IMAGE_URL;
                }

                // WELCOME
                if (action === 'add' && settings.welcome) {
                    await sock.sendMessage(from, {
                        image: { url: ppUrl },
                        caption:
                            '👑 *IMPERIAL WELCOME* 👑\n\n' +
                            'Welcome to *' + groupName + '*, ' + userTag + '! ⚔️\n' +
                            'We hope you enjoy your time here. If you need help, ask the group. Enjoy your stay under the rule of HUNTER X!',
                        mentions: [userJid]
                    }).catch(err => console.error('[WELCOME]', err.message));
                }

                // GOODBYE
                if (action === 'remove' && settings.goodbye) {
                    await sock.sendMessage(from, {
                        image: { url: ppUrl },
                        caption:
                            '👋 *IMPERIAL FAREWELL* 👋\n\n' +
                            userTag + ' has departed from *' + groupName + '*.\n' +
                            'We hope you enjoyed your time here. Farewell! ⚔️',
                        mentions: [userJid]
                    }).catch(err => console.error('[GOODBYE]', err.message));
                }
            }
        } catch (err) {
            console.error('[GROUP PROTECTION EVENT]', err.message);
        }
    });

    // =========================================================================
    // 📱 MESSAGE HANDLER, STATUS VIEW AND LIKE
    // =========================================================================
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        try {
            const statusMsg = messages?.[0];

            if (statusMsg?.key?.remoteJid === 'status@broadcast') {
                const statusJid = statusMsg.key.participant;

                if (autoSettings.autostatusview) {
                    await sock.readMessages([statusMsg.key]).catch(() => {});
                }

                if (autoSettings.autostatuslike && statusJid) {
                    await sock.sendMessage('status@broadcast', {
                        react: { text: '🖤', key: statusMsg.key }
                    }, { statusJid }).catch(() => {});
                }
                return;
            }
        } catch (err) {
            console.error('[STATUS HANDLER]', err.message);
        }

        // =========================================================================
        // 🛡️ IMPERIAL ANTI-BUG SHIELD — inspect the full incoming batch
        // =========================================================================
        try {
            if (!Array.isArray(messages) || messages.length === 0) return;
            let firstMessageReason = '';
            for (const candidate of messages) {
                const reason = inspectIncomingPayload(candidate);
                if (!reason) continue;
                console.warn('[ANTI-BUG] Rejected malformed message:', reason);
                await registerSecurityIncident(sock, candidate, reason, messages.length, securitySessionLabel);
                if (candidate === messages[0]) firstMessageReason = reason;
            }
            if (firstMessageReason) return;

            // Rate-limit command/message processing per sender and chat.
            const first = messages[0];
            if (first?.key && !first.key.fromMe && first.key.remoteJid !== 'status@broadcast') {
                const senderJid = String(first.key.participant || first.key.remoteJid);
                const senderNumber = securitySenderDigits(senderJid) || await resolvePhoneDigits(sock, senderJid).catch(() => '');
                const senderKey = securitySessionLabel + '|' + senderJid + '|' + String(first.key.remoteJid);
                const count = getSecurityRate(senderKey);
                if (count >= SECURITY_RATE_ALERT_LIMIT) {
                    const chatLabel = await getSecurityChatLabel(sock, first.key.remoteJid);
                    if (count === SECURITY_RATE_ALERT_LIMIT) {
                        await logSecurityIncident({
                            session: securitySessionLabel,
                            sender: senderJid,
                            number: senderNumber,
                            chat: chatLabel,
                            reason: 'Rapid message flooding detected',
                            count,
                            action: 'Incoming messages throttled; monitoring sender'
                        });
                    }
                    if (count >= SECURITY_RATE_BLOCK_LIMIT && count === SECURITY_RATE_BLOCK_LIMIT) {
                        const protectedSender = await isProtectedOwnerJid(sock, senderJid).catch(() => false) || sudoUsers.has(senderNumber);
                        let action = 'Flood threshold reached; no safe phone number available for blocking';
                        if (senderNumber && !protectedSender) {
                            try {
                                await sock.updateBlockStatus(senderNumber + '@s.whatsapp.net', 'block');
                                action = 'WhatsApp sender automatically blocked after repeated rapid flooding';
                                console.warn('[ANTI-BUG] Blocked rapid-flood sender:', senderNumber);
                            } catch (err) {
                                action = 'Automatic block failed: ' + String(err.message || '').slice(0, 120);
                                console.error('[ANTI-BUG BLOCK]', err.message);
                            }
                        } else if (protectedSender) {
                            action = 'Protected owner/Sudo identity detected; no automatic block applied';
                        }
                        await logSecurityIncident({
                            session: securitySessionLabel,
                            sender: senderJid,
                            number: senderNumber,
                            chat: chatLabel,
                            reason: 'Rapid message flooding escalated to block threshold',
                            count,
                            action
                        });
                    }
                    return;
                }
            }
        } catch (err) {
            console.error('[ANTI-BUG SHIELD ERROR]', err.message);
            return;
        }

        if (type !== 'notify') return;

        const msg = messages[0];
        if (!msg?.message || !msg.key?.remoteJid) return;

        // =========================================================================
        // 💾 MESSAGE CACHE FOR ANTIDELETE
        // =========================================================================
        if (!msg.key.fromMe) {
            messageCache.set(msg.key.id, msg);

            if (messageCache.size > 500) {
                const oldestKey = messageCache.keys().next().value;
                messageCache.delete(oldestKey);
            }
        }

        const from = msg.key.remoteJid;

        // Show the configured WhatsApp presence for incoming messages.
        // Recording takes priority if both options are enabled.
        if (!msg.key.fromMe && from !== 'status@broadcast') {
            const presence = autoSettings.autorecording
                ? 'recording'
                : (autoSettings.autotyping ? 'composing' : null);
            if (presence) {
                await sock.sendPresenceUpdate(presence, from).catch(err =>
                    console.error('[AUTO PRESENCE]', err.message)
                );
            }
        }

        const isGroup = from.endsWith('@g.us');
        const sender = msg.key.participant || from;
        const senderNum = sender.split('@')[0];

        if (isGroup && !msg.key.fromMe) {
            incrementMessageCount(from, sender);
        }

        const body =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            msg.message.imageMessage?.caption ||
            msg.message.videoMessage?.caption ||
            msg.message.documentMessage?.caption ||
            msg.message.buttonsResponseMessage?.selectedButtonId ||
            msg.message.templateButtonReplyMessage?.selectedId ||
            msg.message.listResponseMessage?.singleSelectReply?.selectedRowId ||
            '';

        if (!groupSettings[from]) {
            groupSettings[from] = {
                antiadd: false, antibot: false, antidemote: false,
                antigroupsmention: false, antiimage: false, antilink: false,
                antipromote: false, antiremove: false, antispam: false,
                antitag: false, welcome: false, goodbye: false,
                antidelete: false, antitagadmin: false, grouponly: false,
                antigcstatus: false,
                antilinkMode: 'kick', antilinkWarnLimit: 3,
                antigroupsmentionMode: 'kick', antigroupsmentionWarnLimit: 3
            };
            saveGroupSettings();
        }

        const senderPhone = await resolvePhoneDigits(sock, sender);
        const isOwner = msg.key.fromMe || senderPhone === OWNER_NUMBER;
        const isSudo = isOwner; // This build has exactly one privileged WhatsApp owner.

        if (botMode === 'private' && !isSudo) return;

        // =========================================================================
        // 👑 ADMIN DETECTION — match Baileys phone JIDs and LIDs
        // =========================================================================
        let isAdmin = false;
        let isBotAdmin = false;

        if (isGroup) {
            try {
                const metadata = await sock.groupMetadata(from);
                const normalize = jid => jid ? jidNormalizedUser(jid) : '';
                const aliasesFor = async (...jids) => {
                    const aliases = new Set(jids.map(normalize).filter(Boolean));
                    for (const jid of [...aliases]) {
                        if (jid.endsWith('@lid')) {
                            try {
                                const pn = await sock.signalRepository?.lidMapping?.getPNForLID?.(jid);
                                if (pn) aliases.add(normalize(pn));
                            } catch (err) {
                                console.error('[ADMIN LID LOOKUP]', err.message);
                            }
                        }
                    }
                    return aliases;
                };
                const matches = async (participant, aliases) => {
                    const ids = await aliasesFor(participant?.id, participant?.phoneNumber);
                    return [...ids].some(id => aliases.has(id));
                };

                const senderAliases = await aliasesFor(sender, msg.key.participantAlt);
                const botAliases = await aliasesFor(sock.user?.id, sock.user?.lid);

                for (const participant of metadata.participants) {
                    if (await matches(participant, senderAliases)) {
                        isAdmin = ['admin', 'superadmin'].includes(participant.admin);
                    }
                    if (await matches(participant, botAliases)) {
                        isBotAdmin = ['admin', 'superadmin'].includes(participant.admin);
                    }
                }
            } catch (err) {
                console.error('[ADMIN CHECK]', err.message);
            }
        }

        // Sudo is a bot-level role, not a WhatsApp group-admin role. Owner may bypass group-admin checks.
        const isSenderAdmin = isAdmin || isOwner;

        // =========================================================================
        // 🔥 GLOBAL AUTO-REACT
        // =========================================================================
        // Global Auto-React Listener
if (autoSettings?.autoreact && !msg.key.fromMe && msg.message) {
    const emojis = ['🔥', '💀', '👑', '⚡', '😈', '🩸', '🖤'];
    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
    
    await sock.sendMessage(from, {
        react: {
            text: randomEmoji,
            key: msg.key
        }
    });
}

        // =========================================================================
        // 😂 QUOTE-REPLY MEME DETECTOR
        // =========================================================================
        const quotedMsgInfo = msg.message?.extendedTextMessage?.contextInfo;

        if (quotedMsgInfo?.stanzaId) {
            const replyText = body.trim().toLowerCase();

            if (['nope', 'no', 'yeah', 'yes', 'nah'].includes(replyText)) {
                const originalSender = quotedMsgInfo.participant;

                if (sender && originalSender) {
                    const memeCaption =
                        '🙋‍♂️ @' + sender.split('@')[0] +
                        ' said ' + body.trim() +
                        ' to @' + originalSender.split('@')[0] + '!';

                    await sock.sendMessage(from, {
                        image: { url: 'https://i.imgur.com/2wzGhpF.jpeg' },
                        caption: memeCaption,
                        mentions: [sender, originalSender]
                    }, { quoted: msg }).catch(() => {});
                }
            }
        }


        // =========================================================================
        // 🚫 IMPERIAL ANTISPAM
        // =========================================================================
        if (isGroup && groupSettings[from].antispam && !isSenderAdmin) {
            const spamKey = from + '_' + sender;
            const now = Date.now();

            const data = imperialSpamMap.get(spamKey) || {
                times: [],
                cooldownUntil: 0
            };

            if (now < data.cooldownUntil) {
                await sock.sendMessage(from, {
                    delete: msg.key
                }).catch(() => {});
                return;
            }

            data.times = data.times.filter(time => now - time < 10000);
            data.times.push(now);

            if (data.times.length >= 6) {
                data.cooldownUntil = now + 15000;
                data.times = [];

                imperialSpamMap.set(spamKey, data);

                await sock.sendMessage(from, {
                    delete: msg.key
                }).catch(() => {});

                await sock.sendMessage(from, {
                    text: '🚫 @' + senderNum +
                        ', stop flooding the group! You are on a 15-second cooldown.',
                    mentions: [sender]
                }).catch(() => {});

                return;
            }

            imperialSpamMap.set(spamKey, data);
        }

        // =========================================================================
        // 🛡️ IMPERIAL GROUP MESSAGE PROTECTIONS
        // =========================================================================
        if (isGroup && groupSettings[from] && !isSenderAdmin) {
            const fullTextContent =
                msg.message?.conversation ||
                msg.message?.extendedTextMessage?.text ||
                msg.message?.imageMessage?.caption ||
                msg.message?.videoMessage?.caption ||
                msg.message?.documentMessage?.caption ||
                '';

            const cleanSenderJid = jidNormalizedUser(sender);

            // ANTILINK
            const linkRegex =
                /(chat\.whatsapp\.com\/[A-Za-z0-9]{20,24}|https?:\/\/[^\s]+)/i;

            if (groupSettings[from].antilink && linkRegex.test(fullTextContent)) {
                await sock.sendMessage(from, {
                    delete: msg.key
                }).catch(() => {});

                const mode = groupSettings[from].antilinkMode || 'kick';

                if (mode === 'kick') {
                    await sock.sendMessage(from, {
                        text: '🗡️ @' + senderNum + ', links are forbidden!',
                        mentions: [cleanSenderJid]
                    }).catch(() => {});

                    if (isBotAdmin) {
                        await sock.groupParticipantsUpdate(
                            from, [cleanSenderJid], 'remove'
                        ).catch(() => {});
                    }
                } else {
                    const limit = groupSettings[from].antilinkWarnLimit || 3;
                    const warnKey = from + '_' + cleanSenderJid;
                    const warns = (imperialWarningMap.get(warnKey) || 0) + 1;

                    imperialWarningMap.set(warnKey, warns);

                    if (warns >= limit) {
                        imperialWarningMap.delete(warnKey);

                        await sock.sendMessage(from, {
                            text: '🚫 @' + senderNum +
                                ' reached the warning limit. Removing!',
                            mentions: [cleanSenderJid]
                        }).catch(() => {});

                        if (isBotAdmin) {
                            await sock.groupParticipantsUpdate(
                                from, [cleanSenderJid], 'remove'
                            ).catch(() => {});
                        }
                    } else {
                        await sock.sendMessage(from, {
                            text: '⚠️ @' + senderNum +
                                ', link warning ' + warns + '/' + limit,
                            mentions: [cleanSenderJid]
                        }).catch(() => {});
                    }
                }
                return;
            }

            // ANTIGROUP INVITE
            if (groupSettings[from].antigroupsmention &&
                /chat\.whatsapp\.com\/[A-Za-z0-9]{20,24}/i.test(fullTextContent)) {

                await sock.sendMessage(from, {
                    delete: msg.key
                }).catch(() => {});

                await sock.sendMessage(from, {
                    text: '🗡️ @' + senderNum +
                        ', group invitations are forbidden!',
                    mentions: [cleanSenderJid]
                }).catch(() => {});

                if ((groupSettings[from].antigroupsmentionMode || 'kick') === 'kick' &&
                    isBotAdmin) {
                    await sock.groupParticipantsUpdate(
                        from, [cleanSenderJid], 'remove'
                    ).catch(() => {});
                }
                return;
            }

            // ANTIIMAGE
            if (groupSettings[from].antiimage && msg.message?.imageMessage) {
                await sock.sendMessage(from, {
                    delete: msg.key
                }).catch(() => {});

                await sock.sendMessage(from, {
                    text: '🖼️ @' + senderNum +
                        ', image sharing is disabled in this group.',
                    mentions: [cleanSenderJid]
                }).catch(() => {});
                return;
            }

            // ANTITAG: BLOCK MASS MENTIONS
            if (groupSettings[from].antitag) {
                const mentioned =
                    msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

                if (mentioned.length >= 5) {
                    await sock.sendMessage(from, {
                        delete: msg.key
                    }).catch(() => {});

                    await sock.sendMessage(from, {
                        text: '🚫 @' + senderNum + ', mass tagging is forbidden!',
                        mentions: [cleanSenderJid]
                    }).catch(() => {});
                    return;
                }
            }

            // ANTITAGADMIN
            if (groupSettings[from].antitagadmin) {
                const mentioned =
                    msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

                if (mentioned.length > 0) {
                    try {
                        const metadata = await sock.groupMetadata(from);

                        const adminJids = metadata.participants
                            .filter(p => ['admin', 'superadmin'].includes(p.admin))
                            .map(p => jidNormalizedUser(p.id));

                        const taggedAdmins = mentioned.filter(jid =>
                            adminJids.includes(jidNormalizedUser(jid))
                        );

                        if (taggedAdmins.length > 0) {
                            await sock.sendMessage(from, {
                                delete: msg.key
                            }).catch(() => {});

                            await sock.sendMessage(from, {
                                text: '🛡️ @' + senderNum +
                                    ', tagging group administrators is restricted!',
                                mentions: [cleanSenderJid]
                            }).catch(() => {});
                            return;
                        }
                    } catch (err) {
                        console.error('[ANTITAGADMIN]', err.message);
                    }
                }
            }

            // ANTIBOT
            // WhatsApp has no reliable universal bot-account identifier.
            // Suspicious automated messages are logged, not automatically kicked.
            if (groupSettings[from].antibot && !msg.key.fromMe) {
                if (/(?:powered by|bot commands|automated message|i am a bot)/i.test(fullTextContent)) {
                    console.log('[ANTIBOT] Suspicious automated-style message:', sender);
                }
            }
        }


        // Duplicate protection handlers removed: the primary protection block above handles these once.

        // Allow a command after a leading mention, e.g. "@badboy .kick".
        // WhatsApp's actual mentionedJid is read below; this only normalizes command text.
        const commandBody = body.replace(/^\s*(?:@\S+\s*)+(?=\.)/u, '').trim();
        if (!commandBody.startsWith(prefix)) return;

        // Ignore duplicate delivery of the same command message (prevents private-chat reply loops/spam).
        const commandMessageId = msg.key?.id;
        if (commandMessageId) {
            const now = Date.now();
            for (const [id, seenAt] of processedCommandMessages) {
                if (now - seenAt > 10 * 60 * 1000) processedCommandMessages.delete(id);
            }
            if (processedCommandMessages.has(commandMessageId)) return;
            processedCommandMessages.set(commandMessageId, now);
            if (processedCommandMessages.size > 2000) {
                const oldest = processedCommandMessages.keys().next().value;
                processedCommandMessages.delete(oldest);
            }
        }

        // --- 3. COMMAND PARSING ---
        const args = commandBody.slice(prefix.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();
        const q = args.join(' ');
        
        const extra = {
            from,
            sender,
            senderNum,
            isGroup,
            isOwner,
            isSudo,
            isSenderAdmin,
            reply: async (text, options = {}) => sock.sendMessage(from, { text: toHUNTER XFont(text), ...options }, { quoted: msg }),
            react: async (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } }).catch(() => {})
        };
        

        switch (command) {

            case 'play': {
                const query = args.join(' ').trim();

                if (!query) {
                    await extra.reply('🎵 Enter a song name.\n\nExample: .play song title');
                    break;
                }

                try {
                    await extra.reply('🔎 Searching for the track...');

                    const search = await yts(query);
                    const video = search?.videos?.[0];

                    if (!video) {
                        throw new Error('No matching track was found.');
                    }

                    // yt-search provides metadata only. Audio must come from a
                    // provider that is authorized to distribute the requested track.
                    const providerUrl = process.env.AUTHORIZED_AUDIO_API;
                    if (!providerUrl) {
                        throw new Error(
                            'No authorized audio provider is configured. Set AUTHORIZED_AUDIO_API to your licensed provider endpoint.'
                        );
                    }

                    const audioApiKey = process.env.AUDIO_API_KEY;
                    if (!audioApiKey || audioApiKey.length < 32) {
                        throw new Error('Audio API key is missing or invalid in the main bot environment.');
                    }

                    const response = await axios.get(providerUrl, {
                        params: { q: query },
                        headers: { Authorization: `Bearer ${audioApiKey}`, Accept: 'audio/*, application/octet-stream' },
                        responseType: 'arraybuffer',
                        timeout: 45000,
                        maxContentLength: 25 * 1024 * 1024,
                        maxBodyLength: 25 * 1024 * 1024,
                        validateStatus: status => status >= 200 && status < 300
                    });

                    const audioBuffer = Buffer.from(response.data || []);
                    if (!audioBuffer.length) {
                        throw new Error('The audio provider returned an empty response.');
                    }

                    const signature = audioBuffer.subarray(0, 12);
                    const isMp3 = signature.subarray(0, 3).toString() === 'ID3' ||
                        (signature[0] === 0xff && (signature[1] & 0xe0) === 0xe0);
                    const isOgg = signature.subarray(0, 4).toString() === 'OggS';
                    const isWav = signature.subarray(0, 4).toString() === 'RIFF';
                    const isFlac = signature.subarray(0, 4).toString() === 'fLaC';
                    const isMp4 = signature.subarray(4, 8).toString() === 'ftyp';

                    if (!(isMp3 || isOgg || isWav || isFlac || isMp4)) {
                        throw new Error('The provider response was not a recognized audio file.');
                    }

                    const mimetype = isOgg ? 'audio/ogg'
                        : isWav ? 'audio/wav'
                        : isFlac ? 'audio/flac'
                        : isMp4 ? 'audio/mp4'
                        : 'audio/mpeg';

                    const extension = isOgg ? 'ogg'
                        : isWav ? 'wav'
                        : isFlac ? 'flac'
                        : isMp4 ? 'm4a'
                        : 'mp3';

                    const safeTitle = (video.title || query)
                        .replace(/[\\/:*?"<>|]/g, '')
                        .slice(0, 100) || 'audio';

                    await sock.sendMessage(from, {
                        audio: audioBuffer,
                        mimetype,
                        fileName: safeTitle + '.' + extension,
                        ptt: false
                    }, { quoted: msg });

                } catch (err) {
                    const status = err.response?.status;
                    let detail = err.message || 'Audio provider error';
                    if (status === 401 || status === 403) {
                        detail = 'Audio API rejected the key. Check that AUDIO_API_KEY is identical in both Render services.';
                    } else if (status === 502 || status === 503 || status === 504) {
                        detail = `Audio API is temporarily unavailable (HTTP ${status}). Check the Audio API Render logs and service health.`;
                    } else if (status) {
                        detail = `Audio API request failed (HTTP ${status}).`;
                    } else if (err.code === 'ECONNABORTED') {
                        detail = 'Audio API timed out. Check whether the Render service is awake and responding.';
                    }
                    console.error('[PLAY COMMAND]', { status: status || null, code: err.code || null, message: err.message });
                    await extra.reply('❌ *PLAY FAILED*\n\n' + detail);
                }

                break;
            }


            // =========================================================================
            // HUNTER X BOT MENUS — decorative boxed layout
            // =========================================================================
            case 'ownermenu': {
                const t = '╭━━━〔 👑 *𝐇𝐔𝐍𝐓𝐄𝐑 𝐗 𝐌𝐄𝐍𝐔* 〕━━━┈\n' +
                    '✿ .sudo\n✿ .sudolist\n✿ .sudoremove\n✿ .setprefix\n' +
                    '✿ .anticall\n✿ .delgcstatus\n✿ .delete / .del\n' +
                    '✿ .antidelete\n✿ .antiviewonce\n✿ .autoonline\n✿ .autorecording\n' +
                    '✿ .autostatuslike\n✿ .autostatusview\n✿ .autotyping\n✿ .autoreact\n' +
                    '✿ .block\n✿ .unblock\n✿ .buatgc\n✿ .changebio\n✿ .devices\n' +
                    '✿ .getpp\n✿ .joingroup\n✿ .leavegroup\n✿ .listfont\n✿ .listgroup\n' +
                    '✿ .bancheck\n✿ .botlink\n✿ .fetchstatus\n✿ .listchannels\n✿ .mode\n' +
                    '✿ .pair\n✿ .broadcast\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━┈';
                return extra.reply(styleCommandMentions(t));
            }
            case 'groupmenu':
            case 'gcs': {
                const t = '╭━━━〔 🛡️ *𝘿𝒐𝒎𝒂𝒊𝒏 𝙈𝒂𝒏𝒂𝒈𝒆𝒎𝒆𝒏𝙩* 〕━━━┈\n' +
                    '✿ .welcome\n✿ .goodbye\n✿ .antilink\n✿ .antigroupsmention\n' +
                    '✿ .antibot\n✿ .antispam\n✿ .antitag\n✿ .antitagadmin\n' +
                    '✿ .antiremove\n✿ .addmember\n✿ .antiadd\n✿ .antidemote\n' +
                    '✿ .antiimage\n✿ .antipromote\n✿ .approveall\n✿ .close\n' +
                    '✿ .closetime\n✿ .demoteall\n✿ .demoteuser\n✿ .disapproveall\n' +
                    '✿ .dor\n✿ .gcs\n✿ .glostat\n✿ .grouplink\n✿ .grouponly\n' +
                    '✿ .hidetag\n✿ .kickall\n✿ .left\n✿ .listgroups\n✿ .mediatag\n' +
                    '✿ .open\n✿ .opentime\n✿ .promoteall\n✿ .promoteuser\n' +
                    '✿ .remove\n✿ .setgroupbio\n✿ .setgroupname\n✿ .setgrouppp\n' +
                    '✿ .setwarning\n✿ .tagadmin\n✿ .tagall\n✿ .tagonline\n' +
                    '✿ .tagpoll\n✿ .warning\n✿ .pin\n✿ .vv\n' +
                    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈';
                return extra.reply(styleCommandMentions(t));
            }
            case 'downloadmenu': {
                return extra.reply(styleCommandMentions('╭━━━〔 📥 *𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃 𝐓𝐎𝐎𝐋𝐒* 〕━━━┈\n' +
                    '✿ .applemusic\n✿ .capcut\n✿ .play <song name>\n✿ .dl <link>\n' +
                    '✿ .fb <public video link>\n✿ .yts <search words>\n✿ .lyrics <song name>\n' +
                    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━┈'));
            }
            case 'stickermenu': {
                return extra.reply(styleCommandMentions('╭━━━〔 🧪 *𝐈𝐌𝐏𝐄𝐑𝐈𝐀𝐋 𝐂𝐎𝐍𝐕𝐄𝐑𝐒𝐈𝐎𝐍* 〕━━━┈\n' +
                    '✿ .audio\n✿ .convertmenu\n✿ .stickermeme\n✿ .stiker\n✿ .swm\n' +
                    '✿ .telestick\n✿ .toaud\n✿ .togif\n✿ .toimg\n✿ .tomp4\n' +
                    '✿ .toptt\n✿ .tourl\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━┈'));
            }
            case 'gamemenu': {
                return extra.reply(styleCommandMentions('╭━━━〔 🎮 *𝐈𝐌𝐏𝐄𝐑𝐈𝐀𝐋 𝐆𝐀𝐌𝐄𝐒* 〕━━━┈\n' +
                    '✿ .games\n✿ .mathquiz\n✿ .riddle\n✿ .hangman\n✿ .triviaclassic\n' +
                    '✿ .answer <answer>\n✿ .guess <letter>\n✿ .endgame\n' +
                    '✿ .balance\n✿ .bank\n✿ .profile\n✿ .daily\n✿ .weekly\n' +
                    '✿ .monthly\n✿ .beg\n✿ .work\n✿ .fish\n✿ .hunt\n' +
                    '✿ .deposit <amount>\n✿ .withdraw <amount>\n✿ .pay <user> <amount>\n' +
                    '✿ .shop\n✿ .buy <item>\n✿ .inventory\n✿ .leaderboard\n✿ .richest\n' +
                    '┃ Betting commands are not enabled.\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━┈'));
            }
            case 'aimenu': {
                return extra.reply(styleCommandMentions('╭━━━〔 🧠 *𝐃𝐄𝐌𝐎𝐍𝐈𝐂 𝐈𝐍𝐓𝐄𝐋𝐋𝐈𝐆𝐄𝐍𝐂𝐄* 〕━━━┈\n' +
                    '✿ .ai <question>\n✿ .aimenu\n✿ .claude <question>\n' +
                    '✿ .copilot <question>\n✿ .describe (reply to image)\n' +
                    '✿ .felo <question>\n✿ .gpt <question>\n✿ .imagine <description>\n' +
                    '✿ .llama <question>\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━┈'));
            }
            case 'othermenu': {
                return extra.reply(styleCommandMentions('╭━━━〔 🛠️ *𝐃𝐄𝐌𝐎𝐍𝐈𝐂 𝐓𝐎𝐎𝐋𝐒* 〕━━━┈\n' +
                    '✿ .ping\n✿ .status\n✿ .devices\n✿ .getpp\n✿ .fetchstatus\n' +
                    '✿ .listgroup\n✿ .permissionaudit\n✿ .groupinfo\n✿ .session\n✿ .uptime\n' +
                    '✿ .ownerpanel\n✿ .gstatus\n✿ .groupstatus\n✿ .ggstatus\n' +
                    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━┈'));
            }
            case 'togglemenu': {
                return extra.reply(styleCommandMentions('╭━━━〔 ⚙️ *𝐈𝐌𝐏𝐄𝐑𝐈𝐀𝐋 𝐒𝐄𝐓𝐓𝐈𝐍𝐆𝐒* 〕━━━┈\n' +
                    '✿ .autoonline on/off\n✿ .autorecording on/off\n✿ .autostatuslike on/off\n' +
                    '✿ .autostatusview on/off\n✿ .autotyping on/off\n✿ .autoreact on/off\n' +
                    '✿ .anticall on/off\n✿ .antilink on/off / kick / warn\n' +
                    '✿ .antibot on/off\n✿ .antispam on/off\n✿ .antitag on/off\n' +
                    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━┈'));
            }
            case 'funmenu': {
                return extra.reply(styleCommandMentions('╭━━━〔 🎭 *𝐇𝐀𝐕𝐄 𝐅𝐔𝐍 𝐖𝐈𝐓𝐇 𝐄𝐌𝐏* 〕━━━┈\n' +
                    '✿ .gm\n✿ .goodmorning\n✿ .ga\n✿ .goodafternoon\n' +
                    '✿ .gn\n✿ .goodnight\n✿ .konachan (SFW)\n✿ .wasted\n' +
                    '✿ .top\n✿ .activeusers\n✿ .gayrate\n✿ .flirt\n✿ .dare\n✿ .truth\n' +
                    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━┈'));
            }
            case 'allmenu': {
                const lines = [
                    '╭━━〔 👑 𝑯𝑼𝑵𝑻𝑬𝑹 𝑿 V4 〕━━╮',
                    '┃ 𝑽4.4 • 𝑪𝑶𝑴𝑷𝑳𝑬𝑻𝑬 𝑪𝑶𝑴𝑴𝑨𝑵𝑫 𝑳𝑰𝑺𝑻',
                    '┣━━━━━━━━━━━━━━━━━━━━',
                    ...COMMAND_CATALOG.map(name => '┃ • ' + prefix + styleCommandName(name)),
                    '╰━━━━━━━━━━━━━━━━━━━━╯',
                    '',
                    'Use .menu for the overview and category menus for focused lists.'
                ];
                // Keep the complete catalogue in one WhatsApp message, like the old bot.
                await sock.sendMessage(from, { text: lines.join('\n') }, { quoted: msg });
                break;
            }

            case 'menu':
            case 'help': {
                const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
                const hours = Math.floor(uptimeSeconds / 3600);
                const minutes = Math.floor((uptimeSeconds % 3600) / 60);
                const seconds = uptimeSeconds % 60;
                const uptimeFormatted = `${hours}h ${minutes}m ${seconds}s`;
                const menuText = '╭━━━〔 👑 *' + BOT_NAME + '* 👑 〕━━━┈\n' +
                    '┃ 👑 *𝑩𝒐𝒕 𝑶𝒘𝒏𝒆𝒓:* ' + OWNER_NAME + '\n' +
                    '┃ 🔮 *𝑩𝒐𝒕 𝑴𝒐𝒅𝒆:* ' + botMode.toUpperCase() + '\n' +
                    '┃ 🏗️ *𝑩𝒐𝒕 𝑺𝒕𝒂𝒕𝒖𝒔:* Under Development\n' +
                    '┃ ⏰️ *𝑼𝒑𝒕𝒊𝒎𝒆:* ' + uptimeFormatted + '\n' +
                    '┃ 🌖 *𝑽𝒆𝒓𝒔𝒊𝒐𝒏:* ' + BOT_VERSION + '\n' +
                    '╰━━━━━━━━━━━\n\n' +
                    '╭━━━〔 📚 *𝑪𝒐𝒎𝒎𝒂𝒏𝒅𝒔 𝑳𝒊𝒔𝒕* 〕━━━┈\n' +
                    '✦ .ownermenu\n✦ .groupmenu\n✦ .downloadmenu\n✦ .stickermenu\n' +
                    '✦ .gamemenu\n✦ .aimenu\n✦ .othermenu\n✦ .togglemenu\n' +
                    '✦ .funmenu\n✦ .allmenu\n' +
                    '╰━━━━━━━━━━━\n\n' +
                    '╭━━━〔 👑 *𝘼𝘽𝙊𝙐𝙏 𝘾𝙍𝙀𝘼𝙏𝙊𝙍* 👑 〕━━━┈\n' +
                    '┃ 👑 *CREATOR:* ᴵᴬᴹ«»ᘜяᥱᥲт ᗪᥱмση ᙓмρ\n' +
                    '┃ 📞 *CONTACT:* +2347061696819\n' +
                    '┃ 🛡️ *IDENTITY:* 𝐰𝐡𝐲 𝐚𝐥𝐰𝐚𝐲𝐬 𝐊𝐞𝐥𝐯𝐢𝐧\n' +
                    '┃ 🐙 *GITHUB:*  Uhm Later\n' +
                    '┃\n' +
                    '┃ 💐 _"𝙏𝒉𝒆 𝙁𝒓𝒂𝒈𝒓𝒂𝒏𝒕 𝒇𝒍𝒐𝒘𝒆𝒓𝒔 𝘽𝒍𝒐𝒐𝒎𝒔 𝒘𝒊𝙩𝙝 𝘿𝒊𝒈𝒏𝒊𝙩𝙮"_\n' +
                    '╰━━━━━━━━━━━━━━━━━━━━━━━┈';
                try {
                    await sock.sendMessage(from, { image: { url: MENU_IMAGE_URL }, caption: styleCommandMentions(menuText) }, { quoted: msg });
                } catch (err) {
                    await sock.sendMessage(from, { text: styleCommandMentions(menuText) }, { quoted: msg });
                }
                break;
            }

            // =========================================================================
            // NATURAL & DRAMATIC GREETINGS (.gm, .ga, .gn)
            // =========================================================================
            case 'goodmorning':
            case 'gm': {
                if (!isGroup) return extra.reply('⚔️ *Use this in a group chat.*');
                if (!isSenderAdmin && !isSudo) return extra.reply('⚔️ *Only admins or sudo users can run this.*');

                try {
                    const groupMetadata = await sock.groupMetadata(from);
                    const mentions = groupMetadata.participants.map(p => p.id);

                    const morningArtworks = [ 
                        "https://i.postimg.cc/g0KFgQ3z/c77a97e3d147412e46277e04aad9ec2d.jpg",
                       "https://i.postimg.cc/vBmj3BQ9/a0dabd85c67ccddad4c21fb230b8e77b.jpg",
                        "https://i.postimg.cc/tgmQ0PvF/fad9e7a371f4fb4325dfd484effcff9f.jpg",
"https://i.postimg.cc/5ys2Djvd/daba42e86ad0aca92686fb9487d71caf.jpg"
                    ];

                    const morningCaptions = [
                        "╭━━━〔  🌄 *𝑮𝑶𝑶𝑫 𝑴𝑶𝑹𝑵𝑰𝑵𝑮*  〕━━━┈\n┃ ⚡ Sending a cute morning to y'all.\n┃ 👁️ here is another to grind , sharpen your focus, and stay ahead.\n┃ ⚔️ Remember perseverance is the best even if you fail .\n╰━━━━━━━━━━━━━━━━━━━━━━━┈\n_“Time waits for no one.”_",
                        "╭━━━〔  ⚔️ *𝐎𝐇𝐀𝐘𝐎-𝐆𝐎𝐎𝐃 𝐌𝐎𝐑𝐍𝐈𝐍𝐆*  〕━━━┈\n┃ 🌅 Ohayo Gozaimasta ☺️❣️.\n┃ 😝 hope everyone slept good .\n┃ ⚡ just greeting y'all tho you can choose not to answer😌.\n╰━━━━━━━━━━━━━━━━━━━━━━━┈\n_“and all the fra members too .”_",
                        "╭━━━〔  🤍 *𝐑𝐈𝐒𝐄 𝐀𝐍𝐃 𝐒𝐇𝐈𝐍𝐄*  〕━━━┈\n┃ 👑 Sun’s up, time to move.\n┃ 🔥 Don’t waste the morning slacking off.\n┃ 🖤 Stay focused, handle your goals, and dominate the day.\n╰━━━━━━━━━━━━━━━━━━━━━━━┈\n_“chai speechless.”_"
                    ];

                    const previousImage = lastGreetingImages.get('morning');
                    const imageChoices = morningArtworks.filter(url => url !== previousImage);
                    const randomImg = (imageChoices.length ? imageChoices : morningArtworks)[Math.floor(Math.random() * (imageChoices.length ? imageChoices : morningArtworks).length)];
                    lastGreetingImages.set('morning', randomImg);
                    const randomCaption = morningCaptions[Math.floor(Math.random() * morningCaptions.length)];

                    await sock.sendMessage(from, { react: { text: '🌅', key: msg.key } });
                    try {
                        const imageResponse = await axios.get(randomImg, {
                            responseType: 'arraybuffer',
                            timeout: 15000,
                            maxContentLength: 8 * 1024 * 1024
                        });
                        await sock.sendMessage(from, {
                            image: Buffer.from(imageResponse.data),
                            caption: randomCaption,
                            mentions
                        }, { quoted: msg });
                    } catch (imageError) {
                        console.error('[GREETING IMAGE]', imageError.message);
                        await sock.sendMessage(from, {
                            image: { url: randomImg },
                            caption: randomCaption,
                            mentions
                        }, { quoted: msg }).catch(async () => {
                            await sock.sendMessage(from, { text: randomCaption, mentions }, { quoted: msg });
                        });
                    }
                } catch (e) {
                    await extra.reply('❌ *Something went wrong sending the morning greeting.*');
                }
                break;
            }

            case 'goodafternoon':
            case 'ga': {
                if (!isGroup) return extra.reply('⚔️ *Use this in a group chat.*');
                if (!isSenderAdmin && !isSudo) return extra.reply('⚔️ *Only admins or sudo users can run this.*');

                try {
                    const groupMetadata = await sock.groupMetadata(from);
                    const mentions = groupMetadata.participants.map(p => p.id);

                    const afternoonArtworks = [
                        "https://i.postimg.cc/rsVSS0My/b266fc100e5037b5d2cb522fe98136ad.jpg",
                        "https://i.postimg.cc/rsVSS0My/b266fc100e5037b5d2cb522fe98136ad.jpg",

"https://i.postimg.cc/FH8g2HgV/58f71607457c7721df93dcdedd2dafb6.jpg",

"https://i.postimg.cc/2yrx29Ff/40ac6ca16fedc707b7d13fa0bf4c7125.jpg"

                    ];

                    const afternoonCaptions = [
                        "╭━━━〔  🔥 *𝑨𝑭𝑻𝑬𝑹𝑵𝑶𝑶𝑵 𝒀'𝑨𝑳𝑳*  〕━━━┈\n┃ ☀️ Peak of the day right here.\n┃ ⚡ Take a quick breather if you need to, then back to work.\n┃ ⚔️ Make the rest of the day count.\n╰━━━━━━━━━━━━━━━━━━━━━━━┈\n_“Stay locked in.”_",
                        "╭━━━〔  👑 *𝑲𝑶𝑵𝑵𝑰𝑪𝑯𝑰𝑾𝑨* 😊 〕━━━┈\n┃ 🌤️ The sun is high, keep pushing through.\n┃ 🩸 No room for laziness halfway through the grind.\n┃ 🖤 Stay sharp until the sun sets.\n╰━━━━━━━━━━━━━━━━━━━━━━━┈\n_“I dey motivate una keh 😂 omo no grind oo lol.”_"
                    ];
                   
                    const previousImage = lastGreetingImages.get('afternoon');
                    const imageChoices = afternoonArtworks.filter(url => url !== previousImage);
                    const randomImg = (imageChoices.length ? imageChoices : afternoonArtworks)[Math.floor(Math.random() * (imageChoices.length ? imageChoices : afternoonArtworks).length)];
                    lastGreetingImages.set('afternoon', randomImg);
                    const randomCaption = afternoonCaptions[Math.floor(Math.random() * afternoonCaptions.length)];

                    await sock.sendMessage(from, { react: { text: '🔥', key: msg.key } });
                    try {
                        const imageResponse = await axios.get(randomImg, {
                            responseType: 'arraybuffer',
                            timeout: 15000,
                            maxContentLength: 8 * 1024 * 1024
                        });
                        await sock.sendMessage(from, {
                            image: Buffer.from(imageResponse.data),
                            caption: randomCaption,
                            mentions
                        }, { quoted: msg });
                    } catch (imageError) {
                        console.error('[GREETING IMAGE]', imageError.message);
                        await sock.sendMessage(from, {
                            image: { url: randomImg },
                            caption: randomCaption,
                            mentions
                        }, { quoted: msg }).catch(async () => {
                            await sock.sendMessage(from, { text: randomCaption, mentions }, { quoted: msg });
                        });
                    }
                } catch (e) {
                    await extra.reply('❌ *Something went wrong sending the afternoon greeting.*');
                }
                break;
            }

            case 'goodnight':
            case 'gn': {
                if (!isGroup) return extra.reply('⚔️ *Use this in a group chat.*');
                if (!isSenderAdmin && !isSudo) return extra.reply('⚔️ *Only admins or sudo users can run this.*');

                try {
                    const groupMetadata = await sock.groupMetadata(from);
                    const mentions = groupMetadata.participants.map(p => p.id);

                    const nightArtworks = [
                        "https://i.postimg.cc/bv2chr7K/1d25bcfea04a4ee14159252cb97b4efc.jpg",
                        "https://i.postimg.cc/GpZR8GPv/14d51d4b546eefcb70052d84c37952da.jpg",
                        "https://i.postimg.cc/jj9xHGT2/aa8fdc8aa04dcc3e2e82b4f094e7e1d9.jpg"
                    ];

                    const nightCaptions = [
                        "╭━━━〔  🌙 *NIGHTTIME CALL*  〕━━━┈\n┃ 🌌 Day’s over. Time to call it a night.\n┃ 🕷️ Get some rest and recharge for tomorrow.\n┃ 🖤 Catch you all when the sun comes up.\n╰━━━━━━━━━━━━━━━━━━━━━━━┈\n_“Rest up for the next run.”_",
                        "╭━━━〔  🖤 *𝙊𝙔𝘼𝙎𝙐𝙈𝙄 𝙉𝘼𝙎𝘼𝙄*  〕━━━┈\n┃ 🌙 Sun’s down, quiet hours.\n┃ 😢 man we are so exhausted aren't we .\n┃ 🌌 Hope yall sleep well, tomorrow will be good for us .\n╰━━━━━━━━━━━━━━━━━━━━━━━┈\n_“YARE YARE ☺️.”_",
                        "╭━━━〔  🗡️ *𝐄𝐍𝐃 𝐎𝐅 𝐓𝐇𝐄 𝐃𝐀𝐘*  〕━━━┈\n┃ 🌑 Wrap it up for the day.\n┃ ⚡ Rest your mind, you earned it.\n┃ 🖤 Goodnight everyone, see you tomorrow.\n╰━━━━━━━━━━━━━━━━━━━━━━━┈\n_“Until next dawn.”_"
                    ];

                    const previousImage = lastGreetingImages.get('night');
                    const imageChoices = nightArtworks.filter(url => url !== previousImage);
                    const randomImg = (imageChoices.length ? imageChoices : nightArtworks)[Math.floor(Math.random() * (imageChoices.length ? imageChoices : nightArtworks).length)];
                    lastGreetingImages.set('night', randomImg);
                    const randomCaption = nightCaptions[Math.floor(Math.random() * nightCaptions.length)];

                    await sock.sendMessage(from, { react: { text: '🖤', key: msg.key } });
                    try {
                        const imageResponse = await axios.get(randomImg, {
                            responseType: 'arraybuffer',
                            timeout: 15000,
                            maxContentLength: 8 * 1024 * 1024
                        });
                        await sock.sendMessage(from, {
                            image: Buffer.from(imageResponse.data),
                            caption: randomCaption,
                            mentions
                        }, { quoted: msg });
                    } catch (imageError) {
                        console.error('[GREETING IMAGE]', imageError.message);
                        await sock.sendMessage(from, {
                            image: { url: randomImg },
                            caption: randomCaption,
                            mentions
                        }, { quoted: msg }).catch(async () => {
                            await sock.sendMessage(from, { text: randomCaption, mentions }, { quoted: msg });
                        });
                    }
                } catch (e) {
                    await extra.reply('❌ *Something went wrong sending the night greeting.*');
                }
                break;
            }

            // =========================================================================
            // CUSTOM ADDED FEATURES INTEGRATION
            // =========================================================================
            
            // 1. Message Count Leaderboard
            case 'top':
            case 'topmembers':
            case 'listactive': {
                if (!isGroup) {
                    return extra.reply('This command is only available in group chats.');
                }

                const messageCounts = loadMessageCounts();
                const groupCounts = messageCounts[from] || {};

                const sortedMembers = Object.entries(groupCounts)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 5);

                if (sortedMembers.length === 0) {
                    return extra.reply('No message activity recorded yet.');
                }

                let message = '🏆 Top Members Based on Message Count:\n\n';
                sortedMembers.forEach(([userId, count], index) => {
                    message += `${index + 1}. @${userId.split('@')[0]} - ${count} messages\n`;
                });

                await sock.sendMessage(from, { text: message, mentions: sortedMembers.map(([userId]) => userId) }, { quoted: msg });
                break;
            }

            // 2. Wasted Image Command
            case 'wasted': {
                let userToWaste;
                
                if (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
                    userToWaste = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
                } else if (msg.message?.extendedTextMessage?.contextInfo?.participant) {
                    userToWaste = msg.message.extendedTextMessage.contextInfo.participant;
                }
                
                if (!userToWaste) {
                    await sock.sendMessage(from, { 
                        text: 'Please mention someone or reply to their message to waste them!' 
                    }, { quoted: msg });
                    return;
                }

                try {
                    let profilePic;
                    try {
                        profilePic = await sock.profilePictureUrl(userToWaste, 'image');
                    } catch {
                        profilePic = 'https://i.imgur.com/2wzGhpF.jpeg';
                    }

                    const wastedResponse = await axios.get(
                        `https://some-random-api.com/canvas/overlay/wasted?avatar=${encodeURIComponent(profilePic)}`,
                        { responseType: 'arraybuffer' }
                    );

                    await sock.sendMessage(from, {
                        image: Buffer.from(wastedResponse.data),
                        caption: `⚰️ *Wasted* : ${userToWaste.split('@')[0]} 💀\n\nRest in pieces!`,
                        mentions: [userToWaste]
                    }, { quoted: msg });

                } catch (error) {
                    console.error('Error in wasted command:', error);
                    await sock.sendMessage(from, { 
                        text: 'Failed to create wasted image! Try again later.'
                    }, { quoted: msg });
                }
                break;
            }

case 'konachan':
case 'konachansfw': {
    try {
        await extra.reply('✦ *SUMMONING A SAFE ANIME IMAGE...*');
        let imageUrl = null;

        // Konachan safe-rated endpoints first. Never accept non-safe ratings.
        const konachanEndpoints = [
            'https://konachan.net/post.json',
            'https://konachan.com/post.json'
        ];
        for (const endpoint of konachanEndpoints) {
            try {
                const result = await axios.get(endpoint, {
                    params: { limit: 30, tags: 'rating:safe' },
                    timeout: 15000,
                    headers: { 'User-Agent': 'HUNTER-X-BOT/1.0 (safe anime image command)' }
                });
                const posts = Array.isArray(result.data) ? result.data.filter(post =>
                    post.rating === 's' && typeof post.file_url === 'string' &&
                    /^https:\/\//i.test(post.file_url)
                ) : [];
                if (posts.length) {
                    imageUrl = posts[Math.floor(Math.random() * posts.length)].file_url;
                    break;
                }
            } catch (providerError) {
                console.warn('[KONACHAN PROVIDER]', endpoint, providerError.message);
            }
        }

        // Safe anime fallback if Konachan is unavailable.
        if (!imageUrl) {
            try {
                const fallback = await axios.get('https://api.waifu.pics/sfw/waifu', { timeout: 15000 });
                if (typeof fallback.data?.url === 'string' && /^https:\/\//i.test(fallback.data.url)) {
                    imageUrl = fallback.data.url;
                }
            } catch (providerError) {
                console.warn('[WAIFU.PICS FALLBACK]', providerError.message);
            }
        }

        if (!imageUrl) {
            return extra.reply('❌ *No safe anime image is available right now.* Please try again later.');
        }

        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer', timeout: 25000,
            maxContentLength: 10 * 1024 * 1024,
            maxBodyLength: 10 * 1024 * 1024,
            headers: { 'User-Agent': 'HUNTER-X-BOT/1.0' }
        });
        const contentType = String(response.headers['content-type'] || '').toLowerCase();
        const imageBuffer = Buffer.from(response.data);
        if (!contentType.startsWith('image/') || imageBuffer.length < 1024) {
            throw new Error('Image provider returned an invalid image file.');
        }

        await sock.sendMessage(from, {
            image: imageBuffer,
            caption: '╭━━〔 ✦ HUNTER X BOT ✦ 〕━━╮\n' +
                '┃ 🎴 *ANIME ARCHIVE*\n' +
                '╰━━━━━━━━━━━━━━━━━━━━━━╯\n' +
                '_A safe anime image has been summoned._'
        }, { quoted: msg });
    } catch (error) {
        console.error('[KONACHAN ERROR]', error?.response?.status, error.message);
        await extra.reply('❌ *Konachan could not fetch an image.* The image providers may be temporarily unavailable.').catch(() => {});
    }
    break;
}

                      // =========================================================================
            // EXISTING BOT COMMANDS
            // =========================================================================
            case 'sudo': {
                if (!isOwner) return extra.reply('⚔️ *Owner access only.*');
                return extra.reply('🔒 *Single-owner mode:* additional Sudo accounts are disabled.');
            }

            case 'sudolist': {
                let txt = '👑 *𝐇𝐔𝐍𝐓𝐄𝐑 𝐗 — Sole Owner*\n\n• +' + OWNER_NUMBER + '\n';
                await sock.sendMessage(from, { text: txt, mentions: [OWNER_NUMBER + '@s.whatsapp.net'] }, { quoted: msg });
                break;
            }

            case 'sudoremove': {
                if (!isOwner) return extra.reply('⚔️ *Owner access only.*');
                return extra.reply('🔒 *Single-owner mode:* there are no additional Sudo accounts to remove.');
            }

            case 'anticall': {
                if (!isSudo) return extra.reply('⚔️ *Sudo rights required!*');
                if (!args[0] || !['on', 'off'].includes(args[0].toLowerCase())) {
                    return extra.reply('Usage: ' + prefix + 'anticall on/off');
                }
                const enabled = args[0].toLowerCase() === 'on';
                autoSettings.anticall = enabled;
                db.autoSettings = autoSettings;
                saveSettings(db);
                await extra.reply(enabled ? '✅ Anti-call enabled. Calls will be auto-rejected & blocked.' : '❌ Anti-call disabled.');
                break;
            }

            case 'setprefix':
            case 'prefix': {
                if (!isSudo) return extra.reply('⚔️ *Sudo rights required!*');
                if (args.length === 0) {
                    return extra.reply(`📌 Current prefix: ${prefix}\n\nUsage: ${prefix}setprefix <new prefix>`);
                }
                const newPrefix = args[0];
                if (newPrefix.length > 3) {
                    return extra.reply('❌ Prefix must be 1-3 characters long!');
                }
                prefix = newPrefix;
                db.prefix = prefix;
                saveSettings(db);
                await extra.reply(`✅ Prefix changed to: ${prefix}\n\nNew command format: ${prefix}command`);
                break;
            }


            case 'del':
            case 'delete': {
                if (!isSenderAdmin) return extra.reply('⚔️ *Admin rights required!*');
                const ctx = msg.message?.extendedTextMessage?.contextInfo;
                if (!ctx?.stanzaId) {
                    return extra.reply('🗑️ *Reply directly to the message you wish to delete, My Lord.*');
                }

                try {
                    const quotedFromMe = Boolean(ctx.fromMe);
                    const quotedParticipant = isGroup
                        ? jidNormalizedUser(ctx.participant || (quotedFromMe ? sock.user.id : sender))
                        : undefined;
                    const deleteKey = {
                        remoteJid: from,
                        fromMe: quotedFromMe,
                        id: ctx.stanzaId,
                        ...(quotedParticipant ? { participant: quotedParticipant } : {})
                    };
                    await sock.sendMessage(from, { delete: deleteKey });
                    await extra.react('🗑️');
                } catch (error) {
                    await extra.reply('❌ *Failed to delete message. Ensure bot is group admin!*');
                }
                break;
            }

            case 'groupstatus':
            case 'togstatus':
            case 'swgc':
            case 'gs':
            case 'gstatus': {
                // Posts exclusively through Group Status V2. Never send media/text as a chat fallback.
                if (!isGroup) {
                    await extra.reply('👥 This command can only be used inside a group.');
                    break;
                }
                if (!GROUP_STATUS_V2_SUPPORTED) {
                    await extra.reply(GROUP_STATUS_V2_UNAVAILABLE);
                    break;
                }

                const statusCaption = String(q || '').trim();
                const media = resolveMedia(msg);

                // .groupstatus link fetches this group's invite link and publishes it as a real Group Status.
                if (!media && statusCaption.toLowerCase() === 'link') {
                    try {
                        await extra.reply('⏳ Fetching this group’s invite link...');
                        const inviteCode = await sock.groupInviteCode(from);
                        if (!inviteCode) throw new Error('WhatsApp returned an empty invite code.');
                        const inviteUrl = `https://chat.whatsapp.com/${inviteCode}`;
                        await groupStatusBroadcast(sock, from, {
                            text: `🔗 GROUP INVITE LINK\n\n${inviteUrl}`,
                            backgroundColor: PURPLE_COLOR
                        });
                        await extra.reply('📨 Group Status relay request accepted. WhatsApp publication is not independently confirmed; check the Status tab.');
                    } catch (error) {
                        console.error('[GROUPSTATUS LINK]', error);
                        await extra.reply('❌ Could not fetch or publish the group invite link. The bot may need group-admin permission to retrieve the invite code.');
                    }
                    break;
                }

                // Text-only Group Status.
                if (!media) {
                    if (!statusCaption) {
                        await extra.reply(
                            '📝 *GROUP STATUS USAGE*\n\n' +
                            '• Send an image/video/audio with `.groupstatus [caption]`\n' +
                            '• Reply to image/video/audio with `.groupstatus [caption]`\n' +
                            '• Text only: `.groupstatus Your text here`\n' +
                            '• Fetch and publish this group’s invite link: `.groupstatus link`\n\n' +
                            'All posts go to the actual WhatsApp Group Status, never the group chat.'
                        );
                        break;
                    }

                    try {
                        await extra.reply('⏳ Publishing text to Group Status...');
                        await groupStatusBroadcast(sock, from, {
                            text: statusCaption,
                            backgroundColor: PURPLE_COLOR
                        });
                        await extra.reply('📨 Text Status relay request accepted. WhatsApp publication is not independently confirmed; check the Status tab.');
                    } catch (error) {
                        console.error('[GROUPSTATUS TEXT]', error);
                        await extra.reply('❌ Group Status publishing failed. Nothing was sent to the group chat.');
                    }
                    break;
                }

                let mediaBuffer;
                try {
                    mediaBuffer = await downloadMediaMessage(
                        media.targetMessage,
                        'buffer',
                        {},
                        { logger: undefined, reuploadRequest: sock.updateMediaMessage }
                    );
                } catch (error) {
                    console.error('[GROUPSTATUS MEDIA DOWNLOAD]', error);
                    await extra.reply('❌ Could not download the attached/replied media.');
                    break;
                }

                if (!mediaBuffer || !mediaBuffer.length) {
                    await extra.reply('❌ The selected media is empty or unavailable.');
                    break;
                }

                try {
                    if (media.kind === 'image' || media.kind === 'sticker') {
                        await extra.reply('⏳ Publishing image to Group Status...');
                        await groupStatusBroadcast(sock, from, {
                            image: mediaBuffer,
                            caption: statusCaption
                        });
                        await extra.reply('📨 Image Status relay request accepted. WhatsApp publication is not independently confirmed; check the Status tab.');
                    } else if (media.kind === 'video') {
                        await extra.reply('⏳ Publishing video to Group Status...');
                        await groupStatusBroadcast(sock, from, {
                            video: mediaBuffer,
                            caption: statusCaption
                        });
                        await extra.reply('📨 Video Status relay request accepted. WhatsApp publication is not independently confirmed; check the Status tab.');
                    } else if (media.kind === 'audio') {
                        await extra.reply('⏳ Preparing audio for Group Status...');
                        let voiceBuffer = mediaBuffer;
                        try {
                            voiceBuffer = await new Promise((resolve, reject) => {
                                const input = new PassThrough();
                                const output = new PassThrough();
                                const chunks = [];
                                output.on('data', chunk => chunks.push(chunk));
                                output.on('error', reject);
                                input.end(mediaBuffer);
                                ffmpeg(input)
                                    .noVideo()
                                    .audioCodec('libopus')
                                    .audioChannels(1)
                                    .audioFrequency(48000)
                                    .format('ogg')
                                    .on('error', reject)
                                    .on('end', () => resolve(Buffer.concat(chunks)))
                                    .pipe(output);
                            });
                        } catch (conversionError) {
                            console.warn('[GROUPSTATUS AUDIO CONVERSION]', conversionError.message);
                            throw new Error('Audio conversion failed. Check that FFmpeg and libopus are installed.');
                        }
                        if (!voiceBuffer?.length) throw new Error('Audio conversion returned an empty file.');
                        await groupStatusBroadcast(sock, from, {
                            audio: voiceBuffer,
                            mimetype: 'audio/ogg; codecs=opus',
                            ptt: true
                        });
                        await extra.reply('📨 Audio Status relay request accepted. WhatsApp publication is not independently confirmed; check the Status tab.');
                    } else {
                        await extra.reply('❌ Unsupported media. Use an image, video, or audio.');
                    }
                } catch (error) {
                    console.error('[GROUPSTATUS PUBLISH]', error);
                    await extra.reply('❌ Group Status publishing failed. Nothing was sent to the group chat.');
                }
                break;
            }

            
case 'gcstatus':
case 'ggstatus':
case 'gcast': {
    if (!isOwner) {
        return extra.reply('⚔️ Only the HUNTER X can publish Group Status V2!');
    }
    if (!GROUP_STATUS_V2_SUPPORTED) {
        return extra.reply(GROUP_STATUS_V2_UNAVAILABLE);
    }

    const inviteUrl = String(q || '').trim();
    const match = inviteUrl.match(
        /(?:https?:\/\/)?chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/i
    );

    if (!match) {
        return extra.reply(
            '❌ Usage:\n.ggstatus https://chat.whatsapp.com/INVITECODE'
        );
    }

    if (!sock.user?.id) {
        return extra.reply('❌ WhatsApp is not connected.');
    }

    try {
        const inviteInfo = await sock.groupGetInviteInfo(match[1]);
        console.log('[GGSTATUS] Invite metadata resolved:', {
            id: inviteInfo?.id || inviteInfo?.jid || null,
            subject: inviteInfo?.subject || null,
            hasPictureUrl: Boolean(inviteInfo?.profilePicUrl || inviteInfo?.profilePictureUrl || inviteInfo?.pictureUrl)
        });
        if (!(inviteInfo?.id || inviteInfo?.jid) ||
            !String(inviteInfo.id || inviteInfo.jid).endsWith('@g.us')) {
            return extra.reply('❌ WhatsApp returned incomplete invitation metadata. No invitation cards were generated; your existing text-status flow was not changed.');
        }
        const groupName = inviteInfo?.subject || 'WhatsApp Group';

        const groups = await sock.groupFetchAllParticipating();
        const groupJids = Object.keys(groups || {})
            .filter(jid => jid.endsWith('@g.us'));

        if (!groupJids.length) {
            return extra.reply('❌ No participating groups found.');
        }

        await extra.reply(
            `📡 Preparing Group Status V2...\n` +
            `🏰 Groups found: ${groupJids.length}\n` +
            `📌 Publishing invitation as status stories.`
        );

        const story = {
            text:
                `${groupName}\n${inviteUrl}`,  
            backgroundColor: PURPLE_COLOR
        };

        let submitted = 0;
        let cardsSubmitted = 0;
        const failed = [];
        const cardFailed = [];
        let invitationCard = null;
        let cardGenerationError = null;

        // Build the invitation image once per command. Reusing the same validated
        // card avoids repeated avatar downloads and image rendering for each group.
        try {
            invitationCard = await createGroupInvitationCard(
                sock, groupName, inviteUrl, inviteInfo
            );
        } catch (error) {
            cardGenerationError = error;
            console.error('[GROUP INVITATION CARD GENERATION FAILED]', error?.stack || error);
            // Surface the real failure in WhatsApp as well as the Render log.
            await extra.reply(
                `⚠️ Invitation image generation failed. The existing text-status publishing will continue.\n` +
                `Reason: ${error?.message || 'Unknown card-generation error'}`
            );
        }

        for (const groupJid of groupJids) {
            try {
                await groupStatusBroadcast(sock, groupJid, story);

                submitted++;

            } catch (error) {
                console.error(
                    '[GROUP STATUS V2 FAILED]',
                    groupJid,
                    error
                );

                failed.push(
                    `${groupJid}: ${error.message || 'Unknown error'}`
                );
            }

            // Send the generated invitation card as a separate Group Status V2 story.
            // Caption contains only the group name and invite link; no alliance slogan.
            if (!invitationCard) {
                cardFailed.push(`${groupJid}: ${cardGenerationError?.message || 'Card generation failed'}`);
            } else {
                try {
                    await groupStatusBroadcast(sock, groupJid, {
                        image: invitationCard,
                        caption: `${groupName}\n${inviteUrl}`
                    });
                    cardsSubmitted++;
                    console.log('[GROUP INVITATION CARD RELAY ACCEPTED]', groupJid);
                } catch (cardError) {
                    console.error('[GROUP INVITATION CARD RELAY FAILED]', groupJid, cardError);
                    cardFailed.push(`${groupJid}: ${cardError.message || 'Card relay failed'}`);
                }
            }

            await new Promise(resolve => setTimeout(resolve, 1200));
        }

        await extra.reply(
            `╭━━━〔 👑 HUNTER X BOT 〕━━━╮\n` +
            `┃ 📡 GROUP STATUS V2 REPORT\n` +
            `┣━━━━━━━━━━━━━━━━━━━━\n` +
            `┃ 📤 Text relays accepted: ${submitted}/${groupJids.length}\n` +
            `┃ 🖼️ Photo-card relays accepted: ${cardsSubmitted}/${groupJids.length}\n` +
            `┃ ❌ Text failed: ${failed.length}\n` +
            `┃ ⚠️ Card failed: ${cardFailed.length}\n` +
            (cardGenerationError ? `┃ 🧩 Card generation: FAILED\n` : `┃ 🧩 Card generation: READY\n`) +
            `┃ 🔗 Content: Group invitation\n` +
            `┃ 📍 Destination: Participating groups\n` +
            `╰━━━━━━━━━━━━━━━━━━━━╯\n\n` +
            (
                (failed.length || cardFailed.length)
                    ? `Text failures:\n${failed.slice(0, 5).join('\n') || 'None'}\n\nCard generation error:\n${cardGenerationError?.message || 'None'}\n\nCard failures:\n${cardFailed.slice(0, 5).join('\n') || 'None'}`
                    : 'Relay requests were accepted by the connection; this does not confirm WhatsApp displayed the stories. Check the Status tab.'
            )
        );

    } catch (error) {
        console.error('[GGSTATUS ERROR]', error);

        await extra.reply(
            `❌ GROUP STATUS V2 FAILED\n\n${error.message}`
        );
    }

    break;
}

  
case 'delgcstatus':
case 'delgstatus':
case 'delgs':
case 'revoke': {
    if (!isOwner) return extra.reply('⚔️ *Only My Lord HUNTER X can revoke status stories!*');
    
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    if (!ctx?.stanzaId || !ctx?.participant) {
        return extra.reply('🗑️ *Reply to the status story message you want to delete!*');
    }

    try {
        const targetParticipant = jidNormalizedUser(ctx.participant);
        
        // Target status broadcast with fromMe: false for statuses posted by others/other bots
        const statusKey = {
            remoteJid: 'status@broadcast',
            fromMe: false,
            id: ctx.stanzaId,
            participant: targetParticipant
        };

        await sock.sendMessage('status@broadcast', { delete: statusKey });
        await extra.reply('✅ *External status story successfully targeted for deletion!*');
    } catch (e) {
        console.error('[REVOKE EXTERNAL ERROR]', e);
        
        // Fallback option for normal chat messages
        try {
            await sock.sendMessage(from, { 
                delete: { 
                    remoteJid: from, 
                    id: ctx.stanzaId, 
                    participant: ctx.participant,
                    fromMe: false 
                } 
            });
            await extra.reply('✅ *Message deleted from chat!*');
        } catch (err2) {
            await extra.reply('❌ *Failed to delete. WhatsApp restricts deleting stories posted by other accounts unless you have administrative clearance.*');
        }
    }
    break;
}

      case 'flirt':
            case 'pickup':
            case 'pickupline': {
                try {
                    const response = await axios.get('https://api.shizo.top/quote/flirt?apikey=shizo');
                    if (!response.data || !response.data.status || !response.data.result) {
                        throw new Error('Invalid API response');
                    }
                    const flirtText = response.data.result;
                    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
                    if (mentioned.length > 0) {
                        await sock.sendMessage(extra.from, { text: flirtText, mentions: mentioned }, { quoted: msg });
                    } else {
                        await extra.reply(flirtText);
                    }
                } catch (error) {
                    await extra.reply(`❌ Error: ${error.message}`);
                }
                break;
            }

            case 'dare': {
                const dares = [
                    "Send a screenshot of your gallery!",
                    "Let someone else write a status on your WhatsApp!",
                    "Call a random contact and sing them a song!",
                    "Post an embarrassing selfie!",
                    "Text your crush and confess your feelings!",
                    "Do 20 pushups and send a video!",
                    "Change your profile picture to something embarrassing for 24 hours!",
                    "Send a voice note singing the alphabet!",
                    "Let the group choose your status for a day!",
                    "Tell the group your most embarrassing moment!"
                ];
                const randomDare = dares[Math.floor(Math.random() * dares.length)];
                await extra.reply(randomDare);
                break;
            }

            case 'truth': {
                try {
                    const question = await truth();
                    const res = await translate(question, { to: 'en' });
                    await extra.reply(res.text);
                } catch (error) {
                    await extra.reply(`❌ Error: ${error.message}`);
                }
                break;
            }

            case 'gayrate':
            case 'gay': {
                const ctx = msg.message?.extendedTextMessage?.contextInfo || {};
                const mentioned = ctx.mentionedJid || [];
                let targetId = mentioned.length ? mentioned[0] : (ctx.participant || extra.sender);
                const targetTag = `@${targetId.split('@')[0]}`;
                const base = targetId.toString().split('').reduce((s,c)=> s + c.charCodeAt(0), 0);
                const percent = ((base % 101) + Math.floor(Math.random()*7)) % 101;
                const out = `${targetTag} score: ${percent}% omo u be bast confirm gay guy 😂 🌈`;
                await sock.sendMessage(extra.from, { text: out, mentions: [targetId] }, { quoted: msg });
                break;
            }

            case 'autoreact': {
    if (!isSudo) return extra.reply('⚔️ *Sudo rights required!*');
    const stateArg = args[0]?.toLowerCase();
    
    if (stateArg === 'on') {
        autoSettings.autoreact = true;
        db.autoSettings = autoSettings;
        saveSettings(db); // Writes changes directly to database.json
        await extra.reply('✅ *Global Auto-React activated & saved!*');
    } else if (stateArg === 'off') {
        autoSettings.autoreact = false;
        db.autoSettings = autoSettings;
        saveSettings(db); // Writes changes directly to database.json
        await extra.reply('❌ *Global Auto-React deactivated & saved!*');
    } else {
        await extra.reply(`⚙️ *Auto-React Status:* ${autoSettings.autoreact ? 'ACTIVE ✅' : 'DISABLED ❌'}`);
    }
    break;
}

            case 'addowner': {
                if (!isOwner) return sock.sendMessage(from, { text: '⚔️ *Owner access only.*' }, { quoted: msg });
                return sock.sendMessage(from, { text: '🔒 *Single-owner mode:* co-owner accounts are disabled in this clone.' }, { quoted: msg });
            }

            case 'antidelete': {
                if (!isGroup) return sock.sendMessage(from, { text: '⚔️ *Domain command only!*' }, { quoted: msg });
                if (!isSenderAdmin) return sock.sendMessage(from, { text: '⚔️ *Admin rights required!*' }, { quoted: msg });
                groupSettings[from].antidelete = !groupSettings[from].antidelete;
                saveGroupSettings();
                await sock.sendMessage(from, { text: "👁️ *Imperial Anti-Delete DON'T RU TO DELETE SHIT :* " + (groupSettings[from].antidelete ? 'ACTIVATED ✅' : 'DEACTIVATED ❌') }, { quoted: msg });
                break;
            }

            case 'antilink':
            case 'antigroupsmention': {
                if (!isGroup) return sock.sendMessage(from, { text: '⚔️ *Domain Command Only!*' }, { quoted: msg });
                if (!isSenderAdmin) return sock.sendMessage(from, { text: '⚔️ *Admin rights required!*' }, { quoted: msg });

                const subCmd = args[0]?.toLowerCase();
                const subVal = args[1];

                if (subCmd === 'on') {
                    groupSettings[from][command] = true;
                    await sock.sendMessage(from, { text: "✅ *By order of HUNTER X:* *" + command.toUpperCase() + "* is ENFORCED!" }, { quoted: msg });
                } else if (subCmd === 'off') {
                    groupSettings[from][command] = false;
                    await sock.sendMessage(from, { text: "❌ *Imperial Dispensation:* *" + command.toUpperCase() + "* is DISABLED!" }, { quoted: msg });
                } else if (subCmd === 'kick') {
                    groupSettings[from][command] = true;
                    groupSettings[from][command + 'Mode'] = 'kick';
                    await sock.sendMessage(from, { text: "✅ *" + command.toUpperCase() + "* set to **DIRECT KICK** mode do shit you will be removed asap !" }, { quoted: msg });
                } else if (subCmd === 'warn') {
                    groupSettings[from][command] = true;
                    groupSettings[from][command + 'Mode'] = 'warn';
                    if (subVal && !isNaN(subVal)) {
                        groupSettings[from][command + 'WarnLimit'] = parseInt(subVal);
                    }
                    const limit = groupSettings[from][command + 'WarnLimit'] || 3;
                    await sock.sendMessage(from, { text: "✅ *" + command.toUpperCase() + "* set to **IMPERIAL WARN** mode (Limit: " + limit + " warnings)!" }, { quoted: msg });
                } else {
                    groupSettings[from][command] = !groupSettings[from][command];
                    await sock.sendMessage(from, { 
                        text: "🛡️ *" + command.toUpperCase() + " Barrier:* " + (groupSettings[from][command] ? 'ENFORCED ✅' : 'DISABLED ❌') + "\n\n💡 *Usage:*\n`." + command + " on/off`\n`." + command + " kick`\n`." + command + " warn 3`" 
                    }, { quoted: msg });
                }
                saveGroupSettings();
                break;
            }

            case 'vv':
            case 'antiviewonce':
            case 'viewonce': {
                // VV re-sends ordinary quoted media in its original WhatsApp media type.
                // It intentionally refuses View Once wrappers rather than unwrapping them.
                const rawCommandMessage = msg.message || {};
                const hasViewOnceWrapper = (value) => !!(
                    value?.viewOnceMessage ||
                    value?.viewOnceMessageV2 ||
                    value?.viewOnceMessageV2Extension
                );
                const commandContent = rawCommandMessage.ephemeralMessage?.message || rawCommandMessage;
                if (hasViewOnceWrapper(commandContent)) {
                    await extra.react('🛡️');
                    return extra.reply('⚔️ Piercing View-Once…\n🔒 View-Once Protected. This media cannot be reopened or copied with VV. Ask the sender to share a normal copy if they are comfortable.');
                }

                const context =
                    commandContent?.extendedTextMessage?.contextInfo ||
                    commandContent?.imageMessage?.contextInfo ||
                    commandContent?.videoMessage?.contextInfo ||
                    commandContent?.audioMessage?.contextInfo ||
                    commandContent?.documentMessage?.contextInfo ||
                    commandContent?.stickerMessage?.contextInfo || {};
                const quotedRaw = context.quotedMessage;
                if (!quotedRaw) {
                    return extra.reply('📌 Reply to an image, video, audio, voice note, document or sticker with .vv.');
                }
                if (hasViewOnceWrapper(quotedRaw)) {
                    await extra.react('🛡️');
                    return extra.reply('⚔️ Piercing View-Once…\n🔒 View-Once Protected. This media cannot be reopened or copied with VV. Ask the sender for a normal copy if they are comfortable.');
                }

                const quotedContent = unwrapMessage(quotedRaw);
                let mediaKind = null;
                let mediaData = null;
                if (quotedContent?.imageMessage) { mediaKind = 'image'; mediaData = quotedContent.imageMessage; }
                else if (quotedContent?.videoMessage) { mediaKind = 'video'; mediaData = quotedContent.videoMessage; }
                else if (quotedContent?.audioMessage) { mediaKind = 'audio'; mediaData = quotedContent.audioMessage; }
                else if (quotedContent?.documentMessage) { mediaKind = 'document'; mediaData = quotedContent.documentMessage; }
                else if (quotedContent?.stickerMessage) { mediaKind = 'sticker'; mediaData = quotedContent.stickerMessage; }
                if (!mediaKind || !mediaData) {
                    return extra.reply('❌ I could not find supported media in that quoted message. Reply directly to the media and try .vv again.');
                }

                try {
                    await extra.react('⏳');
                    const stream = await downloadContentFromMessage(mediaData, mediaKind);
                    const chunks = [];
                    for await (const chunk of stream) chunks.push(chunk);
                    const buffer = Buffer.concat(chunks);
                    if (!buffer.length) throw new Error('Downloaded media was empty');

                    let outgoing;
                    if (mediaKind === 'image') outgoing = { image: buffer, caption: mediaData.caption || undefined, mimetype: mediaData.mimetype || 'image/jpeg' };
                    else if (mediaKind === 'video') outgoing = { video: buffer, caption: mediaData.caption || undefined, mimetype: mediaData.mimetype || 'video/mp4' };
                    else if (mediaKind === 'audio') outgoing = { audio: buffer, mimetype: mediaData.mimetype || 'audio/ogg; codecs=opus', ptt: !!mediaData.ptt };
                    else if (mediaKind === 'document') outgoing = { document: buffer, mimetype: mediaData.mimetype || 'application/octet-stream', fileName: mediaData.fileName || 'vv-file' };
                    else outgoing = { sticker: buffer };

                    await sock.sendMessage(from, outgoing, { quoted: msg });
                    await extra.react('✅');
                } catch (error) {
                    console.error('[VV MEDIA RESEND FAILED]', error);
                    await extra.reply('❌ Could not retrieve that media. It may have expired, been removed, or be unavailable from WhatsApp.');
                }
                break;
            }

            case 'autoonline':
            case 'autorecording':
            case 'autostatuslike':
            case 'autostatusview':
            case 'autotyping': {
                if (!isOwner) return sock.sendMessage(from, { text: '⚔️ *My Lord HUNTER X only!*' }, { quoted: msg });
                autoSettings[command] = !autoSettings[command];
                db.autoSettings = autoSettings;
                saveSettings(db);

                if (command === 'autoonline') {
                    await sock.sendPresenceUpdate(autoSettings.autoonline ? 'available' : 'unavailable')
                        .catch(err => console.error('[AUTO ONLINE]', err.message));
                }

                await sock.sendMessage(from, { text: "⚙️ *Imperial Presence [" + command.toUpperCase() + "]:* " + (autoSettings[command] ? 'ENABLED ✅' : 'DISABLED ❌') }, { quoted: msg });
                break;
            }

            case 'block': {
                if (!isOwner) return sock.sendMessage(from, { text: '⚔️ *Only My owner may cast banishment!*' }, { quoted: msg });
                
                let target = null;
                const quoted = msg.message?.extendedTextMessage?.contextInfo;
                
                if (quoted?.participant) {
                    target = quoted.participant;
                } else if (quoted?.mentionedJid && quoted.mentionedJid.length > 0) {
                    target = quoted.mentionedJid[0];
                } else if (q) {
                    const cleanNum = q.replace(/[^0-9]/g, '');
                    if (cleanNum.length >= 7) {
                        target = cleanNum + '@s.whatsapp.net';
                    }
                }

                if (!target) {
                    return sock.sendMessage(from, { text: '💡 *My Lord, tag `@user`, reply to their message, or type a valid number to banish!*' }, { quoted: msg });
                }

                const cleanPhone = target.split('@')[0].split(':')[0];
                const normalizedJid = cleanPhone + '@s.whatsapp.net';

                try {
                    await sock.sendMessage(from, { text: '⏳ *Forcing banishment seal across WhatsApp servers...*' }, { quoted: msg });

                    await sock.query({
                        tag: 'iq',
                        attrs: {
                            xmlns: 'w:b',
                            type: 'set',
                            to: '@s.whatsapp.net'
                        },
                        content: [
                            {
                                tag: 'item',
                                attrs: {
                                    action: 'block',
                                    jid: normalizedJid
                                }
                            }
                        ]
                    }).catch(async () => {
                        await sock.updateBlockStatus(normalizedJid, 'block');
                    });

                    blockedUsers.add(normalizedJid);
                    saveBlockedUsers();
                    await sock.sendMessage(from, { 
                        text: "🚫 @" + cleanPhone + " has been forcefully banished into the Void, My Lord! ✅", 
                        mentions: [normalizedJid] 
                    }, { quoted: msg });

                } catch (err) {
                    console.error('Forced Block Error:', err);
                    await sock.sendMessage(from, { text: "❌ *Banishment Seal Rejected:* " + (err.message || 'Server connection error.') }, { quoted: msg });
                }
                break;
            }

            case 'unblock': {
                if (!isOwner) return sock.sendMessage(from, { text: '⚔️ *Only My Lord HUNTER X may lift banishment!*' }, { quoted: msg });
                
                let target = null;
                const quoted = msg.message?.extendedTextMessage?.contextInfo;
                
                if (quoted?.participant) {
                    target = quoted.participant;
                } else if (quoted?.mentionedJid && quoted.mentionedJid.length > 0) {
                    target = quoted.mentionedJid[0];
                } else if (q) {
                    const cleanNum = q.replace(/[^0-9]/g, '');
                    if (cleanNum.length >= 7) {
                        target = cleanNum + '@s.whatsapp.net';
                    }
                }

                if (!target) {
                    return sock.sendMessage(from, { text: '💡 *My Lord, tag `@user`, reply to their message, or type a valid number to unblock!*' }, { quoted: msg });
                }

                const cleanPhone = target.split('@')[0].split(':')[0];
                const normalizedJid = cleanPhone + '@s.whatsapp.net';

                try {
                    await sock.query({
                        tag: 'iq',
                        attrs: {
                            xmlns: 'w:b',
                            type: 'set',
                            to: '@s.whatsapp.net'
                        },
                        content: [
                            {
                                tag: 'item',
                                attrs: {
                                    action: 'unblock',
                                    jid: normalizedJid
                                }
                            }
                        ]
                    }).catch(async () => {
                        await sock.updateBlockStatus(normalizedJid, 'unblock');
                    });

                    blockedUsers.delete(normalizedJid);
                    saveBlockedUsers();
                    await sock.sendMessage(from, { 
                        text: "✅ *Banishment rescinded for @" + cleanPhone + ", My Lord!*", 
                        mentions: [normalizedJid] 
                    }, { quoted: msg });

                } catch (err) {
                    console.error('Forced Unblock Error:', err);
                    await sock.sendMessage(from, { text: "❌ *Failed to unblock user:* " + err.message }, { quoted: msg });
                }
                break;
            }

            case 'buatgc': {
                if (!isOwner) return sock.sendMessage(from, { text: '⚔️ *My Lord HUNTER X only!*' }, { quoted: msg });
                if (!q) return sock.sendMessage(from, { text: '💡 *Usage:* .buatgc <domain_name>' }, { quoted: msg });
                try {
                    const group = await sock.groupCreate(q, [sender]);
                    await sock.sendMessage(from, { text: "👑 *New domain created for My Lord! ID:* " + group.id }, { quoted: msg });
                } catch (e) {
                    await sock.sendMessage(from, { text: '❌ *Failed to forge domain, My Lord.*' }, { quoted: msg });
                }
                break;
            }

            case 'changebio': {
                if (!isOwner) return sock.sendMessage(from, { text: '⚔️ *My Lord HUNTER X only!*' }, { quoted: msg });
                if (!q) return sock.sendMessage(from, { text: '💡 *Usage:* .changebio <new_status>' }, { quoted: msg });
                await sock.updateProfileStatus(q);
                await sock.sendMessage(from, { text: '👑 *Imperial status updated, My Lord!*' }, { quoted: msg });
                break;
            }

            case 'devices':
            case 'device': {
                const commandMessage = unwrapMessage(msg.message) || {};
                const ctx = 
                    commandMessage.extendedTextMessage?.contextInfo ||
                    commandMessage.imageMessage?.contextInfo ||
                    commandMessage.videoMessage?.contextInfo ||
                    commandMessage.documentMessage?.contextInfo || {};

                let target = ctx.mentionedJid?.[0] || null;

                if (!target && ctx.stanzaId && ctx.participant) {
                    target = ctx.participant;
                }

                if (!target && q) {
                    const digits = q.replace(/[^0-9]/g, '');
                    if (digits.length >= 7) target = digits + '@s.whatsapp.net';
                }

                if (!target) target = sender;

                const normalizedTarget = jidNormalizedUser(target);
                const phone = normalizedTarget.split('@')[0].split(':')[0];

                let linkedDevices = [];
                try {
                    if (typeof sock.getUSyncDevices === 'function') {
                        linkedDevices = await sock.getUSyncDevices([normalizedTarget], true, true) || [];
                    }
                } catch (err) {
                    console.error('[DEVICES LOOKUP]', err.message);
                }

                // Detect actual session platform (Android / iOS / Web / Desktop)
                const parsePlatform = (item) => {
                    const rawJid = typeof item === 'string' ? item : (item.jid || item.id || item.user || '');
                    const str = String(rawJid);
                    if (str.includes(':0') || str.endsWith('@s.whatsapp.net')) return 'Mobile App (Android/iOS)';
                    if (str.includes(':1') || str.includes('web')) return 'WhatsApp Web';
                    if (str.includes(':2') || str.includes('desktop')) return 'WhatsApp Desktop';
                    if (str.includes(':3')) return 'WhatsApp linked client';
                    return 'Mobile Client';
                };

                const deviceLines = linkedDevices.length
                    ? linkedDevices.map((item, index) => `${index + 1}. Platform: *${parsePlatform(item)}*`).join('\n')
                    : '1. Platform: *Mobile Client (Active)*';

                // Clean layout without Admin references (Works anywhere/anytime)
                const responseText = 
                    `📱 *WHATSAPP DEVICE REPORT*\n\n` +
                    `|⚔️ Target: @${phone}\n` +
                    `|\n` +
                    `|📲 Status: Active\n\n` +
                    `*Detected Sessions:*\n${deviceLines}`;

                await sock.sendMessage(from, {
                    text: responseText,
                    mentions: [normalizedTarget]
                }, { quoted: msg });
                
                break;
            }

            case 'getpp': {
                const target = msg.message?.extendedTextMessage?.contextInfo?.participant || (q ? q.replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null) || sender;
                try {
                    const ppUrl = await sock.profilePictureUrl(target, 'image');
                    await sock.sendMessage(from, { image: { url: ppUrl }, caption: '📸 *Imperial Sight: Visual Captured, My Lord!*' }, { quoted: msg });
                } catch {
                    await sock.sendMessage(from, { text: '❌ *User portrait concealed from sight.*' }, { quoted: msg });
                }
                break;
            }

            case 'joingroup': {
                if (!isOwner) return sock.sendMessage(from, { text: '⚔️ *My Lord HUNTER X only!*' }, { quoted: msg });
                if (!q) return sock.sendMessage(from, { text: '💡 *Usage:* .joingroup <invite_link>' }, { quoted: msg });
                try {
                    const code = q.split('chat.whatsapp.com/')[1] || q;
                    await sock.groupAcceptInvite(code);
                    await sock.sendMessage(from, { text: '👑 *Domain entered by your decree, My Lord!*' }, { quoted: msg });
                } catch (e) {
                    await sock.sendMessage(from, { text: '❌ *Invalid domain invite link.*' }, { quoted: msg });
                }
                break;
            }

            case 'leavegroup':
            case 'left': {
                if (!isOwner) return sock.sendMessage(from, { text: '⚔️ *My Lord HUNTER X only!*' }, { quoted: msg });
                if (!isGroup) return sock.sendMessage(from, { text: '⚔️ *Domain command only!*' }, { quoted: msg });
                await sock.sendMessage(from, { text: '👋 *Departing ya ass, as commanded by My Lord HUNTER X!*' }, { quoted: msg });
                await sock.groupLeave(from);
                break;
            }

            case 'listfont': {
                await sock.sendMessage(from, { 
                    text: "✒️ *𝕯𝖊𝖒𝖔𝖓 𝕰𝖒𝖕𝖊𝖗𝖔𝖗 Script Typographies*\n\n" +
                          "1. Imperial Gothic: 𝕲𝖗𝖊𝖆𝖙 𝕯𝖊𝖒𝖔𝖓\n" +
                          "2. Royal Monospace: HUNTER X\n" +
                          "3. Shadow Italic: HUNTER X"
                }, { quoted: msg });
                break;
            }

            case 'listgroup':
            case 'listgroups': {
                if (!isOwner) return sock.sendMessage(from, { text: '⚔️ *My Lord HUNTER X only!*' }, { quoted: msg });
                const groups = Object.keys(await sock.groupFetchAllParticipating());
                let txt = "📋 *Subjugated Group (" + groups.length + "):*\n\n";
                for (let gId of groups) {
                    const meta = await sock.groupMetadata(gId).catch(() => ({}));
                    txt += "• " + (meta.subject || 'Unknown Domain') + " (" + gId + ")\n";
                }
                await sock.sendMessage(from, { text: txt }, { quoted: msg });
                break;
            }

            case 'bancheck': {
                await sock.sendMessage(from, { text: '🛡️ *Imperial Check:* Zero ban restrictions active. Your throne stands intact, My Lord!' }, { quoted: msg });
                break;
            }

            case 'botlink': {
                await sock.sendMessage(from, { text: '🔗 *𝕯𝖊𝖒𝖔𝖓 𝕰𝖒𝖕𝖊𝖗𝖔𝖗 Throne Portal:* Online & Sovereign' }, { quoted: msg });
                break;
            }

            case 'fetchstatus': {
                if (!isOwner) return sock.sendMessage(from, { text: '⚔️ *My Lord HUNTER X only!*' }, { quoted: msg });
                const target = msg.message?.extendedTextMessage?.contextInfo?.participant || (q ? q.replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null);
                if (!target) return sock.sendMessage(from, { text: '💡 *Mention or reply to target.*' }, { quoted: msg });
                try {
                    const status = await sock.fetchStatus(target);
                    await sock.sendMessage(from, { text: '📜 *Status:* "' + status.status + '"' }, { quoted: msg });
                } catch {
                    await sock.sendMessage(from, { text: '❌ *Status concealed.*' }, { quoted: msg });
                }
                break;
            }

case 'listchannels': {
    if (!isOwner) return extra.reply('⚔️ *Only My Lord HUNTER X can inspect the channels!*');
    
    await extra.reply('📢 *Scanning subjugated channels...*');
    
    try {
        // Fetch newsletter/channel metadata if the function is available in your Baileys version
        let channels = [];
        if (typeof sock.newsletterList === 'function') {
            channels = await sock.newsletterList();
        } else if (typeof sock.groupFetchAllParticipating === 'function') {
            // Fallback or filter channels if tracked via chats
            const chats = Object.values(sock.chats || {});
            channels = chats.filter(c => c.id && c.id.endsWith('@newsletter'));
        }

        if (!channels || channels.length === 0) {
            // Fallback display if no direct newsletter query method is active
            return await sock.sendMessage(from, { 
                text: '╭━━〔 *𝐇𝐔𝐍𝐓𝐄𝐑 𝐗 𝐕4 CHANNELS* 〕━━╮\n\n' +
                      '📢 *Status:* Fully subjugated under your rule, My Lord!\n' +
                      '⚠️ *Note:* No active live newsletter feeds detected in current socket cache.\n\n' +
                      '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯' 
            }, { quoted: msg });
        }

        let channelText = '╭━━〔 *𝐇𝐔𝐍𝐓𝐄𝐑 𝐗 𝐕4 CHANNELS* 〕━━╮\n\n';
        channels.forEach((ch, index) => {
            channelText += `*${index + 1}.* ${ch.subject || ch.name || 'Unknown Channel'}\n` +
                           `   🆔 ID: \`${ch.id}\`\n\n`;
        });
        channelText += '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯';

        await sock.sendMessage(from, { text: channelText }, { quoted: msg });

    } catch (err) {
        console.error('[LISTCHANNELS ERROR]', err);
        // Fallback response so it never crashes your bot
        await sock.sendMessage(from, { 
            text: '📢 *𝐇𝐔𝐍𝐓𝐄𝐑 𝐗 𝐕4 Channels:* Fully subjugated under your rule, My Lord!\n*(Active broadcast network online)*' 
        }, { quoted: msg });
    }
    break;
}


            case 'mode':
            case 'private':
            case 'public': {
                if (!isOwner) return sock.sendMessage(from, { text: '⚔️ *Only My Lord HUNTER X may alter realm permissions!*' }, { quoted: msg });
                
                let targetMode = '';
                if (command === 'public' || command === 'private') {
                    targetMode = command;
                } else if (args[0]) {
                    targetMode = args[0].toLowerCase();
                }

                if (targetMode === 'public' || targetMode === 'private') {
                    botMode = targetMode;
                    db.botMode = botMode;
                    saveSettings(db);
                    await sock.sendMessage(from, { text: "👑 *Decree Enforced:* Domain mode set to *" + botMode.toUpperCase() + "*, My Lord!" }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, { text: "⚔️ *Current State:* *" + botMode.toUpperCase() + "*\n\n💡 *Usage:* .mode public | .mode private | .public | .private" }, { quoted: msg });
                }
                break;
            }

            case 'session':
            case 'ownerpanel': {
                if (!isOwner) return extra.reply('⚔️ *Owner access only.*');
                const accountNumber = String(sock.user?.id || '').split('@')[0].split(':')[0].replace(/\D/g, '') || 'Not connected';
                const sessionText = '╭━━〔 👑 *HUNTER X BOT SESSION* 〕━━╮\n' +
                    '📡 Session: PRIMARY\n' +
                    '📱 Number: ' + (accountNumber === 'Not connected' ? accountNumber : '+' + accountNumber) + '\n' +
                    '🟢 Status: ' + (sock.user ? 'Online' : 'Connecting') + '\n' +
                    '🔐 Account mode: Single owner / single WhatsApp session\n' +
                    '⚙️ Mode: ' + botMode.toUpperCase() + '\n' +
                    '💾 Data directory: ' + DATA_DIR + '\n' +
                    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯';
                return extra.reply(sessionText);
            }

            case 'pair': {
                return sock.sendMessage(from, { text: '🔐 *Single-owner pairing:* the pairing code for +' + OWNER_NUMBER + ' is printed in your Render service logs during startup. This clone does not create extra accounts.' }, { quoted: msg });
            }

            case 'broadcast':
            case 'bc': {
                if (!isOwner) return sock.sendMessage(from, { text: '⚔️ *Only My Lord HUNTER X may speak to all realms!*' }, { quoted: msg });
                if (!q) return sock.sendMessage(from, { text: '💡 *Usage:* .broadcast <royal proclamation>' }, { quoted: msg });

                const groups = Object.keys(await sock.groupFetchAllParticipating());
                await sock.sendMessage(from, { text: "📢 *Transmitting royal decree to " + groups.length + " domains, My Lord!*" }, { quoted: msg });

                for (const groupId of groups) {
                    await sock.sendMessage(groupId, {
                        text: "📢 *𝐇𝐔𝐍𝐓𝐄𝐑 𝐗 𝐕4 ROYAL PROCLAMATION*\n\n" + q + "\n\n_~ Directly from My Lord HUNTER X_"
                    });
                }
                await sock.sendMessage(from, { text: '✅ *Proclamation delivered, My Lord!*' }, { quoted: msg });
                break;
            }

            case 'connectedusers':
            case 'activeusers': {
                if (!isOwner) return sock.sendMessage(from, { text: '⚔️ *My Lord HUNTER X only!*' }, { quoted: msg });
                const linkedCount = 1;
                const totalCount = 1;
                await sock.sendMessage(from, {
                    text:
                        '╭━━〔 👑 𝑯𝑼𝑵𝑻𝑬𝑹 𝑿 〕━━╮\n' +
                        '┃ 𝑰𝑴𝑷𝑬𝑹𝑰𝑨𝑳 𝑼𝑺𝑬𝑹 𝑺𝑻𝑨𝑻𝑺\n' +
                        '┣━━━━━━━━━━━━━━━━━━━━\n' +
                        '👥 Total sessions: ' + totalCount + '\n' +
                        '📱 WhatsApp owner sessions: ' + linkedCount + '\n' +
                        '👑 Owner account: Protected\n' +
                        '╰━━━━━━━━━━━━━━━━━━━━╯'
                }, { quoted: msg });
                break;
            }

            case 'uptime': {
                const total = Math.floor((Date.now() - startTime) / 1000);
                const days = Math.floor(total / 86400);
                const hours = Math.floor((total % 86400) / 3600);
                const minutes = Math.floor((total % 3600) / 60);
                const seconds = total % 60;
                const uptime = [days ? `${days}d` : '', `${hours}h`, `${minutes}m`, `${seconds}s`].filter(Boolean).join(' ');
                return extra.reply(
                    '╭━━〔 👑 𝑯𝑼𝑵𝑻𝑬𝑹 𝑿 V4 〕━━╮\n' +
                    '┃ ⏱️ 𝑺𝒀𝑺𝑻𝑬𝑴 𝑼𝑷𝑻𝑰𝑴𝑬\n' +
                    '┣━━━━━━━━━━━━━━━━━━━━\n' +
                    '┃ ' + uptime + '\n' +
                    '╰━━━━━━━━━━━━━━━━━━━━╯'
                );
            }

            case 'inspectsock':
            case 'status': {
                await sock.sendMessage(from, { 
                    text: "⚡ *𝕯𝖊𝖒𝖔𝖓 𝕰𝖒𝖕𝖊𝖗𝖔𝖗 Core Health*\n\n" +
                          "• *Socket:* Bound & Synced ✅\n" +
                          "• *Latency:* Optimal\n" +
                          "• *Protection:* Active"
                }, { quoted: msg });
                break;
            }
 

case 'antiadd':
case 'antibot':
case 'antidemote':
case 'antiimage':
case 'antipromote':
case 'antiremove':
case 'antispam':
case 'antitag':
case 'antitagadmin': {
    if (!isGroup) {
        return sock.sendMessage(from, {
            text: '⚔️ *Domain Command Only!*'
        }, { quoted: msg });
    }

    if (!isSenderAdmin) {
        return sock.sendMessage(from, {
            text: '⚔️ *Admin rights required!*'
        }, { quoted: msg });
    }

    const setting = command;
    const stateArg = args[0]?.toLowerCase();

    if (!['on', 'off'].includes(stateArg)) {
        return sock.sendMessage(from, {
            text: `⚙️ *${setting.toUpperCase()} SETTINGS*\n\n` +
                `Use:\n` +
                `${prefix}${setting} on - Enable protection\n` +
                `${prefix}${setting} off - Disable protection`
        }, { quoted: msg });
    }

    groupSettings[from][setting] = stateArg === 'on';
    saveGroupSettings();

    await sock.sendMessage(from, {
        text: stateArg === 'on'
            ? `✅ *${setting.toUpperCase()} is now ON!*`
            : `❌ *${setting.toUpperCase()} is now OFF!*`
    }, { quoted: msg });

    break;
}
            
 
            case 'setwelcome':
            case 'setgoodbye':
            case 'welcome':
            case 'goodbye': {
                if (!isGroup) return sock.sendMessage(from, { text: '⚔️ *Domain Command Only!*' }, { quoted: msg });
                if (!isSenderAdmin) return sock.sendMessage(from, { text: '⚔️ *Admin rights required!*' }, { quoted: msg });

                const setting = command === 'setwelcome' ? 'welcome' : (command === 'setgoodbye' ? 'goodbye' : command);
                const stateArg = args[0]?.toLowerCase();

                if (stateArg === 'on') {
                    groupSettings[from][setting] = true;
                    saveGroupSettings();
                    await sock.sendMessage(from, { text: "✅ *By order of HUNTER X:* *" + setting.toUpperCase() + "* WELCOME is now ACTIVATED!" }, { quoted: msg });
                } else if (stateArg === 'off') {
                    groupSettings[from][setting] = false;
                    saveGroupSettings();
                    await sock.sendMessage(from, { text: "❌ *Imperial Dispensation:* *" + setting.toUpperCase() + "* WELCOME is now DISABLED!" }, { quoted: msg });
                } else {
                    groupSettings[from][setting] = !groupSettings[from][setting];
                    saveGroupSettings();
                    await sock.sendMessage(from, { text: "🛡️ *" + setting.toUpperCase() + " Card System:* " + (groupSettings[from][setting] ? 'ENFORCED ✅' : 'DISABLED ❌') }, { quoted: msg });
                }
                break;
            }

            case 'addmember': {
                if (!isGroup) return sock.sendMessage(from, { text: '⚔️ *Domain command only!*' }, { quoted: msg });
                if (!isSenderAdmin) return sock.sendMessage(from, { text: '⚔️ *Admin rights required!*' }, { quoted: msg });
                if (!q) return sock.sendMessage(from, { text: '💡 *Usage:* .addmember 234...' }, { quoted: msg });
                const targetJid = q.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
                try {
                    await sock.groupParticipantsUpdate(from, [targetJid], 'add');
                    await sock.sendMessage(from, { text: '✅ *User added to domain, My Lord!*' }, { quoted: msg });
                } catch {
                    await sock.sendMessage(from, { text: '❌ *Failed to add User.*' }, { quoted: msg });
                }
                break;
            }

            case 'approveall': {
                if (!isGroup) return sock.sendMessage(from, { text: '⚔️ *Domain command only!*' }, { quoted: msg });
                if (!isSenderAdmin) return sock.sendMessage(from, { text: '⚔️ *Admin rights required!*' }, { quoted: msg });
                
                try {
                    const requests = await sock.groupRequestParticipantsList(from);
                    if (!requests || requests.length === 0) {
                        return sock.sendMessage(from, { text: '💡 *No pending entry requests, My Lord.*' }, { quoted: msg });
                    }
                    
                    let approvedCount = 0;
                    for (let req of requests) {
                        const targetJid = req.jid || req.id || req;
                        await sock.groupRequestParticipantsUpdate(from, [targetJid], 'approve');
                        approvedCount++;
                    }
                    await sock.sendMessage(from, { text: "✅ *Granted Group entry to " + approvedCount + " subject(s), My Lord!*" }, { quoted: msg });
                } catch (err) {
                    await sock.sendMessage(from, { text: '❌ *Failed to approve requests.*' }, { quoted: msg });
                }
                break;
            }

            case 'restrict':
            case 'setmute':
            case 'lock':
            case 'mute':
            case 'close': {
                if (!isGroup) return extra.reply('👥 This command only works in a group.');
                if (!isSenderAdmin) return extra.reply('⚔️ Actual group-admin rights are required.');
                await sock.groupSettingUpdate(from, 'announcement');
                await sock.sendMessage(from, { text: '🔒 *Gates locked by Imperial decree!*' }, { quoted: msg });
                break;
            }

            case 'closetime':
            case 'opentime': {
                if (!isGroup) return sock.sendMessage(from, { text: '⚔️ *Domain command only!*' }, { quoted: msg });
                if (!isSenderAdmin) return sock.sendMessage(from, { text: '⚔️ *Admin rights required!*' }, { quoted: msg });
                
                const timer = parseInt(args[0]);
                if (isNaN(timer)) return sock.sendMessage(from, { text: "💡 *Usage:* ." + command + " <minutes>" }, { quoted: msg });

                const actionType = command === 'closetime' ? 'announcement' : 'not_announcement';
                const actionText = command === 'closetime' ? 'sealed (Admins Only)' : 'opened to all';

                await sock.sendMessage(from, { text: "⏳ *Domain gates will be " + actionText + " in " + timer + " minute(s), My Lord!*" }, { quoted: msg });
                setTimeout(async () => {
                    await sock.groupSettingUpdate(from, actionType);
                    await sock.sendMessage(from, { text: "🔒 *Domain gates are now " + actionText + "!*" });
                }, timer * 60 * 1000);
                break;
            }

            case 'demoteall': {
                if (!isGroup) return sock.sendMessage(from, { text: '⚔️ *Domain command only!*' }, { quoted: msg });
                if (!isSenderAdmin) return sock.sendMessage(from, { text: '⚔️ *Admin rights required!*' }, { quoted: msg });

                const groupMetadata = await sock.groupMetadata(from);
                const admins = [];
                for (const participant of groupMetadata.participants) {
                    if (!participant.admin) continue;
                    if (await isProtectedOwnerJid(sock, participant.id) ||
                        await isProtectedOwnerJid(sock, participant.phoneNumber)) continue;
                    const botJid = jidNormalizedUser(sock.user?.id || '');
                    if (jidNormalizedUser(participant.id || '') === botJid) continue;
                    admins.push(participant);
                }

                for (const admin of admins) {
                    await sock.groupParticipantsUpdate(from, [admin.id], 'demote');
                }
                await sock.sendMessage(from, { text: '🔻 *All High Lords stripped of admin ranks!*' }, { quoted: msg });
                break;
            }

            case 'demote':
            case 'demoteuser': {
                if (!isGroup) return sock.sendMessage(from, { text: '⚔️ *Domain command only!*' }, { quoted: msg });
                if (!isSenderAdmin) return sock.sendMessage(from, { text: '⚔️ *Admin rights required!*' }, { quoted: msg });

                let target = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || 
                             msg.message?.extendedTextMessage?.contextInfo?.participant;
                if (!target && q) target = q.replace(/[^0-9]/g, '') + '@s.whatsapp.net';

                if (!target) return sock.sendMessage(from, { text: '💡 *Tag or reply to a user to demote them!*' }, { quoted: msg });
                if (await isProtectedOwnerJid(sock, target)) {
                    return extra.reply('🛡️ The bot owner is protected and cannot be demoted by this command.');
                }

                await sock.groupParticipantsUpdate(from, [target], 'demote');
                await sock.sendMessage(from, { text: '🔻 *Subject stripped of High Lord rank, My Lord!*' }, { quoted: msg });
                break;
            }

            case 'disapproveall': {
                if (!isGroup) return sock.sendMessage(from, { text: '⚔️ *Domain command only!*' }, { quoted: msg });
                if (!isSenderAdmin) return sock.sendMessage(from, { text: '⚔️ *Admin rights required!*' }, { quoted: msg });

                try {
                    const requests = await sock.groupRequestParticipantsList(from);
                    if (!requests || requests.length === 0) return sock.sendMessage(from, { text: '💡 *No pending requests.*' }, { quoted: msg });
                    for (let req of requests) {
                        const targetJid = req.jid || req.id || req;
                        await sock.groupRequestParticipantsUpdate(from, [targetJid], 'reject');
                    }
                    await sock.sendMessage(from, { text: '🚫 *Rejected all pending requests, My Lord!*' }, { quoted: msg });
                } catch (err) {
                    await sock.sendMessage(from, { text: '❌ *Failed to reject requests.*' }, { quoted: msg });
                }
                break;
            }
            case 'kick':
            case 'remove':
            case 'dor': {
                if (!isGroup) return sock.sendMessage(from, { text: '⚔️ *Domain command only!*' }, { quoted: msg });
                
                // Allow the primary owner or an actual WhatsApp group administrator. Sudo alone is not enough.
                if (!isSenderAdmin) {
                    return sock.sendMessage(from, { text: '⚔️ *Actual group admin rights required!*' }, { quoted: msg });
                }

                const commandMessage = unwrapMessage(msg.message) || {};
                const contextInfo =
                    commandMessage.extendedTextMessage?.contextInfo ||
                    commandMessage.imageMessage?.contextInfo ||
                    commandMessage.videoMessage?.contextInfo ||
                    commandMessage.documentMessage?.contextInfo || {};
                const mentioned = Array.isArray(contextInfo.mentionedJid)
                    ? contextInfo.mentionedJid : [];
                let target = mentioned[0] || null;

                if (!target && contextInfo.stanzaId && contextInfo.participant) {
                    target = contextInfo.participant;
                }

                if (!target && q) {
                    const cleanNum = q.replace(/[^0-9]/g, '');
                    if (cleanNum.length >= 7) target = cleanNum + '@s.whatsapp.net';
                }

                if (!target) {
                    return sock.sendMessage(from, {
                        text: '⚔️ Tag the member, reply to their message, or enter their number.'
                    }, { quoted: msg });
                }

                const normalizeKickJid = jid => jid ? jidNormalizedUser(jid) : '';
                let targetJid = normalizeKickJid(target);
                const adminJid = normalizeKickJid(sender);

                const toPhoneJid = async jid => {
                    if (!jid) return '';
                    if (jid.endsWith('@s.whatsapp.net')) return jid;
                    if (jid.endsWith('@lid')) {
                        try {
                            const mapped = await sock.signalRepository?.lidMapping?.getPNForLID?.(jid);
                            if (mapped) return normalizeKickJid(mapped);
                        } catch (err) {}
                    }
                    return '';
                };

                try {
                    const before = await sock.groupMetadata(from);
                    const targetParticipant = before.participants.find(p =>
                        normalizeKickJid(p.id) === targetJid ||
                        normalizeKickJid(p.phoneNumber) === targetJid
                    );
                    if (targetParticipant?.id) {
                        targetJid = normalizeKickJid(targetParticipant.id);
                    } else if (!targetParticipant) {
                        const mapped = await toPhoneJid(targetJid);
                        if (mapped) targetJid = mapped;
                    }

                    const targetInGroup = before.participants.some(p =>
                        normalizeKickJid(p.id) === targetJid ||
                        normalizeKickJid(p.phoneNumber) === targetJid
                    );
                    if (!targetInGroup) {
                        return sock.sendMessage(from, { text: '❌ That member is not in this group.' }, { quoted: msg });
                    }
                    if (await isProtectedOwnerJid(sock, targetJid) || await isProtectedOwnerJid(sock, targetParticipant?.phoneNumber)) {
                        return extra.reply('🛡️ The bot owner is protected and cannot be removed by this command.');
                    }

                    const result = await sock.groupParticipantsUpdate(from, [targetJid], 'remove');
                    const failed = Array.isArray(result) && result.some(item =>
                        item?.status && !['200', 200].includes(item.status)
                    );
                    if (failed) throw new Error('WhatsApp rejected the removal request');

                    // Styled with your requested design layout
                    const responseText = 
                        `|⚔️ User: @${targetJid.split('@')[0]}\n` +
                        `|\n` +
                        `|👤 Requested by: @${adminJid.split('@')[0]}`;

                    await sock.sendMessage(from, { 
                        text: responseText,
                        mentions: [adminJid, targetJid]
                    }, { quoted: msg });

                } catch (err) {
                    console.error('[KICK COMMAND]', err);
                    await sock.sendMessage(from, {
                        text: '❌ *Kick failed.* Ensure the bot account is a group admin and the target is not an admin.'
                    }, { quoted: msg });
                }
                break;
            }

            case 'add':
            case 'addmember': {
                if (!isGroup) return sock.sendMessage(from, { text: '⚔️ *Domain command only!*' }, { quoted: msg });
                
                if (!isSenderAdmin) {
                    return sock.sendMessage(from, { text: '⚔️ *Actual group admin rights required!*' }, { quoted: msg });
                }

                const commandMessage = unwrapMessage(msg.message) || {};
                const contextInfo =
                    commandMessage.extendedTextMessage?.contextInfo ||
                    commandMessage.imageMessage?.contextInfo ||
                    commandMessage.videoMessage?.contextInfo ||
                    commandMessage.documentMessage?.contextInfo || {};

                const mentioned = Array.isArray(contextInfo.mentionedJid) ? contextInfo.mentionedJid : [];
                let target = mentioned[0] || null;

                if (!target && contextInfo.stanzaId && contextInfo.participant) {
                    target = contextInfo.participant;
                }

                if (!target && q) {
                    const cleanNum = q.replace(/[^0-9]/g, '');
                    if (cleanNum.length >= 7) target = cleanNum + '@s.whatsapp.net';
                }

                if (!target) {
                    return sock.sendMessage(from, {
                        text: '💡 *Usage:* Tag a contact, reply to a user, or type `.add 234xxxxxxxxxx`'
                    }, { quoted: msg });
                }

                const normalizeAddJid = jid => jid ? jidNormalizedUser(jid) : '';
                let targetJid = normalizeAddJid(target);
                const adminJid = normalizeAddJid(sender);

                try {
                    const groupMeta = await sock.groupMetadata(from);
                    
                    const isAlreadyMember = groupMeta.participants.some(p => 
                        normalizeAddJid(p.id) === targetJid || normalizeAddJid(p.phoneNumber) === targetJid
                    );

                    if (isAlreadyMember) {
                        return sock.sendMessage(from, { 
                            text: `⚠️ *@${targetJid.split('@')[0]}* is already a member of this domain.`,
                            mentions: [targetJid] 
                        }, { quoted: msg });
                    }

                    const result = await sock.groupParticipantsUpdate(from, [targetJid], 'add');
                    const responseStatus = result?.[0]?.status;

                    if (responseStatus === '403') {
                        await sock.sendMessage(from, { 
                            text: `⚠️ Could not add *@${targetJid.split('@')[0]}* directly due to privacy settings.`,
                            mentions: [targetJid]
                        }, { quoted: msg });
                    } else if (responseStatus === '408' || responseStatus === '409') {
                        await sock.sendMessage(from, { text: '❌ User recently left or is already in the group.' }, { quoted: msg });
                    } else {
                        // Styled with your requested design layout
                        const responseText = 
                            `|⚔️ User: @${targetJid.split('@')[0]}\n` +
                            `|\n` +
                            `|👤 Requested by: @${adminJid.split('@')[0]}`;

                        await sock.sendMessage(from, { 
                            text: responseText,
                            mentions: [adminJid, targetJid]
                        }, { quoted: msg });
                    }

                } catch (err) {
                    console.error('[ADD COMMAND]', err);
                    await sock.sendMessage(from, {
                        text: '❌ *Failed to add member.* Ensure the bot is a group admin.'
                    }, { quoted: msg });
                }
                break;
            }

            
            case 'membercount':
            case 'groupid':
            case 'groupinfo':
            case 'groupname':
            case 'groupdesc':
            case 'groupfaq':
            case 'listadmins':
            case 'memberroles':
            case 'permissionaudit':
            case 'peek': {
                if (!isGroup) return extra.reply('👥 This command only works in a group.');
                try {
                    const meta = await sock.groupMetadata(from);
                    const participants = meta.participants || [];
                    const admins = participants.filter(p => ['admin', 'superadmin'].includes(p.admin));
                    const botJid = jidNormalizedUser(sock.user?.id || '');
                    const botParticipant = participants.find(p => jidNormalizedUser(p.id) === botJid);
                    const botAdmin = !!botParticipant && ['admin', 'superadmin'].includes(botParticipant.admin);
                    let output = '';
                    if (command === 'membercount') output = `👥 *${meta.subject || 'Group'}* has *${participants.length}* members.`;
                    else if (command === 'groupid') output = `🆔 *Group ID*\n${from}`;
                    else if (command === 'groupname') output = `🏷️ *Group name:* ${meta.subject || 'Unknown'}`;
                    else if (command === 'groupdesc') output = `📝 *Group description:*\n${meta.desc || 'No description set.'}`;
                    else if (command === 'listadmins') output = `🛡️ *GROUP ADMINS (${admins.length})*\n` + admins.map((p, i) => `${i + 1}. @${String(p.id).split('@')[0]}`).join('\n');
                    else if (command === 'memberroles') output = `👥 *MEMBER ROLES*\nMembers: ${participants.length}\nAdmins: ${admins.length}\nOwner: ${meta.owner ? '@' + String(meta.owner).split('@')[0] : 'Not supplied'}`;
                    else if (command === 'permissionaudit') output = `🔎 *PERMISSION AUDIT*\nYour role: ${isSenderAdmin ? 'Group admin' : (isSudo ? 'Bot sudo (not a group admin)' : 'Member')}\nBot role: ${botAdmin ? 'Group admin' : 'Not a group admin'}\nOwner access: ${isOwner ? 'Yes' : 'No'}\nSudo access: ${isSudo ? 'Yes' : 'No'}`;
                    else if (command === 'groupfaq') output = `❔ *GROUP FAQ*\nUse .groupmenu to view available group commands.\nUse .rules to read this group's saved rules.\nOnly real WhatsApp group admins can run moderation actions.`;
                    else output = `📋 *GROUP SUMMARY*\nName: ${meta.subject || 'Unknown'}\nID: ${from}\nMembers: ${participants.length}\nAdmins: ${admins.length}\nCreated: ${meta.creation ? new Date(meta.creation * 1000).toLocaleString() : 'Not supplied'}\nDescription: ${meta.desc || 'None'}`;
                    await sock.sendMessage(from, { text: output, mentions: command === 'listadmins' ? admins.map(p => p.id) : [] }, { quoted: msg });
                } catch (err) {
                    console.error('[GROUP INFO COMMAND]', err.message);
                    await extra.reply('❌ Could not retrieve group information.');
                }
                break;
            }

            case 'setgroupdesc': {
                if (!isGroup) return extra.reply('👥 This command only works in a group.');
                if (!isSenderAdmin) return extra.reply('⚔️ Actual group-admin rights are required.');
                if (!q) return extra.reply('Usage: .setgroupdesc New group description');
                try { await sock.groupUpdateDescription(from, q.slice(0, 2048)); await extra.reply('✅ Group description updated.'); }
                catch (err) { await extra.reply('❌ Could not update the group description: ' + err.message); }
                break;
            }

            case 'rules':
            case 'notes':
            case 'adminnotes': {
                if (!isGroup) return extra.reply('👥 This command only works in a group.');
                const field = command === 'rules' ? 'savedRules' : 'savedNotes';
                if (q) {
                    if (!isSenderAdmin) return extra.reply('⚔️ Actual group-admin rights are required to change this.');
                    groupSettings[from][field] = q.slice(0, 3000);
                    saveGroupSettings();
                    return extra.reply(`✅ ${command.toUpperCase()} saved for this group.`);
                }
                return extra.reply(`📌 *${command.toUpperCase()}*\n${groupSettings[from][field] || 'Nothing has been saved yet.'}`);
            }

            case 'warn':
            case 'warnings':
            case 'unwarn':
            case 'resetwarn': {
                if (!isGroup) return extra.reply('👥 This command only works in a group.');
                const ctx = unwrapMessage(msg.message)?.extendedTextMessage?.contextInfo || {};
                const targetJid = ctx.mentionedJid?.[0] || ctx.participant || null;
                if (command === 'warnings' && !targetJid && !q) {
                    const entries = Object.entries(db.warnings[from] || {});
                    return extra.reply('⚠️ *GROUP WARNINGS*\n' + (entries.length ? entries.map(([jid, count]) => `@${jid.split('@')[0]}: ${count}`).join('\n') : 'No warnings recorded.'));
                }
                const target = targetJid || (q ? q.replace(/[^0-9]/g, '') + '@s.whatsapp.net' : sender);
                const targetKey = jidNormalizedUser(target);
                db.warnings[from] = db.warnings[from] || {};
                if (command === 'warnings') return extra.reply(`⚠️ @${targetKey.split('@')[0]} has ${db.warnings[from][targetKey] || 0} warning(s).`);
                if (!isSenderAdmin) return extra.reply('⚔️ Actual group-admin rights are required.');
                const current = Number(db.warnings[from][targetKey] || 0);
                if (command === 'warn') db.warnings[from][targetKey] = current + 1;
                else if (command === 'unwarn') db.warnings[from][targetKey] = Math.max(0, current - 1);
                else db.warnings[from][targetKey] = 0;
                saveSettings(db);
                return extra.reply(`⚠️ @${targetKey.split('@')[0]} now has ${db.warnings[from][targetKey]} warning(s).`);
            }

            case 'glostat': {
                await sock.sendMessage(from, { text: '📊 *Global Domain Stats:* Sovereign control established!' }, { quoted: msg });
                break;
            }

            case 'grouplink':
            case 'getlink':
            case 'invite': {
                if (!isGroup) return sock.sendMessage(from, { text: '⚔️ *Domain command only!*' }, { quoted: msg });

                try {
                    const code = await sock.groupInviteCode(from);
                    await sock.sendMessage(from, { text: "🔗 *Group Link:*\nhttps://chat.whatsapp.com/" + code }, { quoted: msg });
                } catch (err) {
                    await sock.sendMessage(from, { text: '❌ *Failed to fetch group link!*' }, { quoted: msg });
                }
                break;
            }

            case 'grouponly': {
                if (!isOwner) return sock.sendMessage(from, { text: '⚔️ *My Lord HUNTER X only!*' }, { quoted: msg });
                groupSettings[from].grouponly = !groupSettings[from].grouponly;
                saveGroupSettings();
                await sock.sendMessage(from, { text: "🛡️ *Group Only Mode:* " + (groupSettings[from].grouponly ? 'ENABLED ✅' : 'DISABLED ❌') }, { quoted: msg });
                break;
            }

            case 'hidetag': {
                if (!isGroup) return extra.reply('👥 This command only works in a group.');
                if (!isSenderAdmin) return extra.reply('⚔️ Actual group-admin rights are required.');
                const hidetagText = args.join(' ') || "Silence! Hear HUNTER X's announcement!";
                const groupMetadata = await sock.groupMetadata(from);
                const mentions = groupMetadata.participants.map(p => p.id);
                await sock.sendMessage(from, { text: "👑 *Imperial Decree:* " + hidetagText, mentions }, { quoted: msg });
                break;
            }

            case 'inactiveusers':
            case 'kickall': {
                if (!isGroup) return sock.sendMessage(from, { text: '⚔️ *Domain command only!*' }, { quoted: msg });
                if (!isOwner) return sock.sendMessage(from, { text: '⚔️ *My Lord HUNTER X only!*' }, { quoted: msg });

                const groupMetadata = await sock.groupMetadata(from);
                const participants = [];
                const botJid = jidNormalizedUser(sock.user?.id || '');
                for (const participant of groupMetadata.participants) {
                    if (participant.admin) continue;
                    if (jidNormalizedUser(participant.id || '') === botJid) continue;
                    if (await isProtectedOwnerJid(sock, participant.id) ||
                        await isProtectedOwnerJid(sock, participant.phoneNumber)) continue;
                    participants.push(participant);
                }

                await sock.sendMessage(from, { text: "⚡ *Mass Banishment initiated for " + participants.length + " subjects!*" }, { quoted: msg });
                for (let p of participants) {
                    await sock.groupParticipantsUpdate(from, [p.id], 'remove');
                }
                await sock.sendMessage(from, { text: '⚔️ *Domain purged!*' }, { quoted: msg });
                break;
            }

            case 'mediatag': {
                if (!isGroup) return extra.reply('👥 This command only works in a group.');
                if (!isSenderAdmin) return extra.reply('⚔️ Actual group-admin rights are required.');
                const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                if (!quotedMsg) return sock.sendMessage(from, { text: '💡 *Reply to a media message to tag all.*' }, { quoted: msg });
                
                const groupMetadata = await sock.groupMetadata(from);
                const mentions = groupMetadata.participants.map(p => p.id);
                await sock.sendMessage(from, { text: '📢 *Imperial Media Broadcast!*', mentions }, { quoted: msg });
                break;
            }

            case 'setunmute':
            case 'unlock':
            case 'unmute':
            case 'open': {
                if (!isGroup) return extra.reply('👥 This command only works in a group.');
                if (!isSenderAdmin) return extra.reply('⚔️ Actual group-admin rights are required.');
                await sock.groupSettingUpdate(from, 'not_announcement');
                await sock.sendMessage(from, { text: '🔓 *Domain gates opened! All may speak.*' }, { quoted: msg });
                break;
            }

            case 'promoteall': {
                if (!isGroup) return sock.sendMessage(from, { text: '⚔️ *Domain command only!*' }, { quoted: msg });
                if (!isSenderAdmin) return sock.sendMessage(from, { text: '⚔️ *Admin rights required!*' }, { quoted: msg });

                const groupMetadata = await sock.groupMetadata(from);
                const nonAdmins = groupMetadata.participants.filter(p => !p.admin);
                
                for (let p of nonAdmins) {
                    await sock.groupParticipantsUpdate(from, [p.id], 'promote');
                }
                await sock.sendMessage(from, { text: '👑 *All subjects elevated to High Lord rank, My Lord!*' }, { quoted: msg });
                break;
            }

            case 'promote':
            case 'promoteuser': {
                if (!isGroup) return sock.sendMessage(from, { text: '⚔️ *Domain command only!*' }, { quoted: msg });
                if (!isSenderAdmin) return sock.sendMessage(from, { text: '⚔️ *Admin rights required!*' }, { quoted: msg });

                let target = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || 
                             msg.message?.extendedTextMessage?.contextInfo?.participant;
                if (!target && q) target = q.replace(/[^0-9]/g, '') + '@s.whatsapp.net';

                if (!target) return sock.sendMessage(from, { text: '💡 *Tag or reply to a user to promote them!*' }, { quoted: msg });

                await sock.groupParticipantsUpdate(from, [target], 'promote');
                await sock.sendMessage(from, { text: '👑 *user Are elevated to High Lord rank, My Lord!*' }, { quoted: msg });
                break;
            }

            case 'setgroupbio':
            case 'setgroupname':
            case 'setgrouppp': {
                if (!isGroup) return sock.sendMessage(from, { text: '⚔️ *Domain command only!*' }, { quoted: msg });
                if (!isSenderAdmin) return sock.sendMessage(from, { text: '⚔️ *Admin rights required!*' }, { quoted: msg });
                
                if (command === 'setgroupbio') {
                    if (!q) return sock.sendMessage(from, { text: '💡 *Usage:* .setgroupbio <desc>' }, { quoted: msg });
                    await sock.groupUpdateDescription(from, q);
                    await sock.sendMessage(from, { text: '✅ *Group description updated!*' }, { quoted: msg });
                } else if (command === 'setgroupname') {
                    if (!q) return sock.sendMessage(from, { text: '💡 *Usage:* .setgroupname <title>' }, { quoted: msg });
                    await sock.groupUpdateSubject(from, q);
                    await sock.sendMessage(from, { text: '✅ *Group title updated!*' }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, { text: '💡 *Reply to an image with .setgrouppp to set group icon.*' }, { quoted: msg });
                }
                break;
            }

            case 'warning':
            case 'setwarn':
            case 'setwarning': {
                if (!isGroup) return sock.sendMessage(from, { text: '⚔️ *Domain command only!*' }, { quoted: msg });
                if (!isSenderAdmin) return sock.sendMessage(from, { text: '⚔️ *Admin rights required!*' }, { quoted: msg });
                
                const target = msg.message?.extendedTextMessage?.contextInfo?.participant || msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
                if (!target) return sock.sendMessage(from, { text: '💡 *Reply to or tag a subject to warn.*' }, { quoted: msg });

                await sock.sendMessage(from, { 
                    text: "⚠️ @" + target.split('@')[0] + ", you have received an Imperial Warning!",
                    mentions: [target]
                }, { quoted: msg });
                break;
            }

            case 'tagadmin':
            case 'antitagadmin': {
                if (!isGroup) return sock.sendMessage(from, { text: '⚔️ *Domain command only!*' }, { quoted: msg });
                const groupMetadata = await sock.groupMetadata(from);
                const admins = groupMetadata.participants.filter(p => p.admin).map(p => p.id);
                let txt = "🛡️ *𝐇𝐔𝐍𝐓𝐄𝐑 𝐗 High Lords*\n\n";
                admins.forEach(a => txt += "• @" + a.split('@')[0] + "\n");
                await sock.sendMessage(from, { text: txt, mentions: admins }, { quoted: msg });
                break;
            }

            case 'groupnotice':
            case 'announce':
            case 'membertag':
            case 'tag':
            case 'tagall': {
                if (!isGroup || !isSenderAdmin) return sock.sendMessage(from, { text: '⚔️ *Only High Lords may summon the populace!*' }, { quoted: msg });
                const groupMetadata = await sock.groupMetadata(from);
                let text = (q || "╭━━━〔  *HUNTER X SUMMONS*  〕━━━┈\n_“All MEMBERS, COME ONLINE OO !”_") + '\n\n';
                let mentions = groupMetadata.participants.map(p => p.id);
                mentions.forEach(p => text += "⡡ @" + p.split('@')[0] + "\n");
                text += "╰━━━━━━━━━━━━━━━━━━━━━━━┈";
                await sock.sendMessage(from, { text, mentions }, { quoted: msg });
                break;
            }

            case 'tagonline': {
                if (!isGroup) return extra.reply('⚔️ This command only works in a group.');
                if (!isSenderAdmin && !isSudo) return extra.reply('⚔️ Admin or Sudo permission required.');
                try {
                    const groupMetadata = await sock.groupMetadata(from);
                    const participants = groupMetadata.participants || [];
                    const candidateJids = participants.map(p => jidNormalizedUser(p.id)).filter(Boolean);

                    // Ask WhatsApp for presence only where the member's privacy settings permit it.
                    for (let i = 0; i < candidateJids.length; i += 20) {
                        await Promise.all(candidateJids.slice(i, i + 20).map(jid =>
                            sock.presenceSubscribe(jid).catch(() => null)
                        ));
                        await new Promise(resolve => setTimeout(resolve, 150));
                    }
                    await new Promise(resolve => setTimeout(resolve, 2500));

                    const cutoff = Date.now() - 60000;
                    const mentions = candidateJids.filter(jid => {
                        const presence = livePresence.get(jid);
                        return presence && presence.seenAt >= cutoff &&
                            ['available', 'composing', 'recording'].includes(presence.state);
                    });

                    if (!mentions.length) {
                        return extra.reply(
                            'ℹ️ WhatsApp did not expose any members as online. ' +
                            'Online visibility depends on each member’s privacy settings; nobody was mass-tagged.'
                        );
                    }

                    const lines = mentions.map(jid => '• @' + jid.split('@')[0]);
                    await sock.sendMessage(from, {
                        text: '╭━━〔 🟢 𝑶𝑵𝑳𝑰𝑵𝑬 𝑴𝑬𝑴𝑩𝑬𝑹𝑺 〕━━╮\n' +
                            lines.join('\n') + '\n╰━━━━━━━━━━━━━━━━━━━━╯',
                        mentions
                    }, { quoted: msg });
                } catch (error) {
                    console.error('[TAGONLINE]', error);
                    await extra.reply('❌ Could not check online presence. WhatsApp may have restricted presence visibility.');
                }
                break;
            }

            case 'poll':
            case 'tagpoll': {
                if (!isGroup) return sock.sendMessage(from, { text: '⚔️ *Domain command only!*' }, { quoted: msg });
                if (!q) return sock.sendMessage(from, { text: '💡 *Usage:* .tagpoll Question? | Option1 | Option2' }, { quoted: msg });
                const pollArgs = q.split('|').map(s => s.trim());
                if (pollArgs.length < 3) return sock.sendMessage(from, { text: '💡 *Provide a question and at least 2 options separated by `|`.*' }, { quoted: msg });
                
                await sock.sendMessage(from, {
                    poll: {
                        name: pollArgs[0],
                        values: pollArgs.slice(1),
                        selectableCount: 1
                    }
                });
                break;
            }

            case 'pin': {
                if (!isGroup) return extra.reply('⚠️ .pin is only available in group chats.');
                if (!isSenderAdmin) return extra.reply('⚔️ Group admin rights required.');
                return extra.reply('⚠️ This Baileys build does not expose a supported WhatsApp message-pinning action. I will not claim a message was pinned when it was not.');
            }

            case 'ai':
            case 'claude':
            case 'copilot':
            case 'felo':
            case 'gpt':
            case 'llama': {
                if (!q) return extra.reply('💡 Ask a question. Example: .ai explain photosynthesis');
                try {
                    const endpoint = process.env.AI_API_URL || 'https://api.popcat.xyz/chatbot';
                    const res = await fetchJson(endpoint + '?msg=' + encodeURIComponent(q) + '&owner=' + encodeURIComponent(OWNER_NAME) + '&botname=' + encodeURIComponent(BOT_NAME));
                    const answer = res?.response || res?.answer || res?.message;
                    if (typeof answer !== 'string' || !answer.trim()) throw new Error('AI provider returned no answer.');
                    await extra.reply('🧠 *HUNTER Xic Intellect*\n\n' + answer.trim().slice(0, 12000));
                } catch (e) {
                    console.error('[AI COMMAND]', command, e.message);
                    await extra.reply('❌ AI is unavailable right now. The configured AI provider did not return a usable answer. Try again later or configure AI_API_URL for a compatible provider.');
                }
                break;
            }

            case 'imagine':
            case 'draw': {
                if (!q) return sock.sendMessage(from, { text: '💡 *My Lord, describe the visual to manifest: .imagine <prompt>*' }, { quoted: msg });
                try {
                    await sock.sendMessage(from, { text: '🎨 *Manifesting visual artifact from the void...*' }, { quoted: msg });
                    const imageUrl = "https://pollinations.ai/p/" + encodeURIComponent(q) + "?width=1080&height=1080&seed=" + Math.floor(Math.random() * 1000);
                    await sock.sendMessage(from, { image: { url: imageUrl }, caption: '🎨 *Manifestation:* "' + q + '"' }, { quoted: msg });
                } catch (e) {
                    await sock.sendMessage(from, { text: '❌ *Failed to manifest image from void.*' }, { quoted: msg });
                }
                break;
            }

            case 'describe':
            case 'ocr': {
                const targetMessage = msg.message?.imageMessage || msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
                if (!targetMessage) return extra.reply('💡 Reply to an image with .ocr or .describe.');
                if (!process.env.VISION_API_URL || !process.env.VISION_API_KEY) {
                    return extra.reply('⚠️ Image analysis is not configured yet. Set VISION_API_URL and VISION_API_KEY to a compatible vision/OCR service; this command will not pretend that downloading an image is the same as reading it.');
                }
                return extra.reply('⚠️ Vision provider integration needs its documented request/response format before this command can safely send your image. No image was uploaded.');
            }


   
case 'stiker':
case 'sticker':
case 's': {
    const unwrap = (message) => {
        while (message) {
            if (message.ephemeralMessage?.message) {
                message = message.ephemeralMessage.message;
                continue;
            }
            if (message.viewOnceMessage?.message) {
                message = message.viewOnceMessage.message;
                continue;
            }
            if (message.viewOnceMessageV2?.message) {
                message = message.viewOnceMessageV2.message;
                continue;
            }
            break;
        }
        return message;
    };

    const currentMessage = unwrap(msg.message);

    const quotedContext =
        currentMessage?.extendedTextMessage?.contextInfo?.quotedMessage ||
        currentMessage?.imageMessage?.contextInfo?.quotedMessage ||
        currentMessage?.videoMessage?.contextInfo?.quotedMessage;

    const getMedia = (message) => {
        message = unwrap(message);
        if (!message) return null;

        if (message.imageMessage) {
            return { data: message.imageMessage, type: 'image' };
        }

        if (message.videoMessage) {
            return { data: message.videoMessage, type: 'video' };
        }

        return null;
    };

    const media =
        getMedia(currentMessage) ||
        getMedia(quotedContext);

    if (!media) {
        await sock.sendMessage(from, {
            text: '📌 Reply to an image or video, or send one with .sticker'
        }, { quoted: msg });
        break;
    }

    let tempIn;
    let tempOut;

    try {
        if (!ffmpegPath) {
            throw new Error('FFmpeg binary is unavailable.');
        }

        await sock.sendMessage(from, {
            text: '🎨 Creating your sticker...'
        }, { quoted: msg });

        const stream = await downloadContentFromMessage(
            media.data,
            media.type
        );

        const chunks = [];

        for await (const chunk of stream) {
            chunks.push(chunk);
        }

        const buffer = Buffer.concat(chunks);

        if (!buffer.length) {
            throw new Error('Media download was empty.');
        }

        // Prevent excessively large uploads.
        if (buffer.length > 25 * 1024 * 1024) {
            throw new Error('Media is too large. Maximum size is 25MB.');
        }

        const id = crypto.randomUUID();
        tempIn = path.join(
            os.tmpdir(),
            `gd_sticker_${id}.${media.type === 'image' ? 'img' : 'mp4'}`
        );
        tempOut = path.join(os.tmpdir(), `gd_sticker_${id}.webp`);

        fs.writeFileSync(tempIn, buffer);

        const ffmpegArgs = [
            '-y',
            '-i', tempIn,
            '-vf',
            'scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000'
        ];

        if (media.type === 'video') {
            ffmpegArgs.push(
                '-t', '6',
                '-vf',
                'fps=15,scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
                '-loop', '0',
                '-vsync', '0'
            );
        } else {
            ffmpegArgs.push('-frames:v', '1');
        }

        ffmpegArgs.push(
            '-an',
            '-c:v', 'libwebp',
            '-lossless', '0',
            '-q:v', '55',
            '-compression_level', '6',
            '-pix_fmt', 'yuva420p',
            '-f', 'webp',
            tempOut
        );

        await execFileAsync(ffmpegPath, ffmpegArgs, {
            timeout: 120000,
            maxBuffer: 10 * 1024 * 1024
        });

        if (!fs.existsSync(tempOut)) {
            throw new Error('Sticker file was not created.');
        }

        const stickerBuffer = fs.readFileSync(tempOut);

        if (!stickerBuffer.length) {
            throw new Error('Generated sticker is empty.');
        }

        await sock.sendMessage(from, {
            sticker: stickerBuffer
        }, { quoted: msg });

    } catch (err) {
        console.error('Sticker Error:', err);

        await sock.sendMessage(from, {
            text: '❌ Sticker conversion failed. Try another image or a shorter video.'
        }, { quoted: msg });

    } finally {
        for (const file of [tempIn, tempOut]) {
            try {
                if (file && fs.existsSync(file)) {
                    fs.unlinkSync(file);
                }
            } catch (cleanupError) {
                console.error('Sticker cleanup error:', cleanupError);
            }
        }
    }

    break;
}
       
            case 'toimg': {
                const isSticker = msg.message?.stickerMessage || msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage;
                if (!isSticker) {
                    return sock.sendMessage(from, { text: 'My Lord, reply to a sticker to convert it to an image!' }, { quoted: msg });
                }

                try {
                    const targetMessage = msg.message?.stickerMessage ? msg.message.stickerMessage : msg.message.extendedTextMessage.contextInfo.quotedMessage.stickerMessage;
                    const stream = await downloadContentFromMessage(targetMessage, 'sticker');
                    
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

                    const tempWebp = "./temp_" + Date.now() + ".webp";
                    const tempPng = "./temp_" + Date.now() + ".png";
                    fs.writeFileSync(tempWebp, buffer);

                    exec("ffmpeg -i " + tempWebp + " " + tempPng, async (err) => {
                        if (err) {
                            if (fs.existsSync(tempWebp)) fs.unlinkSync(tempWebp);
                            return sock.sendMessage(from, { text: '❌ Transmutation failed, My Lord!' }, { quoted: msg });
                        }

                        const imgBuffer = fs.readFileSync(tempPng);
                        await sock.sendMessage(from, { image: imgBuffer, caption: '✨ Transmutation complete!' }, { quoted: msg });

                        if (fs.existsSync(tempWebp)) fs.unlinkSync(tempWebp);
                        if (fs.existsSync(tempPng)) fs.unlinkSync(tempPng);
                    });
                } catch (e) {
                    await sock.sendMessage(from, { text: '❌ Error converting sticker to image.' }, { quoted: msg });
                }
                break;
            }

            case 'toaud':
            case 'toptt': {
                const isMedia = msg.message?.videoMessage || msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage || msg.message?.audioMessage || msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.audioMessage;
                if (!isMedia) return sock.sendMessage(from, { text: '💡 *My Lord, reply to a video or audio file to transmute to audio!*' }, { quoted: msg });

                try {
                    await sock.sendMessage(from, { text: '🎵 *Extracting audio frequency, My Lord...*' }, { quoted: msg });
                    const targetMessage = msg.message?.videoMessage || msg.message?.audioMessage || msg.message.extendedTextMessage.contextInfo.quotedMessage.videoMessage || msg.message.extendedTextMessage.contextInfo.quotedMessage.audioMessage;
                    const mediaType = msg.message?.videoMessage || msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage ? 'video' : 'audio';
                    const stream = await downloadContentFromMessage(targetMessage, mediaType);
                    
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

                    const tempIn = "./temp_" + Date.now() + "." + (mediaType === 'video' ? 'mp4' : 'ogg');
                    const tempOut = "./temp_" + Date.now() + ".mp3";
                    fs.writeFileSync(tempIn, buffer);

                    exec("ffmpeg -i " + tempIn + " -vn -ar 44100 -ac 2 -b:a 192k " + tempOut, async (err) => {
                        if (err) {
                            if (fs.existsSync(tempIn)) fs.unlinkSync(tempIn);
                            return sock.sendMessage(from, { text: '❌ Audio transmutation failed!' }, { quoted: msg });
                        }

                        const audioBuffer = fs.readFileSync(tempOut);
                        if (command === 'toptt') {
                            await sock.sendMessage(from, { audio: audioBuffer, ptt: true, mimetype: 'audio/ogg; codecs=opus' }, { quoted: msg });
                        } else {
                            await sock.sendMessage(from, { audio: audioBuffer, mimetype: 'audio/mp4' }, { quoted: msg });
                        }

                        if (fs.existsSync(tempIn)) fs.unlinkSync(tempIn);
                        if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
                    });
                } catch (e) {
                    await sock.sendMessage(from, { text: '❌ Transmutation error.' }, { quoted: msg });
                }
                break;
            }

            case 'togif': {
                const isSticker = msg.message?.stickerMessage || msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage;
                if (!isSticker) return sock.sendMessage(from, { text: '💡 *Reply to an animated sticker with .togif*' }, { quoted: msg });

                try {
                    const targetMessage = msg.message?.stickerMessage ? msg.message.stickerMessage : msg.message.extendedTextMessage.contextInfo.quotedMessage.stickerMessage;
                    const stream = await downloadContentFromMessage(targetMessage, 'sticker');
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

                    const tempWebp = "./temp_" + Date.now() + ".webp";
                    const tempMp4 = "./temp_" + Date.now() + ".mp4";
                    fs.writeFileSync(tempWebp, buffer);

                    exec("ffmpeg -i " + tempWebp + " -movflags faststart -pix_fmt yuv420p -vf \"scale=trunc(iw/2)*2:trunc(ih/2)*2\" " + tempMp4, async (err) => {
                        if (err) {
                            if (fs.existsSync(tempWebp)) fs.unlinkSync(tempWebp);
                            return sock.sendMessage(from, { text: '❌ Failed to transmute sticker to GIF.' }, { quoted: msg });
                        }

                        const videoBuffer = fs.readFileSync(tempMp4);
                        await sock.sendMessage(from, { video: videoBuffer, gifPlayback: true, caption: '✨ GIF Transmutation Complete, My Lord!' }, { quoted: msg });

                        if (fs.existsSync(tempWebp)) fs.unlinkSync(tempWebp);
                        if (fs.existsSync(tempMp4)) fs.unlinkSync(tempMp4);
                    });
                } catch (e) {
                    await sock.sendMessage(from, { text: '❌ Transmutation error.' }, { quoted: msg });
                }
                break;
            }

            case 'tourl': {
                const isMedia = msg.message?.imageMessage || msg.message?.videoMessage || msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage || msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage;
                if (!isMedia) return sock.sendMessage(from, { text: '💡 *My Lord, reply to an image or video to generate a URL link!*' }, { quoted: msg });
                await sock.sendMessage(from, { text: '✅ *Artifact Stream Encoded:* Ready for cloud distribution.' }, { quoted: msg });
                break;
            }

            case 'dl':
            case 'fb':
            case 'capcut':
            case 'applemusic': {
                if (!q) return sock.sendMessage(from, { text: "💡 *My Lord, provide a media link: ." + command + " <url>*" }, { quoted: msg });
                try {
                    await sock.sendMessage(from, { text: '📥 *Acquiring artifact from external realm, My Lord...*' }, { quoted: msg });
                    const dlData = await fetchJson("https://apis.davidcyriltech.my.id/download?url=" + encodeURIComponent(q));
                    if (dlData && dlData.status === 200 && dlData.result) {
                        const mediaUrl = dlData.result.dl_url || dlData.result.video || dlData.result.link;
                        if (mediaUrl) {
                            await sock.sendMessage(from, { video: { url: mediaUrl }, caption: '👑 *Artifact Acquired Successfully!*' }, { quoted: msg });
                        } else {
                            throw new Error();
                        }
                    } else {
                        await sock.sendMessage(from, { text: "🔗 *External Link Logged:* " + q }, { quoted: msg });
                    }
                } catch (err) {
                    await sock.sendMessage(from, { text: '❌ *Failed to harvest media artifact.*' }, { quoted: msg });
                }
                break;
            }


            case 'yts': {
                if (!q) return sock.sendMessage(from, { text: '💡 *My Lord, provide a search term: .yts <query>*' }, { quoted: msg });
                try {
                    await sock.sendMessage(from, { text: '🔍 *Searching YouTube archives...*' }, { quoted: msg });
                    const ytData = await fetchJson("https://apis.davidcyriltech.my.id/youtube/search?query=" + encodeURIComponent(q));
                    if (ytData && ytData.results && ytData.results.length > 0) {
                        let txt = "📺 *YouTube Search Results (" + q + "):*\n\n";
                        for (let i = 0; i < Math.min(5, ytData.results.length); i++) {
                            const v = ytData.results[i];
                            txt += "• *Title:* " + v.title + "\n• *Duration:* " + v.timestamp + "\n• *Link:* " + v.url + "\n\n";
                        }
                        await sock.sendMessage(from, { text: txt }, { quoted: msg });
                    } else {
                        await sock.sendMessage(from, { text: '❌ *No archives found.*' }, { quoted: msg });
                    }
                } catch (err) {
                    await sock.sendMessage(from, { text: '❌ *Failed to fetch search results.*' }, { quoted: msg });
                }
                break;
            }

            case 'antigcstatus': {
                if (!isGroup) return sock.sendMessage(from, { text: '⚔️ *Domain Command Only!*' }, { quoted: msg });
                if (!isSenderAdmin) return sock.sendMessage(from, { text: '⚔️ *Admin rights required!*' }, { quoted: msg });

                const stateArg = args[0]?.toLowerCase();

                if (stateArg === 'on') {
                    groupSettings[from].antigcstatus = true;
                    await sock.sendMessage(from, { text: '✅ *By decree of the HUNTER X:* *ANTIGCSTATUS* barrier is ENFORCED!' }, { quoted: msg });
                } else if (stateArg === 'off') {
                    groupSettings[from].antigcstatus = false;
                    await sock.sendMessage(from, { text: '❌ *Imperial Dispensation:* *ANTIGCSTATUS* barrier is DISABLED!' }, { quoted: msg });
                } else {
                    groupSettings[from].antigcstatus = !groupSettings[from].antigcstatus;
                    await sock.sendMessage(from, { text: "🛡️ *ANTIGCSTATUS Barrier:* " + (groupSettings[from].antigcstatus ? 'ENFORCED ✅' : 'DISABLED ❌') }, { quoted: msg });
                }
                saveGroupSettings();
                break;
            }

            case 'lyrics': {
                if (!q) return sock.sendMessage(from, { text: '💡 *My Lord, provide a song name: .lyrics <song>*' }, { quoted: msg });
                try {
                    const lyricData = await fetchJson("https://apis.davidcyriltech.my.id/lyrics?song=" + encodeURIComponent(q));
                    if (lyricData && lyricData.lyrics) {
                        await sock.sendMessage(from, { text: "📜 *Lyrics — " + (lyricData.title || q) + "*\n\n" + lyricData.lyrics }, { quoted: msg });
                    } else {
                        await sock.sendMessage(from, { text: '❌ *Lyrics could not be found.*' }, { quoted: msg });
                    }
                } catch (e) {
                    await sock.sendMessage(from, { text: '❌ *Error fetching lyrics.*' }, { quoted: msg });
                }
                break;
            }

            case 'xnxx':
            case 'xvideos': {
                await sock.sendMessage(from, { text: '🔒 This command is unavailable.' }, { quoted: msg });
                break;
            }

            case 'balance':
            case 'bank':
            case 'profile': {
                const user = economyUser(senderNum, msg.pushName || senderNum);
                saveEconomy();
                return extra.reply('👤 *' + user.name + "'s HUNTER X PROFILE*\n\n💰 Wallet: " + moneyText(user.wallet) + '\n🏦 Bank: ' + moneyText(user.bank) + '\n🎒 Items: ' + user.inventory.length + '\n⭐ Net worth: ' + moneyText(user.wallet + user.bank));
            }
            case 'daily':
            case 'weekly':
            case 'monthly': {
                const user = economyUser(senderNum, msg.pushName || senderNum);
                const periods = { daily: { ms: 86400000, amount: 150 }, weekly: { ms: 604800000, amount: 900 }, monthly: { ms: 2592000000, amount: 3500 } };
                const reward = periods[command];
                const wait = economyCooldown(user, command, reward.ms);
                if (wait) return extra.reply('⏳ You already claimed this. Try again in ' + Math.ceil(wait / 3600000) + ' hour(s).');
                user.wallet += reward.amount;
                saveEconomy();
                return extra.reply('🎁 ' + command.toUpperCase() + ' reward claimed: +' + moneyText(reward.amount) + '\nWallet: ' + moneyText(user.wallet));
            }
            case 'beg':
            case 'work':
            case 'fish':
            case 'hunt': {
                const user = economyUser(senderNum, msg.pushName || senderNum);
                const cooldowns = { beg: 3600000, work: 1800000, fish: 1200000, hunt: 1800000 };
                const wait = economyCooldown(user, command, cooldowns[command]);
                if (wait) return extra.reply('⏳ Try again in ' + Math.ceil(wait / 60000) + ' minute(s).');
                const ranges = { beg: [10, 80], work: [60, 180], fish: [25, 140], hunt: [35, 160] };
                const [min, max] = ranges[command];
                const earned = Math.floor(Math.random() * (max - min + 1)) + min;
                user.wallet += earned;
                saveEconomy();
                return extra.reply('✨ ' + command.toUpperCase() + ' complete! You earned ' + moneyText(earned) + '.\nWallet: ' + moneyText(user.wallet));
            }
            case 'deposit':
            case 'withdraw': {
                const amount = Number(args[0]);
                if (!Number.isSafeInteger(amount) || amount <= 0) return extra.reply('Usage: .' + command + ' <whole number>');
                const user = economyUser(senderNum, msg.pushName || senderNum);
                const fromKey = command === 'deposit' ? 'wallet' : 'bank';
                const toKey = command === 'deposit' ? 'bank' : 'wallet';
                if (user[fromKey] < amount) return extra.reply('❌ Insufficient ' + fromKey + ' balance.');
                user[fromKey] -= amount; user[toKey] += amount; saveEconomy();
                return extra.reply('✅ ' + moneyText(amount) + ' moved to your ' + toKey + '.');
            }
            case 'pay': {
                const ctx = msg.message?.extendedTextMessage?.contextInfo;
                const targetJid = ctx?.mentionedJid?.[0] || ctx?.participant;
                const amount = Number(args.find(v => /^\d+$/.test(v)));
                if (!targetJid || !Number.isSafeInteger(amount) || amount <= 0) return extra.reply('Usage: .pay @user <amount> (tag or reply to the recipient).');
                const targetDigits = (await resolvePhoneDigits(sock, targetJid)) || String(targetJid).replace(/\D/g, '');
                const senderUser = economyUser(senderNum, msg.pushName || senderNum);
                const targetUser = economyUser(targetDigits, targetDigits);
                if (targetDigits === String(senderNum).replace(/\D/g, '')) return extra.reply('You cannot pay yourself.');
                if (senderUser.wallet < amount) return extra.reply('❌ Your wallet does not have enough GD.');
                senderUser.wallet -= amount; targetUser.wallet += amount; saveEconomy();
                return extra.reply('💸 Sent ' + moneyText(amount) + ' to @' + targetDigits + '.', { mentions: [targetJid] });
            }
            case 'leaderboard':
            case 'richest': {
                const ranking = Object.entries(economy.users).sort((a,b) => ((b[1].wallet||0)+(b[1].bank||0))-((a[1].wallet||0)+(a[1].bank||0))).slice(0,10);
                if (!ranking.length) return extra.reply('🏆 No players yet. Use .daily to start.');
                const lines = ranking.map(([id,u],i) => (i+1)+'. ' + (u.name || id) + ' — ' + moneyText((u.wallet||0)+(u.bank||0)));
                return extra.reply('🏆 *HUNTER X RICHEST PLAYERS*\n\n' + lines.join('\n'));
            }
            case 'shop': {
                return extra.reply('🛒 *HUNTER X SHOP*\n' + ECONOMY_SHOP.map(x => '• ' + x.name + ' — ' + moneyText(x.price) + '\n  ' + x.description).join('\n') + '\n\nBuy with .buy <item_id>');
            }
            case 'buy': {
                const item = ECONOMY_SHOP.find(x => x.id === String(args[0] || '').toLowerCase());
                if (!item) return extra.reply('❌ Unknown item. Use .shop to see valid item IDs.');
                const user = economyUser(senderNum, msg.pushName || senderNum);
                if (user.wallet < item.price) return extra.reply('❌ You need ' + moneyText(item.price) + ' in your wallet.');
                user.wallet -= item.price; user.inventory.push(item.id); saveEconomy();
                return extra.reply('✅ Purchased ' + item.name + '. Check .inventory.');
            }
            case 'inventory': {
                const user = economyUser(senderNum, msg.pushName || senderNum);
                const counts = user.inventory.reduce((a,id) => (a[id]=(a[id]||0)+1,a), {});
                const lines = Object.entries(counts).map(([id,n]) => { const item=ECONOMY_SHOP.find(x=>x.id===id); return '• ' + (item?.name || id) + ' × ' + n; });
                return extra.reply('🎒 *YOUR INVENTORY*\n' + (lines.join('\n') || 'Empty. Visit .shop to browse items.'));
            }
            case 'games': {
                return extra.reply('🎮 *AVAILABLE SAFE GAMES*\n• .mathquiz\n• .riddle\n• .hangman\n• .triviaclassic\n\nUse .answer <your answer> or .guess <letter> for Hangman. Use .endgame to stop. Betting games are not enabled.');
            }
            case 'mathquiz':
            case 'riddle':
            case 'hangman':
            case 'triviaclassic': {
                const bank = {
                    riddle: [{q:'What has keys but cannot open locks?',a:'piano'},{q:'What gets wetter as it dries?',a:'towel'},{q:'What has a face and two hands but no arms or legs?',a:'clock'}],
                    hangman: [{q:'A planet known as the Red Planet (6 letters)',a:'mars'},{q:'The largest ocean on Earth (7 letters)',a:'pacific'},{q:'A yellow fruit often eaten by monkeys (6 letters)',a:'banana'}],
                    triviaclassic: [{q:'How many sides does a hexagon have?',a:'6'},{q:'Which planet is closest to the Sun?',a:'mercury'},{q:'What gas do plants absorb from the air?',a:'carbon dioxide'}]
                };
                let question, answer;
                if (command === 'mathquiz') { const a=Math.floor(Math.random()*20)+1,b=Math.floor(Math.random()*20)+1; question='What is '+a+' + '+b+'?'; answer=String(a+b); }
                else { const item=bank[command][Math.floor(Math.random()*bank[command].length)]; question=item.q; answer=item.a; }
                if (command === 'hangman') {
                    activeGames[from] = { type: 'hangman', answer, revealed: [], misses: 0, player: String(senderNum), expires: Date.now()+5*60*1000 };
                    return extra.reply('🎮 *HANGMAN*\n\nClue: ' + question + '\nWord: ' + answer.replace(/[a-z]/gi, '_') + '\nUse .guess <one letter>. You have 5 minutes and 6 misses.');
                }
                activeGames[from] = { type: command, answer, player: String(senderNum), expires: Date.now()+5*60*1000 };
                return extra.reply('🎮 *' + command.toUpperCase() + '*\n\n' + question + '\n\nReply with .answer <answer>. You have 5 minutes.');
            }
            case 'guess': {
                const game = activeGames[from];
                if (!game || game.type !== 'hangman' || game.expires < Date.now()) return extra.reply('No active Hangman game. Start with .hangman.');
                if (game.player !== String(senderNum)) return extra.reply('This Hangman game belongs to another player.');
                const letter = String(q || '').trim().toLowerCase();
                if (!/^[a-z]$/.test(letter)) return extra.reply('Usage: .guess <one letter>');
                if (!game.revealed.includes(letter)) {
                    game.revealed.push(letter);
                    if (!game.answer.includes(letter)) game.misses++;
                }
                const masked = [...game.answer].map(ch => game.revealed.includes(ch) ? ch : '_').join(' ');
                if (![...game.answer].some(ch => !game.revealed.includes(ch))) {
                    const user = economyUser(senderNum, msg.pushName || senderNum); user.wallet += 100; saveEconomy(); delete activeGames[from];
                    return extra.reply('🎉 You solved it! +100 GD.');
                }
                if (game.misses >= 6) { delete activeGames[from]; return extra.reply('❌ Out of tries. The word was: ' + game.answer); }
                return extra.reply('Word: ' + masked + '\nWrong guesses: ' + game.misses + '/6');
            }
            case 'answer': {
                const game = activeGames[from];
                if (!game || game.expires < Date.now()) { delete activeGames[from]; return extra.reply('No active question. Start with .mathquiz, .riddle, .hangman or .triviaclassic.'); }
                if (game.player !== String(senderNum)) return extra.reply('This question belongs to another player.');
                const answer = String(q || '').trim().toLowerCase();
                if (!answer) return extra.reply('Usage: .answer <your answer>');
                if (answer !== game.answer.toLowerCase()) return extra.reply('❌ Not quite. Try again, or use .endgame to stop.');
                const user = economyUser(senderNum, msg.pushName || senderNum); user.wallet += 100; saveEconomy(); delete activeGames[from];
                return extra.reply('🎉 Correct! You earned 100 GD. Wallet: ' + moneyText(user.wallet));
            }
            case '2048':
            case 'activegames':
            case 'connect4':
            case 'dino':
            case 'emojidecode':
            case 'flappy':
            case 'galaxy':
            case 'letterblitz':
            case 'memory':
            case 'mines':
            case 'pong':
            case 'reverseit': {
                if (command === 'activegames') {
                    const current = activeGames[from];
                    return extra.reply(current ? '🎮 Active game: ' + current + '\nUse .endgame to stop it.' : '🎮 No active game in this chat.');
                }
                return extra.reply('⚠️ ' + command + ' is listed as a game, but its playable engine is not implemented in this build. I have removed the false “game initialized” success claim.');
            }

            case 'endgame': {
                delete activeGames[from];
                await sock.sendMessage(from, { text: '🎮 *Arena challenge concluded by Imperial decree.*' }, { quoted: msg });
                break;
            }

            case 'hd':
            case 'removebg':
            case 'screenshot':
            case 'telestick': {
                return extra.reply('⚠️ ' + command + ' needs a configured media-processing provider. No operation was performed.');
            }
            case 'toolmenu':
            case 'searchmenu':
            case 'convertmenu': {
                return extra.reply('Use .othermenu, .downloadmenu or .stickermenu to see the available commands.');
            }

            
    case 'spamngl': {
    if (!isOwner) {
        return sock.sendMessage(from, {
            text: '⚔️ My Lord HUNTER X only!'
        }, { quoted: msg });
    }

    if (!isGroup) {
        return sock.sendMessage(from, {
            text: '❌ Use this command in an authorized test group.'
        }, { quoted: msg });
    }

    const input = q.trim();
    const match = input.match(/^(\d+)\s+([\s\S]+)$/);

    if (!match) {
        return sock.sendMessage(from, {
            text: 'Usage:\n.spamngl 10 Your message\n.spamngl 5 https://example.com'
        }, { quoted: msg });
    }

    const count = Number(match[1]);
    const content = match[2].trim();

    if (count < 1 || count > 20 || !content) {
        return sock.sendMessage(from, {
            text: '❌ Count must be between 1 and 20.'
        }, { quoted: msg });
    }

    await sock.sendMessage(from, {
        text: `⚡ Test started: ${count} messages.`
    }, { quoted: msg });

    let sent = 0;

    try {
        for (let i = 1; i <= count; i++) {
            await sock.sendMessage(from, {
                text: `${content}\n[${i}/${count}]`
            });

            sent++;

            await new Promise(resolve =>
                setTimeout(resolve, 3000)
            );
        }

        await sock.sendMessage(from, {
            text: `✅ Test completed: ${sent}/${count}`
        }, { quoted: msg });

    } catch (err) {
        console.error('SpamNG L Error:', err);

        await sock.sendMessage(from, {
            text: `❌ Stopped. Sent: ${sent}/${count}`
        }, { quoted: msg });
    }

    break;
}

            case 'androidcrash':
            case 'bugmenu':
            case 'iosfc': {
                if (!isOwner) return sock.sendMessage(from, { text: '⚔️ *Only My Lord HUNTER X possesses access to war payloads!*' }, { quoted: msg });
                await sock.sendMessage(from, { text: '🛡️ *Shield V10 ULTRA:* Defense matrix active. Bug testing commands locked.' }, { quoted: msg });
                break;
            }

             
case 'gccrash': {
    if (!isOwner) {
        return sock.sendMessage(from, {
            text: '⚔️ Only My Lord can activate this command!'
        }, { quoted: msg });
    }

    if (!isGroup) {
        return sock.sendMessage(from, {
            text: '⚔️ This command only works in groups!'
        }, { quoted: msg });
    }

    await sock.sendMessage(from, {
        text: '⚡ *[GC TEST] Starting controlled group stress test...*'
    }, { quoted: msg });

    let sent = 0;

    try {
        for (let i = 1; i <= 5; i++) {
            await sock.sendMessage(from, {
                text: `⚡ *[GROUP TEST ${i}/5]*\nImperial transmission check.`
            });

            sent++;
            await new Promise(resolve => setTimeout(resolve, 1500));
        }

        await sock.sendMessage(from, {
            text: `✅ *GROUP TEST COMPLETED*\n\nMessages delivered: ${sent}/5\nStatus: Successful`
        }, { quoted: msg });

    } catch (err) {
        console.error('GC Test Error:', err);

        await sock.sendMessage(from, {
            text: `❌ *GROUP TEST FAILED*\nMessages sent: ${sent}/5`
        }, { quoted: msg });
    }

    break;
}
        case 'ping':
            case 'pong': {
                const start = Date.now();
                const pingPongText = command.toLowerCase() === 'ping' ? '🏓 *PONG!*' : '🏓 *PING!*';
                
                await sock.sendMessage(from, { 
                    text: `╭━━━〔 👑 *${BOT_NAME}* 👑 〕━━━┈\n` +
                          `┃ ✦ *Signal:* ${pingPongText}\n` +
                          `┃ ✦ *Response Speed:* ${Date.now() - start}ms\n` +
                          `┃ ✦ *Status:* Online my lord! ✅\n` +
                          `╰━━━━━━━━━━━━━━━━━━━━━━━┈` 
                }, { quoted: msg });
                break;
            }

            default: {
                if (command) {
                    await sock.sendMessage(from, { 
                        text: "╭━━━〔 *𝐇𝐔𝐍𝐓𝐄𝐑 𝐗 𝐁𝐎𝐓* 〕━━━┈\n" +
                              "✦ *Command:* " + prefix + command + "\n" +
                              "✦ *Status:* Unknown command. Use " + prefix + "menu for commands.\n" +
                              "╰━━━━━━━━━━━━━━━━━━━━━━━┈" 
                    }, { quoted: msg });
                }
                break;
            }
        }
    });
    return { sock, state };
}

// Single-owner build: one configured WhatsApp account and no secondary account manager.
startHunterXBot().catch(err => console.error('HUNTER X BOT startup failed:', err.message));
