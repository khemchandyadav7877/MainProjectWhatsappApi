// models/OfficialWhatsAppWebhookEvent.js
const mongoose = require('mongoose');

const webhookEventSchema = new mongoose.Schema({
    eventId: String,
    object: String,
    entry: mongoose.Schema.Types.Mixed,
    
    // ===== Message Info =====
    messageId: String,
    waId: String, // Customer's WhatsApp ID
    phoneNumber: String,
    phoneNumberId: String,
    
    // ===== Event Type =====
    eventType: {
        type: String,
        enum: ['message', 'delivery', 'read', 'failure'],
        required: true
    },
    
    // ===== Message Details =====
    messageType: String,
    messageContent: String,
    timestamp: Number,
    
    // ===== Status =====
    status: {
        type: String,
        enum: ['sent', 'delivered', 'read', 'failed']
    },
    error: mongoose.Schema.Types.Mixed,
    
    // ===== Associations =====
    campaignId: String,
    contactId: mongoose.Schema.Types.ObjectId,
    
    // ===== Raw Data =====
    rawData: mongoose.Schema.Types.Mixed,
    
    processedAt: Date
}, {
    timestamps: true
});

webhookEventSchema.index({ messageId: 1 });
webhookEventSchema.index({ waId: 1 });
webhookEventSchema.index({ campaignId: 1 });
webhookEventSchema.index({ createdAt: -1 });

module.exports = mongoose.model('OfficialWhatsAppWebhookEvent', webhookEventSchema);