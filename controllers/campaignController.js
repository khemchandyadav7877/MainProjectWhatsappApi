const Campaign = require('../models/Campaigns');
const Payment = require('../models/Payment');
const MetaWhatsAppAPI = require('../services/metaApi');
const PaymentService = require('../services/paymentService');

const paymentService = new PaymentService();

// Create campaign
exports.createCampaign = async (req, res) => {
    try {
        const {
            campaignName,
            campaignType,
            description,
            templateId,
            templateName,
            templateCategory,
            recipients,
            scheduleType,
            scheduledAt,
            mediaUrl,
            mediaType,
            mediaSize
        } = req.body;

        // Calculate cost
        const validRecipients = recipients.filter(r => r.phoneNumber && r.phoneNumber.length >= 10);
        const invalidRecipients = recipients.length - validRecipients.length;
        const estimatedCost = validRecipients.length * 0.005; // $0.005 per message

        const campaignId = 'CAMP_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

        const campaign = new Campaign({
            campaignId,
            campaignName,
            campaignType,
            description,
            templateId,
            templateName,
            templateCategory,
            mediaUrl,
            mediaType,
            mediaSize: mediaSize || 0,
            recipients: validRecipients.map(r => ({
                phoneNumber: r.phoneNumber,
                name: r.name || '',
                language: r.language || 'en',
                status: 'pending'
            })),
            totalRecipients: recipients.length,
            validRecipients: validRecipients.length,
            invalidRecipients: invalidRecipients.length,
            scheduleType,
            scheduledAt: scheduleType === 'later' ? scheduledAt : null,
            estimatedCost,
            paymentRequired: true,
            paymentStatus: 'pending',
            createdBy: req.user._id,
            createdByEmail: req.user.email,
            createdByRole: req.user.role,
            status: 'draft'
        });

        await campaign.save();

        // Create payment intent
        const paymentResult = await paymentService.createPaymentIntent(
            estimatedCost,
            'usd',
            { campaignId, userId: req.user._id.toString() }
        );

        if (!paymentResult.success) {
            return res.status(400).json({
                success: false,
                error: 'Failed to create payment'
            });
        }

        // Save payment details
        const payment = new Payment({
            paymentId: 'PAY_' + Date.now(),
            campaignId,
            userId: req.user._id,
            amount: estimatedCost,
            currency: 'usd',
            status: 'pending',
            paymentMethod: 'card',
            paymentIntentId: paymentResult.paymentIntentId,
            metadata: {
                campaignName,
                templateName
            }
        });

        await payment.save();

        // Update campaign with payment info
        campaign.paymentId = payment.paymentId;
        campaign.paymentIntentId = paymentResult.paymentIntentId;
        await campaign.save();

        res.json({
            success: true,
            campaignId,
            paymentIntentId: paymentResult.paymentIntentId,
            clientSecret: paymentResult.clientSecret,
            amount: estimatedCost,
            message: 'Campaign created. Please complete payment.'
        });

    } catch (error) {
        console.error('Create campaign error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Confirm payment and start campaign
exports.confirmPaymentAndStart = async (req, res) => {
    try {
        const { campaignId, paymentIntentId, paymentMethodId } = req.body;

        const campaign = await Campaign.findOne({ campaignId });
        if (!campaign) {
            return res.status(404).json({
                success: false,
                error: 'Campaign not found'
            });
        }

        // Confirm payment
        const paymentResult = await paymentService.confirmPayment(paymentIntentId, paymentMethodId);

        if (!paymentResult.success || paymentResult.status !== 'succeeded') {
            return res.status(400).json({
                success: false,
                error: 'Payment failed'
            });
        }

        // Update payment
        const payment = await Payment.findOne({ paymentIntentId });
        if (payment) {
            payment.status = 'succeeded';
            payment.paidAt = new Date();
            await payment.save();
        }

        // Update campaign
        campaign.paymentStatus = 'paid';
        campaign.status = 'queued';
        await campaign.save();

        // Start sending campaign
        startCampaignSending(campaignId);

        res.json({
            success: true,
            message: 'Payment confirmed. Campaign started.'
        });

    } catch (error) {
        console.error('Confirm payment error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Start campaign sending
async function startCampaignSending(campaignId) {
    try {
        const campaign = await Campaign.findOne({ campaignId });
        if (!campaign) return;

        // Initialize Meta API
        const metaApi = new MetaWhatsAppAPI(
            process.env.META_ACCESS_TOKEN,
            process.env.META_PHONE_NUMBER_ID,
            process.env.META_BUSINESS_ACCOUNT_ID
        );

        campaign.status = 'processing';
        campaign.sentAt = new Date();
        await campaign.save();

        // Send messages in batches
        const batchSize = 100;
        const recipients = campaign.recipients;
        
        for (let i = 0; i < recipients.length; i += batchSize) {
            const batch = recipients.slice(i, i + batchSize);
            
            await Promise.all(batch.map(async (recipient) => {
                try {
                    let result;
                    
                    if (campaign.mediaUrl && campaign.mediaType !== 'none') {
                        // Send media message
                        result = await metaApi.sendMediaMessage(
                            recipient.phoneNumber,
                            campaign.mediaType,
                            campaign.mediaUrl,
                            campaign.templateName
                        );
                    } else {
                        // Send template message
                        result = await metaApi.sendTemplateMessage(
                            recipient.phoneNumber,
                            campaign.templateName,
                            recipient.language || 'en'
                        );
                    }

                    if (result.success) {
                        recipient.status = 'sent';
                        recipient.messageId = result.messageId;
                        recipient.sentAt = new Date();
                        campaign.messagesSent++;
                    } else {
                        recipient.status = 'failed';
                        recipient.error = result.error;
                        campaign.messagesFailed++;
                    }
                } catch (err) {
                    recipient.status = 'failed';
                    recipient.error = err.message;
                    campaign.messagesFailed++;
                }
            }));

            await campaign.save();
            
            // Wait between batches
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        campaign.status = 'completed';
        campaign.completedAt = new Date();
        await campaign.save();

    } catch (error) {
        console.error('Campaign sending error:', error);
        await Campaign.findOneAndUpdate(
            { campaignId },
            { 
                status: 'failed',
                error: error.message
            }
        );
    }
}

// Get campaign status
exports.getCampaignStatus = async (req, res) => {
    try {
        const { campaignId } = req.params;
        
        const campaign = await Campaign.findOne({ campaignId });
        if (!campaign) {
            return res.status(404).json({
                success: false,
                error: 'Campaign not found'
            });
        }

        res.json({
            success: true,
            campaign: {
                campaignId: campaign.campaignId,
                campaignName: campaign.campaignName,
                status: campaign.status,
                paymentStatus: campaign.paymentStatus,
                messagesSent: campaign.messagesSent,
                messagesDelivered: campaign.messagesDelivered,
                messagesRead: campaign.messagesRead,
                messagesFailed: campaign.messagesFailed,
                totalRecipients: campaign.totalRecipients,
                validRecipients: campaign.validRecipients,
                estimatedCost: campaign.estimatedCost,
                actualCost: campaign.actualCost,
                createdAt: campaign.createdAt,
                sentAt: campaign.sentAt,
                completedAt: campaign.completedAt
            }
        });

    } catch (error) {
        console.error('Get campaign error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Get all campaigns
exports.getCampaigns = async (req, res) => {
    try {
        let query = {};
        
        if (req.user.role !== 'SuperAdmin') {
            query.createdBy = req.user._id;
        }

        const campaigns = await Campaign.find(query)
            .sort({ createdAt: -1 })
            .limit(50);

        res.json({
            success: true,
            campaigns: campaigns.map(c => ({
                campaignId: c.campaignId,
                campaignName: c.campaignName,
                campaignType: c.campaignType,
                status: c.status,
                paymentStatus: c.paymentStatus,
                messagesSent: c.messagesSent,
                totalRecipients: c.totalRecipients,
                estimatedCost: c.estimatedCost,
                createdAt: c.createdAt
            }))
        });

    } catch (error) {
        console.error('Get campaigns error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};