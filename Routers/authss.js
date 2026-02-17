const express = require('express');
const router = express.Router();
const Device = require('../models/Device');
const Campaign = require('../models/Campaign');

router.get('/whatsapp-chat', async (req, res) => {
    try {
        // Get all connected devices
        const devices = await Device.find({ status: 'CONNECTED' }).sort({ createdAt: -1 });
        
        // Get scheduled campaigns (optional)
        const scheduledCampaigns = await Campaign.find({ 
            status: 'scheduled',
            scheduledAt: { $gte: new Date() }
        }).sort({ scheduledAt: 1 }).limit(5);

        res.render('Chats/whatsappChat', {
            activeTab: 'whatsapp-chat',
            devices: devices || [],
            scheduledCampaigns: scheduledCampaigns || [],
            user: req.session.user || req.user || {
                role: 'SuperAdmin',
                firstName: 'Admin',
                lastName: 'User',
                email: 'admin@example.com'
            }
        });
    } catch (error) {
        console.error('Chat page error:', error);
        res.status(500).send('Internal server error');
    }
});

module.exports = router;