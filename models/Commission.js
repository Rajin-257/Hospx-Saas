const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const db = require('../config/database');

class Commission {
    constructor(data = {}) {
        this.id = data.id || uuidv4();
        this.user_id = data.user_id;
        this.referred_user_id = data.referred_user_id;
        this.payment_id = data.payment_id;
        this.commission_amount = data.commission_amount;
        this.commission_type = data.commission_type;
        this.status = data.status || 'pending';
        this.created_at = data.created_at;
        this.paid_at = data.paid_at;
    }

    async save() {
        try {
            // Validate required fields
            if (!this.user_id || !this.referred_user_id || !this.payment_id || !this.commission_amount) {
                throw new Error('Missing required fields for commission');
            }

            const query = `
                INSERT INTO commissions (id, user_id, referred_user_id, payment_id, commission_amount, commission_type, status)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            
            await db.executeQuery(query, [
                this.id,
                this.user_id,
                this.referred_user_id,
                this.payment_id,
                parseFloat(this.commission_amount),
                this.commission_type,
                this.status
            ]);

            return { success: true, commissionId: this.id };
        } catch (error) {
            console.error('Commission save error:', error);
            return { success: false, error: error.message };
        }
    }

    async update() {
        try {
            if (!this.id) {
                throw new Error('Commission ID is required for update');
            }

            const query = `
                UPDATE commissions 
                SET user_id = ?, referred_user_id = ?, payment_id = ?, commission_amount = ?, 
                    commission_type = ?, status = ?, paid_at = ?
                WHERE id = ?
            `;
            
            await db.executeQuery(query, [
                this.user_id,
                this.referred_user_id,
                this.payment_id,
                parseFloat(this.commission_amount),
                this.commission_type,
                this.status,
                this.paid_at,
                this.id
            ]);

            return { success: true };
        } catch (error) {
            console.error('Commission update error:', error);
            return { success: false, error: error.message };
        }
    }

    static async findById(id) {
        try {
            if (!id) {
                return null;
            }

            const query = 'SELECT * FROM commissions WHERE id = ?';
            const results = await db.executeQuery(query, [id]);
            
            if (results.length > 0) {
                return new Commission(results[0]);
            }
            return null;
        } catch (error) {
            console.error('Commission findById error:', error);
            return null;
        }
    }

    static async findByUserId(userId, filters = {}) {
        try {
            if (!userId) {
                return [];
            }

            let query = `
                SELECT c.*, 
                       u.full_name as user_name, u.email as user_email,
                       ru.full_name as referred_user_name, ru.email as referred_user_email,
                       p.amount as payment_amount, p.payment_method, p.created_at as payment_date
                FROM commissions c
                LEFT JOIN users u ON c.user_id = u.id
                LEFT JOIN users ru ON c.referred_user_id = ru.id
                LEFT JOIN payments p ON c.payment_id = p.id
                WHERE c.user_id = ?
            `;
            let params = [userId];

            if (filters.status) {
                query += ' AND c.status = ?';
                params.push(filters.status);
            }

            if (filters.commission_type) {
                query += ' AND c.commission_type = ?';
                params.push(filters.commission_type);
            }

            if (filters.date_from) {
                query += ' AND DATE(c.created_at) >= ?';
                params.push(filters.date_from);
            }

            if (filters.date_to) {
                query += ' AND DATE(c.created_at) <= ?';
                params.push(filters.date_to);
            }

            query += ' ORDER BY c.created_at DESC';

            if (filters.limit && !isNaN(parseInt(filters.limit))) {
                query += ' LIMIT ?';
                params.push(parseInt(filters.limit));
            }

            const results = await db.executeQuery(query, params);
            return results.map(row => {
                const commission = new Commission(row);
                commission.user_name = row.user_name || 'Unknown User';
                commission.user_email = row.user_email || '';
                commission.referred_user_name = row.referred_user_name || 'Unknown User';
                commission.referred_user_email = row.referred_user_email || '';
                commission.payment_amount = parseFloat(row.payment_amount) || 0;
                commission.payment_method = row.payment_method || '';
                commission.payment_date = row.payment_date;
                return commission;
            });
        } catch (error) {
            console.error('Commission findByUserId error:', error);
            return [];
        }
    }

    static async findAll(filters = {}) {
        try {
            let query = `
                SELECT c.*, 
                       u.full_name as user_name, u.email as user_email,
                       ru.full_name as referred_user_name, ru.email as referred_user_email,
                       p.amount as payment_amount, p.payment_method, p.created_at as payment_date
                FROM commissions c
                LEFT JOIN users u ON c.user_id = u.id
                LEFT JOIN users ru ON c.referred_user_id = ru.id
                LEFT JOIN payments p ON c.payment_id = p.id
            `;
            let params = [];
            let conditions = [];

            if (filters.status) {
                conditions.push('c.status = ?');
                params.push(filters.status);
            }

            if (filters.user_id) {
                conditions.push('c.user_id = ?');
                params.push(filters.user_id);
            }

            if (filters.commission_type) {
                conditions.push('c.commission_type = ?');
                params.push(filters.commission_type);
            }

            if (filters.date_from) {
                conditions.push('DATE(c.created_at) >= ?');
                params.push(filters.date_from);
            }

            if (filters.date_to) {
                conditions.push('DATE(c.created_at) <= ?');
                params.push(filters.date_to);
            }

            if (conditions.length > 0) {
                query += ' WHERE ' + conditions.join(' AND ');
            }

            query += ' ORDER BY c.created_at DESC';

            if (filters.limit && !isNaN(parseInt(filters.limit))) {
                query += ' LIMIT ?';
                params.push(parseInt(filters.limit));
            }

            const results = await db.executeQuery(query, params);
            return results.map(row => {
                const commission = new Commission(row);
                commission.user_name = row.user_name || 'Unknown User';
                commission.user_email = row.user_email || '';
                commission.referred_user_name = row.referred_user_name || 'Unknown User';
                commission.referred_user_email = row.referred_user_email || '';
                commission.payment_amount = parseFloat(row.payment_amount) || 0;
                commission.payment_method = row.payment_method || '';
                commission.payment_date = row.payment_date;
                return commission;
            });
        } catch (error) {
            console.error('Commission findAll error:', error);
            return [];
        }
    }

    static async createCommission(userId, referredUserId, paymentId, paymentAmount) {
        try {
            // Validate input parameters
            if (!userId || !referredUserId || !paymentId || !paymentAmount) {
                throw new Error('Missing required parameters for commission creation');
            }

            // Check if commission already exists for this payment
            const existingQuery = 'SELECT id FROM commissions WHERE payment_id = ?';
            const existingCommissions = await db.executeQuery(existingQuery, [paymentId]);
            
            if (existingCommissions.length > 0) {
                console.log('Commission already exists for payment:', paymentId);
                return { success: true, message: 'Commission already exists for this payment' };
            }

            // Verify that the users exist
            const userCheckQuery = 'SELECT id FROM users WHERE id IN (?, ?)';
            const userCheckResults = await db.executeQuery(userCheckQuery, [userId, referredUserId]);
            
            if (userCheckResults.length !== 2) {
                throw new Error('One or both users not found');
            }

            // Verify that the payment exists
            const paymentCheckQuery = 'SELECT id, amount FROM payments WHERE id = ?';
            const paymentCheckResults = await db.executeQuery(paymentCheckQuery, [paymentId]);
            
            if (paymentCheckResults.length === 0) {
                throw new Error('Payment not found');
            }

            // Get user commission settings including commission type
            const userQuery = 'SELECT commission_percentage, commission_fixed, commission_type FROM users WHERE id = ?';
            const userResults = await db.executeQuery(userQuery, [userId]);

            if (userResults.length === 0) {
                throw new Error('User not found');
            }

            const userResult = userResults[0];
            const commissionPercentage = parseFloat(userResult.commission_percentage) || 10;
            const commissionFixed = parseFloat(userResult.commission_fixed) || 50;
            const commissionType = userResult.commission_type || 'percentage';

            // Calculate commission based on user's preferred type
            let commissionAmount;
            const amount = parseFloat(paymentAmount);
            
            if (commissionType === 'percentage') {
                commissionAmount = (amount * commissionPercentage) / 100;
            } else {
                commissionAmount = commissionFixed;
            }
            
            // Ensure commission amount is not negative or zero
            if (commissionAmount <= 0) {
                throw new Error('Invalid commission amount calculated');
            }

            // Create commission with user's preferred type
            const commission = new Commission({
                user_id: userId,
                referred_user_id: referredUserId,
                payment_id: paymentId,
                commission_amount: commissionAmount,
                commission_type: commissionType,
                status: 'pending'
            });

            const saveResult = await commission.save();
            
            if (!saveResult.success) {
                throw new Error(saveResult.error);
            }

            return {
                success: true,
                commission: commission,
                totalCommission: commissionAmount,
                message: `Commission created: ${commissionAmount.toFixed(2)} BDT (${commissionType})`
            };
        } catch (error) {
            console.error('Commission createCommission error:', error);
            return { success: false, error: error.message };
        }
    }

    static async markAsPaid(commissionIds) {
        try {
            if (!commissionIds || (Array.isArray(commissionIds) && commissionIds.length === 0)) {
                throw new Error('No commission IDs provided');
            }

            const ids = Array.isArray(commissionIds) ? commissionIds : [commissionIds];
            
            // Validate all IDs exist
            const checkQuery = `SELECT id FROM commissions WHERE id IN (${ids.map(() => '?').join(',')})`;
            const existingCommissions = await db.executeQuery(checkQuery, ids);
            
            if (existingCommissions.length !== ids.length) {
                throw new Error('One or more commission IDs not found');
            }

            const placeholders = ids.map(() => '?').join(',');
            const query = `
                UPDATE commissions 
                SET status = 'paid', paid_at = CURRENT_TIMESTAMP 
                WHERE id IN (${placeholders}) AND status = 'pending'
            `;
            
            const result = await db.executeQuery(query, ids);
            return { success: true, affectedRows: result.affectedRows || 0 };
        } catch (error) {
            console.error('Commission markAsPaid error:', error);
            return { success: false, error: error.message };
        }
    }

    static async deleteById(id) {
        try {
            if (!id) {
                throw new Error('Commission ID is required');
            }

            // Check if commission exists
            const checkQuery = 'SELECT id FROM commissions WHERE id = ?';
            const existing = await db.executeQuery(checkQuery, [id]);
            
            if (existing.length === 0) {
                throw new Error('Commission not found');
            }

            const query = 'DELETE FROM commissions WHERE id = ?';
            await db.executeQuery(query, [id]);
            return { success: true };
        } catch (error) {
            console.error('Commission delete error:', error);
            return { success: false, error: error.message };
        }
    }

    static async getStats(filters = {}) {
        try {
            let conditions = [];
            let params = [];

            // Build WHERE conditions
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

            // Single optimized query to get all stats
            const statsQuery = `
                SELECT 
                    COUNT(*) as total_commissions,
                    COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_commissions,
                    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_commissions,
                    COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_commissions,
                    COALESCE(SUM(commission_amount), 0) as total_amount,
                    COALESCE(SUM(CASE WHEN status = 'paid' THEN commission_amount ELSE 0 END), 0) as paid_amount,
                    COALESCE(SUM(CASE WHEN status = 'pending' THEN commission_amount ELSE 0 END), 0) as pending_amount,
                    COALESCE(SUM(CASE WHEN status = 'cancelled' THEN commission_amount ELSE 0 END), 0) as cancelled_amount
                FROM commissions${whereClause}
            `;

            const [statsResult] = await db.executeQuery(statsQuery, params);

            return {
                total_commissions: parseInt(statsResult.total_commissions) || 0,
                paid_commissions: parseInt(statsResult.paid_commissions) || 0,
                pending_commissions: parseInt(statsResult.pending_commissions) || 0,
                cancelled_commissions: parseInt(statsResult.cancelled_commissions) || 0,
                total_amount: parseFloat(statsResult.total_amount) || 0,
                paid_amount: parseFloat(statsResult.paid_amount) || 0,
                pending_amount: parseFloat(statsResult.pending_amount) || 0,
                cancelled_amount: parseFloat(statsResult.cancelled_amount) || 0
            };
        } catch (error) {
            console.error('Commission getStats error:', error);
            return {
                total_commissions: 0,
                paid_commissions: 0,
                pending_commissions: 0,
                cancelled_commissions: 0,
                total_amount: 0,
                paid_amount: 0,
                pending_amount: 0,
                cancelled_amount: 0
            };
        }
    }

    static async getCommissionReport(filters = {}) {
        try {
            let query = `
                SELECT 
                    u.id as user_id,
                    u.full_name as user_name,
                    u.email as user_email,
                    u.commission_type as user_commission_type,
                    u.commission_percentage,
                    u.commission_fixed,
                    COUNT(DISTINCT c.referred_user_id) as referral_count,
                    COUNT(c.id) as commission_entries,
                    SUM(CASE WHEN c.status = 'paid' THEN c.commission_amount ELSE 0 END) as paid_commission,
                    SUM(CASE WHEN c.status = 'pending' THEN c.commission_amount ELSE 0 END) as pending_commission,
                    SUM(c.commission_amount) as total_commission,
                    MAX(c.created_at) as latest_commission_date,
                    MIN(c.created_at) as first_commission_date
                FROM commissions c
                LEFT JOIN users u ON c.user_id = u.id
                WHERE 1=1
            `;
            let params = [];

            if (filters.date_from) {
                query += ' AND DATE(c.created_at) >= ?';
                params.push(filters.date_from);
            }

            if (filters.date_to) {
                query += ' AND DATE(c.created_at) <= ?';
                params.push(filters.date_to);
            }

            if (filters.user_id) {
                query += ' AND c.user_id = ?';
                params.push(filters.user_id);
            }

            if (filters.status) {
                query += ' AND c.status = ?';
                params.push(filters.status);
            }

            query += ' GROUP BY c.user_id ORDER BY total_commission DESC';

            if (filters.limit && !isNaN(parseInt(filters.limit))) {
                query += ' LIMIT ?';
                params.push(parseInt(filters.limit));
            }

            const results = await db.executeQuery(query, params);
            
            return results.map(row => ({
                ...row,
                paid_commission: parseFloat(row.paid_commission) || 0,
                pending_commission: parseFloat(row.pending_commission) || 0,
                total_commission: parseFloat(row.total_commission) || 0,
                commission_percentage: parseFloat(row.commission_percentage) || 0,
                commission_fixed: parseFloat(row.commission_fixed) || 0
            }));
        } catch (error) {
            console.error('Commission getCommissionReport error:', error);
            return [];
        }
    }

    static async getUserStats(userId) {
        try {
            if (!userId) {
                throw new Error('User ID is required');
            }

            const query = `
                SELECT 
                    COUNT(*) as total_commissions,
                    COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_commissions,
                    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_commissions,
                    COALESCE(SUM(CASE WHEN status = 'paid' THEN commission_amount ELSE 0 END), 0) as total_earned,
                    COALESCE(SUM(CASE WHEN status = 'pending' THEN commission_amount ELSE 0 END), 0) as pending_earnings,
                    COALESCE(SUM(commission_amount), 0) as total_commission_amount,
                    MAX(created_at) as latest_commission,
                    MIN(created_at) as first_commission
                FROM commissions
                WHERE user_id = ?
            `;
            
            const results = await db.executeQuery(query, [userId]);
            const stats = results[0] || {};
            
            return {
                total_commissions: parseInt(stats.total_commissions) || 0,
                paid_commissions: parseInt(stats.paid_commissions) || 0,
                pending_commissions: parseInt(stats.pending_commissions) || 0,
                total_earned: parseFloat(stats.total_earned) || 0,
                pending_earnings: parseFloat(stats.pending_earnings) || 0,
                total_commission_amount: parseFloat(stats.total_commission_amount) || 0,
                latest_commission: stats.latest_commission,
                first_commission: stats.first_commission
            };
        } catch (error) {
            console.error('Commission getUserStats error:', error);
            return {
                total_commissions: 0,
                paid_commissions: 0,
                pending_commissions: 0,
                total_earned: 0,
                pending_earnings: 0,
                total_commission_amount: 0,
                latest_commission: null,
                first_commission: null
            };
        }
    }

    // New method to handle bulk operations
    static async bulkUpdateStatus(commissionIds, status) {
        try {
            if (!commissionIds || !Array.isArray(commissionIds) || commissionIds.length === 0) {
                throw new Error('Commission IDs array is required');
            }

            if (!['pending', 'paid', 'cancelled'].includes(status)) {
                throw new Error('Invalid status provided');
            }

            const placeholders = commissionIds.map(() => '?').join(',');
            const query = `
                UPDATE commissions 
                SET status = ?${status === 'paid' ? ', paid_at = CURRENT_TIMESTAMP' : ''} 
                WHERE id IN (${placeholders})
            `;
            
            const params = [status, ...commissionIds];
            const result = await db.executeQuery(query, params);
            
            return { 
                success: true, 
                affectedRows: result.affectedRows || 0,
                message: `${result.affectedRows || 0} commissions updated to ${status}`
            };
        } catch (error) {
            console.error('Commission bulkUpdateStatus error:', error);
            return { success: false, error: error.message };
        }
    }

    // New method to get commission summary by date range
    static async getCommissionSummary(filters = {}) {
        try {
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

            const query = `
                SELECT 
                    DATE(created_at) as commission_date,
                    COUNT(*) as daily_count,
                    SUM(commission_amount) as daily_amount,
                    COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_count,
                    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
                    SUM(CASE WHEN status = 'paid' THEN commission_amount ELSE 0 END) as paid_amount,
                    SUM(CASE WHEN status = 'pending' THEN commission_amount ELSE 0 END) as pending_amount
                FROM commissions${whereClause}
                GROUP BY DATE(created_at)
                ORDER BY commission_date DESC
                LIMIT 30
            `;

            const results = await db.executeQuery(query, params);
            
            return results.map(row => ({
                date: row.commission_date,
                count: parseInt(row.daily_count) || 0,
                amount: parseFloat(row.daily_amount) || 0,
                paid_count: parseInt(row.paid_count) || 0,
                pending_count: parseInt(row.pending_count) || 0,
                paid_amount: parseFloat(row.paid_amount) || 0,
                pending_amount: parseFloat(row.pending_amount) || 0
            }));
        } catch (error) {
            console.error('Commission getCommissionSummary error:', error);
            return [];
        }
    }
}

module.exports = Commission; 