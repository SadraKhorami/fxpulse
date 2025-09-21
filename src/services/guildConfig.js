const GuildConfigModel = require('../database/models/GuildConfig');
const { connect } = require('../database/connection');

const toPlain = (doc) => {
    if (!doc) return null;

    const plain = doc.toObject();

    if (!Array.isArray(plain.voiceTickers)) {
        plain.voiceTickers = [];
    }

    if (!plain.voiceTickers.length && plain.voiceTicker && plain.voiceTicker.voiceChannelId) {
        plain.voiceTickers = [plain.voiceTicker];
    }

    if (!plain.voiceTicker || !plain.voiceTicker.voiceChannelId) {
        plain.voiceTicker = plain.voiceTickers[0] || plain.voiceTicker || {};
    }

    return plain;
};

const toPlainTicker = (ticker) => {
    if (!ticker) return {};
    return typeof ticker.toObject === 'function' ? ticker.toObject() : { ...ticker };
};

const syncLegacyVoiceTicker = (doc) => {
    const tickers = Array.isArray(doc.voiceTickers) ? doc.voiceTickers : [];
    const firstEnabled = tickers.find((ticker) => ticker.enabled && ticker.voiceChannelId);
    const fallback = firstEnabled || tickers[0];
    if (fallback) {
        doc.voiceTicker = fallback;
    } else if (!doc.voiceTicker) {
        doc.voiceTicker = {};
    }
};

const getOrCreate = async (guildId) => {
    await connect();

    let config = await GuildConfigModel.findOne({ guildId });

    if (!config) {
        config = await GuildConfigModel.create({ guildId });
    }

    return toPlain(config);
};

const update = async (guildId, payload) => {
    await connect();

    const config = await GuildConfigModel.findOneAndUpdate({ guildId }, payload, {
        new: true,
        upsert: true
    });

    return toPlain(config);
};

const addRole = async (guildId, roleId) => {
    await connect();

    const config = await GuildConfigModel.findOneAndUpdate(
        { guildId },
        { $addToSet: { allowedRoles: roleId } },
        { new: true, upsert: true }
    );

    return toPlain(config);
};

const removeRole = async (guildId, roleId) => {
    await connect();

    const config = await GuildConfigModel.findOneAndUpdate(
        { guildId },
        { $pull: { allowedRoles: roleId } },
        { new: true, upsert: true }
    );

    return toPlain(config);
};

const setLocale = async (guildId, locale) => update(guildId, { locale });
const setDefaultInterval = async (guildId, interval) => update(guildId, { defaultInterval: interval });

const addWatchPair = async (guildId, pair) => {
    await connect();

    const config = await GuildConfigModel.findOneAndUpdate(
        { guildId },
        { $addToSet: { watchlist: pair } },
        { new: true, upsert: true }
    );

    return toPlain(config);
};

const removeWatchPair = async (guildId, pair) => {
    await connect();

    const config = await GuildConfigModel.findOneAndUpdate(
        { guildId },
        { $pull: { watchlist: pair } },
        { new: true, upsert: true }
    );

    return toPlain(config);
};

const setWatchPairs = async (guildId, pairs) => update(guildId, { watchlist: pairs });

const upsertVoiceTicker = async (guildId, channelId, partial) => {
    await connect();

    let config = await GuildConfigModel.findOne({ guildId });
    if (!config) {
        config = await GuildConfigModel.create({ guildId });
    }

    const current = Array.isArray(config.voiceTickers) ? config.voiceTickers.map(toPlainTicker) : [];
    const index = current.findIndex((ticker) => ticker.voiceChannelId === channelId);
    const existing = index >= 0 ? current[index] : {};

    const merged = {
        ...existing,
        ...partial,
        voiceChannelId: channelId
    };

    if (index >= 0) {
        current[index] = merged;
    } else {
        current.push(merged);
    }

    config.voiceTickers = current;
    config.markModified('voiceTickers');
    syncLegacyVoiceTicker(config);
    await config.save();

    return toPlain(config);
};

const disableVoiceTicker = async (guildId, channelId) => {
    await connect();

    const config = await GuildConfigModel.findOne({ guildId });
    if (!config) return null;

    const current = Array.isArray(config.voiceTickers) ? config.voiceTickers.map(toPlainTicker) : [];
    let updated = false;

    const next = current.map((ticker) => {
        if (ticker.voiceChannelId === channelId) {
            updated = true;
            return { ...ticker, enabled: false };
        }
        return ticker;
    });

    if (!updated) {
        return toPlain(config);
    }

    config.voiceTickers = next;
    config.markModified('voiceTickers');
    syncLegacyVoiceTicker(config);
    await config.save();

    return toPlain(config);
};

const disableAllVoiceTickers = async (guildId) => {
    await connect();

    const config = await GuildConfigModel.findOne({ guildId });
    if (!config) return null;

    const current = Array.isArray(config.voiceTickers) ? config.voiceTickers.map((ticker) => ({ ...toPlainTicker(ticker), enabled: false })) : [];

    if (current.length) {
        config.voiceTickers = current;
        config.markModified('voiceTickers');
    }

    if (config.voiceTicker && config.voiceTicker.enabled) {
        config.voiceTicker.enabled = false;
    }

    syncLegacyVoiceTicker(config);
    await config.save();

    return toPlain(config);
};

const setVoiceTicker = async (guildId, partial) => {
    const voiceChannelId = partial.voiceChannelId;
    if (voiceChannelId) {
        return upsertVoiceTicker(guildId, voiceChannelId, partial);
    }

    await connect();

    const payload = Object.entries(partial).reduce((acc, [key, value]) => {
        acc[`voiceTicker.${key}`] = value;
        return acc;
    }, {});

    const config = await GuildConfigModel.findOneAndUpdate(
        { guildId },
        { $set: payload },
        { new: true, upsert: true }
    );

    return toPlain(config);
};

const findVoiceTickerGuilds = async () => {
    await connect();
    const guilds = await GuildConfigModel.find({
        $or: [
            { 'voiceTickers.enabled': true },
            { 'voiceTicker.enabled': true }
        ]
    });
    return guilds.map(toPlain);
};

module.exports = {
    getOrCreate,
    update,
    addRole,
    removeRole,
    setLocale,
    setDefaultInterval,
    addWatchPair,
    removeWatchPair,
    setWatchPairs,
    setVoiceTicker,
    upsertVoiceTicker,
    disableVoiceTicker,
    disableAllVoiceTickers,
    findVoiceTickerGuilds
};
