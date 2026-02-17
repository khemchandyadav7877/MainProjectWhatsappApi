const express = require('express');
const router = express.Router();
const Feature = require('../models/Feature');

// ============================================
// MIDDLEWARE - SuperAdmin Only
// ============================================
const isSuperAdmin = (req, res, next) => {
    if (!req.session?.user) {
        return res.status(401).json({ 
            success: false, 
            error: 'Not authenticated' 
        });
    }
    if (req.session.user.role !== 'SuperAdmin') {
        return res.status(403).json({ 
            success: false, 
            error: 'SuperAdmin access required' 
        });
    }
    next();
};

// ============================================
// GET - All features (for Role Permissions page)
// ============================================
router.get('/api/features/all', isSuperAdmin, async (req, res) => {
    try {
        const features = await Feature.find()
            .sort({ role: 1, section: 1, order: 1 })
            .lean();
        
        console.log(`📊 Role Permissions: Sending ${features.length} features`);
        
        res.json({
            success: true,
            features,
            count: features.length
        });
    } catch (error) {
        console.error('❌ Error fetching features:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// ============================================
// GET - Features by role (for Add New Feature page)
// ============================================
router.get('/api/features/by-role/:role', isSuperAdmin, async (req, res) => {
    try {
        const { role } = req.params;
        const features = await Feature.find({ role })
            .sort({ section: 1, order: 1 })
            .lean();
        
        // Group by section
        const grouped = {};
        features.forEach(f => {
            if (!grouped[f.section]) grouped[f.section] = [];
            grouped[f.section].push(f);
        });
        
        res.json({
            success: true,
            role,
            features,
            grouped,
            count: features.length
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// GET - Available sections and labels (for Add New Feature)
// ============================================
router.get('/api/features/available/:role/:section', isSuperAdmin, async (req, res) => {
    try {
        const { role, section } = req.params;
        
        // All possible features for this section
        const allFeatureLabels = {
            '*** Dashboard': ['1. Dashboard', '2. Notifications'],
            '*** Administration': ['1. Role Permissions', '2. Add New Feature'],
            '*** Users Management': ['1. All Users', '2. Active Users', '3. Inactive Users', '4. Pending Approval'],
            '*** AI Tools': ['1. AI Writer', '2. Lesson Planner', '3. Quiz Maker', '4. Assignment Checker', '5. Video Generator', '6. Transcription'],
            '*** Courses': ['1. All Courses', '2. Add Course', '3. Web Development', '4. UI/UX Design', '5. App Development', '6. Achievements', '7. Add Achievement'],
            '*** Popular Courses': ['1. View Popular Courses', '2. Add Popular Courses'],
            '*** Latest Courses': ['1. View Latest Courses', '2. Add Latest Courses'],
            '*** Testimonials': ['1. View Testimonials', '2. Add Testimonial'],
            '*** Image Slider': ['1. View Slider Images', '2. Add Slider'],
            '*** Live Classes': ['1. View Live Classes', '2. Add Live Class'],
            '*** Payments': ['1. Earnings', '2. Transaction History', '3. Withdraw', '4. Payment Settings'],
            '*** Blog': ['1. View Blog', '2. Add Blog Post'],
            '*** Communication': ['1. User Queries'],
            '*** FAQ': ['1. View FAQ', '2. Add FAQ'],
            '*** Settings': ['1. My Profile', '2. General Settings', '3. Reset Password'],
            '*** Poll Management': ['1. Create Poll', '2. All Polls', '3. Active Polls', '4. Closed Polls', '5. Poll Results', '6. Poll Analytics', '7. Poll Settings']
        };
        
        // Get existing features for this role and section
        const existing = await Feature.find({ role, section })
            .select('label')
            .lean();
        
        const existingLabels = existing.map(f => f.label);
        
        // Filter available labels
        const available = (allFeatureLabels[section] || []).filter(
            label => !existingLabels.includes(label)
        );
        
        res.json({
            success: true,
            section,
            role,
            available,
            existing: existingLabels,
            count: available.length
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// POST - Add new feature
// ============================================
router.post('/api/features/add', isSuperAdmin, async (req, res) => {
    try {
        const { section, label, role, order, icon, path } = req.body;
        
        // Validation
        if (!section || !label || !role) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields' 
            });
        }
        
        // Check if already exists
        const exists = await Feature.findOne({ section, label, role });
        if (exists) {
            return res.status(400).json({ 
                success: false, 
                error: 'Feature already exists for this role and section' 
            });
        }
        
        // Generate path if not provided
        let featurePath = path;
        if (!featurePath) {
            featurePath = '/' + label.toLowerCase()
                .replace(/^\d+\.\s*/, '')
                .replace(/\s+/g, '-')
                .replace(/[^a-z0-9-]/g, '');
        }
        
        // Create new feature
        const newFeature = new Feature({
            section: section.startsWith('***') ? section : `*** ${section}`,
            label,
            path: featurePath,
            role,
            order: parseInt(order) || 999,
            icon: icon || 'FaUserCircle',
            isActive: true,
            createdBy: req.session.user._id
        });
        
        await newFeature.save();
        
        console.log(`✅ FEATURE ADDED: ${label} for ${role}`);
        
        // Broadcast update
        if (req.app.get('io')) {
            req.app.get('io').emit('features-updated');
        }
        
        res.json({
            success: true,
            feature: newFeature,
            message: 'Feature added successfully'
        });
        
    } catch (error) {
        // Handle duplicate key error
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                error: 'This feature already exists for this role and section'
            });
        }
        
        console.error('❌ Error adding feature:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// ============================================
// PUT - Toggle feature status
// ============================================
router.put('/api/features/toggle/:id', isSuperAdmin, async (req, res) => {
    try {
        const feature = await Feature.findById(req.params.id);
        
        if (!feature) {
            return res.status(404).json({ 
                success: false, 
                error: 'Feature not found' 
            });
        }
        
        feature.isActive = !feature.isActive;
        feature.updatedAt = new Date();
        await feature.save();
        
        console.log(`🔄 FEATURE TOGGLED: ${feature.label} -> ${feature.isActive ? 'ACTIVE' : 'INACTIVE'}`);
        
        // Broadcast update
        if (req.app.get('io')) {
            req.app.get('io').emit('features-updated');
        }
        
        res.json({
            success: true,
            isActive: feature.isActive,
            feature
        });
        
    } catch (error) {
        console.error('❌ Error toggling feature:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// DELETE - Delete feature
// ============================================
router.delete('/api/features/delete/:id', isSuperAdmin, async (req, res) => {
    try {
        const feature = await Feature.findByIdAndDelete(req.params.id);
        
        if (!feature) {
            return res.status(404).json({ 
                success: false, 
                error: 'Feature not found' 
            });
        }
        
        console.log(`🗑️ FEATURE DELETED: ${feature.label} for ${feature.role}`);
        
        // Broadcast update
        if (req.app.get('io')) {
            req.app.get('io').emit('features-updated');
        }
        
        res.json({
            success: true,
            message: 'Feature deleted successfully',
            deleted: feature
        });
        
    } catch (error) {
        console.error('❌ Error deleting feature:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// PUT - Update feature order
// ============================================
router.put('/api/features/reorder', isSuperAdmin, async (req, res) => {
    try {
        const { updates } = req.body; // [{ id, order }]
        
        if (!updates || !Array.isArray(updates)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid updates format' 
            });
        }
        
        const operations = updates.map(({ id, order }) => ({
            updateOne: {
                filter: { _id: id },
                update: { $set: { order, updatedAt: new Date() } }
            }
        }));
        
        await Feature.bulkWrite(operations);
        
        console.log(`🔄 FEATURES REORDERED: ${updates.length} items updated`);
        
        // Broadcast update
        if (req.app.get('io')) {
            req.app.get('io').emit('features-updated');
        }
        
        res.json({
            success: true,
            message: 'Features reordered successfully',
            count: updates.length
        });
        
    } catch (error) {
        console.error('❌ Error reordering features:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// POST - Bulk delete
// ============================================
router.post('/api/features/bulk-delete', isSuperAdmin, async (req, res) => {
    try {
        const { ids } = req.body;
        
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'No feature IDs provided' 
            });
        }
        
        const result = await Feature.deleteMany({ _id: { $in: ids } });
        
        console.log(`🗑️ BULK DELETE: ${result.deletedCount} features removed`);
        
        // Broadcast update
        if (req.app.get('io')) {
            req.app.get('io').emit('features-updated');
        }
        
        res.json({
            success: true,
            deletedCount: result.deletedCount,
            message: `${result.deletedCount} features deleted successfully`
        });
        
    } catch (error) {
        console.error('❌ Error bulk deleting features:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// PUT - Bulk status update
// ============================================
router.put('/api/features/bulk-status', isSuperAdmin, async (req, res) => {
    try {
        const { ids, isActive } = req.body;
        
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'No feature IDs provided' 
            });
        }
        
        const result = await Feature.updateMany(
            { _id: { $in: ids } },
            { $set: { isActive, updatedAt: new Date() } }
        );
        
        console.log(`🔄 BULK STATUS: ${result.modifiedCount} features set to ${isActive ? 'ACTIVE' : 'INACTIVE'}`);
        
        // Broadcast update
        if (req.app.get('io')) {
            req.app.get('io').emit('features-updated');
        }
        
        res.json({
            success: true,
            modifiedCount: result.modifiedCount,
            message: `${result.modifiedCount} features updated`
        });
        
    } catch (error) {
        console.error('❌ Error bulk updating features:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// GET - Sidebar features (for any role)
// ============================================
router.get('/api/sidebar-features', async (req, res) => {
    try {
        // Not logged in
        if (!req.session?.user) {
            return res.json({ 
                success: true, 
                features: [] 
            });
        }
        
        const userRole = req.session.user.role;
        
        // Get active features for this role
        let features = await Feature.find({ 
            role: userRole,
            isActive: true 
        })
        .sort({ section: 1, order: 1 })
        .lean();
        
        // SUPERADMIN SPECIAL: Agar koi feature nahi hai to create default
        if (userRole === 'SuperAdmin' && features.length === 0) {
            console.log('⚠️ No SuperAdmin features found, creating defaults...');
            
            const defaultFeatures = [
                {
                    section: '*** Administration',
                    label: '1. Role Permissions',
                    path: '/role-permissions',
                    role: 'SuperAdmin',
                    order: 1,
                    icon: 'FaShieldAlt',
                    isActive: true,
                    createdBy: req.session.user._id
                },
                {
                    section: '*** Administration',
                    label: '2. Add New Feature',
                    path: '/add-new-feature',
                    role: 'SuperAdmin',
                    order: 2,
                    icon: 'FaPlus',
                    isActive: true,
                    createdBy: req.session.user._id
                },
                {
                    section: '*** Dashboard',
                    label: '1. Dashboard',
                    path: '/dashboard',
                    role: 'SuperAdmin',
                    order: 1,
                    icon: 'FaThLarge',
                    isActive: true,
                    createdBy: req.session.user._id
                }
            ];
            
            const created = await Feature.insertMany(defaultFeatures);
            features = created;
            console.log(`✅ Created ${created.length} default features for SuperAdmin`);
        }
        
        console.log(`📱 Sidebar: Sending ${features.length} features for ${userRole}`);
        
        res.json({
            success: true,
            role: userRole,
            features,
            count: features.length
        });
        
    } catch (error) {
        console.error('❌ Error in sidebar-features:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message,
            features: [] 
        });
    }
});

module.exports = router;