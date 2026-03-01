// models/OfficialWhatsAppAccount.js
const mongoose = require('mongoose');

const officialWhatsAppAccountSchema = new mongoose.Schema({
    // ===== Business Info =====
    businessId: {
        type: String,
        required: true,
        unique: true
    },
    businessName: {
        type: String,
        required: true
    },
    businessVerificationStatus: {
        type: String,
        enum: ['pending', 'verified', 'rejected'],
        default: 'pending'
    },
    
    // ===== WABA Info =====
    wabaId: {
        type: String,
        required: true,
        unique: true
    },
    wabaName: String,
    wabaStatus: {
        type: String,
        enum: ['active', 'inactive', 'pending'],
        default: 'active'
    },
    
    // ===== Phone Numbers =====
    phoneNumbers: [{
        phoneNumberId: String,
        displayPhoneNumber: String,
        verifiedName: String,
        qualityRating: {
            type: String,
            enum: ['GREEN', 'YELLOW', 'RED']
        },
        status: {
            type: String,
            enum: ['ACTIVE', 'FLAGGED', 'PENDING', 'DELETED'],
            default: 'ACTIVE'
        },
        codeVerificationStatus: {
            type: String,
            enum: ['NOT_VERIFIED', 'VERIFIED'],
            default: 'NOT_VERIFIED'
        },
        pin: String, // 6-digit PIN for registration
        registeredAt: Date,
        messagingLimit: {
            type: String,
            enum: ['TIER_1K', 'TIER_10K', 'TIER_100K', 'TIER_UNLIMITED'],
            default: 'TIER_1K'
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    
    // ===== Access Tokens =====
    accessToken: {
        token: String,
        expiresAt: Date,
        type: {
            type: String,
            enum: ['temporary', 'permanent'],
            default: 'permanent'
        }
    },
    
    // ===== Webhook Info =====
    webhook: {
        url: String,
        verifyToken: String,
        isVerified: {
            type: Boolean,
            default: false
        },
        subscribedFields: [String] // messages, message_deliveries, etc.
    },
    
    // ===== Rate Limits =====
    rateLimits: {
        tier: {
            type: String,
            enum: ['TIER_1', 'TIER_2', 'TIER_3'],
            default: 'TIER_1'
        },
        messagesPerSecond: {
            type: Number,
            default: 80
        },
        dailyLimit: Number,
        monthlyLimit: Number
    },
    
    // ===== User Association =====
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    createdByRole: {
        type: String,
        enum: ["user", "Student", "SuperAdmin", "Educator", "Trainer"],
        required: true
    },
    createdByEmail: {
        type: String,
        required: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('OfficialWhatsAppAccount', officialWhatsAppAccountSchema);