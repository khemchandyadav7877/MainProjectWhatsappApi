const router=require('express').Router()


router.get('/dashboard', async (req, res) => {
        res.render('dashboard');
});

router.get('/profile', async (req, res) => {
    res.render('profile', {
        activeTab: 'profile',
        user: req.session.user || req.user || {
            role: 'SuperAdmin',
            firstName: 'Admin',
            lastName: 'User',
            email: 'admin@example.com'
        }
    });
});


router.get('/', async (req, res) => {
        res.render('Login/login');
});

module.exports=router