const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const mysql = require('mysql2');
const fs = require('fs');




// Import models and services
const User = require('../models/User');
const Database = require('../models/Database');
const Payment = require('../models/Payment');
const Commission = require('../models/Commission');
const emailService = require('../services/emailService');
const webuzoService = require('../services/webuzoService');
const { isNotAuthenticated, requireAuth } = require('../middleware/auth');

// Home page (landing page)
router.get('/', (req, res) => {
    res.render('landing', {
        title: 'Webuzo SaaS Platform',
        subscriptionPrice: process.env.SUBSCRIPTION_PRICE || 1000,
        currency: process.env.CURRENCY || 'BDT'
    });
});

// Login page
router.get('/login', isNotAuthenticated, (req, res) => {
    res.render('auth/login', {
        title: 'Login'
    });
});

// Login POST
router.post('/login', isNotAuthenticated, [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.flash('error_msg', 'Please provide valid email and password');
            return res.redirect('/login');
        }

        const { email, password } = req.body;

        // Find user
        const user = await User.findByEmail(email);
        if (!user) {
            req.flash('error_msg', 'Invalid email or password');
            return res.redirect('/login');
        }

        // Check if user has password (only executives and admins can login)
        if (!user.password || user.role === 'user') {
            req.flash('error_msg', 'Your account is pending approval. You will receive login credentials once approved.');
            return res.redirect('/login');
        }

        // Check if account is active
        if (user.status !== 'active') {
            req.flash('error_msg', 'Your account has been deactivated. Please contact support.');
            return res.redirect('/login');
        }

        // Verify password
        const isValidPassword = await user.verifyPassword(password);
        if (!isValidPassword) {
            req.flash('error_msg', 'Invalid email or password');
            return res.redirect('/login');
        }

        // Set session
        req.session.user = user.toJSON();
        req.flash('success_msg', `Welcome back, ${user.full_name}!`);

        // Redirect based on role
        if (user.role === 'superadmin' || user.role === 'admin') {
            res.redirect('/admin/dashboard');
        } else if (user.role === 'executive') {
            res.redirect('/user/dashboard');
        } else {
            res.redirect('/dashboard');
        }
    } catch (error) {
        console.error('Login error:', error);
        req.flash('error_msg', 'An error occurred during login. Please try again.');
        res.redirect('/login');
    }
});

// Register page
router.get('/register', isNotAuthenticated, (req, res) => {
    res.render('auth/register', {
        title: 'Register',
        subscriptionPrice: process.env.SUBSCRIPTION_PRICE || 1000,
        currency: process.env.CURRENCY || 'BDT'
    });
});

// Register POST
router.post('/register', isNotAuthenticated, [
    body('full_name').trim().isLength({ min: 2 }).escape(),
    body('phone').trim().isLength({ min: 10 }),
    body('email').isEmail().normalizeEmail(),
    body('expected_domain').trim().isLength({ min: 3 }),
    body('reference_code').optional().trim(),
    body('domain_type').notEmpty()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.flash('error_msg', 'Please fill all fields correctly');
            return res.redirect('/register');
        }

        const { full_name, phone, email, expected_domain, reference_code, domain_type } = req.body;

        // Validate reference code if provided
        let referredBy = null;
        if (reference_code) {
            const refValidation = await User.validateReferenceCode(reference_code);
            if (!refValidation.valid) {
                req.flash('error_msg', 'Invalid reference code');
                return res.redirect('/register');
            }
            referredBy = refValidation.referrer.id;
        }

        // Check if domain already exists
        const domainExists = await Database.checkDomainExists(expected_domain);
        if (domainExists) {
            req.flash('error_msg', 'Domain already exists. Please choose a different domain.');
            return res.redirect('/register');
        }

        // Check if email already exists
        const emailExists = await User.findByEmail(email);
        if (emailExists) {
            req.flash('error_msg', 'Email already exists. Please use a different email.');
            return res.redirect('/register');
        }

        // Create user without password
        const user = new User({
            full_name,
            phone,
            email,
            referred_by: referredBy,
            role: 'user',
            status: 'active'
        });

        const userResult = await user.save();
        if (!userResult.success) {
            req.flash('error_msg', 'Failed to create user account');
            return res.redirect('/register');
        }

        // Create database with 15 days expiry
        const databaseName = `${expected_domain.replace(/\./g, '_')}_db`;
        const expiryDate = moment().add(15, 'days').format('YYYY-MM-DD');

        try {
            // Check if it's a subdomain (ends with .hospx.com)
            const isSubdomain = expected_domain.endsWith('.hospx.com');
            
            if (!isSubdomain) {
                // Only call Webuzo API for custom domains, not subdomains
                const webuzoResult = await webuzoService.createCompleteSetup(expected_domain, databaseName);
                console.log('Webuzo API Result for custom domain:', webuzoResult);
            } else {
                // For subdomains, we skip Webuzo domain creation
                existingdatabaseUser = process.env.DatabaseUser; 
                const webuzoDbCreate = await webuzoService.createDatabase(databaseName);
                const webuzoDbUserAdd = await webuzoService.addDatabaseUser(databaseName, existingdatabaseUser);
                console.log('Subdomain registration - skipping Webuzo domain creation:', webuzoDbCreate, webuzoDbUserAdd);
            }
            
            
            const domainLink = uuidv4();
            

            // Create domain record (same for both subdomain and custom domain)
            const { executeQuery } = require('../config/database');
            await executeQuery(
                'INSERT INTO domains (id, domain_name, user_id, database_name, expiry_date, domain_type) VALUES (?, ?, ?, ?, ?, ?)',
                [domainLink, expected_domain, user.id, databaseName, expiryDate, domain_type]
            );

            // Create database record regardless of domain type
            const database = new Database({
                database_name: 'edusofto_' + databaseName,
                user_id: user.id,
                domain_id: domainLink,
                expiry_date: expiryDate,
                status: 'active'
            });

            await database.save();


            const connection = mysql.createConnection({
                host: process.env.DB_HOST,
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                database: 'testing_saas_sql',
                multipleStatements: true  // Enable multiple statements
            });

            const sql = fs.readFileSync('uploads/dbcreate.sql', 'utf8');
            connection.query(sql, (err, results) => {
                if (err) {
                    console.error('Error executing SQL:', err);
                } else {
                    console.log('SQL executed successfully');
                }
                connection.end();
            });


        } catch (apiError) {
            console.error('Domain setup error:', apiError);
            // Continue with registration even if API fails
        }

        // Send welcome email
        await emailService.sendWelcomeEmail(email, full_name, expected_domain);

        req.flash('success_msg', 'Registration successful! You will receive login credentials once your account is approved by an administrator.');
        res.redirect('/login');

    } catch (error) {
        console.error('Registration error:', error);
        req.flash('error_msg', 'An error occurred during registration. Please try again.');
        res.redirect('/register');
    }
});

// Forgot password page
router.get('/forgot-password', isNotAuthenticated, (req, res) => {
    res.render('auth/forgot-password', {
        title: 'Forgot Password'
    });
});

// Forgot password POST
router.post('/forgot-password', isNotAuthenticated, [
    body('email').isEmail().normalizeEmail()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.flash('error_msg', 'Please provide a valid email address');
            return res.redirect('/forgot-password');
        }

        const { email } = req.body;
        const user = await User.findByEmail(email);

        if (!user) {
            req.flash('error_msg', 'No account found with that email address');
            return res.redirect('/forgot-password');
        }

        // Users with 'user' role cannot reset password
        if (user.role === 'user' || !user.password) {
            req.flash('error_msg', 'Password reset is not available for your account type. Please contact support.');
            return res.redirect('/forgot-password');
        }

        // Generate reset token (simplified - in production use crypto)
        const resetToken = uuidv4();
        const { executeQuery } = require('../config/database');
        
        // Store reset token (expire in 1 hour)
        await executeQuery(
            'UPDATE users SET password_reset_token = ?, password_reset_expires = DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE id = ?',
            [resetToken, user.id]
        );

        // Send password reset email
        await emailService.sendPasswordResetEmail(email, user.full_name, resetToken);

        req.flash('success_msg', 'Password reset instructions have been sent to your email');
        res.redirect('/login');

    } catch (error) {
        console.error('Forgot password error:', error);
        req.flash('error_msg', 'An error occurred. Please try again.');
        res.redirect('/forgot-password');
    }
});

// Reset password page
router.get('/reset-password', isNotAuthenticated, async (req, res) => {
    try {
        const { token } = req.query;
        if (!token) {
            req.flash('error_msg', 'Invalid or missing reset token');
            return res.redirect('/forgot-password');
        }

        const { executeQuery } = require('../config/database');
        const results = await executeQuery(
            'SELECT id, full_name, email FROM users WHERE password_reset_token = ? AND password_reset_expires > NOW()',
            [token]
        );

        if (results.length === 0) {
            req.flash('error_msg', 'Invalid or expired reset token');
            return res.redirect('/forgot-password');
        }

        res.render('auth/reset-password', {
            title: 'Reset Password',
            token: token,
            user: results[0]
        });

    } catch (error) {
        console.error('Reset password page error:', error);
        req.flash('error_msg', 'An error occurred. Please try again.');
        res.redirect('/forgot-password');
    }
});

// Reset password POST
router.post('/reset-password', isNotAuthenticated, [
    body('password').isLength({ min: 6 }),
    body('confirm_password').custom((value, { req }) => {
        if (value !== req.body.password) {
            throw new Error('Passwords do not match');
        }
        return value;
    })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.flash('error_msg', 'Please provide a valid password (minimum 6 characters) and ensure passwords match');
            return res.redirect(`/reset-password?token=${req.body.token}`);
        }

        const { token, password } = req.body;
        const { executeQuery } = require('../config/database');
        
        const results = await executeQuery(
            'SELECT id FROM users WHERE password_reset_token = ? AND password_reset_expires > NOW()',
            [token]
        );

        if (results.length === 0) {
            req.flash('error_msg', 'Invalid or expired reset token');
            return res.redirect('/forgot-password');
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Update password and clear reset token
        await executeQuery(
            'UPDATE users SET password = ?, password_reset_token = NULL, password_reset_expires = NULL WHERE id = ?',
            [hashedPassword, results[0].id]
        );

        req.flash('success_msg', 'Password has been reset successfully. You can now log in.');
        res.redirect('/login');

    } catch (error) {
        console.error('Reset password error:', error);
        req.flash('error_msg', 'An error occurred. Please try again.');
        res.redirect('/forgot-password');
    }
});

// Dashboard redirect (determines dashboard based on role)
router.get('/dashboard', requireAuth, (req, res) => {
    const user = req.session.user;
    
    if (user.role === 'superadmin' || user.role === 'admin') {
        res.redirect('/admin/dashboard');
    } else if (user.role === 'executive') {
        res.redirect('/user/dashboard');
    } else {
        req.flash('error_msg', 'Access denied');
        res.redirect('/login');
    }
});

// Change password page
router.get('/change-password', requireAuth, (req, res) => {
    res.render('auth/change-password', {
        title: 'Change Password'
    });
});

// Change password POST
router.post('/change-password', requireAuth, [
    body('current_password').notEmpty(),
    body('new_password').isLength({ min: 6 }),
    body('confirm_password').custom((value, { req }) => {
        if (value !== req.body.new_password) {
            throw new Error('Passwords do not match');
        }
        return value;
    })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.flash('error_msg', 'Please fill all fields correctly');
            return res.redirect('/change-password');
        }

        const { current_password, new_password } = req.body;
        const user = await User.findById(req.session.user.id);

        if (!user) {
            req.flash('error_msg', 'User not found');
            return res.redirect('/change-password');
        }

        // Verify current password
        const isValidPassword = await user.verifyPassword(current_password);
        if (!isValidPassword) {
            req.flash('error_msg', 'Current password is incorrect');
            return res.redirect('/change-password');
        }

        // Update password
        user.password = await user.hashPassword(new_password);
        await user.update();

        req.flash('success_msg', 'Password changed successfully');
        res.redirect('/dashboard');

    } catch (error) {
        console.error('Change password error:', error);
        req.flash('error_msg', 'An error occurred. Please try again.');
        res.redirect('/change-password');
    }
});

// Logout
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/');
    });
});

// API endpoint to validate reference code
router.post('/api/validate-reference', async (req, res) => {
    try {
        const { reference_code } = req.body;
        
        if (!reference_code) {
            return res.json({ valid: false, message: 'Reference code is required' });
        }

        const validation = await User.validateReferenceCode(reference_code);
        
        if (validation.valid) {
            res.json({
                valid: true,
                message: `Valid reference from ${validation.referrer.name}`,
                referrer: validation.referrer
            });
        } else {
            res.json({
                valid: false,
                message: 'Invalid reference code'
            });
        }
    } catch (error) {
        console.error('Reference validation error:', error);
        res.status(500).json({ valid: false, message: 'Server error' });
    }
});

// API endpoint to check domain availability
router.post('/api/check-domain', async (req, res) => {
    try {
        const { domain } = req.body;
        
        if (!domain) {
            return res.json({ available: false, message: 'Domain is required' });
        }

        const exists = await User.checkDomainExists(domain);
        
        res.json({
            available: !exists,
            message: exists ? 'Domain already exists' : 'Domain is available'
        });
    } catch (error) {
        console.error('Domain check error:', error);
        res.status(500).json({ available: false, message: 'Server error' });
    }
});

// API endpoint to check email availability
router.post('/api/check-email', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.json({ available: false, message: 'Email is required' });
        }

        const exists = await User.checkEmailExists(email);
        
        res.json({
            available: !exists,
            message: exists ? 'Email already exists' : 'Email is available'
        });
    } catch (error) {
        console.error('Email check error:', error);
        res.status(500).json({ available: false, message: 'Server error' });
    }
});

module.exports = router; 