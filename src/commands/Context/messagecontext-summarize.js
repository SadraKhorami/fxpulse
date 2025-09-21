const ApplicationCommand = require('../../structure/ApplicationCommand');
const { buildPriceEmbed, buildErrorEmbed } = require('../../utils/embed');
const { getQuote, normalizeSymbol } = require('../../services/quotes');
const { requireGuildConfig, requirePermission } = require('../../permissions/guards');
const { resolveTickerPrecision } = require('../../utils/voiceTicker');
const { withEphemeral } = require('../../utils/interaction');

const SYMBOL_REGEX = /([A-Z]{2,6}:[A-Z]{3,6}|[A-Z]{3,6})/g;

module.exports = new ApplicationCommand({
    command: {
        name: 'Summarize Market Info',
        type: 3
    },
    metadata: {
        category: 'Context',
        shortDescription: 'Summarize market data from message context.',
        usage: 'Message context menu'
    },
    /**
     * @param {import('../../client/DiscordBot')} client
     * @param {import('discord.js').MessageContextMenuCommandInteraction} interaction
     */
    run: async (client, interaction) => {
        if (!interaction.inGuild()) {
            await interaction.reply(withEphemeral({ embeds: [buildErrorEmbed('Guild only command.')] }));
            return;
        }

        const content = interaction.targetMessage?.content || '';
        const match = content.toUpperCase().match(SYMBOL_REGEX);

        if (!match || !match.length) {
            await interaction.reply(withEphemeral({ embeds: [buildErrorEmbed('No symbol detected in message. Mention a pair like XAUUSD or ODANA:XAUUSD.')] }));
            return;
        }

        const symbol = normalizeSymbol(match[0]);
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

        try {
            await interaction.deferReply(withEphemeral());
            const quote = await getQuote(symbol, config.defaultInterval);
            const embed = buildPriceEmbed({
                quote,
                interval: config.defaultInterval,
                precisionOverride: resolveTickerPrecision(config),
                locale: config.locale
            });
            await interaction.editReply({ embeds: [embed] });
        } catch (err) {
            await interaction.editReply({ embeds: [buildErrorEmbed('Unable to fetch market data right now.')] });
            throw err;
        }
    }
}).toJSON();
