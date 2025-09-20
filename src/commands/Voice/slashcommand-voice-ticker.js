const { ApplicationCommandOptionType, ChannelType, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const ApplicationCommand = require('../../structure/ApplicationCommand');
const guildConfigService = require('../../services/guildConfig');
const { normalizeSymbol } = require('../../services/quotes');
const { buildErrorEmbed } = require('../../utils/embed');
const { requireGuildConfig, isAdmin } = require('../../permissions/guards');

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
                type: ApplicationCommandOptionType.Subcommand
            },
            {
                name: 'set-pairs',
                description: 'Override the tracked pairs list.',
                type: ApplicationCommandOptionType.Subcommand,
                options: [
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
                type: ApplicationCommandOptionType.Subcommand
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
            await interaction.reply({ embeds: [buildErrorEmbed('Use this command inside a guild.')], ephemeral: true });
            return;
        }

        const guildId = interaction.guildId;
        const { ok, config, reason } = await requireGuildConfig(guildId);

        if (!ok) {
            await interaction.reply({ embeds: [buildErrorEmbed(reason)], ephemeral: true });
            return;
        }

        if (!isAdmin(interaction.member)) {
            await interaction.reply({ embeds: [buildErrorEmbed('Administrator or Manage Guild permission required.')], ephemeral: true });
            return;
        }

        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'enable':
                await handleEnable(interaction, config, client, guildId);
                break;
            case 'disable':
                await handleDisable(interaction, client, guildId);
                break;
            case 'set-pairs':
                await handleSetPairs(interaction, guildId);
                break;
            case 'set-format':
                await handleSetFormat(interaction, guildId);
                break;
            case 'set-precision':
                await handleSetPrecision(interaction, guildId);
                break;
            case 'show':
                await handleShow(interaction, config);
                break;
            default:
                await interaction.reply({ embeds: [buildErrorEmbed('Unknown subcommand.')], ephemeral: true });
        }
    }
}).toJSON();

const parsePairs = (input) => {
    if (!input) return [];
    return input
        .split(/[,\s]+/)
        .map((item) => normalizeSymbol(item))
        .filter(Boolean);
};

const handleEnable = async (interaction, config, client, guildId) => {
    const channel = interaction.options.getChannel('channel', true);
    const pairsInput = interaction.options.getString('pairs');
    const pairs = parsePairs(pairsInput);
    const prior = config.voiceTicker || {};
    const originalName = (prior.voiceChannelId === channel.id && prior.originalName) ? prior.originalName : channel.name;

    await guildConfigService.setVoiceTicker(guildId, {
        enabled: true,
        voiceChannelId: channel.id,
        pairs: pairs.length ? pairs : (config.watchlist || []),
        originalName
    });

    client.voiceTicker?.start(guildId);

    await interaction.reply({ content: `Voice ticker enabled on **${channel.name}**.`, ephemeral: true });
};

const handleDisable = async (interaction, client, guildId) => {
    await guildConfigService.setVoiceTicker(guildId, { enabled: false });
    client.voiceTicker?.stop(guildId, { restoreName: true });
    await interaction.reply({ content: 'Voice ticker disabled.', ephemeral: true });
};

const handleSetPairs = async (interaction, guildId) => {
    const pairs = parsePairs(interaction.options.getString('pairs', true));
    const updated = await guildConfigService.setVoiceTicker(guildId, { pairs });
    interaction.client.voiceTicker?.start(guildId);
    await interaction.reply({ content: `Ticker pairs updated (${updated.voiceTicker.pairs.length} symbols).`, ephemeral: true });
};

const handleSetFormat = async (interaction, guildId) => {
    const format = interaction.options.getString('format', true);
    if (!format.includes('{PAIR}') || !format.includes('{PRICE}')) {
        await interaction.reply({ embeds: [buildErrorEmbed('Format must contain {PAIR} and {PRICE}.')], ephemeral: true });
        return;
    }

    await guildConfigService.setVoiceTicker(guildId, { format });
    interaction.client.voiceTicker?.start(guildId);
    await interaction.reply({ content: 'Ticker format updated.', ephemeral: true });
};

const handleSetPrecision = async (interaction, guildId) => {
    const digits = interaction.options.getInteger('digits', true);
    await guildConfigService.setVoiceTicker(guildId, { precision: digits });
    interaction.client.voiceTicker?.start(guildId);
    await interaction.reply({ content: `Ticker precision set to ${digits} decimals.`, ephemeral: true });
};

const handleShow = async (interaction, config) => {
    const ticker = config.voiceTicker || {};

    const embed = new EmbedBuilder()
        .setTitle('Voice Ticker Settings')
        .setColor(0x5865f2)
        .addFields(
            { name: 'Enabled', value: ticker.enabled ? 'Yes' : 'No', inline: true },
            { name: 'Voice Channel', value: ticker.voiceChannelId ? `<#${ticker.voiceChannelId}>` : '—', inline: true },
            { name: 'Precision', value: `${ticker.precision ?? 3}`, inline: true },
            { name: 'Pairs', value: (ticker.pairs && ticker.pairs.length) ? ticker.pairs.map((p) => `• ${p}`).join('\n') : '—' }
        )
        .setFooter({ text: 'FXPulse • data via finance.khorami.dev' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
};
