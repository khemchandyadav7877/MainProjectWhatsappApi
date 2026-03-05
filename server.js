const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const http = require('http');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const app = express();

/* =======================
   SESSION SETUP - PERFECT CONFIGURATION
======================= */
app.use(session({
    secret: 'your-super-secret-key-change-this-123456',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: 'mongodb://127.0.0.1:27017/whatsmessage',
        touchAfter: 24 * 3600, // 24 hours
        collectionName: 'sessions'
    }),
    cookie: {
        maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year (for Remember Me)
        httpOnly: true,
        secure: false, // Set true if using HTTPS
        sameSite: 'lax'
    },
    name: 'whatsapp.sid', // Custom session name
    rolling: true // Reset cookie maxAge on every response
}));

/* =======================
   MIDDLEWARE SETUP
======================= */
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

/* =======================
   VIEW ENGINE SETUP
======================= */
app.set('view engine', 'ejs');   
app.set('views', path.join(__dirname, 'views'));
app.use(express.static("public"));

/* =======================
   MONGODB CONNECTION
======================= */
mongoose.connect('mongodb://127.0.0.1:27017/whatsmessage', {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB Connected'))
.catch(err => console.error('❌ Mongo Error:', err));

const { clients } = require('./Routers/WhtasappScane');
global.whatsappClients = clients;

// Global middleware for WhatsApp clients
app.use((req, res, next) => {
  req.whatsappClients = clients;
  next();
});

// Global middleware to check active session year
app.use(async (req, res, next) => {
    try {
        const yearTable = require('./models/yearsession');
        const activeSession = await yearTable.findOne({ status: 'Active' });
        
        if (activeSession) {
            req.activeSession = activeSession;
            
            // Check if user's session matches active year
            if (req.session.userId && req.session.sessionYear) {
                if (req.session.sessionYear.toString() !== activeSession._id.toString()) {
                    // Year mismatch - destroy session
                    return req.session.destroy((err) => {
                        res.clearCookie('whatsapp.sid');
                        return res.redirect('/login?message=Session expired due to year change&messageType=error');
                    });
                }
            }
        }
        
        res.locals.activeSession = activeSession || null;
        next();
    } catch (error) {
        console.error('Session year check error:', error);
        next();
    }
});

/* =======================
   ROUTERS
======================= */
const whatsappRouter = require('./Routers/WhtasappScane');
const campaignRouter = require('./Routers/campaign');
const ContentRouter = require('./Routers/ContentRouter');
const AuthRouter = require('./Routers/auths');
const chatsRouter = require('./Routers/Chats');
const settingRouter = require('./Routers/SettingRouter');
const virtualNumberRouter = require('./Routers/virtualNumber');
const emailRouter = require('./Routers/emailRouter');
const profileRouter = require('./Routers/profile');
const notificationRuter = require('./Routers/notifications');
const adsManagementRouter = require('./Routers/AdsManagement');
const officialWhatsappApi = require('./Routers/officialWhatsApp.js');
const dashboardRouter = require('./Routers/dashboard.js');
const custorRouter = require('./Routers/CustomRoles.js');
const logochangerRouter = require('./Routers/LogoChanger.js');
const changepasswordRouter = require('./Routers/change-password.js');
const yearRouters = require('./Routers/yearsession.js');

// ✅ Use routes
app.use('/', AuthRouter);
app.use('/', chatsRouter);
app.use('/', whatsappRouter.router);
app.use('/', campaignRouter);
app.use('/', ContentRouter);
app.use('/', settingRouter);
app.use('/', virtualNumberRouter);
app.use('/', emailRouter);
app.use('/', profileRouter);
app.use('/', notificationRuter);
app.use('/', adsManagementRouter);
app.use('/', officialWhatsappApi);
app.use('/', dashboardRouter);
app.use('/', custorRouter);
app.use('/', logochangerRouter);
app.use('/', changepasswordRouter);
app.use('/', yearRouters);

/* =======================
   404 ERROR HANDLER
======================= */
app.use((req, res) => {
    res.status(404).render('404');
});

/* =======================
   SERVER START
======================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📱 WhatsApp Scan: http://localhost:${PORT}/WhatsappScan`);
});