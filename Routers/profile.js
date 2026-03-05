const router = require("express").Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const auth = require("../models/auth");

// Upload directory
const uploadDir = path.join(__dirname, "../public/uploads/avatars");

// Create upload directory if it doesn't exist
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log("📁 Upload directory created:", uploadDir);
}

// Multer storage configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Clean filename: userId-timestamp.extension
        const cleanName = req.session.userId + '-' + Date.now() + path.extname(file.originalname).toLowerCase();
        cb(null, cleanName);
    }
});

// File filter for images
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
    }
};

// Multer upload middleware
const upload = multer({ 
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
    fileFilter
});

// Middleware: Check if user is logged in
function isLoggedIn(req, res, next) {
    if (req.session && req.session.isLoggedIn && req.session.userId) {
        next();
    } else {
        res.redirect('/login?message=' + encodeURIComponent('Please login to continue') + '&messageType=warning');
    }
}

// ===== GET: Profile Page =====
router.get("/profile", isLoggedIn, async (req, res) => {
    try {
        const user = await auth.findById(req.session.userId).lean();
        
        if (!user) {
            return res.redirect('/login?message=' + encodeURIComponent('User not found') + '&messageType=error');
        }
        
        // Add formatted dates and ensure avatar exists
        if (user.dob) {
            user.dobFormatted = new Date(user.dob).toLocaleDateString();
        }
        
        // Ensure avatar field is set (use profileImage as fallback)
        if (!user.avatar && user.profileImage) {
            user.avatar = user.profileImage;
        }
        
        res.render("profile", { 
            user,
            title: 'My Profile',
            currentPage: 'profile'
        });
        
    } catch (error) {
        console.error("❌ Profile fetch error:", error);
        res.status(500).render('error', { 
            message: 'Failed to load profile',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

// ===== POST: Update Profile =====
router.post("/profile/update", isLoggedIn, upload.single("avatar"), async (req, res) => {
    try {
        const { firstName, lastName, contactNumber, dob, gender, address } = req.body;
        const userId = req.session.userId;
        
        // Validate required fields
        if (!firstName || firstName.trim() === '') {
            return res.json({ 
                status: false, 
                message: "First name is required" 
            });
        }
        
        // Find user
        const user = await auth.findById(userId);
        
        if (!user) {
            return res.json({ 
                status: false, 
                message: "User not found" 
            });
        }
        
        // Track changed fields for activity log
        const changedFields = [];
        
        // Update fields if provided
        if (firstName && firstName !== user.firstName) {
            user.firstName = firstName.trim();
            changedFields.push('firstName');
        }
        
        if (lastName !== undefined && lastName !== user.lastName) {
            user.lastName = lastName.trim();
            changedFields.push('lastName');
        }
        
        if (contactNumber !== undefined && contactNumber !== user.contactNumber) {
            user.contactNumber = contactNumber.trim();
            changedFields.push('contactNumber');
        }
        
        if (dob !== undefined && dob !== user.dob?.toISOString().split('T')[0]) {
            user.dob = dob ? new Date(dob) : null;
            changedFields.push('dob');
        }
        
        if (gender !== undefined && gender !== user.gender) {
            user.gender = gender;
            changedFields.push('gender');
        }
        
        if (address !== undefined && address !== user.address) {
            user.address = address.trim();
            changedFields.push('address');
        }
        
        // Handle avatar upload
        let avatarChanged = false;
        if (req.file) {
            // Delete old avatar if exists
            const oldAvatarPath = user.avatar || user.profileImage;
            if (oldAvatarPath) {
                // Extract filename from path
                const oldFileName = path.basename(oldAvatarPath);
                const fullOldPath = path.join(uploadDir, oldFileName);
                
                if (fs.existsSync(fullOldPath)) {
                    fs.unlinkSync(fullOldPath);
                    console.log("🗑️ Old avatar deleted:", oldFileName);
                }
            }
            
            // Save new avatar path (relative to public directory)
            const avatarPath = "/uploads/avatars/" + req.file.filename;
            user.avatar = avatarPath;
            user.profileImage = avatarPath; // Update both fields for compatibility
            avatarChanged = true;
            changedFields.push('avatar');
        }
        
        // Add to activity log
        if (!user.activityLog) {
            user.activityLog = [];
        }
        
        user.activityLog.push({
            action: 'profile_updated',
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent') || 'Unknown',
            details: { 
                fields: changedFields,
                avatar: avatarChanged
            },
            timestamp: new Date()
        });
        
        // Update timestamps
        user.updatedAt = new Date();
        
        // Save to database
        await user.save();
        
        console.log("✅ Profile updated for:", user.email);
        console.log("📝 Changed fields:", changedFields);
        
        // Prepare response
        res.json({
            status: true,
            message: "Profile updated successfully!",
            user: {
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                contactNumber: user.contactNumber,
                address: user.address,
                avatar: user.avatar,
                dob: user.dob,
                gender: user.gender
            }
        });
        
    } catch (error) {
        console.error("❌ Profile update error:", error);
        
        // Handle multer errors
        if (error instanceof multer.MulterError) {
            if (error.code === 'LIMIT_FILE_SIZE') {
                return res.json({ 
                    status: false, 
                    message: "File too large. Maximum size is 5MB." 
                });
            }
        }
        
        res.json({ 
            status: false, 
            message: error.message || "Failed to update profile"
        });
    }
});

// ===== GET: Profile Data (API) =====
router.get("/profile/data", isLoggedIn, async (req, res) => {
    try {
        const user = await auth.findById(req.session.userId).select('-password -passwordHistory');
        
        if (!user) {
            return res.status(404).json({ 
                status: false, 
                message: "User not found" 
            });
        }
        
        res.json({
            status: true,
            user: user.getProfile()
        });
        
    } catch (error) {
        console.error("❌ Profile data fetch error:", error);
        res.status(500).json({ 
            status: false, 
            message: "Failed to fetch profile data" 
        });
    }
});

module.exports = router;