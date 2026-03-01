const router=require('express').Router()

router.get('/ads/create',(req,res)=>{
    res.render("Templates/AdsManagement/CreateAdCampaign.ejs")
})

router.get('/chatbot/flow-builder',(req,res)=>{
    res.render("Templates/AiChatbot/BotFlowBuilder.ejs")
})

module.exports=router