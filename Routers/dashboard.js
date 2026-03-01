const express = require('express');
const router = express.Router();
const Device = require('../models/Device');
const Condevice = require('../models/Condevice'); // Contact model
const Campaign = require('../models/Campaign'); // Campaign model

// Dashboard data API
router.get('/api/dashboard-data', async (req, res) => {
    try {
        const user = req.session.user || req.user;
        if (!user) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        console.log('📊 Dashboard data requested by:', user.email, user.role);

        // ======================
        // DEVICES DATA (WhatsApp Devices)
        // ======================
        let devicesQuery = {};
        if (user.role !== 'SuperAdmin') {
            devicesQuery.createdBy = user._id;
        }
        
        const devices = await Device.find(devicesQuery).sort({ createdAt: -1 });
        
        const totalDevices = devices.length;
        const onlineDevices = devices.filter(d => d.connectionStatus === 'online').length;
        const pendingDevices = devices.filter(d => d.connectionStatus === 'pending').length;
        const offlineDevices = devices.filter(d => d.connectionStatus === 'offline').length;

        // ======================
        // CONTACTS DATA (Condevice)
        // ======================
        let contactsQuery = {};
        if (user.role !== 'SuperAdmin') {
            contactsQuery.createdBy = user._id;
        }
        
        const contacts = await Condevice.find(contactsQuery).sort({ createdAt: -1 });
        
        const totalContacts = contacts.length;
        const activeContacts = contacts.filter(c => c.status === 'active').length;
        const inactiveContacts = contacts.filter(c => c.status === 'inactive').length;
        const connectedContacts = contacts.filter(c => c.isConnected === true).length;

        // ======================
        // CAMPAIGN DATA
        // ======================
        let campaignsQuery = {};
        if (user.role !== 'SuperAdmin') {
            campaignsQuery.createdBy = user._id;
        }
        
        const campaigns = await (Campaign?.find(campaignsQuery).sort({ createdAt: -1 }).limit(10) || []);
        
        // Message stats
        let totalMessages = 0;
        let successfulMessages = 0;
        let failedMessages = 0;
        let todayMessages = 0;
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Message type counts
        let textCount = 0, imageCount = 0, videoCount = 0, pdfCount = 0;
        
        campaigns.forEach(c => {
            const sent = c.sentCount || 0;
            const failed = c.failedCount || 0;
            
            totalMessages += sent + failed;
            successfulMessages += sent;
            failedMessages += failed;
            
            if (new Date(c.createdAt) >= today) {
                todayMessages += sent + failed;
            }
            
            const type = c.messageType || 'text';
            const count = sent + failed;
            if (type === 'text') textCount += count;
            else if (type === 'image') imageCount += count;
            else if (type === 'video') videoCount += count;
            else if (type === 'pdf' || type === 'document') pdfCount += count;
        });
        
        const successRate = totalMessages > 0 ? Math.round((successfulMessages / totalMessages) * 100) : 0;
        const activeCampaigns = campaigns.filter(c => c.status === 'sending' || c.status === 'scheduled').length;

        // Recent campaigns for table
        const recentCampaigns = campaigns.slice(0, 3).map(c => ({
            _id: c._id,
            campaignName: c.campaignName || 'Campaign',
            messageType: c.messageType || 'text',
            status: c.status || 'completed',
            sentCount: c.sentCount || 0,
            totalContacts: c.totalContacts || 0,
            createdAt: c.createdAt
        }));

        // ======================
        // RESPONSE DATA
        // ======================
        res.json({
            success: true,
            devices: {
                total: totalDevices,
                online: onlineDevices,
                pending: pendingDevices,
                offline: offlineDevices,
                list: devices.slice(0, 3).map(d => ({
                    _id: d._id,
                    name: d.whatsappName || 'WhatsApp Device',
                    phoneNumber: d.whatsappNumber || d.phone,
                    isConnected: d.connectionStatus === 'online',
                    lastConnected: d.lastConnected || d.connectedAt
                }))
            },
            contacts: {
                total: totalContacts,
                active: activeContacts,
                inactive: inactiveContacts,
                connected: connectedContacts,
                list: contacts.slice(0, 3).map(c => ({
                    _id: c._id,
                    name: c.name,
                    phoneNumber: c.phoneNumber,
                    whatsappNumber: c.whatsappNumber,
                    email: c.email,
                    status: c.status,
                    isConnected: c.isConnected
                }))
            },
            campaigns: {
                total: campaigns.length,
                active: activeCampaigns,
                recent: recentCampaigns
            },
            messages: {
                total: totalMessages,
                successful: successfulMessages,
                failed: failedMessages,
                today: todayMessages,
                pending: activeCampaigns,
                successRate: successRate,
                failureRate: 100 - successRate,
                byType: {
                    text: textCount,
                    image: imageCount,
                    video: videoCount,
                    pdf: pdfCount
                }
            }
        });

    } catch (error) {
        console.error('Dashboard API Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;