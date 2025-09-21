const { info, warn, error } = require("../utils/Console");
const guildConfigService = require("../services/guildConfig");
const { getQuote, normalizeSymbol } = require("../services/quotes");
const { getEnv } = require("../configuration/env");

const DEFAULT_MAX_BACKOFF = 5;

class VoiceTickerJob {
   constructor(client) {
      this.client = client;
      this.state = new Map(); // guildId -> { tickers: Map(channelId, state) }
      this.env = getEnv();
   }

   getGuildState(guildId) {
      if (!this.state.has(guildId)) {
         this.state.set(guildId, { tickers: new Map() });
      }
      return this.state.get(guildId);
   }

   extractTickers(config) {
      if (!config) return [];
      if (Array.isArray(config.voiceTickers) && config.voiceTickers.length) {
         return config.voiceTickers.filter((ticker) => ticker && ticker.voiceChannelId);
      }
      const legacy = config.voiceTicker;
      if (legacy && legacy.voiceChannelId) {
         return [legacy];
      }
      return [];
   }

   getEnabledTickers(config) {
      return this.extractTickers(config).filter((ticker) => ticker.enabled && ticker.voiceChannelId);
   }

   async start(guildId) {
      const config = await guildConfigService.getOrCreate(guildId);
      const enabledTickers = this.getEnabledTickers(config);

      if (!enabledTickers.length) {
         this.stop(guildId);
         return;
      }

      const guildState = this.getGuildState(guildId);
      const activeChannelIds = new Set(enabledTickers.map((ticker) => ticker.voiceChannelId));

      for (const channelId of guildState.tickers.keys()) {
         if (!activeChannelIds.has(channelId)) {
            this.stopChannel(guildId, channelId);
         }
      }

      enabledTickers.forEach((ticker) => this.startChannel(guildId, ticker, config));
   }

   async refresh(guildId) {
      await this.start(guildId);
   }

   stop(guildId, options = {}) {
      const guildState = this.state.get(guildId);
      if (!guildState) return;

      for (const channelId of guildState.tickers.keys()) {
         this.stopChannel(guildId, channelId, options);
      }

      this.state.delete(guildId);
   }

   async stopAll({ restoreName = false } = {}) {
      const guildIds = Array.from(this.state.keys());
      for (const guildId of guildIds) {
         this.stop(guildId, { restoreName });
      }
   }

   stopChannel(guildId, channelId, options = {}) {
      const guildState = this.state.get(guildId);
      if (!guildState) return;

      const tickerState = guildState.tickers.get(channelId);
      if (tickerState?.timeout) {
         clearTimeout(tickerState.timeout);
      }

      guildState.tickers.delete(channelId);
      if (!guildState.tickers.size) {
         this.state.delete(guildId);
      }

      if (options.restoreName) {
         this.restoreOriginalName(guildId, channelId).catch((err) => {
            warn(`Failed to restore voice channel name for guild ${guildId} channel ${channelId}.`);
            warn(err);
         });
      }
   }

   startChannel(guildId, ticker, config) {
      const guildState = this.getGuildState(guildId);
      const channelId = ticker.voiceChannelId;
      const existing = guildState.tickers.get(channelId) || {};
      const baseInterval = ticker.updateIntervalMs || config.voiceTicker?.updateIntervalMs || this.env.updateIntervalMs;

      const nextState = {
         timeout: null,
         lastName: existing.lastName || null,
         marketClosed: existing.marketClosed || false,
         backoffMs: baseInterval,
         baseInterval,
         lastUpdatedAt: existing.lastUpdatedAt || null,
         nextRunAt: null,
      };

      if (existing.timeout) {
         clearTimeout(existing.timeout);
      }

      guildState.tickers.set(channelId, nextState);
      info(`Voice ticker active for guild ${guildId} channel ${channelId}.`);
      this.schedule(guildId, channelId, 0);
   }

   schedule(guildId, channelId, delay) {
      const guildState = this.state.get(guildId);
      if (!guildState) return;

      const tickerState = guildState.tickers.get(channelId);
      if (!tickerState) return;

      if (tickerState.timeout) {
         clearTimeout(tickerState.timeout);
      }

      tickerState.nextRunAt = Date.now() + delay;
      tickerState.timeout = setTimeout(() => {
         this.tick(guildId, channelId).catch((err) => {
            error(`Voice ticker tick failed for guild ${guildId} channel ${channelId}.`);
            error(err);
         });
      }, delay);
   }

   async tick(guildId, channelId) {
      const guildState = this.state.get(guildId);
      if (!guildState) return;

      const tickerState = guildState.tickers.get(channelId);
      if (!tickerState) return;

      const config = await guildConfigService.getOrCreate(guildId);
      const ticker = this.getEnabledTickers(config).find((item) => item.voiceChannelId === channelId);

      if (!ticker) {
         this.stopChannel(guildId, channelId);
         return;
      }

      const guild = await this.fetchGuild(guildId);
      if (!guild) {
         warn(`Guild ${guildId} not found in cache for ticker.`);
         this.schedule(guildId, channelId, tickerState.baseInterval);
         return;
      }

      const channel = await this.fetchVoiceChannel(guild, channelId);
      if (!channel) {
         warn(`Voice channel ${channelId} missing for guild ${guildId}.`);
         this.schedule(guildId, channelId, tickerState.baseInterval);
         return;
      }

      const pairsSource = Array.isArray(ticker.pairs) && ticker.pairs.length ? ticker.pairs : config.watchlist || [];

      const pairs = pairsSource.map(normalizeSymbol).filter(Boolean);

      if (!pairs.length) {
         warn(`No pairs configured for guild ${guildId} voice ticker on channel ${channelId}.`);
         this.schedule(guildId, channelId, tickerState.baseInterval * 2);
         return;
      }

      try {
         const quotes = await Promise.all(pairs.map((pair) => getQuote(pair, config.defaultInterval)));
         const closed = quotes.every((quote) => quote.marketStatus && quote.marketStatus.isOpen === false);
         const formattedBase = this.buildTickerName(quotes, ticker);

         if (!formattedBase) {
            this.schedule(guildId, channelId, tickerState.baseInterval);
            return;
         }

         const formatted = formattedBase;
         const trimmed = formatted.slice(0, 96);

         if (trimmed === channel.name) {
            tickerState.lastName = trimmed;
            tickerState.lastUpdatedAt = Date.now();
            tickerState.marketClosed = closed;
            const delaySameName = closed ? tickerState.baseInterval * 2 : tickerState.baseInterval;
            this.schedule(guildId, channelId, delaySameName);
            return;
         }

         if (trimmed === tickerState.lastName) {
            tickerState.lastUpdatedAt = Date.now();
            const delayRepeat = closed ? tickerState.baseInterval * 2 : tickerState.baseInterval;
            this.schedule(guildId, channelId, delayRepeat);
            return;
         }

         await channel.setName(trimmed);
         tickerState.lastName = trimmed;
         tickerState.lastUpdatedAt = Date.now();
         tickerState.marketClosed = closed;
         tickerState.baseInterval = ticker.updateIntervalMs || config.voiceTicker?.updateIntervalMs || this.env.updateIntervalMs;
         tickerState.backoffMs = tickerState.baseInterval;

         const delay = closed ? tickerState.backoffMs * 2 : tickerState.backoffMs;
         this.schedule(guildId, channelId, delay);
      } catch (err) {
         warn(`Voice ticker failed for guild ${guildId} channel ${channelId}. Applying backoff.`);
         warn(err.message || err);
         tickerState.backoffMs = Math.min(tickerState.backoffMs * 2, tickerState.baseInterval * DEFAULT_MAX_BACKOFF);
         this.schedule(guildId, channelId, tickerState.backoffMs);
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
      const format = ticker.format || "{PAIR}:{PRICE}";
      const numberFormatter = new Intl.NumberFormat("en-US", {
         minimumFractionDigits: precision,
         maximumFractionDigits: precision,
      });

      const segments = quotes
         .slice(0, 4)
         .map((quote) => {
            const pair = quote.symbol.includes(":") ? quote.symbol.split(":")[1] : quote.symbol;
            const price = Number.isFinite(quote.price) ? numberFormatter.format(quote.price) : "—";
            return format.replace("{PAIR}", pair).replace("{PRICE}", price);
         })
         .filter(Boolean);

      const name = segments.join(" | ").trim();
      return name.length ? name : null;
   }

   async restoreOriginalName(guildId, channelId) {
      const config = await guildConfigService.getOrCreate(guildId);
      const ticker = this.extractTickers(config).find((item) => item.voiceChannelId === channelId);
      if (!ticker || !ticker.originalName) return;

      const guild = await this.fetchGuild(guildId);
      if (!guild) return;

      const channel = await this.fetchVoiceChannel(guild, channelId);
      if (!channel) return;

      if (channel.name === ticker.originalName) return;

      try {
         await channel.setName(ticker.originalName);
      } catch (err) {
         warn(`Failed to restore voice channel name for guild ${guildId} channel ${channelId}.`);
         warn(err.message || err);
      }
   }

   getStatuses(guildId) {
      const guildState = this.state.get(guildId);
      if (!guildState) return new Map();

      const entries = new Map();
      for (const [channelId, tickerState] of guildState.tickers.entries()) {
         entries.set(channelId, {
            lastName: tickerState.lastName || null,
            lastUpdatedAt: tickerState.lastUpdatedAt || null,
            marketClosed: tickerState.marketClosed || false,
            nextRunInMs: tickerState.nextRunAt ? Math.max(0, tickerState.nextRunAt - Date.now()) : null,
         });
      }

      return entries;
   }
}

module.exports = VoiceTickerJob;
