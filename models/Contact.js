// models/Contact.js
const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
    deviceId: {
        type: String,
        required: true,
        index: true
    },
    phone: {
        type: String,
        required: true
    },
    name: {
        type: String
    },
    lastMessage: {
        type: String
    },
    lastMessageTime: {
        type: Date
    },
    unreadCount: {
        type: Number,
        default: 0
    },
    isBlocked: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Ensure unique contact per device
contactSchema.index({ deviceId: 1, phone: 1 }, { unique: true });

module.exports = mongoose.model('Contact', contactSchema);