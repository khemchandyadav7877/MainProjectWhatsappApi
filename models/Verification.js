const mongoose = require('mongoose');

const verificationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: ['email', 'mobile', 'number_activation'],
        required: true
    },
    code: {
        type: String,
        required: true
    },
    target: {
        type: String,
        required: true
    },
    expiresAt: {
        type: Date,
        required: true,
        default: () => new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
    },
    attempts: {
        type: Number,
        default: 0,
        max: 5
    },
    status: {
        type: String,
        enum: ['pending', 'verified', 'expired', 'failed'],
        default: 'pending'
    },
    metadata: {
        ipAddress: String,
        userAgent: String,
        deviceId: String
    }
}, {
    timestamps: true
});

// Indexes
verificationSchema.index({ userId: 1 });
verificationSchema.index({ code: 1 });
verificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
verificationSchema.index({ status: 1 });

module.exports = mongoose.model('Verification', verificationSchema);