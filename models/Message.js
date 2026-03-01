const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    jobId: { type: String, required: true, unique: true },
    channel: { type: String, default: 'whatsapp' },
    bill: { type: Number, default: 1 },
    message: { type: String, default: '' },
    messageType: { type: String, default: 'text' },
    mediaUrl: { type: String, default: '' },
    fileName: { type: String, default: '' },
    fileSize: { type: Number, default: 0 },
    sentTime: { type: Date, default: Date.now },
    status: { type: String, default: 'Pending' },
    deviceId: { type: String, default: '' },
    whatsappNumber: { type: String, default: '' },
    campaignId: { type: String, default: null, index: true },
    campaignName: { type: String, default: '' },
    recipient: { type: String, default: '' },
    direction: { type: String, default: 'outgoing' },
    error: { type: String, default: null },
    isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

messageSchema.index({ campaignId: 1, sentTime: -1 });
messageSchema.index({ recipient: 1 });
messageSchema.index({ status: 1 });

module.exports = mongoose.model('Message', messageSchema);