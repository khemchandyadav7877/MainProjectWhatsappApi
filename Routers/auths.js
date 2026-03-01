const router = require('express').Router();
const auth = require('../models/auth');

// ========== MIDDLEWARE ==========

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
    if (req.session && req.session.isLoggedIn && req.session.userId) {
        return next();
    }
    res.redirect('/login?message=Please login first&messageType=error');
}

// Middleware to make user available to all views
router.use(async (req, res, next) => {
    if (req.session && req.session.isLoggedIn && req.session.userId) {
        try {
            const user = await auth.findById(req.session.userId).lean();
            if (user) {
                // Make user available to all templates
                res.locals.user = user;
                res.locals.isLoggedIn = true;
                
                // Also attach to req for route handlers
                req.user = user;
            } else {
                // User not found in DB, clear session
                req.session.destroy();
                res.locals.user = null;
                res.locals.isLoggedIn = false;
                req.user = null;
            }
        } catch (error) {
            console.error('Error fetching user:', error);
            res.locals.user = null;
            res.locals.isLoggedIn = false;
            req.user = null;
        }
    } else {
        res.locals.user = null;
        res.locals.isLoggedIn = false;
        req.user = null;
    }
    next();
});

// ========== HOME PAGE (Header.ejs for regular users) ==========
router.get('/', async (req, res) => {
    try {
        // Agar user logged in hai toh
        if (req.session.isLoggedIn && req.session.userId) {
            const user = await auth.findById(req.session.userId);
            if (!user) {
                // User not found in DB, destroy session and show header
                req.session.destroy();
                return res.render('HeaderManagement/Header.ejs', { 
                    user: null,
                    isLoggedIn: false 
                });
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

// ========== LOGIN PAGE ==========
router.get('/login', async (req, res) => {
    // Agar user already logged in hai toh role-based redirect
    if (req.session.isLoggedIn && req.session.userId) {
        try {
            const user = await auth.findById(req.session.userId);
            if (user) {
                if (user.role === 'user') {
                    return res.redirect('/'); // Header.ejs
                } else {
                    return res.redirect('/dashboard');
                }
            }
        } catch (error) {
            console.error('Login redirect error:', error);
        }
    }
    
    const message = req.query.message;
    const messageType = req.query.messageType;
    res.render('HeaderManagement/Login.ejs', { 
        message: message || null, 
        messageType: messageType || null,
        user: null,
        isLoggedIn: false
    });
});

// ========== SIGNUP PAGE ==========
router.get('/signup', async (req, res) => {
    // Agar user already logged in hai toh role-based redirect
    if (req.session.isLoggedIn && req.session.userId) {
        try {
            const user = await auth.findById(req.session.userId);
            if (user) {
                if (user.role === 'user') {
                    return res.redirect('/'); // Header.ejs
                } else {
                    return res.redirect('/dashboard');
                }
            }
        } catch (error) {
            console.error('Signup redirect error:', error);
        }
    }
    
    const message = req.query.message;
    const messageType = req.query.messageType;
    res.render('HeaderManagement/Signup.ejs', { 
        message: message || null, 
        messageType: messageType || null,
        user: null,
        isLoggedIn: false
    });
});

// ========== DASHBOARD - Role based access ==========
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
            role: user.role,
            activeTab: 'dashboard',
            isLoggedIn: true
        });
        
    } catch (error) {
        console.error('Dashboard error:', error);
        res.redirect('/login?message=Server error&messageType=error');
    }
});

// ========== SIGNUP POST ROUTE ==========
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
            password: password, // Note: You should hash passwords in production!
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
            passwordChangedAt: new Date(),
            activityLog: [],
            loginHistory: []
        });

        await newUser.save();

        // Log activity
        newUser.activityLog.push({
            action: 'signup',
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            details: { method: 'email' },
            timestamp: new Date()
        });

        await newUser.save();

        // Signup ke baad login page redirect
        res.redirect('/login?message=Account created successfully! Please login.&messageType=success');

    } catch (error) {
        console.error('Signup error:', error);
        res.redirect('/signup?message=Server error. Please try again.&messageType=error');
    }
});

// ========== LOGIN POST ROUTE ==========
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

        // Check password (In production, use bcrypt.compare)
        if (user.password !== password) {
            return res.redirect('/login?message=Invalid email or password&messageType=error');
        }

        // Check if user is active
        if (user.status !== 'Active' || user.activeStatus !== 'Active') {
            return res.redirect('/login?message=Account is inactive. Please contact support.&messageType=error');
        }

        // Generate simple session ID (using Date.now() + random - NO CRYPTO)
        const sessionId = Date.now().toString(36) + Math.random().toString(36).substring(2);

        // Create session
        req.session.userId = user._id.toString();
        req.session.email = user.email;
        req.session.role = user.role;
        req.session.isLoggedIn = true;
        req.session.sessionId = sessionId;
        req.session.loginTime = new Date().toISOString();

        // Update user login info
        user.lastLogin = new Date();
        user.loginCount = (user.loginCount || 0) + 1;
        user.activeLevel = user.loginCount > 10 ? 'High' : user.loginCount > 5 ? 'Medium' : 'Low';

        // Initialize arrays if they don't exist
        if (!user.loginHistory) user.loginHistory = [];
        if (!user.activityLog) user.activityLog = [];

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
            details: { method: 'email', remember: !!remember },
            timestamp: new Date()
        });

        await user.save();

        // Set session cookie duration based on remember me
        if (remember) {
            req.session.cookie.maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
        }

        // ✅ ROLE-BASED REDIRECT - FIXED
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

// ========== LOGOUT ROUTE ==========
router.get('/logout', isAuthenticated, async (req, res) => {
    try {
        const user = await auth.findById(req.session.userId);
        if (user) {
            // Find and update the current session logout time
            if (user.loginHistory && Array.isArray(user.loginHistory)) {
                const sessionIndex = user.loginHistory.findIndex(
                    session => session.sessionId === req.session.sessionId && !session.logoutTime
                );
                
                if (sessionIndex !== -1) {
                    const logoutTime = new Date();
                    user.loginHistory[sessionIndex].logoutTime = logoutTime;
                    
                    if (user.loginHistory[sessionIndex].loginTime) {
                        user.loginHistory[sessionIndex].duration = 
                            (logoutTime - new Date(user.loginHistory[sessionIndex].loginTime)) / 1000;
                    }
                    
                    user.currentSessionId = null;
                    
                    // Log activity
                    if (!user.activityLog) user.activityLog = [];
                    user.activityLog.push({
                        action: 'logout',
                        ipAddress: req.ip,
                        userAgent: req.get('User-Agent'),
                        timestamp: new Date()
                    });

                    await user.save();
                }
            }
        }

        // Destroy session
        req.session.destroy((err) => {
            if (err) {
                console.error('Session destruction error:', err);
                return res.redirect('/login?message=Logout error&messageType=error');
            }
            res.clearCookie('connect.sid'); // Clear session cookie
            res.redirect('/login?message=Logged out successfully&messageType=success');
        });

    } catch (error) {
        console.error('Logout error:', error);
        req.session.destroy(() => {
            res.clearCookie('connect.sid');
            res.redirect('/login?message=Logout error&messageType=error');
        });
    }
});

// ========== PROFILE ROUTE ==========
router.get('/profile', isAuthenticated, async (req, res) => {
    try {
        const user = await auth.findById(req.session.userId);
        if (!user) {
            req.session.destroy();
            return res.redirect('/login?message=User not found&messageType=error');
        }

        res.render('profile', {
            activeTab: 'profile',
            user: user,
            isLoggedIn: true
        });
    } catch (error) {
        console.error('Profile error:', error);
        res.redirect('/dashboard?message=Error loading profile&messageType=error');
    }
});

// ========== CHATS ROUTE ==========
router.get('/chats', isAuthenticated, async (req, res) => {
    try {
        const user = await auth.findById(req.session.userId);
        if (!user) {
            req.session.destroy();
            return res.redirect('/login?message=User not found&messageType=error');
        }

        res.render('Chats/newChats', {
            activeTab: 'chats',
            user: user,
            isLoggedIn: true
        });
    } catch (error) {
        console.error('Chats error:', error);
        res.redirect('/dashboard?message=Error loading chats&messageType=error');
    }
});

// ========== OTHER ROUTES ==========
router.get('/addnewfeature', isAuthenticated, (req, res) => {
    res.render('AddNewFeature.ejs', {
        user: req.user,
        isLoggedIn: true
    });
});

router.get('/add-new-feature', isAuthenticated, (req, res) => {
    res.render('AddNewFeatureForm.ejs', {
        user: req.user,
        isLoggedIn: true
    });
});

router.get('/role-permissions', isAuthenticated, (req, res) => {
    res.render('RolePermissions.ejs', {
        user: req.user,
        isLoggedIn: true
    });
});


router.get('/settings/user-logs',(req,res)=>{
    res.render("Settings/UserLogs.ejs")
})

router.get('/reports/web', isAuthenticated, async (req, res) => {
    try {
        const user = await auth.findById(req.session.userId);

        if (!user) {
            req.session.destroy();
            return res.redirect('/login?message=User not found&messageType=error');
        }

        res.render('WebReport', {   // .ejs likhne ki zarurat nahi hoti
            activeTab: 'reports',
            user: user,
            isLoggedIn: true
        });

    } catch (error) {
        console.error('Web Report error:', error);
        res.redirect('/dashboard?message=Error loading report&messageType=error');
    }
});

module.exports = router;