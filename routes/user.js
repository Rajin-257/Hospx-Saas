const express = require('express');
const router = express.Router();

// Import models
const Database = require('../models/Database');
const Payment = require('../models/Payment');
const Commission = require('../models/Commission');
const User = require('../models/User');
const { requireAuth, isExecutive } = require('../middleware/auth');
const db = require('../config/database');

// Apply middleware to all routes
router.use(requireAuth);
router.use(isExecutive);

// Executive Dashboard
router.get('/dashboard', async (req, res) => {
    try {
        const userId = req.session.user.id;

        // Get user's databases
        const databases = await Database.findByUserId(userId);

        // Get user's commission stats
        const commissionStats = await Commission.getStats({ user_id: userId });

        // Get recent commissions
        const recentCommissions = await Commission.findByUserId(userId, { limit: 10 });

        // Get user's payment history
        const payments = await Payment.findByUserId(userId, { limit: 10 });

        res.render('user/dashboard', {
            title: 'Executive Dashboard',
            user: req.session.user,
            databases,
            commissionStats,
            recentCommissions,
            payments
        });
    } catch (error) {
        console.error('Executive dashboard error:', error);
        req.flash('error_msg', 'Error loading dashboard');
        res.render('user/dashboard', {
            title: 'Executive Dashboard',
            user: req.session.user,
            databases: [],
            commissionStats: {
                total_commissions: 0,
                paid_commissions: 0,
                pending_commissions: 0,
                total_amount: 0,
                paid_amount: 0,
                pending_amount: 0
            },
            recentCommissions: [],
            payments: []
        });
    }
});

// View user's databases
router.get('/databases', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const databases = await Database.findByUserId(userId);
        
        res.render('user/databases', {
            title: 'My Databases',
            user: req.session.user,
            databases
        });
    } catch (error) {
        console.error('User databases error:', error);
        req.flash('error_msg', 'Error loading databases');
        res.render('user/databases', {
            title: 'My Databases',
            user: req.session.user,
            databases: []
        });
    }
});

// View commission reports
router.get('/commissions', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const filters = {
            user_id: userId,
            status: req.query.status,
            date_from: req.query.date_from,
            date_to: req.query.date_to
        };

        const commissions = await Commission.findByUserId(userId, filters);
        const commissionStats = await Commission.getStats({ user_id: userId });
        
        res.render('user/commissions', {
            title: 'My Commissions',
            user: req.session.user,
            commissions,
            commissionStats,
            filters
        });
    } catch (error) {
        console.error('User commissions error:', error);
        req.flash('error_msg', 'Error loading commissions');
        res.render('user/commissions', {
            title: 'My Commissions',
            user: req.session.user,
            commissions: [],
            commissionStats: {
                total_commissions: 0,
                paid_commissions: 0,
                pending_commissions: 0,
                total_amount: 0,
                paid_amount: 0,
                pending_amount: 0
            },
            filters: {}
        });
    }
});

// View payment history
router.get('/payments', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const filters = {
            status: req.query.status,
            payment_type: req.query.payment_type
        };

        const payments = await Payment.findByUserId(userId, filters);
        const paymentStats = await Payment.getStats({ user_id: userId });
        
        res.render('user/payments', {
            title: 'My Payments',
            user: req.session.user,
            payments,
            paymentStats,
            filters
        });
    } catch (error) {
        console.error('User payments error:', error);
        req.flash('error_msg', 'Error loading payments');
        res.render('user/payments', {
            title: 'My Payments',
            user: req.session.user,
            payments: [],
            paymentStats: {
                total_payments: 0,
                completed_payments: 0,
                total_revenue: 0,
                pending_payments: 0
            },
            filters: {}
        });
    }
});

// Get payment details (API endpoint)
router.get('/api/payments/:id/details', async (req, res) => {
    try {
        const payment = await Payment.findById(req.params.id);
        if (!payment || payment.user_id !== req.session.user.id) {
            return res.status(404).json({ success: false, message: 'Payment not found' });
        }
        res.json({ success: true, payment });
    } catch (error) {
        console.error('Get payment details error:', error);
        res.status(500).json({ success: false, message: 'Error loading payment details' });
    }
});

// Update last accessed for database
router.post('/databases/:id/access', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const database = await Database.findById(req.params.id);
        
        if (!database || database.user_id !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        await Database.updateLastAccessed(req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error('Update database access error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Renew database (user can renew their own databases)
router.post('/databases/:id/renew', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const database = await Database.findById(req.params.id);
        
        if (!database || database.user_id !== userId) {
            return res.status(403).json({ 
                success: false, 
                error: 'Access denied - Database not found or unauthorized' 
            });
        }

        const { period = 15, periodType = 'days' } = req.body;
        
        const result = await Database.renewDatabase(req.params.id, period, periodType);
        
        if (result.success) {
            res.json({ 
                success: true, 
                message: result.message || `Database renewed successfully for ${period} ${periodType}`,
                newExpiryDate: result.newExpiryDate
            });
        } else {
            res.status(400).json({ 
                success: false, 
                error: result.error || 'Failed to renew database'
            });
        }
    } catch (error) {
        console.error('User database renewal error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error while renewing database'
        });
    }
});

// Get referrals page
router.get('/referrals', async (req, res) => {
    try {
        // Get fresh user data
        const user = await User.findById(req.session.user.id);
        if (!user) {
            req.flash('error_msg', 'User not found');
            return res.redirect('/login');
        }

        // Get all users referred by this user
        const query = `
            SELECT 
                u.id,
                u.full_name,
                u.email,
                u.phone,
                u.created_at,
                db.id as database_id,
                dom.domain_name,
                db.database_name,
                dom.status as domain_status,
                db.expiry_date,
                db.last_accessed
            FROM users u
            LEFT JOIN \`databases\` db ON u.id = db.user_id
            LEFT JOIN domains dom ON db.domain_id = dom.id
            WHERE u.referred_by = ?
            ORDER BY u.created_at DESC
        `;
        
        const referredUsers = await db.executeQuery(query, [user.id]);

        // Get commission statistics
        const commissionStats = await Commission.getUserStats(user.id);

        res.render('user/referrals', {
            title: 'My Referrals',
            referredUsers,
            commissionStats,
            user: user
        });
    } catch (error) {
        console.error('Referrals page error:', error);
        req.flash('error_msg', 'Error loading referrals');
        res.redirect('/user/dashboard');
    }
});

module.exports = router; 