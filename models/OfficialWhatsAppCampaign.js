// models/OfficialWhatsAppCampaign.js
const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema({
    campaignId: {
        type: String,
        required: true,
        unique: true
    },
    campaignName: {
        type: String,
        required: true
    },
    
    // ===== WhatsApp Configuration =====
    wabaId: {
        type: String,
        required: true
    },
    phoneNumberId: {
        type: String,
        required: true
    },
    displayPhoneNumber: String,
    
    // ===== Message Type =====
    messageType: {
        type: String,
        enum: ['text', 'template', 'image', 'video', 'document', 'audio', 'interactive'],
        required: true
    },
    
    // ===== For Text Messages =====
    textContent: String,
    
    // ===== For Template Messages =====
    templateId: String,
    templateName: String,
    templateVariables: [String],
    
    // ===== For Media Messages =====
    mediaUrl: String,
    mediaType: String,
    mediaCaption: String,
    mediaId: String, // Meta's media ID after upload
    
    // ===== For Interactive Messages =====
    interactiveData: mongoose.Schema.Types.Mixed,
    
    // ===== Recipients =====
    contacts: [{
        phoneNumber: String,
        waId: String,
        name: String,
        status: {
            type: String,
            enum: ['pending', 'sent', 'delivered', 'read', 'failed'],
            default: 'pending'
        },
        messageId: String,
        sentAt: Date,
        deliveredAt: Date,
        readAt: Date,
        error: String,
        attempts: {
            type: Number,
            default: 0
        }
    }],
    totalContacts: Number,
    
    // ===== Schedule =====
    scheduleType: {
        type: String,
        enum: ['now', 'later'],
        default: 'now'
    },
    scheduledAt: Date,
    
    // ===== Campaign Stats =====
    status: {
        type: String,
        enum: ['draft', 'scheduled', 'sending', 'completed', 'paused', 'failed', 'cancelled'],
        default: 'draft'
    },
    sentCount: {
        type: Number,
        default: 0
    },
    deliveredCount: {
        type: Number,
        default: 0
    },
    readCount: {
        type: Number,
        default: 0
    },
    failedCount: {
        type: Number,
        default: 0
    },
    progress: {
        type: Number,
        default: 0
    },
    
    // ===== Delivery Settings =====
    interval: {
        type: Number,
        default: 1 // seconds between messages
    },
    batchSize: {
        type: Number,
        default: 50 // messages per batch
    },
    
    // ===== Tracking =====
    messageIds: [String], // Store all message IDs from Meta
    webhookEvents: [{
        type: mongoose.Schema.Types.Mixed
    }],
    
    // ===== User Association =====
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    createdByRole: String,
    createdByEmail: String,
    
    // ===== Timestamps =====
    startedAt: Date,
    completedAt: Date,
    lastProcessedAt: Date
}, {
    timestamps: true
});

// Indexes
campaignSchema.index({ wabaId: 1, status: 1 });
campaignSchema.index({ createdBy: 1, createdAt: -1 });
campaignSchema.index({ scheduledAt: 1 }, { sparse: true });

module.exports = mongoose.model('OfficialWhatsAppCampaign', campaignSchema);