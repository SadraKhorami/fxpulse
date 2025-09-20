const { Client, Collection, Partials } = require('discord.js');
const CommandsHandler = require('./handler/CommandsHandler');
const { warn, error, info, success } = require('../utils/Console');
const config = require('../config');
const CommandsListener = require('./handler/CommandsListener');
const ComponentsHandler = require('./handler/ComponentsHandler');
const ComponentsListener = require('./handler/ComponentsListener');
const EventsHandler = require('./handler/EventsHandler');
const { QuickYAML } = require('quick-yaml.db');
const { getEnv } = require('../configuration/env');
const VoiceTickerJob = require('../jobs/voiceTickerJob');

class DiscordBot extends Client {
    collection = {
        application_commands: new Collection(),
        message_commands: new Collection(),
        message_commands_aliases: new Collection(),
        components: {
            buttons: new Collection(),
            selects: new Collection(),
            modals: new Collection(),
            autocomplete: new Collection()
        }
    };
    rest_application_commands_array = [];
    login_attempts = 0;
    login_timestamp = 0;
    statusMessages = [
        { name: 'FXPulse • /fx price', type: 3 },
        { name: 'FXPulse • /fx analyze', type: 3 },
        { name: 'FXPulse • /settings', type: 3 }
    ];

    commands_handler = new CommandsHandler(this);
    components_handler = new ComponentsHandler(this);
    events_handler = new EventsHandler(this);
    database = new QuickYAML(config.database.path);
    voiceTicker = null;

    constructor() {
        super({
            intents: 3276799,
            partials: [
                Partials.Channel,
                Partials.GuildMember,
                Partials.Message,
                Partials.Reaction,
                Partials.User
            ],
            presence: {
                activities: [
                    {
                        name: 'FXPulse booting...',
                        type: 0
                    }
                ]
            }
        });

        new CommandsListener(this);
        new ComponentsListener(this);
        this.voiceTicker = new VoiceTickerJob(this);
    }

    startStatusRotation = () => {
        if (!this.user) return;
        let index = 0;
        setInterval(() => {
            const activity = this.statusMessages[index];
            if (activity) {
                this.user.setPresence({ activities: [activity] });
            }
            index = (index + 1) % this.statusMessages.length;
        }, 45_000);
    };

    connect = async () => {
        warn(`Attempting to connect to FXPulse... (${this.login_attempts + 1})`);
        this.login_timestamp = Date.now();

        try {
            const { token } = getEnv();
            await this.login(token);

            this.commands_handler.load();
            this.components_handler.load();
            this.events_handler.load();
            this.startStatusRotation();

            warn('Registering slash commands...');
            await this.commands_handler.registerApplicationCommands(config.development);
            success('Slash commands registered.');
        } catch (err) {
            error('Failed to connect to FXPulse, retrying...');
            error(err);
            this.login_attempts++;
            setTimeout(this.connect, 5000);
        }
    };
}

module.exports = DiscordBot;
