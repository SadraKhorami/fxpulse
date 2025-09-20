const { PermissionFlagsBits } = require('discord.js');
const guildConfigService = require('../services/guildConfig');

const requireGuildConfig = async (guildId) => {
    if (!guildId) {
        return { ok: false, reason: 'This command can only be used in a guild.' };
    }

    const config = await guildConfigService.getOrCreate(guildId);
    return { ok: true, config };
};

const isAdmin = (member) => {
    if (!member) return false;
    return member.permissions.has(PermissionFlagsBits.Administrator) ||
        member.permissions.has(PermissionFlagsBits.ManageGuild);
};

const requirePermission = (member, guildConfig) => {
    if (isAdmin(member)) return { ok: true };

    const allowedRoles = guildConfig?.allowedRoles || [];
    const memberRoles = member?.roles?.cache;

    if (!memberRoles || !memberRoles.size) {
        return { ok: false, reason: 'You need a whitelisted role to use FXPulse.' };
    }

    const hasAllowedRole = allowedRoles.some((roleId) => memberRoles.has(roleId));

    if (!hasAllowedRole) {
        return { ok: false, reason: 'You need a whitelisted role to use FXPulse.' };
    }

    return { ok: true };
};

module.exports = {
    requireGuildConfig,
    requirePermission,
    isAdmin
};
