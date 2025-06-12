const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

class ReferenceCode {
    constructor(data = {}) {
        this.id = data.id || uuidv4();
        this.code = data.code;
        this.user_id = data.user_id;
        this.is_active = data.is_active !== undefined ? data.is_active : true;
        this.created_at = data.created_at;
    }

    // Create new reference code
    async save() {
        try {
            const query = `
                INSERT INTO reference_codes (id, code, user_id, is_active)
                VALUES (?, ?, ?, ?)
            `;
            
            await db.executeQuery(query, [
                this.id,
                this.code,
                this.user_id,
                this.is_active
            ]);

            return { success: true, id: this.id };
        } catch (error) {
            console.error('Error creating reference code:', error);
            return { success: false, error: error.message };
        }
    }

    // Static method to create reference code
    static async create(data) {
        const referenceCode = new ReferenceCode(data);
        return await referenceCode.save();
    }

    // Find reference code by code
    static async findByCode(code) {
        try {
            const query = `
                SELECT rc.*, u.full_name, u.email 
                FROM reference_codes rc
                JOIN users u ON rc.user_id = u.id
                WHERE rc.code = ? AND rc.is_active = true
            `;
            
            const results = await db.executeQuery(query, [code]);
            return results.length > 0 ? results[0] : null;
        } catch (error) {
            console.error('Error finding reference code:', error);
            return null;
        }
    }

    // Find reference codes by user ID
    static async findByUserId(userId) {
        try {
            const query = `
                SELECT * FROM reference_codes 
                WHERE user_id = ? 
                ORDER BY created_at DESC
            `;
            
            const results = await db.executeQuery(query, [userId]);
            return results;
        } catch (error) {
            console.error('Error finding reference codes by user:', error);
            return [];
        }
    }

    // Get reference code statistics
    static async getStats() {
        try {
            const totalQuery = 'SELECT COUNT(*) as total FROM reference_codes';
            const activeQuery = 'SELECT COUNT(*) as active FROM reference_codes WHERE is_active = true';
            const usedQuery = `
                SELECT COUNT(DISTINCT rc.id) as used 
                FROM reference_codes rc
                JOIN users u ON rc.code = u.referred_by
                WHERE rc.is_active = true
            `;

            const [totalResult, activeResult, usedResult] = await Promise.all([
                db.executeQuery(totalQuery),
                db.executeQuery(activeQuery),
                db.executeQuery(usedQuery)
            ]);

            return {
                total: totalResult[0].total || 0,
                active: activeResult[0].active || 0,
                used: usedResult[0].used || 0
            };
        } catch (error) {
            console.error('Error getting reference code stats:', error);
            return { total: 0, active: 0, used: 0 };
        }
    }

    // Get users who used this reference code
    static async getUsers(code) {
        try {
            const query = `
                SELECT u.id, u.full_name, u.email, u.phone, u.created_at
                FROM users u
                JOIN reference_codes rc ON u.referred_by = rc.code
                WHERE rc.code = ? AND rc.is_active = true
                ORDER BY u.created_at DESC
            `;
            
            const results = await db.executeQuery(query, [code]);
            return results;
        } catch (error) {
            console.error('Error getting reference code users:', error);
            return [];
        }
    }

    // Deactivate reference code
    static async deactivate(id) {
        try {
            const query = 'UPDATE reference_codes SET is_active = false WHERE id = ?';
            await db.executeQuery(query, [id]);
            return { success: true };
        } catch (error) {
            console.error('Error deactivating reference code:', error);
            return { success: false, error: error.message };
        }
    }

    // Get all active reference codes with user details
    static async findAll(filters = {}) {
        try {
            let query = `
                SELECT rc.*, u.full_name, u.email, u.phone,
                       COUNT(referred.id) as referred_count
                FROM reference_codes rc
                JOIN users u ON rc.user_id = u.id
                LEFT JOIN users referred ON referred.referred_by = rc.code
                WHERE 1=1
            `;
            const params = [];

            if (filters.is_active !== undefined) {
                query += ' AND rc.is_active = ?';
                params.push(filters.is_active);
            }

            if (filters.search) {
                query += ' AND (rc.code LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)';
                const searchParam = `%${filters.search}%`;
                params.push(searchParam, searchParam, searchParam);
            }

            query += ' GROUP BY rc.id ORDER BY rc.created_at DESC';

            const results = await db.executeQuery(query, params);
            return results;
        } catch (error) {
            console.error('Error finding all reference codes:', error);
            return [];
        }
    }

    // Delete reference code
    static async deleteById(id) {
        try {
            const query = 'DELETE FROM reference_codes WHERE id = ?';
            await db.executeQuery(query, [id]);
            return { success: true };
        } catch (error) {
            console.error('Error deleting reference code:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = ReferenceCode; 