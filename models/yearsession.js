const mongoose = require('mongoose')

const yearSessionSchema = new mongoose.Schema({
    sessionna: {
        type: String,
        required: true,
        unique: true
    },
    status: {
        type: String,
        enum: ['Active', 'Inactive'],
        default: "Inactive"
    },
    sessionType: {
        type: String,
        enum: ['Current', 'Next'],
        default: 'Current'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'auth'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
})

// Update updatedAt on save
yearSessionSchema.pre('save', function(next) {
    this.updatedAt = Date.now()
    next()
})

module.exports = mongoose.model("yearsession", yearSessionSchema)