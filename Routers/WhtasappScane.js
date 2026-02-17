const express = require('express');
const router = express.Router();

const Device = require('../models/Device');
const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

// =========================
// MEMORY (GLOBAL)
// =========================
const clients = {};
const qrMemory = {};

// =========================
// CREATE WHATSAPP CLIENT (WITH HIDDEN BROWSER)
// =========================
async function createWhatsAppClient(req) {
    const deviceId = uuidv4();
    const token = uuidv4();
    
    // GET CLIENT IP ADDRESS
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '-';
    const ipAddress = clientIp.toString().split(',')[0].trim();

    // SAVE DEVICE
    await Device.create({
        deviceId,
        token,
        ipAddress,
        phone: null,
        whatsappName: 'WhatsApp Device',
        whatsappNumber: null,
        status: 'SCANNING',
        connectionStatus: 'pending',
        deviceAddedAt: new Date(),
        qrCode: null
    });

    console.log(`📱 Device created: ${deviceId}, IP: ${ipAddress}`);

    const client = new Client({
        authStrategy: new LocalAuth({
            clientId: deviceId,
            dataPath: './.wwebjs_auth'
        }),
        puppeteer: {
            headless: true, // ✅ HEADLESS MODE (NO BROWSER WINDOW)
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu', // ✅ GPU DISABLE FOR HEADLESS
                '--disable-software-rasterizer',
                '--disable-extensions',
                '--disable-default-apps',
                '--disable-background-networking',
                '--disable-sync',
                '--disable-translate',
                '--metrics-recording-only',
                '--mute-audio',
                '--no-first-run',
                '--no-default-browser-check',
                '--no-pings',
                '--hide-scrollbars',
                '--window-size=1920,1080' // ✅ SET WINDOW SIZE FOR HEADLESS
            ],
            // ✅ HIDDEN USER AGENT AND VIEWPORT
            defaultViewport: {
                width: 1920,
                height: 1080
            }
        },
        takeoverOnConflict: true,
        takeoverTimeoutMs: 0,
    });

    // ✅ QR EVENT
    client.on('qr', async (qr) => {
        console.log(`📲 QR GENERATED for device: ${deviceId}`);
        qrMemory[deviceId] = await QRCode.toDataURL(qr);
        
        await Device.updateOne(
            { deviceId },
            { 
                status: 'SCANNING',
                connectionStatus: 'pending',
                qrCode: qrMemory[deviceId],
                updatedAt: new Date()
            }
        );
    });

    // ✅ AUTHENTICATED EVENT
    client.on('authenticated', async (session) => {
        console.log(`🔐 AUTHENTICATED: ${deviceId}`);
        
        await Device.updateOne(
            { deviceId },
            {
                status: 'CONNECTED',
                connectionStatus: 'online',
                connectedAt: new Date(),
                lastConnected: new Date(),
                qrCode: null
            }
        );

        qrMemory[deviceId] = 'CONNECTED';
        console.log(`✅ WhatsApp AUTHENTICATED: ${deviceId}`);
    });

    // ✅ READY EVENT - GET PROPER WHATSAPP NAME
    client.on('ready', async () => {
        console.log(`✅ READY EVENT: ${deviceId}`);
        
        // Wait a bit for client to be fully ready
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        let phoneNumber = null;
        let whatsappName = 'WhatsApp Device';
        
        try {
            // METHOD 1: Try to get from client.info with better logging
            if (client.info) {
                console.log('🔍 Client info found:', JSON.stringify(client.info, null, 2));
                
                // Try different possible properties for phone number
                if (client.info.wid && client.info.wid.user) {
                    phoneNumber = client.info.wid.user;
                    console.log(`📱 Phone from wid.user: ${phoneNumber}`);
                } else if (client.info.me && client.info.me.user) {
                    phoneNumber = client.info.me.user;
                    console.log(`📱 Phone from me.user: ${phoneNumber}`);
                } else if (client.info._data && client.info._data.wid && client.info._data.wid.user) {
                    phoneNumber = client.info._data.wid.user;
                    console.log(`📱 Phone from _data.wid.user: ${phoneNumber}`);
                }
                
                // Try different possible properties for name
                if (client.info.pushname) {
                    whatsappName = client.info.pushname;
                    console.log(`👤 Name from pushname: ${whatsappName}`);
                } else if (client.info.name) {
                    whatsappName = client.info.name;
                    console.log(`👤 Name from name: ${whatsappName}`);
                } else if (client.info.me && client.info.me.name) {
                    whatsappName = client.info.me.name;
                    console.log(`👤 Name from me.name: ${whatsappName}`);
                } else if (client.info._data && client.info._data.pushname) {
                    whatsappName = client.info._data.pushname;
                    console.log(`👤 Name from _data.pushname: ${whatsappName}`);
                } else if (client.info._data && client.info._data.name) {
                    whatsappName = client.info._data.name;
                    console.log(`👤 Name from _data.name: ${whatsappName}`);
                }
            }
            
            // METHOD 2: Try to get contacts and find our own contact
            if (!whatsappName || whatsappName === 'WhatsApp Device') {
                try {
                    console.log('🔍 Trying to get contacts for name...');
                    const contacts = await client.getContacts();
                    console.log(`Total contacts: ${contacts.length}`);
                    
                    // Look for our own contact (isMe should be true)
                    for (const contact of contacts) {
                        if (contact.isMe) {
                            console.log('✅ Found own contact:', contact);
                            
                            if (contact.name && contact.name !== '') {
                                whatsappName = contact.name;
                                console.log(`👤 Name from contact.name: ${whatsappName}`);
                            } else if (contact.pushname && contact.pushname !== '') {
                                whatsappName = contact.pushname;
                                console.log(`👤 Name from contact.pushname: ${whatsappName}`);
                            } else if (contact.shortName && contact.shortName !== '') {
                                whatsappName = contact.shortName;
                                console.log(`👤 Name from contact.shortName: ${whatsappName}`);
                            }
                            
                            if (!phoneNumber && contact.number) {
                                phoneNumber = contact.number;
                            }
                            break;
                        }
                    }
                } catch (contactError) {
                    console.log('Error getting contacts:', contactError.message);
                }
            }
            
            // METHOD 3: Try to get profile info
            if ((!whatsappName || whatsappName === 'WhatsApp Device') && phoneNumber) {
                try {
                    console.log(`🔍 Trying to get profile for ${phoneNumber}...`);
                    // Format number for WhatsApp
                    const formattedNumber = `${phoneNumber}@c.us`;
                    
                    // Try to get contact by ID
                    const contact = await client.getContactById(formattedNumber);
                    if (contact) {
                        console.log('✅ Got contact from getContactById:', contact);
                        
                        if (contact.name && contact.name !== '') {
                            whatsappName = contact.name;
                            console.log(`👤 Name from getContactById: ${whatsappName}`);
                        } else if (contact.pushname && contact.pushname !== '') {
                            whatsappName = contact.pushname;
                            console.log(`👤 Name from getContactById.pushname: ${whatsappName}`);
                        }
                    }
                } catch (profileError) {
                    console.log('Error getting profile:', profileError.message);
                }
            }
            
            // METHOD 4: Try to send a test message to ourselves and check chat
            if ((!whatsappName || whatsappName === 'WhatsApp Device') && phoneNumber) {
                try {
                    console.log('🔍 Checking chats for name...');
                    const chats = await client.getChats();
                    
                    for (const chat of chats) {
                        console.log(`Chat: ${chat.name} - ${chat.id._serialized}`);
                        
                        // Look for our own chat (should be our number)
                        if (chat.id._serialized.includes(phoneNumber)) {
                            if (chat.name && chat.name !== '') {
                                whatsappName = chat.name;
                                console.log(`👤 Name from chat.name: ${whatsappName}`);
                                break;
                            }
                        }
                        
                        // Also check if it's our own profile chat
                        if (chat.isGroup === false) {
                            const messages = await chat.fetchMessages({ limit: 5 });
                            for (const msg of messages) {
                                if (msg.fromMe) {
                                    // This is a message we sent
                                    if (chat.name && chat.name !== '') {
                                        whatsappName = chat.name;
                                        console.log(`👤 Name from sent message chat: ${whatsappName}`);
                                        break;
                                    }
                                }
                            }
                        }
                        if (whatsappName !== 'WhatsApp Device') break;
                    }
                } catch (chatError) {
                    console.log('Error checking chats:', chatError.message);
                }
            }
            
        } catch (error) {
            console.log('Error in ready event:', error.message);
        }
        
        // Update database
        console.log(`📋 Final result - Phone: ${phoneNumber || 'NOT FOUND'}, Name: ${whatsappName}`);
        
        const updateData = {
            status: 'CONNECTED',
            connectionStatus: 'online',
            connectedAt: new Date(),
            lastConnected: new Date(),
            updatedAt: new Date()
        };
        
        if (phoneNumber) {
            updateData.phone = phoneNumber;
            updateData.whatsappNumber = phoneNumber;
        }
        
        // Always update name, even if it's still 'WhatsApp Device'
        updateData.whatsappName = whatsappName;
        
        await Device.updateOne(
            { deviceId },
            updateData
        );
        
        qrMemory[deviceId] = 'CONNECTED';
        console.log(`✅ WhatsApp READY and UPDATED: ${phoneNumber || deviceId} - ${whatsappName}`);
    });

    // ✅ MESSAGE CREATE EVENT (When we send a message)
    client.on('message_create', async (message) => {
        if (message.fromMe) {
            console.log(`💬 Message sent from device ${deviceId}:`, {
                to: message.to,
                body: message.body
            });
            
            // When we send a message, we can update our info
            try {
                // Get the chat
                const chat = await message.getChat();
                console.log(`Chat info: ${chat.name} - ${chat.id._serialized}`);
                
                // If chat has a name, update our device
                if (chat.name && chat.name !== '') {
                    await Device.updateOne(
                        { deviceId },
                        {
                            whatsappName: chat.name,
                            updatedAt: new Date()
                        }
                    );
                    console.log(`👤 Updated WhatsApp name from sent message: ${chat.name}`);
                }
            } catch (error) {
                console.log('Error getting chat from message:', error.message);
            }
        }
    });

    // ✅ DISCONNECTED EVENT
    client.on('disconnected', async (reason) => {
        console.log(`❌ DISCONNECTED: ${deviceId} - Reason: ${reason}`);
        
        await Device.updateOne(
            { deviceId },
            { 
                status: 'DISCONNECTED',
                connectionStatus: 'offline',
                disconnectedAt: new Date(),
                lastDisconnected: new Date(),
                disconnectReason: reason
            }
        );

        delete clients[deviceId];
        delete qrMemory[deviceId];
    });

    // ✅ INITIALIZE CLIENT
    try {
        await client.initialize();
        clients[deviceId] = client;
        console.log(`🚀 Client initialized for device: ${deviceId}`);
    } catch (error) {
        console.error(`🔥 INITIALIZATION ERROR for ${deviceId}:`, error);
        
        await Device.updateOne(
            { deviceId },
            { 
                status: 'ERROR',
                connectionStatus: 'offline',
                error: error.message
            }
        );
        
        throw error;
    }

    return deviceId;
}

// =========================
// ROUTES
// =========================

// PAGE - GET DEVICES WITH BETTER NAME FETCHING
router.get('/scan/whatsapp', async (req, res) => {
    try {
        const devices = await Device.find().sort({ createdAt: -1 });
        
        console.log(`📊 Found ${devices.length} devices`);
        
        // For connected devices, try to update names from active clients
        for (const device of devices) {
            if (device.status === 'CONNECTED' && clients[device.deviceId]) {
                try {
                    const client = clients[device.deviceId];
                    
                    // If name is still default, try to get better name
                    if (device.whatsappName === 'WhatsApp Device' || !device.whatsappName) {
                        let newName = device.whatsappName;
                        
                        if (client.info) {
                            // Try to get name from client.info
                            if (client.info.pushname && client.info.pushname !== '') {
                                newName = client.info.pushname;
                            } else if (client.info.name && client.info.name !== '') {
                                newName = client.info.name;
                            } else if (client.info.me && client.info.me.name) {
                                newName = client.info.me.name;
                            }
                            
                            if (newName !== device.whatsappName) {
                                await Device.updateOne(
                                    { deviceId: device.deviceId },
                                    {
                                        whatsappName: newName,
                                        updatedAt: new Date()
                                    }
                                );
                                console.log(`✅ Updated name for ${device.deviceId}: ${newName}`);
                            }
                        }
                    }
                    
                    // Also update phone number if missing
                    if ((!device.whatsappNumber || !device.phone) && client.info) {
                        let phoneNumber = null;
                        
                        if (client.info.wid && client.info.wid.user) {
                            phoneNumber = client.info.wid.user;
                        } else if (client.info.me && client.info.me.user) {
                            phoneNumber = client.info.me.user;
                        }
                        
                        if (phoneNumber) {
                            await Device.updateOne(
                                { deviceId: device.deviceId },
                                {
                                    phone: phoneNumber,
                                    whatsappNumber: phoneNumber,
                                    updatedAt: new Date()
                                }
                            );
                            console.log(`✅ Updated phone for ${device.deviceId}: ${phoneNumber}`);
                        }
                    }
                    
                } catch (e) {
                    console.log(`Error updating device ${device.deviceId}:`, e.message);
                }
            }
        }
        
        // Refresh devices after updates
        const updatedDevices = await Device.find().sort({ createdAt: -1 });
        
        // Debug log
        updatedDevices.forEach(device => {
            console.log(`📱 Device ${device.deviceId}:`, {
                whatsappNumber: device.whatsappNumber,
                phone: device.phone,
                whatsappName: device.whatsappName,
                ipAddress: device.ipAddress,
                status: device.status,
                connectionStatus: device.connectionStatus
            });
        });
        
         res.render('WhatsappScane', { 
            devices: updatedDevices,
            user: req.session.user || req.user || {
                role: 'SuperAdmin',
                firstName: 'Admin',
                lastName: 'User',
                email: 'admin@example.com'
            }
        });
    } catch (error) {
        console.error('Error fetching devices:', error);
        res.status(500).send('Internal Server Error');
    }
});

// ADD DEVICE
router.post('/add-device', async (req, res) => {
    try {
        console.log('📝 Add device request received');
        const deviceId = await createWhatsAppClient(req);
        res.json({ 
            status: true, 
            deviceId,
            message: 'Device created successfully' 
        });
    } catch (err) {
        console.log('🔥 ADD DEVICE ERROR:', err);
        res.status(500).json({ 
            status: false, 
            msg: err.message,
            code: 'DEVICE_CREATION_FAILED'
        });
    }
});

// GET QR / STATUS
router.get('/get-qr/:deviceId', async (req, res) => {
    try {
        const { deviceId } = req.params;
        
        // Check memory first
        const data = qrMemory[deviceId];
        
        if (data === 'CONNECTED') {
            const device = await Device.findOne({ deviceId });
            
            // Try to get updated info from active client
            let whatsappNumber = device?.whatsappNumber || device?.phone;
            let whatsappName = device?.whatsappName || 'WhatsApp Device';
            
            if (clients[deviceId]) {
                try {
                    const client = clients[deviceId];
                    if (client.info) {
                        // Update phone number
                        if (!whatsappNumber) {
                            if (client.info.wid && client.info.wid.user) {
                                whatsappNumber = client.info.wid.user;
                            } else if (client.info.me && client.info.me.user) {
                                whatsappNumber = client.info.me.user;
                            }
                        }
                        
                        // Update name
                        if (whatsappName === 'WhatsApp Device' || !whatsappName) {
                            if (client.info.pushname && client.info.pushname !== '') {
                                whatsappName = client.info.pushname;
                            } else if (client.info.name && client.info.name !== '') {
                                whatsappName = client.info.name;
                            } else if (client.info.me && client.info.me.name) {
                                whatsappName = client.info.me.name;
                            }
                        }
                        
                        // Save updates
                        const updates = {};
                        if (whatsappNumber && whatsappNumber !== device?.whatsappNumber) {
                            updates.whatsappNumber = whatsappNumber;
                            updates.phone = whatsappNumber;
                        }
                        if (whatsappName !== device?.whatsappName) {
                            updates.whatsappName = whatsappName;
                        }
                        
                        if (Object.keys(updates).length > 0) {
                            updates.updatedAt = new Date();
                            await Device.updateOne({ deviceId }, updates);
                        }
                    }
                } catch (e) {
                    console.log('Error getting info from client:', e.message);
                }
            }
            
            return res.json({ 
                status: 'CONNECTED',
                connectionStatus: 'online',
                phone: whatsappNumber,
                whatsappNumber: whatsappNumber,
                whatsappName: whatsappName,
                message: 'Device is connected'
            });
        }
        
        if (data) {
            return res.json({
                status: 'SCANNING',
                connectionStatus: 'pending',
                qr: data
            });
        }
        
        // Check database
        const device = await Device.findOne({ deviceId });
        if (!device) {
            return res.json({ 
                status: false, 
                message: 'Device not found' 
            });
        }
        
        if (device.status === 'CONNECTED') {
            return res.json({ 
                status: 'CONNECTED',
                connectionStatus: 'online',
                phone: device.whatsappNumber || device.phone,
                whatsappNumber: device.whatsappNumber || device.phone,
                whatsappName: device.whatsappName
            });
        }
        
        if (device.qrCode) {
            qrMemory[deviceId] = device.qrCode;
            return res.json({
                status: 'SCANNING',
                connectionStatus: 'pending',
                qr: device.qrCode
            });
        }
        
        return res.json({ 
            status: false, 
            message: 'QR not generated yet',
            deviceStatus: device.status 
        });
        
    } catch (error) {
        console.error('Error getting QR:', error);
        res.status(500).json({ 
            status: false, 
            message: 'Internal server error' 
        });
    }
});

// MANUAL UPDATE NAME
router.post('/update-name/:deviceId', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { name } = req.body;
        
        if (!name || name.trim() === '') {
            return res.json({ 
                status: false, 
                message: 'Name is required' 
            });
        }
        
        await Device.updateOne(
            { deviceId },
            {
                whatsappName: name.trim(),
                updatedAt: new Date()
            }
        );
        
        res.json({ 
            status: true, 
            message: 'Name updated successfully',
            name: name.trim()
        });
    } catch (error) {
        console.error('Error updating name:', error);
        res.status(500).json({ 
            status: false, 
            message: error.message 
        });
    }
});

// GET CLIENT INFO (FOR DEBUGGING)
router.get('/debug-info/:deviceId', async (req, res) => {
    try {
        const { deviceId } = req.params;
        
        if (clients[deviceId]) {
            const client = clients[deviceId];
            const device = await Device.findOne({ deviceId });
            
            const response = {
                status: true,
                deviceInfo: device,
                clientInfo: client.info ? {
                    // Safely stringify to avoid circular references
                    wid: client.info.wid,
                    me: client.info.me,
                    pushname: client.info.pushname,
                    name: client.info.name,
                    platform: client.info.platform,
                    _data: client.info._data ? 'Available' : 'Not available'
                } : 'No client info',
                clientState: client.state
            };
            
            // Try to get contacts for debugging
            try {
                const contacts = await client.getContacts();
                const myContact = contacts.find(c => c.isMe);
                response.myContact = myContact ? {
                    number: myContact.number,
                    name: myContact.name,
                    pushname: myContact.pushname,
                    shortName: myContact.shortName
                } : 'Not found in contacts';
            } catch (e) {
                response.contactsError = e.message;
            }
            
            res.json(response);
        } else {
            res.json({ 
                status: false, 
                message: 'Client not active for this device' 
            });
        }
    } catch (error) {
        res.status(500).json({ 
            status: false, 
            error: error.message 
        });
    }
});

// SEND TEST MESSAGE (To trigger name detection)
router.post('/send-test-message/:deviceId', async (req, res) => {
    try {
        const { deviceId } = req.params;
        
        if (clients[deviceId]) {
            const client = clients[deviceId];
            const device = await Device.findOne({ deviceId });
            
            if (device && device.whatsappNumber) {
                // Send a test message to ourselves
                const number = `${device.whatsappNumber}@c.us`;
                const message = await client.sendMessage(number, 'Test message for name detection');
                
                res.json({ 
                    status: true, 
                    message: 'Test message sent successfully',
                    messageId: message.id._serialized
                });
            } else {
                res.json({ 
                    status: false, 
                    message: 'Device has no phone number' 
                });
            }
        } else {
            res.json({ 
                status: false, 
                message: 'Client not active' 
            });
        }
    } catch (error) {
        res.status(500).json({ 
            status: false, 
            error: error.message 
        });
    }
});

// DELETE DEVICE
router.delete('/delete-device/:deviceId', async (req, res) => {
    try {
        const { deviceId } = req.params;

        // Destroy client if exists
        if (clients[deviceId]) {
            try {
                await clients[deviceId].destroy();
                console.log(`Client destroyed for device: ${deviceId}`);
            } catch (error) {
                console.error('Error destroying client:', error);
            }
            delete clients[deviceId];
        }

        // Delete from database
        const result = await Device.deleteOne({ deviceId });
        
        // Delete from memory
        delete qrMemory[deviceId];

        if (result.deletedCount > 0) {
            res.json({ 
                status: true, 
                message: 'Device deleted successfully' 
            });
        } else {
            res.json({ 
                status: false, 
                message: 'Device not found' 
            });
        }
    } catch (error) {
        console.error('Error deleting device:', error);
        res.status(500).json({ 
            status: false, 
            message: error.message 
        });
    }
});

// =========================
// EXPORT
// =========================
module.exports = { router, clients };