const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    paymentId: {
        type: String,
        unique: true,
        required: true
    },
    campaignId: {
        type: String,
        ref: 'Campaign',
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: 'USD'
    },
    status: {
        type: String,
        enum: ['pending', 'processing', 'succeeded', 'failed', 'refunded'],
        default: 'pending'
    },
    paymentMethod: {
        type: String,
        enum: ['card', 'paypal', 'stripe', 'razorpay'],
        required: true
    },
    paymentIntentId: String,
    paymentMethodId: String,
    
    // Card details (encrypted in production)
    last4: String,
    cardBrand: String,
    
    // Receipt
    receiptUrl: String,
    receiptNumber: String,
    
    // Meta
    metadata: mongoose.Schema.Types.Mixed,
    
    // Timestamps
    createdAt: {
        type: Date,
        default: Date.now
    },
    paidAt: Date,
    refundedAt: Date
});

module.exports = mongoose.model('Payment', paymentSchema);