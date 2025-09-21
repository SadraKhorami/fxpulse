const { ModalSubmitInteraction } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const Component = require("../../structure/Component");
const { withEphemeral } = require("../../utils/interaction");

module.exports = new Component({
    customId: 'example-modal-id',
    type: 'modal',
    /**
     * 
     * @param {DiscordBot} client 
     * @param {ModalSubmitInteraction} interaction 
     */
    run: async (client, interaction) => {

        const field = interaction.fields.getTextInputValue('example-modal-id-field-1');

        await interaction.reply(withEphemeral({
            content: 'Hello **' + field + '**.'
        }));

    }
}).toJSON();
