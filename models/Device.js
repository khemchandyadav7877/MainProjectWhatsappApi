const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
    deviceId: {
        type: String,
        required: true,
        unique: true
    },
    token: {
        type: String,
        required: true
    },
    phone: {
        type: String,
        default: null
    },
    whatsappNumber: {
        type: String,
        default: null
    },
    whatsappName: {
        type: String,
        default: 'WhatsApp Device'
    },
    ipAddress: {
        type: String,
        default: '-'
    },
    status: {
        type: String,
        enum: ['INITIALIZING', 'SCANNING', 'CONNECTED', 'DISCONNECTED', 'FAILED', 'ERROR'],
        default: 'INITIALIZING'
    },
    connectionStatus: {
        type: String,
        enum: ['online', 'pending', 'offline'],
        default: 'pending'
    },
    qrCode: {
        type: String,
        default: null
    },
    platform: {
        type: String,
        default: null
    },
    phoneModel: {
        type: String,
        default: null
    },
    disconnectReason: {
        type: String,
        default: null
    },
    error: {
        type: String,
        default: null
    },
    lastConnected: {
        type: Date,
        default: null
    },
    lastDisconnected: {
        type: Date,
        default: null
    },
    deviceAddedAt: {
        type: Date,
        default: Date.now
    },
    // ===== IMPORTANT: USER ID AND ROLE FIELDS =====
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    createdByRole: {
        type: String,
        enum: ["user", "Student", "SuperAdmin", "Educator", "Trainer"],
        required: true
    },
    createdByEmail: {
        type: String,
        required: true
    }
}, {
    timestamps: true
});

// Indexes for better query performance
deviceSchema.index({ deviceId: 1 });
deviceSchema.index({ status: 1 });
deviceSchema.index({ phone: 1 });
deviceSchema.index({ connectionStatus: 1 });
deviceSchema.index({ createdBy: 1 }); // Important for filtering by user
deviceSchema.index({ createdByRole: 1 }); // Important for filtering by role

module.exports = mongoose.model('Device', deviceSchema);