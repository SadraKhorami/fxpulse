const { ApplicationCommandOptionType, EmbedBuilder } = require('discord.js');
const ApplicationCommand = require('../../structure/ApplicationCommand');
const { buildPairSelectRow } = require('../../utils/components');
const popularPairs = require('../../constants/pairs');

module.exports = new ApplicationCommand({
    command: {
        name: 'demo',
        description: 'FXPulse UX showcase tools.',
        type: 1,
        options: [
            {
                name: 'select-pair',
                description: 'Open a select menu of popular pairs.',
                type: ApplicationCommandOptionType.Subcommand
            }
        ]
    },
    metadata: {
        category: 'Demo',
        shortDescription: 'Interactive selector for quick quotes.',
        usage: '/demo select-pair'
    },
    /**
     * @param {import('../../client/DiscordBot')} client
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     */
    run: async (client, interaction) => {
        const sub = interaction.options.getSubcommand();

        if (sub !== 'select-pair') {
            await interaction.reply({ content: 'Unknown demo action.', ephemeral: true });
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle('FXPulse Demo')
            .setDescription('Pick a pair to fetch the latest snapshot.')
            .setColor(0x5865f2)
            .setFooter({ text: 'FXPulse • data via finance.khorami.dev' });

        const components = [buildPairSelectRow(popularPairs[0] || 'XAUUSD')];

        await interaction.reply({ embeds: [embed], components, ephemeral: true });
    }
}).toJSON();
