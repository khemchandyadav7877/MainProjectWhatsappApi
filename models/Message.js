const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    messageId: { 
        type: String, 
        required: true, 
        unique: true 
    },
    deviceId: { 
        type: String, 
        required: true 
    },
    chatId: { 
        type: String, 
        required: true 
    },
    contactNumber: { 
        type: String, 
        required: true 
    },
    contactName: { 
        type: String 
    },
    message: { 
        type: String 
    },
    messageType: { 
        type: String, 
        enum: ['text', 'image', 'video', 'audio', 'document'],
        default: 'text'
    },
    mediaUrl: { 
        type: String 
    },
    fileName: { 
        type: String 
    },
    direction: { 
        type: String, 
        enum: ['incoming', 'outgoing'],
        required: true 
    },
    timestamp: { 
        type: Date, 
        default: Date.now 
    },
    isRead: { 
        type: Boolean, 
        default: false 
    },
    status: { 
        type: String, 
        enum: ['sent', 'delivered', 'read', 'failed'],
        default: 'sent'
    }
    // ⚠️ jobId field completely hata di
}, { 
    timestamps: true 
});

// Index for better performance
messageSchema.index({ deviceId: 1, contactNumber: 1, timestamp: -1 });

module.exports = mongoose.model('Message', messageSchema);