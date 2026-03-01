const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        default: ''
    },
    contacts: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Condevice'
    }],
    totalContacts: {
        type: Number,
        default: 0
    },
    createdBy: {
        type: String,
        default: 'system'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Group', groupSchema);