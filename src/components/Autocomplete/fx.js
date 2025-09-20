const AutocompleteComponent = require('../../structure/AutocompleteComponent');
const popularPairs = require('../../constants/pairs');
const guildConfigService = require('../../services/guildConfig');
const { normalizeSymbol } = require('../../services/quotes');

const MAX_RESULTS = 25;

const matchScore = (query, value) => {
    const upperQuery = query.toUpperCase();
    const upperValue = value.toUpperCase();

    if (upperValue === upperQuery) return 0;
    if (upperValue.startsWith(upperQuery)) return 1;
    if (upperValue.includes(upperQuery)) return 2;
    return 3;
};

module.exports = new AutocompleteComponent({
    commandName: 'fx',
    /**
     * @param {import('discord.js').AutocompleteInteraction} interaction
     */
    run: async (client, interaction) => {
        const focused = interaction.options.getFocused() || '';
        const query = normalizeSymbol(focused);
        const guildId = interaction.guildId;

        let watchlist = [];
        if (guildId) {
            const config = await guildConfigService.getOrCreate(guildId);
            watchlist = config.watchlist || [];
        }

        const pool = Array.from(new Set([...watchlist, ...popularPairs]));

        const filtered = pool
            .filter((value) => !query || value.toUpperCase().includes(query.toUpperCase()))
            .sort((a, b) => matchScore(query, a) - matchScore(query, b))
            .slice(0, MAX_RESULTS)
            .map((value) => ({ name: value, value }));

        if (query && filtered.every((opt) => opt.value !== query) && filtered.length < MAX_RESULTS) {
            filtered.push({ name: `Use ${query}`, value: query });
        }

        await interaction.respond(filtered);
    }
}).toJSON();
