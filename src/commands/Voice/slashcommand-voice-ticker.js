const { ApplicationCommandOptionType, ChannelType, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const ApplicationCommand = require('../../structure/ApplicationCommand');
const guildConfigService = require('../../services/guildConfig');
const { normalizeSymbol } = require('../../services/quotes');
const { buildErrorEmbed } = require('../../utils/embed');
const { requireGuildConfig, isAdmin } = require('../../permissions/guards');
const { withEphemeral } = require('../../utils/interaction');
const { getVoiceTickers } = require('../../utils/voiceTicker');
const { getEnv } = require('../../configuration/env');

const { updateIntervalMs: DEFAULT_INTERVAL_MS } = getEnv();
const MAX_TICKERS_PER_GUILD = 3;

const findTicker = (config, channelId) => getVoiceTickers(config).find((ticker) => ticker.voiceChannelId === channelId);

const countEnabledTickers = (config, excludeChannelId) => getVoiceTickers(config)
    .filter((ticker) => ticker.enabled && (!excludeChannelId || ticker.voiceChannelId !== excludeChannelId))
    .length;

const parsePairs = (input) => {
    if (!input) return [];
    return input
        .split(/[\s,]+/)
        .map((item) => normalizeSymbol(item))
        .filter(Boolean);
};

const formatLastUpdate = (status) => {
    if (!status || !status.lastUpdatedAt) return '—';
    return `<t:${Math.floor(status.lastUpdatedAt / 1000)}:R>`;
};

module.exports = new ApplicationCommand({
    command: {
        name: 'voice-ticker',
        description: 'Configure the FXPulse voice channel ticker.',
        type: 1,
        default_member_permissions: String(PermissionFlagsBits.ManageGuild),
        options: [
            {
                name: 'enable',
                description: 'Enable the voice ticker on a channel.',
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    {
                        name: 'channel',
                        description: 'Voice channel to rename periodically.',
                        type: ApplicationCommandOptionType.Channel,
                        channel_types: [ChannelType.GuildVoice],
                        required: true
                    },
                    {
                        name: 'pairs',
                        description: 'Comma separated list of pairs to rotate.',
                        type: ApplicationCommandOptionType.String,
                        required: false
                    }
                ]
            },
            {
                name: 'disable',
                description: 'Disable the voice ticker and restore the name.',
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    {
                        name: 'channel',
                        description: 'Voice channel to disable. Omit to disable all.',
                        type: ApplicationCommandOptionType.Channel,
                        channel_types: [ChannelType.GuildVoice],
                        required: false
                    }
                ]
            },
            {
                name: 'set-pairs',
                description: 'Override the tracked pairs list.',
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    {
                        name: 'channel',
                        description: 'Voice channel to update.',
                        type: ApplicationCommandOptionType.Channel,
                        channel_types: [ChannelType.GuildVoice],
                        required: true
                    },
                    {
                        name: 'pairs',
                        description: 'Comma separated list of pairs.',
                        type: ApplicationCommandOptionType.String,
                        required: true
                    }
                ]
            },
            {
                name: 'set-format',
                description: 'Customize the ticker format (use {PAIR} and {PRICE}).',
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    {
                        name: 'channel',
                        description: 'Voice channel to update.',
                        type: ApplicationCommandOptionType.Channel,
                        channel_types: [ChannelType.GuildVoice],
                        required: true
                    },
                    {
                        name: 'format',
                        description: 'Format string, e.g. "{PAIR}:{PRICE}".',
                        type: ApplicationCommandOptionType.String,
                        required: true
                    }
                ]
            },
            {
                name: 'set-precision',
                description: 'Set decimal precision for prices.',
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    {
                        name: 'channel',
                        description: 'Voice channel to update.',
                        type: ApplicationCommandOptionType.Channel,
                        channel_types: [ChannelType.GuildVoice],
                        required: true
                    },
                    {
                        name: 'digits',
                        description: 'Number of decimals (1-6).',
                        type: ApplicationCommandOptionType.Integer,
                        required: true,
                        min_value: 1,
                        max_value: 6
                    }
                ]
            },
            {
                name: 'show',
                description: 'Display the current voice ticker configuration.',
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    {
                        name: 'channel',
                        description: 'Voice channel to inspect. Omit to list all.',
                        type: ApplicationCommandOptionType.Channel,
                        channel_types: [ChannelType.GuildVoice],
                        required: false
                    }
                ]
            }
        ]
    },
    metadata: {
        category: 'Voice',
        shortDescription: 'Enable and maintain the live voice ticker.',
        usage: '/voice-ticker enable channel:<voice-channel>',
        permissions: 'Administrator or Manage Guild required.'
    },
    /**
     * @param {import('../../client/DiscordBot')} client
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     */
    run: async (client, interaction) => {
        if (!interaction.inGuild()) {
            await interaction.reply(withEphemeral({ embeds: [buildErrorEmbed('Use this command inside a guild.')] }));
            return;
        }

        const guildId = interaction.guildId;
        const { ok, config, reason } = await requireGuildConfig(guildId);

        if (!ok) {
            await interaction.reply(withEphemeral({ embeds: [buildErrorEmbed(reason)] }));
            return;
        }

        if (!isAdmin(interaction.member)) {
            await interaction.reply(withEphemeral({ embeds: [buildErrorEmbed('Administrator or Manage Guild permission required.')] }));
            return;
        }

        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'enable':
                await handleEnable(interaction, config, client, guildId);
                break;
            case 'disable':
                await handleDisable(interaction, config, client, guildId);
                break;
            case 'set-pairs':
                await handleSetPairs(interaction, config, client, guildId);
                break;
            case 'set-format':
                await handleSetFormat(interaction, config, client, guildId);
                break;
            case 'set-precision':
                await handleSetPrecision(interaction, config, client, guildId);
                break;
            case 'show':
                await handleShow(interaction, config, client);
                break;
            default:
                await interaction.reply(withEphemeral({ embeds: [buildErrorEmbed('Unknown subcommand.')] }));
        }
    }
}).toJSON();

const handleEnable = async (interaction, config, client, guildId) => {
    const channel = interaction.options.getChannel('channel', true);
    const pairsInput = interaction.options.getString('pairs');
    const existing = findTicker(config, channel.id);
    const activeCount = countEnabledTickers(config, channel.id);

    if (!existing?.enabled && activeCount >= MAX_TICKERS_PER_GUILD) {
        await interaction.reply(withEphemeral({ embeds: [buildErrorEmbed('You can only track up to 3 voice channels in this server.')] }));
        return;
    }

    const parsedPairs = parsePairs(pairsInput);
    const nextPairs = parsedPairs.length
        ? parsedPairs
        : (existing?.pairs && existing.pairs.length ? existing.pairs : (config.watchlist || []));

    const payload = {
        enabled: true,
        pairs: nextPairs,
        format: existing?.format || '{PAIR}:{PRICE}',
        precision: Number.isFinite(existing?.precision) ? existing.precision : 3,
        updateIntervalMs: existing?.updateIntervalMs || config.voiceTicker?.updateIntervalMs || DEFAULT_INTERVAL_MS,
        originalName: existing?.originalName || channel.name
    };

    await guildConfigService.upsertVoiceTicker(guildId, channel.id, payload);
    await client.voiceTicker.start(guildId);

    await interaction.reply(withEphemeral({ content: `Voice ticker enabled on **${channel.name}**.` }));
};

const handleDisable = async (interaction, config, client, guildId) => {
    const channel = interaction.options.getChannel('channel');

    if (channel) {
        const ticker = findTicker(config, channel.id);

        if (!ticker || !ticker.enabled) {
            await interaction.reply(withEphemeral({ embeds: [buildErrorEmbed('That channel does not have an active voice ticker.')] }));
            return;
        }

        await guildConfigService.disableVoiceTicker(guildId, channel.id);
        client.voiceTicker.stopChannel(guildId, channel.id, { restoreName: true });
        await interaction.reply(withEphemeral({ content: `Voice ticker disabled on **${channel.name}**.` }));
        return;
    }

    const activeCount = countEnabledTickers(config);
    if (!activeCount) {
        await interaction.reply(withEphemeral({ embeds: [buildErrorEmbed('No active voice tickers to disable.')] }));
        return;
    }

    await guildConfigService.disableAllVoiceTickers(guildId);
    client.voiceTicker.stop(guildId, { restoreName: true });
    await interaction.reply(withEphemeral({ content: 'All voice tickers disabled.' }));
};

const handleSetPairs = async (interaction, config, client, guildId) => {
    const channel = interaction.options.getChannel('channel', true);
    const pairs = parsePairs(interaction.options.getString('pairs', true));

    if (!pairs.length) {
        await interaction.reply(withEphemeral({ embeds: [buildErrorEmbed('Provide at least one valid symbol.')] }));
        return;
    }

    const existing = findTicker(config, channel.id);
    const payload = { pairs };
    if (!existing) {
        payload.enabled = false;
        payload.format = '{PAIR}:{PRICE}';
        payload.precision = 3;
        payload.updateIntervalMs = DEFAULT_INTERVAL_MS;
        payload.originalName = channel.name;
    }

    await guildConfigService.upsertVoiceTicker(guildId, channel.id, payload);

    if (existing?.enabled) {
        await client.voiceTicker.start(guildId);
    }

    await interaction.reply(withEphemeral({ content: `Updated pairs for **${channel.name}**.` }));
};

const handleSetFormat = async (interaction, config, client, guildId) => {
    const channel = interaction.options.getChannel('channel', true);
    const format = interaction.options.getString('format', true);

    if (!format.includes('{PAIR}') || !format.includes('{PRICE}')) {
        await interaction.reply(withEphemeral({ embeds: [buildErrorEmbed('Format must contain {PAIR} and {PRICE}.')] }));
        return;
    }

    const existing = findTicker(config, channel.id);
    const payload = { format };
    if (!existing) {
        payload.enabled = false;
        payload.pairs = [];
        payload.precision = 3;
        payload.updateIntervalMs = DEFAULT_INTERVAL_MS;
        payload.originalName = channel.name;
    }

    await guildConfigService.upsertVoiceTicker(guildId, channel.id, payload);

    if (existing?.enabled) {
        await client.voiceTicker.start(guildId);
    }

    await interaction.reply(withEphemeral({ content: `Ticker format updated for **${channel.name}**.` }));
};

const handleSetPrecision = async (interaction, config, client, guildId) => {
    const channel = interaction.options.getChannel('channel', true);
    const digits = interaction.options.getInteger('digits', true);

    const existing = findTicker(config, channel.id);
    const payload = { precision: digits };
    if (!existing) {
        payload.enabled = false;
        payload.pairs = [];
        payload.format = '{PAIR}:{PRICE}';
        payload.updateIntervalMs = DEFAULT_INTERVAL_MS;
        payload.originalName = channel.name;
    }

    await guildConfigService.upsertVoiceTicker(guildId, channel.id, payload);

    if (existing?.enabled) {
        await client.voiceTicker.start(guildId);
    }

    await interaction.reply(withEphemeral({ content: `Ticker precision set to ${digits} decimals for **${channel.name}**.` }));
};

const handleShow = async (interaction, config, client) => {
    const channel = interaction.options.getChannel('channel');
    const tickers = getVoiceTickers(config).filter((ticker) => ticker.enabled);

    if (!tickers.length) {
        await interaction.reply(withEphemeral({ embeds: [buildErrorEmbed('No active voice tickers configured.')] }));
        return;
    }

    const statuses = client.voiceTicker.getStatuses(interaction.guildId);
    const embed = new EmbedBuilder()
        .setTitle('Voice Ticker Settings')
        .setColor(0x5865f2)
        .setFooter({ text: 'FXPulse • developed by wise.fox' });

    const targets = channel ? tickers.filter((ticker) => ticker.voiceChannelId === channel.id) : tickers;

    if (!targets.length) {
        await interaction.reply(withEphemeral({ embeds: [buildErrorEmbed(channel ? 'That channel does not have an active voice ticker.' : 'No active voice tickers found.')] }));
        return;
    }

    targets.forEach((ticker) => {
        const status = statuses.get(ticker.voiceChannelId);
        const lastUpdate = formatLastUpdate(status);
        const nextUpdate = status?.nextRunInMs ? `${Math.round(status.nextRunInMs / 1000)}s` : '—';
        const pairs = ticker.pairs && ticker.pairs.length
            ? ticker.pairs.map((p) => `\`${p}\``).join(', ')
            : 'Default watchlist';

        embed.addFields({
            name: `<#${ticker.voiceChannelId}>`,
            value: [
                `Format: \`${ticker.format || '{PAIR}:{PRICE}'}\``,
                `Precision: ${Number.isFinite(ticker.precision) ? ticker.precision : 3}`,
                `Pairs: ${pairs}`,
                `Last Update: ${lastUpdate}`,
                `Next Update In: ${nextUpdate}`
            ].join('\\n'),
            inline: false
        });
    });

    await interaction.reply(withEphemeral({ embeds: [embed] }));
};
