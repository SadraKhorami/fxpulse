const { ApplicationCommandOptionType, EmbedBuilder } = require('discord.js');
const ApplicationCommand = require('../../structure/ApplicationCommand');
const { getQuote, normalizeSymbol } = require('../../services/quotes');
const guildConfigService = require('../../services/guildConfig');
const { buildPriceEmbed, buildAnalysisEmbed, buildErrorEmbed } = require('../../utils/embed');
const { buildPriceComponents } = require('../../utils/components');
const { requireGuildConfig, requirePermission } = require('../../permissions/guards');
const { withEphemeral } = require('../../utils/interaction');

const INTERVAL_DESC = 'Interval in minutes (1,5,15,60). Defaults to guild setting or API default.';

module.exports = new ApplicationCommand({
    command: {
        name: 'fx',
        description: 'FXPulse market tools.',
        type: 1,
        options: [
            {
                name: 'price',
                description: 'Show a compact price snapshot.',
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    {
                        name: 'pair',
                        description: 'Symbol to query (e.g. XAUUSD or ODANA:XAUUSD).',
                        type: ApplicationCommandOptionType.String,
                        required: true,
                        autocomplete: true
                    },
                    {
                        name: 'interval',
                        description: INTERVAL_DESC,
                        type: ApplicationCommandOptionType.String
                    },
                    {
                        name: 'ephemeral',
                        description: 'Show result only to you.',
                        type: ApplicationCommandOptionType.Boolean
                    }
                ]
            },
            {
                name: 'analyze',
                description: 'Deep dive indicators for a pair.',
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    {
                        name: 'pair',
                        description: 'Symbol to analyze.',
                        type: ApplicationCommandOptionType.String,
                        required: true,
                        autocomplete: true
                    },
                    {
                        name: 'interval',
                        description: INTERVAL_DESC,
                        type: ApplicationCommandOptionType.String
                    }
                ]
            },
            {
                name: 'watch',
                description: 'Manage the guild watchlist.',
                type: ApplicationCommandOptionType.SubcommandGroup,
                options: [
                    {
                        name: 'add',
                        description: 'Add a pair to the watchlist.',
                        type: ApplicationCommandOptionType.Subcommand,
                        options: [
                            {
                                name: 'pair',
                                description: 'Symbol to add.',
                                type: ApplicationCommandOptionType.String,
                                required: true,
                                autocomplete: true
                            }
                        ]
                    },
                    {
                        name: 'remove',
                        description: 'Remove a pair from the watchlist.',
                        type: ApplicationCommandOptionType.Subcommand,
                        options: [
                            {
                                name: 'pair',
                                description: 'Symbol to remove.',
                                type: ApplicationCommandOptionType.String,
                                required: true,
                                autocomplete: true
                            }
                        ]
                    },
                    {
                        name: 'list',
                        description: 'Show current watchlist.',
                        type: ApplicationCommandOptionType.Subcommand
                    }
                ]
            }
        ]
    },
    metadata: {
        category: 'FX',
        shortDescription: 'Fetch prices, analyze indicators, and manage watchlists.',
        usage: '/fx price pair:<symbol> [interval] [ephemeral]',
        options: [
            { name: 'price', description: 'Returns an FX snapshot with controls.', required: true },
            { name: 'analyze', description: 'Detailed indicator breakdown.', required: false },
            { name: 'watch', description: 'Manage the shared watchlist.', required: false }
        ],
        permissions: 'Admins or members with an allowed role.'
    },
    /**
     * @param {import('../../client/DiscordBot')} client
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     */
    run: async (client, interaction) => {
        if (!interaction.inGuild()) {
            await interaction.reply(withEphemeral({ embeds: [buildErrorEmbed('FXPulse commands require a guild.')] }));
            return;
        }

        const guildId = interaction.guildId;
        const { ok, config, reason } = await requireGuildConfig(guildId);

        if (!ok) {
            await interaction.reply(withEphemeral({ embeds: [buildErrorEmbed(reason)] }));
            return;
        }

        const permission = requirePermission(interaction.member, config);

        if (!permission.ok) {
            await interaction.reply(withEphemeral({ embeds: [buildErrorEmbed(permission.reason)] }));
            return;
        }

        const subcommandGroup = interaction.options.getSubcommandGroup(false);
        const subcommand = interaction.options.getSubcommand();

        try {
            if (subcommandGroup === 'watch') {
                await handleWatchSubcommand(interaction, config, subcommand);
                return;
            }

            if (subcommand === 'price') {
                await handlePrice(interaction, config);
                return;
            }

            if (subcommand === 'analyze') {
                await handleAnalyze(interaction, config);
                return;
            }
        } catch (err) {
            const message = err.message && err.message.includes('No market data')
                ? err.message
                : 'Something went wrong fetching data. Please try again shortly.';

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [buildErrorEmbed(message)], components: [] });
            } else if (!interaction.replied) {
                await interaction.reply(withEphemeral({ embeds: [buildErrorEmbed(message)] }));
            } else {
                await interaction.followUp(withEphemeral({ embeds: [buildErrorEmbed(message)] }));
            }

            throw err;
        }
    }
}).toJSON();

const sanitizeInterval = (interval, fallback) => {
    if (!interval) return fallback;
    const cleaned = `${interval}`.replace(/[^0-9]/g, '');
    return cleaned.length ? cleaned : fallback;
};

const handlePrice = async (interaction, config) => {
    const pairRaw = interaction.options.getString('pair', true);
    const intervalInput = interaction.options.getString('interval');
    const ephemeral = interaction.options.getBoolean('ephemeral') ?? false;
    const symbol = normalizeSymbol(pairRaw);
    const interval = sanitizeInterval(intervalInput, config.defaultInterval);

    await interaction.deferReply(ephemeral ? withEphemeral() : {});

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

const handleAnalyze = async (interaction, config) => {
    const pairRaw = interaction.options.getString('pair', true);
    const intervalInput = interaction.options.getString('interval');
    const symbol = normalizeSymbol(pairRaw);
    const interval = sanitizeInterval(intervalInput, config.defaultInterval);

    await interaction.deferReply(withEphemeral());

    const quote = await getQuote(symbol, interval);

    const embed = buildAnalysisEmbed({ quote, interval, locale: config.locale });

    await interaction.editReply({ embeds: [embed] });
};

const handleWatchSubcommand = async (interaction, config, subcommand) => {
    const guildId = interaction.guildId;

    if (subcommand === 'list') {
        const watchlist = config.watchlist || [];
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('FXPulse Watchlist')
            .setDescription(watchlist.length ? watchlist.map((pair) => `• ${pair}`).join('\n') : 'Watchlist is empty — add pairs with `/fx watch add`.')
            .setFooter({ text: 'FXPulse • developed by wise.fox' });

        await interaction.reply(withEphemeral({ embeds: [embed] }));
        return;
    }

    const pairRaw = interaction.options.getString('pair', true);
    const symbol = normalizeSymbol(pairRaw);

    if (subcommand === 'add') {
        const updated = await guildConfigService.addWatchPair(guildId, symbol);
        await interaction.reply(withEphemeral({ content: `Added **${symbol}** to the watchlist (${updated.watchlist.length} total).` }));
        return;
    }

    if (subcommand === 'remove') {
        const updated = await guildConfigService.removeWatchPair(guildId, symbol);
        await interaction.reply(withEphemeral({ content: `Removed **${symbol}** from the watchlist (${updated.watchlist.length} remaining).` }));
        return;
    }
};
