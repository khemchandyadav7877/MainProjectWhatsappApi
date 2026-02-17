// models/auth.js
const mongoose = require("mongoose");

const authSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true,
    trim: true,
  },
  lastName: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true,
  },
  contactNumber: {
    type: String,
    required: false,
  },
  dob: {
    type: Date,
    required: false,
  },
  
  // ✅ ADD THESE PROFILE FIELDS
  profileImage: {
    type: String,
    default: ""
  },
  title: {
    type: String,
    default: "Senior Software Engineer"
  },
  bio: {
    type: String,
    default: ""
  },
  location: {
    type: String,
    default: ""
  },
  company: {
    type: String,
    default: ""
  },
  technicalSkills: {
    type: [String],
    default: []
  },
  
  createDate: {
    type: Date,
    default: Date.now,
  },
  role: {
    type: String,
    enum: ["user", "Student", "SuperAdmin", "Educator", "Trainer"],
    default: "user",
  },
  status: {
    type: String,
    enum: ["Active", "Inactive", "Pending"],
    default: "Active",
  },
  activeStatus: {
    type: String,
    enum: ["Active", "Inactive", "Pending"],
    default: "Active",
  },
  joinDate: {
    type: Date,
    default: Date.now,
  },
  lastLogin: {
    type: Date,
    default: null,
  },
  sessions: {
    type: Number,
    default: 0,
  },
  activeLevel: {
    type: String,
    enum: ["Low", "Medium", "High"],
    default: "Low"
  },
  
  // ✅ Login session tracking fields
  loginHistory: [{
    loginTime: {
      type: Date,
      required: true
    },
    logoutTime: {
      type: Date
    },
    sessionId: {
      type: String
    },
    ipAddress: {
      type: String
    },
    userAgent: {
      type: String
    },
    duration: {
      type: Number // in seconds
    }
  }],
  
  loginCount: {
    type: Number,
    default: 0
  },
  
  currentSessionId: {
    type: String
  },
  
  // ✅ ADD PASSWORD HISTORY & ACTIVITY LOG
  passwordHistory: {
    type: [String],
    default: []
  },
  
  passwordChangedAt: {
    type: Date
  },
  
  activityLog: [{
    action: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    ipAddress: {
      type: String
    },
    userAgent: {
      type: String
    },
    details: {
      type: mongoose.Schema.Types.Mixed
    }
  }]
  
}, {
  timestamps: true
});

module.exports = mongoose.model("auth", authSchema);