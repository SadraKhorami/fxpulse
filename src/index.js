require('dotenv').config();
const fs = require('fs');
const DiscordBot = require('./client/DiscordBot');
const { getEnv } = require('./configuration/env');
const { disconnect } = require('./database/connection');
const { error, info } = require('./utils/Console');

try {
    getEnv();
} catch (err) {
    error('Environment validation failed.');
    error(err.message || err);
    process.exit(1);
}

fs.writeFileSync('./terminal.log', '', 'utf-8');

const client = new DiscordBot();
let shuttingDown = false;

const gracefulShutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    info(`Shutting down FXPulse due to ${signal}.`);

    try {
        await client.voiceTicker?.stopAll({ restoreName: true });
    } catch (err) {
        error('Error stopping voice ticker jobs.');
        error(err);
    }

    try {
        await disconnect();
    } catch (err) {
        error('Error disconnecting Mongo.');
        error(err);
    }

    process.exit(0);
};

['SIGINT', 'SIGTERM'].forEach((signal) => {
    process.on(signal, () => gracefulShutdown(signal));
});

process.on('unhandledRejection', (reason) => {
    error('Unhandled rejection detected.');
    error(reason);
});

process.on('uncaughtException', (err) => {
    error('Uncaught exception detected.');
    error(err);
    gracefulShutdown('uncaughtException');
});

client.connect();

module.exports = client;
