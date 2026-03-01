// models/OfficialWhatsAppTemplate.js
const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema({
    templateId: {
        type: String,
        required: true,
        unique: true
    },
    name: {
        type: String,
        required: true
    },
    language: {
        type: String,
        required: true,
        enum: ['en', 'hi', 'gu', 'mr', 'ta', 'te', 'kn', 'ml', 'bn']
    },
    category: {
        type: String,
        enum: ['MARKETING', 'UTILITY', 'AUTHENTICATION'],
        required: true
    },
    
    // ===== Template Components =====
    components: [{
        type: {
            type: String,
            enum: ['HEADER', 'BODY', 'FOOTER', 'BUTTONS']
        },
        format: {
            type: String,
            enum: ['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT']
        },
        text: String,
        example: String,
        buttons: [{
            type: {
                type: String,
                enum: ['QUICK_REPLY', 'URL', 'PHONE_NUMBER']
            },
            text: String,
            url: String,
            phoneNumber: String
        }]
    }],
    
    // ===== Meta Status =====
    status: {
        type: String,
        enum: ['PENDING', 'APPROVED', 'REJECTED', 'PENDING_DELETION'],
        default: 'PENDING'
    },
    rejectionReason: String,
    metaTemplateId: String,
    
    // ===== Usage Stats =====
    qualityScore: {
        type: String,
        enum: ['GREEN', 'YELLOW', 'RED']
    },
    totalSent: {
        type: Number,
        default: 0
    },
    
    // ===== User Association =====
    wabaId: {
        type: String,
        required: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    createdByRole: String,
    createdByEmail: String
}, {
    timestamps: true
});

module.exports = mongoose.model('OfficialWhatsAppTemplate', templateSchema);