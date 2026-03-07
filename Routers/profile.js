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
        if (req.xhr || req.headers.accept?.includes('json')) {
            return res.status(401).json({ 
                status: false, 
                message: 'Please login to continue' 
            });
        }
        res.redirect('/login?message=' + encodeURIComponent('Please login to continue') + '&messageType=warning');
    }
}

// ===== GET: Profile Page =====
router.get("/profile", isLoggedIn, async (req, res) => {
    try {
        const user = await auth.findById(req.session.userId).lean();
        
        if (!user) {
            req.session.destroy();
            return res.redirect('/login?message=' + encodeURIComponent('User not found') + '&messageType=error');
        }
        
        // Format dates properly
        if (user.dob) {
            user.dob = new Date(user.dob).toISOString().split('T')[0];
        }
        
        if (user.createdAt) {
            user.createdAt = new Date(user.createdAt);
        }
        
        if (user.updatedAt) {
            user.updatedAt = new Date(user.updatedAt);
        }
        
        if (user.lastLogin) {
            user.lastLogin = new Date(user.lastLogin);
        }
        
        // Ensure avatar field is set (use profileImage as fallback)
        if (!user.avatar && user.profileImage) {
            user.avatar = user.profileImage;
        }
        
        // Add avatar path if exists
        if (user.avatar && !user.avatar.startsWith('/')) {
            user.avatar = '/uploads/avatars/' + user.avatar;
        }
        
        console.log("📤 Rendering profile for:", user.email);
        
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

// ===== GET: Edit Profile Page =====
router.get("/profile/edit", isLoggedIn, async (req, res) => {
    try {
        const user = await auth.findById(req.session.userId).lean();
        
        if (!user) {
            return res.redirect('/login?message=' + encodeURIComponent('User not found') + '&messageType=error');
        }
        
        // Prepare user data for editing
        const userData = {
            _id: user._id,
            firstName: user.firstName || '',
            lastName: user.lastName || '',
            email: user.email || '',
            contactNumber: user.contactNumber || '',
            gender: user.gender || '',
            address: user.address || '',
            avatar: user.avatar || user.profileImage || ''
        };
        
        // Format DOB properly
        if (user.dob) {
            userData.dob = new Date(user.dob).toISOString().split('T')[0];
        } else {
            userData.dob = '';
        }
        
        // Add avatar path if exists
        if (userData.avatar && !userData.avatar.startsWith('/')) {
            userData.avatar = '/uploads/avatars/' + userData.avatar;
        }
        
        console.log("📤 Rendering edit profile for:", user.email);
        
        res.render("Editprofile", { 
            userData,
            title: 'Edit Profile',
            currentPage: 'profile'
        });
        
    } catch (error) {
        console.error("❌ Edit profile fetch error:", error);
        res.status(500).render('error', { 
            message: 'Failed to load edit profile',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

// ===== POST: Update Profile =====
router.post("/profile/update", isLoggedIn, upload.single("avatar"), async (req, res) => {
    try {
        const { firstName, lastName, contactNumber, dob, gender, address, userId } = req.body;
        const sessionUserId = req.session.userId;
        
        // Security check: Ensure user can only update their own profile
        if (userId && userId !== sessionUserId.toString()) {
            console.warn("⚠️ Security alert: User trying to update another user's profile");
            return res.json({ 
                status: false, 
                message: "Unauthorized: You can only update your own profile" 
            });
        }
        
        // Validate required fields
        if (!firstName || firstName.trim() === '') {
            return res.json({ 
                status: false, 
                message: "First name is required" 
            });
        }
        
        // Find user
        const user = await auth.findById(sessionUserId);
        
        if (!user) {
            return res.json({ 
                status: false, 
                message: "User not found" 
            });
        }
        
        // Track changed fields for activity log
        const changedFields = [];
        
        // Update fields if provided and changed
        if (firstName && firstName.trim() !== user.firstName) {
            user.firstName = firstName.trim();
            changedFields.push('firstName');
        }
        
        if (lastName !== undefined && lastName.trim() !== (user.lastName || '')) {
            user.lastName = lastName.trim();
            changedFields.push('lastName');
        }
        
        if (contactNumber !== undefined && contactNumber.trim() !== (user.contactNumber || '')) {
            user.contactNumber = contactNumber.trim() || null;
            changedFields.push('contactNumber');
        }
        
        // Handle DOB properly
        const newDob = dob ? new Date(dob) : null;
        const oldDobStr = user.dob ? new Date(user.dob).toISOString().split('T')[0] : null;
        const newDobStr = newDob ? new Date(newDob).toISOString().split('T')[0] : null;
        
        if (newDobStr !== oldDobStr) {
            user.dob = newDob;
            changedFields.push('dob');
        }
        
        if (gender !== undefined && gender !== (user.gender || '')) {
            user.gender = gender || null;
            changedFields.push('gender');
        }
        
        if (address !== undefined && address.trim() !== (user.address || '')) {
            user.address = address.trim() || null;
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
                    try {
                        fs.unlinkSync(fullOldPath);
                        console.log("🗑️ Old avatar deleted:", oldFileName);
                    } catch (unlinkErr) {
                        console.warn("⚠️ Could not delete old avatar:", unlinkErr.message);
                    }
                }
            }
            
            // Save new avatar path (relative to public directory)
            const avatarPath = "/uploads/avatars/" + req.file.filename;
            user.avatar = avatarPath;
            user.profileImage = avatarPath; // Update both fields for compatibility
            avatarChanged = true;
            changedFields.push('avatar');
        }
        
        // Check if anything was changed
        if (changedFields.length === 0 && !avatarChanged) {
            return res.json({ 
                status: true, 
                message: "No changes were made to your profile",
                noChanges: true
            });
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
            message: changedFields.length > 0 ? 
                "Profile updated successfully!" : 
                "Profile updated successfully!",
            user: {
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                contactNumber: user.contactNumber,
                address: user.address,
                avatar: user.avatar,
                dob: user.dob ? new Date(user.dob).toISOString().split('T')[0] : null,
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
            return res.json({ 
                status: false, 
                message: error.message 
            });
        }
        
        // Handle validation errors
        if (error.name === 'ValidationError') {
            return res.json({ 
                status: false, 
                message: Object.values(error.errors).map(e => e.message).join(', ')
            });
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
        
        // Format dates
        const profileData = user.toObject ? user.toObject() : user;
        
        if (profileData.dob) {
            profileData.dob = new Date(profileData.dob).toISOString().split('T')[0];
        }
        
        if (profileData.avatar && !profileData.avatar.startsWith('/')) {
            profileData.avatar = '/uploads/avatars/' + profileData.avatar;
        }
        
        res.json({
            status: true,
            user: profileData
        });
        
    } catch (error) {
        console.error("❌ Profile data fetch error:", error);
        res.status(500).json({ 
            status: false, 
            message: "Failed to fetch profile data" 
        });
    }
});

// ===== GET: Delete Avatar =====
router.post("/profile/delete-avatar", isLoggedIn, async (req, res) => {
    try {
        const user = await auth.findById(req.session.userId);
        
        if (!user) {
            return res.json({ 
                status: false, 
                message: "User not found" 
            });
        }
        
        // Delete avatar file
        const oldAvatarPath = user.avatar || user.profileImage;
        if (oldAvatarPath) {
            const oldFileName = path.basename(oldAvatarPath);
            const fullOldPath = path.join(uploadDir, oldFileName);
            
            if (fs.existsSync(fullOldPath)) {
                fs.unlinkSync(fullOldPath);
                console.log("🗑️ Avatar deleted:", oldFileName);
            }
        }
        
        // Remove avatar from database
        user.avatar = null;
        user.profileImage = null;
        
        // Add to activity log
        if (!user.activityLog) {
            user.activityLog = [];
        }
        
        user.activityLog.push({
            action: 'avatar_deleted',
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent') || 'Unknown',
            timestamp: new Date()
        });
        
        user.updatedAt = new Date();
        await user.save();
        
        res.json({
            status: true,
            message: "Avatar deleted successfully"
        });
        
    } catch (error) {
        console.error("❌ Avatar delete error:", error);
        res.json({ 
            status: false, 
            message: "Failed to delete avatar" 
        });
    }
});

module.exports = router;