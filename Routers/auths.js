const router = require('express').Router();
const auth = require('../models/auth');
const session = require('express-session');

// Configure session middleware
router.use(session({
    secret: process.env.SESSION_SECRET || 'your_session_secret_key_12345',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// ========== HOME PAGE (Header.ejs for regular users) ==========
router.get('/', async (req, res) => {
    try {
        // Agar user logged in hai toh
        if (req.session.isLoggedIn) {
            const user = await auth.findById(req.session.userId);
            if (!user) {
                // User not found in DB, destroy session and show header
                req.session.destroy();
                return res.render('HeaderManagement/Header.ejs');
            }
            
            // Role 'user' ke liye Header.ejs render karo
            if (user.role === 'user') {
                return res.render('HeaderManagement/Header.ejs', { 
                    user: user,
                    isLoggedIn: true
                });
            } else {
                // Admin roles ke liye dashboard
                return res.redirect('/dashboard');
            }
        }
        
        // Agar logged in nahi hai toh simple header (without user data)
        res.render('HeaderManagement/Header.ejs', { 
            user: null,
            isLoggedIn: false 
        });
        
    } catch (error) {
        console.error('Home page error:', error);
        // Agar koi error ho toh bhi header show karo
        res.render('HeaderManagement/Header.ejs', { 
            user: null,
            isLoggedIn: false 
        });
    }
});

// Login page
router.get('/login', async (req, res) => {
    // Agar user already logged in hai toh role-based redirect
    if (req.session.isLoggedIn) {
        if (req.session.role === 'user') {
            return res.redirect('/'); // Header.ejs
        } else {
            return res.redirect('/dashboard');
        }
    }
    const message = req.query.message;
    const messageType = req.query.messageType;
    res.render('HeaderManagement/Login.ejs', { 
        message: message || null, 
        messageType: messageType || null 
    });
});

// Signup page
router.get('/signup', async (req, res) => {
    // Agar user already logged in hai toh role-based redirect
    if (req.session.isLoggedIn) {
        if (req.session.role === 'user') {
            return res.redirect('/'); // Header.ejs
        } else {
            return res.redirect('/dashboard');
        }
    }
    const message = req.query.message;
    const messageType = req.query.messageType;
    res.render('HeaderManagement/Signup.ejs', { 
        message: message || null, 
        messageType: messageType || null 
    });
});

// Dashboard - Role based access
router.get('/dashboard', isAuthenticated, async (req, res) => {
    try {
        const user = await auth.findById(req.session.userId);
        if (!user) {
            req.session.destroy();
            return res.redirect('/login?message=User not found&messageType=error');
        }
        
        // Agar role 'user' hai toh dashboard mat dikhao, home page (Header.ejs) bhejo
        if (user.role === 'user') {
            return res.redirect('/');
        }
        
        // Role ke hisaab se different dashboard render karein
        res.render('dashboard', { 
            user: user,
            role: user.role
        });
        
    } catch (error) {
        console.error('Dashboard error:', error);
        res.redirect('/login?message=Server error&messageType=error');
    }
});

// Signup POST route
router.post('/signup', async (req, res) => {
    try {
        const { firstName, lastName, email, password, confirmPassword } = req.body;

        // Validate input
        if (!firstName || !lastName || !email || !password || !confirmPassword) {
            return res.redirect('/signup?message=All fields are required&messageType=error');
        }

        // Password confirmation check
        if (password !== confirmPassword) {
            return res.redirect('/signup?message=Passwords do not match&messageType=error');
        }

        // Password length check
        if (password.length < 6) {
            return res.redirect('/signup?message=Password must be at least 6 characters long&messageType=error');
        }

        // Email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.redirect('/signup?message=Invalid email format&messageType=error');
        }

        // Check if user already exists
        const existingUser = await auth.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.redirect('/signup?message=Email already registered. Please login.&messageType=error');
        }

        // Create new user with default role 'user'
        const newUser = new auth({
            firstName,
            lastName,
            email: email.toLowerCase(),
            password: password,
            role: 'user', // ✅ Default role always 'user'
            status: 'Active',
            activeStatus: 'Active',
            joinDate: new Date(),
            loginCount: 0,
            activeLevel: 'Low',
            title: "New User",
            bio: "Welcome to MyLMS! Start your learning journey today.",
            location: "",
            company: "",
            technicalSkills: [],
            passwordHistory: [password],
            passwordChangedAt: new Date()
        });

        await newUser.save();

        // Log activity
        newUser.activityLog.push({
            action: 'signup',
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            details: { method: 'email' }
        });

        await newUser.save();

        // Signup ke baad login page redirect
        res.redirect('/login?message=Account created successfully! Please login.&messageType=success');

    } catch (error) {
        console.error('Signup error:', error);
        res.redirect('/signup?message=Server error. Please try again.&messageType=error');
    }
});

// Login POST route with role-based redirect
router.post('/login', async (req, res) => {
    try {
        const { email, password, remember } = req.body;

        // Basic validation
        if (!email || !password) {
            return res.redirect('/login?message=Email and password are required&messageType=error');
        }

        // Find user by email
        const user = await auth.findOne({ email: email.toLowerCase() });
        
        if (!user) {
            return res.redirect('/login?message=Invalid email or password&messageType=error');
        }

        // Check password
        if (user.password !== password) {
            return res.redirect('/login?message=Invalid email or password&messageType=error');
        }

        // Check if user is active
        if (user.status !== 'Active' || user.activeStatus !== 'Active') {
            return res.redirect('/login?message=Account is inactive. Please contact support.&messageType=error');
        }

        // Create session
        req.session.userId = user._id;
        req.session.email = user.email;
        req.session.role = user.role;
        req.session.isLoggedIn = true;

        // Generate session ID
        const sessionId = require('crypto').randomBytes(16).toString('hex');
        req.session.sessionId = sessionId;

        // Update user login info
        user.lastLogin = new Date();
        user.loginCount += 1;
        user.activeLevel = user.loginCount > 10 ? 'High' : user.loginCount > 5 ? 'Medium' : 'Low';

        // Add to login history
        user.loginHistory.push({
            loginTime: new Date(),
            sessionId: sessionId,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        user.currentSessionId = sessionId;

        // Log activity
        user.activityLog.push({
            action: 'login',
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            details: { method: 'email', remember: !!remember }
        });

        await user.save();

        // Set session cookie duration based on remember me
        if (remember) {
            req.session.cookie.maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
        } else {
            req.session.cookie.maxAge = 24 * 60 * 60 * 1000; // 24 hours
        }

        // ✅ ROLE-BASED REDIRECT - FINAL FIX
        // Default role 'user' → home page (Header.ejs)
        // SuperAdmin, Educator, Student, Trainer → dashboard
        if (user.role === 'user') {
            console.log(`✅ User ${user.email} (role: user) redirected to / (Header.ejs)`);
            return res.redirect('/');
        } else {
            console.log(`✅ User ${user.email} (role: ${user.role}) redirected to /dashboard`);
            return res.redirect('/dashboard');
        }

    } catch (error) {
        console.error('Login error:', error);
        res.redirect('/login?message=Server error. Please try again.&messageType=error');
    }
});

// Logout route
router.get('/logout', isAuthenticated, async (req, res) => {
    try {
        const user = await auth.findById(req.session.userId);
        if (user) {
            // Find and update the current session logout time
            const sessionIndex = user.loginHistory.findIndex(
                session => session.sessionId === req.session.sessionId && !session.logoutTime
            );
            
            if (sessionIndex !== -1) {
                const logoutTime = new Date();
                user.loginHistory[sessionIndex].logoutTime = logoutTime;
                user.loginHistory[sessionIndex].duration = 
                    (logoutTime - user.loginHistory[sessionIndex].loginTime) / 1000;
                
                user.currentSessionId = null;
                
                // Log activity
                user.activityLog.push({
                    action: 'logout',
                    ipAddress: req.ip,
                    userAgent: req.get('User-Agent')
                });

                await user.save();
            }
        }

        // Destroy session
        req.session.destroy((err) => {
            if (err) {
                console.error('Session destruction error:', err);
                return res.redirect('/dashboard?message=Logout error&messageType=error');
            }
            res.redirect('/login?message=Logged out successfully&messageType=success');
        });

    } catch (error) {
        console.error('Logout error:', error);
        req.session.destroy(() => {
            res.redirect('/login?message=Logout error&messageType=error');
        });
    }
});

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
    if (req.session && req.session.isLoggedIn) {
        return next();
    }
    res.redirect('/login?message=Please login first&messageType=error');
}

router.get('/chats', (req, res) => {

    res.render('Chats/newChats', {
        activeTab: 'chats',
        user: req.session.user || req.user || {
            role: 'SuperAdmin',
            firstName: 'Admin',
            lastName: 'User',
            email: 'admin@example.com'
        }
    });

});

// Other routes
router.get('/addnewfeature', (req, res) => {
    res.render('AddNewFeature.ejs');
});

router.get('/add-new-feature', (req, res) => {
    res.render('AddNewFeatureForm.ejs');
});

router.get('/role-permissions', (req, res) => {
    res.render('RolePermissions.ejs');
});

// router.get('/add-new-feature', (req, res) => {
//     res.render('AddNewFeatureForm.ejs', {
//         activeTab: 'addFeature',   // sidebar highlight ke liye (optional)
//         user: req.session.user || req.user || {
//             role: 'SuperAdmin',
//             firstName: 'Admin',
//             lastName: 'User',
//             email: 'admin@example.com'
//         }
//     });
// });


// router.get('/role-permissions', (req, res) => {
//     res.render('RolePermissions.ejs', {
//         activeTab: 'rolePermissions',   // optional (sidebar highlight)
//         user: req.session.user || req.user || {
//             role: 'SuperAdmin',
//             firstName: 'Admin',
//             lastName: 'User',
//             email: 'admin@example.com'
//         }
//     });
// });

module.exports = router;