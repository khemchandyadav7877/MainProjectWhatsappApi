const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../public/uploads/avatars');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for avatar uploads (no session dependency)
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Generate unique filename without user ID
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'avatar-' + uniqueSuffix + ext);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: function (req, file, cb) {
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Only image files are allowed!'), false);
        }
        cb(null, true);
    }
});

// GET profile page
router.get('/profile', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.redirect('/login');
        }
        res.render('profile', {
            activeTab: 'profile',
            user: req.session.user,
            title: 'My Profile',
            layout: false
        });
    } catch (error) {
        console.error('❌ Profile route error:', error);
        res.status(500).send('Server Error');
    }
});

// POST update profile (text fields + avatar)
router.post('/profile/update', upload.single('avatar'), async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ status: false, msg: 'Not authenticated' });
        }

        const { firstName, lastName, contactNumber, dob, gender, address } = req.body;

        // Update user in database
        const User = require('../models/auth'); // adjust path
        const updateData = {
            firstName,
            lastName,
            contactNumber,
            dob: dob ? new Date(dob) : null,
            gender,
            address,
            updatedAt: new Date()
        };

        // If avatar uploaded, add to update
        if (req.file) {
            // Delete old avatar if exists
            const user = await User.findById(req.session.user._id);
            if (user.avatar) {
                const oldPath = path.join(__dirname, '../public', user.avatar);
                if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                }
            }
            updateData.avatar = '/uploads/avatars/' + req.file.filename;
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.session.user._id,
            updateData,
            { new: true }
        );

        if (!updatedUser) {
            return res.status(404).json({ status: false, msg: 'User not found' });
        }

        // Update session
        req.session.user = {
            ...req.session.user,
            firstName: updatedUser.firstName,
            lastName: updatedUser.lastName,
            contactNumber: updatedUser.contactNumber,
            dob: updatedUser.dob,
            gender: updatedUser.gender,
            address: updatedUser.address,
            avatar: updatedUser.avatar,
            updatedAt: updatedUser.updatedAt
        };

        res.json({ status: true, msg: 'Profile updated successfully', user: updatedUser });
    } catch (error) {
        console.error('❌ Profile update error:', error);
        res.status(500).json({ status: false, msg: 'Failed to update profile' });
    }
});

module.exports = router;