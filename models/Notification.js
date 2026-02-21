const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    // Sender Info
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'senderModel',
        required: true
    },
    senderModel: {
        type: String,
        enum: ['SuperAdmin', 'Educator', 'Trainer', 'Student'],
        required: true
    },
    senderName: {
        type: String,
        required: true
    },
    senderRole: {
        type: String,
        enum: ['superadmin', 'educator', 'trainer', 'student'],
        required: true
    },
    senderPhone: {
        type: String,
        required: true
    },

    // Recipient Info
    recipientId: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'recipientModel',
        required: true
    },
    recipientModel: {
        type: String,
        enum: ['SuperAdmin', 'Educator', 'Trainer', 'Student'],
        required: true
    },
    recipientRole: {
        type: String,
        enum: ['superadmin', 'educator', 'trainer', 'student'],
        required: true
    },

    // Message
    message: {
        type: String,
        required: true
    },

    // Reply Info
    reply: {
        message: String,
        repliedAt: Date,
        repliedBy: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: 'reply.repliedByModel'
        },
        repliedByModel: String,
        repliedByRole: String
    },

    // Status
    isRead: {
        type: Boolean,
        default: false
    },

    // Metadata
    deviceId: String,
    conversationId: String,  // ✅ This is fine, not indexed uniquely

    // Timestamps
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    // ✅ Add this to prevent automatic index creation
    autoIndex: false
});

// ✅ Define only the indexes we need - NO notificationId index
notificationSchema.index({ recipientId: 1, recipientRole: 1, createdAt: -1 });
notificationSchema.index({ senderId: 1, senderRole: 1 });
notificationSchema.index({ isRead: 1, recipientId: 1 });
notificationSchema.index({ conversationId: 1 });  // Add this if needed

const Notification = mongoose.model('Notification', notificationSchema);

// ✅ Drop the problematic index when server starts
Notification.collection.dropIndex('notificationId_1')
    .then(() => console.log('✅ Dropped old notificationId index'))
    .catch(err => {
        // Index doesn't exist - that's fine
        console.log('ℹ️ No old index to drop (this is normal)');
    });

module.exports = Notification;