const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const db = require('../config/database');

class Domain {
    constructor(data = {}) {
        this.id = data.id || uuidv4();
        this.domain_name = data.domain_name;
        this.user_id = data.user_id;
        this.database_name = data.database_name;
        this.expiry_date = data.expiry_date;
        this.created_at = data.created_at;
        this.last_accessed = data.last_accessed;
        this.domain_type = data.domain_type; // 'subdomain' or 'custom'
        this.status = data.status || 'active';
    }

    async save() {
        try {
            const query = `
                INSERT INTO domains (id, domain_name, user_id, database_name, expiry_date, domain_type, status)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            
            await db.executeQuery(query, [
                this.id,
                this.domain_name,
                this.user_id,
                this.database_name,
                this.expiry_date,
                this.domain_type,
                this.status
            ]);

            return { success: true, domainId: this.id };
        } catch (error) {
            console.error('Domain save error:', error);
            return { success: false, error: error.message };
        }
    }

    async update() {
        try {
            const query = `
                UPDATE domains 
                SET domain_name = ?, user_id = ?, database_name = ?, expiry_date = ?, domain_type = ?, status = ?
                WHERE id = ?
            `;
            
            await db.executeQuery(query, [
                this.domain_name,
                this.user_id,
                this.database_name,
                this.expiry_date,
                this.domain_type,
                this.status,
                this.id
            ]);

            return { success: true };
        } catch (error) {
            console.error('Domain update error:', error);
            return { success: false, error: error.message };
        }
    }

    static async findById(id) {
        try {
            const query = 'SELECT * FROM domains WHERE id = ?';
            const results = await db.executeQuery(query, [id]);
            
            if (results.length > 0) {
                return new Domain(results[0]);
            }
            return null;
        } catch (error) {
            console.error('Domain findById error:', error);
            return null;
        }
    }

    static async findByDomainName(domainName) {
        try {
            const query = 'SELECT * FROM domains WHERE domain_name = ?';
            const results = await db.executeQuery(query, [domainName]);
            
            if (results.length > 0) {
                return new Domain(results[0]);
            }
            return null;
        } catch (error) {
            console.error('Domain findByDomainName error:', error);
            return null;
        }
    }

    static async findByUserId(userId) {
        try {
            const query = `
                SELECT d.*, u.full_name as user_name
                FROM domains d
                LEFT JOIN users u ON d.user_id = u.id
                WHERE d.user_id = ?
                ORDER BY d.created_at DESC
            `;
            const results = await db.executeQuery(query, [userId]);
            return results.map(row => ({
                ...new Domain(row),
                user_name: row.user_name
            }));
        } catch (error) {
            console.error('Domain findByUserId error:', error);
            return [];
        }
    }

    static async findAll(filters = {}) {
        try {
            let query = `
                SELECT d.*, u.full_name as user_name, u.email as user_email
                FROM domains d
                LEFT JOIN users u ON d.user_id = u.id
            `;
            let params = [];
            let conditions = [];

            if (filters.status) {
                conditions.push('d.status = ?');
                params.push(filters.status);
            }

            if (filters.user_id) {
                conditions.push('d.user_id = ?');
                params.push(filters.user_id);
            }

            if (filters.domain_type) {
                conditions.push('d.domain_type = ?');
                params.push(filters.domain_type);
            }

            if (filters.search) {
                conditions.push('(d.domain_name LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)');
                const searchTerm = `%${filters.search}%`;
                params.push(searchTerm, searchTerm, searchTerm);
            }

            if (conditions.length > 0) {
                query += ' WHERE ' + conditions.join(' AND ');
            }

            query += ' ORDER BY d.created_at DESC';

            if (filters.limit) {
                query += ' LIMIT ?';
                params.push(parseInt(filters.limit));
            }

            const results = await db.executeQuery(query, params);
            return results.map(row => ({
                ...new Domain(row),
                user_name: row.user_name,
                user_email: row.user_email
            }));
        } catch (error) {
            console.error('Domain findAll error:', error);
            return [];
        }
    }

    static async deleteById(id) {
        try {
            const query = 'DELETE FROM domains WHERE id = ?';
            await db.executeQuery(query, [id]);
            return { success: true };
        } catch (error) {
            console.error('Domain delete error:', error);
            return { success: false, error: error.message };
        }
    }

    static async deleteByDomainName(domainName) {
        try {
            const query = 'DELETE FROM domains WHERE domain_name = ?';
            const result = await db.executeQuery(query, [domainName]);
            return { 
                success: true, 
                deletedRows: result.affectedRows,
                message: result.affectedRows > 0 ? 'Domain deleted successfully' : 'No domain found to delete'
            };
        } catch (error) {
            console.error('Domain deleteByDomainName error:', error);
            return { success: false, error: error.message };
        }
    }

    static async checkDomainExists(domainName) {
        try {
            const query = 'SELECT id FROM domains WHERE domain_name = ?';
            const results = await db.executeQuery(query, [domainName]);
            return results.length > 0;
        } catch (error) {
            console.error('Domain check error:', error);
            return true; // Return true to be safe
        }
    }

    static async getExpiringSoon(days = 7) {
        try {
            const query = `
                SELECT d.*, u.full_name as user_name, u.email as user_email
                FROM domains d
                LEFT JOIN users u ON d.user_id = u.id
                WHERE d.expiry_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
                AND d.expiry_date >= CURDATE()
                AND d.status = 'active'
                ORDER BY d.expiry_date ASC
            `;
            
            const results = await db.executeQuery(query, [days]);
            return results.map(row => ({
                ...new Domain(row),
                user_name: row.user_name,
                user_email: row.user_email,
                days_remaining: this.calculateDaysRemaining(row.expiry_date)
            }));
        } catch (error) {
            console.error('Domain getExpiringSoon error:', error);
            return [];
        }
    }

    static async markExpired() {
        try {
            const query = `
                UPDATE domains 
                SET status = 'expired' 
                WHERE expiry_date < CURDATE() AND status = 'active'
            `;
            
            const result = await db.executeQuery(query);
            return { success: true, affectedRows: result.affectedRows };
        } catch (error) {
            console.error('Domain markExpired error:', error);
            return { success: false, error: error.message };
        }
    }

    static calculateDaysRemaining(expiryDate) {
        const today = moment().startOf('day');
        const expiry = moment(expiryDate).startOf('day');
        return expiry.diff(today, 'days');
    }

    // Method to delete domain completely including Webuzo cleanup
    static async deleteCompletely(domainName) {
        try {
            const domain = await this.findByDomainName(domainName);
            if (!domain) {
                return { success: false, error: 'Domain not found' };
            }

            const results = {
                webuzo: { success: false },
                local: { success: false }
            };

            // Only delete from Webuzo if it's a custom domain
            if (domain.domain_type === 'custom') {
                try {
                    const webuzoService = require('../services/webuzoService');
                    const webuzoResult = await webuzoService.deleteDomain(domainName);
                    results.webuzo = webuzoResult;
                    
                    if (!webuzoResult.success) {
                        console.warn(`Failed to delete domain from Webuzo: ${webuzoResult.message}`);
                    }
                } catch (webuzoError) {
                    console.error('Webuzo domain deletion error:', webuzoError);
                    results.webuzo = { success: false, error: webuzoError.message };
                }
            } else {
                // For subdomains, we don't need to delete from Webuzo
                results.webuzo = { success: true, message: 'Subdomain - no Webuzo deletion needed' };
            }

            // Always delete from local database
            const localResult = await this.deleteByDomainName(domainName);
            results.local = localResult;

            const warnings = [];
            if (!results.webuzo.success && domain.domain_type === 'custom') {
                warnings.push(`Webuzo domain deletion failed: ${results.webuzo.message || results.webuzo.error}`);
            }

            return {
                success: localResult.success,
                message: localResult.success ? 'Domain deleted successfully' : 'Failed to delete domain',
                warnings: warnings,
                details: results,
                domainType: domain.domain_type
            };

        } catch (error) {
            console.error('Complete domain deletion error:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = Domain; 