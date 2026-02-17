const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    messageId: { type: String, required: true, unique: true },
    from: { type: String, required: true },
    to: { type: String, required: true },
    body: { type: String, default: '' },
    type: { type: String, enum: ['text', 'image', 'video', 'audio', 'document'], default: 'text' },
    mediaUrl: { type: String, default: '' },
    fileName: { type: String, default: '' },
    fileSize: { type: Number, default: 0 },
    mimeType: { type: String, default: '' },
    status: { type: String, enum: ['sent', 'delivered', 'read', 'failed'], default: 'sent' },
    direction: { type: String, enum: ['incoming', 'outgoing'], required: true },
    deviceId: { type: String, required: true },
    contactId: { type: String },
    contactName: { type: String },
    quotedMessageId: { type: String },
    forwarded: { type: Boolean, default: false },
    starred: { type: Boolean, default: false },
    deleted: { type: Boolean, default: false },
    edited: { type: Boolean, default: false },
    reaction: { type: String, default: '' },
    replyTo: { type: String },
    mentions: [{ type: String }],
    metadata: { type: Object, default: {} },
    sentAt: { type: Date, default: Date.now },
    deliveredAt: { type: Date },
    readAt: { type: Date },
    createdAt: { type: Date, default: Date.now }
});

messageSchema.index({ from: 1, to: 1, createdAt: -1 });
messageSchema.index({ deviceId: 1, createdAt: -1 });
messageSchema.index({ messageId: 1 }, { unique: true });

module.exports = mongoose.model('Message', messageSchema);