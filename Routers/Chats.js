const express = require('express');
const router = express.Router();

router.get('/chats', (req, res) => {

    res.render('Chats/newChats', {
        activeTab: 'chats',
        user: req.session.user || req.user || {
            role: 'SuperAdmin',
            firstName: 'Admin',
            lastName: 'User',
            email: 'admin@example.com'
        }
    });

});


module.exports = router;


// bhai aapne ko ye karna hai phele “Two-Way Real-Time WhatsApp Chat / Conversational Messaging System” extra kuch bhi nahi karna plz 

// phele aapn chating ka karte hai plz 

