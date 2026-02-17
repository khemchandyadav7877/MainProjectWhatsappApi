const router=require('express').Router()


router.get('/settings',(req,res)=>{
    res.render('Settings.ejs')
})

router.get('/upload',(req,res)=>{
    res.render('FileUpload')
})


module.exports=router