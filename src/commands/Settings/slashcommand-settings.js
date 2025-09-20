const { ApplicationCommandOptionType, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const ApplicationCommand = require('../../structure/ApplicationCommand');
const guildConfigService = require('../../services/guildConfig');
const { buildErrorEmbed } = require('../../utils/embed');
const { requireGuildConfig, isAdmin } = require('../../permissions/guards');

module.exports = new ApplicationCommand({
    command: {
        name: 'settings',
        description: 'Guild-level FXPulse configuration.',
        type: 1,
        default_member_permissions: String(PermissionFlagsBits.ManageGuild),
        options: [
            {
                name: 'show',
                description: 'Display current settings.',
                type: ApplicationCommandOptionType.Subcommand
            },
            {
                name: 'set-locale',
                description: 'Set locale for number formatting.',
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    {
                        name: 'locale',
                        description: 'Locale code, e.g. en-US.',
                        type: ApplicationCommandOptionType.String,
                        required: true
                    }
                ]
            },
            {
                name: 'allow-role',
                description: 'Allow a role to access FXPulse.',
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    {
                        name: 'role',
                        description: 'Role to whitelist.',
                        type: ApplicationCommandOptionType.Role,
                        required: true
                    }
                ]
            },
            {
                name: 'deny-role',
                description: 'Remove a role from the whitelist.',
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    {
                        name: 'role',
                        description: 'Role to remove.',
                        type: ApplicationCommandOptionType.Role,
                        required: true
                    }
                ]
            },
            {
                name: 'list-roles',
                description: 'List whitelisted roles.',
                type: ApplicationCommandOptionType.Subcommand
            },
            {
                name: 'set-interval',
                description: 'Set default interval for FX queries.',
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    {
                        name: 'interval',
                        description: 'Default interval in minutes.',
                        type: ApplicationCommandOptionType.String,
                        required: true
                    }
                ]
            }
        ]
    },
    metadata: {
        category: 'Settings',
        shortDescription: 'Manage guild permissions and defaults.',
        usage: '/settings show',
        permissions: 'Administrator or Manage Guild required.'
    },
    /**
     * @param {import('../../client/DiscordBot')} client
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     */
    run: async (client, interaction) => {
        if (!interaction.inGuild()) {
            await interaction.reply({ embeds: [buildErrorEmbed('Guild only command.')], ephemeral: true });
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
            case 'show':
                await showSettings(interaction, config);
                break;
            case 'set-locale':
                await setLocale(interaction, guildId);
                break;
            case 'allow-role':
                await allowRole(interaction, guildId);
                break;
            case 'deny-role':
                await denyRole(interaction, guildId);
                break;
            case 'list-roles':
                await listRoles(interaction, config);
                break;
            case 'set-interval':
                await setIntervalDefault(interaction, guildId);
                break;
            default:
                await interaction.reply({ embeds: [buildErrorEmbed('Unknown subcommand.')], ephemeral: true });
        }
    }
}).toJSON();

const showSettings = async (interaction, config) => {
    const embed = new EmbedBuilder()
        .setTitle('FXPulse Settings')
        .setColor(0x5865f2)
        .addFields(
            { name: 'Locale', value: config.locale || 'en', inline: true },
            { name: 'Default Interval', value: config.defaultInterval || '15', inline: true },
            { name: 'Allowed Roles', value: formatRoles(config.allowedRoles), inline: false },
            { name: 'Watchlist', value: (config.watchlist || []).map((p) => `• ${p}`).join('\n') || '—', inline: false }
        )
        .setFooter({ text: 'FXPulse • data via finance.khorami.dev' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
};

const setLocale = async (interaction, guildId) => {
    const locale = interaction.options.getString('locale', true);
    await guildConfigService.setLocale(guildId, locale);
    await interaction.reply({ content: `Locale set to **${locale}**.`, ephemeral: true });
};

const allowRole = async (interaction, guildId) => {
    const role = interaction.options.getRole('role', true);
    await guildConfigService.addRole(guildId, role.id);
    await interaction.reply({ content: `Role ${role} added to FXPulse whitelist.`, ephemeral: true });
};

const denyRole = async (interaction, guildId) => {
    const role = interaction.options.getRole('role', true);
    await guildConfigService.removeRole(guildId, role.id);
    await interaction.reply({ content: `Role ${role} removed from FXPulse whitelist.`, ephemeral: true });
};

const listRoles = async (interaction, config) => {
    const embed = new EmbedBuilder()
        .setTitle('FXPulse Whitelisted Roles')
        .setColor(0x5865f2)
        .setDescription(formatRoles(config.allowedRoles))
        .setFooter({ text: 'FXPulse • data via finance.khorami.dev' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
};

const setIntervalDefault = async (interaction, guildId) => {
    const interval = interaction.options.getString('interval', true).replace(/[^0-9]/g, '');
    if (!interval) {
        await interaction.reply({ embeds: [buildErrorEmbed('Interval must be numeric minutes.')], ephemeral: true });
        return;
    }

    await guildConfigService.setDefaultInterval(guildId, interval);
    await interaction.reply({ content: `Default interval set to ${interval} minutes.`, ephemeral: true });
};

const formatRoles = (roles = []) => roles.length ? roles.map((id) => `<@&${id}>`).join('\n') : 'No roles whitelisted yet.';
