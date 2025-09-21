const { ButtonInteraction } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const { withEphemeral } = require("../../utils/interaction");

module.exports = new Component({
    customId: 'example-button-id',
    type: 'button',
    /**
     * 
     * @param {DiscordBot} client 
     * @param {ButtonInteraction} interaction 
     */
    run: async (client, interaction) => {

        await interaction.reply(withEphemeral({
            content: 'Replied from a Button interaction!'
        }));

    }
}).toJSON();
