const getVoiceTickers = (config) => {
    if (!config) return [];
    if (Array.isArray(config.voiceTickers) && config.voiceTickers.length) {
        return config.voiceTickers.filter((ticker) => ticker && ticker.voiceChannelId);
    }
    if (config.voiceTicker && config.voiceTicker.voiceChannelId) {
        return [config.voiceTicker];
    }
    return [];
};

const resolveTickerPrecision = (config) => {
    const tickers = getVoiceTickers(config);
    const candidate = tickers.find((ticker) => ticker.enabled && Number.isFinite(ticker.precision))
        || tickers.find((ticker) => Number.isFinite(ticker.precision));

    if (candidate && Number.isFinite(candidate.precision)) {
        return candidate.precision;
    }

    if (config?.voiceTicker && Number.isFinite(config.voiceTicker.precision)) {
        return config.voiceTicker.precision;
    }

    return undefined;
};

module.exports = {
    getVoiceTickers,
    resolveTickerPrecision
};
