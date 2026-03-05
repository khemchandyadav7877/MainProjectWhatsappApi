const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    senderId: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'senderModel' },
    senderModel: { type: String, required: true, enum: ['SuperAdmin', 'Educator', 'Trainer', 'Student'] },
    senderName: { type: String, required: true },
    senderRole: { type: String, required: true },
    senderPhone: { type: String, default: 'N/A' },
    
    recipientId: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'recipientModel' },
    recipientModel: { type: String, required: true, enum: ['SuperAdmin', 'Educator', 'Trainer', 'Student'] },
    recipientRole: { type: String, required: true },
    
    message: { type: String, required: true },
    isRead: { type: Boolean, default: false },
    
    conversationId: { type: String, required: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Notification' },
    
    reply: {
        message: String,
        repliedAt: Date,
        repliedBy: mongoose.Schema.Types.ObjectId,
        repliedByModel: String,
        repliedByRole: String
    },
    
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Indexes for better performance
notificationSchema.index({ recipientId: 1, isRead: 1 });
notificationSchema.index({ senderId: 1 });
notificationSchema.index({ conversationId: 1 });
notificationSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);