const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema({
    campaignId: {
        type: String,
        required: true,
        unique: true
    },
    deviceId: {
        type: String,
        required: true
    },
    numbers: [{
        type: String,
        required: true
    }],
    message: {
        type: String,
        default: ''
    },
    mediaUrl: {
        type: String,
        default: ''
    },
    messageType: {
        type: String,
        enum: ['text', 'media'],
        default: 'text'
    },
    interval: {
        type: Number,
        default: 5
    },
    status: {
        type: String,
        enum: ['scheduled', 'sending', 'completed', 'failed', 'cancelled'],
        default: 'scheduled'
    },
    scheduleType: {
        type: String,
        enum: ['now', 'later'],
        default: 'now'
    },
    scheduledAt: {
        type: Date
    },
    totalContacts: {
        type: Number,
        default: 0
    },
    sentCount: {
        type: Number,
        default: 0
    },
    failedCount: {
        type: Number,
        default: 0
    },
    failedNumbers: [{
        type: String
    }],
    completedAt: {
        type: Date
    },
    campaignName: {
        type: String,
        default: ''
    },
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

campaignSchema.index({ campaignId: 1 });
campaignSchema.index({ deviceId: 1 });
campaignSchema.index({ status: 1 });
campaignSchema.index({ scheduledAt: 1 });
campaignSchema.index({ createdBy: 1 });
campaignSchema.index({ createdByRole: 1 });

module.exports = mongoose.model('Campaign', campaignSchema);