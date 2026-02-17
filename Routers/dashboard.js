const express = require('express');
const router = express.Router();
const path = require('path');

// Dashboard home
router.get('/dashboard', (req, res) => {
    res.render('dashboard/index', {
        title: 'Dashboard',
        user: req.session.user
    });
});

// All dashboard routes - UPDATED with new sections and features
const dashboardRoutes = {
    // ===== NEW SECTIONS =====
    
    // Dashboard
    '1. Dashboard': '/dashboard',
    '2. Notifications': '/dashboard/notifications',
    
    // Reports
    '1. Web Report': '/dashboard/reports/web',
    '2. API Reports': '/dashboard/reports/api',
    
    // Chats
    '1. New Chat': '/dashboard/chats/new',
    
    // Virtual Numbers
    '1. My Numbers': '/dashboard/virtual-numbers',
    '2. Buy Number': '/dashboard/virtual-numbers/buy',
    '3. Call Logs': '/dashboard/virtual-numbers/call-logs',
    '4. SMS Logs': '/dashboard/virtual-numbers/sms-logs',
    
    // Devices
    '1. Add Device': '/dashboard/devices/add',
    '2. All Devices': '/dashboard/devices',
    '3. Campaign': '/dashboard/devices/campaign',
    
    // RCS
    '1. RCS Campaign': '/dashboard/rcs/campaign',
    '2. RCS Reports': '/dashboard/rcs/reports',
    '3. RCS Templates': '/dashboard/rcs/templates',
    
    // Scan device
    '1. Whatsapp Scan': '/dashboard/WhatsappScan',
    
    // API
    '1. API Document': '/dashboard/api/document',
    '2. File Upload': '/dashboard/api/file-upload',
    
    // Administration
    '1. Role Permissions': '/dashboard/role-permissions',
    '2. Add New Feature': '/dashboard/add-feature',
};

// Generate all dashboard routes dynamically
Object.values(dashboardRoutes).forEach(route => {
    router.get(route, (req, res) => {
        const pageName = route.split('/').pop();
        
        // Special handling for nested routes
        let viewPath = `dashboard/${pageName}`;
        
        // Handle routes with multiple segments
        if (route.includes('/poll/')) {
            const parts = route.split('/');
            const lastPart = parts[parts.length - 1];
            viewPath = `dashboard/poll/${lastPart}`;
        } else if (route.includes('/reports/')) {
            const parts = route.split('/');
            const lastPart = parts[parts.length - 1];
            viewPath = `dashboard/reports/${lastPart}`;
        } else if (route.includes('/virtual-numbers/')) {
            const parts = route.split('/');
            const lastPart = parts[parts.length - 1];
            viewPath = `dashboard/virtual-numbers/${lastPart}`;
        } else if (route.includes('/devices/')) {
            const parts = route.split('/');
            const lastPart = parts[parts.length - 1];
            viewPath = `dashboard/devices/${lastPart}`;
        } else if (route.includes('/rcs/')) {
            const parts = route.split('/');
            const lastPart = parts[parts.length - 1];
            viewPath = `dashboard/rcs/${lastPart}`;
        } else if (route.includes('/WhatsappScan')) {
            viewPath = 'WhatsappScane';
        } else if (route.includes('/api/')) {
            const parts = route.split('/');
            const lastPart = parts[parts.length - 1];
            viewPath = `dashboard/api/${lastPart}`;
        } else if (route.includes('/chats/')) {
            const parts = route.split('/');
            const lastPart = parts[parts.length - 1];
            viewPath = `dashboard/chats/${lastPart}`;
        }
        
        res.render(viewPath, {
            title: pageName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            user: req.session.user
        });
    });
});

module.exports = router;