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

    // ===== GET CURRENT USER FROM SESSION =====
    const user = req.session.user || req.user;
    if (!user) {
        throw new Error('User not authenticated');
    }

    console.log('👤 Creating device for user:', {
        userId: user._id,
        role: user.role,
        email: user.email
    });

    // SAVE DEVICE WITH USER INFO
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
        qrCode: null,
        // ===== USER INFO =====
        createdBy: user._id,
        createdByRole: user.role,
        createdByEmail: user.email
    });

    console.log(`📱 Device created: ${deviceId}, IP: ${ipAddress}, User: ${user.email} (${user.role})`);

    const client = new Client({
        authStrategy: new LocalAuth({
            clientId: deviceId,
            dataPath: './.wwebjs_auth'
        }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
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
                '--window-size=1920,1080'
            ],
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

    // ✅ READY EVENT
    client.on('ready', async () => {
        console.log(`✅ READY EVENT: ${deviceId}`);
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        let phoneNumber = null;
        let whatsappName = 'WhatsApp Device';
        
        try {
            if (client.info) {
                console.log('🔍 Client info found:', JSON.stringify(client.info, null, 2));
                
                // Get phone number
                if (client.info.wid && client.info.wid.user) {
                    phoneNumber = client.info.wid.user;
                } else if (client.info.me && client.info.me.user) {
                    phoneNumber = client.info.me.user;
                } else if (client.info._data && client.info._data.wid && client.info._data.wid.user) {
                    phoneNumber = client.info._data.wid.user;
                }
                
                // Get name
                if (client.info.pushname) {
                    whatsappName = client.info.pushname;
                } else if (client.info.name) {
                    whatsappName = client.info.name;
                } else if (client.info.me && client.info.me.name) {
                    whatsappName = client.info.me.name;
                } else if (client.info._data && client.info._data.pushname) {
                    whatsappName = client.info._data.pushname;
                } else if (client.info._data && client.info._data.name) {
                    whatsappName = client.info._data.name;
                }
            }
            
        } catch (error) {
            console.log('Error in ready event:', error.message);
        }
        
        // Update database
        const updateData = {
            status: 'CONNECTED',
            connectionStatus: 'online',
            connectedAt: new Date(),
            lastConnected: new Date(),
            updatedAt: new Date(),
            whatsappName: whatsappName
        };
        
        if (phoneNumber) {
            updateData.phone = phoneNumber;
            updateData.whatsappNumber = phoneNumber;
        }
        
        await Device.updateOne({ deviceId }, updateData);
        
        qrMemory[deviceId] = 'CONNECTED';
        console.log(`✅ WhatsApp READY and UPDATED: ${phoneNumber || deviceId} - ${whatsappName}`);
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

// PAGE - GET DEVICES (FILTERED BY USER ROLE)
router.get('/scan/whatsapp', async (req, res) => {
    try {
        // ===== GET CURRENT USER =====
        const user = req.session.user || req.user;
        if (!user) {
            return res.status(401).send('Unauthorized');
        }

        console.log('👤 User accessing devices:', {
            userId: user._id,
            role: user.role,
            email: user.email
        });

        // ===== FILTER DEVICES BASED ON USER ROLE =====
        let devices = [];
        
        if (user.role === 'SuperAdmin') {
            // SuperAdmin can see ALL devices
            devices = await Device.find().sort({ createdAt: -1 });
            console.log(`🔍 SuperAdmin viewing ${devices.length} devices (ALL)`);
        } else {
            // Other roles can only see their own devices
            devices = await Device.find({ 
                createdBy: user._id 
            }).sort({ createdAt: -1 });
            console.log(`🔍 ${user.role} viewing ${devices.length} devices (OWN)`);
        }
        
        console.log(`📊 Found ${devices.length} devices for user ${user.email}`);
        
        // Update names for connected devices
        for (const device of devices) {
            if (device.status === 'CONNECTED' && clients[device.deviceId]) {
                try {
                    const client = clients[device.deviceId];
                    
                    if (device.whatsappName === 'WhatsApp Device' || !device.whatsappName) {
                        let newName = device.whatsappName;
                        
                        if (client.info) {
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
                                    { whatsappName: newName }
                                );
                            }
                        }
                    }
                    
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
                                    whatsappNumber: phoneNumber
                                }
                            );
                        }
                    }
                    
                } catch (e) {
                    console.log(`Error updating device ${device.deviceId}:`, e.message);
                }
            }
        }
        
        // Refresh devices after updates
        if (user.role === 'SuperAdmin') {
            devices = await Device.find().sort({ createdAt: -1 });
        } else {
            devices = await Device.find({ createdBy: user._id }).sort({ createdAt: -1 });
        }
        
        // Debug log
        devices.forEach(device => {
            console.log(`📱 Device ${device.deviceId}:`, {
                whatsappNumber: device.whatsappNumber,
                phone: device.phone,
                whatsappName: device.whatsappName,
                status: device.status,
                createdBy: device.createdByEmail,
                role: device.createdByRole
            });
        });
        
        res.render('WhatsappScane', { 
            devices: devices,
            user: user,
            currentUserRole: user.role,
            currentUserId: user._id
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
        
        // ===== CHECK IF USER IS AUTHENTICATED =====
        const user = req.session.user || req.user;
        if (!user) {
            return res.status(401).json({ 
                status: false, 
                msg: 'User not authenticated' 
            });
        }
        
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
        
        // ===== CHECK DEVICE OWNERSHIP =====
        const user = req.session.user || req.user;
        const device = await Device.findOne({ deviceId });
        
        if (!device) {
            return res.json({ 
                status: false, 
                message: 'Device not found' 
            });
        }
        
        // Check if user has access to this device
        if (user.role !== 'SuperAdmin' && device.createdBy.toString() !== user._id.toString()) {
            return res.status(403).json({ 
                status: false, 
                message: 'You do not have permission to access this device' 
            });
        }
        
        // Check memory first
        const data = qrMemory[deviceId];
        
        if (data === 'CONNECTED') {
            // Try to get updated info from active client
            let whatsappNumber = device?.whatsappNumber || device?.phone;
            let whatsappName = device?.whatsappName || 'WhatsApp Device';
            
            if (clients[deviceId]) {
                try {
                    const client = clients[deviceId];
                    if (client.info) {
                        if (!whatsappNumber) {
                            if (client.info.wid && client.info.wid.user) {
                                whatsappNumber = client.info.wid.user;
                            } else if (client.info.me && client.info.me.user) {
                                whatsappNumber = client.info.me.user;
                            }
                        }
                        
                        if (whatsappName === 'WhatsApp Device' || !whatsappName) {
                            if (client.info.pushname && client.info.pushname !== '') {
                                whatsappName = client.info.pushname;
                            } else if (client.info.name && client.info.name !== '') {
                                whatsappName = client.info.name;
                            } else if (client.info.me && client.info.me.name) {
                                whatsappName = client.info.me.name;
                            }
                        }
                        
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
        
        // ===== CHECK DEVICE OWNERSHIP =====
        const user = req.session.user || req.user;
        const device = await Device.findOne({ deviceId });
        
        if (!device) {
            return res.json({ 
                status: false, 
                message: 'Device not found' 
            });
        }
        
        if (user.role !== 'SuperAdmin' && device.createdBy.toString() !== user._id.toString()) {
            return res.status(403).json({ 
                status: false, 
                message: 'You do not have permission to update this device' 
            });
        }
        
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

// DELETE DEVICE
router.delete('/delete-device/:deviceId', async (req, res) => {
    try {
        const { deviceId } = req.params;
        
        // ===== CHECK DEVICE OWNERSHIP =====
        const user = req.session.user || req.user;
        const device = await Device.findOne({ deviceId });
        
        if (!device) {
            return res.json({ 
                status: false, 
                message: 'Device not found' 
            });
        }
        
        // SuperAdmin can delete any device, others can only delete their own
        if (user.role !== 'SuperAdmin' && device.createdBy.toString() !== user._id.toString()) {
            return res.status(403).json({ 
                status: false, 
                message: 'You do not have permission to delete this device' 
            });
        }

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