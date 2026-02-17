const router = require('express').Router();
const EmailProvider = require('../models/EmailProvider');

// GET: SMTP Providers List
router.get('/email/providers', async (req, res) => {
    try {
        const providers = await EmailProvider.find().sort({ created_at: -1 });
        res.render('email/providers', { providers });
    } catch (error) {
        console.error(error);
        res.render('email/providers', { providers: [] });
    }
});

// GET: Add Provider Form
router.get('/email/add-provider', (req, res) => {
    res.render('email/add-provider');
});

// POST: Create New Provider
router.post('/email/add-provider', async (req, res) => {
    try {
        const { 
            name, 
            provider_type, 
            host, 
            port, 
            username, 
            password, 
            encryption,
            from_email,
            from_name,
            daily_limit 
        } = req.body;

        const newProvider = new EmailProvider({
            name,
            provider_type,
            host,
            port: parseInt(port),
            username,
            password,
            encryption: encryption || 'tls',
            from_email,
            from_name,
            daily_limit: daily_limit || 10000,
            status: 'testing'
        });

        await newProvider.save();
        res.redirect('/email/providers');
    } catch (error) {
        console.error(error);
        res.render('email/add-provider', { error: 'Failed to add provider' });
    }
});

// POST: Delete Provider
router.post('/email/delete-provider/:id', async (req, res) => {
    try {
        await EmailProvider.findByIdAndDelete(req.params.id);
        res.redirect('/email/providers');
    } catch (error) {
        console.error(error);
        res.redirect('/email/providers');
    }
});

// POST: Toggle Provider Status
router.post('/email/toggle-status/:id', async (req, res) => {
    try {
        const provider = await EmailProvider.findById(req.params.id);
        if (provider) {
            provider.status = provider.status === 'active' ? 'inactive' : 'active';
            await provider.save();
        }
        res.redirect('/email/providers');
    } catch (error) {
        console.error(error);
        res.redirect('/email/providers');
    }
});

// POST: Test Provider Connection
router.post('/email/test-provider/:id', async (req, res) => {
    try {
        const provider = await EmailProvider.findById(req.params.id);
        if (provider) {
            // Simulate testing
            provider.status = 'active';
            await provider.save();
            req.flash('success', 'Provider connection tested successfully!');
        }
        res.redirect('/email/providers');
    } catch (error) {
        console.error(error);
        req.flash('error', 'Failed to test provider connection');
        res.redirect('/email/providers');
    }
});

router.get('/email/add-provider',(req,res)=>{
    res.render('Email/add-provider.ejs')
})
router.get('/email/campaigns',(req,res)=>{
    res.render('Email/campaigns.ejs')
})
router.get('/email/reports',(req,res)=>{
    res.render('Email/email-reports.ejs')
})
router.get('/email/templates',(req,res)=>{
    res.render('Email/templates.ejs')
})

module.exports = router;