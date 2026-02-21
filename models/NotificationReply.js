// models/NotificationReply.js - Reply/Conversation Schema
const mongoose = require('mongoose');

const notificationReplySchema = new mongoose.Schema({
    // Link to parent notification
    notificationId: {
        type: String,
        required: true,
        index: true
    },
    
    // From (sender of this reply)
    from: {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        name: {
            type: String,
            required: true
        },
        role: {
            type: String,
            enum: ['user', 'Student', 'Educator', 'Trainer', 'SuperAdmin'],
            required: true
        }
    },
    
    // To (recipient of this reply)
    to: {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        name: {
            type: String,
            required: true
        },
        role: {
            type: String,
            enum: ['user', 'Student', 'Educator', 'Trainer', 'SuperAdmin'],
            required: true
        }
    },
    
    // Reply message
    message: {
        type: String,
        required: true
    },
    
    messageType: {
        type: String,
        enum: ['text', 'image', 'video', 'audio', 'document'],
        default: 'text'
    },
    
    mediaUrl: {
        type: String,
        default: null
    },
    
    // WhatsApp details (if sent via WhatsApp)
    whatsappMessageId: {
        type: String,
        default: null
    },
    
    sentVia: {
        type: String,
        enum: ['whatsapp', 'dashboard'],
        default: 'dashboard'
    },
    
    // Status
    status: {
        type: String,
        enum: ['sent', 'delivered', 'read', 'failed'],
        default: 'sent'
    },
    
    // Timestamps
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Index for faster queries
notificationReplySchema.index({ notificationId: 1, createdAt: 1 });

module.exports = mongoose.model('NotificationReply', notificationReplySchema);
