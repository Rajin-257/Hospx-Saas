const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

const Payment = require('../models/Payment');
const Database = require('../models/Database');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// Payment method selection
router.get('/select/:type/:id?', async (req, res) => {
    const { type, id } = req.params;
    let paymentData = {
        type,
        amount: parseFloat(process.env.SUBSCRIPTION_PRICE) || 1000,
        currency: process.env.CURRENCY || 'BDT'
    };

    if (type === 'renewal' && id) {
        const database = await Database.findById(id);
        if (database) {
            paymentData.database_id = id;
            paymentData.database_name = database.database_name;
        }
    }

    res.render('payment/select-method', {
        title: 'Select Payment Method',
        paymentData
    });
});

// bKash payment
router.get('/bkash', (req, res) => {
    res.render('payment/bkash', {
        title: 'bKash Payment',
        paymentData: req.query
    });
});

router.post('/bkash/process', [
    body('phone').trim().isLength({ min: 11 }),
    body('transaction_id').trim().isLength({ min: 5 }),
    body('amount').isFloat({ min: 1 })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        req.flash('error_msg', 'Invalid payment information');
        return res.redirect('/payment/bkash');
    }

    const { phone, transaction_id, amount, payment_type, database_id } = req.body;
    
    const payment = new Payment({
        user_id: req.session.user.id,
        amount: parseFloat(amount),
        payment_method: 'bkash',
        transaction_id,
        status: 'completed', // Dummy - auto approve
        payment_type: payment_type || 'subscription',
        reference_data: { phone, database_id }
    });

    const result = await payment.save();
    if (result.success) {
        if (payment_type === 'renewal' && database_id) {
            await Database.renewDatabase(database_id, 1);
        }
        req.flash('success_msg', 'Payment successful!');
        res.redirect(`/payment/success/${payment.id}`);
    } else {
        req.flash('error_msg', 'Payment failed');
        res.redirect('/payment/bkash');
    }
});

// Nagad payment
router.get('/nagad', (req, res) => {
    res.render('payment/nagad', {
        title: 'Nagad Payment', 
        paymentData: req.query
    });
});

router.post('/nagad/process', [
    body('phone').trim().isLength({ min: 11 }),
    body('transaction_id').trim().isLength({ min: 5 }),
    body('amount').isFloat({ min: 1 })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        req.flash('error_msg', 'Invalid payment information');
        return res.redirect('/payment/nagad');
    }

    const { phone, transaction_id, amount, payment_type, database_id } = req.body;
    
    const payment = new Payment({
        user_id: req.session.user.id,
        amount: parseFloat(amount),
        payment_method: 'nagad',
        transaction_id,
        status: 'completed',
        payment_type: payment_type || 'subscription',
        reference_data: { phone, database_id }
    });

    const result = await payment.save();
    if (result.success) {
        if (payment_type === 'renewal' && database_id) {
            await Database.renewDatabase(database_id, 1);
        }
        req.flash('success_msg', 'Payment successful!');
        res.redirect(`/payment/success/${payment.id}`);
    } else {
        req.flash('error_msg', 'Payment failed');
        res.redirect('/payment/nagad');
    }
});

// Payment success
router.get('/success/:id', async (req, res) => {
    const payment = await Payment.findById(req.params.id);
    if (!payment || payment.user_id !== req.session.user.id) {
        req.flash('error_msg', 'Payment not found');
        return res.redirect('/dashboard');
    }

    res.render('payment/success', {
        title: 'Payment Successful',
        payment
    });
});

// Create payment (API endpoint for payment modal)
router.post('/create', [
    body('database_id').isUUID().withMessage('Invalid database ID'),
    body('amount').isFloat({ min: 1 }).withMessage('Invalid amount'),
    body('period').isInt({ min: 1 }).withMessage('Invalid period'),
    body('period_type').isIn(['days', 'months']).withMessage('Invalid period type'),
    body('payment_method').isIn(['bkash', 'nagad', 'rocket', 'bank']).withMessage('Invalid payment method'),
    body('phone_number').trim().isLength({ min: 11 }).withMessage('Invalid phone number'),
    body('transaction_id').trim().isLength({ min: 5 }).withMessage('Invalid transaction ID'),
    body('payment_type').optional().isIn(['renewal', 'extend']).withMessage('Invalid payment type')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.log('Validation errors:', errors.array());
            console.log('Request body:', req.body);
            return res.status(400).json({ 
                success: false, 
                message: 'Validation failed: ' + errors.array()[0].msg 
            });
        }

        const { 
            database_id, 
            amount, 
            period, 
            period_type, 
            payment_method, 
            phone_number, 
            transaction_id, 
            reference_code, 
            payment_type 
        } = req.body;

        console.log('Creating payment with payment_type:', payment_type);

        // Verify database belongs to user OR user is making payment for their referral
        const database = await Database.findById(database_id);
        if (!database) {
            return res.status(404).json({ 
                success: false, 
                message: 'Database not found' 
            });
        }

        // Check if user owns the database OR if the database owner was referred by this user
        const isOwner = database.user_id === req.session.user.id;
        let isReferralPayment = false;
        
        if (!isOwner) {
            // Check if the database owner was referred by the current user
            const User = require('../models/User');
            const databaseOwner = await User.findById(database.user_id);
            if (databaseOwner && databaseOwner.referred_by === req.session.user.id) {
                isReferralPayment = true;
            }
        }

        if (!isOwner && !isReferralPayment) {
            return res.status(403).json({ 
                success: false, 
                message: 'Access denied: You can only make payments for your own databases or databases of users you referred' 
            });
        }

        // Create payment record
        const payment = new Payment({
            user_id: req.session.user.id, // The person making the payment
            amount: parseFloat(amount),
            payment_method,
            transaction_id,
            status: 'pending', // Pending approval by admin
            payment_type: payment_type || 'renewal',
            reference_data: {
                database_id,
                database_name: database.database_name,
                database_owner_id: database.user_id, // The actual owner of the database
                phone_number,
                period,
                period_type,
                reference_code: reference_code || null,
                is_referral_payment: isReferralPayment, // Flag to indicate this is a referral payment
                paid_by_referrer: isReferralPayment ? req.session.user.id : null
            }
        });

        console.log('Payment object before save:', {
            payment_type: payment.payment_type,
            reference_data: payment.reference_data
        });

        const result = await payment.save();
        
        if (result.success) {
            res.json({ 
                success: true, 
                message: 'Payment submitted successfully! It will be processed after admin verification.',
                payment_id: payment.id
            });
        } else {
            res.status(500).json({ 
                success: false, 
                message: 'Failed to create payment record' 
            });
        }
    } catch (error) {
        console.error('Payment create error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error: Unable to process payment' 
        });
    }
});

module.exports = router; 