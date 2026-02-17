// Routers/webRouter.js - COMPLETE FIXED VERSION
const router = require('express').Router();
const Message = require('../models/Message');
const Device = require('../models/Device');
const Campaign = require('../models/Campaign');
const path = require('path');
const fs = require('fs');

// =========================
// IMPORTANT: Message Model Schema Validation
// =========================
// Ensure Message model has proper schema for campaignId field
// If not, add this to your Message model:
/*
campaignId: {
    type: String,
    default: null,
    index: true
},
campaignName: {
    type: String,
    default: ''
}
*/

// =========================
// API ENDPOINTS
// =========================

// GET SENT MESSAGES - FIXED VERSION
router.get('/api/reports/messages', async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 10, 
            search = '',
            date = '',
            status = '',
            deviceId = '',
            campaignId = '',
            messageType = ''
        } = req.query;
        
        console.log('📊 API Query Parameters:', {
            page, limit, search, date, status, deviceId, campaignId, messageType
        });
        
        let query = { isDeleted: false };
        
        // Search filter
        if (search && search.trim() !== '') {
            query.$or = [
                { jobId: { $regex: search, $options: 'i' } },
                { message: { $regex: search, $options: 'i' } },
                { recipient: { $regex: search, $options: 'i' } },
                { whatsappNumber: { $regex: search, $options: 'i' } },
                { campaignName: { $regex: search, $options: 'i' } },
                { fileName: { $regex: search, $options: 'i' } }
            ];
        }
        
        // Date filter
        if (date && date.trim() !== '') {
            const selectedDate = new Date(date);
            const nextDay = new Date(selectedDate);
            nextDay.setDate(nextDay.getDate() + 1);
            
            query.sentTime = {
                $gte: selectedDate,
                $lt: nextDay
            };
        }
        
        // Status filter
        if (status && status.trim() !== '') {
            query.status = status;
        }
        
        // Device filter
        if (deviceId && deviceId.trim() !== '') {
            query.deviceId = deviceId;
        }
        
        // Message type filter
        if (messageType && messageType.trim() !== '') {
            query.messageType = messageType;
        }
        
        // FIXED: Campaign filter logic - IMPORTANT FIX
        if (campaignId && campaignId.trim() !== '') {
            console.log('🔍 Campaign Filter Applied:', campaignId);
            
            if (campaignId === 'campaign') {
                // Show only campaign messages (campaignId is not null/empty)
                query.campaignId = { $ne: null, $ne: '' };
                console.log('✅ Filtering: Campaign messages (campaignId is not null/empty)');
            } else if (campaignId === 'single') {
                // Show only single messages (campaignId is null/empty)
                query.$or = [
                    { campaignId: null },
                    { campaignId: '' },
                    { campaignId: { $exists: false } }
                ];
                console.log('✅ Filtering: Single messages (campaignId is null/empty)');
            } else {
                // Specific campaign ID
                query.campaignId = campaignId;
                console.log('✅ Filtering: Specific campaign:', campaignId);
            }
        } else {
            // Show ALL messages (both campaign and single) when no campaign filter
            console.log('✅ Showing ALL messages (campaign and single)');
        }
        
        console.log('🔍 Final Query:', JSON.stringify(query, null, 2));
        
        const skip = (page - 1) * limit;
        
        // Get messages with proper sorting
        const messages = await Message.find(query)
            .sort({ sentTime: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .select('-isDeleted -__v -updatedAt')
            .lean(); // Use lean() for better performance
        
        const total = await Message.countDocuments(query);
        
        console.log('📱 Found Messages:', messages.length);
        console.log('📊 Total Count:', total);
        
        // Debug: Log campaign info for all messages
        messages.forEach((msg, i) => {
            console.log(`📝 Message ${i + 1}:`, {
                _id: msg._id,
                jobId: msg.jobId,
                campaignId: msg.campaignId,
                campaignName: msg.campaignName,
                recipient: msg.recipient,
                type: msg.messageType,
                status: msg.status,
                sentTime: msg.sentTime
            });
        });
        
        // Format dates for display
        const formattedMessages = messages.map(msg => ({
            ...msg,
            sentTime: msg.sentTime ? new Date(msg.sentTime).toLocaleString('en-GB') : 'N/A',
            formattedDate: msg.sentTime ? new Date(msg.sentTime).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            }) : 'N/A'
        }));
        
        res.json({
            success: true,
            data: formattedMessages,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
        
    } catch (error) {
        console.error('❌ Get Messages Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error fetching messages',
            debug: error.message,
            stack: error.stack
        });
    }
});

// GET MESSAGE STATS
router.get('/api/reports/stats', async (req, res) => {
    try {
        // Get today's date
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        // Get all stats
        const total = await Message.countDocuments({ isDeleted: false });
        const todayCount = await Message.countDocuments({ 
            isDeleted: false,
            sentTime: { $gte: today, $lt: tomorrow }
        });
        const completed = await Message.countDocuments({ 
            isDeleted: false,
            status: 'Completed'
        });
        const pending = await Message.countDocuments({ 
            isDeleted: false,
            status: { $in: ['Pending', 'Processing'] }
        });
        
        // Get campaign stats
        const campaignMessages = await Message.countDocuments({ 
            isDeleted: false,
            campaignId: { $ne: null, $ne: '' }
        });
        
        const singleMessages = await Message.countDocuments({
            isDeleted: false,
            $or: [
                { campaignId: null },
                { campaignId: '' },
                { campaignId: { $exists: false } }
            ]
        });
        
        res.json({
            success: true,
            data: {
                total,
                today: todayCount,
                completed,
                pending,
                campaignMessages,
                singleMessages,
                todayDate: today.toISOString()
            }
        });
        
    } catch (error) {
        console.error('Stats Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error fetching statistics'
        });
    }
});

// GET ALL DEVICES FOR FILTER
router.get('/api/reports/devices', async (req, res) => {
    try {
        // Get from Device collection
        const connectedDevices = await Device.find({ 
            status: 'CONNECTED' 
        }).select('deviceId phoneNumber -_id');
        
        // Also get devices that have sent messages
        const messageDevices = await Message.aggregate([
            { $match: { 
                deviceId: { $ne: null, $ne: "" },
                isDeleted: false 
            }},
            { $group: { 
                _id: "$deviceId", 
                whatsappNumber: { $first: "$whatsappNumber" },
                messageCount: { $sum: 1 }
            }},
            { $sort: { messageCount: -1 } }
        ]);
        
        // Merge both lists
        const deviceMap = new Map();
        
        // Add connected devices
        connectedDevices.forEach(device => {
            deviceMap.set(device.deviceId, {
                deviceId: device.deviceId,
                whatsappNumber: device.phoneNumber || device.deviceId,
                messageCount: 0
            });
        });
        
        // Add message devices
        messageDevices.forEach(md => {
            if (deviceMap.has(md._id)) {
                const device = deviceMap.get(md._id);
                device.messageCount = md.messageCount;
            } else {
                deviceMap.set(md._id, {
                    deviceId: md._id,
                    whatsappNumber: md.whatsappNumber || md._id,
                    messageCount: md.messageCount
                });
            }
        });
        
        const uniqueDevices = Array.from(deviceMap.values());
        
        res.json({
            success: true,
            devices: uniqueDevices
        });
        
    } catch (error) {
        console.error('Get Devices Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error fetching devices'
        });
    }
});

// GET CAMPAIGNS FOR FILTER - FIXED VERSION
router.get('/api/reports/campaigns', async (req, res) => {
    try {
        console.log('📋 Getting campaigns for filter...');
        
        // Get campaigns with messages
        const campaigns = await Message.aggregate([
            { $match: { 
                isDeleted: false,
                $or: [
                    { campaignId: { $ne: null, $ne: "" } },
                    { campaignName: { $ne: null, $ne: "" } }
                ]
            }},
            { $group: { 
                _id: "$campaignId",
                campaignName: { 
                    $last: {
                        $cond: {
                            if: { $and: [{ $ne: ["$campaignName", ""] }, { $ne: ["$campaignName", null] }] },
                            then: "$campaignName",
                            else: { $concat: ["Campaign ", { $substr: ["$_id", 0, 8] }] }
                        }
                    }
                },
                lastMessage: { $max: "$sentTime" },
                messageCount: { $sum: 1 },
                recipients: { $addToSet: "$recipient" }
            }},
            { $match: { _id: { $ne: null } } },
            { $sort: { lastMessage: -1 } }
        ]);
        
        console.log('📋 Found campaigns:', campaigns.length);
        
        // Also get campaigns from Campaign collection
        const campaignDocs = await Campaign.find()
            .select('campaignId campaignName createdAt')
            .sort({ createdAt: -1 });
        
        // Merge both lists
        const campaignMap = new Map();
        
        // Add from messages
        campaigns.forEach(c => {
            if (c._id) {
                campaignMap.set(c._id, {
                    campaignId: c._id,
                    campaignName: c.campaignName,
                    messageCount: c.messageCount,
                    uniqueRecipients: c.recipients.length
                });
            }
        });
        
        // Add from campaign collection
        campaignDocs.forEach(c => {
            if (!campaignMap.has(c.campaignId)) {
                campaignMap.set(c.campaignId, {
                    campaignId: c.campaignId,
                    campaignName: c.campaignName || `Campaign ${c.campaignId.substring(0, 8)}`,
                    messageCount: 0,
                    uniqueRecipients: 0
                });
            }
        });
        
        const allCampaigns = Array.from(campaignMap.values());
        
        // Add "Campaign Messages" and "Single Messages" options
        const filterCampaigns = [
            {
                campaignId: 'campaign',
                campaignName: '📢 Campaign Messages',
                messageCount: await Message.countDocuments({ 
                    isDeleted: false,
                    campaignId: { $ne: null, $ne: "" }
                })
            },
            {
                campaignId: 'single',
                campaignName: '📱 Single Messages',
                messageCount: await Message.countDocuments({
                    isDeleted: false,
                    $or: [
                        { campaignId: null },
                        { campaignId: '' },
                        { campaignId: { $exists: false } }
                    ]
                })
            },
            ...allCampaigns
        ];
        
        res.json({
            success: true,
            campaigns: filterCampaigns
        });
        
    } catch (error) {
        console.error('Get Campaigns Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error fetching campaigns'
        });
    }
});

// WEB REPORT PAGE
router.get('/reports/web', async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const formattedDate = today.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });

        // devices
        const devicesResponse = await fetch(`http://${req.headers.host}/api/reports/devices`);
        const devicesData = devicesResponse.ok ? await devicesResponse.json() : { devices: [] };

        // campaigns
        const campaignsResponse = await fetch(`http://${req.headers.host}/api/reports/campaigns`);
        const campaignsData = campaignsResponse.ok ? await campaignsResponse.json() : { campaigns: [] };

        // messages
        const initialMessages = await Message.find({ isDeleted: false })
            .sort({ sentTime: -1 })
            .limit(20)
            .select('-isDeleted -__v -updatedAt')
            .lean();

        // stats
        const stats = await Message.aggregate([
            { $match: { isDeleted: false } },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    completed: {
                        $sum: { $cond: [{ $eq: ["$status", "Completed"] }, 1, 0] }
                    },
                    pending: {
                        $sum: { $cond: [{ $in: ["$status", ["Pending", "Processing"]] }, 1, 0] }
                    }
                }
            }
        ]);

        const todayStats = await Message.aggregate([
            {
                $match: {
                    isDeleted: false,
                    sentTime: { $gte: today }
                }
            },
            {
                $group: {
                    _id: null,
                    today: { $sum: 1 }
                }
            }
        ]);

        res.render('WebReport', {
            initialMessages: initialMessages.map(msg => ({
                ...msg,
                sentTime: msg.sentTime ? new Date(msg.sentTime).toLocaleString('en-GB') : 'N/A'
            })),
            date: formattedDate,
            totalMessages: stats[0]?.total || 0,
            todayMessages: todayStats[0]?.today || 0,
            completedMessages: stats[0]?.completed || 0,
            pendingMessages: stats[0]?.pending || 0,
            devices: devicesData.devices || [],
            campaigns: campaignsData.campaigns || [],
            activeTab: 'reports',

            // 🔥 add this
            user: req.session.user || req.user || {
                role: 'SuperAdmin',
                firstName: 'Admin',
                lastName: 'User',
                email: 'admin@example.com'
            }
        });

    } catch (error) {
        console.error('Web Report Error:', error);

        res.render('WebReport', {
            initialMessages: [],
            date: new Date().toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            }),
            totalMessages: 0,
            todayMessages: 0,
            completedMessages: 0,
            pendingMessages: 0,
            devices: [],
            campaigns: [],
            activeTab: 'reports',

            // 🔥 add here also (important)
            user: req.session.user || req.user || {
                role: 'SuperAdmin',
                firstName: 'Admin',
                lastName: 'User',
                email: 'admin@example.com'
            }
        });
    }
});


// Helper function for message type icons
function getMessageTypeIcon(type) {
    const icons = {
        'text': 'fa-font',
        'image': 'fa-image',
        'video': 'fa-video',
        'document': 'fa-file-alt',
        'pdf': 'fa-file-pdf',
        'audio': 'fa-music',
        'file': 'fa-file'
    };
    return icons[type] || 'fa-file';
}

// DELETE MESSAGE (SOFT DELETE)
router.delete('/api/reports/message/:id', async (req, res) => {
    try {
        const message = await Message.findById(req.params.id);
        
        if (!message) {
            return res.status(404).json({
                success: false,
                error: 'Message not found'
            });
        }
        
        // Soft delete
        message.isDeleted = true;
        await message.save();
        
        res.json({
            success: true,
            msg: 'Message deleted successfully'
        });
        
    } catch (error) {
        console.error('Delete Message Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error deleting message'
        });
    }
});

// BULK DELETE
router.post('/api/reports/bulk-delete', async (req, res) => {
    try {
        const { messageIds } = req.body;
        
        if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No message IDs provided'
            });
        }
        
        // Soft delete all messages
        await Message.updateMany(
            { _id: { $in: messageIds } },
            { $set: { isDeleted: true } }
        );
        
        res.json({
            success: true,
            msg: `Deleted ${messageIds.length} messages successfully`
        });
        
    } catch (error) {
        console.error('Bulk Delete Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error deleting messages'
        });
    }
});

// RESEND MESSAGE
router.post('/api/campaign/resend', async (req, res) => {
    try {
        const { jobId, recipient, message } = req.body;
        
        if (!recipient || !message) {
            return res.status(400).json({
                success: false,
                error: 'Recipient and message are required'
            });
        }
        
        // Find original message to get device info
        const originalMessage = await Message.findOne({ jobId });
        
        if (!originalMessage) {
            return res.status(404).json({
                success: false,
                error: 'Original message not found'
            });
        }
        
        // Create new message for resending
        const newMessage = new Message({
            jobId: `RESEND_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            channel: 'whatsapp',
            message: message,
            deviceId: originalMessage.deviceId,
            whatsappNumber: originalMessage.whatsappNumber,
            recipient: recipient,
            status: 'Pending',
            bill: 1,
            direction: 'outgoing',
            originalJobId: jobId,
            messageType: originalMessage.messageType,
            mediaUrl: originalMessage.mediaUrl,
            fileName: originalMessage.fileName,
            fileSize: originalMessage.fileSize,
            campaignId: originalMessage.campaignId,
            campaignName: originalMessage.campaignName
        });
        
        await newMessage.save();
        
        res.json({
            success: true,
            msg: 'Message queued for resending',
            data: {
                newJobId: newMessage.jobId,
                recipient: recipient
            }
        });
        
    } catch (error) {
        console.error('Resend Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error resending message'
        });
    }
});

// GET MESSAGE TYPES FOR FILTER
router.get('/api/reports/message-types', async (req, res) => {
    try {
        const messageTypes = await Message.aggregate([
            { $match: { isDeleted: false } },
            { $group: { 
                _id: "$messageType", 
                count: { $sum: 1 } 
            }},
            { $sort: { count: -1 } }
        ]);
        
        res.json({
            success: true,
            messageTypes: messageTypes.map(mt => ({
                type: mt._id || 'text',
                count: mt.count,
                icon: getMessageTypeIcon(mt._id)
            }))
        });
        
    } catch (error) {
        console.error('Message Types Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error fetching message types'
        });
    }
});

// GET MESSAGE BY ID
router.get('/api/reports/message/:id', async (req, res) => {
    try {
        const message = await Message.findById(req.params.id);
        
        if (!message) {
            return res.status(404).json({
                success: false,
                error: 'Message not found'
            });
        }
        
        res.json({
            success: true,
            data: message
        });
        
    } catch (error) {
        console.error('Get Message Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error fetching message'
        });
    }
});

// =========================
// SAVE MESSAGE FUNCTION - COMPLETELY FIXED VERSION
// =========================
async function saveSentMessage(data) {
    try {
        console.log('💾 Attempting to save message to database:', {
            jobId: data.jobId,
            campaignId: data.campaignId,
            campaignName: data.campaignName,
            recipient: data.recipient,
            messageType: data.messageType,
            messageLength: data.message ? data.message.length : 0,
            deviceId: data.deviceId
        });
        
        // Generate unique jobId if not provided
        const jobId = data.jobId || `MSG_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Check if message already exists to prevent duplicates
        const existingMessage = await Message.findOne({ 
            jobId: jobId,
            recipient: data.recipient,
            campaignId: data.campaignId
        });
        
        if (existingMessage) {
            console.log('⚠️ Message already exists, skipping duplicate:', jobId);
            return existingMessage;
        }
        
        // Ensure campaignId is null for single messages
        let campaignId = data.campaignId;
        let campaignName = data.campaignName;
        
        if (!campaignId || campaignId === '' || campaignId === 'null' || campaignId === 'undefined') {
            campaignId = null;
            campaignName = '';
        }
        
        // Create new message
        const message = new Message({
            jobId: jobId,
            channel: data.channel || 'whatsapp',
            bill: data.bill || 1,
            message: data.message || '',
            messageType: data.messageType || 'text',
            mediaUrl: data.mediaUrl || '',
            fileName: data.fileName || '',
            fileSize: data.fileSize || 0,
            sentTime: data.sentTime || new Date(),
            status: data.status || 'Completed',
            deviceId: data.deviceId || '',
            whatsappNumber: data.whatsappNumber || data.deviceId || '',
            campaignId: campaignId,
            campaignName: campaignName || '',
            recipient: data.recipient || '',
            direction: data.direction || 'outgoing',
            error: data.error || null,
            isDeleted: false
        });
        
        // Save to database
        const savedMessage = await message.save();
        
        console.log(`✅ Message saved successfully:`, {
            _id: savedMessage._id,
            jobId: savedMessage.jobId,
            campaignId: savedMessage.campaignId,
            campaignName: savedMessage.campaignName,
            recipient: savedMessage.recipient,
            messageType: savedMessage.messageType,
            status: savedMessage.status
        });
        
        // Log total campaign messages count
        if (savedMessage.campaignId) {
            const campaignMessageCount = await Message.countDocuments({ 
                campaignId: savedMessage.campaignId,
                isDeleted: false 
            });
            console.log(`📊 Campaign ${savedMessage.campaignId} now has ${campaignMessageCount} messages`);
        }
        
        return savedMessage;
    } catch (error) {
        console.error('❌ Error saving message:', error);
        console.error('Data that failed to save:', {
            jobId: data.jobId,
            campaignId: data.campaignId,
            recipient: data.recipient,
            error: error.message,
            stack: error.stack
        });
        return null;
    }
}

// GET MEDIA FILE
router.get('/uploads/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(__dirname, '..', 'public', 'uploads', filename);
        
        if (fs.existsSync(filePath)) {
            res.sendFile(filePath);
        } else {
            res.status(404).json({
                success: false,
                error: 'File not found'
            });
        }
    } catch (error) {
        console.error('Get Media Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error fetching media'
        });
    }
});

// =========================
// DEBUG ENDPOINTS
// =========================

// Count campaign messages
router.get('/api/debug/campaign-count/:campaignId', async (req, res) => {
    try {
        const campaignId = req.params.campaignId;
        
        const count = await Message.countDocuments({ 
            campaignId: campaignId,
            isDeleted: false 
        });
        
        const messages = await Message.find({ 
            campaignId: campaignId,
            isDeleted: false 
        }).select('jobId recipient sentTime status');
        
        res.json({
            success: true,
            campaignId: campaignId,
            messageCount: count,
            messages: messages
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get all messages for a campaign
router.get('/api/debug/campaign-messages/:campaignId', async (req, res) => {
    try {
        const messages = await Message.find({ 
            campaignId: req.params.campaignId,
            isDeleted: false 
        }).sort({ sentTime: -1 });
        
        res.json({
            success: true,
            count: messages.length,
            messages: messages
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get database stats
router.get('/api/debug/stats', async (req, res) => {
    try {
        const totalMessages = await Message.countDocuments({ isDeleted: false });
        const campaignMessages = await Message.countDocuments({ 
            isDeleted: false,
            campaignId: { $ne: null, $ne: "" }
        });
        const singleMessages = await Message.countDocuments({
            isDeleted: false,
            $or: [
                { campaignId: null },
                { campaignId: '' }
            ]
        });
        
        const campaigns = await Message.distinct('campaignId', { 
            campaignId: { $ne: null, $ne: "" }
        });
        
        res.json({
            success: true,
            stats: {
                totalMessages,
                campaignMessages,
                singleMessages,
                campaignCount: campaigns.length
            },
            campaigns: campaigns
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Export both router and helper functions
module.exports = {
    router,
    saveSentMessage,
    getMessageTypeIcon
};