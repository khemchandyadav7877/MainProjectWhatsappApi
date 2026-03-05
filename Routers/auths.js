const router = require('express').Router();
const auth = require('../models/auth');
const yearTable = require('../models/yearsession');

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
                res.locals.user = user;
                res.locals.isLoggedIn = true;
                req.user = user;
            } else {
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

// ========== HOME PAGE ==========
router.get('/', async (req, res) => {
    try {
        if (req.session.isLoggedIn && req.session.userId) {
            const user = await auth.findById(req.session.userId);
            if (!user) {
                req.session.destroy();
                return res.render('HeaderManagement/Header.ejs', { 
                    user: null,
                    isLoggedIn: false,
                    activeSession: req.activeSession
                });
            }
            if (user.role === 'user') {
                return res.render('HeaderManagement/Header.ejs', { 
                    user: user,
                    isLoggedIn: true,
                    activeSession: req.activeSession
                });
            } else {
                return res.redirect('/dashboard');
            }
        }
        res.render('HeaderManagement/Header.ejs', { 
            user: null,
            isLoggedIn: false,
            activeSession: req.activeSession
        });
    } catch (error) {
        console.error('Home page error:', error);
        res.render('HeaderManagement/Header.ejs', { 
            user: null,
            isLoggedIn: false,
            activeSession: req.activeSession
        });
    }
});

// ========== LOGIN PAGE ==========
router.get('/login', async (req, res) => {
    if (req.session.isLoggedIn && req.session.userId) {
        try {
            const user = await auth.findById(req.session.userId);
            if (user) {
                if (user.role === 'user') {
                    return res.redirect('/');
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
    
    // Get active session
    const activeSession = await yearTable.findOne({ status: 'Active' });
    
    res.render('HeaderManagement/Login.ejs', { 
        message: message || null, 
        messageType: messageType || null,
        user: null,
        isLoggedIn: false,
        activeSession: activeSession,
        remember: req.cookies?.remember || false
    });
});

// ========== DASHBOARD ==========
router.get('/dashboard', isAuthenticated, async (req, res) => {
    try {
        const user = await auth.findById(req.session.userId);
        if (!user) {
            req.session.destroy();
            return res.redirect('/login?message=User not found&messageType=error');
        }
        
        // Check if user's session year matches active year
        const activeSession = await yearTable.findOne({ status: 'Active' });
        if (activeSession && user.currentSessionYear) {
            if (user.currentSessionYear.toString() !== activeSession._id.toString()) {
                req.session.destroy();
                return res.redirect('/login?message=Session expired due to year change&messageType=error');
            }
        }
        
        if (user.role === 'user') {
            return res.redirect('/');
        }
        
        res.render('dashboard', { 
            user: user,
            role: user.role,
            activeTab: 'dashboard',
            isLoggedIn: true,
            activeSession: activeSession
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.redirect('/login?message=Server error&messageType=error');
    }
});

// ========== LOGIN POST ROUTE - WITH REMEMBER ME & SESSION YEAR ==========
router.post('/login', async (req, res) => {
    try {
        const { email, password, remember } = req.body;

        if (!email || !password) {
            return res.redirect('/login?message=Email and password are required&messageType=error');
        }

        // Find user
        const user = await auth.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.redirect('/login?message=Invalid email or password&messageType=error');
        }
        
        // Check password (plain text - consider using bcrypt)
        if (user.password !== password) {
            return res.redirect('/login?message=Invalid email or password&messageType=error');
        }
        
        // Check account status
        if (user.status !== 'Active' || user.activeStatus !== 'Active') {
            return res.redirect('/login?message=Account is inactive. Please contact support.&messageType=error');
        }

        // Get active session year
        const activeSession = await yearTable.findOne({ status: 'Active' });
        if (!activeSession) {
            return res.redirect('/login?message=No active session found. Please contact admin.&messageType=error');
        }

        // Generate session ID
        const sessionId = Date.now().toString(36) + Math.random().toString(36).substring(2);

        // Set session data
        req.session.userId = user._id.toString();
        req.session.email = user.email;
        req.session.role = user.role;
        req.session.isLoggedIn = true;
        req.session.sessionId = sessionId;
        req.session.loginTime = new Date().toISOString();
        req.session.sessionYear = activeSession._id.toString();
        req.session.sessionYearName = activeSession.sessionna;
        req.session.rememberMe = remember === 'on';

        // Update user record
        user.lastLogin = new Date();
        user.loginCount = (user.loginCount || 0) + 1;
        user.currentSessionYear = activeSession._id;
        user.currentSessionId = sessionId;
        user.activeLevel = user.loginCount > 10 ? 'High' : user.loginCount > 5 ? 'Medium' : 'Low';

        // Initialize loginHistory if not exists
        if (!user.loginHistory) user.loginHistory = [];

        // Add to login history
        user.loginHistory.push({
            loginTime: new Date(),
            sessionId: sessionId,
            sessionYear: activeSession._id,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            rememberMe: remember === 'on'
        });

        await user.save();

        // Set cookie maxAge based on Remember Me
        if (remember === 'on') {
            req.session.cookie.maxAge = 365 * 24 * 60 * 60 * 1000; // 1 year
            console.log('✅ Remember Me enabled - Session set for 1 year');
        } else {
            req.session.cookie.maxAge = 24 * 60 * 60 * 1000; // 24 hours
            console.log('ℹ️ Remember Me disabled - Session set for 24 hours');
        }

        // Save session explicitly
        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                return res.redirect('/login?message=Error creating session&messageType=error');
            }
            
            // Redirect based on role
            if (user.role === 'user') {
                return res.redirect('/');
            } else {
                return res.redirect('/dashboard');
            }
        });

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
            if (user.loginHistory && Array.isArray(user.loginHistory)) {
                const sessionIndex = user.loginHistory.findIndex(
                    session => session.sessionId === req.session.sessionId && !session.logoutTime
                );
                
                if (sessionIndex !== -1) {
                    const logoutTime = new Date();
                    user.loginHistory[sessionIndex].logoutTime = logoutTime;
                    
                    if (user.loginHistory[sessionIndex].loginTime) {
                        const loginTime = new Date(user.loginHistory[sessionIndex].loginTime);
                        user.loginHistory[sessionIndex].duration = (logoutTime - loginTime) / 1000;
                    }
                    
                    user.currentSessionId = null;
                    user.currentSessionYear = null;
                    
                    // Mark modified to ensure changes are saved
                    user.markModified('loginHistory');
                    await user.save();
                }
            }
        }

        req.session.destroy((err) => {
            if (err) {
                console.error('Session destruction error:', err);
            }
            res.clearCookie('whatsapp.sid');
            res.redirect('/login?message=Logged out successfully&messageType=success');
        });

    } catch (error) {
        console.error('Logout error:', error);
        req.session.destroy(() => {
            res.clearCookie('whatsapp.sid');
            res.redirect('/login?message=Logout error&messageType=error');
        });
    }
});

// ========== CHECK SESSION ROUTE ==========
router.get('/check-session', async (req, res) => {
    try {
        const activeSession = await yearTable.findOne({ status: 'Active' });
        
        res.json({
            isLoggedIn: req.session.isLoggedIn || false,
            userId: req.session.userId || null,
            sessionYear: req.session.sessionYear || null,
            activeSession: activeSession ? {
                id: activeSession._id,
                name: activeSession.sessionna
            } : null,
            rememberMe: req.session.rememberMe || false,
            cookieMaxAge: req.session.cookie?.maxAge || null
        });
    } catch (error) {
        res.json({ error: error.message });
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
        
        const activeSession = await yearTable.findOne({ status: 'Active' });
        
        res.render('profile', {
            activeTab: 'profile',
            user: user,
            isLoggedIn: true,
            activeSession: activeSession
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
        
        const activeSession = await yearTable.findOne({ status: 'Active' });
        
        res.render('Chats/newChats', {
            activeTab: 'chats',
            user: user,
            isLoggedIn: true,
            activeSession: activeSession
        });
    } catch (error) {
        console.error('Chats error:', error);
        res.redirect('/dashboard?message=Error loading chats&messageType=error');
    }
});

// ========== ADD NEW FEATURE ROUTES ==========
router.get('/addnewfeature', isAuthenticated, (req, res) => {
    res.render('AddNewFeature.ejs', {
        user: req.user,
        isLoggedIn: true,
        activeSession: req.activeSession
    });
});

router.get('/add-new-feature', isAuthenticated, (req, res) => {
    res.render('AddNewFeatureForm.ejs', {
        user: req.user,
        isLoggedIn: true,
        activeSession: req.activeSession
    });
});

// ========== ROLE PERMISSIONS ROUTE ==========
router.get('/role-permissions', isAuthenticated, (req, res) => {
    res.render('RolePermissions.ejs', {
        user: req.user,
        isLoggedIn: true,
        activeSession: req.activeSession
    });
});

// ========== REPORTS ROUTE ==========
router.get('/reports/web', isAuthenticated, async (req, res) => {
    try {
        const user = await auth.findById(req.session.userId);
        if (!user) {
            req.session.destroy();
            return res.redirect('/login?message=User not found&messageType=error');
        }
        
        const activeSession = await yearTable.findOne({ status: 'Active' });
        
        res.render('WebReport', {
            activeTab: 'reports',
            user: user,
            isLoggedIn: true,
            activeSession: activeSession
        });
    } catch (error) {
        console.error('Web Report error:', error);
        res.redirect('/dashboard?message=Error loading report&messageType=error');
    }
});

// ========== USER LOGS ROUTE ==========
router.get('/settings/user-logs', isAuthenticated, async (req, res) => {
    try {
        const user = await auth.findById(req.session.userId);
        if (!user) {
            req.session.destroy();
            return res.redirect('/login?message=User not found&messageType=error');
        }

        const users = await auth.find({}, 'firstName lastName email role').lean();
        const allUsers = await auth.find({
            $or: [ { 'loginHistory.0': { $exists: true } } ]
        }).lean();

        let logs = [];
        allUsers.forEach(user => {
            if (user.loginHistory && user.loginHistory.length > 0) {
                user.loginHistory.forEach(session => {
                    const action = session.logoutTime ? 'logout' : 'login';
                    logs.push({
                        userId: user._id ? user._id.toString() : '',
                        userName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown',
                        email: user.email || '',
                        role: user.role || 'User',
                        action: action,
                        timestamp: session.loginTime || new Date(),
                        logoutTime: session.logoutTime || null,
                        ipAddress: session.ipAddress || 'Unknown',
                        userAgent: session.userAgent || 'Unknown',
                        sessionId: session.sessionId || '',
                        sessionYear: session.sessionYear || null,
                        rememberMe: session.rememberMe ? 'Yes' : 'No',
                        duration: session.duration,
                        status: session.logoutTime ? 'completed' : 'active'
                    });
                });
            }
        });

        logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        const roleCounts = {
            SuperAdmin: users.filter(u => u.role === 'SuperAdmin').length,
            Educator: users.filter(u => u.role === 'Educator').length,
            Trainer: users.filter(u => u.role === 'Trainer').length,
            Student: users.filter(u => u.role === 'Student').length
        };

        const totalLogins = logs.filter(l => l.action === 'login').length;
        const totalLogouts = logs.filter(l => l.action === 'logout').length;
        const activeNow = logs.filter(l => l.status === 'active').length;

        const sessionsWithDuration = logs.filter(l => l.duration && typeof l.duration === 'number');
        let avgDuration = 0;
        if (sessionsWithDuration.length > 0) {
            const totalDuration = sessionsWithDuration.reduce((sum, l) => sum + l.duration, 0);
            avgDuration = Math.round(totalDuration / sessionsWithDuration.length);
        }
        const avgSessionTime = avgDuration > 0 
            ? `${Math.floor(avgDuration / 60)}m ${avgDuration % 60}s` 
            : 'N/A';

        // Peak hour calculation
        const hourCounts = {};
        logs.forEach(log => {
            try {
                const hour = new Date(log.timestamp).getHours();
                hourCounts[hour] = (hourCounts[hour] || 0) + 1;
            } catch (e) {}
        });
        let peakHour = '10:00 AM';
        let maxCount = 0;
        Object.entries(hourCounts).forEach(([hour, count]) => {
            if (count > maxCount) {
                maxCount = count;
                const hourNum = parseInt(hour);
                peakHour = hourNum === 0 ? '12:00 AM' : 
                          hourNum < 12 ? `${hourNum}:00 AM` : 
                          hourNum === 12 ? '12:00 PM' : 
                          `${hourNum - 12}:00 PM`;
            }
        });

        // Chart data
        const last7Days = [];
        const loginCounts = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            last7Days.push(dateStr);
            const count = logs.filter(log => {
                try {
                    const logDate = new Date(log.timestamp).toISOString().split('T')[0];
                    return logDate === dateStr && log.action === 'login';
                } catch (e) {
                    return false;
                }
            }).length;
            loginCounts.push(count);
        }
        const chartData = {
            loginActivity: last7Days.map((date, index) => ({
                date,
                count: loginCounts[index] || 0
            }))
        };

        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const defaultDateTo = today.toISOString().split('T')[0];
        const defaultDateFrom = thirtyDaysAgo.toISOString().split('T')[0];

        const activeSession = await yearTable.findOne({ status: 'Active' });

        res.render("Settings/UserLogs", {
            user: user || {},
            isLoggedIn: true,
            activeTab: 'settings',
            users: users || [],
            logs: logs || [],
            totalUsers: users ? users.length : 0,
            totalLogs: logs ? logs.length : 0,
            roleCounts: roleCounts || { SuperAdmin: 0, Educator: 0, Trainer: 0, Student: 0 },
            summary: {
                totalSessions: logs ? logs.length : 0,
                totalLogins: totalLogins || 0,
                totalLogouts: totalLogouts || 0,
                activeNow: activeNow || 0,
                avgSessionTime: avgSessionTime || 'N/A',
                avgDuration: avgSessionTime || 'N/A',
                peakHour: peakHour || 'N/A'
            },
            chartData: chartData || { loginActivity: [] },
            defaultDateFrom: defaultDateFrom || '',
            defaultDateTo: defaultDateTo || '',
            serverDefaultDateFrom: defaultDateFrom || '',
            serverDefaultDateTo: defaultDateTo || '',
            activeSession: activeSession
        });

    } catch (error) {
        console.error('❌ User logs error:', error);
        res.render("Settings/UserLogs", {
            user: req.user || {},
            isLoggedIn: true,
            activeTab: 'settings',
            users: [],
            logs: [],
            totalUsers: 0,
            totalLogs: 0,
            roleCounts: { SuperAdmin: 0, Educator: 0, Trainer: 0, Student: 0 },
            summary: {
                totalSessions: 0,
                totalLogins: 0,
                totalLogouts: 0,
                activeNow: 0,
                avgSessionTime: 'N/A',
                avgDuration: 'N/A',
                peakHour: 'N/A'
            },
            chartData: { loginActivity: [] },
            defaultDateFrom: new Date().toISOString().split('T')[0],
            defaultDateTo: new Date().toISOString().split('T')[0],
            serverDefaultDateFrom: new Date().toISOString().split('T')[0],
            serverDefaultDateTo: new Date().toISOString().split('T')[0],
            activeSession: req.activeSession
        });
    }
});

module.exports = router;