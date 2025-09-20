const Event = require('../../structure/Event');
const { info, warn } = require('../../utils/Console');
const guildConfigService = require('../../services/guildConfig');

module.exports = new Event({
    event: 'ready',
    once: true,
    run: async (client) => {
        info(`Logged in as ${client.user.tag}.`);

        try {
            const guilds = await guildConfigService.findVoiceTickerGuilds();
            await Promise.all(guilds.map((cfg) => client.voiceTicker.start(cfg.guildId)));
            if (guilds.length) {
                info(`Bootstrapped voice ticker for ${guilds.length} guild(s).`);
            }
        } catch (err) {
            warn('Failed to bootstrap voice ticker jobs on ready.');
            warn(err);
        }
    }
}).toJSON();
