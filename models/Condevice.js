const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema(
{
    // Device Basic Info
    name: {
        type: String,
        required: true,
        trim: true
    },

    phoneNumber: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },

    deviceType: {
        type: String,
        enum: ['android', 'iphone', 'tablet', 'other'],
        required: true
    },

    carrier: {
        type: String,
        enum: ['jio', 'airtel', 'vi', 'bsnl', 'other', 'unknown'],
        default: 'unknown'
    },

    notes: {
        type: String,
        default: ''
    },

    // WhatsApp / Device Status
    status: {
        type: String,
        enum: ['active', 'inactive', 'disconnected'],
        default: 'inactive'
    },

    // WhatsApp Session / Token (future use)
    sessionId: {
        type: String,
        default: null
    },

    qrCode: {
        type: String,   // QR image / base64 / path
        default: null
    },

    isConnected: {
        type: Boolean,
        default: false
    },

    lastSeen: {
        type: Date,
        default: null
    },

    // Audit
    addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }

},
{
    timestamps: true   // createdAt & updatedAt
});

module.exports = mongoose.model('Condevice', deviceSchema);
