const mongoose = require('mongoose');

const featureSchema = new mongoose.Schema({
    // Basic Info
    section: {
        type: String,
        required: [true, 'Section is required'],
        trim: true
    },
    label: {
        type: String,
        required: [true, 'Feature label is required'],
        trim: true
    },
    path: {
        type: String,
        required: [true, 'Path is required'],
        trim: true,
        default: function() {
            // Auto-generate path from label
            return '/' + this.label.toLowerCase()
                .replace(/^\d+\.\s*/, '') // Remove numbers
                .replace(/\s+/g, '-')
                .replace(/[^a-z0-9-]/g, '');
        }
    },
    
    // Role & Access
    role: {
        type: String,
        required: true,
        enum: ['SuperAdmin', 'Educator', 'Trainer', 'Student'],
        index: true
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true
    },
    
    // Display
    order: {
        type: Number,
        default: 999
    },
    icon: {
        type: String,
        default: 'FaUserCircle'
    },
    
    // Metadata
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// ✅ COMPOUND INDEX - Prevent duplicates
featureSchema.index({ section: 1, label: 1, role: 1 }, { unique: true });

// ✅ VIRTUAL - Clean section name
featureSchema.virtual('cleanSection').get(function() {
    return this.section.replace(/^\*\*\*\s*/, '');
});

// ✅ VIRTUAL - Clean label name
featureSchema.virtual('cleanLabel').get(function() {
    return this.label.replace(/^\d+\.\s*/, '');
});

// ✅ METHOD - Toggle status
featureSchema.methods.toggleStatus = async function() {
    this.isActive = !this.isActive;
    this.updatedAt = new Date();
    return this.save();
};

// ✅ STATIC - Get by role with sorting
featureSchema.statics.getByRole = function(role) {
    return this.find({ 
        role, 
        isActive: true 
    }).sort({ section: 1, order: 1 });
};

// ✅ STATIC - Get grouped by section
featureSchema.statics.getGroupedByRole = async function(role) {
    const features = await this.find({ 
        role, 
        isActive: true 
    }).sort({ section: 1, order: 1 });
    
    // Group by section
    const grouped = {};
    features.forEach(f => {
        if (!grouped[f.section]) grouped[f.section] = [];
        grouped[f.section].push(f);
    });
    
    return grouped;
};

// ✅ STATIC - Check if exists
featureSchema.statics.exists = function(section, label, role) {
    return this.findOne({ section, label, role });
};

module.exports = mongoose.model('Feature', featureSchema);