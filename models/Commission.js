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
            const query = `
                INSERT INTO commissions (id, user_id, referred_user_id, payment_id, commission_amount, commission_type, status)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            
            await db.executeQuery(query, [
                this.id,
                this.user_id,
                this.referred_user_id,
                this.payment_id,
                this.commission_amount,
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
                this.commission_amount,
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
            let query = `
                SELECT c.*, 
                       u.full_name as user_name, u.email as user_email,
                       ru.full_name as referred_user_name, ru.email as referred_user_email,
                       p.amount as payment_amount, p.payment_method, p.created_at as payment_date
                FROM commissions c
                JOIN users u ON c.user_id = u.id
                JOIN users ru ON c.referred_user_id = ru.id
                JOIN payments p ON c.payment_id = p.id
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

            query += ' ORDER BY c.created_at DESC';

            if (filters.limit) {
                query += ' LIMIT ?';
                params.push(parseInt(filters.limit));
            }

            const results = await db.executeQuery(query, params);
            return results.map(row => {
                const commission = new Commission(row);
                commission.user_name = row.user_name;
                commission.user_email = row.user_email;
                commission.referred_user_name = row.referred_user_name;
                commission.referred_user_email = row.referred_user_email;
                commission.payment_amount = row.payment_amount;
                commission.payment_method = row.payment_method;
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
                JOIN users u ON c.user_id = u.id
                JOIN users ru ON c.referred_user_id = ru.id
                JOIN payments p ON c.payment_id = p.id
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

            if (filters.limit) {
                query += ' LIMIT ?';
                params.push(parseInt(filters.limit));
            }

            const results = await db.executeQuery(query, params);
            return results.map(row => {
                const commission = new Commission(row);
                commission.user_name = row.user_name;
                commission.user_email = row.user_email;
                commission.referred_user_name = row.referred_user_name;
                commission.referred_user_email = row.referred_user_email;
                commission.payment_amount = row.payment_amount;
                commission.payment_method = row.payment_method;
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
            // Check if commission already exists for this payment
            const existingQuery = 'SELECT id FROM commissions WHERE payment_id = ?';
            const existingCommissions = await db.executeQuery(existingQuery, [paymentId]);
            
            if (existingCommissions.length > 0) {
                console.log('Commission already exists for payment:', paymentId);
                return { success: true, message: 'Commission already exists for this payment' };
            }

            // Get user commission settings including commission type
            const userQuery = 'SELECT commission_percentage, commission_fixed, commission_type FROM users WHERE id = ?';
            const [userResult] = await db.executeQuery(userQuery, [userId]);

            if (!userResult) {
                throw new Error('User not found');
            }

            const commissionPercentage = parseFloat(userResult.commission_percentage) || 10;
            const commissionFixed = parseFloat(userResult.commission_fixed) || 50;
            const commissionType = userResult.commission_type || 'percentage';

            // Calculate commission based on user's preferred type
            let commissionAmount;
            if (commissionType === 'percentage') {
                commissionAmount = (paymentAmount * commissionPercentage) / 100;
            } else {
                commissionAmount = commissionFixed;
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

            await commission.save();

            return {
                success: true,
                commission: commission,
                totalCommission: commissionAmount,
                message: `Commission created: ${commissionAmount} BDT (${commissionType})`
            };
        } catch (error) {
            console.error('Commission createCommission error:', error);
            return { success: false, error: error.message };
        }
    }

    static async markAsPaid(commissionIds) {
        try {
            const ids = Array.isArray(commissionIds) ? commissionIds : [commissionIds];
            const placeholders = ids.map(() => '?').join(',');
            
            const query = `
                UPDATE commissions 
                SET status = 'paid', paid_at = CURRENT_TIMESTAMP 
                WHERE id IN (${placeholders})
            `;
            
            await db.executeQuery(query, ids);
            return { success: true };
        } catch (error) {
            console.error('Commission markAsPaid error:', error);
            return { success: false, error: error.message };
        }
    }

    static async deleteById(id) {
        try {
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

            // Total commissions
            const totalQuery = `${baseQuery} COUNT(*) as count FROM commissions${whereClause}`;
            const [totalResult] = await db.executeQuery(totalQuery, params);

            // Paid commissions
            const paidQuery = `${baseQuery} COUNT(*) as count FROM commissions${whereClause}${conditions.length > 0 ? ' AND' : ' WHERE'} status = 'paid'`;
            const [paidResult] = await db.executeQuery(paidQuery, [...params, 'paid']);

            // Total commission amount
            const totalAmountQuery = `${baseQuery} COALESCE(SUM(commission_amount), 0) as total FROM commissions${whereClause}`;
            const [totalAmountResult] = await db.executeQuery(totalAmountQuery, params);

            // Paid commission amount
            const paidAmountQuery = `${baseQuery} COALESCE(SUM(commission_amount), 0) as total FROM commissions${whereClause}${conditions.length > 0 ? ' AND' : ' WHERE'} status = 'paid'`;
            const [paidAmountResult] = await db.executeQuery(paidAmountQuery, [...params, 'paid']);

            // Pending commission amount
            const pendingAmountQuery = `${baseQuery} COALESCE(SUM(commission_amount), 0) as total FROM commissions${whereClause}${conditions.length > 0 ? ' AND' : ' WHERE'} status = 'pending'`;
            const [pendingAmountResult] = await db.executeQuery(pendingAmountQuery, [...params, 'pending']);

            return {
                total_commissions: totalResult.count,
                paid_commissions: paidResult.count,
                pending_commissions: totalResult.count - paidResult.count,
                total_amount: parseFloat(totalAmountResult.total) || 0,
                paid_amount: parseFloat(paidAmountResult.total) || 0,
                pending_amount: parseFloat(pendingAmountResult.total) || 0
            };
        } catch (error) {
            console.error('Commission getStats error:', error);
            return {
                total_commissions: 0,
                paid_commissions: 0,
                pending_commissions: 0,
                total_amount: 0,
                paid_amount: 0,
                pending_amount: 0
            };
        }
    }

    static async getCommissionReport(filters = {}) {
        try {
            let query = `
                SELECT 
                    u.full_name as user_name,
                    u.email as user_email,
                    COUNT(DISTINCT c.referred_user_id) as referral_count,
                    SUM(c.commission_amount) as total_commission,
                    c.status,
                    COUNT(c.id) as commission_entries,
                    MAX(c.created_at) as latest_commission_date
                FROM commissions c
                JOIN users u ON c.user_id = u.id
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

            query += ' GROUP BY c.user_id, c.status ORDER BY total_commission DESC';

            if (filters.limit) {
                query += ' LIMIT ?';
                params.push(parseInt(filters.limit || 10));
            }

            const results = await db.executeQuery(query, params);
            return results;
        } catch (error) {
            console.error('Commission getCommissionReport error:', error);
            return [];
        }
    }
}

module.exports = Commission; 