const { Schema, model } = require('mongoose');

const VoiceTickerSchema = new Schema({
    enabled: { type: Boolean, default: false },
    voiceChannelId: { type: String },
    pairs: { type: [String], default: [] },
    format: { type: String, default: '{PAIR}:{PRICE}' },
    precision: { type: Number, default: 3 },
    updateIntervalMs: { type: Number, default: 30_000 },
    originalName: { type: String }
}, { _id: false });

const GuildConfigSchema = new Schema({
    guildId: { type: String, required: true, unique: true, index: true },
    allowedRoles: { type: [String], default: [] },
    watchlist: { type: [String], default: [] },
    voiceTicker: { type: VoiceTickerSchema, default: () => ({}) },
    voiceTickers: { type: [VoiceTickerSchema], default: () => [] },
    defaultInterval: { type: String, default: '15' },
    locale: { type: String, default: 'en' }
}, { timestamps: true });

module.exports = model('GuildConfig', GuildConfigSchema);
