const router = require('express').Router()
const yearTable = require('../models/yearsession')

// Add Session Page
router.get('/addnewsessionyears', (req, res) => {
    res.render("AddNewSession.ejs", { 
        error: null,
        message: null,
        activeSession: req.activeSession 
    })
})

// Save Session
router.post('/addnewsessionyears', async (req, res) => {
    try {
        const { session } = req.body
        
        // Validation
        if (!session) {
            return res.render("AddNewSession.ejs", { 
                error: "Session name is required",
                message: null,
                activeSession: req.activeSession 
            })
        }

        // Check if session already exists
        const existingSession = await yearTable.findOne({ sessionna: session })
        if (existingSession) {
            return res.render("AddNewSession.ejs", { 
                error: "This session already exists",
                message: null,
                activeSession: req.activeSession 
            })
        }

        // Check if this is the first session
        const totalSessions = await yearTable.countDocuments()
        
        const sessionRecord = new yearTable({
            sessionna: session,
            status: totalSessions === 0 ? "Active" : "Inactive",
            sessionType: "Current"
        })

        await sessionRecord.save()
        
        // Agar ye first session hai to session mein bhi set karo
        if (totalSessions === 0 && req.session) {
            req.session.activeYear = sessionRecord
        }

        res.redirect('/addnewsessionyear?message=Session added successfully')
    } catch (error) {
        console.log(error)
        res.render("AddNewSession.ejs", { 
            error: "Error creating session",
            message: null,
            activeSession: req.activeSession 
        })
    }
})

// Show All Sessions
router.get('/addnewsessionyear', async (req, res) => {
    try {
        const records = await yearTable.find().sort({ createdAt: -1 })
        const message = req.query.message || null
        
        res.render("Session.ejs", { 
            records,
            message: message,
            activeSession: req.activeSession,
            currentYear: new Date().getFullYear()
        })
    } catch (error) {
        console.log(error)
        res.redirect('/')
    }
})

// DELETE SESSION
router.get('/deletesession/:id', async (req, res) => {
    try {
        const sessionToDelete = await yearTable.findById(req.params.id)
        
        // Active session ko delete na karne do
        if (sessionToDelete && sessionToDelete.status === 'Active') {
            return res.redirect('/addnewsessionyear?message=Cannot delete active session')
        }

        await yearTable.findByIdAndDelete(req.params.id)
        res.redirect('/addnewsessionyear?message=Session deleted successfully')
    } catch (error) {
        console.log(error)
        res.redirect('/addnewsessionyear?message=Error deleting session')
    }
})

// SET ACTIVE SESSION - PERFECT LOGIC
router.get('/activesession/:id', async (req, res) => {
    try {
        const newActiveSessionId = req.params.id
        
        // Sabko inactive karo
        await yearTable.updateMany({}, { status: "Inactive", sessionType: "Next" })
        
        // Selected ko active karo
        const activeSession = await yearTable.findByIdAndUpdate(
            newActiveSessionId, 
            { 
                status: "Active", 
                sessionType: "Current",
                updatedAt: Date.now()
            },
            { new: true }
        )

        if (!activeSession) {
            return res.redirect('/addnewsessionyear?message=Session not found')
        }

        // IMPORTANT: Sabhi logged-in users ke sessions destroy karo
        // Ye step ensure karega ki jab session change ho to sab logout ho jayein
        
        // Agar aap chahte ho ki sirf current user logout ho:
        if (req.session.user) {
            req.session.destroy((err) => {
                if (err) console.log(err)
                // Redirect to login with message
                return res.redirect('/login?message=Session changed to ' + activeSession.sessionna + '. Please login again.')
            })
        } else {
            res.redirect('/addnewsessionyear?message=Active session changed to ' + activeSession.sessionna)
        }
        
    } catch (error) {
        console.log(error)
        res.redirect('/addnewsessionyear?message=Error changing session')
    }
})

// Get Current Active Session (API)
router.get('/api/active-session', async (req, res) => {
    try {
        const activeSession = await yearTable.findOne({ status: 'Active' })
        res.json({ 
            success: true, 
            session: activeSession 
        })
    } catch (error) {
        res.json({ 
            success: false, 
            error: error.message 
        })
    }
})

// Add this route to your yearsession.js file

// API to get all sessions for dropdown
router.get('/api/sessions', async (req, res) => {
    try {
        const sessions = await yearTable.find().sort({ createdAt: -1 });
        const activeSession = await yearTable.findOne({ status: 'Active' });
        
        res.json({
            success: true,
            sessions: sessions,
            activeSession: activeSession
        });
    } catch (error) {
        console.error('Error fetching sessions:', error);
        res.json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router