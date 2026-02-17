// const jwt = require('jsonwebtoken');
// const User = require('../models/User');

// const auth = async (req, res, next) => {
//     try {
//         const token = req.header('Authorization')?.replace('Bearer ', '');
        
//         if (!token) {
//             return res.status(401).json({ 
//                 success: false, 
//                 message: 'Authentication required' 
//             });
//         }
        
//         const decoded = jwt.verify(token, process.env.JWT_SECRET);
//         const user = await User.findOne({ 
//             _id: decoded.userId, 
//             status: 'active' 
//         });
        
//         if (!user) {
//             throw new Error();
//         }
        
//         // Update last active
//         user.last_active = Date.now();
//         await user.save();
        
//         req.user = user;
//         req.token = token;
//         next();
//     } catch (error) {
//         res.status(401).json({ 
//             success: false, 
//             message: 'Please authenticate' 
//         });
//     }
// };

// const isSuperAdmin = async (req, res, next) => {
//     try {
//         if (req.user.role !== 'super_admin') {
//             return res.status(403).json({ 
//                 success: false, 
//                 message: 'Super admin access required' 
//             });
//         }
//         next();
//     } catch (error) {
//         res.status(500).json({ 
//             success: false, 
//             message: 'Server error' 
//         });
//     }
// };

// const checkPermission = (permission) => {
//     return async (req, res, next) => {
//         try {
//             // Super admin has all permissions
//             if (req.user.role === 'super_admin') {
//                 return next();
//             }
            
//             // Check if user has the required permission
//             if (!req.user.permissions || !req.user.permissions[permission]) {
//                 return res.status(403).json({ 
//                     success: false, 
//                     message: `Permission denied: ${permission}` 
//                 });
//             }
            
//             next();
//         } catch (error) {
//             res.status(500).json({ 
//                 success: false, 
//                 message: 'Server error' 
//             });
//         }
//     };
// };

// // Role-based middleware
// const requireRole = (...roles) => {
//     return async (req, res, next) => {
//         try {
//             if (!roles.includes(req.user.role)) {
//                 return res.status(403).json({ 
//                     success: false, 
//                     message: `Required role: ${roles.join(' or ')}` 
//                 });
//             }
//             next();
//         } catch (error) {
//             res.status(500).json({ 
//                 success: false, 
//                 message: 'Server error' 
//             });
//         }
//     };
// };

// module.exports = { 
//     auth, 
//     isSuperAdmin, 
//     checkPermission, 
//     requireRole 
// };


// middleware/auth.js
module.exports = function(req, res, next) {
    // Agar user session mein hai to use locals mein set karo
    res.locals.user = req.session?.user || null;
    res.locals.currentPath = req.path;
    next();
};