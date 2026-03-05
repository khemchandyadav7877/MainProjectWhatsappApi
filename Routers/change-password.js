const router=require('express').Router()

router.get('/change-password',(req,res)=>{
    res.render("Settings/change-password.ejs")
})

module.exports=router