const router = require('express').Router();
const auth = require('../models/auth');

// ========== MIDDLEWARE to check if user is authenticated and is SuperAdmin ==========
function isSuperAdmin(req, res, next) {
    if (req.session && req.session.isLoggedIn && req.session.userId) {
        auth.findById(req.session.userId).then(user => {
            if (user && user.role === 'SuperAdmin') {
                req.user = user;
                next();
            } else {
                res.redirect('/dashboard?message=Access denied. SuperAdmin only.&messageType=error');
            }
        }).catch(err => {
            res.redirect('/login?message=Please login first&messageType=error');
        });
    } else {
        res.redirect('/login?message=Please login first&messageType=error');
    }
}

// ========== GET: Show All Users Page ==========
router.get('/CustomRoles', isSuperAdmin, async (req, res) => {
    try {
        // Get all users for the table
        const users = await auth.find().sort({ createdAt: -1 });
        
        // Get stats
        const stats = {
            total: users.length,
            superAdmin: users.filter(u => u.role === 'SuperAdmin').length,
            educator: users.filter(u => u.role === 'Educator').length,
            trainer: users.filter(u => u.role === 'Trainer').length,
            student: users.filter(u => u.role === 'Student').length,
            user: users.filter(u => u.role === 'user').length,
            active: users.filter(u => u.status === 'Active').length,
            pending: users.filter(u => u.status === 'Pending').length,
            inactive: users.filter(u => u.status === 'Inactive').length
        };

        res.render("CustomRoles.ejs", {
            users: users,
            stats: stats,
            user: req.user,
            currentUserId: req.user._id.toString(),
            isLoggedIn: true
        });
    } catch (error) {
        console.error('Error loading CustomRoles:', error);
        res.status(500).send('Server Error');
    }
});

// ========== GET: Show Add User Form Page ==========
router.get('/CustomRolesAdd', isSuperAdmin, (req, res) => {
    res.render("CustomRolesAdd.ejs", {
        user: req.user,
        isLoggedIn: true
    });
});

// ========== POST: Create New User with Role ==========
router.post('/CustomRoles/create', isSuperAdmin, async (req, res) => {
    try {
        const { 
            firstName, 
            lastName, 
            email, 
            password, 
            confirmPassword,
            contactNumber,
            dob,
            role
        } = req.body;

        // Validation
        if (!firstName || !lastName || !email || !password || !confirmPassword || !role) {
            return res.redirect('/CustomRolesAdd?message=All fields are required&messageType=error');
        }

        if (password !== confirmPassword) {
            return res.redirect('/CustomRolesAdd?message=Passwords do not match&messageType=error');
        }

        if (password.length < 6) {
            return res.redirect('/CustomRolesAdd?message=Password must be at least 6 characters&messageType=error');
        }

        // Email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.redirect('/CustomRolesAdd?message=Invalid email format&messageType=error');
        }

        // Check if user exists
        const existingUser = await auth.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.redirect('/CustomRolesAdd?message=Email already exists&messageType=error');
        }

        // Create new user
        const newUser = new auth({
            firstName,
            lastName,
            email: email.toLowerCase(),
            password: password,
            contactNumber: contactNumber || '',
            dob: dob || null,
            role: role,
            status: 'Active',
            activeStatus: 'Active',
            joinDate: new Date(),
            loginCount: 0,
            activeLevel: 'Low',
            technicalSkills: [],
            passwordHistory: [password],
            passwordChangedAt: new Date(),
            activityLog: [{
                action: 'user_created_by_admin',
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                details: { createdBy: req.user.email, role: role },
                timestamp: new Date()
            }],
            loginHistory: []
        });

        await newUser.save();

        res.redirect('/CustomRoles?message=User created successfully!&messageType=success');

    } catch (error) {
        console.error('Error creating user:', error);
        res.redirect('/CustomRolesAdd?message=Server error: ' + error.message + '&messageType=error');
    }
});

// ========== POST: Update User Status (Active/Pending/Inactive) ==========
router.post('/CustomRoles/update-status/:userId', isSuperAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        const userId = req.params.userId;

        // Don't allow changing own status
        if (userId === req.user._id.toString()) {
            return res.redirect('/CustomRoles?message=Cannot change your own status&messageType=error');
        }

        const user = await auth.findById(userId);
        if (!user) {
            return res.redirect('/CustomRoles?message=User not found&messageType=error');
        }

        const oldStatus = user.status;
        user.status = status;
        user.activeStatus = status;
        
        // Add to activity log
        if (!user.activityLog) user.activityLog = [];
        user.activityLog.push({
            action: 'status_updated',
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            details: { oldStatus: oldStatus, newStatus: status, updatedBy: req.user.email },
            timestamp: new Date()
        });

        await user.save();

        res.redirect('/CustomRoles?message=User status updated successfully&messageType=success');

    } catch (error) {
        console.error('Error updating status:', error);
        res.redirect('/CustomRoles?message=Server error&messageType=error');
    }
});

// ========== POST: Update User Role ==========
router.post('/CustomRoles/update-role/:userId', isSuperAdmin, async (req, res) => {
    try {
        const { role } = req.body;
        const userId = req.params.userId;

        // Don't allow changing own role
        if (userId === req.user._id.toString()) {
            return res.redirect('/CustomRoles?message=Cannot change your own role&messageType=error');
        }

        const user = await auth.findById(userId);
        if (!user) {
            return res.redirect('/CustomRoles?message=User not found&messageType=error');
        }

        const oldRole = user.role;
        user.role = role;
        
        // Add to activity log
        if (!user.activityLog) user.activityLog = [];
        user.activityLog.push({
            action: 'role_updated',
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            details: { oldRole: oldRole, newRole: role, updatedBy: req.user.email },
            timestamp: new Date()
        });

        await user.save();

        res.redirect('/CustomRoles?message=User role updated successfully&messageType=success');

    } catch (error) {
        console.error('Error updating role:', error);
        res.redirect('/CustomRoles?message=Server error&messageType=error');
    }
});

// ========== POST: Delete User ==========
router.post('/CustomRoles/delete/:userId', isSuperAdmin, async (req, res) => {
    try {
        const userId = req.params.userId;

        // Don't allow deleting yourself
        if (userId === req.user._id.toString()) {
            return res.redirect('/CustomRoles?message=Cannot delete your own account&messageType=error');
        }

        const user = await auth.findById(userId);
        if (!user) {
            return res.redirect('/CustomRoles?message=User not found&messageType=error');
        }

        await auth.findByIdAndDelete(userId);

        res.redirect('/CustomRoles?message=User deleted successfully&messageType=success');

    } catch (error) {
        console.error('Error deleting user:', error);
        res.redirect('/CustomRoles?message=Server error&messageType=error');
    }
});

module.exports = router;