const router = require('express').Router();
const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const NotificationReply = require('../models/NotificationReply');
const auth = require('../models/auth');
const { isAuthenticated, hasRole } = require('../middleware/auth');

// Helper function to safely get ObjectId
function getValidObjectId(id) {
    if (!id) return null;
    if (id instanceof mongoose.Types.ObjectId) return id;
    if (mongoose.Types.ObjectId.isValid(id)) return new mongoose.Types.ObjectId(id);
    return null;
}

// ========== PAGE ROUTES (Protected) ==========
router.get('/superadmin/notifications', isAuthenticated, hasRole('superadmin', 'SuperAdmin'), async (req, res) => {
    try {
        res.render("Notifications/Notifications", { 
            user: req.user, 
            pageTitle: 'SuperAdmin Notifications' 
        });
    } catch (error) {
        console.error('Error rendering superadmin notifications:', error);
        res.status(500).send('Server Error');
    }
});

router.get('/educator/notifications', isAuthenticated, hasRole('educator', 'Educator'), async (req, res) => {
    try {
        res.render("Notifications/Educator", { 
            user: req.user, 
            pageTitle: 'Educator Notifications' 
        });
    } catch (error) {
        console.error('Error rendering educator notifications:', error);
        res.status(500).send('Server Error');
    }
});

// ========== API ROUTES (Protected) ==========
// GET Notifications (SuperAdmin) - UPDATED with countOnly
router.get('/api/notifications', isAuthenticated, hasRole('superadmin', 'SuperAdmin'), async (req, res) => {
    try {
        const userId = req.userId;
        const { filter = 'all', search = '', countOnly = 'false' } = req.query;
        
        // Convert countOnly to boolean
        const isCountOnly = countOnly === 'true' || countOnly === true;
        
        // IF COUNT ONLY - Just return the unread count for header badge
        if (isCountOnly) {
            try {
                // Get unread count where current user is recipient
                const unreadCount = await Notification.countDocuments({
                    recipientId: new mongoose.Types.ObjectId(userId),
                    isRead: false
                });
                
                // Also get other stats for header if needed
                const totalCount = await Notification.countDocuments({
                    $or: [
                        { recipientId: new mongoose.Types.ObjectId(userId) },
                        { senderId: new mongoose.Types.ObjectId(userId) }
                    ]
                });
                
                const educatorCount = await Notification.countDocuments({
                    senderRole: { $in: ['educator', 'Educator'] },
                    recipientId: new mongoose.Types.ObjectId(userId)
                });
                
                const sentCount = await Notification.countDocuments({
                    senderId: new mongoose.Types.ObjectId(userId),
                    senderRole: { $in: ['superadmin', 'SuperAdmin'] }
                });
                
                return res.json({ 
                    success: true, 
                    unreadCount,
                    stats: {
                        total: totalCount,
                        unread: unreadCount,
                        educator: educatorCount,
                        sent: sentCount
                    }
                });
            } catch (countError) {
                console.error('Error counting notifications:', countError);
                return res.status(500).json({ 
                    success: false, 
                    error: 'Failed to count notifications' 
                });
            }
        }
        
        // FULL DATA - Return complete notifications list
        try {
            // Build base query
            let query = {
                $or: [
                    { recipientId: new mongoose.Types.ObjectId(userId) },
                    { senderId: new mongoose.Types.ObjectId(userId) }
                ]
            };

            // Apply filters
            if (filter === 'unread') {
                query.isRead = false;
                // For unread, we only want messages where current user is recipient
                query = {
                    recipientId: new mongoose.Types.ObjectId(userId),
                    isRead: false
                };
            } else if (filter === 'educator') {
                // Messages FROM educators (sent to superadmin)
                query = {
                    senderRole: { $in: ['educator', 'Educator'] },
                    recipientId: new mongoose.Types.ObjectId(userId)
                };
            } else if (filter === 'sent') {
                // Messages FROM superadmin (sent to educators)
                query = {
                    senderId: new mongoose.Types.ObjectId(userId),
                    senderRole: { $in: ['superadmin', 'SuperAdmin'] }
                };
            }
            
            // Add search if provided
            if (search && search.trim() !== '') {
                // If query already has $and, use it, otherwise create new $and
                if (query.$and) {
                    query.$and.push({
                        $or: [
                            { message: { $regex: search.trim(), $options: 'i' } },
                            { senderName: { $regex: search.trim(), $options: 'i' } }
                        ]
                    });
                } else {
                    const originalQuery = { ...query };
                    query = {
                        $and: [
                            originalQuery,
                            {
                                $or: [
                                    { message: { $regex: search.trim(), $options: 'i' } },
                                    { senderName: { $regex: search.trim(), $options: 'i' } }
                                ]
                            }
                        ]
                    };
                }
            }

            // Get notifications
            const notifications = await Notification.find(query)
                .sort({ createdAt: -1 })
                .limit(100)
                .lean();

            // Format notifications for frontend
            const formattedNotifications = notifications.map(n => ({
                ...n,
                _id: n._id.toString(),
                createdAt: n.createdAt,
                type: n.senderId.toString() === userId ? 'sent' : 'received'
            }));

            // Get stats for sidebar/filters
            const stats = {
                total: await Notification.countDocuments({
                    $or: [
                        { recipientId: new mongoose.Types.ObjectId(userId) },
                        { senderId: new mongoose.Types.ObjectId(userId) }
                    ]
                }),
                unread: await Notification.countDocuments({
                    recipientId: new mongoose.Types.ObjectId(userId),
                    isRead: false
                }),
                educator: await Notification.countDocuments({
                    senderRole: { $in: ['educator', 'Educator'] },
                    recipientId: new mongoose.Types.ObjectId(userId)
                }),
                sent: await Notification.countDocuments({
                    senderId: new mongoose.Types.ObjectId(userId),
                    senderRole: { $in: ['superadmin', 'SuperAdmin'] }
                })
            };

            return res.json({ 
                success: true, 
                notifications: formattedNotifications, 
                stats 
            });
        } catch (dataError) {
            console.error('Error fetching notifications data:', dataError);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch notifications data' 
            });
        }
    } catch (error) {
        console.error('Error in superadmin notifications API:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET Notifications (Educator) - UPDATED with countOnly
router.get('/api/educator/notifications', isAuthenticated, hasRole('educator', 'Educator'), async (req, res) => {
    try {
        const userId = req.userId;
        const { filter = 'all', search = '', countOnly = 'false' } = req.query;
        
        // Convert countOnly to boolean
        const isCountOnly = countOnly === 'true' || countOnly === true;
        
        // IF COUNT ONLY - Just return the unread count for header badge
        if (isCountOnly) {
            try {
                // Get unread count where current user is recipient
                const unreadCount = await Notification.countDocuments({
                    recipientId: new mongoose.Types.ObjectId(userId),
                    isRead: false
                });
                
                // Also get other stats for header if needed
                const totalCount = await Notification.countDocuments({
                    $or: [
                        { recipientId: new mongoose.Types.ObjectId(userId) },
                        { senderId: new mongoose.Types.ObjectId(userId) }
                    ]
                });
                
                const superadminCount = await Notification.countDocuments({
                    senderRole: { $in: ['superadmin', 'SuperAdmin'] },
                    recipientId: new mongoose.Types.ObjectId(userId)
                });
                
                const sentCount = await Notification.countDocuments({
                    senderId: new mongoose.Types.ObjectId(userId),
                    senderRole: { $in: ['educator', 'Educator'] }
                });
                
                return res.json({ 
                    success: true, 
                    unreadCount,
                    stats: {
                        total: totalCount,
                        unread: unreadCount,
                        superadmin: superadminCount,
                        sent: sentCount
                    }
                });
            } catch (countError) {
                console.error('Error counting educator notifications:', countError);
                return res.status(500).json({ 
                    success: false, 
                    error: 'Failed to count notifications' 
                });
            }
        }
        
        // FULL DATA - Return complete notifications list
        try {
            // Build base query
            let query = {
                $or: [
                    { recipientId: new mongoose.Types.ObjectId(userId) },
                    { senderId: new mongoose.Types.ObjectId(userId) }
                ]
            };

            // Apply filters
            if (filter === 'unread') {
                query = {
                    recipientId: new mongoose.Types.ObjectId(userId),
                    isRead: false
                };
            } else if (filter === 'superadmin') {
                // Messages FROM superadmin (sent to educator)
                query = {
                    senderRole: { $in: ['superadmin', 'SuperAdmin'] },
                    recipientId: new mongoose.Types.ObjectId(userId)
                };
            } else if (filter === 'sent') {
                // Messages FROM educator (sent to superadmin)
                query = {
                    senderId: new mongoose.Types.ObjectId(userId),
                    senderRole: { $in: ['educator', 'Educator'] }
                };
            }
            
            // Add search if provided
            if (search && search.trim() !== '') {
                // If query already has $and, use it, otherwise create new $and
                if (query.$and) {
                    query.$and.push({
                        $or: [
                            { message: { $regex: search.trim(), $options: 'i' } },
                            { senderName: { $regex: search.trim(), $options: 'i' } }
                        ]
                    });
                } else {
                    const originalQuery = { ...query };
                    query = {
                        $and: [
                            originalQuery,
                            {
                                $or: [
                                    { message: { $regex: search.trim(), $options: 'i' } },
                                    { senderName: { $regex: search.trim(), $options: 'i' } }
                                ]
                            }
                        ]
                    };
                }
            }

            // Get notifications
            const notifications = await Notification.find(query)
                .sort({ createdAt: -1 })
                .limit(100)
                .lean();

            // Format notifications for frontend
            const formattedNotifications = notifications.map(n => ({
                ...n,
                _id: n._id.toString(),
                createdAt: n.createdAt,
                type: n.senderId.toString() === userId ? 'sent' : 'received'
            }));

            // Get stats
            const stats = {
                total: await Notification.countDocuments({
                    $or: [
                        { recipientId: new mongoose.Types.ObjectId(userId) },
                        { senderId: new mongoose.Types.ObjectId(userId) }
                    ]
                }),
                unread: await Notification.countDocuments({
                    recipientId: new mongoose.Types.ObjectId(userId),
                    isRead: false
                }),
                superadmin: await Notification.countDocuments({
                    senderRole: { $in: ['superadmin', 'SuperAdmin'] },
                    recipientId: new mongoose.Types.ObjectId(userId)
                }),
                sent: await Notification.countDocuments({
                    senderId: new mongoose.Types.ObjectId(userId),
                    senderRole: { $in: ['educator', 'Educator'] }
                })
            };

            return res.json({ 
                success: true, 
                notifications: formattedNotifications, 
                stats 
            });
        } catch (dataError) {
            console.error('Error fetching educator notifications data:', dataError);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch notifications data' 
            });
        }
    } catch (error) {
        console.error('Error in educator notifications API:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST New Message (Educator)
router.post('/api/educator/notifications/new', isAuthenticated, hasRole('educator', 'Educator'), async (req, res) => {
    try {
        const userId = req.userId;
        const user = req.user;
        const { message } = req.body;
        
        if (!message?.trim()) {
            return res.status(400).json({ success: false, error: 'Message required' });
        }

        // Find superadmin
        let superAdmin = await auth.findOne({ 
            $or: [
                { role: 'superadmin' },
                { role: 'SuperAdmin' }
            ]
        }).lean();
        
        if (!superAdmin) {
            return res.status(404).json({ success: false, error: 'No superadmin found' });
        }

        // Create notification
        const notification = new Notification({
            senderId: new mongoose.Types.ObjectId(userId),
            senderModel: 'Educator',
            senderName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.name || 'Educator',
            senderRole: 'educator',
            senderPhone: user.contactNumber || user.phone || 'N/A',
            recipientId: new mongoose.Types.ObjectId(superAdmin._id),
            recipientModel: 'SuperAdmin',
            recipientRole: 'superadmin',
            message: message.trim(),
            isRead: false,
            conversationId: new mongoose.Types.ObjectId().toString()
        });

        await notification.save();
        
        // After sending new message, trigger notification update for header badge
        res.json({ success: true, notification });
    } catch (error) {
        console.error('Error sending educator message:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST New Message (SuperAdmin)
router.post('/api/notifications/new', isAuthenticated, hasRole('superadmin', 'SuperAdmin'), async (req, res) => {
    try {
        const userId = req.userId;
        const user = req.user;
        const { message, educatorId } = req.body;
        
        if (!message?.trim()) {
            return res.status(400).json({ success: false, error: 'Message required' });
        }

        // If specific educator not provided, find first educator
        let targetEducatorId = educatorId;
        if (!targetEducatorId) {
            let educator = await auth.findOne({ 
                $or: [
                    { role: 'educator' },
                    { role: 'Educator' }
                ]
            }).lean();
            
            if (!educator) {
                return res.status(404).json({ success: false, error: 'No educator found' });
            }
            targetEducatorId = educator._id;
        }

        // Create notification
        const notification = new Notification({
            senderId: new mongoose.Types.ObjectId(userId),
            senderModel: 'SuperAdmin',
            senderName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.name || 'Super Admin',
            senderRole: 'superadmin',
            senderPhone: user.contactNumber || user.phone || 'N/A',
            recipientId: new mongoose.Types.ObjectId(targetEducatorId),
            recipientModel: 'Educator',
            recipientRole: 'educator',
            message: message.trim(),
            isRead: false,
            conversationId: new mongoose.Types.ObjectId().toString()
        });

        await notification.save();
        
        res.json({ success: true, notification });
    } catch (error) {
        console.error('Error sending superadmin message:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST Reply (SuperAdmin)
router.post('/api/notifications/reply', isAuthenticated, hasRole('superadmin', 'SuperAdmin'), async (req, res) => {
    try {
        const userId = req.userId;
        const user = req.user;
        const { notificationId, message } = req.body;
        
        if (!notificationId || !message?.trim()) {
            return res.status(400).json({ success: false, error: 'Notification ID and message required' });
        }

        // Find original notification
        const original = await Notification.findById(notificationId);
        if (!original) {
            return res.status(404).json({ success: false, error: 'Notification not found' });
        }

        // Create reply notification
        const replyNotif = new Notification({
            senderId: new mongoose.Types.ObjectId(userId),
            senderModel: 'SuperAdmin',
            senderName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.name || 'Super Admin',
            senderRole: 'superadmin',
            senderPhone: user.contactNumber || user.phone || 'N/A',
            recipientId: original.senderId,
            recipientModel: 'Educator',
            recipientRole: 'educator',
            message: message.trim(),
            isRead: false,
            conversationId: original.conversationId || new mongoose.Types.ObjectId().toString(),
            parentId: original._id
        });
        
        await replyNotif.save();

        // Create reply record
        const reply = new NotificationReply({
            notificationId: original._id,
            from: { 
                userId: new mongoose.Types.ObjectId(userId), 
                model: 'SuperAdmin', 
                name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.name, 
                role: 'superadmin' 
            },
            to: { 
                userId: original.senderId, 
                model: 'Educator', 
                name: original.senderName, 
                role: 'educator' 
            },
            message: message.trim(),
            sentVia: 'dashboard',
            status: 'sent'
        });
        
        await reply.save();

        // Update original notification
        original.reply = {
            message: message.trim(),
            repliedAt: new Date(),
            repliedBy: new mongoose.Types.ObjectId(userId),
            repliedByModel: 'SuperAdmin',
            repliedByRole: 'superadmin'
        };
        original.isRead = true;
        await original.save();

        res.json({ success: true, reply, notification: replyNotif });
    } catch (error) {
        console.error('Error sending superadmin reply:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST Reply (Educator)
router.post('/api/educator/notifications/reply', isAuthenticated, hasRole('educator', 'Educator'), async (req, res) => {
    try {
        const userId = req.userId;
        const user = req.user;
        const { notificationId, message } = req.body;
        
        if (!notificationId || !message?.trim()) {
            return res.status(400).json({ success: false, error: 'Notification ID and message required' });
        }

        // Find original notification
        const original = await Notification.findById(notificationId);
        if (!original) {
            return res.status(404).json({ success: false, error: 'Notification not found' });
        }

        // Find superadmin
        let superAdmin = await auth.findOne({ 
            $or: [
                { role: 'superadmin' },
                { role: 'SuperAdmin' }
            ]
        }).lean();
        
        if (!superAdmin) {
            return res.status(404).json({ success: false, error: 'No superadmin found' });
        }

        // Create reply notification
        const replyNotif = new Notification({
            senderId: new mongoose.Types.ObjectId(userId),
            senderModel: 'Educator',
            senderName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.name || 'Educator',
            senderRole: 'educator',
            senderPhone: user.contactNumber || user.phone || 'N/A',
            recipientId: new mongoose.Types.ObjectId(superAdmin._id),
            recipientModel: 'SuperAdmin',
            recipientRole: 'superadmin',
            message: message.trim(),
            isRead: false,
            conversationId: original.conversationId || new mongoose.Types.ObjectId().toString(),
            parentId: original._id
        });
        
        await replyNotif.save();

        // Create reply record
        const reply = new NotificationReply({
            notificationId: original._id,
            from: { 
                userId: new mongoose.Types.ObjectId(userId), 
                model: 'Educator', 
                name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.name, 
                role: 'educator' 
            },
            to: { 
                userId: new mongoose.Types.ObjectId(superAdmin._id), 
                model: 'SuperAdmin', 
                name: 'Super Admin', 
                role: 'superadmin' 
            },
            message: message.trim(),
            sentVia: 'dashboard',
            status: 'sent'
        });
        
        await reply.save();

        // Update original notification
        original.reply = {
            message: message.trim(),
            repliedAt: new Date(),
            repliedBy: new mongoose.Types.ObjectId(userId),
            repliedByModel: 'Educator',
            repliedByRole: 'educator'
        };
        original.isRead = true;
        await original.save();

        res.json({ success: true, reply, notification: replyNotif });
    } catch (error) {
        console.error('Error sending educator reply:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Mark as Read (SuperAdmin)
router.put('/api/notifications/:id/read', isAuthenticated, async (req, res) => {
    try {
        const userId = req.userId;
        const notificationId = req.params.id;
        
        // Only allow marking as read if user is the recipient
        await Notification.findOneAndUpdate(
            { 
                _id: notificationId, 
                recipientId: new mongoose.Types.ObjectId(userId) 
            }, 
            { isRead: true }
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error marking as read:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Mark as Read (Educator)
router.put('/api/educator/notifications/:id/read', isAuthenticated, async (req, res) => {
    try {
        const userId = req.userId;
        const notificationId = req.params.id;
        
        await Notification.findOneAndUpdate(
            { 
                _id: notificationId, 
                recipientId: new mongoose.Types.ObjectId(userId) 
            }, 
            { isRead: true }
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error marking as read:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Mark All Read (SuperAdmin)
router.put('/api/notifications/read-all', isAuthenticated, async (req, res) => {
    try {
        const userId = req.userId;
        await Notification.updateMany(
            { 
                recipientId: new mongoose.Types.ObjectId(userId), 
                isRead: false 
            }, 
            { isRead: true }
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error marking all as read:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Mark All Read (Educator)
router.put('/api/educator/notifications/read-all', isAuthenticated, async (req, res) => {
    try {
        const userId = req.userId;
        await Notification.updateMany(
            { 
                recipientId: new mongoose.Types.ObjectId(userId), 
                isRead: false 
            }, 
            { isRead: true }
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error marking all as read:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete (SuperAdmin)
router.delete('/api/notifications/:id', isAuthenticated, async (req, res) => {
    try {
        const userId = req.userId;
        const notificationId = req.params.id;
        
        // Only allow deletion if user is sender or recipient
        await Notification.findOneAndDelete({
            _id: notificationId,
            $or: [
                { senderId: new mongoose.Types.ObjectId(userId) },
                { recipientId: new mongoose.Types.ObjectId(userId) }
            ]
        });
        
        await NotificationReply.deleteMany({ notificationId });
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting notification:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete (Educator)
router.delete('/api/educator/notifications/:id', isAuthenticated, async (req, res) => {
    try {
        const userId = req.userId;
        const notificationId = req.params.id;
        
        await Notification.findOneAndDelete({
            _id: notificationId,
            $or: [
                { senderId: new mongoose.Types.ObjectId(userId) },
                { recipientId: new mongoose.Types.ObjectId(userId) }
            ]
        });
        
        await NotificationReply.deleteMany({ notificationId });
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting notification:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;