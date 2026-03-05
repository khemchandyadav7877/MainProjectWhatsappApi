const router=require('express').Router()


router.get('/LogoChanger',(req,res)=>{
    res.render("LogoChanger.ejs")
})

router.get('/secondDashbaord',(req,res)=>{
    res.render("secondDashboard.ejs")
})

router.get('/themesettings',(req,res)=>{
    res.render("theme-settings.ejs")
})




module.exports=router