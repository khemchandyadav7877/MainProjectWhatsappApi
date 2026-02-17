// ============================================
// Routers/sidebarRouter.js - SIMPLIFIED
// ============================================

const express = require('express');
const router = express.Router();
const Feature = require('../models/Feature');

// ✅ SIDEBAR DATA API
router.get('/api/sidebar-data', async (req, res) => {
    try {
        if (!req.session?.user) {
            return res.json({ 
                features: [], 
                staticMenu: [],
                user: null 
            });
        }

        const userRole = req.session.user.role;
        
        // FEATURES DIRECTLY FROM DATABASE
        const features = await Feature.find({ 
            role: userRole,
            isActive: true 
        }).sort({ section: 1, order: 1 });

        // Static menu - SIRF DASHBOARD
        const staticMenu = [
            {
                id: 'dashboard',
                title: 'Dashboard',
                icon: 'FaThLarge',
                path: '/dashboard'
            }
        ];

        console.log(`✅ Sidebar: ${features.length} features for ${userRole}`);
        
        res.json({
            features,
            staticMenu,
            user: req.session.user
        });

    } catch (error) {
        console.error('❌ Error in sidebar-data:', error);
        res.status(500).json({ 
            error: 'Failed to load sidebar data',
            features: [],
            staticMenu: []
        });
    }
});

module.exports = router;