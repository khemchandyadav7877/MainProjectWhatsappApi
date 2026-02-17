const mongoose = require('mongoose');

const chatContactSchema = new mongoose.Schema({
    contactId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    number: { type: String, required: true },
    cleanNumber: { type: String, required: true },
    status: { type: String, enum: ['online', 'offline', 'typing'], default: 'offline' },
    lastSeen: { type: Date },
    avatar: { type: String, default: '' },
    avatarText: { type: String },
    about: { type: String, default: '' },
    isBlocked: { type: Boolean, default: false },
    isMuted: { type: Boolean, default: false },
    pinned: { type: Boolean, default: false },
    archived: { type: Boolean, default: false },
    unreadCount: { type: Number, default: 0 },
    lastMessage: { type: String, default: '' },
    lastMessageTime: { type: Date },
    lastMessageType: { type: String, default: 'text' },
    deviceId: { type: String, required: true },
    starred: { type: Boolean, default: false },
    labels: [{ type: String }],
    customFields: { type: Object, default: {} },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

chatContactSchema.index({ deviceId: 1, cleanNumber: 1 }, { unique: true });
chatContactSchema.index({ deviceId: 1, updatedAt: -1 });
chatContactSchema.index({ name: 'text', number: 'text' });

module.exports = mongoose.model('ChatContact', chatContactSchema);