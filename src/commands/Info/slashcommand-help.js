const { ApplicationCommandOptionType, EmbedBuilder } = require('discord.js');
const ApplicationCommand = require('../../structure/ApplicationCommand');

const describe = (cmd) => cmd.metadata?.shortDescription || cmd.command.description || '—';

module.exports = new ApplicationCommand({
    command: {
        name: 'help',
        description: 'Show FXPulse commands and usage.',
        type: 1,
        options: [
            {
                name: 'command',
                description: 'Specific command to inspect (e.g. fx, voice-ticker).',
                type: ApplicationCommandOptionType.String,
                required: false
            }
        ]
    },
    metadata: {
        category: 'Info',
        shortDescription: 'Overview of FXPulse commands.',
        usage: '/help [command]'
    },
    /**
     * @param {import('../../client/DiscordBot')} client
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     */
    run: async (client, interaction) => {
        const target = interaction.options.getString('command');
        const commands = Array.from(client.collection.application_commands.values());

        const embed = new EmbedBuilder()
            .setTitle('FXPulse Help')
            .setColor(0x5865f2)
            .setFooter({ text: 'FXPulse • data via finance.khorami.dev' });

        if (target) {
            const lower = target.toLowerCase();
            const found = commands.find((cmd) => cmd.command.name === lower);

            if (!found) {
                embed.setDescription(`Unknown command: **${target}**`);
                await interaction.reply({ embeds: [embed], ephemeral: true });
                return;
            }

            embed.setTitle(`/${found.command.name}`);
            embed.setDescription(found.metadata?.shortDescription || found.command.description || 'No description');

            if (found.metadata?.usage) {
                embed.addFields({ name: 'Usage', value: found.metadata.usage });
            }

            if (found.metadata?.options?.length) {
                embed.addFields({
                    name: 'Options',
                    value: found.metadata.options.map((opt) => `• ${opt.name} — ${opt.description}${opt.required ? ' (required)' : ''}`).join('\n')
                });
            }

            if (found.metadata?.permissions) {
                embed.addFields({ name: 'Permissions', value: found.metadata.permissions });
            }

            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
        }

        embed.setDescription('Quick summary of FXPulse commands. Use `/help command:<name>` for details.');

        const fields = commands.map((cmd) => ({
            name: `/${cmd.command.name}`,
            value: describe(cmd),
            inline: true
        }));

        embed.addFields(fields);

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
}).toJSON();
