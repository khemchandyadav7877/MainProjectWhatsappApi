const router = require('express').Router();
const mongoose = require('mongoose');
const Condevice = require('../models/Condevice');
const Group = require('../models/Group');

/* ===============================
   MIDDLEWARE - Check Authentication
=============================== */
const checkAuth = (req, res, next) => {
    const user = req.session.user || req.user;
    if (!user) {
        return res.redirect('/login');
    }
    next();
};

/* ===============================
   ADD DEVICE PAGE (All authenticated users can add)
================================ */
router.get('/devices/add', checkAuth, (req, res) => {
    const user = req.session.user || req.user;
    
    res.render('Devices/AddDevice', {
        activeTab: 'devices',
        user: user
    });
});

/* ===============================
   SAVE DEVICE - Always save with createdBy = current user
================================ */
router.post('/devices/add', checkAuth, async (req, res) => {
    try {
        const { name, phoneNumber, whatsappNumber, email, notes, status } = req.body;
        const user = req.session.user || req.user;

        if (!name || !phoneNumber) {
            return res.status(400).send('Required fields missing');
        }

        // Check if phone number already exists for THIS USER only
        const exists = await Condevice.findOne({ 
            phoneNumber,
            createdBy: user._id  // Only check within this user's contacts
        });
        
        if (exists) {
            return res.status(400).send('You already have this contact');
        }

        // ALWAYS save with current user's ID
        await Condevice.create({
            name,
            phoneNumber,
            whatsappNumber: whatsappNumber || null,
            email: email || null,
            notes,
            status: status || 'inactive',
            isConnected: false,
            createdBy: user._id,  // CRITICAL: Always set to current user
            createdByRole: user.role,
            createdByEmail: user.email
        });

        res.redirect('/devices');

    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

/* ===============================
   ALL DEVICES - Each user sees ONLY their own devices
================================ */
router.get('/devices', checkAuth, async (req, res) => {
    try {
        const { search, status, sort } = req.query;
        const user = req.session.user || req.user;

        // CRITICAL: Always filter by createdBy = current user
        // No one sees anyone else's data - like WhatsApp
        let query = { 
            createdBy: user._id  // ONLY show devices created by this user
        };

        // Search filter
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { phoneNumber: { $regex: search, $options: 'i' } },
                { whatsappNumber: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        // Status filter
        if (status && status !== 'all') {
            query.status = status;
        }

        let devicesQuery = Condevice.find(query);

        // Sorting
        if (sort === 'oldest') {
            devicesQuery = devicesQuery.sort({ createdAt: 1 });
        } else if (sort === 'name') {
            devicesQuery = devicesQuery.sort({ name: 1 });
        } else {
            devicesQuery = devicesQuery.sort({ createdAt: -1 });
        }

        const devices = await devicesQuery;

        // Stats are also filtered by current user only
        const stats = {
            total: await Condevice.countDocuments({ createdBy: user._id }),
            active: await Condevice.countDocuments({ createdBy: user._id, status: 'active' }),
            inactive: await Condevice.countDocuments({ createdBy: user._id, status: 'inactive' }),
            connected: await Condevice.countDocuments({ createdBy: user._id, isConnected: true })
        };

        console.log(`👤 ${user.role} (${user.email}) viewing ${devices.length} of their own devices`);

        res.render('Devices/AllDevice', {
            devices,
            stats,
            filters: req.query,
            activeTab: 'devices',
            user: user
        });

    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

/* ===============================
   EDIT DEVICE PAGE - Check ownership
================================ */
router.get('/devices/edit/:id', checkAuth, async (req, res) => {
    try {
        const user = req.session.user || req.user;
        
        // CRITICAL: Only find device that belongs to this user
        const device = await Condevice.findOne({ 
            _id: req.params.id,
            createdBy: user._id  // Must belong to current user
        });
        
        if (!device) {
            console.log(`❌ User ${user.email} tried to edit device not owned by them`);
            return res.redirect('/devices');
        }

        res.render('Devices/EditDevice', { 
            device,
            user: user
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

/* ===============================
   UPDATE DEVICE - Check ownership
================================ */
router.post('/devices/edit/:id', checkAuth, async (req, res) => {
    try {
        const { name, phoneNumber, whatsappNumber, email, notes, status } = req.body;
        const user = req.session.user || req.user;
        
        // CRITICAL: Only update device that belongs to this user
        const device = await Condevice.findOne({ 
            _id: req.params.id,
            createdBy: user._id
        });
        
        if (!device) {
            console.log(`❌ User ${user.email} tried to update device not owned by them`);
            return res.redirect('/devices');
        }

        if (!name || !phoneNumber) {
            return res.status(400).send('Required fields missing');
        }

        // Check if phone number already exists for another of THIS USER's devices
        if (phoneNumber !== device.phoneNumber) {
            const existingPhone = await Condevice.findOne({ 
                phoneNumber, 
                createdBy: user._id,
                _id: { $ne: req.params.id } 
            });
            if (existingPhone) {
                return res.status(400).send('Phone number already exists in your contacts');
            }
        }

        await Condevice.findByIdAndUpdate(req.params.id, {
            name,
            phoneNumber,
            whatsappNumber: whatsappNumber || null,
            email: email || null,
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
   TOGGLE STATUS - Check ownership
================================ */
router.get('/devices/status/:id', checkAuth, async (req, res) => {
    try {
        const user = req.session.user || req.user;
        
        // CRITICAL: Only toggle device that belongs to this user
        const device = await Condevice.findOne({ 
            _id: req.params.id,
            createdBy: user._id
        });
        
        if (!device) {
            console.log(`❌ User ${user.email} tried to toggle device not owned by them`);
            return res.redirect('/devices');
        }

        device.status = device.status === 'active' ? 'inactive' : 'active';
        await device.save();

        res.redirect('/devices');

    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

/* ===============================
   DELETE DEVICE - Check ownership
================================ */
router.get('/devices/delete/:id', checkAuth, async (req, res) => {
    try {
        const user = req.session.user || req.user;
        
        // CRITICAL: Only delete device that belongs to this user
        const device = await Condevice.findOne({ 
            _id: req.params.id,
            createdBy: user._id
        });
        
        if (!device) {
            console.log(`❌ User ${user.email} tried to delete device not owned by them`);
            return res.redirect('/devices');
        }

        await Condevice.findByIdAndDelete(req.params.id);
        res.redirect('/devices');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

/* ===============================
   CONTACT GROUP PAGE - Each user sees ONLY their own contacts
================================ */
router.get('/contactgroup', checkAuth, async (req, res) => {
    try {
        const user = req.session.user || req.user;
        
        // CRITICAL: Only show contacts created by this user
        const devices = await Condevice.find({ 
            phoneNumber: { $exists: true, $ne: '' },
            createdBy: user._id  // Only this user's contacts
        }).sort({ name: 1 });

        res.render("Devices/ContactGroup", {
            devices,
            activeTab: 'devices',
            user: user
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

/* ===============================
   API: GET ALL CONTACTS - Only user's own contacts
================================ */
router.get('/api/contacts/all', checkAuth, async (req, res) => {
    try {
        const { search } = req.query;
        const user = req.session.user || req.user;
        
        // CRITICAL: Only this user's contacts
        let query = { 
            phoneNumber: { $exists: true, $ne: '' },
            createdBy: user._id  // Only this user's contacts
        };

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { phoneNumber: { $regex: search, $options: 'i' } },
                { whatsappNumber: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        const contacts = await Condevice.find(query)
            .select('name phoneNumber whatsappNumber email status isConnected createdBy')
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
   API: CREATE GROUP - Using user's own contacts only
================================ */
router.post('/api/groups/create', checkAuth, async (req, res) => {
    try {
        const { groupName, description, contactIds } = req.body;
        const user = req.session.user || req.user;

        if (!groupName || !contactIds || contactIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Group name and at least one contact are required'
            });
        }

        // CRITICAL: Only allow using contacts that belong to this user
        const validContacts = await Condevice.find({
            _id: { $in: contactIds },
            createdBy: user._id  // Must belong to this user
        });

        if (validContacts.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid contacts found'
            });
        }

        // Create group with user's ID
        const newGroup = await Group.create({
            name: groupName,
            description: description || '',
            contacts: validContacts.map(c => c._id),
            totalContacts: validContacts.length,
            createdBy: user._id  // Group belongs to this user
        });

        await newGroup.populate('contacts', 'name phoneNumber whatsappNumber email status isConnected');

        res.json({
            success: true,
            message: 'Group created successfully',
            data: {
                id: newGroup._id,
                name: newGroup.name,
                description: newGroup.description,
                contacts: newGroup.contacts,
                totalContacts: newGroup.totalContacts,
                createdAt: newGroup.createdAt
            }
        });

    } catch (err) {
        console.error('Group creation error:', err);
        res.status(500).json({
            success: false,
            message: 'Error creating group: ' + err.message
        });
    }
});

/* ===============================
   API: GET ALL GROUPS - User's own groups only
================================ */
router.get('/api/groups', checkAuth, async (req, res) => {
    try {
        const user = req.session.user || req.user;
        
        // CRITICAL: Only groups created by this user
        const groups = await Group.find({ createdBy: user._id })
            .sort({ createdAt: -1 })
            .select('name description totalContacts createdAt createdBy');

        res.json({
            success: true,
            count: groups.length,
            data: groups.map(group => ({
                id: group._id,
                name: group.name,
                description: group.description,
                totalContacts: group.totalContacts,
                createdAt: group.createdAt
            }))
        });
    } catch (err) {
        console.error('Error loading groups:', err);
        res.status(500).json({
            success: false,
            message: 'Error fetching groups'
        });
    }
});

/* ===============================
   API: GET SINGLE GROUP - Check ownership
================================ */
router.get('/api/groups/:id', checkAuth, async (req, res) => {
    try {
        const user = req.session.user || req.user;
        
        // CRITICAL: Only group created by this user
        const group = await Group.findOne({ 
            _id: req.params.id,
            createdBy: user._id
        }).populate('contacts', 'name phoneNumber whatsappNumber email status isConnected');

        if (!group) {
            return res.status(404).json({
                success: false,
                message: 'Group not found'
            });
        }

        res.json({
            success: true,
            data: {
                id: group._id,
                name: group.name,
                description: group.description,
                contacts: group.contacts,
                totalContacts: group.totalContacts,
                createdAt: group.createdAt
            }
        });
    } catch (err) {
        console.error('Error fetching group:', err);
        res.status(500).json({
            success: false,
            message: 'Error fetching group'
        });
    }
});

/* ===============================
   API: DELETE GROUP - Check ownership
================================ */
router.delete('/api/groups/:id', checkAuth, async (req, res) => {
    try {
        const user = req.session.user || req.user;
        
        // CRITICAL: Only delete group created by this user
        const group = await Group.findOne({ 
            _id: req.params.id,
            createdBy: user._id
        });
        
        if (!group) {
            return res.status(404).json({
                success: false,
                message: 'Group not found'
            });
        }

        await Group.findByIdAndDelete(req.params.id);

        res.json({
            success: true,
            message: 'Group deleted successfully'
        });
    } catch (err) {
        console.error('Error deleting group:', err);
        res.status(500).json({
            success: false,
            message: 'Error deleting group'
        });
    }
});

/* ===============================
   API: UPDATE GROUP - Check ownership
================================ */
router.put('/api/groups/:id', checkAuth, async (req, res) => {
    try {
        const { name, description, contactIds } = req.body;
        const user = req.session.user || req.user;
        
        // CRITICAL: Only update group created by this user
        const group = await Group.findOne({ 
            _id: req.params.id,
            createdBy: user._id
        });
        
        if (!group) {
            return res.status(404).json({
                success: false,
                message: 'Group not found'
            });
        }

        // If contactIds provided, validate they belong to this user
        let validContacts = [];
        if (contactIds && contactIds.length > 0) {
            validContacts = await Condevice.find({
                _id: { $in: contactIds },
                createdBy: user._id  // Must belong to this user
            });
        }

        const updateData = {
            name: name || group.name,
            description: description !== undefined ? description : group.description
        };

        if (contactIds && contactIds.length > 0) {
            updateData.contacts = validContacts.map(c => c._id);
            updateData.totalContacts = validContacts.length;
        }

        const updatedGroup = await Group.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true }
        ).populate('contacts', 'name phoneNumber whatsappNumber email status isConnected');

        res.json({
            success: true,
            message: 'Group updated successfully',
            data: {
                id: updatedGroup._id,
                name: updatedGroup.name,
                description: updatedGroup.description,
                contacts: updatedGroup.contacts,
                totalContacts: updatedGroup.totalContacts,
                createdAt: updatedGroup.createdAt
            }
        });
    } catch (err) {
        console.error('Error updating group:', err);
        res.status(500).json({
            success: false,
            message: 'Error updating group'
        });
    }
});

/* ===============================
   API: GET ALL DEVICES (JSON) - User's own only
================================ */
router.get('/api/devices', checkAuth, async (req, res) => {
    try {
        const { search, status } = req.query;
        const user = req.session.user || req.user;
        
        // CRITICAL: Only this user's devices
        let query = { createdBy: user._id };

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { phoneNumber: { $regex: search, $options: 'i' } },
                { whatsappNumber: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        if (status && status !== 'all') query.status = status;

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
   API: CREATE DEVICE - Always with current user
================================ */
router.post('/api/devices', checkAuth, async (req, res) => {
    try {
        const { name, phoneNumber, whatsappNumber, email, notes, status } = req.body;
        const user = req.session.user || req.user;

        if (!name || !phoneNumber) {
            return res.status(400).json({ 
                success: false, 
                message: 'Name and phone number are required' 
            });
        }

        // Check if exists for THIS USER only
        const exists = await Condevice.findOne({ 
            phoneNumber,
            createdBy: user._id
        });
        
        if (exists) {
            return res.status(400).json({ 
                success: false, 
                message: 'You already have this contact' 
            });
        }

        const device = await Condevice.create({
            name,
            phoneNumber,
            whatsappNumber: whatsappNumber || null,
            email: email || null,
            notes: notes || '',
            status: status || 'inactive',
            isConnected: false,
            createdBy: user._id,  // CRITICAL
            createdByRole: user.role,
            createdByEmail: user.email
        });

        res.status(201).json({ 
            success: true, 
            message: 'Contact created successfully',
            data: device 
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

/* ===============================
   API: UPDATE DEVICE - Check ownership
================================ */
router.put('/api/devices/:id', checkAuth, async (req, res) => {
    try {
        const { name, phoneNumber, whatsappNumber, email, notes, status } = req.body;
        const user = req.session.user || req.user;
        
        // CRITICAL: Only update device belonging to this user
        const device = await Condevice.findOne({ 
            _id: req.params.id,
            createdBy: user._id
        });
        
        if (!device) {
            return res.status(404).json({ 
                success: false, 
                message: 'Contact not found' 
            });
        }

        // Check if phone number already exists for another of THIS USER's devices
        if (phoneNumber && phoneNumber !== device.phoneNumber) {
            const existingPhone = await Condevice.findOne({ 
                phoneNumber, 
                createdBy: user._id,
                _id: { $ne: req.params.id } 
            });
            if (existingPhone) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Phone number already exists in your contacts' 
                });
            }
        }

        const updatedDevice = await Condevice.findByIdAndUpdate(
            req.params.id,
            {
                name: name || device.name,
                phoneNumber: phoneNumber || device.phoneNumber,
                whatsappNumber: whatsappNumber !== undefined ? whatsappNumber : device.whatsappNumber,
                email: email !== undefined ? email : device.email,
                notes: notes !== undefined ? notes : device.notes,
                status: status || device.status
            },
            { new: true }
        );

        res.json({ 
            success: true, 
            message: 'Contact updated successfully',
            data: updatedDevice 
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

/* ===============================
   API: DELETE DEVICE - Check ownership
================================ */
router.delete('/api/devices/:id', checkAuth, async (req, res) => {
    try {
        const user = req.session.user || req.user;
        
        // CRITICAL: Only delete device belonging to this user
        const device = await Condevice.findOne({ 
            _id: req.params.id,
            createdBy: user._id
        });
        
        if (!device) {
            return res.status(404).json({ 
                success: false, 
                message: 'Contact not found' 
            });
        }

        await Condevice.findByIdAndDelete(req.params.id);
        
        res.json({ 
            success: true, 
            message: 'Contact deleted successfully' 
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

/* ===============================
   API: GET SINGLE DEVICE - Check ownership
================================ */
router.get('/api/devices/:id', checkAuth, async (req, res) => {
    try {
        const user = req.session.user || req.user;
        
        // CRITICAL: Only device belonging to this user
        const device = await Condevice.findOne({ 
            _id: req.params.id,
            createdBy: user._id
        });
        
        if (!device) {
            return res.status(404).json({ 
                success: false, 
                message: 'Contact not found' 
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

module.exports = router;