const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const popularPairs = require('../constants/pairs');

const CUSTOM_ID_PREFIX = 'fxpulse';
const INTERVALS = [
    { id: '1', label: '1m' },
    { id: '5', label: '5m' },
    { id: '15', label: '15m' },
    { id: '60', label: '1h' }
];

const encode = (value) => Buffer.from(value, 'utf8').toString('base64url');
const decode = (value) => {
    if (!value) return '';
    return Buffer.from(value, 'base64url').toString('utf8');
};

const makeCustomId = (action, parts = []) => {
    const serialized = [CUSTOM_ID_PREFIX, action, ...parts.map((item) => encode(String(item || '')))].join('::');
    return serialized.slice(0, 95);
};

const parseCustomId = (customId) => {
    if (!customId.startsWith(`${CUSTOM_ID_PREFIX}::`)) return null;
    const [prefix, action, ...rest] = customId.split('::');
    if (prefix !== CUSTOM_ID_PREFIX) return null;
    return { action, args: rest.map(decode) };
};

const buildIntervalButtons = (symbol, activeInterval) => {
    const row = new ActionRowBuilder();

    row.addComponents(
        new ButtonBuilder()
            .setCustomId(makeCustomId('refresh', [symbol, activeInterval || '']))
            .setLabel('Refresh')
            .setStyle(ButtonStyle.Primary)
    );

    INTERVALS.forEach((interval) => {
        const builder = new ButtonBuilder()
            .setCustomId(makeCustomId('interval', [symbol, interval.id]))
            .setLabel(interval.label)
            .setStyle(interval.id === activeInterval ? ButtonStyle.Success : ButtonStyle.Secondary);

        row.addComponents(builder);
    });

    return row;
};

const buildActionButtons = (symbol, interval, { isWatched = false } = {}) => {
    const row = new ActionRowBuilder();

    row.addComponents(
        new ButtonBuilder()
            .setCustomId(makeCustomId('watch', [symbol]))
            .setLabel('Watch')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(isWatched)
    );

    row.addComponents(
        new ButtonBuilder()
            .setCustomId(makeCustomId('unwatch', [symbol]))
            .setLabel('Unwatch')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!isWatched)
    );

    row.addComponents(
        new ButtonBuilder()
            .setCustomId(makeCustomId('details', [symbol, interval || '']))
            .setLabel('Details')
            .setStyle(ButtonStyle.Primary)
    );

    return row;
};

const buildPairSelectRow = (currentSymbol, choices = popularPairs) => {
    const row = new ActionRowBuilder();
    const menu = new StringSelectMenuBuilder()
        .setCustomId(makeCustomId('pair-select', [currentSymbol || '']))
        .setPlaceholder('Pick Pair');

    choices.slice(0, 25).forEach((choice) => {
        menu.addOptions({
            label: choice.length > 25 ? choice.slice(0, 25) : choice,
            value: choice
        });
    });

    row.addComponents(menu);
    return row;
};

const buildPriceComponents = ({ symbol, interval, isWatched, customPairs }) => {
    const effectivePairs = Array.from(new Set([...(customPairs || []), ...popularPairs]));

    return [
        buildIntervalButtons(symbol, interval),
        buildActionButtons(symbol, interval, { isWatched }),
        buildPairSelectRow(symbol, effectivePairs)
    ];
};

module.exports = {
    buildPriceComponents,
    makeCustomId,
    parseCustomId,
    INTERVALS,
    popularPairs,
    buildPairSelectRow
};
