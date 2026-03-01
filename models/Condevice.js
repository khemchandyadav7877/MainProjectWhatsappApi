const mongoose = require('mongoose');

const condeviceSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    phoneNumber: {
        type: String,
        required: true,
        trim: true
        // REMOVED unique: true - because different users can have same phone number
    },
    whatsappNumber: {
        type: String,
        trim: true,
        default: null
    },
    email: {
        type: String,
        trim: true,
        lowercase: true,
        default: null
    },
    notes: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'inactive'
    },
    isConnected: {
        type: Boolean,
        default: false
    },
    lastConnected: {
        type: Date,
        default: null
    },
    // ===== CRITICAL: User identification fields =====
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true  // Every contact MUST belong to someone
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

// ===== COMPOUND UNIQUE: Each user can have unique phone numbers =====
// This allows different users to have same phone number,
// but same user cannot have duplicate phone numbers
condeviceSchema.index({ phoneNumber: 1, createdBy: 1 }, { unique: true });

// Indexes for performance
condeviceSchema.index({ email: 1 });
condeviceSchema.index({ status: 1 });
condeviceSchema.index({ createdBy: 1 }); // CRITICAL for role-based queries
condeviceSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Condevice', condeviceSchema);