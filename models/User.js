const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const emailService = require('../services/emailService');

class User {
    constructor(data = {}) {
        this.id = data.id || uuidv4();
        this.full_name = data.full_name;
        this.email = data.email;
        this.phone = data.phone;
        this.password = data.password;
        this.role = data.role || 'user';
        this.status = data.status || 'active';
        this.reference_code = data.reference_code || null;
        this.referred_by = data.referred_by || null;
        this.commission_percentage = data.commission_percentage || 10.00;
        this.commission_fixed = data.commission_fixed || 50.00;
        this.commission_type = data.commission_type || 'percentage'; // 'percentage' or 'fixed'
        this.created_at = data.created_at;
        this.updated_at = data.updated_at;
    }

    // Create new user
    async save() {
        try {
            let tempPassword = null;
            
            // Auto-generate password for executives and admins if not provided
            if ((this.role === 'executive' || this.role === 'admin') && !this.password) {
                tempPassword = User.generatePassword(12);
                this.password = tempPassword;
            }
            
            // Hash password if it exists and isn't already hashed
            if (this.password && !this.password.startsWith('$2a$')) {
                this.password = await bcrypt.hash(this.password, 10);
            }
            
            // Auto-generate reference code for executives and admins if not already provided
            if ((this.role === 'executive' || this.role === 'admin') && !this.reference_code) {
                this.reference_code = User.generateReferenceCode();
            }
            
            const query = `
                INSERT INTO users (id, full_name, email, phone, password, role, status, reference_code, referred_by, commission_percentage, commission_fixed, commission_type)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            await db.executeQuery(query, [
                this.id,
                this.full_name,
                this.email,
                this.phone,
                this.password || null,
                this.role,
                this.status,
                this.reference_code || null,
                this.referred_by || null,
                this.commission_percentage || 10.00,
                this.commission_fixed || 50.00,
                this.commission_type || 'percentage'
            ]);

            // Add reference code to reference_codes table for executives and admins
            if ((this.role === 'executive' || this.role === 'admin') && this.reference_code) {
                const refCodeQuery = `
                    INSERT INTO reference_codes (id, code, user_id, is_active)
                    VALUES (?, ?, ?, ?)
                `;
                await db.executeQuery(refCodeQuery, [
                    uuidv4(),
                    this.reference_code,
                    this.id,
                    true
                ]);
            }

            // Send credentials email for executives and admins
            if ((this.role === 'executive' || this.role === 'admin') && tempPassword && this.reference_code) {
                try {
                    await emailService.sendCredentialsEmail(
                        this.email,
                        this.full_name,
                        tempPassword,
                        this.reference_code
                    );
                } catch (emailError) {
                    console.error('Email sending error:', emailError);
                    // Don't fail the user creation if email fails
                }
            }

            return { 
                success: true, 
                userId: this.id, 
                referenceCode: this.reference_code,
                password: tempPassword // Return for admin reference
            };
        } catch (error) {
            console.error('User save error:', error);
            return { success: false, error: error.message };
        }
    }

    // Update user
    async update() {
        try {
            const query = `
                UPDATE users 
                SET full_name = ?, email = ?, phone = ?, password = ?, role = ?, status = ?, 
                    reference_code = ?, commission_percentage = ?, commission_fixed = ?, commission_type = ?
                WHERE id = ?
            `;
            
            await db.executeQuery(query, [
                this.full_name,
                this.email,
                this.phone,
                this.password || null,
                this.role,
                this.status,
                this.reference_code || null,
                this.commission_percentage || 10.00,
                this.commission_fixed || 50.00,
                this.commission_type || 'percentage',
                this.id
            ]);

            return { success: true };
        } catch (error) {
            console.error('User update error:', error);
            return { success: false, error: error.message };
        }
    }

    // Hash password
    async hashPassword(password) {
        return await bcrypt.hash(password, 10);
    }

    // Verify password
    async verifyPassword(password) {
        return await bcrypt.compare(password, this.password);
    }

    // Static methods
    static async findById(id) {
        try {
            const query = 'SELECT * FROM users WHERE id = ?';
            const results = await db.executeQuery(query, [id]);
            
            if (results.length > 0) {
                return new User(results[0]);
            }
            return null;
        } catch (error) {
            console.error('User findById error:', error);
            return null;
        }
    }

    static async findByEmail(email) {
        try {
            const query = 'SELECT * FROM users WHERE email = ?';
            const results = await db.executeQuery(query, [email]);
            
            if (results.length > 0) {
                return new User(results[0]);
            }
            return null;
        } catch (error) {
            console.error('User findByEmail error:', error);
            return null;
        }
    }

    static async findAll(filters = {}) {
        try {
            let query = 'SELECT * FROM users';
            let params = [];
            let conditions = [];

            if (filters.role) {
                conditions.push('role = ?');
                params.push(filters.role);
            }

            if (filters.status) {
                conditions.push('status = ?');
                params.push(filters.status);
            }

            // Add search functionality
            if (filters.search) {
                conditions.push('(full_name LIKE ? OR email LIKE ? OR phone LIKE ?)');
                const searchTerm = `%${filters.search}%`;
                params.push(searchTerm, searchTerm, searchTerm);
            }

            if (conditions.length > 0) {
                query += ' WHERE ' + conditions.join(' AND ');
            }

            query += ' ORDER BY created_at DESC';

            if (filters.limit) {
                query += ' LIMIT ?';
                params.push(parseInt(filters.limit));
            }

            const results = await db.executeQuery(query, params);
            return results.map(row => new User(row));
        } catch (error) {
            console.error('User findAll error:', error);
            return [];
        }
    }

    static async validateReferenceCode(referenceCode) {
        try {
            const query = `
                SELECT rc.*, u.full_name, u.email 
                FROM reference_codes rc 
                JOIN users u ON rc.user_id = u.id 
                WHERE rc.code = ? AND rc.is_active = TRUE
            `;
            const results = await db.executeQuery(query, [referenceCode]);
            
            if (results.length > 0) {
                return {
                    valid: true,
                    referrer: {
                        id: results[0].user_id,
                        name: results[0].full_name,
                        email: results[0].email
                    }
                };
            }
            return { valid: false };
        } catch (error) {
            console.error('Reference code validation error:', error);
            return { valid: false };
        }
    }

    static async checkDomainExists(domain) {
        try {
            const query = 'SELECT id FROM domains WHERE domain_name = ?';
            const results = await db.executeQuery(query, [domain]);
            return results.length > 0;
        } catch (error) {
            console.error('Domain check error:', error);
            return true; // Return true to be safe
        }
    }

    static async checkEmailExists(email) {
        try {
            const query = 'SELECT id FROM users WHERE email = ?';
            const results = await db.executeQuery(query, [email]);
            return results.length > 0;
        } catch (error) {
            console.error('Email check error:', error);
            return true; // Return true to be safe
        }
    }

    static async deleteById(id) {
        try {
            const query = 'DELETE FROM users WHERE id = ?';
            await db.executeQuery(query, [id]);
            return { success: true };
        } catch (error) {
            console.error('User delete error:', error);
            return { success: false, error: error.message };
        }
    }

    static async updateById(id, updateData) {
        try {
            const allowedFields = ['full_name', 'email', 'phone', 'role', 'status', 'commission_percentage', 'commission_fixed', 'commission_type'];
            const updates = [];
            const values = [];

            for (const [key, value] of Object.entries(updateData)) {
                if (allowedFields.includes(key) && value !== undefined) {
                    updates.push(`${key} = ?`);
                    values.push(value);
                }
            }

            if (updates.length === 0) {
                return { success: false, error: 'No valid fields to update' };
            }

            values.push(id);
            const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
            
            await db.executeQuery(query, values);
            return { success: true };
        } catch (error) {
            console.error('User updateById error:', error);
            return { success: false, error: error.message };
        }
    }

    static async promoteToExecutive(userId) {
        try {
            // Generate new password and reference code
            const newPassword = this.generatePassword(12);
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            const referenceCode = this.generateReferenceCode(8);

            const query = `
                UPDATE users 
                SET role = 'executive', password = ?, reference_code = ?, updated_at = NOW()
                WHERE id = ? AND role = 'user'
            `;
            
            const result = await db.executeQuery(query, [hashedPassword, referenceCode, userId]);
            
            if (result.affectedRows > 0) {
                return { 
                    success: true, 
                    password: newPassword, 
                    referenceCode: referenceCode 
                };
            } else {
                return { success: false, error: 'User not found or already promoted' };
            }
        } catch (error) {
            console.error('User promoteToExecutive error:', error);
            return { success: false, error: error.message };
        }
    }

    static async updateRole(userId, newRole) {
        try {
            // Generate password and reference code if promoting to executive
            let password = null;
            let referenceCode = null;
            
            if (newRole === 'executive') {
                password = this.generatePassword();
                referenceCode = this.generateReferenceCode();
                const hashedPassword = await bcrypt.hash(password, 10);
                
                // Update user with new role, password, and reference code
                const updateQuery = `
                    UPDATE users 
                    SET role = ?, password = ?, reference_code = ?
                    WHERE id = ?
                `;
                await db.executeQuery(updateQuery, [newRole, hashedPassword, referenceCode, userId]);
                
                // Note: Reference code will be added to reference_codes table in the admin route
            } else {
                // Just update role
                const updateQuery = 'UPDATE users SET role = ? WHERE id = ?';
                await db.executeQuery(updateQuery, [newRole, userId]);
            }

            return { 
                success: true, 
                password: password,
                referenceCode: referenceCode
            };
        } catch (error) {
            console.error('User updateRole error:', error);
            return { success: false, error: error.message };
        }
    }

    static async updateStatus(userId, status) {
        try {
            const query = 'UPDATE users SET status = ? WHERE id = ?';
            await db.executeQuery(query, [status, userId]);
            return { success: true };
        } catch (error) {
            console.error('User updateStatus error:', error);
            return { success: false, error: error.message };
        }
    }

    static generatePassword(length = 8) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    static generateReferenceCode(length = 8) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = 'REF-';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    static async getStats() {
        try {
            const totalUsersQuery = 'SELECT COUNT(*) as count FROM users';
            const activeUsersQuery = 'SELECT COUNT(*) as count FROM users WHERE status = "active"';
            const executivesQuery = 'SELECT COUNT(*) as count FROM users WHERE role = "executive"';
            
            const [totalUsers] = await db.executeQuery(totalUsersQuery);
            const [activeUsers] = await db.executeQuery(activeUsersQuery);
            const [executives] = await db.executeQuery(executivesQuery);

            return {
                total: totalUsers.count,
                active: activeUsers.count,
                executives: executives.count
            };
        } catch (error) {
            console.error('User getStats error:', error);
            return { total: 0, active: 0, executives: 0 };
        }
    }

    // Remove sensitive data for client side
    toJSON() {
        const userObj = { ...this };
        delete userObj.password;
        return userObj;
    }
}

module.exports = User; 
 