const mongoose = require('mongoose');

const virtualNumberSchema = new mongoose.Schema({
    number: {
        type: String,
        required: true,
        unique: true
    },
    country: {
        type: String,
        required: true
    },
    countryCode: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['mobile', 'toll-free', 'landline', 'voip'],
        default: 'mobile'
    },
    status: {
        type: String,
        enum: ['available', 'allocated', 'suspended', 'expired'],
        default: 'available'
    },
    isFree: {
        type: Boolean,
        default: true
    },
    freeType: {
        type: String,
        enum: ['forever', 'trial', 'developer'],
        default: 'trial'
    },
    allocatedTo: {
        type: String // userId or sessionId
    },
    allocatedAt: {
        type: Date
    },
    validUntil: {
        type: Date
    },
    purpose: {
        type: String
    },
    callsLimit: {
        type: Number,
        default: 100
    },
    smsLimit: {
        type: Number,
        default: 100
    },
    callsUsed: {
        type: Number,
        default: 0
    },
    smsUsed: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('VirtualNumber', virtualNumberSchema);