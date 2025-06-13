const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Database connection configuration
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'webuzo_saas',
    multipleStatements: true
};

let connection;

// Initialize database connection
async function initializeDatabase() {
    try {
        // Create connection without database first
        const tempConnection = await mysql.createConnection({
            host: dbConfig.host,
            user: dbConfig.user,
            password: dbConfig.password
        });

        // Create database if not exists
        await tempConnection.execute(`CREATE DATABASE IF NOT EXISTS ${dbConfig.database}`);
        await tempConnection.end();

        // Connect to the database
        connection = await mysql.createConnection(dbConfig);
        console.log('Connected to MySQL database successfully');

        // Create tables
        await createTables();
        
        // Create default superadmin
        await createSuperAdmin();

    } catch (error) {
        console.error('Database initialization error:', error);
        throw error;
    }
}

async function createTables() {
    const tables = [
        // Users table
        `CREATE TABLE IF NOT EXISTS users (
            id VARCHAR(36) PRIMARY KEY,
            full_name VARCHAR(255) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            phone VARCHAR(20) NOT NULL,
            password VARCHAR(255),
            role ENUM('superadmin', 'admin', 'executive', 'user') DEFAULT 'user',
            status ENUM('active', 'inactive') DEFAULT 'active',
            reference_code VARCHAR(50),
            referred_by VARCHAR(36),
            commission_percentage DECIMAL(5,2) DEFAULT 10.00,
            commission_fixed DECIMAL(10,2) DEFAULT 50.00,
            commission_type ENUM('percentage', 'fixed') DEFAULT 'percentage',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )`,

        // Reference codes table
        `CREATE TABLE IF NOT EXISTS reference_codes (
            id VARCHAR(36) PRIMARY KEY,
            code VARCHAR(50) UNIQUE NOT NULL,
            user_id VARCHAR(36) NOT NULL,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,

        // Domains table
        `CREATE TABLE IF NOT EXISTS domains (
            id VARCHAR(36) PRIMARY KEY,
            domain_name VARCHAR(255) UNIQUE NOT NULL,
            user_id VARCHAR(36) NOT NULL,
            database_name VARCHAR(255),
            expiry_date DATE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            domain_type ENUM('subdomain', 'custom') NOT NULL,
            status ENUM('active', 'expired', 'suspended') DEFAULT 'active',
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,

        // Databases table
        `CREATE TABLE IF NOT EXISTS \`databases\` (
            id VARCHAR(36) PRIMARY KEY,
            database_name VARCHAR(255) UNIQUE NOT NULL,
            user_id VARCHAR(36) NOT NULL,
            domain_id VARCHAR(36),
            expiry_date DATE NOT NULL,
            last_renewed DATE DEFAULT (CURRENT_DATE),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status ENUM('active', 'expired', 'suspended') DEFAULT 'active',
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE SET NULL
        )`,

        // Payments table
        `CREATE TABLE IF NOT EXISTS payments (
            id VARCHAR(36) PRIMARY KEY,
            user_id VARCHAR(36) NOT NULL,
            amount DECIMAL(10,2) NOT NULL,
            currency VARCHAR(3) DEFAULT 'BDT',
            payment_method ENUM('bkash', 'nagad', 'bank', 'card') NOT NULL,
            transaction_id VARCHAR(255),
            status ENUM('pending', 'completed', 'failed', 'cancelled') DEFAULT 'pending',
            payment_type ENUM('subscription', 'renewal') NOT NULL,
            reference_data JSON,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,

        // Commissions table
        `CREATE TABLE IF NOT EXISTS commissions (
            id VARCHAR(36) PRIMARY KEY,
            user_id VARCHAR(36) NOT NULL,
            referred_user_id VARCHAR(36) NOT NULL,
            payment_id VARCHAR(36) NOT NULL,
            commission_amount DECIMAL(10,2) NOT NULL,
            commission_type ENUM('percentage', 'fixed') NOT NULL,
            status ENUM('pending', 'paid', 'cancelled') DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            paid_at TIMESTAMP NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (referred_user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE
        )`,

        // Email logs table
        `CREATE TABLE IF NOT EXISTS email_logs (
            id VARCHAR(36) PRIMARY KEY,
            to_email VARCHAR(255) NOT NULL,
            subject VARCHAR(500) NOT NULL,
            body TEXT,
            status ENUM('sent', 'failed') NOT NULL,
            error_message TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,

        // System settings table
        `CREATE TABLE IF NOT EXISTS system_settings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            setting_key VARCHAR(255) UNIQUE NOT NULL,
            setting_value TEXT,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )`
    ];

    // Create each table individually
    for (let i = 0; i < tables.length; i++) {
        try {
            await connection.execute(tables[i]);
        } catch (error) {
            console.error(`Error creating table ${i + 1}:`, error.message);
            throw error;
        }
    }

    // Add foreign key constraints after all tables are created
    try {
        await connection.execute(`
            ALTER TABLE users 
            ADD CONSTRAINT fk_users_referred_by 
            FOREIGN KEY (referred_by) REFERENCES users(id) ON DELETE SET NULL
        `);
    } catch (error) {
        // Ignore if constraint already exists
        if (!error.message.includes('Duplicate key name')) {
            //console.log('Foreign key constraint may already exist');
        }
    }

    // Add commission_type column if it doesn't exist (for existing installations)
    try {
        await connection.execute(`
            ALTER TABLE users 
            ADD COLUMN commission_type ENUM('percentage', 'fixed') DEFAULT 'percentage'
        `);
    } catch (error) {
        // Ignore if column already exists
        if (!error.message.includes('Duplicate column name')) {
            console.log('Commission type column may already exist');
        }
    }

}

async function createSuperAdmin() {
    try {
        // Check if superadmin already exists
        const [existingAdmin] = await connection.execute(
            'SELECT id FROM users WHERE role = ? LIMIT 1',
            ['superadmin']
        );

        if (existingAdmin.length === 0) {
            const adminId = uuidv4();
            const hashedPassword = await bcrypt.hash('admin123', 10);
            
            await connection.execute(
                `INSERT INTO users (id, full_name, email, phone, password, role, status,reference_code,commission_percentage) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [adminId, 'Super Administrator', 'admin@webuzo-saas.com', '+8801700000000', hashedPassword, 'superadmin', 'active','ABC123',100.00]
            );
            await connection.execute(
                `INSERT INTO reference_codes (id,code,user_id,is_active)
                 Values(?,?,?,?)`,
                 [uuidv4(),'ABC123',adminId,1]
            );
        }
    } catch (error) {
        console.error('Error creating superadmin:', error);
    }
}

// Get database connection
function getConnection() {
    return connection;
}

// Execute query helper
async function executeQuery(sql, params = []) {
    try {
        const [results] = await connection.execute(sql, params);
        return results;
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    }
}

module.exports = {
    initializeDatabase,
    getConnection,
    executeQuery
}; 