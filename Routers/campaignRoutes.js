const express = require('express');
const router = express.Router();
const campaignController = require('../controllers/campaignController');
const { isAuthenticated } = require('../middleware/auth');

// Create campaign
router.post('/api/campaign/create', isAuthenticated, campaignController.createCampaign);

// Confirm payment and start campaign
router.post('/api/campaign/confirm-payment', isAuthenticated, campaignController.confirmPaymentAndStart);

// Get campaign status
router.get('/api/campaign/:campaignId', isAuthenticated, campaignController.getCampaignStatus);

// Get all campaigns
router.get('/api/campaigns', isAuthenticated, campaignController.getCampaigns);

module.exports = router;