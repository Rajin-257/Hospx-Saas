const express = require('express');
const router = express.Router();

const User = require('../models/User');
const Database = require('../models/Database');
const Payment = require('../models/Payment');
const Commission = require('../models/Commission');
const { requireAuth, isAdmin } = require('../middleware/auth');

// Get dashboard stats
router.get('/stats', requireAuth, async (req, res) => {
    try {
        const userStats = await User.getStats();
        const databaseStats = await Database.getStats();
        const paymentStats = await Payment.getStats();
        const commissionStats = await Commission.getStats();

        res.json({
            success: true,
            stats: { users: userStats, databases: databaseStats, payments: paymentStats, commissions: commissionStats }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Validate email availability  
router.post('/validate-email', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findByEmail(email);
        res.json({
            exists: !!user,
            message: user ? 'Email already registered' : 'Email available'
        });
    } catch (error) {
        res.status(500).json({ exists: true, message: 'Server error' });
    }
});

// Validate domain availability
router.post('/validate-domain', async (req, res) => {
    try {
        const { domain } = req.body;
        const existingDomain = await Database.checkDomainExists(domain);
        const exists = !!existingDomain;
        res.json({
            exists: exists,
            message: exists ? 'Domain already registered' : 'Domain available'
        });
    } catch (error) {
        res.status(500).json({ exists: true, message: 'Server error' });
    }
});

// Validate subdomain availability
router.post('/validate-subdomain', async (req, res) => {
    try {
        const { subdomain } = req.body;
        const fullDomain = subdomain + '.Hospx.app';
        const existingDomain = await Database.checkDomainExists(fullDomain);
        const exists = !!existingDomain;
        res.json({
            exists: exists,
            message: exists ? 'Subdomain already registered' : 'Subdomain available'
        });
    } catch (error) {
        res.status(500).json({ exists: true, message: 'Server error' });
    }
});

// Validate reference code
router.post('/validate-reference', async (req, res) => {
    try {
        const { reference_code } = req.body;
        const validation = await User.validateReferenceCode(reference_code);
        res.json(validation);
    } catch (error) {
        res.status(500).json({ valid: false, message: 'Server error' });
    }
});

// Check domain availability
router.post('/check-domain', async (req, res) => {
    try {
        const { domain } = req.body;
        const exists = await User.checkDomainExists(domain);
        res.json({
            available: !exists,
            message: exists ? 'Domain already exists' : 'Domain is available'
        });
    } catch (error) {
        res.status(500).json({ available: false, message: 'Server error' });
    }
});

// Check email availability
router.post('/check-email', async (req, res) => {
    try {
        const { email } = req.body;
        const exists = await User.checkEmailExists(email);
        res.json({
            available: !exists,
            message: exists ? 'Email already exists' : 'Email is available'
        });
    } catch (error) {
        res.status(500).json({ available: false, message: 'Server error' });
    }
});

module.exports = router; 