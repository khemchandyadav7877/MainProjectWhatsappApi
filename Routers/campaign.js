const router = require('express').Router();
const Campaign = require('../models/Campaign');
const Device = require('../models/Device');
const Condevice = require('../models/Condevice');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { MessageMedia } = require('whatsapp-web.js');
const schedule = require('node-schedule');

const { clients } = require('./WhtasappScane');

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
    limits: { fileSize: 50 * 1024 * 1024 },
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

// Patch WhatsApp client
function patchWhatsAppClient(client) {
    if (!client || !client.pupPage) return;
    
    try {
        client.pupPage.evaluate(() => {
            if (window.WWebJS && window.WWebJS.sendSeen) {
                const originalSendSeen = window.WWebJS.sendSeen;
                
                window.WWebJS.sendSeen = async function(chatId) {
                    try {
                        return await originalSendSeen.call(this, chatId);
                    } catch (error) {
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

// =========================
// FIXED: SEND WHATSAPP MESSAGE - Returns boolean with proper error handling
// =========================
async function sendWhatsAppMessage(client, number, message, mediaData = null) {
    try {
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
        
        if (!client || !client.info || !client.info.wid) {
            console.log('❌ WhatsApp client not ready');
            return false;
        }
        
        patchWhatsAppClient(client);
        
        // TEXT ONLY MESSAGE
        if (!mediaData) {
            if (!message || message.trim() === '') {
                console.log('❌ No message to send');
                return false;
            }
            
            try {
                console.log(`📝 Sending text to ${cleanNumber}`);
                await client.sendMessage(chatId, message.trim());
                console.log(`✅ Text sent to ${cleanNumber}`);
                return true;
            } catch (textError) {
                console.error(`❌ Text error for ${cleanNumber}:`, textError.message);
                
                // Try alternative format (without @c.us)
                try {
                    const altChatId = formattedNumber;
                    await client.sendMessage(altChatId, message.trim());
                    console.log(`✅ Text sent via alternative format`);
                    return true;
                } catch (altErr) {
                    console.error(`❌ Alternative format failed:`, altErr.message);
                    return false;
                }
            }
        }
        
        // MEDIA MESSAGE
        if (mediaData && mediaData.filePath && fs.existsSync(mediaData.filePath)) {
            try {
                console.log(`📎 Sending media to ${cleanNumber}`);
                
                const fileData = fs.readFileSync(mediaData.filePath);
                const mime = require('mime-types');
                const mimeType = mime.lookup(mediaData.filePath) || 'application/octet-stream';
                
                const media = new MessageMedia(
                    mimeType,
                    fileData.toString('base64'),
                    path.basename(mediaData.filePath)
                );
                
                // Send media
                await client.sendMessage(chatId, media);
                console.log(`✅ Media sent to ${cleanNumber}`);
                
                // If there's a message, send it after a short delay
                if (message && message.trim() !== '') {
                    setTimeout(async () => {
                        try {
                            await client.sendMessage(chatId, message.trim());
                            console.log(`✅ Message sent to ${cleanNumber} after media`);
                        } catch (captionErr) {
                            console.log(`Message after media failed: ${captionErr.message}`);
                        }
                    }, 2000);
                }
                
                return true;
                
            } catch (mediaError) {
                console.error(`❌ Media error for ${cleanNumber}:`, mediaError.message);
                
                // Fallback: Try sending just the message if media fails
                if (message && message.trim() !== '') {
                    try {
                        await client.sendMessage(chatId, message.trim());
                        console.log(`✅ Text sent (media failed): ${cleanNumber}`);
                        return true;
                    } catch (textErr) {
                        console.error(`❌ Text fallback failed:`, textErr.message);
                        return false;
                    }
                }
                return false;
            }
        } else {
            console.log(`❌ Media file not found for ${cleanNumber}`);
            return false;
        }
        
    } catch (error) {
        console.error(`🔥 Send error for ${number}:`, error.message);
        return false;
    }
}

// =========================
// FIXED: Save sent message to database
// =========================
async function saveSentMessage(data) {
    try {
        const SentMessage = require('../models/SentMessage');
        await SentMessage.create(data);
    } catch (error) {
        console.error('Error saving sent message:', error);
    }
}

// =========================
// FIXED: Get media path from URL
// =========================
function getMediaPathFromUrl(mediaUrl) {
    if (!mediaUrl) return null;
    
    try {
        const filename = path.basename(mediaUrl);
        
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

// =========================
// FIXED: Schedule a campaign
// =========================
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
        
        if (scheduledJobs[campaign.campaignId]) {
            scheduledJobs[campaign.campaignId].cancel();
            delete scheduledJobs[campaign.campaignId];
        }
        
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

// =========================
// FIXED: Execute scheduled campaign
// =========================
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
        
        patchWhatsAppClient(client);
        
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
                
                console.log(`✅ [${i+1}/${campaign.numbers.length}] Sent to ${num}`);
            } else {
                failed++;
                failedNumbers.push(num);
                console.log(`❌ [${i+1}/${campaign.numbers.length}] Failed for ${num}`);
            }
            
            campaign.sentCount = sent;
            campaign.failedCount = failed;
            await campaign.save();
            
            if (i < campaign.numbers.length - 1) {
                const delay = (campaign.interval || 5) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        // ========== FIXED: CORRECT STATUS DETERMINATION ==========
        let finalStatus;
        let responseMsg;
        
        if (sent > 0 && failed === 0) {
            // All messages sent successfully
            finalStatus = 'completed';
            responseMsg = `✅ Campaign completed successfully! ${sent} message${sent > 1 ? 's' : ''} sent.`;
        } 
        else if (sent > 0 && failed > 0) {
            // Partial success - some sent, some failed
            finalStatus = 'completed'; // Still mark as completed but with partial success
            responseMsg = `⚠️ Campaign completed with partial success: ${sent} sent, ${failed} failed.`;
        } 
        else if (sent === 0 && failed > 0) {
            // All messages failed
            finalStatus = 'failed';
            responseMsg = `❌ Campaign failed: 0 sent, ${failed} failed.`;
        } 
        else {
            // No messages processed (shouldn't happen)
            finalStatus = 'failed';
            responseMsg = `❌ Campaign failed: No messages processed.`;
        }
        
        campaign.status = finalStatus;
        campaign.sentCount = sent;
        campaign.failedCount = failed;
        campaign.failedNumbers = failedNumbers;
        campaign.completedAt = new Date();
        await campaign.save();
        
        console.log(`🏁 Campaign ${campaignId} ${finalStatus}: ${sent} sent, ${failed} failed`);
        
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
// FIXED: Load scheduled campaigns on server start
// =========================
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
// FIXED: SEND CAMPAIGN - Main function with correct status handling
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

        // ===== GET CURRENT USER =====
        const user = req.session.user || req.user;
        if (!user) {
            return res.status(401).json({ 
                status: false, 
                msg: 'User not authenticated' 
            });
        }

        console.log('📨 Campaign data received:', {
            channel, 
            numbersCount: typeof numbers === 'string' ? numbers.split(',').length : numbers?.length,
            mediaUrl: mediaUrl ? 'Yes' : 'No',
            scheduleType,
            user: user.email,
            role: user.role
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

        // ===== CHECK DEVICE OWNERSHIP =====
        const device = await Device.findOne({ deviceId: channel });
        if (!device) {
            return res.json({ 
                status: false, 
                msg: 'Device not found' 
            });
        }

        // Check if user has access to this device
        if (user.role !== 'SuperAdmin' && device.createdBy.toString() !== user._id.toString()) {
            return res.status(403).json({ 
                status: false, 
                msg: 'You do not have permission to use this device' 
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

        patchWhatsAppClient(client);

        // Parse numbers and prepare final numbers array
        let numberArray;
        if (typeof numbers === 'string') {
            numberArray = numbers.split(/[,\n\s]+/)
                .map(n => n.trim().replace(/\D/g, ''))
                .filter(n => n.length >= 10);
        } else if (Array.isArray(numbers)) {
            numberArray = numbers;
        } else {
            return res.json({ status: false, msg: 'Invalid numbers format' });
        }

        if (numberArray.length === 0) {
            return res.json({ status: false, msg: 'No valid numbers found' });
        }

        console.log(`📱 Processing ${numberArray.length} numbers`);

        // Format numbers for WhatsApp (add 91 prefix if needed)
        const formattedNumbers = numberArray.map(num => {
            if (num.length === 10) {
                return '91' + num;
            } else if (num.length === 12 && num.startsWith('91')) {
                return num;
            } else {
                return num;
            }
        });

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

            // Create scheduled campaign record with user info
            campaign = await Campaign.create({
                campaignId: uuidv4(),
                deviceId: channel,
                numbers: formattedNumbers,
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
                createdAt: new Date(),
                createdBy: user._id,
                createdByRole: user.role,
                createdByEmail: user.email
            });

            const job = scheduleCampaignJob(campaign);
            
            if (job) {
                console.log(`✅ Campaign ${campaign.campaignId} scheduled successfully for user ${user.email}`);
                return res.json({
                    status: true,
                    scheduled: true,
                    scheduledAt: scheduledAt,
                    campaignId: campaign.campaignId,
                    msg: `Campaign scheduled for ${scheduledAt.toLocaleString()}`
                });
            } else {
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

        // Create campaign record with user info
        campaign = await Campaign.create({
            campaignId: campaignId,
            deviceId: channel,
            numbers: formattedNumbers,
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
            createdAt: new Date(),
            createdBy: user._id,
            createdByRole: user.role,
            createdByEmail: user.email
        });

        console.log(`🚀 Starting immediate campaign: ${campaignId} for user ${user.email}`);
        console.log(`Campaign Name: ${campaign.campaignName}`);
        console.log(`Message Type: ${mediaUrl ? 'media' : 'text'}`);

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
        for (let i = 0; i < formattedNumbers.length; i++) {
            const num = formattedNumbers[i];
            
            try {
                const success = await sendWhatsAppMessage(client, num, message, mediaData);
                
                if (success) {
                    sent++;
                    
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
                    
                    console.log(`✅ [${i+1}/${formattedNumbers.length}] Sent to ${num}`);
                } else {
                    failed++;
                    failedNumbers.push(num);
                    console.log(`❌ [${i+1}/${formattedNumbers.length}] Failed for ${num}`);
                }
                
                campaign.sentCount = sent;
                campaign.failedCount = failed;
                campaign.failedNumbers = failedNumbers;
                await campaign.save();

                if (i < formattedNumbers.length - 1) {
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

        // ========== FIXED: CORRECT STATUS DETERMINATION ==========
        let finalStatus;
        let responseMsg;
        
        if (sent > 0 && failed === 0) {
            // All messages sent successfully
            finalStatus = 'completed';
            responseMsg = `✅ Campaign completed successfully! ${sent} message${sent > 1 ? 's' : ''} sent.`;
        } 
        else if (sent > 0 && failed > 0) {
            // Partial success - some sent, some failed
            finalStatus = 'completed'; // Still mark as completed but with partial success
            responseMsg = `⚠️ Campaign completed with partial success: ${sent} sent, ${failed} failed.`;
        } 
        else if (sent === 0 && failed > 0) {
            // All messages failed
            finalStatus = 'failed';
            responseMsg = `❌ Campaign failed: 0 sent, ${failed} failed.`;
        } 
        else {
            // No messages processed (shouldn't happen)
            finalStatus = 'failed';
            responseMsg = `❌ Campaign failed: No messages processed.`;
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
            msg: responseMsg
        });

    } catch (err) {
        console.error('🔥 CAMPAIGN ERROR:', err);
        
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
// UPLOAD MEDIA
// =========================
router.post('/upload-media', upload.single('media'), (req, res) => {
    try {
        if (!req.file) {
            return res.json({ status: false, msg: 'No file uploaded' });
        }
        
        const filePath = path.join('public', 'uploads', req.file.filename);
        const fileUrl = '/uploads/' + req.file.filename;
        const absolutePath = path.resolve(filePath);
        
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
// SEND TEST MESSAGE
// =========================
router.post('/send-test', async (req, res) => {
    try {
        const { channel, number, message, mediaUrl } = req.body;

        const user = req.session.user || req.user;
        if (!user) {
            return res.status(401).json({ 
                status: false, 
                msg: 'User not authenticated' 
            });
        }

        console.log('🧪 Test message request:', {
            channel,
            number,
            hasMedia: !!mediaUrl,
            messageLength: message?.length || 0,
            user: user.email
        });

        const device = await Device.findOne({ deviceId: channel });
        if (!device) {
            return res.json({ 
                status: false, 
                msg: 'Device not found' 
            });
        }

        if (user.role !== 'SuperAdmin' && device.createdBy.toString() !== user._id.toString()) {
            return res.status(403).json({ 
                status: false, 
                msg: 'You do not have permission to use this device' 
            });
        }

        const client = clients[channel];
        if (!client || !client.info) {
            return res.json({ 
                status: false, 
                msg: 'WhatsApp not connected. Please scan QR code.' 
            });
        }

        patchWhatsAppClient(client);

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

        const success = await sendWhatsAppMessage(client, number, message, mediaData);

        if (success) {
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
        const user = req.session.user || req.user;
        if (!user) {
            return res.status(401).json({ 
                status: false, 
                msg: 'User not authenticated' 
            });
        }

        const campaign = await Campaign.findOne({ 
            campaignId: req.params.campaignId
        });
        
        if (!campaign) {
            return res.json({ status: false, msg: 'Campaign not found' });
        }

        if (user.role !== 'SuperAdmin' && campaign.createdBy.toString() !== user._id.toString()) {
            return res.status(403).json({ 
                status: false, 
                msg: 'You do not have permission to cancel this campaign' 
            });
        }
        
        if (scheduledJobs[campaign.campaignId]) {
            scheduledJobs[campaign.campaignId].cancel();
            delete scheduledJobs[campaign.campaignId];
            console.log(`❌ Cancelled scheduled job for campaign ${campaign.campaignId}`);
        }
        
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
        const user = req.session.user || req.user;
        if (!user) {
            return res.status(401).json({ status: false, msg: 'Unauthorized' });
        }

        let query = {
            status: 'scheduled',
            scheduledAt: { $gte: new Date() }
        };

        if (user.role !== 'SuperAdmin') {
            query.createdBy = user._id;
        }

        const campaigns = await Campaign.find(query).sort({ scheduledAt: 1 });
        
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
                status: c.status,
                createdByEmail: c.createdByEmail,
                createdByRole: c.createdByRole
            }))
        });
    } catch (error) {
        console.error('Error fetching scheduled campaigns:', error);
        res.status(500).json({ status: false, msg: error.message });
    }
});

// =========================
// GET ALL CAMPAIGNS
// =========================
router.get('/api/campaigns', async (req, res) => {
    try {
        const user = req.session.user || req.user;
        if (!user) {
            return res.status(401).json({ status: false, msg: 'Unauthorized' });
        }

        let query = {};

        if (user.role !== 'SuperAdmin') {
            query.createdBy = user._id;
        }

        const campaigns = await Campaign.find(query)
            .sort({ createdAt: -1 })
            .limit(100);
        
        const campaignData = campaigns.map(c => ({
            campaignId: c.campaignId,
            campaignName: c.campaignName || `Campaign ${c.campaignId.substring(0, 8)}`,
            status: c.status,
            sentCount: c.sentCount || 0,
            failedCount: c.failedCount || 0,
            totalContacts: c.totalContacts || 0,
            messageType: c.messageType || 'text',
            message: c.message || '',
            mediaUrl: c.mediaUrl || null,
            createdAt: c.createdAt,
            completedAt: c.completedAt,
            createdByEmail: c.createdByEmail,
            createdByRole: c.createdByRole
        }));
        
        res.json({
            status: true,
            campaigns: campaignData
        });
        
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ 
            status: false, 
            msg: error.message,
            campaigns: [] 
        });
    }
});

// =========================
// GET CAMPAIGN STATUS
// =========================
router.get('/campaign-status/:campaignId', async (req, res) => {
    try {
        const user = req.session.user || req.user;
        if (!user) {
            return res.status(401).json({ status: false, msg: 'Unauthorized' });
        }

        const campaign = await Campaign.findOne({ 
            campaignId: req.params.campaignId 
        });
        
        if (!campaign) {
            return res.json({ status: false, msg: 'Campaign not found' });
        }

        if (user.role !== 'SuperAdmin' && campaign.createdBy.toString() !== user._id.toString()) {
            return res.status(403).json({ 
                status: false, 
                msg: 'You do not have permission to view this campaign' 
            });
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
                message: campaign.message,
                mediaUrl: campaign.mediaUrl,
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
        console.error('Error fetching campaign status:', error);
        res.status(500).json({ status: false, msg: error.message });
    }
});

// =========================
// DELETE CAMPAIGN
// =========================
router.delete('/campaign/:campaignId', async (req, res) => {
    try {
        const user = req.session.user || req.user;
        if (!user) {
            return res.status(401).json({ status: false, msg: 'Unauthorized' });
        }

        const campaign = await Campaign.findOne({ campaignId: req.params.campaignId });
        
        if (!campaign) {
            return res.json({ status: false, msg: 'Campaign not found' });
        }

        if (user.role !== 'SuperAdmin' && campaign.createdBy.toString() !== user._id.toString()) {
            return res.status(403).json({ 
                status: false, 
                msg: 'You do not have permission to delete this campaign' 
            });
        }
        
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
        console.error('Error deleting campaign:', error);
        res.status(500).json({ status: false, msg: error.message });
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
        console.error('Error fetching active jobs:', error);
        res.status(500).json({ status: false, msg: error.message });
    }
});

// =========================
// API: GET CONTACTS FOR DROPDOWN
// =========================
router.get('/api/contacts', async (req, res) => {
    try {
        const user = req.session.user || req.user;
        if (!user) {
            return res.status(401).json({ 
                status: false, 
                msg: 'User not authenticated',
                contacts: [] 
            });
        }

        console.log('👤 Fetching contacts for user:', user.email, user.role);

        let query = {};
        if (user.role !== 'SuperAdmin') {
            query.createdBy = user._id;
        }

        const contacts = await Condevice.find(query)
            .select('name phoneNumber whatsappNumber email')
            .sort({ name: 1 });

        console.log(`✅ Found ${contacts.length} contacts for user ${user.email}`);

        const formattedContacts = contacts.map(c => ({
            id: c._id,
            name: c.name || 'Unnamed',
            phoneNumber: c.phoneNumber,
            whatsappNumber: c.whatsappNumber || c.phoneNumber,
            email: c.email || '',
            displayName: c.name 
                ? `${c.name} (${c.whatsappNumber || c.phoneNumber})` 
                : c.whatsappNumber || c.phoneNumber
        }));

        res.json({
            status: true,
            contacts: formattedContacts
        });

    } catch (error) {
        console.error('🔥 Error fetching contacts:', error);
        res.status(500).json({ 
            status: false, 
            msg: error.message,
            contacts: [] 
        });
    }
});

// =========================
// PAGE RENDER - WITH ROLE-BASED DEVICE FILTERING
// =========================
router.get('/devices/campaign', async (req, res) => {
    try {
        const user = req.session.user || req.user;
        if (!user) {
            return res.status(401).send('Unauthorized');
        }

        console.log('👤 User accessing campaign page:', {
            userId: user._id,
            role: user.role,
            email: user.email
        });

        let devices = [];
        
        if (user.role === 'SuperAdmin') {
            devices = await Device.find({ status: 'CONNECTED' }).sort({ createdAt: -1 });
            console.log(`🔍 SuperAdmin viewing ${devices.length} devices (ALL)`);
        } else {
            devices = await Device.find({ 
                status: 'CONNECTED',
                createdBy: user._id 
            }).sort({ createdAt: -1 });
            console.log(`🔍 ${user.role} viewing ${devices.length} devices (OWN)`);
        }
        
        let scheduledCampaigns = [];
        
        if (user.role === 'SuperAdmin') {
            scheduledCampaigns = await Campaign.find({ 
                status: 'scheduled',
                scheduledAt: { $gte: new Date() }
            }).sort({ scheduledAt: 1 });
        } else {
            scheduledCampaigns = await Campaign.find({ 
                status: 'scheduled',
                scheduledAt: { $gte: new Date() },
                createdBy: user._id
            }).sort({ scheduledAt: 1 });
        }

        let contacts = [];
        if (user.role === 'SuperAdmin') {
            contacts = await Condevice.find({}).sort({ name: 1 });
        } else {
            contacts = await Condevice.find({ 
                createdBy: user._id 
            }).sort({ name: 1 });
        }

        console.log(`📊 Found ${devices.length} devices, ${scheduledCampaigns.length} scheduled campaigns, and ${contacts.length} contacts for user ${user.email}`);
        
        res.render('Campaign', { 
            devices,
            scheduledCampaigns,
            contacts,
            activeTab: 'campaign',
            user: user,
            currentUserRole: user.role,
            currentUserId: user._id
        });
        
    } catch (error) {
        console.error('Campaign page error:', error);
        res.status(500).send('Internal server error');
    }
});

module.exports = router;