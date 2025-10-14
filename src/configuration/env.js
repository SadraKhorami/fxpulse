
const DEFAULT_API_BASE = 'https://finance.khorami.dev/api';
const DEFAULT_UPDATE_INTERVAL = 30_000;
const DEFAULT_CACHE_TTL = 15_000;

let cached = null;

const coerceNumber = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getEnv = () => {
    if (cached) return cached;

    const token = process.env.DISCORD_TOKEN || process.env.CLIENT_TOKEN;
    const clientId = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID;
    const mongoUri = process.env.MONGODB_URI;
    const apiKey = process.env.FINANCE_API_KEY;
    const apiBearer = process.env.FINANCE_API_BEARER || null;

    if (!token) {
        throw new Error('Missing DISCORD_TOKEN in environment (or legacy CLIENT_TOKEN).');
    }

    if (!clientId) {
        throw new Error('Missing DISCORD_CLIENT_ID in environment (or legacy CLIENT_ID).');
    }

    if (!mongoUri) {
        throw new Error('Missing MONGODB_URI in environment.');
    }

    if (!apiKey) {
        throw new Error('Missing FINANCE_API_KEY in environment.');
    }

    cached = {
        token,
        clientId,
        mongoUri,
        apiBase: process.env.FINANCE_API_BASE || DEFAULT_API_BASE,
        apiKey,
        apiBearer,
        updateIntervalMs: coerceNumber(process.env.UPDATE_INTERVAL_MS, DEFAULT_UPDATE_INTERVAL),
        cacheTtlMs: coerceNumber(process.env.QUOTE_CACHE_TTL_MS, DEFAULT_CACHE_TTL)
    };

    return cached;
};

module.exports = {
    getEnv
};
