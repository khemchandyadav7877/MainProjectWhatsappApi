const router = require('express').Router();
const mongoose = require('mongoose');
const Notification = require('../models/Notification');

// ==================== SUPERADMIN ROUTES ====================

// GET SuperAdmin Notifications Page
router.get('/superadmin/notifications', async (req, res) => {
    try {
        const superadmin = {
            _id: req.session?.userId || '67b8f8c8f8c8f8c8f8c8f8c8',
            name: 'Super Admin',
            role: 'superadmin',
            phone: '+91 9876543210',
            email: 'admin@example.com'
        };

        res.render("Notifications/Notifications", {
            user: superadmin,
            userName: superadmin.name,
            userRole: superadmin.role,
            userId: superadmin._id
        });
    } catch (error) {
        console.error('Error loading superadmin notifications:', error);
        res.status(500).send('Error loading page');
    }
});

// API: Get SuperAdmin Notifications
router.get('/api/notifications', async (req, res) => {
    try {
        const { filter = 'all', search = '' } = req.query;
        const superadminId = req.session?.userId || '67b8f8c8f8c8f8c8f8c8f8c8';
        
        // Received messages (from educators)
        let receivedQuery = {
            recipientId: superadminId,
            recipientRole: 'superadmin'
        };

        if (filter === 'unread') {
            receivedQuery.isRead = false;
        } else if (filter === 'educator') {
            receivedQuery.senderRole = 'educator';
        }

        let received = await Notification.find(receivedQuery).sort({ createdAt: -1 });

        // Sent messages (to educators)
        let sentQuery = {
            senderId: superadminId,
            senderRole: 'superadmin',
            recipientRole: 'educator'
        };

        if (filter === 'sent') {
            // Only show sent when filter is sent
        } else if (filter !== 'all') {
            // If not all and not sent, don't show sent
            sentQuery = { _id: null };
        }

        let sent = await Notification.find(sentQuery).sort({ createdAt: -1 });

        // Apply search
        if (search) {
            received = received.filter(n => 
                n.message.toLowerCase().includes(search.toLowerCase()) ||
                n.senderName.toLowerCase().includes(search.toLowerCase())
            );
            sent = sent.filter(n => 
                n.message.toLowerCase().includes(search.toLowerCase())
            );
        }

        const allNotifications = [
            ...received.map(n => ({ ...n.toObject(), type: 'received' })),
            ...sent.map(n => ({ ...n.toObject(), type: 'sent' }))
        ].sort((a, b) => b.createdAt - a.createdAt);

        const stats = {
            total: allNotifications.length,
            unread: received.filter(n => !n.isRead).length,
            educator: received.length,
            sent: sent.length
        };

        res.json({ success: true, notifications: allNotifications, stats });

    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
    }
});

// API: Mark Notification as Read
router.put('/api/notifications/:id/read', async (req, res) => {
    try {
        const { id } = req.params;
        await Notification.findByIdAndUpdate(id, { isRead: true });
        res.json({ success: true, message: 'Marked as read' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to mark as read' });
    }
});

// API: Mark All as Read
router.put('/api/notifications/read-all', async (req, res) => {
    try {
        const superadminId = req.session?.userId || '67b8f8c8f8c8f8c8f8c8f8c8';
        await Notification.updateMany(
            { recipientId: superadminId, recipientRole: 'superadmin', isRead: false },
            { isRead: true }
        );
        res.json({ success: true, message: 'All marked as read' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to mark all as read' });
    }
});

// API: Delete Notification
router.delete('/api/notifications/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await Notification.findByIdAndDelete(id);
        res.json({ success: true, message: 'Notification deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete notification' });
    }
});

// API: Send Reply from SuperAdmin
router.post('/api/notifications/reply', async (req, res) => {
    try {
        const { notificationId, message } = req.body;
        
        const superadmin = {
            _id: req.session?.userId || '67b8f8c8f8c8f8c8f8c8f8c8',
            name: 'Super Admin',
            role: 'superadmin',
            phone: '+91 9876543210'
        };

        const originalNotif = await Notification.findById(notificationId);
        if (!originalNotif) {
            return res.status(404).json({ success: false, error: 'Notification not found' });
        }

        // Update original with reply
        originalNotif.reply = {
            message: message,
            repliedAt: new Date(),
            repliedBy: superadmin._id,
            repliedByModel: 'SuperAdmin',
            repliedByRole: 'superadmin'
        };
        originalNotif.isRead = true;
        await originalNotif.save();

        // Create notification for educator
        const newNotification = new Notification({
            senderId: superadmin._id,
            senderModel: 'SuperAdmin',
            senderName: superadmin.name,
            senderRole: 'superadmin',
            senderPhone: superadmin.phone,
            recipientId: originalNotif.senderId,
            recipientModel: 'Educator',
            recipientRole: 'educator',
            message: message,
            conversationId: originalNotif.conversationId || originalNotif._id
        });

        await newNotification.save();

        // Create sent copy for superadmin
        const sentCopy = new Notification({
            senderId: superadmin._id,
            senderModel: 'SuperAdmin',
            senderName: superadmin.name,
            senderRole: 'superadmin',
            senderPhone: superadmin.phone,
            recipientId: originalNotif.senderId,
            recipientModel: 'Educator',
            recipientRole: 'educator',
            message: message,
            conversationId: originalNotif.conversationId || originalNotif._id,
            isRead: true
        });

        await sentCopy.save();

        res.json({ success: true, message: 'Reply sent successfully' });

    } catch (error) {
        console.error('Error sending reply:', error);
        res.status(500).json({ success: false, error: 'Failed to send reply: ' + error.message });
    }
});

// API: Send New Message from SuperAdmin to Educator
router.post('/api/notifications/new', async (req, res) => {
    try {
        const { message, recipientRole } = req.body;
        
        const superadmin = {
            _id: req.session?.userId || '67b8f8c8f8c8f8c8f8c8f8c8',
            name: 'Super Admin',
            role: 'superadmin',
            phone: '+91 9876543210'
        };

        // Get educator ID (in real app, you'd get this from request or database)
        const educatorId = '67b8f8c8f8c8f8c8f8c8f8c9';

        const conversationId = new mongoose.Types.ObjectId();

        // Create notification for educator
        const newNotification = new Notification({
            senderId: superadmin._id,
            senderModel: 'SuperAdmin',
            senderName: superadmin.name,
            senderRole: 'superadmin',
            senderPhone: superadmin.phone,
            recipientId: educatorId,
            recipientModel: 'Educator',
            recipientRole: 'educator',
            message: message,
            conversationId: conversationId
        });

        await newNotification.save();

        // Create sent copy for superadmin
        const sentCopy = new Notification({
            senderId: superadmin._id,
            senderModel: 'SuperAdmin',
            senderName: superadmin.name,
            senderRole: 'superadmin',
            senderPhone: superadmin.phone,
            recipientId: educatorId,
            recipientModel: 'Educator',
            recipientRole: 'educator',
            message: message,
            conversationId: conversationId,
            isRead: true
        });

        await sentCopy.save();

        res.json({ success: true, message: 'Message sent to educator successfully' });

    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ success: false, error: 'Failed to send message: ' + error.message });
    }
});

// ==================== EDUCATOR ROUTES ====================

// GET Educator Notifications Page
router.get('/educator/notifications', async (req, res) => {
    try {
        const educator = {
            _id: req.session?.userId || '67b8f8c8f8c8f8c8f8c8f8c9',
            name: 'John Educator',
            role: 'educator',
            phone: '+91 9876543211',
            email: 'educator@example.com'
        };

        res.render("notifications/educator", {
            user: educator,
            userName: educator.name,
            userRole: educator.role,
            userId: educator._id
        });
    } catch (error) {
        console.error('Error loading educator notifications:', error);
        res.status(500).send('Error loading page');
    }
});

// API: Get Educator Notifications
router.get('/api/educator/notifications', async (req, res) => {
    try {
        const { filter = 'all', search = '' } = req.query;
        const educatorId = req.session?.userId || '67b8f8c8f8c8f8c8f8c8f8c9';
        
        // Received messages (from superadmin)
        let receivedQuery = {
            recipientId: educatorId,
            recipientRole: 'educator',
            senderRole: 'superadmin'
        };

        if (filter === 'unread') {
            receivedQuery.isRead = false;
        } else if (filter === 'superadmin') {
            // Only from superadmin
        }

        let received = await Notification.find(receivedQuery).sort({ createdAt: -1 });

        // Sent messages (to superadmin)
        let sentQuery = {
            senderId: educatorId,
            senderRole: 'educator',
            recipientRole: 'superadmin'
        };

        if (filter === 'sent') {
            // Only show sent
        } else if (filter !== 'all') {
            sentQuery = { _id: null };
        }

        let sent = await Notification.find(sentQuery).sort({ createdAt: -1 });

        // Apply search
        if (search) {
            received = received.filter(n => 
                n.message.toLowerCase().includes(search.toLowerCase()) ||
                n.senderName.toLowerCase().includes(search.toLowerCase())
            );
            sent = sent.filter(n => 
                n.message.toLowerCase().includes(search.toLowerCase())
            );
        }

        const allNotifications = [
            ...received.map(n => ({ ...n.toObject(), type: 'received' })),
            ...sent.map(n => ({ ...n.toObject(), type: 'sent' }))
        ].sort((a, b) => b.createdAt - a.createdAt);

        const stats = {
            total: allNotifications.length,
            unread: received.filter(n => !n.isRead).length,
            superadmin: received.length,
            sent: sent.length
        };

        res.json({ success: true, notifications: allNotifications, stats });

    } catch (error) {
        console.error('Error fetching educator notifications:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
    }
});

// API: Mark Educator Notification as Read
router.put('/api/educator/notifications/:id/read', async (req, res) => {
    try {
        const { id } = req.params;
        await Notification.findByIdAndUpdate(id, { isRead: true });
        res.json({ success: true, message: 'Marked as read' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to mark as read' });
    }
});

// API: Mark All Educator Notifications as Read
router.put('/api/educator/notifications/read-all', async (req, res) => {
    try {
        const educatorId = req.session?.userId || '67b8f8c8f8c8f8c8f8c8f8c9';
        await Notification.updateMany(
            { recipientId: educatorId, recipientRole: 'educator', isRead: false },
            { isRead: true }
        );
        res.json({ success: true, message: 'All marked as read' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to mark all as read' });
    }
});

// API: Delete Educator Notification
router.delete('/api/educator/notifications/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await Notification.findByIdAndDelete(id);
        res.json({ success: true, message: 'Notification deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete notification' });
    }
});

// API: Send Reply from Educator to Superadmin
router.post('/api/educator/notifications/reply', async (req, res) => {
    try {
        const { notificationId, message } = req.body;
        
        const educator = {
            _id: req.session?.userId || '67b8f8c8f8c8f8c8f8c8f8c9',
            name: 'John Educator',
            role: 'educator',
            phone: '+91 9876543211'
        };

        const originalNotif = await Notification.findById(notificationId);
        if (!originalNotif) {
            return res.status(404).json({ success: false, error: 'Notification not found' });
        }

        // Update original with reply
        originalNotif.reply = {
            message: message,
            repliedAt: new Date(),
            repliedBy: educator._id,
            repliedByModel: 'Educator',
            repliedByRole: 'educator'
        };
        originalNotif.isRead = true;
        await originalNotif.save();

        // Create notification for superadmin
        const newNotification = new Notification({
            senderId: educator._id,
            senderModel: 'Educator',
            senderName: educator.name,
            senderRole: 'educator',
            senderPhone: educator.phone,
            recipientId: originalNotif.senderId,
            recipientModel: 'SuperAdmin',
            recipientRole: 'superadmin',
            message: message,
            conversationId: originalNotif.conversationId || originalNotif._id
        });

        await newNotification.save();

        // Create sent copy for educator
        const sentCopy = new Notification({
            senderId: educator._id,
            senderModel: 'Educator',
            senderName: educator.name,
            senderRole: 'educator',
            senderPhone: educator.phone,
            recipientId: originalNotif.senderId,
            recipientModel: 'SuperAdmin',
            recipientRole: 'superadmin',
            message: message,
            conversationId: originalNotif.conversationId || originalNotif._id,
            isRead: true
        });

        await sentCopy.save();

        res.json({ success: true, message: 'Reply sent to superadmin successfully' });

    } catch (error) {
        console.error('Error sending reply:', error);
        res.status(500).json({ success: false, error: 'Failed to send reply: ' + error.message });
    }
});

// API: Send New Message from Educator to Superadmin
router.post('/api/educator/notifications/new', async (req, res) => {
    try {
        const { message } = req.body;
        
        const educator = {
            _id: req.session?.userId || '67b8f8c8f8c8f8c8f8c8f8c9',
            name: 'John Educator',
            role: 'educator',
            phone: '+91 9876543211'
        };

        const superadminId = '67b8f8c8f8c8f8c8f8c8f8c8';
        const conversationId = new mongoose.Types.ObjectId();

        // Create notification for superadmin
        const newNotification = new Notification({
            senderId: educator._id,
            senderModel: 'Educator',
            senderName: educator.name,
            senderRole: 'educator',
            senderPhone: educator.phone,
            recipientId: superadminId,
            recipientModel: 'SuperAdmin',
            recipientRole: 'superadmin',
            message: message,
            conversationId: conversationId
        });

        await newNotification.save();

        // Create sent copy for educator
        const sentCopy = new Notification({
            senderId: educator._id,
            senderModel: 'Educator',
            senderName: educator.name,
            senderRole: 'educator',
            senderPhone: educator.phone,
            recipientId: superadminId,
            recipientModel: 'SuperAdmin',
            recipientRole: 'superadmin',
            message: message,
            conversationId: conversationId,
            isRead: true
        });

        await sentCopy.save();

        res.json({ success: true, message: 'Message sent to superadmin successfully' });

    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ success: false, error: 'Failed to send message: ' + error.message });
    }
});

// ==================== TEST ROUTES ====================

// Test: Create sample notification from superadmin to educator
router.post('/api/test/superadmin-to-educator', async (req, res) => {
    try {
        const notification = new Notification({
            senderId: '67b8f8c8f8c8f8c8f8c8f8c8',
            senderModel: 'SuperAdmin',
            senderName: 'Super Admin',
            senderRole: 'superadmin',
            senderPhone: '+91 9876543210',
            recipientId: '67b8f8c8f8c8f8c8f8c8f8c9',
            recipientModel: 'Educator',
            recipientRole: 'educator',
            message: 'Please check the new student assignments and provide feedback'
        });

        await notification.save();
        res.json({ success: true, message: 'Test notification created', notification });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;