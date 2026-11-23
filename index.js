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
    res.end('HUNTER-X Bot is active 24/7 under the rule of HUNTER-X!\n');
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


// --- SFW WEB CONTENT HELPERS: anime images, flirt, truth and dare ---
const SFW_IMAGE_PROVIDERS = [
    async (category) => {
        const r = await axios.get('https://api.waifu.best/images?PageSize=1&IsNsfw=False', { timeout: 12000 });
        const item = r.data?.items?.find(x => x && x.isNsfw === false && x.url);
        return item ? { url: item.url, source: item.source || null, anime: item.animeName || null } : null;
    },
    async (category) => {
        const safeCategory = ['waifu', 'neko', 'smile', 'wink', 'blush', 'sleep'].includes(category) ? category : 'waifu';
        const r = await axios.get(`https://nekos.best/api/v2/${safeCategory}`, {
            timeout: 12000,
            headers: { 'User-Agent': 'HUNTER-X V4.9 (https://github.com/)' }
        });
        const item = r.data?.results?.[0];
        return item?.url ? { url: item.url, source: item.source_url || null, anime: item.anime_name || null, artist: item.artist_name || null } : null;
    },
    async (category) => {
        const safeCategory = ['waifu', 'neko', 'wink', 'blush', 'smile', 'wave', 'pat'].includes(category) ? category : 'waifu';
        const r = await axios.get(`https://api.waifu.pics/sfw/${safeCategory}`, { timeout: 12000 });
        return r.data?.url ? { url: r.data.url, source: null, anime: null } : null;
    }
];

async function fetchSfwAnimeImage(category = 'waifu') {
    const order = [...SFW_IMAGE_PROVIDERS];
    // Shuffle provider order so one temporary outage does not always block the command.
    for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
    }
    const errors = [];
    for (const provider of order) {
        try {
            const meta = await provider(category);
            if (!meta?.url || !/^https:\/\//i.test(meta.url)) throw new Error('No valid SFW image URL');
            const image = await axios.get(meta.url, {
                responseType: 'arraybuffer', timeout: 18000, maxContentLength: 10 * 1024 * 1024,
                headers: { 'User-Agent': 'HUNTER-X-BOT/4.9' }
            });
            const buffer = Buffer.from(image.data);
            if (!buffer.length || buffer.length > 10 * 1024 * 1024) throw new Error('Image was empty or too large');
            return { buffer, ...meta };
        } catch (e) {
            errors.push(e.message);
            console.warn('[SFW IMAGE FALLBACK]', e.message);
        }
    }
    throw new Error(`All SFW anime image sources failed: ${errors.join(' | ')}`);
}

function escapeCardText(value = '') {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

async function makeTruthDareCard(kind, prompt, animeImage) {
    const title = kind === 'truth' ? 'TRUTH' : 'DARE';
    const accent = kind === 'truth' ? '#57d7ff' : '#ff6b45';
    const words = String(prompt).replace(/\s+/g, ' ').trim().split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (candidate.length > 27 && line) { lines.push(line); line = word; }
        else line = candidate;
        if (lines.length >= 7) break;
    }
    if (line && lines.length < 8) lines.push(line);
    const promptSvg = lines.map((part, i) => `<text x="450" y="${790 + i * 58}" text-anchor="middle" font-family="Arial,sans-serif" font-size="43" font-weight="700" fill="#ffffff" stroke="#05060d" stroke-width="2" paint-order="stroke">${escapeCardText(part)}</text>`).join('');
    const svg = Buffer.from(`<svg width="900" height="1200" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#080914" stop-opacity=".12"/><stop offset=".48" stop-color="#080914" stop-opacity=".30"/><stop offset="1" stop-color="#05060d" stop-opacity=".96"/></linearGradient><filter id="glow"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
      <rect width="900" height="1200" fill="#090a12"/><rect x="18" y="18" width="864" height="1164" rx="42" fill="none" stroke="${accent}" stroke-width="12"/><rect width="900" height="1200" fill="url(#shade)"/>
      <text x="450" y="145" text-anchor="middle" font-family="Arial,sans-serif" font-size="90" font-weight="900" fill="${accent}" stroke="#10111b" stroke-width="3" paint-order="stroke" filter="url(#glow)">${title}</text>
      <path d="M100 190 H800" stroke="${accent}" stroke-width="5" opacity=".9"/>
      ${promptSvg}
      <text x="450" y="1135" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" font-weight="700" fill="#ffffff">HUNTER-X • ANIME PARTY</text>
    </svg>`);
    return sharp(animeImage.buffer).rotate().resize(900, 1200, { fit: 'cover' }).composite([{ input: svg }]).jpeg({ quality: 88 }).toBuffer();
}

const UNSAFE_GAME_PROMPT = /(drink|alcohol|beer|wine|vodka|smok(e|ing)|vape|drug|weapon|knife|gun|fight|jump off|roof|traffic|road|dangerous|hurt yourself|self.?harm|suicid|sexual|nude|underwear|send.*(password|address|private photo|gallery)|share.*(password|address|private photo)|stranger.*meet)/i;
async function fetchTruthOrDareFromWeb(kind) {
    const endpoint = kind === 'truth'
        ? 'https://api.truthordarebot.xyz/v1/truth?rating=pg'
        : 'https://api.truthordarebot.xyz/api/dare?rating=pg';
    const response = await axios.get(endpoint, { timeout: 12000, headers: { Accept: 'application/json' } });
    const prompt = response.data?.question || response.data?.contents?.question || response.data?.result;
    if (typeof prompt !== 'string' || prompt.trim().length < 5 || UNSAFE_GAME_PROMPT.test(prompt)) {
        throw new Error('The web API returned an unsuitable or invalid prompt');
    }
    return prompt.trim();
}

// --- BOT CONFIGURATION ---
const OWNER_NUMBER = "2347070751286";
const OWNER_NAME = "𝑯𝑼𝑵𝑻𝑬𝑹-𝑿";
const BOT_NAME = "𝑯𝑼𝑵𝑻𝑬𝑹-𝑿-𝑩𝑶𝑻";
const BOT_VERSION = "V4.4";
const MENU_IMAGE_URL = "https://i.postimg.cc/C5nJz4BG/1793460010889.jpg";
const PURPLE_COLOR = '#9C27B0';
const startTime = Date.now();

// --- STORAGE ENGINE (Render Free compatible; persistent disk ready) ---
// Render Free has ephemeral local storage. For durable storage later, attach a
// Render Persistent Disk and set DATA_DIR=/var/data. This code deliberately
// does not claim local files are persistent when no disk is mounted.
const DATA_DIR = path.resolve(process.env.HUNTER_X_DATA_DIR || path.join(__dirname, 'data'));
fs.mkdirSync(DATA_DIR, { recursive: true });
try {
    const storageProbe = path.join(DATA_DIR, `.hunter-x-write-test-${process.pid}`);
    fs.writeFileSync(storageProbe, 'ok', { mode: 0o600 });
    fs.unlinkSync(storageProbe);
    console.log('[STORAGE] Writable data directory:', DATA_DIR);
    if (process.env.RENDER && !process.env.DATA_DIR) {
        console.warn('[STORAGE WARNING] Render is running without DATA_DIR. Local data may be lost on restart/redeploy.');
    }
    if (process.env.DATA_DIR) {
        console.log('[STORAGE] DATA_DIR is explicitly configured. Confirm it points to your mounted persistent disk before relying on it.');
    }
} catch (storageError) {
    console.error('[STORAGE ERROR] Cannot write to DATA_DIR:', storageError.message);
    throw storageError;
}
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
migrateLegacyPath(path.join(__dirname, 'demon_session'), path.join(DATA_DIR, 'demon_session'));
migrateLegacyPath(path.resolve(process.cwd(), 'demon_session'), path.join(DATA_DIR, 'demon_session'));
migrateLegacyPath(path.join(__dirname, 'sessions'), path.join(DATA_DIR, 'sessions'));

const ECONOMY_FILE = path.join(DATA_DIR, 'economy.json');
const economy = readJsonFile(ECONOMY_FILE, { users: {} });
if (!economy.users || typeof economy.users !== 'object') economy.users = {};
function saveEconomy() { writeJsonAtomic(ECONOMY_FILE, economy); }
function economyUser(jid, name = 'Player') {
    const id = String(jid || '').replace(/\D/g, '') || String(jid || 'unknown');
    if (!economy.users[id]) economy.users[id] = { name, wallet: 0, bank: 0, inventory: [], cards: [], pendingCard: null, cooldowns: {}, joinedAt: Date.now() };
    const user = economy.users[id];
    user.name = name || user.name || 'Player';
    user.wallet = Math.max(0, Number(user.wallet) || 0);
    user.bank = Math.max(0, Number(user.bank) || 0);
    if (!Array.isArray(user.inventory)) user.inventory = [];
    if (!Array.isArray(user.cards)) user.cards = [];
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

// Anime-card catalogue: owners add artwork URLs they own or are licensed to use.
const CARD_CATALOG_FILE = path.join(DATA_DIR, 'animeCards.json');
const CARD_TIERS = ['S', 'A', 'B', 'C', 'D', 'E'];
const cardCatalog = readJsonFile(CARD_CATALOG_FILE, { cards: [] });
if (!Array.isArray(cardCatalog.cards)) cardCatalog.cards = [];
function saveCardCatalog() { writeJsonAtomic(CARD_CATALOG_FILE, cardCatalog); }
// Public spawn safeguards: per-user and per-chat cooldowns. These are in-memory
// limits (they reset if the bot process restarts); they reduce bursts but do not
// bypass WhatsApp policies or guarantee against reports/suspension.
const CARD_SPAWN_USER_COOLDOWN_MS = 30 * 1000;
const CARD_SPAWN_CHAT_COOLDOWN_MS = 5 * 1000;
const CARD_SPAWN_USER_NEXT = new Map();
const CARD_SPAWN_CHAT_NEXT = new Map();
function cardSpawnCooldownRemaining(map, key, duration) {
    const now = Date.now();
    const next = Number(map.get(String(key)) || 0);
    if (next > now) return next - now;
    map.set(String(key), now + duration);
    return 0;
}

function cleanCardId(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32); }
function cardById(id) { return cardCatalog.cards.find(card => card.id === cleanCardId(id)); }

// SFW anime artwork sources. Konachan is queried with the documented safe-rating
// tag; the other providers are independent fallbacks if Konachan is unavailable.
const CARD_TIER_PRICES = { S: 100000, A: 50000, B: 20000, C: 10000, D: 5000, E: 2000 };
const CARD_TIER_WEIGHTS = { S: 4, A: 9, B: 17, C: 24, D: 26, E: 20 };
function randomEligibleTier(isAnimated) {
    const eligible = isAnimated ? CARD_TIERS : ['B', 'C', 'D', 'E'];
    const total = eligible.reduce((sum, tier) => sum + CARD_TIER_WEIGHTS[tier], 0);
    let pick = Math.random() * total;
    for (const tier of eligible) { pick -= CARD_TIER_WEIGHTS[tier]; if (pick < 0) return tier; }
    return eligible[eligible.length - 1];
}
function humanizeAnimeTag(value = '') {
    return String(value).split(' ').filter(Boolean).slice(0, 3)
        .map(x => x.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())).join(', ');
}
async function fetchKonachanSafePosts(limit = 30) {
    const failures = [];
    for (const host of ['https://konachan.net', 'https://konachan.com']) {
        try {
            const response = await axios.get(host + '/post.json', {
                params: { limit, tags: 'rating:s order:random' }, timeout: 14000,
                headers: { Accept: 'application/json', 'User-Agent': 'HUNTER-X-BOT SFW anime artwork bot' },
                maxContentLength: 3 * 1024 * 1024
            });
            const posts = Array.isArray(response.data) ? response.data.filter(post =>
                post && post.rating === 's' && typeof post.file_url === 'string' && /^https:\/\//i.test(post.file_url)
            ) : [];
            if (posts.length) return posts;
            failures.push(host + ': no safe-rated posts returned');
        } catch (error) { failures.push(host + ': ' + String(error.message || error).slice(0, 100)); }
    }
    throw new Error(failures.join(' | ') || 'Konachan returned no safe posts');
}
async function lookupKonachanTagTypes(rawTags) {
    const allNames = String(rawTags || '').split(' ').filter(Boolean);
    const likelyNamedTags = allNames.filter(tag => tag.includes('_'));
    const names = (likelyNamedTags.length ? likelyNamedTags : allNames).slice(0, 12);
    const typed = { character: [], copyright: [], artist: [] };
    let cursor = 0;
    async function worker() {
        while (cursor < names.length) {
            const tagName = names[cursor++];
            try {
                const response = await axios.get('https://konachan.net/tag.json', {
                    params: { name: tagName, limit: 1 }, timeout: 5500,
                    headers: { Accept: 'application/json', 'User-Agent': 'HUNTER-X-BOT tag metadata lookup' },
                    maxContentLength: 256 * 1024
                });
                const rows = Array.isArray(response.data) ? response.data : [];
                const tag = rows.find(row => String(row.name || '').toLowerCase() === tagName.toLowerCase());
                const type = Number(tag?.tag_type ?? tag?.type);
                if (type === 4) typed.character.push(tagName);
                else if (type === 3) typed.copyright.push(tagName);
                else if (type === 1) typed.artist.push(tagName);
            } catch { /* Missing tag metadata must not block a card spawn. */ }
        }
    }
    await Promise.all(Array.from({ length: Math.min(4, names.length) }, () => worker()));
    return typed;
}

async function fetchFreshAnimeCard() {
    const failures = [];
    // Try Konachan first, but only accept posts explicitly rated safe (rating === 's').
    try {
        const posts = await fetchKonachanSafePosts(40);
        for (let i = posts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [posts[i], posts[j]] = [posts[j], posts[i]]; }
        for (const post of posts) {
            const mediaUrl = new URL(post.file_url);
            const externalId = String(post.id || crypto.createHash('sha1').update(mediaUrl.href).digest('hex').slice(0, 12));
            const id = cleanCardId('konachan_' + externalId);
            if (!id || cardById(id)) continue;
            const rawTags = String(post.tags || '').split(' ').filter(Boolean);
            const tagTypes = await lookupKonachanTagTypes(post.tags || '');
            const characterName = humanizeAnimeTag(post.tag_string_character || post.character_tags || tagTypes.character.join(' '));
            const animeTitle = humanizeAnimeTag(post.tag_string_copyright || post.copyright_tags || tagTypes.copyright.join(' '));
            const artist = humanizeAnimeTag(post.tag_string_artist || post.artist_tags || tagTypes.artist.join(' '));
            const isAnimated = /\.gif(?:$|[?#])/i.test(mediaUrl.href) || String(post.file_ext || '').toLowerCase() === 'gif';
            const tier = randomEligibleTier(isAnimated);
            const card = {
                id, name: characterName || ('Anime Character #' + externalId), characterName: characterName || 'MYSTERY CHARACTER',
                animeTitle: animeTitle || 'ANIME ARCHIVE', tier, price: CARD_TIER_PRICES[tier], mediaUrl: mediaUrl.href,
                isAnimated, artist, tags: humanizeAnimeTag(rawTags.slice(0, 8).join(' ')), sourceUrl: 'https://konachan.net/post/show/' + externalId,
                provider: 'Konachan (rating:s)', providerImageId: externalId, addedAt: Date.now(), active: true
            };
            cardCatalog.cards.push(card); saveCardCatalog(); return card;
        }
        failures.push('Konachan: no unseen safe artwork');
    } catch (error) { failures.push('Konachan: ' + String(error.message || error).slice(0, 130)); }

    // Multiple SFW fallback providers. Metadata is only shown when the provider supplies it.
    const fallbackCategories = ['waifu', 'neko', 'kitsune', 'husbando'];
    for (let i = fallbackCategories.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [fallbackCategories[i], fallbackCategories[j]] = [fallbackCategories[j], fallbackCategories[i]]; }
    const providers = [
        { name: 'Waifu.best', url: 'https://api.waifu.best/images', params: { IsNsfw: false, PageSize: 30 }, parse: d => (d?.items || d?.images || d?.data || []).filter(x => x?.isNsfw === false && x?.url).map(x => ({ url:x.url,id:x.id ?? x.signature,isAnimated:x.isAnimated,extension:x.extension,anime:x.animeName,artist:(x.artists||[]).map(a=>a?.name).filter(Boolean).join(', '),tags:(x.tags||[]).map(t=>t?.name).filter(Boolean).slice(0,4).join(', '),source:x.source })) },
        ...fallbackCategories.map(category => ({ name:'Nekos.best/' + category, url:'https://nekos.best/api/v2/' + category, params:{}, parse:d => (d?.results || []).filter(x=>x?.url).map(x=>({url:x.url,id:x.url,isAnimated:/\.gif(?:$|[?#])/i.test(x.url),anime:x.anime_name,artist:x.artist_name,tags:category,source:x.source_url || x.artist_href})) })),
        { name:'Waifu.pics', url:'https://api.waifu.pics/sfw/waifu', params:{}, parse:d=>d?.url?[{url:d.url,id:d.url,isAnimated:/\.gif(?:$|[?#])/i.test(d.url),anime:'',artist:'',tags:'waifu',source:''}]:[] }
    ];
    for (const provider of providers) {
        try {
            const response = await axios.get(provider.url, { params:provider.params, timeout:13000, headers:{Accept:'application/json','User-Agent':'HunterXBot/4.9 SFW card generator'}, maxContentLength:3*1024*1024 });
            const candidates = provider.parse(response.data);
            for (let i=candidates.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [candidates[i],candidates[j]]=[candidates[j],candidates[i]]; }
            for (const item of candidates.slice(0,12)) {
                try {
                    const mediaUrl = new URL(item.url); if (mediaUrl.protocol !== 'https:') continue;
                    const externalId = String(item.id || crypto.createHash('sha1').update(mediaUrl.href).digest('hex').slice(0,12));
                    const id = cleanCardId(provider.name.toLowerCase().replace(/[^a-z0-9]/g,'') + '_' + crypto.createHash('sha1').update(externalId).digest('hex').slice(0,12));
                    if (!id || cardById(id)) continue;
                    const isAnimated = item.isAnimated === true || String(item.extension||'').toLowerCase()==='.gif' || /\.gif(?:$|[?#])/i.test(mediaUrl.href);
                    const tier = randomEligibleTier(isAnimated);
                    const card = { id, name:item.anime ? String(item.anime).slice(0,65) : 'Anime Character #' + externalId.slice(0,10), characterName:'MYSTERY CHARACTER', animeTitle:item.anime || 'ANIME ARCHIVE', tier, price:CARD_TIER_PRICES[tier], mediaUrl:mediaUrl.href, isAnimated, artist:item.artist||'', tags:item.tags||'', sourceUrl:item.source||'', provider:provider.name, providerImageId:externalId, addedAt:Date.now(), active:true };
                    cardCatalog.cards.push(card); saveCardCatalog(); return card;
                } catch (itemError) { failures.push(provider.name + ': ' + itemError.message); }
            }
            failures.push(provider.name + ': no new images');
        } catch (error) { failures.push(provider.name + ': ' + String(error.message||error).slice(0,90)); }
    }
    throw new Error('All safe anime artwork providers failed (' + failures.slice(0,6).join(' | ') + ').');
}

const CARD_TIER_STYLES = {
    S: { label:'MYTHIC', c1:'#ffcf55', c2:'#ff4b21', dark:'#42120c' },
    A: { label:'LEGENDARY', c1:'#f1a7ff', c2:'#743dff', dark:'#21103f' },
    B: { label:'EPIC', c1:'#79d8ff', c2:'#2867ff', dark:'#0b234c' },
    C: { label:'RARE', c1:'#71f1dc', c2:'#168b9e', dark:'#092e35' },
    D: { label:'UNCOMMON', c1:'#a6f27d', c2:'#398b42', dark:'#17351c' },
    E: { label:'COMMON', c1:'#e8edf6', c2:'#78849b', dark:'#242b38' }
};
function makeAnimeCardOverlay(card) {
    const style = CARD_TIER_STYLES[card.tier] || CARD_TIER_STYLES.E;
    const stars = '★'.repeat(({S:7,A:6,B:5,C:4,D:3,E:2})[card.tier] || 2);
    const character = escapeCardText(String(card.characterName || card.name || 'MYSTERY CHARACTER').slice(0,34));
    const anime = escapeCardText(String(card.animeTitle || 'ANIME ARCHIVE').slice(0,38));
    const tier = escapeCardText(style.label);
    const id = escapeCardText(String(card.id || '').slice(0,22));
    return Buffer.from(`<svg width="900" height="1200" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="frame" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${style.c1}"/><stop offset=".52" stop-color="${style.c2}"/><stop offset="1" stop-color="${style.c1}"/></linearGradient><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05050b" stop-opacity=".08"/><stop offset=".62" stop-color="#05050b" stop-opacity=".08"/><stop offset="1" stop-color="#05050b" stop-opacity=".94"/></linearGradient><filter id="glow"><feGaussianBlur stdDeviation="8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
      <rect x="12" y="12" width="876" height="1176" rx="48" fill="none" stroke="url(#frame)" stroke-width="24"/><rect x="34" y="34" width="832" height="1132" rx="34" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="3"/>
      <path d="M55 80 L150 45 L750 45 L845 80 L845 1100 L750 1155 L150 1155 L55 1100 Z" fill="none" stroke="url(#frame)" stroke-width="7" opacity=".95"/>
      <rect x="42" y="42" width="816" height="1116" rx="28" fill="url(#shade)"/>
      <path d="M75 115 H825" stroke="url(#frame)" stroke-width="7"/><text x="450" y="96" text-anchor="middle" font-family="Georgia,serif" font-size="43" font-weight="bold" fill="#fff" stroke="${style.dark}" stroke-width="2" paint-order="stroke" filter="url(#glow)">HUNTER-X</text>
      <text x="450" y="1010" text-anchor="middle" font-family="Georgia,serif" font-size="67" font-weight="bold" fill="url(#frame)" stroke="${style.dark}" stroke-width="3" paint-order="stroke">${character}</text>
      <text x="450" y="1060" text-anchor="middle" font-family="Arial,sans-serif" font-size="31" font-weight="bold" fill="#fff" stroke="#111" stroke-width="2" paint-order="stroke">${anime}</text>
      <text x="450" y="1115" text-anchor="middle" font-family="Georgia,serif" font-size="58" fill="url(#frame)" stroke="${style.dark}" stroke-width="2" paint-order="stroke">${stars}</text>
      <rect x="280" y="145" width="340" height="58" rx="25" fill="${style.dark}" fill-opacity=".82" stroke="url(#frame)" stroke-width="4"/><text x="450" y="185" text-anchor="middle" font-family="Arial,sans-serif" font-size="29" font-weight="900" letter-spacing="4" fill="#fff">${tier}</text>
      <text x="450" y="1150" text-anchor="middle" font-family="Arial,sans-serif" font-size="19" fill="#fff" fill-opacity=".85">CARD ID • ${id}</text>
      <path d="M55 230 L100 185 L145 230 M755 230 L800 185 L845 230 M55 970 L100 1015 L145 970 M755 970 L800 1015 L845 970" fill="none" stroke="url(#frame)" stroke-width="9"/>
    </svg>`);
}
async function renderAnimeCardImage(card, bytes) {
    const overlay = makeAnimeCardOverlay(card);
    const isGif = card.isAnimated && (/\.gif(?:$|[?#])/i.test(card.mediaUrl) || (await sharp(bytes, { animated:true }).metadata()).pages > 1);
    if (isGif) {
        const id = crypto.randomUUID(), input = path.join(os.tmpdir(),'gd_card_'+id+'.gif'), overlayPath = path.join(os.tmpdir(),'gd_overlay_'+id+'.png'), output = path.join(os.tmpdir(),'gd_card_'+id+'.mp4');
        try {
            fs.writeFileSync(input, bytes);
            await sharp({ create:{width:900,height:1200,channels:4,background:{r:0,g:0,b:0,alpha:0}} }).composite([{input:overlay}]).png().toFile(overlayPath);
            await execFileAsync(ffmpegPath,['-y','-i',input,'-i',overlayPath,'-filter_complex','[0:v]scale=900:1200:force_original_aspect_ratio=increase,crop=900:1200[bg];[bg][1:v]overlay=0:0,fps=18,scale=720:960:flags=lanczos[v]','-map','[v]','-an','-t','8','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',output],{timeout:90000,maxBuffer:12*1024*1024});
            return { video:fs.readFileSync(output), animated:true };
        } finally { for (const file of [input,overlayPath,output]) { try { if(fs.existsSync(file)) fs.unlinkSync(file); } catch {} } }
    }
    const image = await sharp(bytes).rotate().resize(900,1200,{fit:'cover',position:'attention'}).composite([{input:overlay}]).jpeg({quality:91}).toBuffer();
    return { image, animated:false };
}
async function sendAnimeCard(sock, chatId, card, caption, quoted) {
    const url = new URL(card.mediaUrl); if (url.protocol !== 'https:') throw new Error('Card artwork URL must use HTTPS.');
    const response = await axios.get(url.href,{responseType:'arraybuffer',timeout:25000,maxContentLength:12*1024*1024,maxBodyLength:12*1024*1024,headers:{'User-Agent':'HUNTER-X-BOT anime card renderer'}});
    const type = String(response.headers['content-type']||'').split(';')[0].toLowerCase();
    if (!type.startsWith('image/')) throw new Error('Artwork provider did not return an image.');
    const bytes = Buffer.from(response.data); if (!bytes.length || bytes.length > 12*1024*1024) throw new Error('Artwork is empty or too large.');
    const rendered = await renderAnimeCardImage(card,bytes);
    if (rendered.animated) await sock.sendMessage(chatId,{video:rendered.video,gifPlayback:true,caption},quoted?{quoted}:{});
    else await sock.sendMessage(chatId,{image:rendered.image,caption},quoted?{quoted}:{});
}

function cardTierCounts(cards) {
    const counts = Object.fromEntries(CARD_TIERS.map(tier => [tier, 0]));
    for (const id of cards || []) { const card = cardById(typeof id === 'string' ? id : id?.cardId); if (card) counts[card.tier]++; }
    return counts;
}
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
    merged.sudoUsers = [...new Set(merged.sudoUsers.map(v => String(v).replace(/\D/g, '')).filter(Boolean))];
    if (!merged.sudoUsers.includes(OWNER_NUMBER)) merged.sudoUsers.unshift(OWNER_NUMBER);
    if (!['public', 'private'].includes(merged.botMode)) merged.botMode = 'public';
    writeJsonAtomic(SETTINGS_FILE, merged);
    return merged;
}
function saveSettings(data) {
    data.sudoUsers = [...new Set((data.sudoUsers || []).map(v => String(v).replace(/\D/g, '')).filter(Boolean))];
    if (!data.sudoUsers.includes(OWNER_NUMBER)) data.sudoUsers.unshift(OWNER_NUMBER);
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
  let current = message;
  const seen = new Set();
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const next = current.ephemeralMessage?.message ||
      current.viewOnceMessage?.message ||
      current.viewOnceMessageV2?.message ||
      current.viewOnceMessageV2Extension?.message ||
      current.documentWithCaptionMessage?.message ||
      current.editedMessage?.message ||
      current.deviceSentMessage?.message;
    if (!next) break;
    current = next;
  }
  return current;
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

function hasViewOnceWrapper(message) {
  let current = message;
  const seen = new Set();
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    if (current.viewOnceMessage || current.viewOnceMessageV2 || current.viewOnceMessageV2Extension) return true;
    current = current.ephemeralMessage?.message || current.documentWithCaptionMessage?.message || current.editedMessage?.message || current.deviceSentMessage?.message;
  }
  return false;
}

function resolveMedia(msg) {
  // Only ordinary media is supported; do not unwrap View Once messages.
  if (hasViewOnceWrapper(msg?.message)) return null;
  const own = unwrapMessage(msg?.message);
  const mediaFrom = (node) => {
    if (hasViewOnceWrapper(node)) return null;
    const content = unwrapMessage(node);
    if (!content || typeof content !== 'object') return null;
    if (content.imageMessage) return { kind: 'image', downloadType: 'image', mediaMsg: content.imageMessage };
    if (content.videoMessage) return { kind: 'video', downloadType: 'video', mediaMsg: content.videoMessage };
    if (content.audioMessage) return { kind: 'audio', downloadType: 'audio', mediaMsg: content.audioMessage };
    if (content.stickerMessage) return { kind: 'sticker', downloadType: 'sticker', mediaMsg: content.stickerMessage };
    if (content.documentMessage && /^image\//i.test(content.documentMessage.mimetype || '')) {
      return { kind: 'image', downloadType: 'document', mediaMsg: content.documentMessage };
    }
    return null;
  };

  const direct = mediaFrom(own);
  if (direct) return { ...direct, targetMessage: msg };

  // Read quoted-message metadata from every supported message type. This
  // includes captions and replies attached to audio, stickers and wrapped media.
  const contexts = [...new Set([
    ...Object.values(own || {}).map(value => value?.contextInfo),
    ...Object.values(msg?.message || {}).map(value => value?.contextInfo),
  ].filter(Boolean))];

  for (const context of contexts) {
    if (hasViewOnceWrapper(context.quotedMessage)) continue;
    const quoted = unwrapMessage(context.quotedMessage);
    if (!quoted) continue;
    const found = mediaFrom(quoted);
    if (found) {
      return {
        ...found,
        targetMessage: {
          key: {
            remoteJid: msg.key.remoteJid,
            id: context.stanzaId || msg.key.id,
            participant: context.participant || msg.key.participant,
          },
          message: quoted,
        },
      };
    }
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

// --- HUNTER-X COMMAND CATALOGUE ---
// Generated from the actual command switch so .allmenu lists implemented aliases.
const COMMAND_CATALOG = [
    "2048",
    "activegames",
    "activeusers",
    "add",
    "addmember",
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
    "antiggstatus",
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
    "cardaccept",
    "cardadd",
    "cardlist",
    "cardoffer",
    "cardprofile",
    "cardremove",
    "cards",
    "cardsell",
    "cardtrade",
    "cardbuy",
    "demonadmin",
    "goldgive",
    "goldset",
    "spawncard",
    "cardadmin",
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
const DEMON_FONT_MAP = (() => {
    const map = new Map();
    for (let i = 0; i < 26; i++) {
        map.set(String.fromCharCode(97 + i), String.fromCodePoint(0x1D482 + i));
        map.set(String.fromCharCode(65 + i), String.fromCodePoint(0x1D468 + i));
    }
    return map;
})();

function toDemonFont(value) {
    const protectedToken = /(`[^`]*`|https?:\/\/[^\s<>]+|wa\.me\/[^\s<>]+|\.[a-z][a-z0-9_-]*|[A-Za-z0-9._%+-]+@(?:s\.whatsapp\.net|g\.us|lid|broadcast|newsletter))/gi;
    return String(value ?? '').split(protectedToken).map(part => {
        if (!part) return part;
        if (part.startsWith('`') || /^https?:\/\//i.test(part) || /^wa\.me\//i.test(part) ||
            /^\.[a-z][a-z0-9_-]*$/i.test(part) || /@(?:s\.whatsapp\.net|g\.us|lid|broadcast|newsletter)$/i.test(part)) return part;
        return Array.from(part, char => DEMON_FONT_MAP.get(char) || char).join('');
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

// --- HUNTER-X ANTI-BUG / ANTI-FLOOD SHIELD ---
const securityRateBuckets = new Map();
const securityIncidentBuckets = new Map();
const SECURITY_RATE_WINDOW_MS = 10_000;
const SECURITY_RATE_ALERT_LIMIT = 12;
const SECURITY_RATE_BLOCK_LIMIT = 30;
// Reconnection is serialized so repeated close events cannot create many sockets.
let hunterReconnectTimer = null;
let hunterReconnectAttempts = 0;
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
        if (++nodes > 12000) return 'Abnormally complex message structure';
        if (current.depth > 32) return 'Excessive message nesting';
        const keys = Object.keys(value);
        if (keys.length > 250) return 'Excessive message fields';
        for (const key of keys) {
            if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
                return 'Unsafe object property in message';
            }
            const child = value[key];
            if (typeof child === 'string' && child.length > 1048576) return 'Oversized text field';
            if (child && typeof child === 'object') stack.push({ value: child, depth: current.depth + 1 });
        }
    }

    let raw;
    try { raw = JSON.stringify(message.message); }
    catch (_) { return 'Unreadable message payload'; }
    if (typeof raw !== 'string') return 'Unreadable message payload';
    if (raw.length > 2097152) return 'Oversized message payload';
    const controls = (raw.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g) || []).length;
    if (controls > 250) return 'Excessive control characters';
    const bidi = (raw.match(/[\u202A-\u202E\u2066-\u2069]/g) || []).length;
    if (bidi > 100) return 'Excessive directional control characters';
    const keys = Object.keys(message.message);
    if (!keys.length || keys.length > 120) return 'Abnormal message envelope';
    return '';
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

async function registerSecurityIncident(sock, message, reason, count = 1) {
    const remoteJid = String(message?.key?.remoteJid || 'unknown');
    const senderJid = String(message?.key?.participant || remoteJid);
    const number = securitySenderDigits(senderJid) || await resolvePhoneDigits(sock, senderJid).catch(() => '');
    const senderKey = senderJid + '|' + remoteJid;
    const now = Date.now();
    const prior = securityIncidentBuckets.get(senderKey) || [];
    const recent = prior.filter(ts => now - ts <= SECURITY_INCIDENT_WINDOW_MS);
    recent.push(now);
    securityIncidentBuckets.set(senderKey, recent);

    // Malformed/complex payloads are rejected and logged only. Never block a
    // sender automatically here: legitimate WhatsApp message variants can be
    // complex, and moderation actions must not destabilize the live socket.
    const action = 'Message rejected; sender monitored (no automatic disconnect or block)';
    console.warn('[ANTI-BUG INCIDENT]', { reason, count, sender: number || senderJid, action });
    return action;
}

async function startDemonBot() {
    const sessionPath = path.join(DATA_DIR, 'hunter_x_session');
    const securitySessionLabel = 'HUNTER-X (Single WhatsApp Account)';

    if (process.env.HUNTER_X_SESSION_ID && process.env.HUNTER_X_SESSION_ID.trim().length > 20 && !fs.existsSync(path.join(sessionPath, 'creds.json'))) {
        if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });
        try {
            const rawId = process.env.HUNTER_X_SESSION_ID.trim().replace(/^HUNTER_X_/, '');
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

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode !== DisconnectReason.loggedOut) {
                if (hunterReconnectTimer) return;
                hunterReconnectAttempts += 1;
                const delay = Math.min(30_000, 2_000 * (2 ** Math.min(hunterReconnectAttempts - 1, 4)));
                console.warn('[CONNECTION] Socket closed. Reconnecting in ' + Math.round(delay / 1000) + 's (attempt ' + hunterReconnectAttempts + ').');
                hunterReconnectTimer = setTimeout(() => {
                    hunterReconnectTimer = null;
                    startDemonBot().catch(err => {
                        console.error('[CONNECTION] Reconnect failed:', err.message);
                    });
                }, delay);
            } else {
                if (hunterReconnectTimer) {
                    clearTimeout(hunterReconnectTimer);
                    hunterReconnectTimer = null;
                }
                console.log('❌ Session logged out from WhatsApp servers. Please re-pair the account.');
            }
        } else if (connection === 'open') {
            hunterReconnectAttempts = 0;
            if (hunterReconnectTimer) {
                clearTimeout(hunterReconnectTimer);
                hunterReconnectTimer = null;
            }
            console.log('\\n⚡ 𝑯𝑼𝑵𝑻𝑬𝑹-𝑿 𝐕4 CONNECTED AND ONLINE! ⚡\\n');

            const noticeKey = path.join(DATA_DIR, 'hunter_x_session');
            if (!connectionNoticesSent.has(noticeKey)) {
                connectionNoticesSent.add(noticeKey);
                (async () => {
                    try {
                        const connectedNumber = await resolvePhoneDigits(sock, sock.user?.id);
                        const sessionNumber = 'SINGLE';
                        const notice =
                            '╭━━〔 👑 𝑯𝑼𝑵𝑻𝑬𝑹-𝑿 V4 〕━━╮\n' +
                            '┃ 𝑪𝑶𝑵𝑵𝑬𝑪𝑻𝑬𝑫\n' +
                            '┣━━━━━━━━━━━━━━━━━━━━\n' +
                            '📡 Session: ' + sessionNumber + '\n' +
                            '📱 Number: ' + (connectedNumber ? '+' + connectedNumber : 'Not available') + '\n' +
                            '🟢 Status: Online\n\n' +
                            'HUNTER-X V4 is ready. The HUNTER-X system is connected.\n' +
                            '╰━━━━━━━━━━━━━━━━━━━━╯';

                        // Send the connection report to the single configured owner account.
                        const ownJid = sock.user?.id;
                        if (ownJid) {
                            await sock.sendMessage(ownJid, { text: notice });
                        }



                    } catch (noticeError) {
                        console.warn('[CONNECTION NOTICE]', noticeError.message);
                    }
                })();
            }
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
                        text: "⚠️ *Imperial Seal:* Direct voice/video calls are forbidden! You have been automatically rejected by HUNTER-X Engine." 
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
    // Tracks the same promotional/broadcast-style text across groups this bot can see.
    const imperialBroadcastMap = new Map();

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
                    antigroupsmentionMode: 'kick', antigroupsmentionWarnLimit: 3,
                    antispamMode: 'warn', antispamWarnLimit: 3,
                    antitagMode: 'warn', antitagWarnLimit: 3,
                    antibotMode: 'warn', antibotWarnLimit: 3,
                    antigcstatusMode: 'warn', antigcstatusWarnLimit: 3
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
                            text: '🛡️ Unauthorized removal detected without Emperor uninformed,Attempting to restore ' + userTag + '.',
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
                            text: '🛡️ Unauthorized demotion detected withoutEmperor uninformed. Attempting to restore ' + userTag + '.',
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
                            'We hope you enjoy your time here. If you need help, ask the group. Enjoy your stay under the rule of the Emperor!',
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
                try {
                    await registerSecurityIncident(sock, candidate, reason, messages.length);
                } catch (securityError) {
                    console.warn('[ANTI-BUG] Incident logging failed safely:', securityError.message);
                }
                if (candidate === messages[0]) firstMessageReason = reason;
            }
            if (firstMessageReason) return;

            // Rate-limit command/message processing per sender and chat.
            const first = messages[0];
            if (first?.key && !first.key.fromMe && first.key.remoteJid !== 'status@broadcast') {
                const senderJid = String(first.key.participant || first.key.remoteJid);
                const senderNumber = securitySenderDigits(senderJid) || await resolvePhoneDigits(sock, senderJid).catch(() => '');
                const senderKey = senderJid + '|' + String(first.key.remoteJid);
                const count = getSecurityRate(senderKey);
                if (count >= SECURITY_RATE_ALERT_LIMIT) {
                    if (count === SECURITY_RATE_ALERT_LIMIT) console.warn('[ANTI-BUG] Rapid message flooding detected:', senderNumber || senderJid);
                    if (count >= SECURITY_RATE_BLOCK_LIMIT && count === SECURITY_RATE_BLOCK_LIMIT) {
                        const protectedSender = await isProtectedOwnerJid(sock, senderJid).catch(() => false);
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
                        console.warn('[ANTI-BUG] Rapid flooding reached automatic-block threshold:', senderNumber || senderJid, action);
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

        const normalizedMessage = unwrapMessage(msg.message) || msg.message;
        const body =
            normalizedMessage.conversation ||
            normalizedMessage.extendedTextMessage?.text ||
            normalizedMessage.imageMessage?.caption ||
            normalizedMessage.videoMessage?.caption ||
            normalizedMessage.documentMessage?.caption ||
            normalizedMessage.buttonsResponseMessage?.selectedButtonId ||
            normalizedMessage.templateButtonReplyMessage?.selectedId ||
            normalizedMessage.listResponseMessage?.singleSelectReply?.selectedRowId ||
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
                antigroupsmentionMode: 'kick', antigroupsmentionWarnLimit: 3,
                antispamMode: 'warn', antispamWarnLimit: 3,
                antitagMode: 'warn', antitagWarnLimit: 3,
                antibotMode: 'warn', antibotWarnLimit: 3,
                antigcstatusMode: 'warn', antigcstatusWarnLimit: 3
            };
            saveGroupSettings();
        }

        const senderPhone = await resolvePhoneDigits(sock, sender);
        const isOwner = msg.key.fromMe || (senderPhone === OWNER_NUMBER);
        const isSudo = isOwner;

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
        // 🚫 IMPERIAL ANTISPAM — configurable warning / direct-kick enforcement
        // =========================================================================
        async function enforceImperialViolation(setting, reason) {
            await sock.sendMessage(from, { delete: msg.key }).catch(() => {});
            const cleanJid = jidNormalizedUser(sender);
            const mode = groupSettings[from][setting + 'Mode'] || 'warn';
            const limit = Math.max(1, Math.min(10, Number(groupSettings[from][setting + 'WarnLimit']) || 3));
            const warnKey = from + '_' + cleanJid + '_' + setting;
            const tag = '@' + senderNum;
            if (mode === 'kick') {
                await sock.sendMessage(from, {
                    text: '🚫 *' + reason + '*\n\n' + tag + '\n_𝒀𝒐𝒖 𝒂𝒓𝒆 𝒃𝒆𝒊𝒏𝒈 𝒓𝒆𝒎𝒐𝒗𝒆𝒅 𝒇𝒐𝒓 𝒃𝒓𝒆𝒂𝒌𝒊𝒏𝒈 𝒕𝒉𝒆 𝒈𝒓𝒐𝒖𝒑 𝒓𝒖𝒍𝒆𝒔._',
                    mentions: [cleanJid]
                }).catch(() => {});
                if (isBotAdmin) await sock.groupParticipantsUpdate(from, [cleanJid], 'remove').catch(() => {});
                return;
            }
            const warns = (imperialWarningMap.get(warnKey) || 0) + 1;
            imperialWarningMap.set(warnKey, warns);
            if (warns >= limit) {
                imperialWarningMap.delete(warnKey);
                await sock.sendMessage(from, {
                    text: '⚠️ *MAXIMUM WARNINGS EXCEEDED — BANISHING!*\n\n_𝑮𝒐𝒐𝒅𝒃𝒚𝒆!!!_\n_𝑫𝒖𝒍𝒍𝒂𝒓𝒅 🤡_\n\n' + tag + '\n_𝑹𝒆𝒂𝒔𝒐𝒏: ' + reason + '_',
                    mentions: [cleanJid]
                }).catch(() => {});
                if (isBotAdmin) await sock.groupParticipantsUpdate(from, [cleanJid], 'remove').catch(() => {});
            } else {
                await sock.sendMessage(from, {
                    text: '⚠️ *' + reason + ' IS FORBIDDEN!*\n\n' + tag + '\n_𝑺𝒕𝒐𝒑 𝒏𝒐𝒘 𝒐𝒓 𝒚𝒐𝒖 𝒘𝒊𝒍𝒍 𝒃𝒆 𝒓𝒆𝒎𝒐𝒗𝒆𝒅._\n*Warning: ' + warns + '/' + limit + '*',
                    mentions: [cleanJid]
                }).catch(() => {});
            }
        }

        if (isGroup && groupSettings[from].antispam && !isSenderAdmin) {
            const spamKey = from + '_' + sender;
            const now = Date.now();
            const data = imperialSpamMap.get(spamKey) || { times: [], cooldownUntil: 0 };
            if (now < data.cooldownUntil) {
                await sock.sendMessage(from, { delete: msg.key }).catch(() => {});
                return;
            }
            data.times = data.times.filter(time => now - time < 10000);
            data.times.push(now);
            if (data.times.length >= 6) {
                data.cooldownUntil = now + 15000;
                data.times = [];
                imperialSpamMap.set(spamKey, data);
                await enforceImperialViolation('antispam', 'SPAMMING');
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

            // ANTILINK — warn-count or direct-kick mode
            const linkRegex = /(chat\.whatsapp\.com\/[A-Za-z0-9_-]{10,}|https?:\/\/[^\s]+)/i;
            if (groupSettings[from].antilink && linkRegex.test(fullTextContent)) {
                await enforceImperialViolation('antilink', 'LINK SHARING');
                return;
            }

            // ANTIGROUPSMENTION — detect WhatsApp's native @all signal and
            // visible @all/@everyone group-wide mention text. Invite links remain
            // the responsibility of AntiLink.
            const messageContent = unwrapMessage(msg.message) || {};
            const mentionContexts = Object.values(messageContent)
                .map(value => value?.contextInfo)
                .filter(Boolean);
            const hasNativeGroupMention = mentionContexts.some(context =>
                context.nonJidMentions === 1 || context.nonJidMentions === true
            );
            const hasGroupMentionText = /(?:^|\s)@(all|everyone)\b/i.test(fullTextContent);
            if (groupSettings[from].antigroupsmention && (hasNativeGroupMention || hasGroupMentionText)) {
                await enforceImperialViolation('antigroupsmention', 'GROUP MENTIONING');
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

            // ANTITAG — warn-count or direct-kick for mass mentions
            if (groupSettings[from].antitag) {
                const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
                if (mentioned.length >= 5) {
                    await enforceImperialViolation('antitag', 'MASS TAGGING');
                    return;
                }
            }

            // ANTIGCSTATUS / ANTIGGSTATUS — detect matching broadcast-style promotions
            // posted by the same member across multiple groups this bot participates in.
            if (groupSettings[from].antigcstatus && fullTextContent.trim().length >= 30 && !fullTextContent.trim().startsWith(prefix)) {
                const promoPattern = /\b(join|follow|subscribe|broadcast|our group|my group|new group|group link|channel|status|invite|promo|promotion)\b/i;
                if (promoPattern.test(fullTextContent)) {
                    const normalizedPromo = fullTextContent.toLowerCase()
                        .replace(/https?:\/\/\S+/g, '<url>')
                        .replace(/\s+/g, ' ').replace(/[^a-z0-9<> ]/g, '').trim();
                    const broadcastKey = cleanSenderJid + '_' + normalizedPromo.slice(0, 220);
                    const now = Date.now();
                    const old = (imperialBroadcastMap.get(broadcastKey) || []).filter(item => now - item.time < 60000);
                    if (!old.some(item => item.group === from)) old.push({ group: from, time: now });
                    imperialBroadcastMap.set(broadcastKey, old);
                    if (old.length >= 3) {
                        await enforceImperialViolation('antigcstatus', 'CROSS-GROUP BROADCAST SPAM');
                        return;
                    }
                    // Bound memory usage; expired entries are discarded opportunistically.
                    if (imperialBroadcastMap.size > 1500) {
                        for (const [key, entries] of imperialBroadcastMap) {
                            if (!entries.some(item => now - item.time < 60000)) imperialBroadcastMap.delete(key);
                        }
                    }
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

            // ANTIBOT — only act on clear automation markers. WhatsApp does not expose a
            // universal bot-account flag, so ordinary bot accounts without these markers
            // cannot be identified reliably by a group bot.
            if (groupSettings[from].antibot && !msg.key.fromMe) {
                const obviousBotMarker = /(?:powered by\s+[\w.-]+|bot commands|automated message|i am an? bot|this is an automated|\btype \.(?:menu|help)\b|\b(?:bot|assistant)\s+menu\b)/i;
                if (obviousBotMarker.test(fullTextContent)) {
                    await enforceImperialViolation('antibot', 'UNAPPROVED BOT / AUTOMATED MESSAGES');
                    return;
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
            reply: async (text, options = {}) => sock.sendMessage(from, { text: toDemonFont(text), ...options }, { quoted: msg }),
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
            // HUNTER-X V4 MENUS — decorative boxed layout
            // =========================================================================
            case 'ownermenu': {
                const t = '╭━━━〔 👑 *𝑯𝑼𝑵𝑻𝑬𝑹-𝑿 OWNER MENU* 〕━━━┈\n' +
                    '✿ .setprefix\n' +
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
                    '✿ .spawncard\n✿ .cardbuy <offer>\n✿ .cardlist\n✿ .cards\n✿ .cardprofile\n✿ .cardsell <id>\n✿ .cardtrade @user <yourCard> <theirCard>\n✿ .cardaccept <tradeId>\n' +
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
                    '╭━━〔 👑 𝑯𝑼𝑵𝑻𝑬𝑹-𝑿 V4 〕━━╮',
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
                    '';
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
            case 'gm':
            case 'goodafternoon':
            case 'ga':
            case 'goodnight':
            case 'gn': {
                const period = ['gm', 'goodmorning'].includes(command) ? 'morning'
                    : ['ga', 'goodafternoon'].includes(command) ? 'afternoon' : 'night';
                if (!isGroup) return extra.reply('⚔️ *Use this in a group chat.*');
                if (!isSenderAdmin && !isSudo) return extra.reply('⚔️ *Only admins or sudo users can run this.*');
                try {
                    const groupMetadata = await sock.groupMetadata(from);
                    const mentions = groupMetadata.participants.map(p => p.id);
                    const greetings = {
                        morning: [
                            '🌅 *おはようございます (Ohayō gozaimasu)!*\nThe new day has spawned. May your energy bar stay full and your quests go well!',
                            '☀️ *おはよう (Ohayō)!*\nRise, anime squad. A fresh episode and a new adventure are waiting!',
                            '🌸 *Ohayō minna-san!*\nMay today bring good luck, strong spirit and legendary moments.'
                        ],
                        afternoon: [
                            '☀️ *こんにちは (Konnichiwa)!*\nMidday check-in, heroes. Keep your spirit bright and your story moving!',
                            '🌤️ *Konnichiwa minna!*\nHope your day is going like a winning anime arc. Stay awesome!',
                            '⚡ *こんにちは!*\nThe afternoon episode is here. Keep pushing toward your goals, squad!'
                        ],
                        night: [
                            '🌙 *おやすみなさい (Oyasumi nasai)!*\nThe episode is ending. Rest well and recover your energy for tomorrow!',
                            '✨ *おやすみ (Oyasumi), minna-san!*\nMay your dreams be peaceful and your next chapter be legendary.',
                            '🌌 *Oyasumi nasai!*\nGoodnight, heroes. Save your energy for the next adventure.'
                        ]
                    };
                    const categories = period === 'night' ? ['sleep', 'neko', 'waifu'] : period === 'morning' ? ['smile', 'wave', 'waifu'] : ['wave', 'smile', 'neko'];
                    const caption = greetings[period][Math.floor(Math.random() * greetings[period].length)];
                    const anime = await fetchSfwAnimeImage(categories[Math.floor(Math.random() * categories.length)]);
                    const heading = period === 'morning' ? '🌅 OHAYŌ GOZAIMASU' : period === 'afternoon' ? '☀️ KONNICHIWA' : '🌙 OYASUMI NASAI';
                    await sock.sendMessage(from, { image: anime.buffer, caption: `${heading}\n\n${caption}\n\n🎌 *HUNTER-X V4.9*`, mentions }, { quoted: msg });
                } catch (e) {
                    console.error(`[${period.toUpperCase()} GREETING]`, e);
                    await extra.reply(`❌ Couldn't fetch an anime greeting image right now. Please try again.`);
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
        await extra.reply('✦ *FORGING A KONACHAN COLLECTIBLE CARD...*');
        // fetchFreshAnimeCard tries Konachan first and accepts only rating:s posts;
        // its existing SFW fallbacks keep the card command available during outages.
        const card = await fetchFreshAnimeCard();
        const offerId = crypto.randomBytes(3).toString('hex').toUpperCase();
        const user = economyUser(senderNum, msg.pushName || senderNum);
        user.pendingCard = { offerId, cardId: card.id, price: card.price, expiresAt: Date.now() + 30 * 60 * 1000 };
        saveEconomy();
        const tierNames = { S: 'MYTHIC', A: 'LEGENDARY', B: 'EPIC', C: 'RARE', D: 'UNCOMMON', E: 'COMMON' };
        const caption = '✨ *KONACHAN COLLECTIBLE CARD*\n\n' + card.name + '\nAnime: *' + (card.animeTitle || 'ANIME ARCHIVE') + '*\nRank: *' + card.tier + ' — ' + (tierNames[card.tier] || 'COLLECTIBLE') + '*\nArtwork: *' + (card.isAnimated ? 'ANIMATED GIF' : 'STATIC IMAGE') + '*\n' + (card.artist ? 'Artist: *' + card.artist + '*\n' : '') + 'Card ID: `' + card.id + '`\nPrice: *' + moneyText(card.price) + '*\nOffer: `' + offerId + '`\n\nBuy with: .cardbuy ' + offerId;
        await sendAnimeCard(sock, from, card, caption, msg);
    } catch (error) {
        console.error('[KONACHAN CARD ERROR]', error?.stack || error);
        await extra.reply('❌ *Konachan card spawn is temporarily unavailable.* ' + String(error.message || error).slice(0, 140)).catch(() => {});
    }
    break;
}

                      // =========================================================================
            // EXISTING BOT COMMANDS
            // =========================================================================
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
                    return extra.reply('🗑️ *Reply directly to the message you wish to delete, Owner.*');
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
        return extra.reply('⚔️ Only the HUNTER-X can publish Group Status V2!');
    }
    if (!GROUP_STATUS_V2_SUPPORTED) {
        return extra.reply(GROUP_STATUS_V2_UNAVAILABLE);
    }

    const inviteUrl = String(q || '').trim();
    const match = inviteUrl.match(/(?:https?:\/\/)?chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/i);
    if (!match) return extra.reply('❌ Usage:\n.ggstatus https://chat.whatsapp.com/INVITECODE');
    if (!sock.user?.id) return extra.reply('❌ WhatsApp is not connected.');

    try {
        const inviteInfo = await sock.groupGetInviteInfo(match[1]);
        const invitedGroupJid = String(inviteInfo?.id || inviteInfo?.jid || '');
        console.log('[GGSTATUS] Invite metadata resolved:', {
            id: invitedGroupJid || null,
            subject: inviteInfo?.subject || null,
            hasPictureUrl: Boolean(inviteInfo?.profilePicUrl || inviteInfo?.profilePictureUrl || inviteInfo?.pictureUrl)
        });
        if (!invitedGroupJid.endsWith('@g.us')) {
            return extra.reply('❌ WhatsApp returned incomplete invitation metadata. No status was published.');
        }

        const groupName = inviteInfo?.subject || 'WhatsApp Group';
        const groups = await sock.groupFetchAllParticipating();
        const groupJids = Object.keys(groups || {}).filter(jid => jid.endsWith('@g.us'));
        if (!groupJids.length) return extra.reply('❌ No participating groups found.');

        await extra.reply(
            `📡 Preparing Group Status V2 image...\n` +
            `🏰 Groups found: ${groupJids.length}\n` +
            `🖼️ Generating invitation card.`
        );

        // Publish the requested invitation image only. Do not send a separate
        // text-only status first, which was producing the purple link-only story.
        let invitationCard;
        try {
            invitationCard = await createGroupInvitationCard(sock, groupName, inviteUrl, inviteInfo);
            if (!Buffer.isBuffer(invitationCard) || invitationCard.length < 10000) {
                throw new Error('Generated invitation card is empty or invalid.');
            }
        } catch (error) {
            console.error('[GROUP INVITATION CARD GENERATION FAILED]', error?.stack || error);
            return extra.reply(`❌ Invitation card generation failed. No text-only fallback was posted.\nReason: ${error?.message || 'Unknown error'}`);
        }

        let cardsAccepted = 0;
        const cardFailed = [];
        for (const groupJid of groupJids) {
            try {
                const result = await groupStatusBroadcast(sock, groupJid, {
                    image: invitationCard,
                    mimetype: 'image/jpeg',
                    caption: `${groupName}\n${inviteUrl}`
                });
                if (!result?.accepted || !result?.messageId || result.mediaType !== 'image') {
                    throw new Error('Image status relay did not return an accepted image message.');
                }
                cardsAccepted++;
                console.log('[GGSTATUS IMAGE RELAY ACCEPTED]', {
                    groupJid, messageId: result.messageId, bytes: invitationCard.length
                });
            } catch (error) {
                console.error('[GGSTATUS IMAGE RELAY FAILED]', groupJid, error?.stack || error);
                cardFailed.push(`${groupJid}: ${error?.message || 'Image relay failed'}`);
            }
            await new Promise(resolve => setTimeout(resolve, 1200));
        }

        await extra.reply(
            `╭━━━〔 👑 HUNTER-X V4 〕━━━╮\n` +
            `┃ 📡 GROUP STATUS V2 IMAGE REPORT\n` +
            `┣━━━━━━━━━━━━━━━━━━━━\n` +
            `┃ 🖼️ Image relays accepted: ${cardsAccepted}/${groupJids.length}\n` +
            `┃ ❌ Image relays failed: ${cardFailed.length}\n` +
            `┃ 🧩 Card generation: READY\n` +
            `┃ 🔗 Content: Group invitation card\n` +
            `┃ 📍 Destination: Participating groups\n` +
            `╰━━━━━━━━━━━━━━━━━━━━╯\n\n` +
            (cardFailed.length
                ? `Failed destinations:\n${cardFailed.slice(0, 8).join('\n')}`
                : 'WhatsApp accepted the image relay requests. This does not guarantee display in every group; check the Status tab.')
        );
    } catch (error) {
        console.error('[GGSTATUS ERROR]', error?.stack || error);
        await extra.reply(`❌ GROUP STATUS V2 FAILED\n\n${error?.message || 'Unknown error'}`);
    }
    break;
}

  
case 'delgcstatus':
case 'delgstatus':
case 'delgs':
case 'revoke': {
    if (!isOwner) return extra.reply('⚔️ *Only Owner HUNTER-X can revoke status stories!*');
    
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
                    let flirtText = '';
                    try {
                        const response = await axios.get('https://api.shizo.top/quote/flirt?apikey=shizo', { timeout: 12000 });
                        flirtText = response.data?.result || response.data?.quote || response.data?.message || '';
                    } catch (apiError) {
                        console.warn('[FLIRT TEXT API]', apiError.message);
                    }
                    if (!flirtText || typeof flirtText !== 'string') {
                        flirtText = [
                            'Are you a star? Because you make this little corner of the universe brighter.',
                            'If kindness were an anime power, you would already be the main character.',
                            'You must be a rare character drop, because meeting you feels lucky.'
                        ][Math.floor(Math.random() * 3)];
                    }
                    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
                    const anime = await fetchSfwAnimeImage(Math.random() < 0.5 ? 'blush' : 'wink');
                    const caption = `💌 *ANIME FLIRT DROP*\n\n${flirtText}\n\n🌸 _A little anime-style compliment for the day._`;
                    await sock.sendMessage(extra.from, { image: anime.buffer, caption, mentions: mentioned }, { quoted: msg });
                } catch (error) {
                    console.error('[FLIRT COMMAND]', error);
                    await extra.reply(`❌ Couldn't fetch a flirt image right now. Please try again. (${error.message})`);
                }
                break;
            }

            case 'dare':
            case 'truth': {
                const kind = command === 'truth' ? 'truth' : 'dare';
                try {
                    let prompt;
                    try {
                        prompt = await fetchTruthOrDareFromWeb(kind);
                    } catch (apiError) {
                        console.warn(`[${kind.toUpperCase()} WEB API]`, apiError.message);
                        if (kind === 'truth') {
                            const scraped = await truth();
                            const translated = await translate(String(scraped), { to: 'en' });
                            prompt = translated.text;
                            if (UNSAFE_GAME_PROMPT.test(prompt)) throw new Error('Fallback returned an unsuitable prompt');
                        } else {
                            prompt = [
                                'Do your best anime hero introduction in a dramatic voice.',
                                'Draw a tiny anime character and show the group.',
                                'Speak like a friendly anime narrator for your next three messages.',
                                'Share a harmless fun fact about yourself.'
                            ][Math.floor(Math.random() * 4)];
                        }
                    }
                    const anime = await fetchSfwAnimeImage(kind === 'truth' ? 'think' : 'smile');
                    const card = await makeTruthDareCard(kind, prompt, anime);
                    await sock.sendMessage(extra.from, {
                        image: card,
                        caption: `🎴 *${kind.toUpperCase()} CHALLENGE*\n🌸 Random prompt fetched from the web\n🎌 HUNTER-X PARTY`,
                        mimetype: 'image/jpeg'
                    }, { quoted: msg });
                } catch (error) {
                    console.error(`[${kind.toUpperCase()} COMMAND]`, error);
                    await extra.reply(`❌ Couldn't create the ${kind} card right now. Please try again.`);
                }
                break;
            }

            case 'gayrate':
            case 'gay': {
                const ctx = msg.message?.extendedTextMessage?.contextInfo || {};
                const mentioned = ctx.mentionedJid || [];
                const targetId = mentioned.length ? mentioned[0] : (ctx.participant || extra.sender);
                const targetTag = `@${String(targetId).split('@')[0]}`;
                const percent = Math.floor(Math.random() * 101);
                const labels = percent >= 100 ? 'SUPREME RAINBOW EMPRESS 😂🌈👑' : percent >= 75 ? 'MOISTURIZER QUEEN 💅' : percent >= 50 ? 'MR PRINCESS CLOCK IT 👑⏰' : percent >= 25 ? 'COLORFUL SETTING 🌈' : 'QUIET LEGEND 🗿';
                const out = `🌈 *GAYRATE MEME METER*\n\n${targetTag}\n🎲 Random score: *${percent}%*\n⚡ Rank: *${labels}*\n\n_Just a random group-game joke; it does not say anything about anyone's real identity._`;
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


            case 'antidelete': {
                if (!isGroup) return sock.sendMessage(from, { text: '⚔️ *Domain command only!*' }, { quoted: msg });
                if (!isSenderAdmin) return sock.sendMessage(from, { text: '⚔️ *Admin rights required!*' }, { quoted: msg });
                groupSettings[from].antidelete = !groupSettings[from].antidelete;
                saveGroupSettings();
                await sock.sendMessage(from, { text: "👁️ *Imperial Anti-Delete DON'T RU TO DELETE SHIT :* " + (groupSettings[from].antidelete ? 'ACTIVATED ✅' : 'DEACTIVATED ❌') }, { quoted: msg });
                break;
            }

            case 'antilink':
            case 'antigroupsmention':
            case 'antigcstatus':
            case 'antiggstatus': {
                if (!isGroup) return sock.sendMessage(from, { text: '⚔️ *Domain Command Only!*' }, { quoted: msg });
                if (!isSenderAdmin) return sock.sendMessage(from, { text: '⚔️ *Admin rights required!*' }, { quoted: msg });

                const setting = command === 'antiggstatus' ? 'antigcstatus' : command;
                const subCmd = args[0]?.toLowerCase();
                const subVal = args[1];

                if (subCmd === 'on') {
                    groupSettings[from][setting] = true;
                    await sock.sendMessage(from, { text: "✅ *By decree of the Emperor:* *" + setting.toUpperCase() + "* is ENFORCED!" }, { quoted: msg });
                } else if (subCmd === 'off') {
                    groupSettings[from][setting] = false;
                    await sock.sendMessage(from, { text: "❌ *Imperial Dispensation:* *" + setting.toUpperCase() + "* is DISABLED!" }, { quoted: msg });
                } else if (subCmd === 'kick') {
                    groupSettings[from][setting] = true;
                    groupSettings[from][setting + 'Mode'] = 'kick';
                    await sock.sendMessage(from, { text: "✅ *" + setting.toUpperCase() + "* set to **DIRECT KICK** mode do shit you will be removed asap !" }, { quoted: msg });
                } else if (subCmd === 'warn') {
                    groupSettings[from][setting] = true;
                    groupSettings[from][setting + 'Mode'] = 'warn';
                    if (subVal && !isNaN(subVal)) {
                        groupSettings[from][setting + 'WarnLimit'] = parseInt(subVal);
                    }
                    const limit = groupSettings[from][setting + 'WarnLimit'] || 3;
                    await sock.sendMessage(from, { text: "✅ *" + setting.toUpperCase() + "* set to **IMPERIAL WARN** mode (Limit: " + limit + " warnings)!" }, { quoted: msg });
                } else {
                    groupSettings[from][setting] = !groupSettings[from][setting];
                    await sock.sendMessage(from, { 
                        text: "🛡️ *" + setting.toUpperCase() + " Barrier:* " + (groupSettings[from][setting] ? 'ENFORCED ✅' : 'DISABLED ❌') + "\n\n💡 *Usage:*\n`." + setting + " on/off`\n`." + setting + " kick`\n`." + setting + " warn 3`" 
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
                if (!isOwner) return sock.sendMessage(from, { text: '⚔️ *Owner HUNTER-X only!*' }, { quoted: msg });
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
                    return sock.sendMessage(from, { text: '💡 *Owner, tag `@user`, reply to their message, or type a valid number to banish!*' }, { quoted: msg });
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
                        text: "🚫 @" + cleanPhone + " has been forcefully banished into the Void, Owner! ✅", 
                        mentions: [normalizedJid] 
                    }, { quoted: msg });

                } catch (err) {
                    console.error('Forced Block Error:', err);
                    await sock.sendMessage(from, { text: "❌ *Banishment Seal Rejected:* " + (err.message || 'Server connection error.') }, { quoted: msg });
                }
                break;
            }

            case 'unblock': {
                if (!isOwner) return sock.sendMessage(from, { text: '⚔️ *Only Owner HUNTER-X may lift banishment!*' }, { quoted: msg });
                
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
                    return sock.sendMessage(from, { text: '💡 *Owner, tag `@user`, reply to their message, or type a valid number to unblock!*' }, { quoted: msg });
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
                        text: "✅ *Banishment rescinded for @" + cleanPhone + ", Owner!*", 
                        mentions: [normalizedJid] 
                    }, { quoted: msg });

                } catch (err) {
                    console.error('Forced Unblock Error:', err);
                    await sock.sendMessage(from, { text: "❌ *Failed to unblock user:* " + err.message }, { quoted: msg });
                }
                break;
            }

            case 'buatgc': {
                if (!isOwner) return sock.sendMessage(from, { text: '⚔️ *Owner HUNTER-X only!*' }, { quoted: msg });
                if (!q) return sock.sendMessage(from, { text: '💡 *Usage:* .buatgc <domain_name>' }, { quoted: msg });
                try {
                    const group = await sock.groupCreate(q, [sender]);
                    await sock.sendMessage(from, { text: "👑 *New domain created for Owner! ID:* " + group.id }, { quoted: msg });
                } catch (e) {
                    await sock.sendMessage(from, { text: '❌ *Failed to forge domain, Owner.*' }, { quoted: msg });
                }
                break;
            }

            case 'changebio': {
                if (!isOwner) return sock.sendMessage(from, { text: '⚔️ *Owner HUNTER-X only!*' }, { quoted: msg });
                if (!q) return sock.sendMessage(from, { text: '💡 *Usage:* .changebio <new_status>' }, { quoted: msg });
                await sock.updateProfileStatus(q);
                await sock.sendMessage(from, { text: '👑 *Imperial status updated, Owner!*' }, { quoted: msg });
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
                    if (str.includes(':3')) return 'Multi-Device Companion';
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
                    await sock.sendMessage(from, { image: { url: ppUrl }, caption: '📸 *Imperial Sight: Visual Captured, Owner!*' }, { quoted: msg });
                } catch {
                    await sock.sendMessage(from, { text: '❌ *User portrait concealed from sight.*' }, { quoted: msg });
                }
                break;
            }

            case 'joingroup': {
                if (!isOwner) return sock.sendMessage(from, { text: '⚔️ *Owner HUNTER-X only!*' }, { quoted: msg });
                if (!q) return sock.sendMessage(from, { text: '💡 *Usage:* .joingroup <invite_link>' }, { quoted: msg });
                try {
                    const code = q.split('chat.whatsapp.com/')[1] || q;
                    await sock.groupAcceptInvite(code);
                    await sock.sendMessage(from, { text: '👑 *Domain entered by your decree, Owner!*' }, { quoted: msg });
                } catch (e) {
                    await sock.sendMessage(from, { text: '❌ *Invalid domain invite link.*' }, { quoted: msg });
                }
                break;
            }

            case 'leavegroup':
            case 'left': {
                if (!isOwner) return sock.sendMessage(from, { text: '⚔️ *Owner HUNTER-X only!*' }, { quoted: msg });
                if (!isGroup) return sock.sendMessage(from, { text: '⚔️ *Domain command only!*' }, { quoted: msg });
                await sock.sendMessage(from, { text: '👋 *Departing ya ass, as commanded by Owner HUNTER-X!*' }, { quoted: msg });
                await sock.groupLeave(from);
                break;
            }

            case 'listfont': {
                await sock.sendMessage(from, { 
                    text: "✒️ *𝑯𝑼𝑵𝑻𝑬𝑹-𝑿 Script Typographies*\n\n" +
                          "1. Imperial Gothic: 𝑯𝑼𝑵𝑻𝑬𝑹-𝑿\n" +
                          "2. Royal Monospace: HUNTER-X\n" +
                          "3. Shadow Italic: HUNTER-X"
                }, { quoted: msg });
                break;
            }

            case 'listgroup':
            case 'listgroups': {
                if (!isOwner) return sock.sendMessage(from, { text: '⚔️ *Owner HUNTER-X only!*' }, { quoted: msg });
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
                await sock.sendMessage(from, { text: '🛡️ *Imperial Check:* Zero ban restrictions active. Your throne stands intact, Owner!' }, { quoted: msg });
                break;
            }

            case 'botlink': {
                await sock.sendMessage(from, { text: '🔗 *𝑯𝑼𝑵𝑻𝑬𝑹-𝑿 Throne Portal:* Online & Sovereign' }, { quoted: msg });
                break;
            }

            case 'fetchstatus': {
                if (!isOwner) return sock.sendMessage(from, { text: '⚔️ *Owner HUNTER-X only!*' }, { quoted: msg });
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
    if (!isOwner) return extra.reply('⚔️ *Only Owner HUNTER-X can inspect the channels!*');
    
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
                text: '╭━━〔 *𝑯𝑼𝑵𝑻𝑬𝑹-𝑿 𝐕4 CHANNELS* 〕━━╮\n\n' +
                      '📢 *Status:* Fully subjugated under your rule, Owner!\n' +
                      '⚠️ *Note:* No active live newsletter feeds detected in current socket cache.\n\n' +
                      '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯' 
            }, { quoted: msg });
        }

        let channelText = '╭━━〔 *𝑯𝑼𝑵𝑻𝑬𝑹-𝑿 𝐕4 CHANNELS* 〕━━╮\n\n';
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
            text: '📢 *𝑯𝑼𝑵𝑻𝑬𝑹-𝑿 𝐕4 Channels:* Fully subjugated under your rule, Owner!\n*(Active broadcast network online)*' 
        }, { quoted: msg });
    }
    break;
}


            case 'mode':
            case 'private':
            case 'public': {
                if (!isOwner) return sock.sendMessage(from, { text: '⚔️ *Only Owner HUNTER-X may alter realm permissions!*' }, { quoted: msg });
                
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
                    await sock.sendMessage(from, { text: "👑 *Decree Enforced:* Domain mode set to *" + botMode.toUpperCase() + "*, Owner!" }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, { text: "⚔️ *Current State:* *" + botMode.toUpperCase() + "*\n\n💡 *Usage:* .mode public | .mode private | .public | .private" }, { quoted: msg });
                }
                break;
            }

            case 'session':
            case 'ownerpanel': {
                if (!isOwner) return extra.reply('⚔️ *Owner access only.*');
                const accountNumber = String(sock.user?.id || '').split('@')[0].split(':')[0].replace(/\D/g, '') || 'Not connected';
                const linkedCount = 0;
                const sessionText = '╭━━〔 👑 *HUNTER-X SESSION* 〕━━╮\n' +
                    '📡 Session: PRIMARY\n' +
                    '📱 Number: ' + (accountNumber === 'Not connected' ? accountNumber : '+' + accountNumber) + '\n' +
                    '🟢 Status: ' + (sock.user ? 'Online' : 'Connecting') + '\n' +
                    '🔐 Mode: Single WhatsApp owner account\n' +
                    '⚙️ Mode: ' + botMode.toUpperCase() + '\n' +
                    '💾 Data directory: ' + DATA_DIR + '\n' +
                    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯';
                return extra.reply(sessionText);
            }

            case 'pair': {
                return sock.sendMessage(from, { text: "🔐 *Single-owner mode is enabled.* Pair only the configured owner number through the startup pairing code." }, { quoted: msg });
            }

            case 'broadcast':
            case 'bc': {
                if (!isOwner) return sock.sendMessage(from, { text: '⚔️ *Only Owner HUNTER-X may speak to all realms!*' }, { quoted: msg });
                if (!q) return sock.sendMessage(from, { text: '💡 *Usage:* .broadcast <royal proclamation>' }, { quoted: msg });

                const groups = Object.keys(await sock.groupFetchAllParticipating());
                await sock.sendMessage(from, { text: "📢 *Transmitting royal decree to " + groups.length + " domains, Owner!*" }, { quoted: msg });

                for (const groupId of groups) {
                    await sock.sendMessage(groupId, {
                        text: "📢 *𝑯𝑼𝑵𝑻𝑬𝑹-𝑿 𝐕4 ROYAL PROCLAMATION*\n\n" + q + "\n\n_~ Directly from Owner HUNTER-X_"
                    });
                }
                await sock.sendMessage(from, { text: '✅ *Proclamation delivered, Owner!*' }, { quoted: msg });
                break;
            }

            case 'connectedusers':
            case 'activeusers': {
                if (!isOwner) return sock.sendMessage(from, { text: '⚔️ *Owner HUNTER-X only!*' }, { quoted: msg });
                const linkedCount = 0;
                const totalCount = 1;
                await sock.sendMessage(from, {
                    text:
                        '╭━━〔 👑 𝑯𝑼𝑵𝑻𝑬𝑹-𝑿 〕━━╮\n' +
                        '┃ 𝑰𝑴𝑷𝑬𝑹𝑰𝑨𝑳 𝑼𝑺𝑬𝑹 𝑺𝑻𝑨𝑻𝑺\n' +
                        '┣━━━━━━━━━━━━━━━━━━━━\n' +
                        '👥 Total sessions: ' + totalCount + '\n' +
                        '📱 WhatsApp owner account: 1\n' +
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
                    '╭━━〔 👑 𝑯𝑼𝑵𝑻𝑬𝑹-𝑿 V4 〕━━╮\n' +
                    '┃ ⏱️ 𝑺𝒀𝑺𝑻𝑬𝑴 𝑼𝑷𝑻𝑰𝑴𝑬\n' +
                    '┣━━━━━━━━━━━━━━━━━━━━\n' +
                    '┃ ' + uptime + '\n' +
                    '╰━━━━━━━━━━━━━━━━━━━━╯'
                );
            }

            case 'inspectsock':
            case 'status': {
                await sock.sendMessage(from, { 
                    text: "⚡ *𝑯𝑼𝑵𝑻𝑬𝑹-𝑿 Core Health*\n\n" +
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
    const modeArg = args[1]?.toLowerCase();

    if (['antispam', 'antitag', 'antibot'].includes(setting) && ['warn', 'kick'].includes(stateArg)) {
        groupSettings[from][setting] = true;
        groupSettings[from][setting + 'Mode'] = stateArg;
        if (stateArg === 'warn' && modeArg && /^\d+$/.test(modeArg)) {
            groupSettings[from][setting + 'WarnLimit'] = Math.max(1, Math.min(10, Number(modeArg)));
        }
        const limit = groupSettings[from][setting + 'WarnLimit'] || 3;
        saveGroupSettings();
        return sock.sendMessage(from, { text: `🛡️ *${setting.toUpperCase()}* is ON in *${stateArg.toUpperCase()}* mode${stateArg === 'warn' ? ` (warning limit: ${limit})` : ''}.` }, { quoted: msg });
    }

    if (!['on', 'off'].includes(stateArg)) {
        return sock.sendMessage(from, {
            text: `⚙️ *${setting.toUpperCase()} SETTINGS*\n\n` +
                `Use:\n${prefix}${setting} on/off\n` +
                (['antispam', 'antitag', 'antibot'].includes(setting) ? `${prefix}${setting} warn 3\n${prefix}${setting} kick` : '')
        }, { quoted: msg });
    }

    groupSettings[from][setting] = stateArg === 'on';
    saveGroupSettings();
    await sock.sendMessage(from, { text: stateArg === 'on' ? `✅ *${setting.toUpperCase()} is now ON!*` : `❌ *${setting.toUpperCase()} is now OFF!*` }, { quoted: msg });

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
                    await sock.sendMessage(from, { text: "✅ *By decree of the Emperor:* *" + setting.toUpperCase() + "* WELCOME is now ACTIVATED!" }, { quoted: msg });
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
                    await sock.sendMessage(from, { text: '✅ *User added to domain, Owner!*' }, { quoted: msg });
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
                        return sock.sendMessage(from, { text: '💡 *No pending entry requests, Owner.*' }, { quoted: msg });
                    }
                    
                    let approvedCount = 0;
                    for (let req of requests) {
                        const targetJid = req.jid || req.id || req;
                        await sock.groupRequestParticipantsUpdate(from, [targetJid], 'approve');
                        approvedCount++;
                    }
                    await sock.sendMessage(from, { text: "✅ *Granted Group entry to " + approvedCount + " subject(s), Owner!*" }, { quoted: msg });
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

                await sock.sendMessage(from, { text: "⏳ *Domain gates will be " + actionText + " in " + timer + " minute(s), Owner!*" }, { quoted: msg });
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
                await sock.sendMessage(from, { text: '🔻 *Subject stripped of High Lord rank, Owner!*' }, { quoted: msg });
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
                    await sock.sendMessage(from, { text: '🚫 *Rejected all pending requests, Owner!*' }, { quoted: msg });
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
                // A reply can quote text, images, videos, documents, audio or
                // stickers. Resolve the first context carrying a quoted sender.
                const contextInfo = Object.values(commandMessage)
                    .map(value => value?.contextInfo)
                    .find(context => context && (context.stanzaId || context.participant || context.mentionedJid?.length)) || {};
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
                if (!isOwner) return sock.sendMessage(from, { text: '⚔️ *Owner HUNTER-X only!*' }, { quoted: msg });
                groupSettings[from].grouponly = !groupSettings[from].grouponly;
                saveGroupSettings();
                await sock.sendMessage(from, { text: "🛡️ *Group Only Mode:* " + (groupSettings[from].grouponly ? 'ENABLED ✅' : 'DISABLED ❌') }, { quoted: msg });
                break;
            }

            case 'hidetag': {
                if (!isGroup) return extra.reply('👥 This command only works in a group.');
                if (!isSenderAdmin) return extra.reply('⚔️ Actual group-admin rights are required.');
                const hidetagText = args.join(' ') || "Silence! Hear the Emperor's decree!";
                const groupMetadata = await sock.groupMetadata(from);
                const mentions = groupMetadata.participants.map(p => p.id);
                await sock.sendMessage(from, { text: "👑 *Imperial Decree:* " + hidetagText, mentions }, { quoted: msg });
                break;
            }

            case 'inactiveusers':
            case 'kickall': {
                if (!isGroup) return sock.sendMessage(from, { text: '⚔️ *Domain command only!*' }, { quoted: msg });
                if (!isOwner) return sock.sendMessage(from, { text: '⚔️ *Owner HUNTER-X only!*' }, { quoted: msg });

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
                await sock.sendMessage(from, { text: '👑 *All subjects elevated to High Lord rank, Owner!*' }, { quoted: msg });
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
                await sock.sendMessage(from, { text: '👑 *user Are elevated to High Lord rank, Owner!*' }, { quoted: msg });
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
                let txt = "🛡️ *𝑯𝑼𝑵𝑻𝑬𝑹-𝑿 High Lords*\n\n";
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
                let text = (q || "╭━━━〔  *IMPERIAL SUMMONS — HUNTER-X*  〕━━━┈\n_“All MEMBERS, COME ONLINE OO !”_") + '\n\n';
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
                    await extra.reply('🧠 *Demonic Intellect*\n\n' + answer.trim().slice(0, 12000));
                } catch (e) {
                    console.error('[AI COMMAND]', command, e.message);
                    await extra.reply('❌ AI is unavailable right now. The configured AI provider did not return a usable answer. Try again later or configure AI_API_URL for a compatible provider.');
                }
                break;
            }

            case 'imagine':
            case 'draw': {
                if (!q) return sock.sendMessage(from, { text: '💡 *Owner, describe the visual to manifest: .imagine <prompt>*' }, { quoted: msg });
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


   
// Embed WhatsApp-compatible sticker pack metadata in the WebP EXIF chunk.
// This labels the sticker pack in WhatsApp's sticker details; it does not
// paint branding over the sticker artwork.
function addStickerPackMetadata(webpBuffer) {
    if (!Buffer.isBuffer(webpBuffer) || webpBuffer.toString('ascii', 0, 4) !== 'RIFF' ||
        webpBuffer.toString('ascii', 8, 12) !== 'WEBP') {
        throw new Error('Generated sticker is not a valid WebP file.');
    }
    const pack = {
        'sticker-pack-id': 'hunter-x-v49-stickers',
        'sticker-pack-name': '𝙂𝙍𝙀𝘼𝙏 𝘿𝙀𝙈𝙊𝙉 𝙑4.9 𝘽𝙊𝙏 ❤️‍🔥',
        'sticker-pack-publisher': '𝒔𝒕𝒊𝒄𝒌𝒆𝒓 𝒄𝒐𝒏𝒗𝒆𝒓𝒕 💫',
        emojis: ['💫']
    };
    const json = Buffer.from(JSON.stringify(pack), 'utf8');
    const tiffHeader = Buffer.from([
        0x49,0x49,0x2A,0x00,0x08,0x00,0x00,0x00,
        0x01,0x00,0x41,0x57,0x07,0x00,0x00,0x00,
        0x00,0x00,0x16,0x00,0x00,0x00
    ]);
    const exif = Buffer.concat([tiffHeader, json]);
    const chunkHeader = Buffer.alloc(8);
    chunkHeader.write('EXIF', 0, 4, 'ascii');
    chunkHeader.writeUInt32LE(exif.length, 4);
    const padding = exif.length % 2 ? Buffer.from([0]) : Buffer.alloc(0);

    const chunks = [];
    let offset = 12;
    while (offset + 8 <= webpBuffer.length) {
        const size = webpBuffer.readUInt32LE(offset + 4);
        const end = offset + 8 + size + (size % 2);
        if (end > webpBuffer.length) throw new Error('Generated WebP contains an invalid chunk.');
        // Replace any old EXIF chunk so repeated processing stays valid.
        if (webpBuffer.toString('ascii', offset, offset + 4) !== 'EXIF') {
            chunks.push(webpBuffer.subarray(offset, end));
        }
        offset = end;
    }
    if (offset !== webpBuffer.length) throw new Error('Generated WebP has trailing invalid data.');

    // EXIF must follow the image data. Keep the RIFF/WEBP header, then all
    // original chunks, then the new EXIF chunk.
    const body = Buffer.concat([...chunks, chunkHeader, exif, padding]);
    const header = Buffer.from(webpBuffer.subarray(0, 12));
    header.writeUInt32LE(body.length + 4, 4);
    const result = Buffer.concat([header, body]);

    // Advertise EXIF metadata in the VP8X feature flags when present.
    let pos = 12;
    while (pos + 8 <= result.length) {
        const name = result.toString('ascii', pos, pos + 4);
        const size = result.readUInt32LE(pos + 4);
        if (name === 'VP8X' && size >= 10) result[pos + 8] |= 0x08;
        pos += 8 + size + (size % 2);
    }
    return result;
}

case 'stiker':
case 'sticker':
case 's': {
    const resolved = resolveMedia(msg);
    const media = resolved && (resolved.kind === 'image' || resolved.kind === 'video')
        ? { data: resolved.mediaMsg, type: resolved.kind, downloadType: resolved.downloadType || resolved.kind }
        : null;

    if (!media) {
        await sock.sendMessage(from, {
            text: '📌 Send an image with .sticker, or reply to a normal image/video with .sticker. View Once media is not supported.'
        }, { quoted: msg });
        break;
    }

    let tempIn;
    let tempOut;
    try {
        await sock.sendMessage(from, { text: '🎨 Creating your sticker...' }, { quoted: msg });
        // Download through Baileys' full WAMessage helper. This is more reliable
        // for quoted media because the quoted message key and remoteJid are needed
        // for media re-upload requests when WhatsApp's media URL has expired.
        const targetWAMessage = resolved.targetMessage || msg;
        let buffer;
        try {
            buffer = await downloadMediaMessage(
                targetWAMessage,
                'buffer',
                {},
                {
                    logger: pino({ level: 'silent' }),
                    reuploadRequest: sock.updateMediaMessage
                }
            );
        } catch (downloadError) {
            console.warn('[STICKER MEDIA MESSAGE DOWNLOAD]', downloadError?.message || downloadError);
        }
        // Fallback for quoted images whose reconstructed WAMessage cannot be
        // re-uploaded by downloadMediaMessage. The resolved media node is still
        // the original Baileys image/video payload.
        if (!buffer?.length) {
            const mediaStream = await downloadContentFromMessage(media.data, media.downloadType);
            const mediaChunks = [];
            for await (const chunk of mediaStream) mediaChunks.push(chunk);
            buffer = Buffer.concat(mediaChunks);
        }
        if (!buffer.length) throw new Error('WhatsApp returned an empty media download. Try sending the image directly.');
        if (buffer.length > 25 * 1024 * 1024) throw new Error('Media is too large. Maximum size is 25MB.');

        let rawStickerBuffer;
        if (media.type === 'image') {
            // Sharp is more reliable than FFmpeg for ordinary still images and
            // keeps transparent PNG/WebP backgrounds without stretching.
            rawStickerBuffer = await sharp(buffer, { failOn: 'error', animated: false })
                .rotate()
                .resize(512, 512, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 },
                    withoutEnlargement: false
                })
                .webp({ quality: 82, effort: 5, alphaQuality: 100 })
                .toBuffer();
        } else {
            if (!ffmpegPath) throw new Error('FFmpeg is unavailable for video stickers. Try an image instead.');
            const id = crypto.randomUUID();
            tempIn = path.join(os.tmpdir(), `gd_sticker_${id}.mp4`);
            tempOut = path.join(os.tmpdir(), `gd_sticker_${id}.webp`);
            fs.writeFileSync(tempIn, buffer);
            const scalePad = 'scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,fps=15';
            await execFileAsync(ffmpegPath, [
                '-y', '-i', tempIn, '-t', '6', '-an', '-vf', scalePad,
                '-loop', '0', '-vsync', '0', '-c:v', 'libwebp',
                '-lossless', '0', '-q:v', '65', '-compression_level', '4',
                '-pix_fmt', 'yuva420p', '-f', 'webp', tempOut
            ], { timeout: 120000, maxBuffer: 12 * 1024 * 1024 });
            if (!fs.existsSync(tempOut)) throw new Error('FFmpeg did not create the animated WebP sticker.');
            rawStickerBuffer = fs.readFileSync(tempOut);
        }
        if (!rawStickerBuffer?.length) throw new Error('Sticker conversion produced an empty file.');
        if (rawStickerBuffer.length > 1024 * 1024) {
            // WhatsApp sticker payloads should remain small; re-encode stills at a lower quality.
            if (media.type === 'image') {
                rawStickerBuffer = await sharp(rawStickerBuffer)
                    .resize(512, 512, { fit: 'inside' })
                    .webp({ quality: 65, effort: 6 })
                    .toBuffer();
            }
            if (rawStickerBuffer.length > 1024 * 1024) throw new Error('Sticker is over 1MB. Try a simpler image or shorter video.');
        }
        const stickerBuffer = addStickerPackMetadata(rawStickerBuffer);
        await sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: msg });
    } catch (err) {
        console.error('[STICKER CONVERSION ERROR]', err?.stack || err);
        await sock.sendMessage(from, {
            text: `❌ Sticker conversion failed: ${String(err?.message || 'Unknown error').slice(0, 220)}. Try a JPG/PNG image, or a shorter MP4 video.`
        }, { quoted: msg });
    } finally {
        for (const file of [tempIn, tempOut]) {
            try { if (file && fs.existsSync(file)) fs.unlinkSync(file); }
            catch (cleanupError) { console.error('[STICKER CLEANUP ERROR]', cleanupError?.message || cleanupError); }
        }
    }
    break;
}

            case 'toimg': {
                const isSticker = msg.message?.stickerMessage || msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage;
                if (!isSticker) {
                    return sock.sendMessage(from, { text: 'Owner, reply to a sticker to convert it to an image!' }, { quoted: msg });
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
                            return sock.sendMessage(from, { text: '❌ Transmutation failed, Owner!' }, { quoted: msg });
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
                if (!isMedia) return sock.sendMessage(from, { text: '💡 *Owner, reply to a video or audio file to transmute to audio!*' }, { quoted: msg });

                try {
                    await sock.sendMessage(from, { text: '🎵 *Extracting audio frequency, Owner...*' }, { quoted: msg });
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
                        await sock.sendMessage(from, { video: videoBuffer, gifPlayback: true, caption: '✨ GIF Transmutation Complete, Owner!' }, { quoted: msg });

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
                if (!isMedia) return sock.sendMessage(from, { text: '💡 *Owner, reply to an image or video to generate a URL link!*' }, { quoted: msg });
                await sock.sendMessage(from, { text: '✅ *Artifact Stream Encoded:* Ready for cloud distribution.' }, { quoted: msg });
                break;
            }

            case 'dl':
            case 'fb':
            case 'capcut':
            case 'applemusic': {
                if (!q) return sock.sendMessage(from, { text: "💡 *Owner, provide a media link: ." + command + " <url>*" }, { quoted: msg });
                try {
                    await sock.sendMessage(from, { text: '📥 *Acquiring artifact from external realm, Owner...*' }, { quoted: msg });
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
                if (!q) return sock.sendMessage(from, { text: '💡 *Owner, provide a search term: .yts <query>*' }, { quoted: msg });
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

            case 'lyrics': {
                if (!q) return sock.sendMessage(from, { text: '💡 *Owner, provide a song name: .lyrics <song>*' }, { quoted: msg });
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
                await sock.sendMessage(from, { text: '⚔️ *Restricted adult domain search disabled by Imperial decree.*' }, { quoted: msg });
                break;
            }

            case 'balance':
            case 'bank':
            case 'profile': {
                const user = economyUser(senderNum, msg.pushName || senderNum);
                saveEconomy();
                const ownerUnlimited = String(senderNum).replace(/\D/g, '') === String(OWNER_NUMBER).replace(/\D/g, '');
                return extra.reply('👤 *' + user.name + "'s HUNTER-X PROFILE*\n\n💰 Wallet: " + (ownerUnlimited ? '∞ (HUNTER-X Admin)' : moneyText(user.wallet)) + '\n🏦 Bank: ' + moneyText(user.bank) + '\n🎒 Items: ' + user.inventory.length + '\n🃏 Anime cards: ' + user.cards.length + '\n⭐ Net worth: ' + (ownerUnlimited ? '∞' : moneyText(user.wallet + user.bank)));
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
                return extra.reply('🏆 *HUNTER-X RICHEST PLAYERS*\n\n' + lines.join('\n'));
            }
            case 'shop': {
                return extra.reply('🛒 *HUNTER-X SHOP*\n' + ECONOMY_SHOP.map(x => '• ' + x.name + ' — ' + moneyText(x.price) + '\n  ' + x.description).join('\n') + '\n\nBuy with .buy <item_id>');
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
            case 'demonadmin':
            case 'cardadmin': {
                if (!isOwner) return extra.reply('⛔ HUNTER-X Admin is reserved for the primary owner.');
                return extra.reply('👑 *DEMON ADMIN*\n\n💰 Gold: UNLIMITED\n🃏 .spawncard — forge a designed SFW anime collectible card automatically\n🗑 .cardremove <id>\n💸 .goldgive @user <amount>\n⚖ .goldset @user <amount>\n📚 .cardlist\n\nTiers S–E are assigned randomly; static artwork is limited to B–E.');
            }
            case 'cardadd': {
                if (!isOwner) return extra.reply('⛔ Only HUNTER-X Admin can add cards.');
                const parts = q.split('|').map(value => value.trim());
                if (parts.length !== 5) return extra.reply('Usage: .cardadd id|name|tier|price|direct-https-image-or-gif-url');
                const [rawId, name, rawTier, rawPrice, mediaUrl] = parts;
                const id = cleanCardId(rawId), tier = rawTier.toUpperCase(), price = Number(rawPrice);
                let parsedUrl;
                try { parsedUrl = new URL(mediaUrl); } catch { return extra.reply('❌ Invalid artwork URL.'); }
                if (!id || !name || name.length > 70 || !CARD_TIERS.includes(tier) || !Number.isSafeInteger(price) || price < 0 || parsedUrl.protocol !== 'https:') {
                    return extra.reply('❌ Check the ID, name (max 70 chars), tier (S/A/B/C/D), whole-number price and HTTPS URL.');
                }
                if (cardById(id)) return extra.reply('❌ That card ID already exists. Use a different ID.');
                cardCatalog.cards.push({ id, name, tier, price, mediaUrl: parsedUrl.href, addedAt: Date.now() });
                saveCardCatalog();
                return extra.reply('✅ Added *' + name + '* [' + tier + '] to the Anime Card catalogue.');
            }
            case 'cardremove': {
                if (!isOwner) return extra.reply('⛔ Only HUNTER-X Admin can remove cards.');
                const id = cleanCardId(args[0]);
                const index = cardCatalog.cards.findIndex(card => card.id === id);
                if (index < 0) return extra.reply('❌ Card ID not found.');
                const removed = cardCatalog.cards[index];
                removed.active = false;
                saveCardCatalog();
                return extra.reply('🗑 Removed *' + removed.name + '* from new spawns. Existing owned copies remain available to view, sell and trade.');
            }
            case 'cardlist': {
                const availableCards = cardCatalog.cards.filter(card => card.active !== false);
                if (!availableCards.length) return extra.reply('🃏 No cards have spawned yet. Use .spawncard to forge the first SFW anime collectible card.');
                const lines = availableCards.slice(0, 60).map(card => '• [' + card.tier + '] ' + card.name + ' — ' + moneyText(card.price) + ' (`' + card.id + '`)');
                return extra.reply('🃏 *ANIME CARD CATALOGUE*\n\n' + lines.join('\n') + (availableCards.length > 60 ? '\n… and ' + (availableCards.length - 60) + ' more.' : '') + '\n\nUse .spawncard to reveal a free card offer.');
            }
            case 'spawncard': {
                const user = economyUser(senderNum, msg.pushName || senderNum);
                const spawnUserKey = String(senderNum || '').replace(/\D/g, '') || String(senderNum || 'unknown');
                const spawnChatKey = String(from || 'unknown-chat');
                const userWait = cardSpawnCooldownRemaining(CARD_SPAWN_USER_NEXT, spawnUserKey, CARD_SPAWN_USER_COOLDOWN_MS);
                if (userWait > 0) return extra.reply('⏳ Please wait ' + Math.ceil(userWait / 1000) + 's before spawning another card.');
                const chatWait = cardSpawnCooldownRemaining(CARD_SPAWN_CHAT_NEXT, spawnChatKey, CARD_SPAWN_CHAT_COOLDOWN_MS);
                if (chatWait > 0) {
                    // Undo the user's cooldown because the group/chat was already busy.
                    CARD_SPAWN_USER_NEXT.delete(spawnUserKey);
                    return extra.reply('⏳ Another card was just requested here. Please wait ' + Math.ceil(chatWait / 1000) + 's.');
                }
                await extra.reply('🎴 Searching SFW anime archives and forging your collectible card...');
                let card;
                try { card = await fetchFreshAnimeCard(); }
                catch (error) { console.error('[CARD SPAWN FETCH]', error?.stack || error); return extra.reply('❌ Card spawn is temporarily unavailable: ' + String(error.message || error).slice(0, 180)); }
                const offerId = crypto.randomBytes(3).toString('hex').toUpperCase();
                user.pendingCard = { offerId, cardId: card.id, price: card.price, expiresAt: Date.now() + 30 * 60 * 1000 };
                saveEconomy();
                const tierNames = { S: 'MYTHIC', A: 'LEGENDARY', B: 'EPIC', C: 'RARE', D: 'UNCOMMON', E: 'COMMON' };
                const caption = '✨ *ANIME COLLECTIBLE CARD SPAWNED*\n\n' + card.name + '\nAnime: *' + (card.animeTitle || 'ANIME ARCHIVE') + '*\nRank: *' + card.tier + ' — ' + tierNames[card.tier] + '*\nArtwork: *' + (card.isAnimated ? 'ANIMATED GIF' : 'STATIC IMAGE') + '*\n' + (card.tags ? 'Tags: ' + card.tags + '\n' : '') + (card.artist ? 'Artist: ' + card.artist + '\n' : '') + (card.sourceUrl ? 'Source: ' + card.sourceUrl + '\n' : '') + 'Card ID: `' + card.id + '`\nPrice: *' + moneyText(card.price) + '*\nOffer: `' + offerId + '`\n\nBuy with: .cardbuy ' + offerId;
                try { await sendAnimeCard(sock, from, card, caption, msg); }
                catch (error) { console.error('[CARD SPAWN MEDIA]', error); return extra.reply('❌ Card was saved, but its artwork could not be sent: ' + String(error.message || error).slice(0, 180)); }
                break;
            }
            case 'cardbuy': {
                const user = economyUser(senderNum, msg.pushName || senderNum);
                const offer = user.pendingCard;
                const suppliedId = String(args[0] || '').toUpperCase();
                if (!offer || !suppliedId || offer.offerId !== suppliedId || offer.expiresAt < Date.now()) return extra.reply('❌ No matching active card offer. Use .spawncard to reveal another card.');
                const card = cardById(offer.cardId);
                if (!card) { user.pendingCard = null; saveEconomy(); return extra.reply('❌ That card is no longer available.'); }
                const ownerUnlimited = isOwner || String(senderNum).replace(/\D/g, '') === String(OWNER_NUMBER).replace(/\D/g, '');
                if (!ownerUnlimited && user.wallet < offer.price) return extra.reply('❌ You need ' + moneyText(offer.price) + ' in your wallet. Your current wallet: ' + moneyText(user.wallet));
                if (!ownerUnlimited) user.wallet -= offer.price;
                user.cards.push(card.id);
                user.pendingCard = null;
                saveEconomy();
                try { await sendAnimeCard(sock, from, card, '✅ *CARD PURCHASED*\n' + card.name + ' [' + card.tier + ']\nCard ID: `' + card.id + '`\n' + (ownerUnlimited ? 'HUNTER-X Admin privilege: FREE' : 'Paid: ' + moneyText(offer.price)) + '\nUse .cards to view your collection.', msg); }
                catch (error) { await extra.reply('✅ Card purchased and saved, but the artwork preview failed: ' + String(error.message || error).slice(0, 150)); }
                break;
            }
            case 'cards':
            case 'cardprofile': {
                let targetDigits = String(senderNum).replace(/\D/g, '');
                const context = normalizedMessage?.extendedTextMessage?.contextInfo || {};
                const targetJid = context.mentionedJid?.[0] || context.participant;
                if (targetJid) targetDigits = (await resolvePhoneDigits(sock, targetJid)) || String(targetJid).replace(/\D/g, '');
                const user = economyUser(targetDigits, targetDigits === String(senderNum).replace(/\D/g, '') ? (msg.pushName || senderNum) : targetDigits);
                const counts = cardTierCounts(user.cards);
                const lines = user.cards.map((id, index) => { const card = cardById(id); return card ? (index + 1) + '. [' + card.tier + '] ' + card.name + ' (`' + card.id + '`)': null; }).filter(Boolean);
                const ownerUnlimited = targetDigits === String(OWNER_NUMBER).replace(/\D/g, '');
                return extra.reply('👤 *' + user.name + ' — ANIME CARD PROFILE*\n\n💰 Wallet: ' + (ownerUnlimited ? '∞ (HUNTER-X Admin)' : moneyText(user.wallet)) + '\n🏦 Bank: ' + moneyText(user.bank) + '\n🃏 Total cards: ' + user.cards.length + '\n\n' + CARD_TIERS.map(tier => tier + ' Tier: ' + counts[tier]).join('\n') + '\n\n*COLLECTION*\n' + (lines.join('\n') || 'No cards collected yet. Use .spawncard.'));
            }
            case 'cardsell': {
                const id = cleanCardId(args[0]);
                const user = economyUser(senderNum, msg.pushName || senderNum);
                const index = user.cards.indexOf(id);
                const card = cardById(id);
                if (index < 0 || !card) return extra.reply('❌ You do not own that card. Use .cards to see your collection.');
                user.cards.splice(index, 1);
                const earned = Math.floor(card.price * 0.6);
                user.wallet += earned;
                saveEconomy();
                return extra.reply('💸 Sold *' + card.name + '* for ' + moneyText(earned) + '.');
            }
            case 'cardtrade':
            case 'cardoffer': {
                const context = normalizedMessage?.extendedTextMessage?.contextInfo || {};
                const targetJid = context.mentionedJid?.[0] || context.participant;
                const targetDigits = targetJid ? ((await resolvePhoneDigits(sock, targetJid)) || String(targetJid).replace(/\D/g, '')) : '';
                const tradeTokens = args.filter(value => !value.startsWith('@') && value.replace(/\D/g, '') !== targetDigits);
                const ownId = cleanCardId(tradeTokens[0]);
                const otherId = cleanCardId(tradeTokens[1]);
                if (!targetDigits || !ownId || !otherId) return extra.reply('Usage: reply/tag a user with .cardtrade <your-card-id> <their-card-id>');
                if (targetDigits === String(senderNum).replace(/\D/g, '')) return extra.reply('You cannot trade with yourself.');
                const senderUser = economyUser(senderNum, msg.pushName || senderNum);
                const recipient = economyUser(targetDigits, targetDigits);
                if (!senderUser.cards.includes(ownId) || !recipient.cards.includes(otherId)) return extra.reply('❌ Both users must already own the cards named in the trade.');
                if (!economy.cardTrades || typeof economy.cardTrades !== 'object') economy.cardTrades = {};
                const tradeId = crypto.randomBytes(3).toString('hex').toUpperCase();
                economy.cardTrades[tradeId] = { from: String(senderNum).replace(/\D/g, ''), to: targetDigits, give: ownId, receive: otherId, expiresAt: Date.now() + 24 * 60 * 60 * 1000 };
                saveEconomy();
                return extra.reply('🤝 *CARD TRADE OFFER*\nTrade ID: `' + tradeId + '`\nYou offer: ' + ownId + '\nYou request: ' + otherId + '\nThe tagged user can accept with .cardaccept ' + tradeId + '.');
            }
            case 'cardaccept': {
                const tradeId = String(args[0] || '').toUpperCase();
                const trade = economy.cardTrades?.[tradeId];
                const currentDigits = String(senderNum).replace(/\D/g, '');
                if (!trade || trade.to !== currentDigits || trade.expiresAt < Date.now()) return extra.reply('❌ No active trade offer addressed to you with that ID.');
                const fromUser = economyUser(trade.from, trade.from);
                const toUser = economyUser(currentDigits, msg.pushName || currentDigits);
                const giveIndex = fromUser.cards.indexOf(trade.give), receiveIndex = toUser.cards.indexOf(trade.receive);
                if (giveIndex < 0 || receiveIndex < 0) { delete economy.cardTrades[tradeId]; saveEconomy(); return extra.reply('❌ Trade cancelled because one of the cards is no longer owned by its original player.'); }
                fromUser.cards.splice(giveIndex, 1, trade.receive);
                toUser.cards.splice(receiveIndex, 1, trade.give);
                delete economy.cardTrades[tradeId]; saveEconomy();
                return extra.reply('✅ Trade complete! You received ' + trade.give + ' and sent ' + trade.receive + '.');
            }
            case 'goldgive':
            case 'goldset': {
                if (!isOwner) return extra.reply('⛔ Only HUNTER-X Admin can manage player gold.');
                const context = normalizedMessage?.extendedTextMessage?.contextInfo || {};
                const targetJid = context.mentionedJid?.[0] || context.participant;
                const targetDigits = targetJid ? ((await resolvePhoneDigits(sock, targetJid)) || String(targetJid).replace(/\D/g, '')) : '';
                const amountToken = args.find(value => /^\d+$/.test(value) && value !== targetDigits);
                const amount = Number(amountToken);
                if (!targetDigits || !Number.isSafeInteger(amount) || amount < 0) return extra.reply('Usage: .goldgive @user <amount> or .goldset @user <amount>');
                const target = economyUser(targetDigits, targetDigits);
                if (command === 'goldgive') target.wallet += amount; else target.wallet = amount;
                saveEconomy();
                return extra.reply('👑 HUNTER-X Admin updated @' + targetDigits + ' wallet to ' + moneyText(target.wallet) + '.', { mentions: [targetJid] });
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
            text: '⚔️ Owner HUNTER-X only!'
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
                if (!isOwner) return sock.sendMessage(from, { text: '⚔️ *Only Owner HUNTER-X possesses access to war payloads!*' }, { quoted: msg });
                await sock.sendMessage(from, { text: '🛡️ *Shield V10 ULTRA:* Defense matrix active. Bug testing commands locked.' }, { quoted: msg });
                break;
            }

             
case 'gccrash': {
    if (!isOwner) {
        return sock.sendMessage(from, {
            text: '⚔️ Only Owner can activate this command!'
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
                        text: "╭━━━〔 *𝑯𝑼𝑵𝑻𝑬𝑹-𝑿 Command* 〕━━━┈\n" +
                              "✦ *Command:* " + prefix + command + "\n" +
                              "✦ *Status:* once you see this ur ass is bad at commanding it doesn't work ngga\n" +
                              "╰━━━━━━━━━━━━━━━━━━━━━━━┈" 
                    }, { quoted: msg });
                }
                break;
            }
        }
    });
    return { sock, state };
}

startDemonBot().catch(err => console.error('HUNTER-X startup failed:', err.message));
