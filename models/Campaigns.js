const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema({
    campaignId: {
        type: String,
        unique: true,
        required: true
    },
    campaignName: {
        type: String,
        required: true
    },
    campaignType: {
        type: String,
        enum: ['marketing', 'utility', 'authentication'],
        required: true
    },
    description: String,
    
    // Template Details
    templateId: {
        type: String,
        required: true
    },
    templateName: String,
    templateCategory: String,
    
    // Media
    mediaUrl: String,
    mediaType: {
        type: String,
        enum: ['image', 'video', 'document', 'none']
    },
    mediaSize: Number,
    
    // Recipients
    recipients: [{
        phoneNumber: String,
        name: String,
        language: String,
        status: {
            type: String,
            enum: ['pending', 'sent', 'delivered', 'read', 'failed'],
            default: 'pending'
        },
        messageId: String,
        sentAt: Date,
        deliveredAt: Date,
        readAt: Date,
        error: String
    }],
    totalRecipients: Number,
    validRecipients: Number,
    invalidRecipients: Number,
    
    // Schedule
    scheduleType: {
        type: String,
        enum: ['now', 'later'],
        default: 'now'
    },
    scheduledAt: Date,
    sentAt: Date,
    completedAt: Date,
    
    // Payment
    paymentRequired: {
        type: Boolean,
        default: true
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'paid', 'failed', 'refunded'],
        default: 'pending'
    },
    paymentAmount: Number,
    paymentCurrency: {
        type: String,
        default: 'USD'
    },
    paymentMethod: String,
    paymentId: String,
    paymentIntentId: String,
    paymentReceipt: String,
    paymentDetails: mongoose.Schema.Types.Mixed,
    
    // Meta API
    metaPhoneNumberId: String,
    metaBusinessAccountId: String,
    metaAccessToken: String,
    metaApiVersion: {
        type: String,
        default: 'v18.0'
    },
    
    // Stats
    messagesSent: {
        type: Number,
        default: 0
    },
    messagesDelivered: {
        type: Number,
        default: 0
    },
    messagesRead: {
        type: Number,
        default: 0
    },
    messagesFailed: {
        type: Number,
        default: 0
    },
    
    // Cost
    estimatedCost: Number,
    actualCost: Number,
    costPerMessage: {
        type: Number,
        default: 0.005 // $0.005 per message (example rate)
    },
    
    // Status
    status: {
        type: String,
        enum: ['draft', 'queued', 'processing', 'completed', 'failed', 'cancelled'],
        default: 'draft'
    },
    
    // User Info
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    createdByEmail: String,
    createdByRole: String,
    
    // Timestamps
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update timestamp on save
campaignSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('Campaigns', campaignSchema);