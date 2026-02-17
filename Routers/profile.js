const router=require('express').Router()

router.get('/profile', async (req, res) => {
        res.render('profile');
});

module.exports=router