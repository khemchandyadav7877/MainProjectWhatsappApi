const express = require('express');
const router = express.Router();

router.get('/virtual-numbers',(req,res)=>{
    res.render('VirtualNumbers.ejs')
})

module.exports = router;