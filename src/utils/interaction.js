const { MessageFlags } = require('discord.js');

const withEphemeral = (options = {}) => ({
    ...options,
    flags: MessageFlags.Ephemeral
});

const ephemeralFlags = MessageFlags.Ephemeral;

module.exports = {
    withEphemeral,
    ephemeralFlags
};
