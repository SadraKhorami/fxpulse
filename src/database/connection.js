const mongoose = require('mongoose');
const { getEnv } = require('../configuration/env');
const { info, warn, error } = require('../utils/Console');

let isConnected = false;

const connect = async () => {
    if (isConnected) return mongoose.connection;

    const { mongoUri } = getEnv();

    try {
        await mongoose.connect(mongoUri, {
            autoIndex: true,
            serverSelectionTimeoutMS: 5000
        });

        isConnected = true;
        info('Connected to MongoDB.');
        return mongoose.connection;
    } catch (err) {
        error('Failed to connect to MongoDB.');
        error(err);
        throw err;
    }
};

const disconnect = async () => {
    if (!isConnected) return;

    try {
        await mongoose.disconnect();
        isConnected = false;
        info('Disconnected from MongoDB.');
    } catch (err) {
        warn('Error while disconnecting MongoDB connection.');
        warn(err);
    }
};

module.exports = {
    connect,
    disconnect
};
