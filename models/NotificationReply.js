const mongoose = require('mongoose');

const notificationReplySchema = new mongoose.Schema({
    notificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Notification', required: true },
    
    from: {
        userId: { type: mongoose.Schema.Types.ObjectId, required: true },
        model: { type: String, required: true },
        name: String,
        role: String
    },
    
    to: {
        userId: { type: mongoose.Schema.Types.ObjectId, required: true },
        model: { type: String, required: true },
        name: String,
        role: String
    },
    
    message: { type: String, required: true },
    sentVia: { type: String, default: 'dashboard' },
    status: { type: String, default: 'sent' },
    
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('NotificationReply', notificationReplySchema);