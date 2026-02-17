// models/ChatMessage.js
const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
    messageId: {
        type: String,
        required: true,
        unique: true
    },
    deviceId: {
        type: String,
        required: true
    },
    from: {
        type: String,
        required: true
    },
    to: {
        type: String,
        required: true
    },
    body: {
        type: String,
        required: true
    },
    type: {
        type: String,
        default: 'chat'
    },
    isGroup: {
        type: Boolean,
        default: false
    },
    timestamp: {
        type: Date,
        required: true
    },
    fromMe: {
        type: Boolean,
        default: false
    },
    status: {
        type: String,
        enum: ['sending', 'sent', 'delivered', 'read', 'failed'],
        default: 'sent'
    }
}, {
    timestamps: true
});

// Index for faster queries
chatMessageSchema.index({ deviceId: 1, from: 1, timestamp: -1 });
chatMessageSchema.index({ deviceId: 1, to: 1, timestamp: -1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);