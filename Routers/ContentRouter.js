const router = require('express').Router();
const mongoose = require('mongoose');  // ✅ ADD THIS LINE - MISSING IMPORT
const Condevice = require('../models/Condevice');

/* ===============================
   ADD DEVICE PAGE
================================ */
router.get('/devices/add', (req, res) => {
    res.render('Devices/AddDevice', {
        activeTab: 'devices',   // sidebar highlight (optional)
        user: req.session.user || req.user || {
            role: 'SuperAdmin',
            firstName: 'Admin',
            lastName: 'User',
            email: 'admin@example.com'
        }
    });
});


/* ===============================
   SAVE DEVICE
================================ */
router.post('/devices/add', async (req, res) => {
    try {
        const { name, phoneNumber, deviceType, carrier, notes, status } = req.body;

        if (!name || !phoneNumber || !deviceType) {
            return res.status(400).send('Required fields missing');
        }

        const exists = await Condevice.findOne({ phoneNumber });
        if (exists) {
            return res.status(400).send('Device already exists');
        }

        await Condevice.create({
            name,
            phoneNumber,
            deviceType: deviceType.toLowerCase(),
            carrier: carrier ? carrier.toLowerCase() : 'unknown',
            notes,
            status: status || 'inactive',
            isConnected: false
        });

        res.redirect('/devices');

    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

/* ===============================
   ALL DEVICES + STATS + SEARCH/FILTER
================================ */
router.get('/devices', async (req, res) => {
    try {
        const { search, status, type, carrier, sort } = req.query;

        let query = {};

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { phoneNumber: { $regex: search, $options: 'i' } }
            ];
        }

        if (status && status !== 'all') query.status = status;
        if (type && type !== 'all') query.deviceType = type.toLowerCase();
        if (carrier && carrier !== 'all') query.carrier = carrier.toLowerCase();

        let devicesQuery = Condevice.find(query);

        // sorting
        if (sort === 'oldest') devicesQuery = devicesQuery.sort({ createdAt: 1 });
        else devicesQuery = devicesQuery.sort({ createdAt: -1 });

        const devices = await devicesQuery;

        const stats = {
            total: await Condevice.countDocuments(),
            active: await Condevice.countDocuments({ status: 'active' }),
            inactive: await Condevice.countDocuments({ status: 'inactive' }),
            connected: await Condevice.countDocuments({ isConnected: true })
        };

        res.render('Devices/AllDevice', {
            devices,
            stats,
            filters: req.query,
            activeTab: 'devices',
            user: req.session.user || req.user || {
                role: 'SuperAdmin',
                firstName: 'Admin',
                lastName: 'User',
                email: 'admin@example.com'
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});


/* ===============================
   VIEW SINGLE DEVICE
================================ */
router.get('/devices/view/:id', async (req, res) => {
    try {
        const device = await Condevice.findById(req.params.id);
        if (!device) {
            return res.redirect('/devices');
        }
        res.render('Devices/ViewDevice', { device });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

/* ===============================
   EDIT DEVICE PAGE
================================ */
router.get('/devices/edit/:id', async (req, res) => {
    try {
        const device = await Condevice.findById(req.params.id);
        if (!device) {
            return res.redirect('/devices');
        }
        res.render('Devices/EditDevice', { device });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

/* ===============================
   UPDATE DEVICE
================================ */
router.post('/devices/edit/:id', async (req, res) => {
    try {
        const { name, phoneNumber, deviceType, carrier, notes, status } = req.body;
        
        if (!name || !phoneNumber || !deviceType) {
            return res.status(400).send('Required fields missing');
        }

        await Condevice.findByIdAndUpdate(req.params.id, {
            name,
            phoneNumber,
            deviceType: deviceType.toLowerCase(),
            carrier: carrier ? carrier.toLowerCase() : 'unknown',
            notes,
            status: status || 'inactive'
        });

        res.redirect('/devices');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

/* ===============================
   TOGGLE STATUS (ACTIVE / INACTIVE)
================================ */
router.get('/devices/status/:id', async (req, res) => {
    try {
        const device = await Condevice.findById(req.params.id);
        if (!device) return res.redirect('/devices');

        device.status = device.status === 'active' ? 'inactive' : 'active';
        await device.save();

        res.redirect('/devices');

    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

/* ===============================
   DELETE DEVICE
================================ */
router.get('/devices/delete/:id', async (req, res) => {
    try {
        await Condevice.findByIdAndDelete(req.params.id);
        res.redirect('/devices');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

/* ===============================
   API: GET ALL DEVICES (JSON)
================================ */
router.get('/api/devices', async (req, res) => {
    try {
        const { search, status, type, carrier } = req.query;
        let query = {};

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { phoneNumber: { $regex: search, $options: 'i' } }
            ];
        }

        if (status && status !== 'all') query.status = status;
        if (type && type !== 'all') query.deviceType = type.toLowerCase();
        if (carrier && carrier !== 'all') query.carrier = carrier.toLowerCase();

        const devices = await Condevice.find(query).sort({ createdAt: -1 });
        
        res.json({
            success: true,
            count: devices.length,
            data: devices
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

/* ===============================
   API: GET ALL CONTACTS (FOR CAMPAIGN)
================================ */
router.get('/api/condevices/contacts', async (req, res) => {
    try {
        // Fetch all devices that have phone numbers
        const contacts = await Condevice.find(
            { phoneNumber: { $exists: true, $ne: '' } },
            { phoneNumber: 1, name: 1, _id: 0 }
        ).sort({ name: 1 });
        
        res.json({
            success: true,
            count: contacts.length,
            data: contacts
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching contacts' 
        });
    }
});

/* ===============================
   API: GET SINGLE DEVICE
================================ */
router.get('/api/devices/:id', async (req, res) => {
    try {
        const device = await Condevice.findById(req.params.id);
        if (!device) {
            return res.status(404).json({ 
                success: false, 
                message: 'Device not found' 
            });
        }
        res.json({ 
            success: true, 
            data: device 
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

/* ===============================
   API: CREATE DEVICE
================================ */
router.post('/api/devices', async (req, res) => {
    try {
        const { name, phoneNumber, deviceType, carrier, notes, status } = req.body;

        if (!name || !phoneNumber || !deviceType) {
            return res.status(400).json({ 
                success: false, 
                message: 'Name, phone number and device type are required' 
            });
        }

        const exists = await Condevice.findOne({ phoneNumber });
        if (exists) {
            return res.status(400).json({ 
                success: false, 
                message: 'Device already exists' 
            });
        }

        const device = await Condevice.create({
            name,
            phoneNumber,
            deviceType: deviceType.toLowerCase(),
            carrier: carrier ? carrier.toLowerCase() : 'unknown',
            notes: notes || '',
            status: status || 'inactive',
            isConnected: false
        });

        res.status(201).json({ 
            success: true, 
            message: 'Device created successfully',
            data: device 
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

/* ===============================
   API: UPDATE DEVICE
================================ */
router.put('/api/devices/:id', async (req, res) => {
    try {
        const { name, phoneNumber, deviceType, carrier, notes, status } = req.body;
        
        const device = await Condevice.findById(req.params.id);
        if (!device) {
            return res.status(404).json({ 
                success: false, 
                message: 'Device not found' 
            });
        }

        // Check if phone number already exists for another device
        if (phoneNumber && phoneNumber !== device.phoneNumber) {
            const existingPhone = await Condevice.findOne({ 
                phoneNumber, 
                _id: { $ne: req.params.id } 
            });
            if (existingPhone) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Phone number already exists' 
                });
            }
        }

        const updatedDevice = await Condevice.findByIdAndUpdate(
            req.params.id,
            {
                name: name || device.name,
                phoneNumber: phoneNumber || device.phoneNumber,
                deviceType: deviceType ? deviceType.toLowerCase() : device.deviceType,
                carrier: carrier ? carrier.toLowerCase() : device.carrier,
                notes: notes !== undefined ? notes : device.notes,
                status: status || device.status
            },
            { new: true }
        );

        res.json({ 
            success: true, 
            message: 'Device updated successfully',
            data: updatedDevice 
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

/* ===============================
   API: DELETE DEVICE
================================ */
router.delete('/api/devices/:id', async (req, res) => {
    try {
        const device = await Condevice.findById(req.params.id);
        if (!device) {
            return res.status(404).json({ 
                success: false, 
                message: 'Device not found' 
            });
        }

        await Condevice.findByIdAndDelete(req.params.id);
        
        res.json({ 
            success: true, 
            message: 'Device deleted successfully' 
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

/* ===============================
   MANAGE DEVICES PAGE
================================ */
router.get('/devices/manage', (req, res) => {
    res.render('Devices/ManageDevice.ejs');
});

/* ===============================
   CAMPAIGN PAGE
================================ */
router.get('/campaign', async (req, res) => {
    try {
        // Fetch connected devices for campaign
        const devices = await Condevice.find({ 
            isConnected: true,
            status: 'active'
        });
        
        res.render('campaign', { 
            devices: devices.map(d => ({
                deviceId: d._id,
                phone: d.phoneNumber,
                status: d.status
            }))
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }       
});

/* ===============================
   CONTACT GROUP PAGE
================================ */
router.get('/contactgroup', async (req, res) => {
    try {
        // Fetch all devices for selection
        const devices = await Condevice.find({ 
            phoneNumber: { $exists: true, $ne: '' } 
        }).sort({ name: 1 });

        res.render("Devices/ContactGroup", {
            devices,
            activeTab: 'devices',
            user: req.session.user || req.user || {
                role: 'SuperAdmin',
                firstName: 'Admin',
                lastName: 'User',
                email: 'admin@example.com'
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

/* ===============================
   API: GET ALL CONTACTS FOR GROUPING
================================ */
router.get('/api/contacts/all', async (req, res) => {
    try {
        const { search } = req.query;
        let query = { 
            phoneNumber: { $exists: true, $ne: '' } 
        };

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { phoneNumber: { $regex: search, $options: 'i' } }
            ];
        }

        const contacts = await Condevice.find(query)
            .select('name phoneNumber deviceType status isConnected')
            .sort({ name: 1 });

        res.json({
            success: true,
            count: contacts.length,
            data: contacts
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching contacts' 
        });
    }
});

/* ===============================
   API: CREATE GROUP FROM SELECTED CONTACTS
================================ */
router.post('/api/groups/create', async (req, res) => {
    try {
        const { groupName, description, contactIds } = req.body;

        if (!groupName || !contactIds || contactIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Group name and at least one contact are required'
            });
        }

        // Get full contact details
        const contacts = await Condevice.find({
            _id: { $in: contactIds }
        }).select('name phoneNumber deviceType status');

        // ✅ FIXED: Now mongoose is defined because we imported it at the top
        const group = {
            id: new mongoose.Types.ObjectId(),
            name: groupName,
            description: description || '',
            contacts: contacts,
            totalContacts: contacts.length,
            createdAt: new Date(),
            createdBy: req.session?.userId || 'system'
        };

        // Here you can save group to database if you have a Group model
        // await Group.create(group);

        res.json({
            success: true,
            message: 'Group created successfully',
            data: group
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'Error creating group: ' + err.message
        });
    }
});

/* ===============================
   API: GET ALL GROUPS
================================ */
router.get('/api/groups', async (req, res) => {
    try {
        // If you have Group model, fetch from there
        // For now, return sample data
        const groups = [
            {
                id: '1',
                name: 'VIP Customers',
                description: 'Important customers',
                totalContacts: 5,
                createdAt: new Date()
            },
            {
                id: '2',
                name: 'Test Group',
                description: 'Testing contacts',
                totalContacts: 3,
                createdAt: new Date()
            }
        ];

        res.json({
            success: true,
            count: groups.length,
            data: groups
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'Error fetching groups'
        });
    }
});

module.exports = router;