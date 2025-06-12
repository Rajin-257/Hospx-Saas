const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();

// Import models and services
const User = require('../models/User');
const Database = require('../models/Database');
const Payment = require('../models/Payment');
const Commission = require('../models/Commission');
const ReferenceCode = require('../models/ReferenceCode');
const emailService = require('../services/emailService');
const webuzoService = require('../services/webuzoService');
const { requireAuth, isAdmin } = require('../middleware/auth');
const db = require('../config/database');
const mysql = require('mysql2');

// Apply admin middleware to all routes
router.use(requireAuth);
router.use(isAdmin);

// Admin Dashboard
router.get('/dashboard', async (req, res) => {
    try {
        // Get statistics
        const userStats = await User.getStats();
        const databaseStats = await Database.getStats();
        const paymentStats = await Payment.getStats();
        const commissionStats = await Commission.getStats();

        // Get recent payments
        const recentPayments = await Payment.getRecentPayments(10);

        // Get databases expiring soon
        const expiringSoonDatabases = await Database.getExpiringSoon(7);

        res.render('admin/dashboard', {
            title: 'Admin Dashboard',
            stats: {
                users: userStats,
                databases: databaseStats,
                payments: paymentStats,
                commissions: commissionStats
            },
            recentPayments,
            expiringSoonDatabases
        });
    } catch (error) {
        console.error('Admin dashboard error:', error);
        req.flash('error_msg', 'Error loading dashboard');
        res.render('admin/dashboard', {
            title: 'Admin Dashboard',
            stats: {
                users: { total: 0, active: 0, executives: 0 },
                databases: { total: 0, active: 0, expired: 0, expiring_soon: 0 },
                payments: { total_payments: 0, completed_payments: 0, total_revenue: 0, pending_payments: 0 },
                commissions: { total_commissions: 0, paid_commissions: 0, pending_amount: 0 }
            },
            recentPayments: [],
            expiringSoonDatabases: []
        });
    }
});

// User Management Routes
router.get('/users', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const filters = {
            role: req.query.role,
            status: req.query.status,
            search: req.query.search
        };

        const users = await User.findAll(filters);
        
        // Calculate pagination
        const totalUsers = users.length;
        const totalPages = Math.ceil(totalUsers / limit);
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedUsers = users.slice(startIndex, endIndex);
        
        res.render('admin/users', {
            title: 'User Management',
            users: paginatedUsers,
            filters,
            pagination: {
                currentPage: page,
                totalPages: totalPages,
                totalUsers: totalUsers
            }
        });
    } catch (error) {
        console.error('Users page error:', error);
        req.flash('error_msg', 'Error loading users');
        res.render('admin/users', {
            title: 'User Management',
            users: [],
            filters: {},
            pagination: {
                currentPage: 1,
                totalPages: 1,
                totalUsers: 0
            }
        });
    }
});

// View user details
router.get('/users/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            req.flash('error_msg', 'User not found');
            return res.redirect('/admin/users');
        }

        // Get user's databases
        const databases = await Database.findByUserId(user.id);
        
        // Get user's payments
        const payments = await Payment.findByUserId(user.id);
        
        // Get user's commissions (if they refer others)
        const commissions = await Commission.findByUserId(user.id);

        res.render('admin/user-details', {
            title: `User: ${user.full_name}`,
            user,
            databases,
            payments,
            commissions
        });
    } catch (error) {
        console.error('User details error:', error);
        req.flash('error_msg', 'Error loading user details');
        res.redirect('/admin/users');
    }
});

// Update user role
router.post('/users/:id/role', [
    body('role').isIn(['user', 'executive', 'admin'])
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.flash('error_msg', 'Invalid role selected');
            return res.redirect(`/admin/users/${req.params.id}`);
        }

        const { role } = req.body;
        const result = await User.updateRole(req.params.id, role);

        if (result.success) {
            // Send credentials email if promoted to executive
            if (role === 'executive' && result.password && result.referenceCode) {
                const user = await User.findById(req.params.id);
                if (user) {
                    await emailService.sendCredentialsEmail(
                        user.email, 
                        user.full_name, 
                        result.password, 
                        result.referenceCode
                    );
                }
            }
            
            req.flash('success_msg', 'User role updated successfully');
        } else {
            req.flash('error_msg', 'Failed to update user role');
        }
    } catch (error) {
        console.error('Update role error:', error);
        req.flash('error_msg', 'Error updating user role');
    }
    
    res.redirect(`/admin/users/${req.params.id}`);
});

// Update user status
router.post('/users/:id/status', [
    body('status').isIn(['active', 'inactive'])
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.flash('error_msg', 'Invalid status selected');
            return res.redirect(`/admin/users/${req.params.id}`);
        }

        const { status } = req.body;
        const result = await User.updateStatus(req.params.id, status);

        if (result.success) {
            req.flash('success_msg', 'User status updated successfully');
        } else {
            req.flash('error_msg', 'Failed to update user status');
        }
    } catch (error) {
        console.error('Update status error:', error);
        req.flash('error_msg', 'Error updating user status');
    }
    
    res.redirect(`/admin/users/${req.params.id}`);
});

// Delete user
router.post('/users/:id/delete', async (req, res) => {
    try {
        const result = await User.deleteById(req.params.id);
        
        if (result.success) {
            req.flash('success_msg', 'User deleted successfully');
        } else {
            req.flash('error_msg', 'Failed to delete user');
        }
    } catch (error) {
        console.error('Delete user error:', error);
        req.flash('error_msg', 'Error deleting user');
    }
    
    res.redirect('/admin/users');
});

// Add User
router.post('/users/add', [
    body('full_name').trim().isLength({ min: 2 }),
    body('email').isEmail(),
    body('phone').trim().isLength({ min: 10 }),
    body('role').isIn(['user', 'executive', 'admin']),
    body('password').isLength({ min: 6 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.flash('error_msg', 'Please fill all fields correctly');
            return res.redirect('/admin/users');
        }

        const { full_name, email, phone, role, password } = req.body;

        // Check if user already exists
        const existingUser = await User.findByEmail(email);
        if (existingUser) {
            req.flash('error_msg', 'User with this email already exists');
            return res.redirect('/admin/users');
        }

        // Create new user
        const user = new User({
            full_name,
            email,
            phone,
            role,
            password,
            status: 'active'
        });

        const result = await user.save();
        
        if (result.success) {
            req.flash('success_msg', 'User created successfully');
        } else {
            req.flash('error_msg', 'Failed to create user');
        }
    } catch (error) {
        console.error('Add user error:', error);
        req.flash('error_msg', 'Error creating user');
    }
    
    res.redirect('/admin/users');
});

// Get user details (API endpoint)
router.get('/users/:id/details', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        console.error('Get user details error:', error);
        res.status(500).json({ success: false, message: 'Error loading user details' });
    }
});

// Update user
router.post('/users/:id/update', [
    body('full_name').trim().isLength({ min: 2 }),
    body('email').isEmail(),
    body('phone').trim().isLength({ min: 10 }),
    body('role').isIn(['user', 'executive', 'admin']),
    body('status').isIn(['active', 'inactive', 'suspended']),
    body('commission_percentage').optional().isFloat({ min: 0, max: 100 }),
    body('commission_fixed').optional().isFloat({ min: 0 }),
    body('commission_type').optional().isIn(['percentage', 'fixed'])
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.flash('error_msg', 'Please fill all fields correctly');
            return res.redirect('/admin/users');
        }

        const { full_name, email, phone, role, status, commission_percentage, commission_fixed, commission_type } = req.body;
        
        const result = await User.updateById(req.params.id, {
            full_name,
            email,
            phone,
            role,
            status,
            commission_percentage: commission_percentage || 0,
            commission_fixed: commission_fixed || 0,
            commission_type: commission_type || 'percentage'
        });

        if (result.success) {
            req.flash('success_msg', 'User updated successfully');
        } else {
            req.flash('error_msg', 'Failed to update user');
        }
    } catch (error) {
        console.error('Update user error:', error);
        req.flash('error_msg', 'Error updating user');
    }
    
    res.redirect('/admin/users');
});

// Promote user to executive
router.post('/users/:id/promote', async (req, res) => {
    try {
        const result = await User.promoteToExecutive(req.params.id);

        if (result.success) {
            // Send credentials email
            const user = await User.findById(req.params.id);
            if (user && result.password && result.referenceCode) {
                await emailService.sendCredentialsEmail(
                    user.email, 
                    user.full_name, 
                    result.password, 
                    result.referenceCode
                );
            }
            // Update add reference_code table populate in the database
            await ReferenceCode.create({
                code: result.referenceCode,
                user_id: req.params.id
            });
            req.flash('success_msg', 'User promoted to executive successfully');
        } else {
            req.flash('error_msg', 'Failed to promote user');
        }
    } catch (error) {
        console.error('Promote user error:', error);
        req.flash('error_msg', 'Error promoting user');
    }
        
    res.redirect('/admin/users');
});

// Database Management Routes
router.get('/databases', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const filters = {
            status: req.query.status,
            expiry_filter: req.query.expiry_filter,
            search: req.query.search
        };

        const databases = await Database.findAll(filters);
        const stats = await Database.getStats();
        
        // Calculate pagination
        const totalDatabases = databases.length;
        const totalPages = Math.ceil(totalDatabases / limit);
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedDatabases = databases.slice(startIndex, endIndex);
        
        res.render('admin/databases', {
            title: 'Database Management',
            databases: paginatedDatabases,
            filters,
            stats: {
                total_databases: stats.total,
                active_databases: stats.active,
                expired_databases: stats.expired,
                expiring_soon: stats.expiring_soon
            },
            pagination: {
                currentPage: page,
                totalPages: totalPages,
                totalDatabases: totalDatabases
            }
        });
    } catch (error) {
        console.error('Databases page error:', error);
        req.flash('error_msg', 'Error loading databases');
        res.render('admin/databases', {
            title: 'Database Management',
            databases: [],
            filters: {},
            stats: {
                total_databases: 0,
                active_databases: 0,
                expired_databases: 0,
                expiring_soon: 0
            },
            pagination: {
                currentPage: 1,
                totalPages: 1,
                totalDatabases: 0
            }
        });
    }
});

// Add custom database
router.post('/databases/add', [
    body('database_name').trim().isLength({ min: 3 }),
    body('user_id').isUUID(),
    body('expiry_date').isISO8601()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.flash('error_msg', 'Please fill all fields correctly');
            return res.redirect('/admin/databases');
        }

        const { database_name, user_id, expiry_date } = req.body;

        // Check if database already exists
        const exists = await Database.checkDatabaseExists(database_name);
        if (exists) {
            req.flash('error_msg', 'Database name already exists');
            return res.redirect('/admin/databases');
        }

        // Create database via Webuzo API
        const webuzoResult = await webuzoService.createDatabase(database_name);
        
        // Create database record
        const database = new Database({
            database_name,
            user_id,
            expiry_date,
            status: 'active'
        });

        const result = await database.save();
        
        if (result.success) {
            req.flash('success_msg', 'Database created successfully');
        } else {
            req.flash('error_msg', 'Failed to create database');
        }
    } catch (error) {
        console.error('Add database error:', error);
        req.flash('error_msg', 'Error creating database');
    }
    
    res.redirect('/admin/databases');
});

// Renew database
router.post('/databases/:id/renew', [
    body('months').optional().isInt({ min: 1, max: 12 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            if (req.headers.accept && req.headers.accept.includes('application/json')) {
                return res.status(400).json({ success: false, message: 'Invalid renewal period' });
            }
            req.flash('error_msg', 'Invalid renewal period');
            return res.redirect('/admin/databases');
        }

        // Use provided months or default to 15 days
        const months = req.body.months ? parseInt(req.body.months) : null;
        const result = months ? 
            await Database.renewDatabase(req.params.id, months, 'months') : 
            await Database.renewDatabase(req.params.id, 15, 'days');
        
        if (result.success) {
            if (req.headers.accept && req.headers.accept.includes('application/json')) {
                return res.json({ 
                    success: true, 
                    message: result.message || 'Database renewed successfully',
                    newExpiryDate: result.newExpiryDate 
                });
            }
            const renewalMessage = months ? `${months} month(s)` : '15 days';
            req.flash('success_msg', `Database renewed for ${renewalMessage}`);
            return res.redirect('/admin/databases');
        } else {
            if (req.headers.accept && req.headers.accept.includes('application/json')) {
                return res.status(400).json({ success: false, message: result.error || 'Failed to renew database' });
            }
            req.flash('error_msg', result.error || 'Failed to renew database');
            return res.redirect('/admin/databases');
        }
    } catch (error) {
        console.error('Renew database error:', error);
        if (req.headers.accept && req.headers.accept.includes('application/json')) {
            return res.status(500).json({ success: false, message: 'Internal server error while renewing database' });
        }
        req.flash('error_msg', 'Internal server error while renewing database');
        return res.redirect('/admin/databases');
    }
});

// Delete database
router.post('/databases/:id/delete', async (req, res) => {
    try {
        // Use the enhanced deleteCompletely method instead of basic deleteById
        const result = await Database.deleteCompletely(req.params.id);
        
        if (result.success) {
            let message = result.message;
            if (result.warnings && result.warnings.length > 0) {
                message += '. Warnings: ' + result.warnings.join('; ');
            }
            
            if (req.headers.accept && req.headers.accept.includes('application/json')) {
                return res.json({ 
                    success: true, 
                    message: message,
                    deletedItems: result.deletedItems,
                    warnings: result.warnings 
                });
            }
            req.flash('success_msg', message);
            return res.redirect('/admin/databases');
        } else {
            const errorMessage = result.error || 'Failed to delete database';
            if (req.headers.accept && req.headers.accept.includes('application/json')) {
                return res.status(400).json({ success: false, message: errorMessage });
            }
            req.flash('error_msg', errorMessage);
            return res.redirect('/admin/databases');
        }
    } catch (error) {
        console.error('Delete database error:', error);
        const errorMessage = 'Internal server error while deleting database';
        if (req.headers.accept && req.headers.accept.includes('application/json')) {
            return res.status(500).json({ success: false, message: errorMessage });
        }
        req.flash('error_msg', errorMessage);
        return res.redirect('/admin/databases');
    }
});

// Create Database with user selection
router.post('/databases/create', [
    body('user_id').notEmpty(),
    body('domain_name').trim().isLength({ min: 3 }),
    body('database_name').trim().isLength({ min: 3 }),
    body('expiry_days').isInt({ min: 1, max: 365 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.flash('error_msg', 'Please fill all fields correctly');
            return res.redirect('/admin/databases');
        }

        const { user_id, domain_name, database_name, expiry_days } = req.body;

        // Check if database already exists
        const exists = await Database.checkDatabaseExists(database_name);
        if (exists) {
            req.flash('error_msg', 'Database name already exists');
            return res.redirect('/admin/databases');
        }

        // Calculate expiry date
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + parseInt(expiry_days));

        // Create database via Webuzo API
        const webuzoResult = await webuzoService.createDatabase(database_name);
        
        // Create database record
        const database = new Database({
            user_id,
            domain_name,
            database_name,
            expiry_date: expiryDate,
            status: 'active',
            db_username: webuzoResult.username || `${database_name}_user`,
            db_password: webuzoResult.password || Math.random().toString(36).slice(-8),
            db_host: 'localhost',
            db_port: 3306
        });

        const result = await database.save();
        
        if (result.success) {
            req.flash('success_msg', 'Database created successfully');
        } else {
            req.flash('error_msg', 'Failed to create database');
        }
    } catch (error) {
        console.error('Create database error:', error);
        req.flash('error_msg', 'Error creating database');
    }
    
    res.redirect('/admin/databases');
});

// Get database details (API endpoint)
router.get('/databases/:id/details', async (req, res) => {
    try {
        const database = await Database.findByIdWithUser(req.params.id);
        if (!database) {
            return res.status(404).json({ success: false, message: 'Database not found' });
        }
        res.json(database);
    } catch (error) {
        console.error('Get database details error:', error);
        res.status(500).json({ success: false, message: 'Error loading database details' });
    }
});

// Renew expiring databases
router.post('/databases/renew-expiring', async (req, res) => {
    try {
        const result = await Database.renewExpiring(7); // Renew databases expiring in 7 days
        
        if (result.success) {
            res.json({ success: true, count: result.count, message: 'Databases renewed successfully' });
        } else {
            res.json({ success: false, message: 'Failed to renew databases' });
        }
    } catch (error) {
        console.error('Renew expiring databases error:', error);
        res.status(500).json({ success: false, message: 'Error renewing databases' });
    }
});

// Get users for database creation
router.get('/databases/users', async (req, res) => {
    try {
        const users = await User.findAll({ status: 'active' });
        res.json(users);
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ success: false, message: 'Error loading users' });
    }
});

// Edit domain for database
router.post('/databases/domain/edit', [
    body('database_id').notEmpty().withMessage('Database ID is required'),
    body('domain_type').isIn(['subdomain', 'custom']).withMessage('Invalid domain type'),
    body('expected_domain').trim().isLength({ min: 3 }).withMessage('Domain must be at least 3 characters')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.flash('error_msg', 'Please fill all fields correctly: ' + errors.array().map(e => e.msg).join(', '));
            return res.redirect('/admin/databases');
        }

        const { database_id, domain_type, expected_domain, subdomain_name, custom_domain_name } = req.body;

        // Get the current database
        const database = await Database.findByIdWithDomain(database_id);
        if (!database) {
            req.flash('error_msg', 'Database not found');
            return res.redirect('/admin/databases');
        }

        // Determine the new domain name
        let newDomainName;
        if (domain_type === 'subdomain') {
            if (!subdomain_name) {
                req.flash('error_msg', 'Subdomain name is required');
                return res.redirect('/admin/databases');
            }
            newDomainName = subdomain_name + '.hospx.com';
        } else {
            if (!custom_domain_name) {
                req.flash('error_msg', 'Custom domain name is required');
                return res.redirect('/admin/databases');
            }
            newDomainName = custom_domain_name;
        }

        // Check if new domain already exists (but not for the same database)
        const existingDomain = await Database.checkDomainExists(newDomainName);
        if (existingDomain && existingDomain.database_id !== database_id) {
            req.flash('error_msg', 'Domain already exists for another database');
            return res.redirect('/admin/databases');
        }

        const currentDomainName = database.domain_name;
        let webuzoOperations = [];

        // If domain is changing
        if (currentDomainName !== newDomainName) {
            // Delete old domain from Webuzo if it exists
            if (currentDomainName) {
                try {
                    const deleteResult = await webuzoService.deleteDomain(currentDomainName);
                    if (deleteResult.success) {
                        webuzoOperations.push(`Deleted old domain: ${currentDomainName}`);
                    } else {
                        webuzoOperations.push(`Warning: Could not delete old domain ${currentDomainName}: ${deleteResult.message}`);
                    }
                } catch (error) {
                    console.error('Error deleting old domain:', error);
                    webuzoOperations.push(`Warning: Error deleting old domain ${currentDomainName}: ${error.message}`);
                }
            }

            // Add new domain to Webuzo (only for custom domains, subdomains are handled differently)
            if (domain_type === 'custom') {
                try {
                    const addResult = await webuzoService.addAddonDomain(newDomainName);
                    if (addResult.success) {
                        webuzoOperations.push(`Added new domain: ${newDomainName}`);
                    } else {
                        // Domain addition failed, but we'll continue with database update
                        webuzoOperations.push(`Warning: Could not add new domain ${newDomainName}: ${addResult.message}`);
                    }
                } catch (error) {
                    console.error('Error adding new domain:', error);
                    webuzoOperations.push(`Warning: Error adding new domain ${newDomainName}: ${error.message}`);
                }
            }

            // Update domain in database
            const Domain = require('../models/Domain');
            
            if (database.domain_id) {
                // Update existing domain record
                const domainRecord = await Domain.findById(database.domain_id);
                if (domainRecord) {
                    domainRecord.domain_name = newDomainName;
                    domainRecord.domain_type = domain_type;
                    const updateResult = await domainRecord.update();
                    
                    if (!updateResult.success) {
                        req.flash('error_msg', 'Failed to update domain record in database');
                        return res.redirect('/admin/databases');
                    }
                }
            } else {
                // Create new domain record
                const newDomain = new Domain({
                    domain_name: newDomainName,
                    user_id: database.user_id,
                    database_name: database.database_name,
                    expiry_date: database.expiry_date,
                    domain_type: domain_type,
                    status: 'active'
                });
                
                const saveResult = await newDomain.save();
                if (saveResult.success) {
                    // Update database record to link to the new domain
                    database.domain_id = newDomain.id;
                    await database.update();
                }
            }
        }

        let message = 'Domain updated successfully';
        if (webuzoOperations.length > 0) {
            message += '. Operations: ' + webuzoOperations.join('; ');
        }

        req.flash('success_msg', message);
        res.redirect('/admin/databases');

    } catch (error) {
        console.error('Edit domain error:', error);
        req.flash('error_msg', 'Error updating domain: ' + error.message);
        res.redirect('/admin/databases');
    }
});

// Payments Management
router.get('/payments', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const filters = {
            status: req.query.status,
            payment_method: req.query.payment_method,
            search: req.query.search
        };

        const payments = await Payment.findAll(filters);
        const stats = await Payment.getStats();
        
        // Calculate pagination
        const totalPayments = payments.length;
        const totalPages = Math.ceil(totalPayments / limit);
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedPayments = payments.slice(startIndex, endIndex);

        res.render('admin/payments', {
            title: 'Payment Management',
            payments: paginatedPayments,
            filters,
            stats: {
                total_payments: stats.total_payments,
                completed_payments: stats.completed_payments,
                pending_payments: stats.pending_payments,
                total_revenue: stats.total_revenue
            },
            pagination: {
                currentPage: page,
                totalPages: totalPages,
                totalPayments: totalPayments
            }
        });
    } catch (error) {
        console.error('Payments page error:', error);
        req.flash('error_msg', 'Error loading payments');
        res.render('admin/payments', {
            title: 'Payment Management',
            payments: [],
            filters: {},
            stats: {
                total_payments: 0,
                completed_payments: 0,
                pending_payments: 0,
                total_revenue: 0
            },
            pagination: {
                currentPage: 1,
                totalPages: 1,
                totalPayments: 0
            }
        });
    }
});

// Update payment status
router.post('/payments/:id/status', [
    body('status').isIn(['pending', 'completed', 'failed', 'cancelled'])
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.flash('error_msg', 'Invalid status selected');
            return res.redirect('/admin/payments');
        }

        const { status } = req.body;
        const result = await Payment.updateStatus(req.params.id, status);
        
        if (result.success) {
            req.flash('success_msg', 'Payment status updated successfully');
        } else {
            req.flash('error_msg', 'Failed to update payment status');
        }
    } catch (error) {
        console.error('Update payment status error:', error);
        req.flash('error_msg', 'Error updating payment status');
    }
    
    res.redirect('/admin/payments');
});

// Get payment details (API endpoint)
router.get('/payments/:id/details', async (req, res) => {
    try {
        const payment = await Payment.findByIdWithUser(req.params.id);
        if (!payment) {
            return res.status(404).json({ success: false, message: 'Payment not found' });
        }
        res.json(payment);
    } catch (error) {
        console.error('Get payment details error:', error);
        res.status(500).json({ success: false, message: 'Error loading payment details' });
    }
});

// Approve payment
router.post('/payments/:id/approve', async (req, res) => {
    try {
        const result = await Payment.approvePayment(req.params.id);
        
        if (result.success) {
            res.json({ success: true, message: 'Payment approved successfully' });
        } else {
            res.json({ success: false, message: 'Failed to approve payment' });
        }
    } catch (error) {
        console.error('Approve payment error:', error);
        res.status(500).json({ success: false, message: 'Error approving payment' });
    }
});

// Reject payment
router.post('/payments/:id/reject', async (req, res) => {
    try {
        const { reason } = req.body;
        const result = await Payment.rejectPayment(req.params.id, reason);
        
        if (result.success) {
            res.json({ success: true, message: 'Payment rejected successfully' });
        } else {
            res.json({ success: false, message: 'Failed to reject payment' });
        }
    } catch (error) {
        console.error('Reject payment error:', error);
        res.status(500).json({ success: false, message: 'Error rejecting payment' });
    }
});

// Approve all pending payments
router.post('/payments/approve-all', async (req, res) => {
    try {
        const result = await Payment.approveAllPending();
        
        if (result.success) {
            res.json({ success: true, count: result.count, message: 'Payments approved successfully' });
        } else {
            res.json({ success: false, message: 'Failed to approve payments' });
        }
    } catch (error) {
        console.error('Approve all payments error:', error);
        res.status(500).json({ success: false, message: 'Error approving payments' });
    }
});

// Download payment receipt
router.get('/payments/:id/receipt', async (req, res) => {
    try {
        const payment = await Payment.findByIdWithUser(req.params.id);
        if (!payment) {
            req.flash('error_msg', 'Payment not found');
            return res.redirect('/admin/payments');
        }

        // Generate HTML receipt
        const receiptBuffer = await Payment.generateReceipt(payment);
        
        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Content-Disposition', `inline; filename=receipt-${payment.transaction_id}.html`);
        res.send(receiptBuffer);
    } catch (error) {
        console.error('Download receipt error:', error);
        req.flash('error_msg', 'Error generating receipt');
        res.redirect('/admin/payments');
    }
});

// Export payments
router.get('/payments/export', async (req, res) => {
    try {
        const filters = {
            status: req.query.status,
            payment_method: req.query.payment_method,
            date_from: req.query.date_from,
            date_to: req.query.date_to,
            search: req.query.search
        };

        const csvData = await Payment.exportToCSV(filters);
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=payments-export.csv');
        res.send(csvData);
    } catch (error) {
        console.error('Export payments error:', error);
        req.flash('error_msg', 'Error exporting payments');
        res.redirect('/admin/payments');
    }
});

// API endpoint for email search in reports
router.get('/api/payments/search', async (req, res) => {
    try {
        const { email, page = 1 } = req.query;
        const limit = 10;
        const offset = (page - 1) * limit;

        if (!email || email.trim() === '') {
            return res.json({ success: false, message: 'Email parameter is required' });
        }

        // Search payments by user email with pagination
        const searchQuery = `
            SELECT p.*, 
                   u.full_name as user_name, 
                   u.email as user_email,
                   JSON_UNQUOTE(JSON_EXTRACT(p.reference_data, '$.database_name')) as database_name,
                   JSON_UNQUOTE(JSON_EXTRACT(p.reference_data, '$.domain_name')) as domain_name
            FROM payments p
            LEFT JOIN users u ON p.user_id = u.id
            WHERE p.status = 'completed' 
            AND u.email LIKE ?
            ORDER BY p.created_at DESC
            LIMIT ? OFFSET ?
        `;

        // Count total results
        const countQuery = `
            SELECT COUNT(*) as total
            FROM payments p
            LEFT JOIN users u ON p.user_id = u.id
            WHERE p.status = 'completed' 
            AND u.email LIKE ?
        `;

        const searchTerm = `%${email.trim()}%`;
        const [countResult] = await db.executeQuery(countQuery, [searchTerm]);
        const payments = await db.executeQuery(searchQuery, [searchTerm, limit, offset]);

        const totalPayments = countResult.total;
        const totalPages = Math.ceil(totalPayments / limit);

        res.json({
            success: true,
            payments: payments,
            pagination: {
                currentPage: parseInt(page),
                totalPages: totalPages,
                totalPayments: totalPayments,
                limit: limit,
                hasNext: page < totalPages,
                hasPrev: page > 1,
                nextPage: page < totalPages ? parseInt(page) + 1 : null,
                prevPage: page > 1 ? parseInt(page) - 1 : null
            }
        });
    } catch (error) {
        console.error('Payment search error:', error);
        res.json({ success: false, message: 'Search failed', error: error.message });
    }
});

// Reports
router.get('/reports', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const filters = {
            date_from: req.query.date_from && req.query.date_from !== 'undefined' ? req.query.date_from : null,
            date_to: req.query.date_to && req.query.date_to !== 'undefined' ? req.query.date_to : null,
            report_type: req.query.report_type && req.query.report_type !== 'undefined' ? req.query.report_type : 'overview'
        };

        const paymentStats = await Payment.getStats(filters);
        const commissionStats = await Commission.getStats(filters);
        const revenueReport = await Payment.getRevenueReport(filters);
        const commissionReport = await Commission.getCommissionReport(filters);
        
        // Get all completed payments first for pagination calculation
        const allCompletedPayments = await Payment.findAll({ 
            status: 'completed',
            ...filters
        });
        
        // Calculate pagination
        const totalPayments = allCompletedPayments.length;
        const totalPages = Math.ceil(totalPayments / limit);
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedPayments = allCompletedPayments.slice(startIndex, endIndex);
        
        res.render('admin/reports', {
            title: 'Reports & Analytics',
            filters,
            paymentStats,
            commissionStats,
            revenueReport,
            commissionReport,
            completedPayments: paginatedPayments,
            pagination: {
                currentPage: page,
                totalPages: totalPages,
                totalPayments: totalPayments,
                limit: limit,
                hasNext: page < totalPages,
                hasPrev: page > 1,
                nextPage: page + 1,
                prevPage: page - 1
            }
        });
    } catch (error) {
        console.error('Reports page error:', error);
        req.flash('error_msg', 'Error loading reports');
        res.render('admin/reports', {
            title: 'Reports & Analytics',
            filters: {},
            paymentStats: {},
            commissionStats: {},
            revenueReport: { monthly_data: [], top_users: [], average_order: 0 },
            commissionReport: [],
            completedPayments: [],
            pagination: {
                currentPage: 1,
                totalPages: 1,
                totalPayments: 0,
                limit: 10,
                hasNext: false,
                hasPrev: false,
                nextPage: 2,
                prevPage: 0
            }
        });
    }
});

// Commission Management
router.get('/commissions', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const filters = {
            status: req.query.status,
            user_id: req.query.user_id,
            date_from: req.query.date_from,
            date_to: req.query.date_to,
            search: req.query.search
        };

        const commissions = await Commission.findAll(filters);
        const stats = await Commission.getStats(filters);
        const users = await User.findAll({ role: 'executive' });
        
        // Calculate pagination
        const totalCommissions = commissions.length;
        const totalPages = Math.ceil(totalCommissions / limit);
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedCommissions = commissions.slice(startIndex, endIndex);
        
        res.render('admin/commissions', {
            title: 'Commission Management',
            commissions: paginatedCommissions,
            users,
            filters,
            stats: {
                total_commissions: stats.total || 0,
                total_amount: stats.total_amount || 0,
                pending_commissions: stats.pending || 0,
                paid_amount: stats.paid_amount || 0
            },
            pagination: {
                currentPage: page,
                totalPages: totalPages,
                totalCommissions: totalCommissions
            }
        });
    } catch (error) {
        console.error('Commissions page error:', error);
        req.flash('error_msg', 'Error loading commissions');
        res.render('admin/commissions', {
            title: 'Commission Management',
            commissions: [],
            users: [],
            filters: {},
            stats: {
                total_commissions: 0,
                total_amount: 0,
                pending_commissions: 0,
                paid_amount: 0
            },
            pagination: {
                currentPage: 1,
                totalPages: 1,
                totalCommissions: 0
            }
        });
    }
});

// Mark commissions as paid
router.post('/commissions/mark-paid', async (req, res) => {
    try {
        const { commission_ids } = req.body;
        
        if (!commission_ids || commission_ids.length === 0) {
            req.flash('error_msg', 'No commissions selected');
            return res.redirect('/admin/commissions');
        }

        const result = await Commission.markAsPaid(commission_ids);
        
        if (result.success) {
            req.flash('success_msg', 'Commissions marked as paid successfully');
        } else {
            req.flash('error_msg', 'Failed to update commissions');
        }
    } catch (error) {
        console.error('Mark paid error:', error);
        req.flash('error_msg', 'Error updating commissions');
    }
    
    res.redirect('/admin/commissions');
});

// Pay individual commission
router.post('/commissions/:id/pay', async (req, res) => {
    try {
        const result = await Commission.markAsPaid([req.params.id]);
        
        if (result.success) {
            req.flash('success_msg', 'Commission marked as paid successfully');
        } else {
            req.flash('error_msg', 'Failed to mark commission as paid');
        }
    } catch (error) {
        console.error('Pay commission error:', error);
        req.flash('error_msg', 'Error marking commission as paid');
    }
    
    res.redirect('/admin/commissions');
});

// Cancel individual commission
router.post('/commissions/:id/cancel', async (req, res) => {
    try {
        const query = 'UPDATE commissions SET status = ? WHERE id = ?';
        await db.executeQuery(query, ['cancelled', req.params.id]);
        
        req.flash('success_msg', 'Commission cancelled successfully');
    } catch (error) {
        console.error('Cancel commission error:', error);
        req.flash('error_msg', 'Error cancelling commission');
    }
    
    res.redirect('/admin/commissions');
});

// View commission details
router.get('/commissions/:id', async (req, res) => {
    try {
        const commission = await Commission.findById(req.params.id);
        if (!commission) {
            req.flash('error_msg', 'Commission not found');
            return res.redirect('/admin/commissions');
        }

        // Get additional details for the commission
        const query = `
            SELECT c.*, 
                   u.full_name as user_name, u.email as user_email,
                   ru.full_name as referred_user_name, ru.email as referred_user_email,
                   p.amount as payment_amount, p.payment_method, p.created_at as payment_date,
                   p.transaction_id, p.status as payment_status
            FROM commissions c
            JOIN users u ON c.user_id = u.id
            JOIN users ru ON c.referred_user_id = ru.id
            JOIN payments p ON c.payment_id = p.id
            WHERE c.id = ?
        `;
        
        const [commissionDetails] = await db.executeQuery(query, [req.params.id]);
        
        if (!commissionDetails) {
            req.flash('error_msg', 'Commission details not found');
            return res.redirect('/admin/commissions');
        }

        // For now, return JSON data (can create a proper view later)
        res.json({
            commission: commissionDetails,
            success: true
        });
    } catch (error) {
        console.error('Commission details error:', error);
        req.flash('error_msg', 'Error loading commission details');
        res.redirect('/admin/commissions');
    }
});

// Pay all pending commissions
router.post('/commissions/pay-all', async (req, res) => {
    try {
        const pendingQuery = 'SELECT id FROM commissions WHERE status = ?';
        const pendingCommissions = await db.executeQuery(pendingQuery, ['pending']);
        
        if (pendingCommissions.length === 0) {
            req.flash('error_msg', 'No pending commissions found');
            return res.redirect('/admin/commissions');
        }

        const commissionIds = pendingCommissions.map(c => c.id);
        const result = await Commission.markAsPaid(commissionIds);
        
        if (result.success) {
            req.flash('success_msg', `${commissionIds.length} commissions marked as paid successfully`);
        } else {
            req.flash('error_msg', 'Failed to pay commissions');
        }
    } catch (error) {
        console.error('Pay all commissions error:', error);
        req.flash('error_msg', 'Error paying all commissions');
    }
    
    res.redirect('/admin/commissions');
});

// Export commissions
router.get('/commissions/export', async (req, res) => {
    try {
        const filters = {
            status: req.query.status,
            user_id: req.query.user_id,
            date_from: req.query.date_from,
            date_to: req.query.date_to,
            search: req.query.search
        };

        const commissions = await Commission.findAll(filters);
        
        // Generate CSV content
        let csvContent = 'Commission ID,User Name,User Email,Referred User,Commission Amount,Type,Status,Created Date\n';
        
        commissions.forEach(commission => {
            csvContent += `"${commission.id}","${commission.user_name || ''}","${commission.user_email || ''}","${commission.referred_user_name || ''}","${commission.commission_amount}","${commission.commission_type}","${commission.status}","${new Date(commission.created_at).toLocaleDateString()}"\n`;
        });
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=commissions-export.csv');
        res.send(csvContent);
    } catch (error) {
        console.error('Export commissions error:', error);
        req.flash('error_msg', 'Error exporting commissions');
        res.redirect('/admin/commissions');
    }
});

// Reference Code Management Routes
router.get('/reference-codes', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const filters = {
            is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : undefined,
            search: req.query.search
        };

        const referenceCodes = await ReferenceCode.findAll(filters);
        const stats = await ReferenceCode.getStats();
        
        // Calculate pagination
        const totalCodes = referenceCodes.length;
        const totalPages = Math.ceil(totalCodes / limit);
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedCodes = referenceCodes.slice(startIndex, endIndex);

        res.render('admin/reference-codes', {
            title: 'Reference Code Management',
            referenceCodes: paginatedCodes,
            filters,
            stats: {
                total: stats.total,
                active: stats.active,
                used: stats.used
            },
            pagination: {
                currentPage: page,
                totalPages: totalPages,
                totalCodes: totalCodes
            }
        });
    } catch (error) {
        console.error('Reference codes page error:', error);
        req.flash('error_msg', 'Error loading reference codes');
        res.render('admin/reference-codes', {
            title: 'Reference Code Management',
            referenceCodes: [],
            filters: {},
            stats: {
                total: 0,
                active: 0,
                used: 0
            },
            pagination: {
                currentPage: 1,
                totalPages: 1,
                totalCodes: 0
            }
        });
    }
});

// View reference code details
router.get('/reference-codes/:code/users', async (req, res) => {
    try {
        const code = req.params.code;
        const referenceCode = await ReferenceCode.findByCode(code);
        
        if (!referenceCode) {
            req.flash('error_msg', 'Reference code not found');
            return res.redirect('/admin/reference-codes');
        }

        const users = await ReferenceCode.getUsers(code);

        res.render('admin/reference-code-users', {
            title: `Reference Code: ${code}`,
            referenceCode,
            users
        });
    } catch (error) {
        console.error('Reference code users error:', error);
        req.flash('error_msg', 'Error loading reference code users');
        res.redirect('/admin/reference-codes');
    }
});

// Deactivate reference code
router.post('/reference-codes/:id/deactivate', async (req, res) => {
    try {
        const result = await ReferenceCode.deactivate(req.params.id);
        
        if (result.success) {
            req.flash('success_msg', 'Reference code deactivated successfully');
        } else {
            req.flash('error_msg', 'Failed to deactivate reference code');
        }
    } catch (error) {
        console.error('Deactivate reference code error:', error);
        req.flash('error_msg', 'Error deactivating reference code');
    }
    
    res.redirect('/admin/reference-codes');
});

// DB Management Routes
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for SQL file uploads
const sqlStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        // Always save as dbcreate.sql regardless of original filename
        cb(null, 'dbcreate.sql');
    }
});

const sqlUpload = multer({
    storage: sqlStorage,
    fileFilter: function (req, file, cb) {
        // Only allow SQL files
        if (file.mimetype === 'application/sql' || file.originalname.toLowerCase().endsWith('.sql')) {
            cb(null, true);
        } else {
            cb(new Error('Only SQL files are allowed!'), false);
        }
    },
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    }
});

// DB Management main page
router.get('/db-management', async (req, res) => {
    try {
        const sqlFilePath = path.join(uploadsDir, 'dbcreate.sql');
        let sqlFileExists = false;
        let fileStats = null;
        let fileContent = '';

        // Check if SQL file exists
        if (fs.existsSync(sqlFilePath)) {
            sqlFileExists = true;
            fileStats = fs.statSync(sqlFilePath);
            
            // Read file content for preview (limit to first 5000 characters)
            try {
                const fullContent = fs.readFileSync(sqlFilePath, 'utf8');
                fileContent = fullContent.length > 5000 ? 
                    fullContent.substring(0, 5000) + '\n\n... (Content truncated. File is larger than preview limit)' : 
                    fullContent;
            } catch (readError) {
                console.error('Error reading SQL file:', readError);
                fileContent = 'Error reading file content';
            }
        }

        // Fetch all databases from the database table
        const databases = await Database.findAll({ status: 'active' });

        res.render('admin/db-management', {
            title: 'Database Management',
            sqlFileExists,
            fileLastModified: sqlFileExists ? fileStats.mtime.toLocaleString() : null,
            fileSize: sqlFileExists ? (fileStats.size / 1024).toFixed(2) + ' KB' : null,
            fileContent,
            databases
        });
    } catch (error) {
        console.error('DB Management page error:', error);
        req.flash('error_msg', 'Error loading DB management page');
        res.render('admin/db-management', {
            title: 'Database Management',
            sqlFileExists: false,
            fileLastModified: null,
            fileSize: null,
            fileContent: '',
            databases: []
        });
    }
});

// Upload SQL file
router.post('/db-management/upload', sqlUpload.single('sqlFile'), async (req, res) => {
    try {
        if (!req.file) {
            req.flash('error_msg', 'No file uploaded or invalid file type');
            return res.redirect('/admin/db-management');
        }

        req.flash('success_msg', 'SQL file uploaded successfully as dbcreate.sql');
    } catch (error) {
        console.error('SQL file upload error:', error);
        if (error.message === 'Only SQL files are allowed!') {
            req.flash('error_msg', 'Only SQL files are allowed');
        } else if (error.code === 'LIMIT_FILE_SIZE') {
            req.flash('error_msg', 'File is too large. Maximum size is 50MB');
        } else {
            req.flash('error_msg', 'Error uploading file');
        }
    }
    
    res.redirect('/admin/db-management');
});

// Download SQL file
router.get('/db-management/download', (req, res) => {
    try {
        const sqlFilePath = path.join(uploadsDir, 'dbcreate.sql');
        
        if (!fs.existsSync(sqlFilePath)) {
            req.flash('error_msg', 'SQL file not found');
            return res.redirect('/admin/db-management');
        }

        res.download(sqlFilePath, 'dbcreate.sql', (err) => {
            if (err) {
                console.error('Download error:', err);
                req.flash('error_msg', 'Error downloading file');
                res.redirect('/admin/db-management');
            }
        });
    } catch (error) {
        console.error('Download SQL file error:', error);
        req.flash('error_msg', 'Error downloading file');
        res.redirect('/admin/db-management');
    }
});

// Delete SQL file
router.post('/db-management/delete', (req, res) => {
    try {
        const sqlFilePath = path.join(uploadsDir, 'dbcreate.sql');
        
        if (!fs.existsSync(sqlFilePath)) {
            req.flash('error_msg', 'SQL file not found');
            return res.redirect('/admin/db-management');
        }

        fs.unlinkSync(sqlFilePath);
        req.flash('success_msg', 'SQL file deleted successfully');
    } catch (error) {
        console.error('Delete SQL file error:', error);
        req.flash('error_msg', 'Error deleting file');
    }
    
    res.redirect('/admin/db-management');
});

// Execute SQL query
router.post('/db-management/execute-sql', async (req, res) => {
    const { database, sqlQuery } = req.body;
    const results = {};
    const errors = {};

    try {
        // Handle both single and multiple database selections
        const databases = Array.isArray(database) ? database : [database];
        
        // Execute query for each database
        for (const db of databases) {
            let connection;
            try {
                // Create a new connection to the current database
                connection = await mysql.createConnection({
                    host: process.env.DB_HOST || 'localhost',
                    user: process.env.DB_USER || 'root',
                    password: process.env.DB_PASSWORD || '',
                    database: db,
                    multipleStatements: true
                });

                // Execute the SQL query
                const queryResults = await new Promise((resolve, reject) => {
                    connection.query(sqlQuery, (error, results) => {
                        if (error) reject(error);
                        else resolve(results);
                    });
                });

                // Format the results for this database
                let formattedResults;
                if (Array.isArray(queryResults)) {
                    if (queryResults.length === 0) {
                        formattedResults = 'Query executed successfully. No results returned.';
                    } else {
                        // Get column names from the first row
                        const columns = Object.keys(queryResults[0]);
                        
                        // Create a table-like format
                        formattedResults = columns.join('\t') + '\n';
                        formattedResults += '-'.repeat(columns.join('\t').length) + '\n';
                        
                        // Add each row
                        queryResults.forEach(row => {
                            formattedResults += columns.map(col => row[col]).join('\t') + '\n';
                        });
                    }
                } else {
                    formattedResults = 'Query executed successfully. Affected rows: ' + (queryResults.affectedRows || 0);
                }

                results[db] = formattedResults;
            } catch (error) {
                errors[db] = error.message;
            } finally {
                if (connection) {
                    try {
                        await connection.end();
                    } catch (err) {
                        console.error(`Error closing connection for ${db}:`, err);
                    }
                }
            }
        }

        // Prepare the final results message
        let finalResults = '';
        for (const db of databases) {
            finalResults += `\n=== Results for Database: ${db} ===\n`;
            if (errors[db]) {
                finalResults += `Error: ${errors[db]}\n`;
            } else {
                finalResults += results[db] + '\n';
            }
        }

        if (Object.keys(errors).length === 0) {
            req.flash('success_msg', 'SQL query executed successfully on all databases');
        } else {
            req.flash('warning_msg', 'SQL query executed with some errors. Check results for details.');
        }
        req.flash('sql_results', finalResults);
    } catch (error) {
        console.error('SQL execution error:', error);
        req.flash('error_msg', `Error executing SQL: ${error.message}`);
    }
    
    res.redirect('/admin/db-management');
});

module.exports = router; 