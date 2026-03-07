const router=require('express').Router()


router.get('/settings',(req,res)=>{
    res.render('Setting.ejs')
})

router.get('/upload',(req,res)=>{
    res.render('FileUpload')
})

router.get('/logo',(req,res)=>{
    res.render('Settings/UserLogs')
})


module.exports=router