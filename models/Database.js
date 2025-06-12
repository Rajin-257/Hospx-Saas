const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const db = require('../config/database');

class Database {
    constructor(data = {}) {
        this.id = data.id || uuidv4();
        this.database_name = data.database_name;
        this.user_id = data.user_id;
        this.domain_id = data.domain_id;
        this.expiry_date = data.expiry_date;
        this.last_renewed = data.last_renewed;
        this.created_at = data.created_at;
        this.last_accessed = data.last_accessed;
        this.status = data.status || 'active';
    }

    async save() {
        try {
            const query = `
                INSERT INTO \`databases\` (id, database_name, user_id, domain_id, expiry_date, last_renewed, status)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            
            await db.executeQuery(query, [
                this.id,
                this.database_name,
                this.user_id,
                this.domain_id || null,
                this.expiry_date,
                this.last_renewed || moment().format('YYYY-MM-DD'),
                this.status
            ]);

            return { success: true, databaseId: this.id };
        } catch (error) {
            console.error('Database save error:', error);
            return { success: false, error: error.message };
        }
    }

    async update() {
        try {
            const query = `
                UPDATE \`databases\` 
                SET database_name = ?, user_id = ?, domain_id = ?, expiry_date = ?, last_renewed = ?, status = ?
                WHERE id = ?
            `;
            
            await db.executeQuery(query, [
                this.database_name,
                this.user_id,
                this.domain_id || null,
                this.expiry_date,
                this.last_renewed || null,
                this.status,
                this.id
            ]);

            return { success: true };
        } catch (error) {
            console.error('Database update error:', error);
            return { success: false, error: error.message };
        }
    }

    static async findById(id) {
        try {
            const query = 'SELECT * FROM `databases` WHERE id = ?';
            const results = await db.executeQuery(query, [id]);
            
            if (results.length > 0) {
                return new Database(results[0]);
            }
            return null;
        } catch (error) {
            console.error('Database findById error:', error);
            return null;
        }
    }

    static async findByUserId(userId) {
        try {
            const query = `
                SELECT d.*, dom.domain_name, u.full_name as user_name
                FROM \`databases\` d
                LEFT JOIN domains dom ON d.domain_id = dom.id
                LEFT JOIN users u ON d.user_id = u.id
                WHERE d.user_id = ?
                ORDER BY d.created_at DESC
            `;
            const results = await db.executeQuery(query, [userId]);
            return results.map(row => ({
                ...new Database(row),
                domain_name: row.domain_name,
                user_name: row.user_name
            }));
        } catch (error) {
            console.error('Database findByUserId error:', error);
            return [];
        }
    }

    static async findAll(filters = {}) {
        try {
            let query = `
                SELECT d.*, dom.domain_name, u.full_name as user_name, u.email as user_email
                FROM \`databases\` d
                LEFT JOIN domains dom ON d.domain_id = dom.id
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

            if (filters.expiry_filter === 'expiring_soon') {
                conditions.push('d.expiry_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY) AND d.status = "active"');
            } else if (filters.expiry_filter === 'expired') {
                conditions.push('d.expiry_date < CURDATE()');
            }

            if (filters.search) {
                conditions.push('(d.database_name LIKE ? OR dom.domain_name LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)');
                const searchTerm = `%${filters.search}%`;
                params.push(searchTerm, searchTerm, searchTerm, searchTerm);
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
                ...new Database(row),
                domain_name: row.domain_name,
                user_name: row.user_name,
                user_email: row.user_email,
                days_remaining: this.calculateDaysRemaining(row.expiry_date)
            }));
        } catch (error) {
            console.error('Database findAll error:', error);
            return [];
        }
    }

    static async getExpiringSoon(days = 7) {
        try {
            const query = `
                SELECT d.*, dom.domain_name, u.full_name as user_name, u.email as user_email
                FROM \`databases\` d
                LEFT JOIN domains dom ON d.domain_id = dom.id
                LEFT JOIN users u ON d.user_id = u.id
                WHERE d.expiry_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
                AND d.expiry_date >= CURDATE()
                AND d.status = 'active'
                ORDER BY d.expiry_date ASC
            `;
            
            const results = await db.executeQuery(query, [days]);
            return results.map(row => ({
                ...new Database(row),
                domain_name: row.domain_name,
                user_name: row.user_name,
                user_email: row.user_email,
                days_remaining: this.calculateDaysRemaining(row.expiry_date)
            }));
        } catch (error) {
            console.error('Database getExpiringSoon error:', error);
            return [];
        }
    }

    static async renewDatabase(databaseId, period = 15, periodType = 'days') {
        try {
            const database = await this.findById(databaseId);
            if (!database) {
                return { success: false, error: 'Database not found' };
            }

            const currentExpiry = moment(database.expiry_date);
            let newExpiry;
            
            // If period is less than 1, treat as partial month (convert to days)
            if (typeof period === 'number' && period < 1) {
                const days = Math.round(period * 30); // Convert partial month to days
                newExpiry = currentExpiry.add(days, 'days').format('YYYY-MM-DD');
            } else if (periodType === 'days') {
                newExpiry = currentExpiry.add(period, 'days').format('YYYY-MM-DD');
            } else {
                newExpiry = currentExpiry.add(period, 'months').format('YYYY-MM-DD');
            }

            const renewDate = moment().format('YYYY-MM-DD');

            const query = `
                UPDATE \`databases\` 
                SET expiry_date = ?, last_renewed = ?, status = 'active'
                WHERE id = ?
            `;
            
            const result = await db.executeQuery(query, [newExpiry, renewDate, databaseId]);

            // Check if the update was successful
            if (result.affectedRows === 0) {
                return { success: false, error: 'No database record was updated' };
            }

            return { success: true, newExpiryDate: newExpiry, message: 'Database renewed successfully' };
        } catch (error) {
            console.error('Database renewDatabase error:', error);
            return { success: false, error: error.message };
        }
    }

    static async deleteById(id) {
        try {
            // First get the database with associated domain info
            const database = await this.findByIdWithDomain(id);
            if (!database) {
                return { success: false, error: 'Database not found' };
            }

            // Use executeQuery for consistent deletion without manual transactions for now
            // This will work with the existing foreign key constraints
            try {
                // 1. Delete the database record (foreign key constraints will handle domain cleanup)
                const deleteDatabaseQuery = 'DELETE FROM `databases` WHERE id = ?';
                const result = await db.executeQuery(deleteDatabaseQuery, [id]);

                if (result.affectedRows === 0) {
                    return { success: false, error: 'No database record was deleted' };
                }

                // 2. Manually delete associated domain record if exists (in case foreign key didn't handle it)
                if (database.domain_id) {
                    try {
                        const deleteDomainQuery = 'DELETE FROM domains WHERE id = ?';
                        await db.executeQuery(deleteDomainQuery, [database.domain_id]);
                    } catch (domainDeleteError) {
                        // Log error but don't fail the entire operation
                        console.warn('Could not delete associated domain record:', domainDeleteError.message);
                    }
                }

                return { 
                    success: true, 
                    message: 'Database and associated domain records deleted successfully',
                    deletedDomain: database.domain_name
                };
            } catch (deletionError) {
                throw deletionError;
            }
        } catch (error) {
            console.error('Database delete error:', error);
            return { success: false, error: error.message };
        }
    }

    // New helper method to get database with domain information
    static async findByIdWithDomain(id) {
        try {
            const query = `
                SELECT d.*, dom.domain_name, dom.domain_type
                FROM \`databases\` d
                LEFT JOIN domains dom ON d.domain_id = dom.id
                WHERE d.id = ?
            `;
            const results = await db.executeQuery(query, [id]);
            
            if (results.length > 0) {
                return {
                    ...new Database(results[0]),
                    domain_name: results[0].domain_name,
                    domain_type: results[0].domain_type
                };
            }
            return null;
        } catch (error) {
            console.error('Database findByIdWithDomain error:', error);
            return null;
        }
    }

    // Enhanced method to delete database completely including Webuzo cleanup
    static async deleteCompletely(id) {
        try {
            // Get database with domain info
            const database = await this.findByIdWithDomain(id);
            if (!database) {
                return { success: false, error: 'Database not found' };
            }

            const webuzoService = require('../services/webuzoService');
            const results = {
                database: { success: false },
                domain: { success: false },
                webuzoDatabase: { success: false },
                webuzoDomain: { success: false }
            };

            try {
                // 1. Delete from Webuzo panel - Database
                if (database.database_name) {
                    const webuzoDbResult = await webuzoService.deleteDatabase(database.database_name);
                    results.webuzoDatabase = webuzoDbResult;
                    if (!webuzoDbResult.success) {
                        console.warn(`Failed to delete database from Webuzo: ${webuzoDbResult.message}`);
                    }
                }

                // 2. Delete from Webuzo panel - Domain (only for custom domains)
                if (database.domain_name && database.domain_type === 'custom') {
                    const webuzoDomainResult = await webuzoService.deleteDomain(database.domain_name);
                    results.webuzoDomain = webuzoDomainResult;
                    console.log('webuzoDomainResult', webuzoDomainResult, database.domain_name);
                    if (!webuzoDomainResult.success) {
                        console.warn(`Failed to delete domain from Webuzo: ${webuzoDomainResult.message}`);
                    }
                }
            } catch (webuzoError) {
                console.error('Webuzo deletion error:', webuzoError);
                // Continue with local deletion even if Webuzo fails
            }

            // 3. Delete from local database (always do this)
            const localDeletionResult = await this.deleteById(id);
            results.database = localDeletionResult;

            // Determine overall success
            const overallSuccess = localDeletionResult.success;
            const warnings = [];

            if (!results.webuzoDatabase.success && database.database_name) {
                warnings.push(`Webuzo database deletion failed: ${results.webuzoDatabase.message}`);
            }

            if (!results.webuzoDomain.success && database.domain_name && database.domain_type === 'custom') {
                warnings.push(`Webuzo domain deletion failed: ${results.webuzoDomain.message}`);
            }

            return {
                success: overallSuccess,
                message: overallSuccess ? 'Database deleted successfully' : 'Failed to delete database',
                warnings: warnings,
                details: results,
                deletedItems: {
                    database: database.database_name,
                    domain: database.domain_name,
                    domainType: database.domain_type
                }
            };

        } catch (error) {
            console.error('Complete database deletion error:', error);
            return { success: false, error: error.message };
        }
    }

    static async updateLastAccessed(databaseId) {
        try {
            const query = 'UPDATE `databases` SET last_accessed = CURRENT_TIMESTAMP WHERE id = ?';
            await db.executeQuery(query, [databaseId]);
            return { success: true };
        } catch (error) {
            console.error('Database updateLastAccessed error:', error);
            return { success: false, error: error.message };
        }
    }

    static async getStats() {
        try {
            const totalQuery = 'SELECT COUNT(*) as count FROM `databases`';
            const activeQuery = 'SELECT COUNT(*) as count FROM `databases` WHERE status = "active"';
            const expiredQuery = 'SELECT COUNT(*) as count FROM `databases` WHERE expiry_date < CURDATE() AND status = "active"';
            const expiringSoonQuery = 'SELECT COUNT(*) as count FROM `databases` WHERE expiry_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY) AND expiry_date >= CURDATE() AND status = "active"';
            
            const [total] = await db.executeQuery(totalQuery);
            const [active] = await db.executeQuery(activeQuery);
            const [expired] = await db.executeQuery(expiredQuery);
            const [expiringSoon] = await db.executeQuery(expiringSoonQuery);

            return {
                total: total.count,
                active: active.count,
                expired: expired.count,
                expiring_soon: expiringSoon.count
            };
        } catch (error) {
            console.error('Database getStats error:', error);
            return { total: 0, active: 0, expired: 0, expiring_soon: 0 };
        }
    }

    static calculateDaysRemaining(expiryDate) {
        const expiry = moment(expiryDate);
        const today = moment();
        const diff = expiry.diff(today, 'days');
        return diff;
    }

    static async checkDatabaseExists(databaseName) {
        try {
            const query = 'SELECT id FROM `databases` WHERE database_name = ?';
            const results = await db.executeQuery(query, [databaseName]);
            return results.length > 0;
        } catch (error) {
            console.error('Database checkDatabaseExists error:', error);
            return true; // Return true to be safe
        }
    }

    static async checkDomainExists(domainName) {
        try {
            const query = `
                SELECT d.id, d.database_name as database_id 
                FROM domains dom 
                LEFT JOIN \`databases\` d ON dom.id = d.domain_id 
                WHERE dom.domain_name = ?
            `;
            const results = await db.executeQuery(query, [domainName]);
            if (results.length > 0) {
                return results[0]; // Return the record with database_id
            }
            return null;
        } catch (error) {
            console.error('Database domain check error:', error);
            return null;
        }
    }

    static async markExpired() {
        try {
            const query = `
                UPDATE \`databases\` 
                SET status = 'expired' 
                WHERE expiry_date < CURDATE() AND status = 'active'
            `;
            
            const result = await db.executeQuery(query);
            return { success: true, affectedRows: result.affectedRows };
        } catch (error) {
            console.error('Database markExpired error:', error);
            return { success: false, error: error.message };
        }
    }

    static async findByIdWithUser(id) {
        try {
            const query = `
                SELECT d.*, 
                       u.full_name as user_name, 
                       u.email as user_email, 
                       u.phone as user_phone,
                       dom.domain_name,
                       CONCAT(d.database_name, '_user') as db_username,
                       'localhost' as db_host,
                       3306 as db_port,
                       SUBSTRING(MD5(RAND()), 1, 12) as db_password
                FROM \`databases\` d
                LEFT JOIN users u ON d.user_id = u.id
                LEFT JOIN domains dom ON d.domain_id = dom.id
                WHERE d.id = ?
            `;
            const results = await db.executeQuery(query, [id]);
            
            if (results.length > 0) {
                return {
                    ...new Database(results[0]),
                    user_name: results[0].user_name,
                    user_email: results[0].user_email,
                    user_phone: results[0].user_phone,
                    domain_name: results[0].domain_name,
                    db_username: results[0].db_username,
                    db_host: results[0].db_host,
                    db_port: results[0].db_port,
                    db_password: results[0].db_password
                };
            }
            return null;
        } catch (error) {
            console.error('Database findByIdWithUser error:', error);
            return null;
        }
    }

    static async renewExpiring(days = 7) {
        try {
            const query = `
                UPDATE \`databases\` 
                SET expiry_date = DATE_ADD(expiry_date, INTERVAL 15 DAY),
                    last_renewed = NOW(),
                    status = 'active'
                WHERE expiry_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
                AND expiry_date >= CURDATE()
                AND status = 'active'
            `;
            
            const result = await db.executeQuery(query, [days]);
            return { success: true, count: result.affectedRows };
        } catch (error) {
            console.error('Database renewExpiring error:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = Database; 