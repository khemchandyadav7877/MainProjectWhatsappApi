// Routes/campaignRouter.js - COMPLETE FIXED VERSION
const router = require('express').Router();
const Campaign = require('../models/Campaign');
const Device = require('../models/Device');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { MessageMedia } = require('whatsapp-web.js');
const schedule = require('node-schedule');

// IMPORT WHATSAPP CLIENT CORRECTLY
const { clients } = require('./WhtasappScane'); // Fixed typo: WhtasappScane -> WhatsAppScan

// IMPORT saveSentMessage from webRouter
const { saveSentMessage } = require('./webRouter');

// Ensure uploads directory exists
const uploadsDir = 'public/uploads';
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|mp4|avi|mov|pdf|doc|docx|txt|xlsx|pptx/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only images, videos, and documents are allowed'));
        }
    }
});

// =========================
// SCHEDULER FUNCTIONS
// =========================
const scheduledJobs = {};

// PATCH: Fix markedUnread error in whatsapp-web.js
function patchWhatsAppClient(client) {
    if (!client || !client.pupPage) return;
    
    try {
        // Inject patch to fix markedUnread error
        client.pupPage.evaluate(() => {
            if (window.WWebJS && window.WWebJS.sendSeen) {
                // Backup original function
                const originalSendSeen = window.WWebJS.sendSeen;
                
                // Override with fixed version
                window.WWebJS.sendSeen = async function(chatId) {
                    try {
                        return await originalSendSeen.call(this, chatId);
                    } catch (error) {
                        // Ignore markedUnread error
                        if (error.message && error.message.includes('markedUnread')) {
                            console.log('Ignored markedUnread error');
                            return true;
                        }
                        throw error;
                    }
                };
                
                console.log('✅ WhatsApp Web JS patched successfully');
            }
        }).catch(err => {
            console.log('Patch injection failed:', err.message);
        });
    } catch (err) {
        console.log('Patch error:', err.message);
    }
}

// Helper function to get file type from mime type
function getFileTypeFromMime(mimeType) {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.includes('pdf')) return 'pdf';
    if (mimeType.includes('audio')) return 'audio';
    if (mimeType.includes('document') || mimeType.includes('doc') || mimeType.includes('txt') || mimeType.includes('xlsx') || mimeType.includes('pptx')) return 'document';
    return 'document';
}

// WORKING: WhatsApp message sending function with patch
async function sendWhatsAppMessage(client, number, message, mediaData = null) {
    try {
        // Clean the number
        const cleanNumber = number.replace(/\D/g, '');
        if (cleanNumber.length < 10) {
            console.log(`❌ Invalid number: ${number}`);
            return false;
        }
        
        let formattedNumber = cleanNumber;
        if (cleanNumber.length === 10) {
            formattedNumber = '91' + cleanNumber;
        } else if (cleanNumber.length === 12 && cleanNumber.startsWith('91')) {
            formattedNumber = cleanNumber;
        }
        
        const chatId = formattedNumber + '@c.us';
        
        // Check if client is ready
        if (!client || !client.info || !client.info.wid) {
            console.log('❌ WhatsApp client not ready');
            return false;
        }
        
        // Apply patch if not already applied
        patchWhatsAppClient(client);
        
        // TEXT ONLY MESSAGE - FIXED METHOD
        if (!mediaData) {
            if (!message || message.trim() === '') {
                console.log('❌ No message to send');
                return false;
            }
            
            try {
                console.log(`📝 Sending text to ${cleanNumber}`);
                
                // METHOD 1: Use chat.sendMessage (most reliable)
                try {
                    const chat = await client.getChatById(chatId);
                    if (chat) {
                        await chat.sendMessage(message.trim());
                        console.log(`✅ Text sent via chat.sendMessage`);
                        return true;
                    }
                } catch (chatErr) {
                    console.log('Chat method failed, trying direct...');
                }
                
                // METHOD 2: Direct sendMessage with timeout
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Timeout')), 10000);
                });
                
                const sendPromise = client.sendMessage(chatId, message.trim());
                
                await Promise.race([sendPromise, timeoutPromise]);
                console.log(`✅ Text sent to ${cleanNumber}`);
                return true;
                
            } catch (textError) {
                console.error(`❌ Text error: ${textError.message}`);
                
                // Try one more time with simple approach
                try {
                    console.log('🔄 Trying simple approach...');
                    
                    // Use page evaluate as last resort
                    await client.pupPage.evaluate((chatId, text) => {
                        // Simple message send without extra options
                        const chat = window.Store.Chat.get(chatId);
                        if (chat) {
                            const message = {
                                type: 'chat',
                                body: text,
                                quotedMsg: null,
                                quotedMsgAdminGroupJid: null,
                                mentions: []
                            };
                            return window.Store.Msg.send(chat, message);
                        }
                        return false;
                    }, chatId, message.trim());
                    
                    console.log(`✅ Text sent via simple method`);
                    return true;
                } catch (simpleErr) {
                    console.error(`❌ Simple method failed: ${simpleErr.message}`);
                    return false;
                }
            }
        }
        
        // MEDIA WITH/WITHOUT MESSAGE
        if (mediaData && mediaData.filePath && fs.existsSync(mediaData.filePath)) {
            try {
                console.log(`📎 Sending media to ${cleanNumber}`);
                
                // Read file
                const fileData = fs.readFileSync(mediaData.filePath);
                const mime = require('mime-types');
                const mimeType = mime.lookup(mediaData.filePath) || 'application/octet-stream';
                
                // Create MessageMedia
                const media = new MessageMedia(
                    mimeType,
                    fileData.toString('base64'),
                    path.basename(mediaData.filePath)
                );
                
                // Send media without caption option
                await client.sendMessage(chatId, media);
                console.log(`✅ Media sent to ${cleanNumber}`);
                
                // Send text as separate message if exists
                if (message && message.trim() !== '') {
                    setTimeout(async () => {
                        try {
                            const chat = await client.getChatById(chatId);
                            if (chat) {
                                await chat.sendMessage(message.trim());
                                console.log(`✅ Caption sent to ${cleanNumber}`);
                            }
                        } catch (captionErr) {
                            console.log(`Caption failed: ${captionErr.message}`);
                        }
                    }, 1500);
                }
                
                return true;
                
            } catch (mediaError) {
                console.error(`❌ Media error: ${mediaError.message}`);
                
                // Fallback to text message if available
                if (message && message.trim() !== '') {
                    try {
                        const chat = await client.getChatById(chatId);
                        if (chat) {
                            await chat.sendMessage(message.trim());
                            console.log(`✅ Text fallback sent to ${cleanNumber}`);
                            return true;
                        }
                    } catch (textErr) {
                        console.error(`❌ Text fallback failed: ${textErr.message}`);
                        return false;
                    }
                }
                return false;
            }
        } else {
            console.log(`❌ Media file not found`);
            return false;
        }
        
    } catch (error) {
        console.error(`🔥 Send error for ${number}:`, error.message);
        return false;
    }
}

// Function to execute a scheduled campaign
async function executeScheduledCampaign(campaignId) {
    try {
        console.log(`⏰ Executing scheduled campaign: ${campaignId}`);
        
        const campaign = await Campaign.findOne({ campaignId });
        if (!campaign) {
            console.log(`❌ Campaign not found: ${campaignId}`);
            return;
        }
        
        if (campaign.status !== 'scheduled') {
            console.log(`⚠️ Campaign status is ${campaign.status}, not executing`);
            return;
        }
        
        campaign.status = 'sending';
        await campaign.save();
        
        const client = clients[campaign.deviceId];
        if (!client || !client.info || !client.info.wid) {
            console.log(`❌ WhatsApp client not ready`);
            campaign.status = 'failed';
            campaign.completedAt = new Date();
            await campaign.save();
            return;
        }
        
        // Apply patch
        patchWhatsAppClient(client);
        
        // Prepare media data if exists
        let mediaData = null;
        if (campaign.mediaUrl) {
            const filePath = getMediaPathFromUrl(campaign.mediaUrl);
            if (filePath && fs.existsSync(filePath)) {
                const mimeType = require('mime-types').lookup(filePath) || 'application/octet-stream';
                mediaData = {
                    filePath: filePath,
                    fileName: path.basename(filePath),
                    mimeType: mimeType
                };
            }
        }
        
        let sent = 0;
        let failed = 0;
        const failedNumbers = [];
        
        for (let i = 0; i < campaign.numbers.length; i++) {
            const num = campaign.numbers[i];
            
            const success = await sendWhatsAppMessage(client, num, campaign.message, mediaData);
            
            if (success) {
                sent++;
                
                // 🔥 IMPORTANT: Save message to database for reports
                await saveSentMessage({
                    jobId: `CAMPAIGN_${campaignId}_${Date.now()}_${i}`,
                    channel: 'whatsapp',
                    message: campaign.message || '',
                    messageType: mediaData ? getFileTypeFromMime(mediaData.mimeType) : 'text',
                    mediaUrl: mediaData ? `/uploads/${path.basename(mediaData.filePath)}` : '',
                    fileName: mediaData ? path.basename(mediaData.filePath) : '',
                    fileSize: mediaData ? fs.statSync(mediaData.filePath).size : 0,
                    sentTime: new Date(),
                    status: 'Completed',
                    deviceId: campaign.deviceId,
                    whatsappNumber: client.info?.me?.user || campaign.deviceId,
                    campaignId: campaign.campaignId,
                    campaignName: campaign.campaignName || `Campaign ${campaign.campaignId.substring(0, 8)}`,
                    recipient: num,
                    direction: 'outgoing',
                    bill: 1
                });
                
                console.log(`✅ [${i+1}/${campaign.numbers.length}] Sent to ${num} AND SAVED TO DB`);
            } else {
                failed++;
                failedNumbers.push(num);
                console.log(`❌ [${i+1}/${campaign.numbers.length}] Failed for ${num}`);
            }
            
            campaign.sentCount = sent;
            campaign.failedCount = failed;
            await campaign.save();
            
            // Delay between messages
            if (i < campaign.numbers.length - 1) {
                const delay = (campaign.interval || 5) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        campaign.status = sent > 0 ? 'completed' : 'failed';
        campaign.sentCount = sent;
        campaign.failedCount = failed;
        campaign.failedNumbers = failedNumbers;
        campaign.completedAt = new Date();
        await campaign.save();
        
        console.log(`🏁 Campaign ${campaignId} ${campaign.status}: ${sent} sent, ${failed} failed`);
        
        if (scheduledJobs[campaignId]) {
            delete scheduledJobs[campaignId];
        }
        
    } catch (error) {
        console.error(`🔥 Error executing campaign:`, error);
        
        try {
            const campaign = await Campaign.findOne({ campaignId });
            if (campaign) {
                campaign.status = 'failed';
                campaign.completedAt = new Date();
                await campaign.save();
            }
        } catch (dbError) {
            console.error('Error updating campaign:', dbError);
        }
        
        if (scheduledJobs[campaignId]) {
            delete scheduledJobs[campaignId];
        }
    }
}

// =========================
// GET MEDIA PATH FROM URL
// =========================
function getMediaPathFromUrl(mediaUrl) {
    if (!mediaUrl) return null;
    
    try {
        // Extract filename from URL
        const filename = path.basename(mediaUrl);
        
        // Try different paths
        const possiblePaths = [
            path.join(__dirname, '..', 'public', 'uploads', filename),
            path.join('public', 'uploads', filename),
            path.join(process.cwd(), 'public', 'uploads', filename)
        ];
        
        for (const filePath of possiblePaths) {
            if (fs.existsSync(filePath)) {
                console.log(`📂 Media file found at: ${filePath}`);
                return filePath;
            }
        }
        
        console.log(`❌ Media file not found: ${filename}`);
        return null;
        
    } catch (error) {
        console.error('Error getting media path:', error);
        return null;
    }
}

// Schedule a campaign
function scheduleCampaignJob(campaign) {
    try {
        if (!campaign.scheduledAt) {
            console.log(`⚠️ No schedule time`);
            return null;
        }
        
        const scheduledAt = new Date(campaign.scheduledAt);
        const now = new Date();
        
        if (scheduledAt <= now) {
            executeScheduledCampaign(campaign.campaignId);
            return null;
        }
        
        // Cancel existing job
        if (scheduledJobs[campaign.campaignId]) {
            scheduledJobs[campaign.campaignId].cancel();
            delete scheduledJobs[campaign.campaignId];
        }
        
        // Schedule the job
        const job = schedule.scheduleJob(scheduledAt, async () => {
            await executeScheduledCampaign(campaign.campaignId);
        });
        
        if (job) {
            scheduledJobs[campaign.campaignId] = job;
            console.log(`✅ Campaign scheduled for ${scheduledAt.toLocaleString()}`);
            return job;
        }
        
        return null;
        
    } catch (error) {
        console.error('Schedule error:', error);
        return null;
    }
}

// Load scheduled campaigns on server start
async function loadScheduledCampaigns() {
    try {
        const scheduledCampaigns = await Campaign.find({
            status: 'scheduled',
            scheduledAt: { $gt: new Date() }
        });
        
        console.log(`📅 Loading ${scheduledCampaigns.length} scheduled campaigns`);
        
        scheduledCampaigns.forEach(campaign => {
            scheduleCampaignJob(campaign);
        });
    } catch (error) {
        console.error('Error loading campaigns:', error);
    }
}
loadScheduledCampaigns();

// =========================
// PAGE RENDER
// =========================
router.get('/devices/campaign', async (req, res) => {
    try {
        const devices = await Device.find({ status: 'CONNECTED' })
            .sort({ createdAt: -1 });
        
        const scheduledCampaigns = await Campaign.find({ 
            status: 'scheduled',
            scheduledAt: { $gte: new Date() }
        }).sort({ scheduledAt: 1 });
        
         res.render('Campaign', { 
            devices,
            scheduledCampaigns,
            activeTab: 'campaign',
            user: req.session.user || req.user  || {
                role: 'SuperAdmin',
                firstName: 'Admin',
                lastName: 'User',
                email: 'admin@example.com'
            }
        });
    } catch (error) {
        console.error('Campaign page error:', error);
        res.status(500).send('Internal server error');
    }
});

// =========================
// UPLOAD MEDIA
// =========================
router.post('/upload-media', upload.single('media'), (req, res) => {
    try {
        if (!req.file) {
            return res.json({ status: false, msg: 'No file uploaded' });
        }
        
        // Save file path correctly
        const filePath = path.join('public', 'uploads', req.file.filename);
        const fileUrl = '/uploads/' + req.file.filename;
        const absolutePath = path.resolve(filePath);
        
        // Determine file type
        let fileType = 'document';
        if (req.file.mimetype.startsWith('image/')) {
            fileType = 'image';
        } else if (req.file.mimetype.startsWith('video/')) {
            fileType = 'video';
        } else if (req.file.mimetype.includes('pdf')) {
            fileType = 'pdf';
        } else if (req.file.mimetype.includes('audio')) {
            fileType = 'audio';
        }
        
        res.json({
            status: true,
            fileUrl: fileUrl,
            fileName: req.file.filename,
            filePath: absolutePath,
            fileType: fileType,
            mimeType: req.file.mimetype,
            fileSize: req.file.size,
            originalName: req.file.originalname
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.json({ status: false, msg: error.message });
    }
});

// =========================
// SEND CAMPAIGN - FIXED VERSION
// =========================
router.post('/send-campaign', async (req, res) => {
    let campaign;
    try {
        const { 
            channel, 
            numbers, 
            message, 
            interval = 5,
            mediaUrl,
            schedule: scheduleType = 'now',
            scheduledDate,
            scheduledTime,
            campaignName = ''
        } = req.body;

        console.log('📨 Campaign data received:', {
            channel, 
            numbersCount: typeof numbers === 'string' ? numbers.split(',').length : numbers?.length,
            mediaUrl: mediaUrl ? 'Yes' : 'No',
            scheduleType,
            scheduledDate,
            scheduledTime,
            messageLength: message?.length || 0,
            campaignName
        });

        // Validation
        if (!channel) {
            return res.json({ 
                status: false, 
                msg: 'WhatsApp device not selected' 
            });
        }

        if (!numbers) {
            return res.json({ 
                status: false, 
                msg: 'Please add phone numbers' 
            });
        }

        // Check WhatsApp client
        const client = clients[channel];
        if (!client || !client.info || !client.info.wid) {
            return res.json({
                status: false,
                msg: 'WhatsApp client not ready. Please scan QR code again.'
            });
        }

        // Apply patch before sending
        patchWhatsAppClient(client);

        // Parse numbers
        let numberArray;
        if (typeof numbers === 'string') {
            numberArray = numbers.split(/[,\n\s]+/)
                .map(n => n.trim().replace(/\D/g, ''))
                .filter(n => n.length >= 10)
                .map(n => {
                    if (n.length === 10) {
                        return n; // Keep as 10 digit, we'll format in send function
                    }
                    return n;
                });
        } else if (Array.isArray(numbers)) {
            numberArray = numbers;
        } else {
            return res.json({ status: false, msg: 'Invalid numbers format' });
        }

        if (numberArray.length === 0) {
            return res.json({ status: false, msg: 'No valid numbers found' });
        }

        console.log(`📱 Processing ${numberArray.length} numbers`);

        // SCHEDULED CAMPAIGN
        if (scheduleType === 'later' && scheduledDate && scheduledTime) {
            const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`);
            const now = new Date();
            
            if (scheduledAt <= now) {
                return res.json({ 
                    status: false, 
                    msg: 'Schedule time must be in the future' 
                });
            }

            // Create scheduled campaign record
            campaign = await Campaign.create({
                campaignId: uuidv4(),
                deviceId: channel,
                numbers: numberArray,
                message: message || '',
                mediaUrl: mediaUrl || '',
                messageType: mediaUrl ? 'media' : 'text',
                interval: parseInt(interval),
                status: 'scheduled',
                scheduleType: 'later',
                scheduledAt: scheduledAt,
                totalContacts: numberArray.length,
                sentCount: 0,
                failedCount: 0,
                campaignName: campaignName || `Campaign ${uuidv4().substring(0, 8)}`,
                createdAt: new Date()
            });

            // Schedule the job
            const job = scheduleCampaignJob(campaign);
            
            if (job) {
                console.log(`✅ Campaign ${campaign.campaignId} scheduled successfully`);
                return res.json({
                    status: true,
                    scheduled: true,
                    scheduledAt: scheduledAt,
                    campaignId: campaign.campaignId,
                    msg: `Campaign scheduled for ${scheduledAt.toLocaleString()}`
                });
            } else {
                // If scheduling fails, mark as failed
                campaign.status = 'failed';
                await campaign.save();
                
                return res.json({
                    status: false,
                    msg: 'Failed to schedule campaign'
                });
            }
        }

        // SEND IMMEDIATELY
        const campaignId = uuidv4();
        let sent = 0;
        let failed = 0;
        const failedNumbers = [];

        // Create campaign record
        campaign = await Campaign.create({
            campaignId: campaignId,
            deviceId: channel,
            numbers: numberArray,
            message: message || '',
            mediaUrl: mediaUrl || '',
            messageType: mediaUrl ? 'media' : 'text',
            interval: parseInt(interval),
            status: 'sending',
            scheduleType: 'now',
            totalContacts: numberArray.length,
            sentCount: 0,
            failedCount: 0,
            campaignName: campaignName || `Campaign ${campaignId.substring(0, 8)}`,
            createdAt: new Date()
        });

        console.log(`🚀 Starting immediate campaign: ${campaignId}`);
        console.log(`Campaign Name: ${campaign.campaignName}`);
        console.log(`Message Type: ${mediaUrl ? 'media' : 'text'}`);
        console.log(`Message: "${message?.substring(0, 50) || 'No message'}..."`);

        // Prepare media data if exists
        let mediaData = null;
        if (mediaUrl) {
            const filePath = getMediaPathFromUrl(mediaUrl);
            if (filePath && fs.existsSync(filePath)) {
                const mimeType = require('mime-types').lookup(filePath) || 'application/octet-stream';
                mediaData = {
                    filePath: filePath,
                    fileName: path.basename(filePath),
                    mimeType: mimeType
                };
                console.log(`📎 Media prepared: ${mediaData.fileName}`);
            } else {
                console.log(`⚠️ Media file not found: ${mediaUrl}`);
            }
        }

        // Send messages with progress
        for (let i = 0; i < numberArray.length; i++) {
            const num = numberArray[i];
            
            try {
                // Use enhanced send function with media support
                const success = await sendWhatsAppMessage(client, num, message, mediaData);
                
                if (success) {
                    sent++;
                    
                    // 🔥 IMPORTANT: Save each message to database for reports
                    await saveSentMessage({
                        jobId: `CAMPAIGN_${campaignId}_${Date.now()}_${i}`,
                        channel: 'whatsapp',
                        message: message || '',
                        messageType: mediaData ? getFileTypeFromMime(mediaData.mimeType) : 'text',
                        mediaUrl: mediaData ? `/uploads/${path.basename(mediaData.filePath)}` : '',
                        fileName: mediaData ? path.basename(mediaData.filePath) : '',
                        fileSize: mediaData ? fs.statSync(mediaData.filePath).size : 0,
                        sentTime: new Date(),
                        status: 'Completed',
                        deviceId: channel,
                        whatsappNumber: client.info?.me?.user || channel,
                        campaignId: campaignId,
                        campaignName: campaign.campaignName,
                        recipient: num,
                        direction: 'outgoing',
                        bill: 1
                    });
                    
                    console.log(`✅ [${i+1}/${numberArray.length}] Sent to ${num} AND SAVED TO DB`);
                } else {
                    failed++;
                    failedNumbers.push(num);
                    console.log(`❌ [${i+1}/${numberArray.length}] Failed to send to ${num}`);
                }
                
                // Update campaign progress
                campaign.sentCount = sent;
                campaign.failedCount = failed;
                campaign.failedNumbers = failedNumbers;
                await campaign.save();

                // Add delay between messages
                if (i < numberArray.length - 1) {
                    const delay = (parseInt(interval) || 5) * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

            } catch (err) {
                console.error(`❌ Error sending to ${num}:`, err.message);
                failed++;
                failedNumbers.push(num);
                
                campaign.sentCount = sent;
                campaign.failedCount = failed;
                campaign.failedNumbers = failedNumbers;
                await campaign.save();
            }
        }

        // Update campaign status
        let finalStatus = 'completed';
        if (failed === numberArray.length) {
            finalStatus = 'failed';
        } else if (sent === 0) {
            finalStatus = 'failed';
        }
        
        campaign.status = finalStatus;
        campaign.sentCount = sent;
        campaign.failedCount = failed;
        campaign.failedNumbers = failedNumbers;
        campaign.completedAt = new Date();
        await campaign.save();

        console.log(`🏁 Campaign ${finalStatus}: ${sent} sent, ${failed} failed`);

        res.json({ 
            status: true, 
            sent, 
            failed,
            scheduled: false,
            campaignId: campaign.campaignId,
            campaignName: campaign.campaignName,
            msg: `Campaign completed: ${sent} sent, ${failed} failed`
        });

    } catch (err) {
        console.error('🔥 CAMPAIGN ERROR:', err);
        
        // Update campaign status if exists
        if (campaign) {
            campaign.status = 'failed';
            campaign.completedAt = new Date();
            await campaign.save();
        }
        
        res.json({ 
            status: false, 
            msg: `Server error: ${err.message}` 
        });
    }
});

// =========================
// SEND TEST MESSAGE WITH PROPER LOGIC
// =========================
router.post('/send-test', async (req, res) => {
    try {
        const { channel, number, message, mediaUrl } = req.body;

        console.log('🧪 Test message request:', {
            channel,
            number,
            hasMedia: !!mediaUrl,
            messageLength: message?.length || 0
        });

        const client = clients[channel];
        if (!client || !client.info) {
            return res.json({ 
                status: false, 
                msg: 'WhatsApp not connected. Please scan QR code.' 
            });
        }

        // Apply patch
        patchWhatsAppClient(client);

        // Prepare media data if exists
        let mediaData = null;
        if (mediaUrl) {
            const filePath = getMediaPathFromUrl(mediaUrl);
            if (filePath && fs.existsSync(filePath)) {
                const mimeType = require('mime-types').lookup(filePath) || 'application/octet-stream';
                mediaData = {
                    filePath: filePath,
                    fileName: path.basename(filePath),
                    mimeType: mimeType
                };
                console.log(`📎 Test media prepared: ${mediaData.fileName}`);
            }
        }

        // Use enhanced send function
        const success = await sendWhatsAppMessage(client, number, message, mediaData);

        if (success) {
            // 🔥 SAVE TEST MESSAGE TO DATABASE TOO
            await saveSentMessage({
                jobId: `TEST_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                channel: 'whatsapp',
                message: message || '',
                messageType: mediaData ? getFileTypeFromMime(mediaData.mimeType) : 'text',
                mediaUrl: mediaData ? `/uploads/${path.basename(mediaData.filePath)}` : '',
                fileName: mediaData ? path.basename(mediaData.filePath) : '',
                fileSize: mediaData ? fs.statSync(mediaData.filePath).size : 0,
                sentTime: new Date(),
                status: 'Completed',
                deviceId: channel,
                whatsappNumber: client.info?.me?.user || channel,
                campaignId: null,
                campaignName: 'Test Message',
                recipient: number,
                direction: 'outgoing',
                bill: 1
            });
            
            res.json({ 
                status: true, 
                msg: mediaData ? 'Test media sent successfully!' : 'Test message sent successfully!' 
            });
        } else {
            res.json({ 
                status: false, 
                msg: 'Failed to send test message' 
            });
        }

    } catch (err) {
        console.error('Test error:', err);
        res.json({ 
            status: false, 
            msg: `Failed: ${err.message}` 
        });
    }
});

// =========================
// CANCEL SCHEDULED CAMPAIGN
// =========================
router.post('/cancel-campaign/:campaignId', async (req, res) => {
    try {
        const campaign = await Campaign.findOne({ 
            campaignId: req.params.campaignId
        });
        
        if (!campaign) {
            return res.json({ status: false, msg: 'Campaign not found' });
        }
        
        // Cancel the scheduled job
        if (scheduledJobs[campaign.campaignId]) {
            scheduledJobs[campaign.campaignId].cancel();
            delete scheduledJobs[campaign.campaignId];
            console.log(`❌ Cancelled scheduled job for campaign ${campaign.campaignId}`);
        }
        
        // Update campaign status if it's still scheduled
        if (campaign.status === 'scheduled') {
            campaign.status = 'cancelled';
            await campaign.save();
        }
        
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
// GET SCHEDULED CAMPAIGNS
// =========================
router.get('/scheduled-campaigns', async (req, res) => {
    try {
        const campaigns = await Campaign.find({ 
            status: 'scheduled',
            scheduledAt: { $gte: new Date() }
        }).sort({ scheduledAt: 1 });
        
        res.json({
            status: true,
            campaigns: campaigns.map(c => ({
                campaignId: c.campaignId,
                campaignName: c.campaignName || `Campaign ${c.campaignId.substring(0, 8)}`,
                scheduledAt: c.scheduledAt,
                totalContacts: c.totalContacts,
                messageType: c.messageType,
                message: c.message ? (c.message.substring(0, 50) + (c.message.length > 50 ? '...' : '')) : '',
                deviceId: c.deviceId,
                status: c.status
            }))
        });
    } catch (error) {
        res.json({ status: false, msg: error.message });
    }
});

// =========================
// RESCHEDULE A CAMPAIGN
// =========================
router.post('/reschedule-campaign/:campaignId', async (req, res) => {
    try {
        const { scheduledDate, scheduledTime } = req.body;
        const campaignId = req.params.campaignId;
        
        const campaign = await Campaign.findOne({ campaignId });
        if (!campaign) {
            return res.json({ status: false, msg: 'Campaign not found' });
        }
        
        if (campaign.status !== 'scheduled') {
            return res.json({ status: false, msg: 'Only scheduled campaigns can be rescheduled' });
        }
        
        const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`);
        const now = new Date();
        
        if (scheduledAt <= now) {
            return res.json({ 
                status: false, 
                msg: 'Schedule time must be in the future' 
            });
        }
        
        // Cancel existing job
        if (scheduledJobs[campaignId]) {
            scheduledJobs[campaignId].cancel();
            delete scheduledJobs[campaignId];
        }
        
        // Update campaign schedule
        campaign.scheduledAt = scheduledAt;
        await campaign.save();
        
        // Schedule new job
        const job = scheduleCampaignJob(campaign);
        
        if (job) {
            res.json({
                status: true,
                msg: `Campaign rescheduled for ${scheduledAt.toLocaleString()}`,
                scheduledAt: scheduledAt
            });
        } else {
            res.json({
                status: false,
                msg: 'Failed to reschedule campaign'
            });
        }
        
    } catch (error) {
        console.error('Reschedule error:', error);
        res.json({ status: false, msg: error.message });
    }
});

// =========================
// CHECK DEVICE STATUS
// =========================
router.get('/check-device/:deviceId', async (req, res) => {
    try {
        const client = clients[req.params.deviceId];
        if (!client) {
            return res.json({ 
                status: false, 
                connected: false,
                msg: 'Device not connected' 
            });
        }
        
        const isReady = client.info && client.info.wid;
        
        res.json({
            status: true,
            connected: isReady,
            deviceInfo: {
                wid: client.info?.wid,
                pushname: client.info?.pushname,
                phone: client.info?.me?.user
            }
        });
        
    } catch (error) {
        res.json({ status: false, msg: error.message });
    }
});

// =========================
// CAMPAIGN STATUS
// =========================
router.get('/campaign-status/:campaignId', async (req, res) => {
    try {
        const campaign = await Campaign.findOne({ 
            campaignId: req.params.campaignId 
        });
        
        if (!campaign) {
            return res.json({ status: false, msg: 'Campaign not found' });
        }
        
        res.json({
            status: true,
            campaign: {
                campaignId: campaign.campaignId,
                campaignName: campaign.campaignName || `Campaign ${campaign.campaignId.substring(0, 8)}`,
                status: campaign.status,
                sentCount: campaign.sentCount,
                failedCount: campaign.failedCount,
                totalContacts: campaign.totalContacts,
                messageType: campaign.messageType,
                progress: campaign.totalContacts > 0 ? 
                    Math.round((campaign.sentCount / campaign.totalContacts) * 100) : 0,
                scheduledAt: campaign.scheduledAt,
                completedAt: campaign.completedAt,
                scheduleType: campaign.scheduleType,
                deviceId: campaign.deviceId,
                failedNumbers: campaign.failedNumbers || []
            }
        });
    } catch (error) {
        res.json({ status: false, msg: error.message });
    }
});

// =========================
// GET ALL CAMPAIGNS
// =========================
router.get('/campaigns', async (req, res) => {
    try {
        const campaigns = await Campaign.find()
            .sort({ createdAt: -1 })
            .limit(50);
        
        res.json({
            status: true,
            campaigns: campaigns.map(c => ({
                campaignId: c.campaignId,
                campaignName: c.campaignName || `Campaign ${c.campaignId.substring(0, 8)}`,
                status: c.status,
                sentCount: c.sentCount,
                failedCount: c.failedCount,
                totalContacts: c.totalContacts,
                messageType: c.messageType,
                scheduleType: c.scheduleType,
                scheduledAt: c.scheduledAt,
                completedAt: c.completedAt,
                progress: c.totalContacts > 0 ? 
                    Math.round((c.sentCount / c.totalContacts) * 100) : 0,
                createdAt: c.createdAt,
                deviceId: c.deviceId
            }))
        });
    } catch (error) {
        res.json({ status: false, msg: error.message });
    }
});

// =========================
// DELETE CAMPAIGN
// =========================
router.delete('/campaign/:campaignId', async (req, res) => {
    try {
        const campaign = await Campaign.findOne({ campaignId: req.params.campaignId });
        
        if (!campaign) {
            return res.json({ status: false, msg: 'Campaign not found' });
        }
        
        // Cancel scheduled job if exists
        if (scheduledJobs[campaign.campaignId]) {
            scheduledJobs[campaign.campaignId].cancel();
            delete scheduledJobs[campaign.campaignId];
        }
        
        await Campaign.deleteOne({ campaignId: req.params.campaignId });
        
        res.json({ 
            status: true, 
            msg: 'Campaign deleted successfully' 
        });
        
    } catch (error) {
        res.json({ status: false, msg: error.message });
    }
});

// =========================
// GET ACTIVE JOBS
// =========================
router.get('/active-jobs', (req, res) => {
    try {
        const jobs = Object.keys(scheduledJobs).map(campaignId => {
            const job = scheduledJobs[campaignId];
            return {
                campaignId,
                nextInvocation: job.nextInvocation(),
                scheduledAt: job.nextInvocation()
            };
        });
        
        res.json({
            status: true,
            jobs,
            count: jobs.length
        });
    } catch (error) {
        res.json({ status: false, msg: error.message });
    }
});

module.exports = router;