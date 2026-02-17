const mongoose = require('mongoose');

const emailProviderSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    provider_type: {
        type: String,
        enum: ['sendgrid', 'aws_ses', 'mailgun', 'custom', 'gmail', 'office365'],
        required: true
    },
    host: {
        type: String,
        required: true,
        trim: true
    },
    port: {
        type: Number,
        required: true
    },
    username: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true
    },
    encryption: {
        type: String,
        enum: ['tls', 'ssl', 'none'],
        default: 'tls'
    },
    from_email: {
        type: String,
        required: true
    },
    from_name: {
        type: String,
        required: true
    },
    daily_limit: {
        type: Number,
        default: 10000
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'testing'],
        default: 'testing'
    },
    emails_sent: {
        type: Number,
        default: 0
    },
    created_at: {
        type: Date,
        default: Date.now
    },
    updated_at: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('EmailProvider', emailProviderSchema);