const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const http = require('http');
const session = require('express-session'); // ✅ ADD THIS
const app = express();
const server = http.createServer(app);

/* =======================
   SESSION SETUP - ADD THIS FIRST!
======================= */
app.use(session({
    secret: 'your-secret-key-change-this', // ✅ Change this!
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Set true if using HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
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
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

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

app.use((req, res, next) => {
  req.whatsappClients = clients;
  next();
});

/* =======================
   ROUTERS
======================= */
const whatsappRouter = require('./Routers/WhtasappScane');
const campaignRouter = require('./Routers/campaign');
const ContentRouter = require('./Routers/ContentRouter');
const AuthRouter = require('./Routers/auths');
const { router: webReportRouter } = require('./Routers/webRouter');
const chatsRouter = require('./Routers/Chats');
const settingRouter = require('./Routers/SettingRouter');
const virtualNumberRouter = require('./Routers/virtualNumber');
const emailRouter = require('./Routers/emailRouter');
const profileRouter = require('./Routers/profile');


// ✅ Use routes
app.use('/', AuthRouter);
app.use('/', chatsRouter);
app.use('/', whatsappRouter.router);
app.use('/', campaignRouter);
app.use('/', ContentRouter);
app.use('/', webReportRouter);
app.use('/', settingRouter);
app.use('/', virtualNumberRouter);
app.use('/', emailRouter);
app.use('/', profileRouter);

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