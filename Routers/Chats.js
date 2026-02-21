// Routes/Chats.js - COMPLETE REAL WHATSAPP INTEGRATION
const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const Contact = require('../models/Contact');
const Device = require('../models/Device');
const { v4: uuidv4 } = require('uuid');
const { clients } = require('./WhtasappScane');

// =========================
// SETUP MESSAGE LISTENERS
// =========================
function setupMessageListeners(deviceId, client) {
    console.log(`📱 Setting up listeners for device: ${deviceId}`);
    
    // Remove existing listeners
    client.removeAllListeners('message');
    client.removeAllListeners('message_ack');
    
    // ✅ INCOMING MESSAGE LISTENER
    client.on('message', async (msg) => {
        try {
            console.log(`📩 Incoming message on ${deviceId}: ${msg.from}`);
            
            // Ignore groups and status
            if (msg.from.includes('@g.us') || msg.from.includes('status@broadcast')) {
                return;
            }
            
            const contactNumber = msg.from.replace('@c.us', '');
            const contact = await msg.getContact();
            const contactName = contact.pushname || contact.name || contactNumber;
            
            let messageType = 'text';
            let mediaUrl = null;
            let fileName = null;
            
            // Handle media
            if (msg.hasMedia) {
                try {
                    const media = await msg.downloadMedia();
                    if (media) {
                        const fs = require('fs');
                        const path = require('path');
                        
                        const uploadDir = 'public/uploads/chat-media';
                        if (!fs.existsSync(uploadDir)) {
                            fs.mkdirSync(uploadDir, { recursive: true });
                        }
                        
                        const ext = media.mimetype.split('/')[1] || 'jpg';
                        fileName = `${Date.now()}-${uuidv4()}.${ext}`;
                        const filePath = path.join(uploadDir, fileName);
                        
                        fs.writeFileSync(filePath, media.data, 'base64');
                        mediaUrl = `/uploads/chat-media/${fileName}`;
                        
                        if (media.mimetype.startsWith('image/')) messageType = 'image';
                        else if (media.mimetype.startsWith('video/')) messageType = 'video';
                        else if (media.mimetype.startsWith('audio/')) messageType = 'audio';
                        else messageType = 'document';
                    }
                } catch (e) {
                    console.log('Media error:', e.message);
                }
            }
            
            // Generate unique message ID
            const messageId = msg.id?.id || msg.id || `msg_${Date.now()}_${uuidv4()}`;
            
            // Save message
            try {
                await Message.create({
                    messageId: messageId,
                    deviceId: deviceId,
                    chatId: msg.from,
                    contactNumber: contactNumber,
                    contactName: contactName,
                    message: msg.body || '',
                    messageType: messageType,
                    mediaUrl: mediaUrl,
                    fileName: fileName,
                    direction: 'incoming',
                    timestamp: new Date(msg.timestamp * 1000),
                    isRead: false,
                    status: 'delivered'
                });
                console.log(`✅ Saved message from ${contactNumber}`);
            } catch (dbError) {
                if (dbError.code === 11000) {
                    console.log('Duplicate message ID, skipping...');
                } else {
                    console.error('DB Error:', dbError);
                }
            }
            
            // Update contact
            await Contact.findOneAndUpdate(
                { deviceId: deviceId, contactNumber: contactNumber },
                {
                    contactName: contactName,
                    lastMessage: msg.body || `[${messageType}]`,
                    lastMessageTime: new Date(msg.timestamp * 1000),
                    $inc: { unreadCount: 1 }
                },
                { upsert: true, new: true }
            );
            
        } catch (error) {
            console.error('Error handling message:', error);
        }
    });
    
    // ✅ MESSAGE STATUS
    client.on('message_ack', async (msg, ack) => {
        try {
            let status = 'sent';
            if (ack === 1) status = 'sent';
            else if (ack === 2) status = 'delivered';
            else if (ack === 3) status = 'read';
            
            const messageId = msg.id?.id || msg.id;
            if (messageId) {
                await Message.updateOne(
                    { messageId: messageId },
                    { status: status }
                );
            }
        } catch (error) {
            console.error('Error updating ack:', error);
        }
    });
}

// Initialize listeners
async function initializeListeners() {
    try {
        const devices = await Device.find({ status: 'CONNECTED' });
        devices.forEach(device => {
            const client = clients[device.deviceId];
            if (client && client.info) {
                setupMessageListeners(device.deviceId, client);
            }
        });
        console.log(`✅ Listeners initialized for ${devices.length} devices`);
    } catch (error) {
        console.error('Error initializing:', error);
    }
}

setTimeout(initializeListeners, 5000);

// =========================
// ROUTES
// =========================

// ✅ CHAT PAGE - FIXED: WITH DEVICES DATA
router.get('/chats', async (req, res) => {
    try {
        // Fetch connected devices from database
        const devices = await Device.find({ status: 'CONNECTED' })
            .select('deviceId whatsappName phone status')
            .sort({ createdAt: -1 });

        console.log(`📱 Found ${devices.length} connected devices for chats page`);

        res.render('Chats/newChats', {
            activeTab: 'chats',
            user: req.session.user || req.user || {
                role: 'SuperAdmin',
                firstName: 'Admin',
                lastName: 'User',
                email: 'admin@example.com'
            },
            devices: devices
        });
    } catch (error) {
        console.error('Error loading chats page:', error);
        res.render('Chats/newChats', {
            activeTab: 'chats',
            user: req.session.user || req.user || {
                role: 'SuperAdmin',
                firstName: 'Admin',
                lastName: 'User',
                email: 'admin@example.com'
            },
            devices: []
        });
    }
});

// ✅ GET DEVICES
router.get('/api/chats/devices', async (req, res) => {
    try {
        const devices = await Device.find({ status: 'CONNECTED' })
            .sort({ createdAt: -1 });
        
        res.json({
            status: true,
            devices: devices.map(d => ({
                deviceId: d.deviceId,
                whatsappName: d.whatsappName,
                phone: d.phone,
                status: d.status
            }))
        });
    } catch (error) {
        res.json({ status: false, msg: error.message });
    }
});

// ✅ GET CONTACTS
router.get('/api/chats/contacts/:deviceId', async (req, res) => {
    try {
        const { deviceId } = req.params;
        
        const contacts = await Contact.find({ deviceId: deviceId })
            .sort({ lastMessageTime: -1 })
            .limit(100);
        
        res.json({
            status: true,
            contacts: contacts
        });
    } catch (error) {
        res.json({ status: false, msg: error.message });
    }
});

// ✅ GET MESSAGES
router.get('/api/chats/messages/:deviceId/:contactNumber', async (req, res) => {
    try {
        const { deviceId, contactNumber } = req.params;
        
        const messages = await Message.find({
            deviceId: deviceId,
            contactNumber: contactNumber
        })
        .sort({ timestamp: 1 })
        .limit(500);
        
        // Mark as read
        await Message.updateMany(
            {
                deviceId: deviceId,
                contactNumber: contactNumber,
                direction: 'incoming',
                isRead: false
            },
            { isRead: true }
        );
        
        // Reset unread
        await Contact.updateOne(
            { deviceId: deviceId, contactNumber: contactNumber },
            { unreadCount: 0 }
        );
        
        res.json({
            status: true,
            messages: messages
        });
    } catch (error) {
        res.json({ status: false, msg: error.message });
    }
});

// ✅ SEND MESSAGE - FIXED VERSION WITH ERROR HANDLING
router.post('/api/chats/send', async (req, res) => {
    try {
        const { deviceId, contactNumber, message } = req.body;
        
        if (!deviceId || !contactNumber || !message) {
            return res.json({
                status: false,
                msg: 'Missing required fields'
            });
        }
        
        const client = clients[deviceId];
        if (!client || !client.info) {
            return res.json({
                status: false,
                msg: 'Device not connected'
            });
        }
        
        // Format number properly
        let formatted = contactNumber.replace(/\D/g, '');
        if (formatted.length === 10) {
            formatted = '91' + formatted;
        } else if (formatted.length === 12 && formatted.startsWith('91')) {
            // Already formatted
        } else {
            formatted = '91' + formatted.slice(-10);
        }
        
        const chatId = formatted + '@c.us';
        
        // ✅ FIX: Send message with better error handling
        let sentMsg;
        try {
            // Try to send message normally
            sentMsg = await client.sendMessage(chatId, message);
        } catch (sendError) {
            console.error('WhatsApp send error:', sendError);
            
            // If error is about unread, try alternative method
            if (sendError.message && sendError.message.includes('markedUnread')) {
                console.log('⚠️ markedUnread error detected, trying alternative method...');
                
                // Alternative: Create chat first then send message
                try {
                    const chat = await client.getChatById(chatId);
                    sentMsg = await chat.sendMessage(message);
                } catch (altError) {
                    // If that also fails, try one more method
                    console.log('Alternative method failed, trying final method...');
                    sentMsg = await client.sendMessage(chatId, message, {
                        sendSeen: false,
                        markAsRead: false
                    });
                }
            } else {
                throw sendError;
            }
        }
        
        // Get contact name
        let contactName = contactNumber;
        try {
            const contact = await client.getContactById(chatId);
            contactName = contact.pushname || contact.name || contactNumber;
        } catch (e) {
            console.log('Could not get contact name');
        }
        
        // Generate unique message ID
        const messageId = sentMsg?.id?.id || sentMsg?.id || `msg_${Date.now()}_${uuidv4()}`;
        
        // Save to DB
        let newMessage;
        try {
            newMessage = await Message.create({
                messageId: messageId,
                deviceId: deviceId,
                chatId: chatId,
                contactNumber: contactNumber,
                contactName: contactName,
                message: message,
                messageType: 'text',
                direction: 'outgoing',
                timestamp: new Date(),
                isRead: true,
                status: 'sent'
            });
            console.log(`✅ Message saved to DB with ID: ${messageId}`);
        } catch (dbError) {
            if (dbError.code === 11000) {
                console.log('Duplicate key, retrying with new ID...');
                const newMessageId = `msg_${Date.now()}_${uuidv4()}`;
                newMessage = await Message.create({
                    messageId: newMessageId,
                    deviceId: deviceId,
                    chatId: chatId,
                    contactNumber: contactNumber,
                    contactName: contactName,
                    message: message,
                    messageType: 'text',
                    direction: 'outgoing',
                    timestamp: new Date(),
                    isRead: true,
                    status: 'sent'
                });
            } else {
                throw dbError;
            }
        }
        
        // Update contact
        await Contact.findOneAndUpdate(
            { deviceId: deviceId, contactNumber: contactNumber },
            {
                contactName: contactName,
                lastMessage: message,
                lastMessageTime: new Date()
            },
            { upsert: true, new: true }
        );
        
        console.log(`✅ Message sent successfully to ${contactNumber}`);
        
        res.json({
            status: true,
            message: newMessage
        });
        
    } catch (error) {
        console.error('Send error:', error);
        
        // Check if it's the markedUnread error
        if (error.message && error.message.includes('markedUnread')) {
            return res.json({
                status: false,
                msg: 'WhatsApp client error. Please refresh the device and try again.',
                error: 'markedUnread_error'
            });
        }
        
        res.json({
            status: false,
            msg: error.message || 'Failed to send message'
        });
    }
});

// ✅ ADD CONTACT - FIXED VERSION
router.post('/api/chats/add-contact', async (req, res) => {
    try {
        const { deviceId, contactNumber, contactName } = req.body;
        
        if (!deviceId || !contactNumber) {
            return res.json({
                status: false,
                msg: 'Device and number required'
            });
        }
        
        // Format number
        let formatted = contactNumber.replace(/\D/g, '');
        if (formatted.length === 10) {
            formatted = '91' + formatted;
        } else if (formatted.length === 12 && formatted.startsWith('91')) {
            // Already formatted
        } else {
            formatted = '91' + formatted.slice(-10);
        }
        
        console.log(`📱 Adding contact: ${formatted} to device: ${deviceId}`);
        
        // Check if contact already exists
        const existingContact = await Contact.findOne({
            deviceId: deviceId,
            contactNumber: formatted
        });
        
        if (existingContact) {
            return res.json({
                status: true,
                contact: existingContact,
                msg: 'Contact already exists'
            });
        }
        
        // Create new contact
        const contact = await Contact.create({
            deviceId: deviceId,
            contactNumber: formatted,
            contactName: contactName || formatted,
            lastMessage: '',
            lastMessageTime: new Date(),
            unreadCount: 0
        });
        
        console.log(`✅ Contact added successfully: ${formatted}`);
        
        res.json({
            status: true,
            contact: contact,
            msg: 'Contact added successfully'
        });
        
    } catch (error) {
        console.error('Error adding contact:', error);
        
        if (error.code === 11000) {
            res.json({
                status: false,
                msg: 'Contact already exists with this number'
            });
        } else {
            res.json({ 
                status: false, 
                msg: error.message || 'Failed to add contact'
            });
        }
    }
});

// ✅ DELETE CONTACT
router.delete('/api/chats/contact/:deviceId/:contactNumber', async (req, res) => {
    try {
        const { deviceId, contactNumber } = req.params;
        
        await Contact.deleteOne({ deviceId, contactNumber });
        await Message.deleteMany({ deviceId, contactNumber });
        
        res.json({ status: true, msg: 'Deleted' });
    } catch (error) {
        res.json({ status: false, msg: error.message });
    }
});

// ✅ SEARCH
router.get('/api/chats/search/:deviceId', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { q } = req.query;
        
        if (!q) {
            return res.json({ status: false, msg: 'Query required' });
        }
        
        const contacts = await Contact.find({
            deviceId: deviceId,
            $or: [
                { contactName: { $regex: q, $options: 'i' } },
                { contactNumber: { $regex: q, $options: 'i' } }
            ]
        }).limit(20);
        
        res.json({ status: true, contacts });
    } catch (error) {
        res.json({ status: false, msg: error.message });
    }
});

module.exports = router;