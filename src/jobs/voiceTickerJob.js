const { info, warn, error } = require('../utils/Console');
const guildConfigService = require('../services/guildConfig');
const { getQuote, normalizeSymbol } = require('../services/quotes');
const { getEnv } = require('../configuration/env');

const DEFAULT_MAX_BACKOFF = 5;

class VoiceTickerJob {
    constructor(client) {
        this.client = client;
        this.state = new Map();
        this.env = getEnv();
    }

    async start(guildId) {
        const config = await guildConfigService.getOrCreate(guildId);
        const ticker = config.voiceTicker || {};

        if (!ticker.enabled || !ticker.voiceChannelId) {
            this.stop(guildId);
            return;
        }

        info(`Voice ticker enabled for guild ${guildId}.`);

        const existing = this.state.get(guildId) || {};
        this.state.set(guildId, {
            timeout: existing.timeout || null,
            backoffMs: ticker.updateIntervalMs || this.env.updateIntervalMs,
            baseInterval: ticker.updateIntervalMs || this.env.updateIntervalMs,
            lastName: existing.lastName || null,
            marketClosed: false
        });

        this.schedule(guildId, 0);
    }

    stop(guildId, options = {}) {
        const state = this.state.get(guildId);
        if (state?.timeout) {
            clearTimeout(state.timeout);
        }
        this.state.delete(guildId);

        if (options.restoreName) {
            this.restoreOriginalName(guildId).catch((err) => {
                warn(`Failed to restore voice channel name for guild ${guildId}.`);
                warn(err);
            });
        }
    }

    async stopAll({ restoreName = false } = {}) {
        const guilds = Array.from(this.state.keys());
        for (const guildId of guilds) {
            this.stop(guildId, { restoreName });
        }
    }

    schedule(guildId, delay) {
        const state = this.state.get(guildId);
        if (!state) return;

        if (state.timeout) clearTimeout(state.timeout);

        state.timeout = setTimeout(() => this.tick(guildId).catch((err) => {
            error(`Voice ticker tick failed for guild ${guildId}.`);
            error(err);
        }), delay);

        this.state.set(guildId, state);
    }

    async tick(guildId) {
        const state = this.state.get(guildId);
        if (!state) return;

        const config = await guildConfigService.getOrCreate(guildId);
        const ticker = config.voiceTicker || {};

        if (!ticker.enabled || !ticker.voiceChannelId) {
            this.stop(guildId);
            return;
        }

        const guild = await this.fetchGuild(guildId);
        if (!guild) {
            warn(`Guild ${guildId} not found in cache for ticker.`);
            this.schedule(guildId, state.baseInterval);
            return;
        }

        const channel = await this.fetchVoiceChannel(guild, ticker.voiceChannelId);
        if (!channel) {
            warn(`Voice channel ${ticker.voiceChannelId} missing for guild ${guildId}.`);
            this.schedule(guildId, state.baseInterval);
            return;
        }

        const pairs = (ticker.pairs && ticker.pairs.length) ? ticker.pairs.map(normalizeSymbol) : (config.watchlist || []).map(normalizeSymbol);
        if (!pairs.length) {
            warn(`No pairs configured for guild ${guildId} voice ticker.`);
            this.schedule(guildId, state.baseInterval * 2);
            return;
        }

        try {
            const quotes = await Promise.all(pairs.map((pair) => getQuote(pair, config.defaultInterval)));

            const formatted = this.buildTickerName(quotes, ticker);

            if (!formatted) {
                this.schedule(guildId, state.baseInterval);
                return;
            }

            if (formatted === state.lastName) {
                this.schedule(guildId, state.baseInterval);
                return;
            }

            await channel.setName(formatted);
            state.lastName = formatted;
            state.marketClosed = quotes.every((quote) => quote.marketStatus && quote.marketStatus.isOpen === false);
            state.backoffMs = ticker.updateIntervalMs || this.env.updateIntervalMs;

            const delay = state.marketClosed ? state.backoffMs * 2 : state.backoffMs;
            this.schedule(guildId, delay);
        } catch (err) {
            warn(`Voice ticker failed for guild ${guildId}. Applying backoff.`);
            warn(err.message || err);
            state.backoffMs = Math.min(state.backoffMs * 2, state.baseInterval * DEFAULT_MAX_BACKOFF);
            this.schedule(guildId, state.backoffMs);
        }
    }

    async fetchGuild(guildId) {
        return this.client.guilds.cache.get(guildId) || this.client.guilds.fetch(guildId).catch(() => null);
    }

    async fetchVoiceChannel(guild, channelId) {
        const cached = guild.channels.cache.get(channelId);
        if (cached) return cached;
        try {
            const fetched = await guild.channels.fetch(channelId);
            return fetched && fetched.isVoiceBased() ? fetched : null;
        } catch {
            return null;
        }
    }

    buildTickerName(quotes, ticker) {
        const precision = Number.isFinite(ticker.precision) ? ticker.precision : 3;
        const format = ticker.format || '{PAIR}:{PRICE}';
        const numberFormatter = new Intl.NumberFormat('en-US', {
            minimumFractionDigits: precision,
            maximumFractionDigits: precision
        });

        const segments = quotes.slice(0, 4).map((quote) => {
            const pair = quote.symbol.includes(':') ? quote.symbol.split(':')[1] : quote.symbol;
            const price = Number.isFinite(quote.price) ? numberFormatter.format(quote.price) : '—';
            return format.replace('{PAIR}', pair).replace('{PRICE}', price);
        });

        let name = segments.join(' | ');

        if (!name.length) return null;

        if (quotes.every((quote) => quote.marketStatus && quote.marketStatus.isOpen === false)) {
            name = `${name} • Closed`;
        }

        return name.slice(0, 96);
    }

    async restoreOriginalName(guildId) {
        const config = await guildConfigService.getOrCreate(guildId);
        const ticker = config.voiceTicker || {};
        if (!ticker.voiceChannelId || !ticker.originalName) return;

        const guild = await this.fetchGuild(guildId);
        if (!guild) return;

        const channel = await this.fetchVoiceChannel(guild, ticker.voiceChannelId);
        if (!channel) return;

        try {
            await channel.setName(ticker.originalName);
        } catch (err) {
            warn(`Failed to restore voice channel name for ${guildId}.`);
            warn(err.message || err);
        }
    }
}

module.exports = VoiceTickerJob;
