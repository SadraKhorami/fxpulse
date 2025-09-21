const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const { withEphemeral } = require("../../utils/interaction");

module.exports = new Component({
    customId: 'example-menu-id',
    type: 'select',
    /**
     * 
     * @param {DiscordBot} client 
     * @param {import("discord.js").AnySelectMenuInteraction} interaction 
     */
    run: async (client, interaction) => {

        await interaction.reply(withEphemeral({
            content: 'Replied from a Select Menu interaction! (You selected **' + interaction.values[0] + '**).'
        }));

    }
}).toJSON();
