const router = require('express').Router();

router.get('/profile', async (req, res) => {
    // Check if user exists in session
    if (!req.session.user) {
        return res.redirect('/login');
    }

    res.render('profile', {
        activeTab: 'profile',
        user: req.session.user // Use ONLY the session user, no fallback
    });
});

module.exports = router;