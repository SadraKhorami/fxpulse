const GuildConfigModel = require('../database/models/GuildConfig');
const { connect } = require('../database/connection');

const toPlain = (doc) => (doc ? doc.toObject() : null);

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

const setVoiceTicker = async (guildId, partial) => {
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
    const guilds = await GuildConfigModel.find({ 'voiceTicker.enabled': true });
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
    findVoiceTickerGuilds
};
