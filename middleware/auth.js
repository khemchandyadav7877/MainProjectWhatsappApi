const auth = require('../models/auth');

// Middleware to check if user is authenticated
async function isAuthenticated(req, res, next) {
    if (!req.session || !req.session.isLoggedIn || !req.session.userId) {
        // Check if it's an API request
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ 
                success: false, 
                error: 'Authentication required',
                redirect: '/login'
            });
        }
        return res.redirect('/login?message=Please login first&messageType=error');
    }

    try {
        // Verify user still exists in database
        const user = await auth.findById(req.session.userId).lean();
        if (!user) {
            req.session.destroy();
            if (req.path.startsWith('/api/')) {
                return res.status(401).json({ 
                    success: false, 
                    error: 'User not found',
                    redirect: '/login'
                });
            }
            return res.redirect('/login?message=User not found&messageType=error');
        }

        // Check if user is active
        if (user.status !== 'Active' || user.activeStatus !== 'Active') {
            req.session.destroy();
            if (req.path.startsWith('/api/')) {
                return res.status(403).json({ 
                    success: false, 
                    error: 'Account is inactive'
                });
            }
            return res.redirect('/login?message=Account is inactive&messageType=error');
        }

        // Attach user to request for easy access
        req.user = user;
        req.userId = user._id.toString();
        req.userRole = user.role;
        
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        if (req.path.startsWith('/api/')) {
            return res.status(500).json({ 
                success: false, 
                error: 'Authentication error'
            });
        }
        res.redirect('/login?message=Authentication error&messageType=error');
    }
}

// Middleware to check specific roles
function hasRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            if (req.path.startsWith('/api/')) {
                return res.status(401).json({ 
                    success: false, 
                    error: 'Authentication required'
                });
            }
            return res.redirect('/login');
        }

        if (!roles.includes(req.user.role)) {
            if (req.path.startsWith('/api/')) {
                return res.status(403).json({ 
                    success: false, 
                    error: 'Access denied. Insufficient permissions.'
                });
            }
            return res.redirect('/dashboard?message=Access denied&messageType=error');
        }
        
        next();
    };
}

// Middleware to make user available to all views
async function loadUser(req, res, next) {
    if (req.session && req.session.isLoggedIn && req.session.userId) {
        try {
            const user = await auth.findById(req.session.userId).lean();
            if (user) {
                res.locals.user = user;
                res.locals.isLoggedIn = true;
                req.user = user;
                req.userId = user._id.toString();
                req.userRole = user.role;
            } else {
                res.locals.user = null;
                res.locals.isLoggedIn = false;
            }
        } catch (error) {
            console.error('Error loading user:', error);
            res.locals.user = null;
            res.locals.isLoggedIn = false;
        }
    } else {
        res.locals.user = null;
        res.locals.isLoggedIn = false;
    }
    next();
}

module.exports = {
    isAuthenticated,
    hasRole,
    loadUser
};