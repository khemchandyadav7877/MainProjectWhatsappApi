const router=require('express').Router()


router.get('/dashboard', async (req, res) => {
        res.render('dashboard');
});

router.get('/profile', async (req, res) => {
        res.render('profile');
});

router.get('/', async (req, res) => {
        res.render('Login/login');
});

module.exports=router