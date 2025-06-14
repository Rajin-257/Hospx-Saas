const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const db = require('../config/database');

class Payment {
    constructor(data = {}) {
        this.id = data.id || uuidv4();
        this.user_id = data.user_id;
        this.amount = data.amount;
        this.currency = data.currency || 'BDT';
        this.payment_method = data.payment_method;
        this.transaction_id = data.transaction_id;
        this.status = data.status || 'pending';
        this.payment_type = data.payment_type;
        this.reference_data = data.reference_data;
        this.created_at = data.created_at;
        this.updated_at = data.updated_at;
    }

    async save() {
        try {
            const query = `
                INSERT INTO payments (id, user_id, amount, currency, payment_method, transaction_id, status, payment_type, reference_data)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            const referenceDataJson = this.reference_data ? JSON.stringify(this.reference_data) : null;
            
            await db.executeQuery(query, [
                this.id,
                this.user_id,
                this.amount,
                this.currency,
                this.payment_method,
                this.transaction_id,
                this.status,
                this.payment_type,
                referenceDataJson
            ]);

            return { success: true, paymentId: this.id };
        } catch (error) {
            console.error('Payment save error:', error);
            return { success: false, error: error.message };
        }
    }

    async update() {
        try {
            const query = `
                UPDATE payments 
                SET user_id = ?, amount = ?, currency = ?, payment_method = ?, transaction_id = ?, 
                    status = ?, payment_type = ?, reference_data = ?
                WHERE id = ?
            `;
            
            const referenceDataJson = this.reference_data ? JSON.stringify(this.reference_data) : null;
            
            await db.executeQuery(query, [
                this.user_id,
                this.amount,
                this.currency,
                this.payment_method,
                this.transaction_id,
                this.status,
                this.payment_type,
                referenceDataJson,
                this.id
            ]);

            return { success: true };
        } catch (error) {
            console.error('Payment update error:', error);
            return { success: false, error: error.message };
        }
    }

    static async findById(id) {
        try {
            const query = `
                SELECT p.*, 
                       d.database_name,
                       dom.domain_name
                FROM payments p
                LEFT JOIN \`databases\` d ON JSON_UNQUOTE(JSON_EXTRACT(p.reference_data, '$.database_id')) = d.id
                LEFT JOIN domains dom ON d.domain_id = dom.id
                WHERE p.id = ?
            `;
            const results = await db.executeQuery(query, [id]);
            
            if (results.length > 0) {
                const payment = new Payment(results[0]);
                if (payment.reference_data && typeof payment.reference_data === 'string') {
                    payment.reference_data = JSON.parse(payment.reference_data);
                }
                // Add domain and database information
                payment.domain_name = results[0].domain_name;
                payment.database_name = results[0].database_name;
                return payment;
            }
            return null;
        } catch (error) {
            console.error('Payment findById error:', error);
            return null;
        }
    }

    static async findByUserId(userId, filters = {}) {
        try {
            let query = `
                SELECT p.*, u.full_name as user_name, u.email as user_email
                FROM payments p
                JOIN users u ON p.user_id = u.id
                WHERE p.user_id = ?
            `;
            let params = [userId];

            if (filters.status) {
                query += ' AND p.status = ?';
                params.push(filters.status);
            }

            if (filters.payment_type) {
                query += ' AND p.payment_type = ?';
                params.push(filters.payment_type);
            }

            query += ' ORDER BY p.created_at DESC';

            if (filters.limit) {
                query += ' LIMIT ?';
                params.push(parseInt(filters.limit));
            }

            const results = await db.executeQuery(query, params);
            return results.map(row => {
                const payment = new Payment(row);
                if (payment.reference_data && typeof payment.reference_data === 'string') {
                    payment.reference_data = JSON.parse(payment.reference_data);
                }
                payment.user_name = row.user_name;
                payment.user_email = row.user_email;
                return payment;
            });
        } catch (error) {
            console.error('Payment findByUserId error:', error);
            return [];
        }
    }

    static async findAll(filters = {}) {
        try {
            let query = `
                SELECT p.*, 
                       u.full_name as user_name, 
                       u.email as user_email,
                       d.database_name,
                       dom.domain_name,
                       CASE 
                           WHEN JSON_EXTRACT(p.reference_data, '$.database_name') IS NOT NULL 
                           THEN JSON_UNQUOTE(JSON_EXTRACT(p.reference_data, '$.database_name'))
                           ELSE d.database_name 
                       END as payment_database_name
                FROM payments p
                JOIN users u ON p.user_id = u.id
                LEFT JOIN \`databases\` d ON JSON_UNQUOTE(JSON_EXTRACT(p.reference_data, '$.database_id')) = d.id
                LEFT JOIN domains dom ON d.domain_id = dom.id
            `;
            let params = [];
            let conditions = [];

            if (filters.status) {
                conditions.push('p.status = ?');
                params.push(filters.status);
            }

            if (filters.payment_method) {
                conditions.push('p.payment_method = ?');
                params.push(filters.payment_method);
            }

            if (filters.payment_type) {
                conditions.push('p.payment_type = ?');
                params.push(filters.payment_type);
            }

            if (filters.user_id) {
                conditions.push('p.user_id = ?');
                params.push(filters.user_id);
            }

            if (filters.date_from) {
                conditions.push('DATE(p.created_at) >= ?');
                params.push(filters.date_from);
            }

            if (filters.date_to) {
                conditions.push('DATE(p.created_at) <= ?');
                params.push(filters.date_to);
            }

            // Add search functionality
            if (filters.search) {
                conditions.push('(p.transaction_id LIKE ? OR p.external_transaction_id LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)');
                const searchTerm = `%${filters.search}%`;
                params.push(searchTerm, searchTerm, searchTerm, searchTerm);
            }

            if (conditions.length > 0) {
                query += ' WHERE ' + conditions.join(' AND ');
            }

            query += ' ORDER BY p.created_at DESC';

            if (filters.limit) {
                query += ' LIMIT ?';
                params.push(parseInt(filters.limit));
            }

            const results = await db.executeQuery(query, params);
            return results.map(row => {
                const payment = new Payment(row);
                if (payment.reference_data && typeof payment.reference_data === 'string') {
                    try {
                        payment.reference_data = JSON.parse(payment.reference_data);
                    } catch (e) {
                        payment.reference_data = {};
                    }
                }
                payment.user_name = row.user_name;
                payment.user_email = row.user_email;
                payment.database_name = row.payment_database_name || row.database_name || 'N/A';
                payment.domain_name = row.domain_name || 'N/A';
                return payment;
            });
        } catch (error) {
            console.error('Payment findAll error:', error);
            return [];
        }
    }

    static async getRecentPayments(limit = 10) {
        try {
            return await this.findAll({ 
                status: 'completed',
                limit: limit 
            });
        } catch (error) {
            console.error('Payment getRecentPayments error:', error);
            return [];
        }
    }

    static async updateStatus(paymentId, status, transactionId = null) {
        try {
            let query = 'UPDATE payments SET status = ?';
            let params = [status];

            if (transactionId) {
                query += ', transaction_id = ?';
                params.push(transactionId);
            }

            query += ' WHERE id = ?';
            params.push(paymentId);

            await db.executeQuery(query, params);

            // If payment is completed, process commission
            if (status === 'completed') {
                await this.processCommission(paymentId);
            }

            return { success: true };
        } catch (error) {
            console.error('Payment updateStatus error:', error);
            return { success: false, error: error.message };
        }
    }

    static async processCommission(paymentId) {
        try {
            if (!paymentId) {
                console.error('Payment ID is required for commission processing');
                return { success: false, error: 'Payment ID is required' };
            }

            const payment = await this.findById(paymentId);
            if (!payment) {
                console.error('Payment not found for commission processing:', paymentId);
                return { success: false, error: 'Payment not found' };
            }

            // Only process commissions for completed payments
            if (payment.status !== 'completed') {
                console.log('Payment not completed, skipping commission processing:', paymentId);
                return { success: true, message: 'Payment not completed' };
            }

            // NEW LOGIC: Find database owner from payment reference_data
            let databaseOwnerId = null;
            let databaseInfo = null;

            // First, try to get database owner from reference_data
            if (payment.reference_data && payment.reference_data.database_id) {
                const Database = require('./Database');
                const database = await Database.findById(payment.reference_data.database_id);
                
                if (database) {
                    databaseOwnerId = database.user_id;
                    databaseInfo = {
                        database_id: database.id,
                        database_name: database.database_name,
                        owner_id: database.user_id
                    };
                    console.log('Found database owner from database lookup:', {
                        databaseId: database.id,
                        databaseName: database.database_name,
                        ownerId: database.user_id
                    });
                } else {
                    console.log('Database not found with ID:', payment.reference_data.database_id);
                }
            }

            // Fallback: Check if database_owner_id is directly in reference_data
            if (!databaseOwnerId && payment.reference_data && payment.reference_data.database_owner_id) {
                databaseOwnerId = payment.reference_data.database_owner_id;
                console.log('Using database owner from reference_data:', databaseOwnerId);
            }

            // Final fallback: Use payment user_id (original logic)
            if (!databaseOwnerId) {
                databaseOwnerId = payment.user_id;
                console.log('Fallback to payment user as database owner:', databaseOwnerId);
            }

            // Get database owner details to check if they were referred
            const ownerQuery = 'SELECT id, referred_by, full_name, email FROM users WHERE id = ?';
            const ownerResults = await db.executeQuery(ownerQuery, [databaseOwnerId]);
            
            if (ownerResults.length === 0) {
                console.error('Database owner not found:', databaseOwnerId);
                return { success: false, error: 'Database owner not found' };
            }

            const databaseOwner = ownerResults[0];
            console.log('Processing commission for database owner:', {
                ownerId: databaseOwner.id,
                ownerName: databaseOwner.full_name,
                referredBy: databaseOwner.referred_by,
                paymentId: paymentId,
                amount: payment.amount,
                paymentMadeBy: payment.user_id
            });

            if (databaseOwner.referred_by) {
                // Verify the referrer exists
                const referrerQuery = 'SELECT id, full_name, email FROM users WHERE id = ?';
                const referrerResults = await db.executeQuery(referrerQuery, [databaseOwner.referred_by]);
                
                if (referrerResults.length === 0) {
                    console.error('Referrer not found:', databaseOwner.referred_by);
                    return { success: false, error: 'Referrer not found' };
                }

                const referrer = referrerResults[0];
                console.log('Creating commission for referrer:', {
                    referrerId: referrer.id,
                    referrerName: referrer.full_name,
                    databaseOwnerId: databaseOwner.id,
                    databaseOwnerName: databaseOwner.full_name,
                    paymentAmount: payment.amount
                });

                const Commission = require('./Commission');
                const commissionResult = await Commission.createCommission(
                    databaseOwner.referred_by,  // Commission goes to database owner's referrer
                    databaseOwner.id,           // Commission is for referring this database owner
                    paymentId, 
                    payment.amount
                );

                if (commissionResult.success) {
                    console.log('Commission created successfully:', commissionResult.message);
                    return { 
                        success: true, 
                        commission: commissionResult.commission,
                        message: commissionResult.message,
                        details: {
                            referrer: referrer.full_name,
                            databaseOwner: databaseOwner.full_name,
                            databaseInfo: databaseInfo
                        }
                    };
                } else {
                    console.error('Failed to create commission:', commissionResult.error);
                    return { success: false, error: commissionResult.error };
                }
            } else {
                console.log('Database owner was not referred by anyone, no commission to process');
                return { 
                    success: true, 
                    message: 'Database owner was not referred',
                    details: {
                        databaseOwner: databaseOwner.full_name,
                        databaseInfo: databaseInfo
                    }
                };
            }
        } catch (error) {
            console.error('Payment processCommission error:', error);
            return { success: false, error: error.message };
        }
    }

    static async deleteById(id) {
        try {
            const query = 'DELETE FROM payments WHERE id = ?';
            await db.executeQuery(query, [id]);
            return { success: true };
        } catch (error) {
            console.error('Payment delete error:', error);
            return { success: false, error: error.message };
        }
    }

    static async getStats(filters = {}) {
        try {
            let baseQuery = 'SELECT';
            let conditions = [];
            let params = [];

            if (filters.date_from) {
                conditions.push('DATE(created_at) >= ?');
                params.push(filters.date_from);
            }

            if (filters.date_to) {
                conditions.push('DATE(created_at) <= ?');
                params.push(filters.date_to);
            }

            if (filters.user_id) {
                conditions.push('user_id = ?');
                params.push(filters.user_id);
            }

            const whereClause = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';

            // Total payments
            const totalQuery = `${baseQuery} COUNT(*) as count FROM payments${whereClause}`;
            const [totalResult] = await db.executeQuery(totalQuery, params);

            // Completed payments
            const completedQuery = `${baseQuery} COUNT(*) as count FROM payments${whereClause}${conditions.length > 0 ? ' AND' : ' WHERE'} status = 'completed'`;
            const [completedResult] = await db.executeQuery(completedQuery, [...params, 'completed']);

            // Total revenue
            const revenueQuery = `${baseQuery} COALESCE(SUM(amount), 0) as total FROM payments${whereClause}${conditions.length > 0 ? ' AND' : ' WHERE'} status = 'completed'`;
            const [revenueResult] = await db.executeQuery(revenueQuery, [...params, 'completed']);

            // Pending payments
            const pendingQuery = `${baseQuery} COUNT(*) as count FROM payments${whereClause}${conditions.length > 0 ? ' AND' : ' WHERE'} status = 'pending'`;
            const [pendingResult] = await db.executeQuery(pendingQuery, [...params, 'pending']);

            // Monthly revenue (current month)
            const monthlyQuery = `
                SELECT COALESCE(SUM(amount), 0) as total 
                FROM payments 
                WHERE status = 'completed' 
                AND YEAR(created_at) = YEAR(CURDATE()) 
                AND MONTH(created_at) = MONTH(CURDATE())
                ${filters.user_id ? 'AND user_id = ?' : ''}
            `;
            const monthlyParams = filters.user_id ? [filters.user_id] : [];
            const [monthlyResult] = await db.executeQuery(monthlyQuery, monthlyParams);

            // Payment methods breakdown (only if user_id is provided)
            let paymentMethods = [];
            if (filters.user_id) {
                const methodsQuery = `
                    SELECT payment_method as method, COUNT(*) as count
                    FROM payments 
                    WHERE status = 'completed' AND user_id = ?
                    GROUP BY payment_method
                    ORDER BY count DESC
                `;
                paymentMethods = await db.executeQuery(methodsQuery, [filters.user_id]);
            }

            return {
                total_payments: totalResult.count,
                completed_payments: completedResult.count,
                total_revenue: parseFloat(revenueResult.total) || 0,
                pending_payments: pendingResult.count,
                monthly_revenue: parseFloat(monthlyResult.total) || 0,
                payment_methods: paymentMethods
            };
        } catch (error) {
            console.error('Payment getStats error:', error);
            return {
                total_payments: 0,
                completed_payments: 0,
                total_revenue: 0,
                pending_payments: 0,
                monthly_revenue: 0,
                payment_methods: []
            };
        }
    }

    static async getRevenueReport(filters = {}) {
        try {
            // Monthly revenue data for charts
            let monthlyQuery = `
                SELECT 
                    DATE_FORMAT(created_at, '%Y-%m') as month,
                    DATE_FORMAT(created_at, '%M %Y') as month_name,
                    COUNT(*) as payment_count,
                    SUM(amount) as revenue,
                    AVG(amount) as average_order
                FROM payments 
                WHERE status = 'completed'
            `;
            let params = [];

            if (filters.date_from) {
                monthlyQuery += ' AND DATE(created_at) >= ?';
                params.push(filters.date_from);
            }

            if (filters.date_to) {
                monthlyQuery += ' AND DATE(created_at) <= ?';
                params.push(filters.date_to);
            }

            monthlyQuery += ' GROUP BY DATE_FORMAT(created_at, "%Y-%m") ORDER BY month DESC LIMIT 12';

            const monthlyResults = await db.executeQuery(monthlyQuery, params);

            // Top users by revenue
            let topUsersQuery = `
                SELECT 
                    u.full_name,
                    u.email,
                    COUNT(p.id) as order_count,
                    SUM(p.amount) as total_revenue
                FROM payments p
                JOIN users u ON p.user_id = u.id
                WHERE p.status = 'completed'
            `;
            let topUsersParams = [];

            if (filters.date_from) {
                topUsersQuery += ' AND DATE(p.created_at) >= ?';
                topUsersParams.push(filters.date_from);
            }

            if (filters.date_to) {
                topUsersQuery += ' AND DATE(p.created_at) <= ?';
                topUsersParams.push(filters.date_to);
            }

            topUsersQuery += ' GROUP BY u.id ORDER BY total_revenue DESC LIMIT 5';

            const topUsersResults = await db.executeQuery(topUsersQuery, topUsersParams);

            return {
                monthly_data: monthlyResults.map(row => ({
                    month: row.month_name,
                    revenue: parseFloat(row.revenue) || 0,
                    payment_count: row.payment_count,
                    average_order: parseFloat(row.average_order) || 0
                })),
                top_users: topUsersResults,
                average_order: monthlyResults.length > 0 ? 
                    monthlyResults.reduce((sum, row) => sum + (parseFloat(row.average_order) || 0), 0) / monthlyResults.length : 0
            };
        } catch (error) {
            console.error('Payment getRevenueReport error:', error);
            return { monthly_data: [], top_users: [], average_order: 0 };
        }
    }

    // Add missing findByIdWithUser method
    static async findByIdWithUser(id) {
        try {
            const query = `
                SELECT p.*, 
                       u.full_name as user_name, 
                       u.email as user_email, 
                       u.phone as user_phone,
                       d.database_name
                FROM payments p
                LEFT JOIN users u ON p.user_id = u.id
                LEFT JOIN \`databases\` d ON p.reference_data LIKE CONCAT('%', d.id, '%')
                WHERE p.id = ?
            `;
            const results = await db.executeQuery(query, [id]);
            
            if (results.length > 0) {
                const payment = new Payment(results[0]);
                if (payment.reference_data && typeof payment.reference_data === 'string') {
                    try {
                        payment.reference_data = JSON.parse(payment.reference_data);
                    } catch (e) {
                        payment.reference_data = {};
                    }
                }
                payment.user_name = results[0].user_name;
                payment.user_email = results[0].user_email;
                payment.user_phone = results[0].user_phone;
                payment.database_name = results[0].database_name;
                payment.metadata = payment.reference_data || {};
                return payment;
            }
            return null;
        } catch (error) {
            console.error('Payment findByIdWithUser error:', error);
            return null;
        }
    }

    // Add missing approvePayment method
    static async approvePayment(paymentId) {
        try {
            // First, get the payment details to check if it's for database renewal
            const payment = await this.findById(paymentId);
            if (!payment) {
                return { success: false, error: 'Payment not found' };
            }

            // Update payment status to completed
            const result = await this.updateStatus(paymentId, 'completed');
            if (!result.success) {
                return result;
            }

            // Check if this is a database renewal/extend payment
            // Check for database renewal based on reference_data having database_id
            // This covers cases where payment_type might be empty but we still have database info
            if (payment.reference_data && payment.reference_data.database_id) {
                const Database = require('./Database');
                const period = payment.reference_data.period || 1;
                const periodType = payment.reference_data.period_type || 'months';
                
                const renewResult = await Database.renewDatabase(
                    payment.reference_data.database_id, 
                    period, 
                    periodType
                );
                
                if (!renewResult.success) {
                    console.error('Failed to renew database:', renewResult.error);
                    // Note: We don't fail the payment approval if database renewal fails
                    // The payment is still approved, but admin should be notified
                }
            }

            // Process commission using the new database owner-based logic
            // This will automatically handle both regular and referral payments correctly
            const commissionResult = await this.processCommission(paymentId);
            
            return { success: true, message: 'Payment approved and database renewed successfully' };
        } catch (error) {
            console.error('Payment approvePayment error:', error);
            return { success: false, error: error.message };
        }
    }

    // Add missing rejectPayment method
    static async rejectPayment(paymentId, reason = null) {
        try {
            let query = 'UPDATE payments SET status = ?';
            let params = ['failed'];

            if (reason) {
                query += ', notes = ?';
                params.push(reason);
            }

            query += ' WHERE id = ?';
            params.push(paymentId);

            await db.executeQuery(query, params);
            return { success: true };
        } catch (error) {
            console.error('Payment rejectPayment error:', error);
            return { success: false, error: error.message };
        }
    }

    // Add missing approveAllPending method
    static async approveAllPending() {
        try {
            // Get all pending payments first
            const pendingPayments = await this.findAll({ status: 'pending' });
            let successCount = 0;
            
            // Approve each payment individually to ensure database renewal
            for (const payment of pendingPayments) {
                const result = await this.approvePayment(payment.id);
                if (result.success) {
                    successCount++;
                }
            }
            
            return { success: true, count: successCount };
        } catch (error) {
            console.error('Payment approveAllPending error:', error);
            return { success: false, error: error.message };
        }
    }

    // Generate receipt/invoice
    static async generateReceipt(payment) {
        try {
            if (!payment) {
                throw new Error('Payment data is required');
            }

            // Get additional payment details if not already loaded
            let paymentData = payment;
            if (!payment.user_name) {
                paymentData = await this.findByIdWithUser(payment.id);
            }

            // Extract database info from reference_data if available
            const databaseName = paymentData.reference_data?.database_name || 
                                (paymentData.database_name || 'N/A');
            const period = paymentData.reference_data?.period || 1;
            const periodType = paymentData.reference_data?.period_type || 'month';

            const invoiceHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Receipt - ${paymentData.transaction_id}</title>
    <style>
        @page {
            size: A4;
            margin: 0.5in;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 0;
            color: #2d3748;
            line-height: 1.4;
            font-size: 11px;
            background: #ffffff;
        }
        
        .receipt {
            max-width: 400px;
            margin: 0 auto;
            border: 2px solid #e2e8f0;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            background: #ffffff;
        }
        
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            text-align: center;
            position: relative;
        }
        
        .header::after {
            content: '';
            position: absolute;
            bottom: -10px;
            left: 50%;
            transform: translateX(-50%);
            width: 0;
            height: 0;
            border-left: 15px solid transparent;
            border-right: 15px solid transparent;
            border-top: 10px solid #764ba2;
        }
        
        .company-name {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 4px;
            letter-spacing: 1px;
        }
        
        .company-tagline {
            font-size: 10px;
            opacity: 0.9;
            font-style: italic;
        }
        
        .content {
            padding: 25px 20px 20px;
        }
        
        .receipt-title {
            text-align: center;
            font-size: 16px;
            font-weight: bold;
            color: #4a5568;
            margin-bottom: 20px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin-bottom: 20px;
        }
        
        .info-item {
            border-left: 3px solid #667eea;
            padding-left: 10px;
        }
        
        .info-label {
            font-size: 9px;
            color: #718096;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 3px;
        }
        
        .info-value {
            font-weight: 600;
            color: #2d3748;
            word-break: break-all;
        }
        
        .amount-section {
            background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%);
            border-radius: 8px;
            padding: 15px;
            margin: 20px 0;
            text-align: center;
            border: 1px solid #e2e8f0;
        }
        
        .amount-label {
            font-size: 10px;
            color: #718096;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .amount-value {
            font-size: 20px;
            font-weight: bold;
            color: #667eea;
            margin-top: 5px;
        }
        
        .status-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 9px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .status-completed {
            background: #c6f6d5;
            color: #22543d;
        }
        
        .status-pending {
            background: #fef5e7;
            color: #744210;
        }
        
        .status-failed {
            background: #fed7d7;
            color: #742a2a;
        }
        
        .service-details {
            background: #ebf8ff;
            border-radius: 8px;
            padding: 12px;
            margin: 15px 0;
            border-left: 4px solid #3182ce;
        }
        
        .service-title {
            font-size: 10px;
            color: #3182ce;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 5px;
        }
        
        .service-info {
            color: #2b6cb0;
            font-weight: 600;
        }
        
        .divider {
            height: 1px;
            background: linear-gradient(to right, transparent, #e2e8f0, transparent);
            margin: 20px 0;
        }
        
        .footer {
            text-align: center;
            color: #718096;
            font-size: 9px;
            line-height: 1.3;
        }
        
        .thank-you {
            background: #f0fff4;
            color: #276749;
            padding: 10px;
            border-radius: 6px;
            text-align: center;
            font-size: 11px;
            font-weight: 600;
            margin: 15px 0;
            border: 1px solid #9ae6b4;
        }
        
        .print-date {
            color: #a0aec0;
            font-size: 8px;
            margin-top: 10px;
        }
        
        @media print {
            body { -webkit-print-color-adjust: exact; }
            .receipt { box-shadow: none; border: 1px solid #ccc; }
        }
    </style>
</head>
<body>
    <div class="receipt">
        <div class="header">
            <div class="company-name">HOSPX</div>
            <div class="company-tagline">Professional Web Hosting Solutions</div>
        </div>
        
        <div class="content">
            <div class="receipt-title">Payment Receipt</div>
            
            <div class="info-grid">
                <div class="info-item">
                    <div class="info-label">Receipt #</div>
                    <div class="info-value">${paymentData.transaction_id}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Date</div>
                    <div class="info-value">${new Date(paymentData.created_at).toLocaleDateString('en-GB')}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Customer</div>
                    <div class="info-value">${paymentData.user_name || 'N/A'}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Payment Method</div>
                    <div class="info-value">${paymentData.payment_method.toUpperCase()}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Status</div>
                    <div class="info-value">
                        <span class="status-badge status-${paymentData.status}">${paymentData.status.toUpperCase()}</span>
                    </div>
                </div>
                <div class="info-item">
                    <div class="info-label">Service Type</div>
                    <div class="info-value">${(paymentData.payment_type || 'subscription').toUpperCase()}</div>
                </div>
            </div>
            
            <div class="amount-section">
                <div class="amount-label">Total Paid</div>
                <div class="amount-value">${paymentData.amount} ${paymentData.currency || 'BDT'}</div>
            </div>
            
            ${databaseName !== 'N/A' ? `
            <div class="service-details">
                <div class="service-title">Service Details</div>
                <div class="service-info">
                    Database: ${databaseName}<br>
                    Period: ${period} ${periodType}${period > 1 ? 's' : ''}
                </div>
            </div>
            ` : ''}
            
            <div class="thank-you">
                🎉 Thank you for choosing HOSPX!
            </div>
            
            <div class="divider"></div>
            
            <div class="footer">
                <div>This is a computer-generated receipt.</div>
                <div>For support: support@Hospx.app</div>
                <div class="print-date">Printed: ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
        </div>
    </div>
</body>
</html>`;

            return Buffer.from(invoiceHtml, 'utf8');
        } catch (error) {
            console.error('Payment generateReceipt error:', error);
            throw error;
        }
    }

    // Add missing exportToCSV method
    static async exportToCSV(filters = {}) {
        try {
            const payments = await this.findAll(filters);
            
            let csv = 'Transaction ID,Date,User Name,User Email,Amount,Currency,Method,Status,Type\n';
            
            payments.forEach(payment => {
                csv += `"${payment.transaction_id}","${new Date(payment.created_at).toLocaleDateString()}","${payment.user_name}","${payment.user_email}","${payment.amount}","${payment.currency}","${payment.payment_method}","${payment.status}","${payment.payment_type || 'subscription'}"\n`;
            });
            
            return csv;
        } catch (error) {
            console.error('Payment exportToCSV error:', error);
            return 'Error,Message\n"Export Failed","' + error.message + '"\n';
        }
    }
}

module.exports = Payment; 