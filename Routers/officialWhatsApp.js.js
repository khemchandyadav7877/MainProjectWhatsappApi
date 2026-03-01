// routes/OfficialWhatsAppApi.js - COMPLETE VERSION

const router = require('express').Router();
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const schedule = require('node-schedule');
const FormData = require('form-data');
const csv = require('csv-parser');
const stream = require('stream');

// ===== Models =====
const OfficialWhatsAppAccount = require('../models/OfficialWhatsAppAccount');
const OfficialWhatsAppTemplate = require('../models/OfficialWhatsAppTemplate');
const OfficialWhatsAppCampaign = require('../models/OfficialWhatsAppCampaign');
const OfficialWhatsAppWebhookEvent = require('../models/OfficialWhatsAppWebhookEvent');
const Device = require('../models/Device');
const Condevice = require('../models/Condevice');

// =========================
// CONFIGURATION
// =========================
const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION || 'v18.0';
const BASE_URL = process.env.APP_URL || 'http://localhost:3000';

// =========================
// MULTER SETUP FOR FILE UPLOADS
// =========================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'public/uploads/whatsapp-media';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|mp4|pdf|doc|docx|xlsx|csv|txt/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('File type not allowed'));
        }
    }
});

// =========================
// HELPER FUNCTIONS
// =========================

/**
 * Upload media to Meta servers
 */
async function uploadMediaToMeta(filePath, mimeType, accessToken, phoneNumberId) {
    try {
        console.log('📤 Uploading to Meta servers...');
        
        const formData = new FormData();
        formData.append('file', fs.createReadStream(filePath));
        formData.append('type', mimeType);
        formData.append('messaging_product', 'whatsapp');
        
        const response = await fetch(
            `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/media`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    ...formData.getHeaders()
                },
                body: formData
            }
        );
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error?.message || 'Media upload failed');
        }
        
        console.log('✅ Media uploaded, ID:', data.id);
        return data.id;
        
    } catch (error) {
        console.error('❌ Media upload error:', error);
        throw error;
    }
}

/**
 * Send text message
 */
async function sendTextMessage(to, text, accessToken, phoneNumberId, previewUrl = true) {
    try {
        const payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to,
            type: 'text',
            text: {
                body: text,
                preview_url: previewUrl
            }
        };
        
        const response = await fetch(
            `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            }
        );
        
        const data = await response.json();
        
        if (!response.ok) {
            return { success: false, error: data.error?.message };
        }
        
        return { 
            success: true, 
            messageId: data.messages?.[0]?.id,
            data 
        };
        
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Send template message
 */
async function sendTemplateMessage(to, templateName, language, components, accessToken, phoneNumberId) {
    try {
        const payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to,
            type: 'template',
            template: {
                name: templateName,
                language: {
                    code: language
                },
                components: components
            }
        };
        
        const response = await fetch(
            `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            }
        );
        
        const data = await response.json();
        
        if (!response.ok) {
            return { success: false, error: data.error?.message };
        }
        
        return { 
            success: true, 
            messageId: data.messages?.[0]?.id,
            data 
        };
        
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Send media message
 */
async function sendMediaMessage(to, mediaType, mediaId, caption, accessToken, phoneNumberId) {
    try {
        const payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to,
            type: mediaType,
            [mediaType]: {
                id: mediaId
            }
        };
        
        if (caption && (mediaType === 'image' || mediaType === 'video')) {
            payload[mediaType].caption = caption;
        }
        
        const response = await fetch(
            `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            }
        );
        
        const data = await response.json();
        
        if (!response.ok) {
            return { success: false, error: data.error?.message };
        }
        
        return { 
            success: true, 
            messageId: data.messages?.[0]?.id,
            data 
        };
        
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Process campaign batch
 */
async function processCampaignBatch(campaign, batch) {
    try {
        const account = await OfficialWhatsAppAccount.findOne({ wabaId: campaign.wabaId });
        if (!account) {
            throw new Error('Account not found');
        }
        
        const phoneNumber = account.phoneNumbers.find(p => p.phoneNumberId === campaign.phoneNumberId);
        if (!phoneNumber) {
            throw new Error('Phone number not found');
        }
        
        const accessToken = account.accessToken.token;
        const phoneNumberId = campaign.phoneNumberId;
        
        let mediaId = null;
        if (campaign.mediaUrl && campaign.messageType !== 'text' && campaign.messageType !== 'template') {
            try {
                const filePath = getMediaPathFromUrl(campaign.mediaUrl);
                if (filePath && fs.existsSync(filePath)) {
                    const mimeType = require('mime-types').lookup(filePath) || 'application/octet-stream';
                    mediaId = await uploadMediaToMeta(filePath, mimeType, accessToken, phoneNumberId);
                }
            } catch (uploadError) {
                console.error('Media upload failed:', uploadError);
            }
        }
        
        for (const contact of batch) {
            try {
                let result;
                
                if (campaign.messageType === 'template' && campaign.templateName) {
                    // Template message
                    const components = campaign.templateVariables?.map((value, index) => ({
                        type: 'body',
                        parameters: [{
                            type: 'text',
                            text: value
                        }]
                    })) || [];
                    
                    result = await sendTemplateMessage(
                        contact.phoneNumber,
                        campaign.templateName,
                        'en',
                        components,
                        accessToken,
                        phoneNumberId
                    );
                    
                } else if (mediaId && campaign.messageType !== 'text') {
                    // Media message
                    result = await sendMediaMessage(
                        contact.phoneNumber,
                        campaign.messageType,
                        mediaId,
                        campaign.mediaCaption || campaign.textContent,
                        accessToken,
                        phoneNumberId
                    );
                    
                } else if (campaign.textContent) {
                    // Text message
                    result = await sendTextMessage(
                        contact.phoneNumber,
                        campaign.textContent,
                        accessToken,
                        phoneNumberId
                    );
                } else {
                    result = { success: false, error: 'No message content' };
                }
                
                // Update contact status
                const contactIndex = campaign.contacts.findIndex(c => c.phoneNumber === contact.phoneNumber);
                if (contactIndex !== -1) {
                    if (result.success) {
                        campaign.contacts[contactIndex].status = 'sent';
                        campaign.contacts[contactIndex].messageId = result.messageId;
                        campaign.contacts[contactIndex].sentAt = new Date();
                        campaign.sentCount++;
                    } else {
                        campaign.contacts[contactIndex].status = 'failed';
                        campaign.contacts[contactIndex].error = result.error;
                        campaign.contacts[contactIndex].attempts++;
                        campaign.failedCount++;
                    }
                }
                
                // Calculate progress
                const processed = campaign.contacts.filter(c => 
                    c.status !== 'pending'
                ).length;
                campaign.progress = Math.round((processed / campaign.totalContacts) * 100);
                
                await campaign.save();
                
                // Delay between messages
                await new Promise(resolve => setTimeout(resolve, campaign.interval * 1000));
                
            } catch (err) {
                console.error(`Error sending to ${contact.phoneNumber}:`, err);
                
                const contactIndex = campaign.contacts.findIndex(c => c.phoneNumber === contact.phoneNumber);
                if (contactIndex !== -1) {
                    campaign.contacts[contactIndex].status = 'failed';
                    campaign.contacts[contactIndex].error = err.message;
                    campaign.contacts[contactIndex].attempts++;
                    campaign.failedCount++;
                    await campaign.save();
                }
            }
        }
        
        return true;
        
    } catch (error) {
        console.error('Batch processing error:', error);
        return false;
    }
}

/**
 * Get media path from URL
 */
function getMediaPathFromUrl(mediaUrl) {
    if (!mediaUrl) return null;
    
    try {
        const filename = path.basename(mediaUrl);
        const possiblePaths = [
            path.join(__dirname, '..', 'public', 'uploads', 'whatsapp-media', filename),
            path.join('public', 'uploads', 'whatsapp-media', filename),
            path.join(process.cwd(), 'public', 'uploads', 'whatsapp-media', filename)
        ];
        
        for (const filePath of possiblePaths) {
            if (fs.existsSync(filePath)) {
                return filePath;
            }
        }
        return null;
    } catch (error) {
        console.error('Error getting media path:', error);
        return null;
    }
}

// =========================
// RENDER PAGE
// =========================
router.get('/campaign/official-api', async (req, res) => {
    try {
        const user = req.session.user || req.user;
        if (!user) {
            return res.status(401).send('Unauthorized');
        }

        // Get WhatsApp accounts
        let accounts = [];
        if (user.role === 'SuperAdmin') {
            accounts = await OfficialWhatsAppAccount.find().sort({ createdAt: -1 });
        } else {
            accounts = await OfficialWhatsAppAccount.find({ createdBy: user._id }).sort({ createdAt: -1 });
        }

        // Get templates
        let templates = [];
        if (user.role === 'SuperAdmin') {
            templates = await OfficialWhatsAppTemplate.find().sort({ createdAt: -1 });
        } else {
            templates = await OfficialWhatsAppTemplate.find({ createdBy: user._id }).sort({ createdAt: -1 });
        }

        // Get campaigns
        let campaigns = [];
        if (user.role === 'SuperAdmin') {
            campaigns = await OfficialWhatsAppCampaign.find().sort({ createdAt: -1 }).limit(50);
        } else {
            campaigns = await OfficialWhatsAppCampaign.find({ createdBy: user._id }).sort({ createdAt: -1 }).limit(50);
        }

        // Get contacts
        let contacts = [];
        if (user.role === 'SuperAdmin') {
            contacts = await Condevice.find().sort({ name: 1 });
        } else {
            contacts = await Condevice.find({ createdBy: user._id }).sort({ name: 1 });
        }

        const webhookUrl = `${BASE_URL}/official-whatsapp/webhook`;

        res.render('OfficialWhatsAppApi', {
            accounts,
            templates,
            campaigns,
            contacts,
            user,
            webhookUrl,
            WHATSAPP_API_VERSION
        });

    } catch (error) {
        console.error('Page error:', error);
        res.status(500).send('Internal server error');
    }
});

// =========================
// ACCOUNT MANAGEMENT
// =========================

/**
 * Create new WhatsApp Business Account
 */
router.post('/official-whatsapp/account', async (req, res) => {
    try {
        const user = req.session.user || req.user;
        if (!user) {
            return res.status(401).json({ status: false, msg: 'Unauthorized' });
        }

        const {
            businessName,
            wabaId,
            wabaName,
            phoneNumberId,
            displayPhoneNumber,
            verifiedName,
            accessToken,
            pin
        } = req.body;

        // Check if account exists
        const existing = await OfficialWhatsAppAccount.findOne({ wabaId });
        if (existing) {
            return res.json({ status: false, msg: 'Account already exists' });
        }

        const account = await OfficialWhatsAppAccount.create({
            businessId: `bus_${uuidv4()}`,
            businessName,
            wabaId,
            wabaName,
            phoneNumbers: [{
                phoneNumberId,
                displayPhoneNumber,
                verifiedName,
                pin,
                status: 'PENDING',
                codeVerificationStatus: 'NOT_VERIFIED'
            }],
            accessToken: {
                token: accessToken,
                type: 'permanent'
            },
            webhook: {
                url: `${BASE_URL}/official-whatsapp/webhook`,
                verifyToken: process.env.WEBHOOK_VERIFY_TOKEN || 'your_verify_token',
                isVerified: false,
                subscribedFields: ['messages', 'message_deliveries', 'message_reads']
            },
            createdBy: user._id,
            createdByRole: user.role,
            createdByEmail: user.email
        });

        res.json({ 
            status: true, 
            msg: 'Account created successfully',
            account 
        });

    } catch (error) {
        console.error('Account creation error:', error);
        res.json({ status: false, msg: error.message });
    }
});

/**
 * Register phone number
 */
router.post('/official-whatsapp/register-phone', async (req, res) => {
    try {
        const { accountId, phoneNumberId, pin } = req.body;

        const account = await OfficialWhatsAppAccount.findById(accountId);
        if (!account) {
            return res.json({ status: false, msg: 'Account not found' });
        }

        // Call Meta API to register
        const response = await fetch(
            `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/register`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${account.accessToken.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    pin: pin
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            return res.json({ 
                status: false, 
                msg: data.error?.message || 'Registration failed' 
            });
        }

        // Update account
        const phoneIndex = account.phoneNumbers.findIndex(p => p.phoneNumberId === phoneNumberId);
        if (phoneIndex !== -1) {
            account.phoneNumbers[phoneIndex].status = 'ACTIVE';
            account.phoneNumbers[phoneIndex].codeVerificationStatus = 'VERIFIED';
            account.phoneNumbers[phoneIndex].registeredAt = new Date();
            await account.save();
        }

        res.json({ 
            status: true, 
            msg: 'Phone number registered successfully',
            data 
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.json({ status: false, msg: error.message });
    }
});

// =========================
// TEMPLATE MANAGEMENT
// =========================

/**
 * Create template
 */
router.post('/official-whatsapp/template', async (req, res) => {
    try {
        const user = req.session.user || req.user;
        if (!user) {
            return res.status(401).json({ status: false, msg: 'Unauthorized' });
        }

        const {
            name,
            language,
            category,
            components,
            wabaId
        } = req.body;

        // Check if template exists
        const existing = await OfficialWhatsAppTemplate.findOne({ 
            name, 
            wabaId 
        });
        if (existing) {
            return res.json({ status: false, msg: 'Template name already exists' });
        }

        // Call Meta API to create template
        const account = await OfficialWhatsAppAccount.findOne({ wabaId });
        if (!account) {
            return res.json({ status: false, msg: 'Account not found' });
        }

        const response = await fetch(
            `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${wabaId}/message_templates`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${account.accessToken.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name,
                    language,
                    category,
                    components
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            return res.json({ 
                status: false, 
                msg: data.error?.message || 'Template creation failed' 
            });
        }

        // Save to database
        const template = await OfficialWhatsAppTemplate.create({
            templateId: uuidv4(),
            name,
            language,
            category,
            components,
            metaTemplateId: data.id,
            status: 'PENDING',
            wabaId,
            createdBy: user._id,
            createdByRole: user.role,
            createdByEmail: user.email
        });

        res.json({ 
            status: true, 
            msg: 'Template created successfully',
            template 
        });

    } catch (error) {
        console.error('Template creation error:', error);
        res.json({ status: false, msg: error.message });
    }
});

/**
 * Get templates
 */
router.get('/official-whatsapp/templates', async (req, res) => {
    try {
        const user = req.session.user || req.user;
        if (!user) {
            return res.status(401).json({ status: false, msg: 'Unauthorized' });
        }

        const { wabaId } = req.query;

        let query = {};
        if (wabaId) query.wabaId = wabaId;
        if (user.role !== 'SuperAdmin') {
            query.createdBy = user._id;
        }

        const templates = await OfficialWhatsAppTemplate.find(query).sort({ createdAt: -1 });

        res.json({ 
            status: true, 
            templates 
        });

    } catch (error) {
        console.error('Get templates error:', error);
        res.json({ status: false, msg: error.message, templates: [] });
    }
});

// =========================
// CAMPAIGN MANAGEMENT
// =========================

/**
 * Create campaign
 */
router.post('/official-whatsapp/campaign', async (req, res) => {
    try {
        const user = req.session.user || req.user;
        if (!user) {
            return res.status(401).json({ status: false, msg: 'Unauthorized' });
        }

        const {
            campaignName,
            wabaId,
            phoneNumberId,
            displayPhoneNumber,
            messageType,
            textContent,
            templateId,
            templateName,
            templateVariables,
            mediaUrl,
            mediaCaption,
            contacts,
            scheduleType,
            scheduledDate,
            scheduledTime,
            interval
        } = req.body;

        if (!contacts || contacts.length === 0) {
            return res.json({ status: false, msg: 'Please select contacts' });
        }

        // Format contacts
        const formattedContacts = contacts.map(c => ({
            phoneNumber: c.phoneNumber || c,
            waId: c.waId || c,
            name: c.name || '',
            status: 'pending'
        }));

        // Create campaign
        const campaignData = {
            campaignId: uuidv4(),
            campaignName,
            wabaId,
            phoneNumberId,
            displayPhoneNumber,
            messageType,
            contacts: formattedContacts,
            totalContacts: formattedContacts.length,
            scheduleType,
            interval: interval || 1,
            status: 'draft',
            createdBy: user._id,
            createdByRole: user.role,
            createdByEmail: user.email
        };

        // Add message content
        if (messageType === 'text') {
            campaignData.textContent = textContent;
        } else if (messageType === 'template') {
            campaignData.templateId = templateId;
            campaignData.templateName = templateName;
            campaignData.templateVariables = templateVariables || [];
        } else {
            campaignData.mediaUrl = mediaUrl;
            campaignData.mediaCaption = mediaCaption || textContent;
        }

        // Add schedule
        if (scheduleType === 'later' && scheduledDate && scheduledTime) {
            campaignData.scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`);
            campaignData.status = 'scheduled';
        }

        const campaign = await OfficialWhatsAppCampaign.create(campaignData);

        // If sending now, start immediately
        if (scheduleType === 'now') {
            campaign.status = 'sending';
            campaign.startedAt = new Date();
            await campaign.save();

            // Process in batches
            const batchSize = 50;
            for (let i = 0; i < formattedContacts.length; i += batchSize) {
                const batch = formattedContacts.slice(i, i + batchSize);
                await processCampaignBatch(campaign, batch);
            }

            campaign.status = campaign.failedCount === campaign.totalContacts ? 'failed' : 'completed';
            campaign.completedAt = new Date();
            await campaign.save();
        }

        res.json({ 
            status: true, 
            msg: scheduleType === 'now' ? 'Campaign started' : 'Campaign scheduled',
            campaign 
        });

    } catch (error) {
        console.error('Campaign creation error:', error);
        res.json({ status: false, msg: error.message });
    }
});

/**
 * Get campaigns
 */
router.get('/official-whatsapp/campaigns', async (req, res) => {
    try {
        const user = req.session.user || req.user;
        if (!user) {
            return res.status(401).json({ status: false, msg: 'Unauthorized' });
        }

        let query = {};
        if (user.role !== 'SuperAdmin') {
            query.createdBy = user._id;
        }

        const campaigns = await OfficialWhatsAppCampaign.find(query)
            .sort({ createdAt: -1 })
            .limit(100);

        res.json({ 
            status: true, 
            campaigns 
        });

    } catch (error) {
        console.error('Get campaigns error:', error);
        res.json({ status: false, msg: error.message, campaigns: [] });
    }
});

/**
 * Get campaign status
 */
router.get('/official-whatsapp/campaign/:campaignId', async (req, res) => {
    try {
        const campaign = await OfficialWhatsAppCampaign.findOne({ 
            campaignId: req.params.campaignId 
        });

        if (!campaign) {
            return res.json({ status: false, msg: 'Campaign not found' });
        }

        res.json({ 
            status: true, 
            campaign 
        });

    } catch (error) {
        console.error('Get campaign error:', error);
        res.json({ status: false, msg: error.message });
    }
});

/**
 * Cancel campaign
 */
router.post('/official-whatsapp/campaign/:campaignId/cancel', async (req, res) => {
    try {
        const campaign = await OfficialWhatsAppCampaign.findOne({ 
            campaignId: req.params.campaignId 
        });

        if (!campaign) {
            return res.json({ status: false, msg: 'Campaign not found' });
        }

        campaign.status = 'cancelled';
        await campaign.save();

        res.json({ 
            status: true, 
            msg: 'Campaign cancelled successfully' 
        });

    } catch (error) {
        console.error('Cancel campaign error:', error);
        res.json({ status: false, msg: error.message });
    }
});

// =========================
// CONTACT MANAGEMENT
// =========================

/**
 * Upload CSV contacts
 */
router.post('/official-whatsapp/upload-contacts', upload.single('file'), async (req, res) => {
    try {
        const user = req.session.user || req.user;
        if (!user) {
            return res.status(401).json({ status: false, msg: 'Unauthorized' });
        }

        if (!req.file) {
            return res.json({ status: false, msg: 'No file uploaded' });
        }

        const results = [];
        const errors = [];

        // Parse CSV
        const readableStream = fs.createReadStream(req.file.path);
        
        await new Promise((resolve, reject) => {
            readableStream
                .pipe(csv())
                .on('data', (data) => {
                    // Expected columns: name, phone, email (optional)
                    const phone = data.phone || data.mobile || data.number || data.whatsapp;
                    const name = data.name || data.fullName || data.contact;
                    const email = data.email || '';

                    if (phone) {
                        // Clean phone number
                        const cleanPhone = phone.replace(/\D/g, '');
                        
                        // Add country code if missing (assuming India)
                        const finalPhone = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone;
                        
                        results.push({
                            name: name || 'Unknown',
                            phoneNumber: cleanPhone,
                            whatsappNumber: finalPhone,
                            email: email
                        });
                    } else {
                        errors.push(`Row ${results.length + 1}: No phone number found`);
                    }
                })
                .on('end', resolve)
                .on('error', reject);
        });

        // Save to database
        let saved = 0;
        for (const contact of results) {
            try {
                // Check if exists
                const existing = await Condevice.findOne({ 
                    phoneNumber: contact.phoneNumber,
                    createdBy: user._id
                });

                if (!existing) {
                    await Condevice.create({
                        ...contact,
                        createdBy: user._id,
                        createdByRole: user.role,
                        createdByEmail: user.email
                    });
                    saved++;
                }
            } catch (dbError) {
                errors.push(`Error saving ${contact.phoneNumber}: ${dbError.message}`);
            }
        }

        // Cleanup
        fs.unlinkSync(req.file.path);

        res.json({ 
            status: true, 
            msg: `Imported ${saved} contacts, ${results.length - saved} skipped, ${errors.length} errors`,
            imported: saved,
            skipped: results.length - saved,
            errors: errors.slice(0, 5) // Return first 5 errors
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.json({ status: false, msg: error.message });
    }
});

// =========================
// MEDIA UPLOAD
// =========================

router.post('/official-whatsapp/upload-media', upload.single('media'), async (req, res) => {
    try {
        if (!req.file) {
            return res.json({ status: false, msg: 'No file uploaded' });
        }

        const fileUrl = `/uploads/whatsapp-media/${req.file.filename}`;
        
        let fileType = 'document';
        if (req.file.mimetype.startsWith('image/')) {
            fileType = 'image';
        } else if (req.file.mimetype.startsWith('video/')) {
            fileType = 'video';
        } else if (req.file.mimetype.includes('pdf')) {
            fileType = 'document';
        } else if (req.file.mimetype.includes('audio')) {
            fileType = 'audio';
        }

        res.json({
            status: true,
            fileUrl: fileUrl,
            fileName: req.file.filename,
            fileType: fileType,
            mimeType: req.file.mimetype,
            fileSize: req.file.size,
            originalName: req.file.originalname
        });

    } catch (error) {
        console.error('Media upload error:', error);
        res.json({ status: false, msg: error.message });
    }
});

// =========================
// WEBHOOK HANDLER (CRITICAL!)
// =========================

/**
 * Webhook verification (GET)
 */
router.get('/official-whatsapp/webhook', (req, res) => {
    const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || 'your_verify_token_here';
    
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    console.log('🔐 Webhook verification request:', { mode, token, challenge });
    
    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('✅ Webhook verified successfully');
            res.status(200).send(challenge);
        } else {
            console.log('❌ Webhook verification failed - invalid token');
            res.sendStatus(403);
        }
    } else {
        console.log('❌ Webhook verification failed - missing parameters');
        res.sendStatus(400);
    }
});

/**
 * Webhook for incoming messages and status updates (POST)
 */
router.post('/official-whatsapp/webhook', async (req, res) => {
    try {
        const body = req.body;
        
        console.log('📩 Webhook received:', JSON.stringify(body, null, 2));

        // Save raw event
        const event = new OfficialWhatsAppWebhookEvent({
            eventId: uuidv4(),
            object: body.object,
            entry: body.entry,
            rawData: body,
            processedAt: new Date()
        });

        // Process each entry
        if (body.entry) {
            for (const entry of body.entry) {
                for (const change of entry.changes || []) {
                    const value = change.value;
                    
                    // ===== MESSAGES =====
                    if (value.messages) {
                        for (const message of value.messages) {
                            const waId = message.from;
                            const messageId = message.id;
                            const timestamp = message.timestamp;
                            
                            console.log(`📨 Message from ${waId}:`, message);

                            // Update event with message details
                            event.messageId = messageId;
                            event.waId = waId;
                            event.phoneNumberId = value.metadata?.phone_number_id;
                            event.eventType = 'message';
                            event.messageType = message.type;
                            event.timestamp = timestamp;

                            if (message.type === 'text') {
                                event.messageContent = message.text?.body;
                            }

                            // Find campaign by messageId (if this is a reply to our campaign)
                            const campaign = await OfficialWhatsAppCampaign.findOne({
                                'contacts.messageId': messageId
                            });

                            if (campaign) {
                                // Update contact status
                                const contact = campaign.contacts.find(c => c.messageId === messageId);
                                if (contact) {
                                    // This is a delivery receipt or reply
                                    console.log(`✅ Message delivered to ${contact.phoneNumber}`);
                                }
                            }

                            await event.save();
                        }
                    }

                    // ===== STATUS UPDATES (Delivered/Read) =====
                    if (value.statuses) {
                        for (const status of value.statuses) {
                            const messageId = status.id;
                            const statusType = status.status; // 'sent', 'delivered', 'read', 'failed'
                            const timestamp = status.timestamp;
                            
                            console.log(`📊 Status update: ${messageId} = ${statusType}`);

                            // Update event
                            event.messageId = messageId;
                            event.eventType = 'status';
                            event.status = statusType;
                            event.timestamp = timestamp;

                            // Find and update campaign
                            const campaign = await OfficialWhatsAppCampaign.findOne({
                                'contacts.messageId': messageId
                            });

                            if (campaign) {
                                const contactIndex = campaign.contacts.findIndex(c => c.messageId === messageId);
                                if (contactIndex !== -1) {
                                    // Update status
                                    if (statusType === 'delivered') {
                                        campaign.contacts[contactIndex].status = 'delivered';
                                        campaign.contacts[contactIndex].deliveredAt = new Date(timestamp * 1000);
                                        campaign.deliveredCount++;
                                    } else if (statusType === 'read') {
                                        campaign.contacts[contactIndex].status = 'read';
                                        campaign.contacts[contactIndex].readAt = new Date(timestamp * 1000);
                                        campaign.readCount++;
                                    } else if (statusType === 'failed') {
                                        campaign.contacts[contactIndex].status = 'failed';
                                        campaign.contacts[contactIndex].error = status.errors?.[0]?.message;
                                        campaign.failedCount++;
                                    }

                                    await campaign.save();
                                }
                            }

                            await event.save();
                        }
                    }

                    // ===== ERRORS =====
                    if (value.errors) {
                        console.error('❌ Webhook error:', value.errors);
                        event.eventType = 'error';
                        event.error = value.errors;
                        await event.save();
                    }
                }
            }
        }

        // Always return 200 OK to Meta
        res.sendStatus(200);

    } catch (error) {
        console.error('🔥 Webhook processing error:', error);
        // Still return 200 to prevent Meta from retrying
        res.sendStatus(200);
    }
});

// =========================
// DASHBOARD STATS
// =========================

router.get('/official-whatsapp/stats', async (req, res) => {
    try {
        const user = req.session.user || req.user;
        if (!user) {
            return res.status(401).json({ status: false, msg: 'Unauthorized' });
        }

        let query = {};
        if (user.role !== 'SuperAdmin') {
            query.createdBy = user._id;
        }

        // Get counts
        const totalCampaigns = await OfficialWhatsAppCampaign.countDocuments(query);
        const totalTemplates = await OfficialWhatsAppTemplate.countDocuments(query);
        const totalAccounts = await OfficialWhatsAppAccount.countDocuments(query);
        
        // Get recent campaigns
        const recentCampaigns = await OfficialWhatsAppCampaign.find(query)
            .sort({ createdAt: -1 })
            .limit(5);

        // Get stats
        const stats = await OfficialWhatsAppCampaign.aggregate([
            { $match: query },
            { $group: {
                _id: null,
                totalSent: { $sum: "$sentCount" },
                totalDelivered: { $sum: "$deliveredCount" },
                totalRead: { $sum: "$readCount" },
                totalFailed: { $sum: "$failedCount" }
            }}
        ]);

        res.json({
            status: true,
            stats: {
                totalCampaigns,
                totalTemplates,
                totalAccounts,
                totalSent: stats[0]?.totalSent || 0,
                totalDelivered: stats[0]?.totalDelivered || 0,
                totalRead: stats[0]?.totalRead || 0,
                totalFailed: stats[0]?.totalFailed || 0,
                recentCampaigns
            }
        });

    } catch (error) {
        console.error('Stats error:', error);
        res.json({ status: false, msg: error.message });
    }
});

module.exports = router;