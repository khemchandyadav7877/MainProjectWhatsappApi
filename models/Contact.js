const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
    deviceId: {
        type: String,
        required: true
    },
    contactNumber: {
        type: String,
        required: true
    },
    contactName: {
        type: String,
        default: 'Unknown'
    },
    profilePic: {
        type: String,
        default: null
    },
    lastMessage: {
        type: String,
        default: ''
    },
    lastMessageTime: {
        type: Date,
        default: Date.now
    },
    unreadCount: {
        type: Number,
        default: 0
    },
    isBlocked: {
        type: Boolean,
        default: false
    }
    // ⚠️ phoneNumber field completely hata di
}, {
    timestamps: true
});

// Sirf ye ek unique index hona chahiye
contactSchema.index({ deviceId: 1, contactNumber: 1 }, { unique: true });

module.exports = mongoose.model('Contact', contactSchema);