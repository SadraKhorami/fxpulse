const { buildPriceEmbed, buildAnalysisEmbed, buildErrorEmbed } = require('../utils/embed');
const { buildPriceComponents, parseCustomId } = require('../utils/components');
const { getQuote, normalizeSymbol } = require('../services/quotes');
const guildConfigService = require('../services/guildConfig');
const { requireGuildConfig, requirePermission } = require('../permissions/guards');
const { withEphemeral } = require('../utils/interaction');

const handlePriceUpdate = async (interaction, symbol, intervalOverride) => {
    const { ok, config, reason } = await requireGuildConfig(interaction.guildId);

    if (!ok) {
        await interaction.followUp(withEphemeral({ embeds: [buildErrorEmbed(reason)] }));
        return;
    }

    const permission = requirePermission(interaction.member, config);
    if (!permission.ok) {
        await interaction.followUp(withEphemeral({ embeds: [buildErrorEmbed(permission.reason)] }));
        return;
    }

    const interval = intervalOverride || config.defaultInterval;
    const quote = await getQuote(symbol, interval);
    const embed = buildPriceEmbed({ quote, interval, precisionOverride: config.voiceTicker?.precision, locale: config.locale });
    const components = buildPriceComponents({
        symbol,
        interval,
        isWatched: (config.watchlist || []).includes(symbol),
        customPairs: config.watchlist
    });

    await interaction.editReply({ embeds: [embed], components });
};

const handleWatch = async (interaction, symbol, action) => {
    const { ok, config, reason } = await requireGuildConfig(interaction.guildId);

    if (!ok) {
        await interaction.followUp(withEphemeral({ embeds: [buildErrorEmbed(reason)] }));
        return;
    }

    const permission = requirePermission(interaction.member, config);
    if (!permission.ok) {
        await interaction.followUp(withEphemeral({ embeds: [buildErrorEmbed(permission.reason)] }));
        return;
    }

    const updated = action === 'watch'
        ? await guildConfigService.addWatchPair(interaction.guildId, symbol)
        : await guildConfigService.removeWatchPair(interaction.guildId, symbol);

    const parsed = parseCustomId(interaction.customId);
    const intervalSegment = parsed?.args?.[1] || config.defaultInterval;
    const quote = await getQuote(symbol, intervalSegment);

    const embed = buildPriceEmbed({ quote, interval: intervalSegment, precisionOverride: updated.voiceTicker?.precision, locale: updated.locale });
    const components = buildPriceComponents({
        symbol,
        interval: intervalSegment,
        isWatched: (updated.watchlist || []).includes(symbol),
        customPairs: updated.watchlist
    });

    await interaction.editReply({ embeds: [embed], components });
    await interaction.followUp(withEphemeral({ content: `${action === 'watch' ? 'Added' : 'Removed'} **${symbol}** ${action === 'watch' ? 'to' : 'from'} watchlist.` }));
};

const handleDetails = async (interaction, symbol, intervalOverride) => {
    const { ok, config, reason } = await requireGuildConfig(interaction.guildId);

    if (!ok) {
        await interaction.followUp(withEphemeral({ embeds: [buildErrorEmbed(reason)] }));
        return;
    }

    const permission = requirePermission(interaction.member, config);
    if (!permission.ok) {
        await interaction.followUp(withEphemeral({ embeds: [buildErrorEmbed(permission.reason)] }));
        return;
    }

    const interval = intervalOverride || config.defaultInterval;
    const quote = await getQuote(symbol, interval);
    const embed = buildAnalysisEmbed({ quote, interval, locale: config.locale });

    await interaction.followUp(withEphemeral({ embeds: [embed] }));
};

const handlePairSelect = async (interaction) => {
    const value = interaction.values?.[0];
    const symbol = normalizeSymbol(value);

    const { ok, config, reason } = await requireGuildConfig(interaction.guildId);

    if (!ok) {
        await interaction.reply(withEphemeral({ embeds: [buildErrorEmbed(reason)] }));
        return;
    }

    const permission = requirePermission(interaction.member, config);
    if (!permission.ok) {
        await interaction.reply(withEphemeral({ embeds: [buildErrorEmbed(permission.reason)] }));
        return;
    }

    await interaction.deferUpdate();

    const interval = config.defaultInterval;
    const quote = await getQuote(symbol, interval);
    const embed = buildPriceEmbed({ quote, interval, precisionOverride: config.voiceTicker?.precision, locale: config.locale });
    const components = buildPriceComponents({
        symbol,
        interval,
        isWatched: (config.watchlist || []).includes(symbol),
        customPairs: config.watchlist
    });

    await interaction.editReply({ embeds: [embed], components });
};

const handleFxPulseComponent = async (interaction) => {
    const parsed = parseCustomId(interaction.customId);
    if (!parsed) return false;

    const [symbolPart, intervalPart] = parsed.args || [];
    const symbol = normalizeSymbol(symbolPart || interaction.values?.[0]);
    const interval = intervalPart || undefined;

    try {
        if (interaction.isButton()) {
            await interaction.deferUpdate();

            switch (parsed.action) {
                case 'refresh':
                case 'interval':
                    await handlePriceUpdate(interaction, symbol, interval);
                    return true;
                case 'watch':
                case 'unwatch':
                    await handleWatch(interaction, symbol, parsed.action);
                    return true;
                case 'details':
                    await handleDetails(interaction, symbol, interval);
                    return true;
                default:
                    return false;
            }
        }

        if (interaction.isStringSelectMenu()) {
            await handlePairSelect(interaction);
            return true;
        }
    } catch (err) {
        const fallback = buildErrorEmbed('Something went wrong handling that action.');
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply(withEphemeral({ embeds: [fallback] })).catch(() => null);
        } else {
            await interaction.followUp(withEphemeral({ embeds: [fallback] })).catch(() => null);
        }
        throw err;
    }

    return false;
};

module.exports = {
    handleFxPulseComponent
};
