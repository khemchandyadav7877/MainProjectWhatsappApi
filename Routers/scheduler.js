const Campaign = require('../models/Campaign');
const { clients } = require('./WhtasappScane');

class CampaignScheduler {
    constructor() {
        this.interval = null;
    }

    start() {
        // Check every minute for scheduled campaigns
        this.interval = setInterval(async () => {
            await this.checkScheduledCampaigns();
        }, 60000); // 1 minute

        console.log('Campaign scheduler started');
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            console.log('Campaign scheduler stopped');
        }
    }

    async checkScheduledCampaigns() {
        try {
            const now = new Date();
            
            // Find campaigns scheduled for now or past
            const campaigns = await Campaign.find({
                schedule: 'later',
                status: 'pending',
                scheduleDate: { $lte: now },
                scheduleTime: { 
                    $lte: now.toTimeString().split(' ')[0] // HH:MM format
                }
            });

            for (const campaign of campaigns) {
                await this.executeCampaign(campaign);
            }

        } catch (error) {
            console.error('Error checking scheduled campaigns:', error);
        }
    }

    async executeCampaign(campaign) {
        try {
            const client = clients[campaign.deviceId];
            
            if (!client || !client.info) {
                console.log(`Client not found for device: ${campaign.deviceId}`);
                await Campaign.findByIdAndUpdate(campaign._id, {
                    status: 'failed',
                    failedReason: 'Device not connected'
                });
                return;
            }

            console.log(`Executing scheduled campaign: ${campaign.campaignId}`);
            
            // Update status to sending
            await Campaign.findByIdAndUpdate(campaign._id, {
                status: 'sending'
            });

            // Send messages
            let sent = 0;
            let failed = 0;
            const failedNumbers = [];

            for (let num of campaign.numbers) {
                try {
                    const chatId = num.replace('+', '') + '@c.us';
                    
                    const isRegistered = await client.isRegisteredUser(chatId);
                    if (!isRegistered) {
                        failed++;
                        failedNumbers.push({ number: num, reason: 'Not on WhatsApp' });
                        continue;
                    }

                    if (campaign.messageType === 'media' && campaign.mediaPath) {
                        // Handle media sending
                        const path = require('path');
                        const mediaPath = path.join(__dirname, '../public', campaign.mediaPath);
                        const fs = require('fs');
                        
                        if (fs.existsSync(mediaPath)) {
                            const mimeType = require('mime-types').lookup(mediaPath);
                            
                            if (mimeType && mimeType.startsWith('image/')) {
                                await client.sendMessage(chatId, {
                                    image: { url: mediaPath },
                                    caption: campaign.message
                                });
                            } else if (mimeType && mimeType.startsWith('video/')) {
                                await client.sendMessage(chatId, {
                                    video: { url: mediaPath },
                                    caption: campaign.message
                                });
                            } else {
                                await client.sendMessage(chatId, {
                                    document: { url: mediaPath },
                                    caption: campaign.message
                                });
                            }
                        } else {
                            await client.sendMessage(chatId, campaign.message);
                        }
                    } else {
                        await client.sendMessage(chatId, campaign.message);
                    }

                    sent++;
                    
                    // Update progress
                    await Campaign.findByIdAndUpdate(campaign._id, {
                        sentCount: sent
                    });

                    // Wait for interval
                    if (campaign.interval > 0) {
                        await new Promise(r => setTimeout(r, campaign.interval * 1000));
                    }

                } catch (err) {
                    console.log(`Failed to send to ${num}:`, err.message);
                    failed++;
                    failedNumbers.push({ number: num, reason: err.message });
                }
            }

            // Mark as completed
            await Campaign.findByIdAndUpdate(campaign._id, {
                status: 'completed',
                sentCount: sent,
                failedCount: failed,
                failedNumbers: failedNumbers,
                completedAt: new Date()
            });

            console.log(`Campaign ${campaign.campaignId} completed. Sent: ${sent}, Failed: ${failed}`);

        } catch (error) {
            console.error('Error executing campaign:', error);
            await Campaign.findByIdAndUpdate(campaign._id, {
                status: 'failed',
                failedReason: error.message
            });
        }
    }
}

module.exports = new CampaignScheduler();