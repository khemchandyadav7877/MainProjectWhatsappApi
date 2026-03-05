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
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
  },
  contactNumber: {
    type: String,
    required: false,
    default: ""
  },
  dob: {
    type: Date,
    required: false,
  },
  
  // ===== PROFILE FIELDS =====
  profileImage: {
    type: String,
    default: ""
  },
  // ⚡⚡ IMPORTANT: Avatar field for profile picture (profileImage alias)
  avatar: {
    type: String,
    default: null
  },
  address: {
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
  
  // Current active session year
  currentSessionYear: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'yearsession',
    default: null
  },
  
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
    sessionYear: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'yearsession'
    },
    ipAddress: {
      type: String
    },
    userAgent: {
      type: String
    },
    duration: {
      type: Number // in seconds
    },
    rememberMe: {
      type: Boolean,
      default: false
    }
  }],
  
  loginCount: {
    type: Number,
    default: 0
  },
  
  currentSessionId: {
    type: String
  },
  
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

// Virtual for full name
authSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Method to get profile data
authSchema.methods.getProfile = function() {
  return {
    firstName: this.firstName,
    lastName: this.lastName,
    email: this.email,
    contactNumber: this.contactNumber || '',
    address: this.address || '',
    avatar: this.avatar || this.profileImage || null,
    dob: this.dob,
    title: this.title,
    bio: this.bio,
    location: this.location,
    company: this.company,
    role: this.role,
    joinDate: this.joinDate,
      gender: {
    type: String,
    enum: ["", "Male", "Female", "Other"],
    default: ""
  },
  };
};

// Pre-save middleware to sync avatar with profileImage
authSchema.pre('save', function(next) {
  // Sync avatar with profileImage if one is set and other isn't
  if (this.avatar && !this.profileImage) {
    this.profileImage = this.avatar;
  } else if (this.profileImage && !this.avatar) {
    this.avatar = this.profileImage;
  }
  next();
});

module.exports = mongoose.model("auth", authSchema);