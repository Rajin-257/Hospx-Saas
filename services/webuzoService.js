require('dotenv').config();
const https = require('https');
const qs = require('qs');

class WebuzoService {
    constructor() {
        this.user = process.env.WEBUZO_USER ;
        this.password = process.env.WEBUZO_PASSWORD ;
        this.host = process.env.WEBUZO_HOST;
        this.port = 2003;
    }

    // Helper method to make API requests
    async makeRequest(action, postData = {}) {
        return new Promise((resolve, reject) => {
            const auth = `${encodeURIComponent(this.user)}:${encodeURIComponent(this.password)}`;
            const url = `https://${auth}@${this.host}:${this.port}/index.php?api=json&act=${action}`;
            
            const postString = qs.stringify(postData);
            
            const options = {
                method: postData && Object.keys(postData).length > 0 ? 'POST' : 'GET',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(postString)
                },
                rejectUnauthorized: false
            };

            const req = https.request(url, options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        resolve(response);
                    } catch (error) {
                        reject(new Error('Invalid JSON response: ' + data));
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            if (postString) {
                req.write(postString);
            }
            
            req.end();
        });
    }

    // Add addon domain
    async addAddonDomain(domainName, domainPath = null) {
        try {
            const path = 'public_html';
            
            const postData = {
                add: '1',
                domain_type: 'addon',
                domain: domainName,
                domainpath: path,
                wildcard: 0,
                issue_lecert: 1
            };

            const response = await this.makeRequest('domainadd', postData);
            
            if (response.done) {
                return {
                    success: true,
                    message: response.done.msg || 'Domain added successfully',
                    data: response.done
                };
            } else {
                return {
                    success: false,
                    message: response.error || 'Failed to add domain',
                    error: response.error
                };
            }
        } catch (error) {
            console.error('Webuzo addAddonDomain error:', error);
            return {
                success: false,
                message: 'API request failed: ' + error.message,
                error: error.message
            };
        }
    }

    // Delete domain
    async deleteDomain(domainNames) {
        try {
            const domains = Array.isArray(domainNames)
                 ? domainNames.map(d => d.toLowerCase()).join(', ')
                 : domainNames.toLowerCase();
            console.log('domains', domains);

            
            const postData = {
                delete: domains
            };

            const response = await this.makeRequest('domainmanage', postData);
            
            if (response.done) {
                return {
                    success: true,
                    message: response.done.msg || 'Domain(s) deleted successfully',
                    data: response.done
                };
            } else {
                return {
                    success: false,
                    message: response.error || 'Failed to delete domain(s)',
                    error: response.error,
                    data: domains
                };
            }
        } catch (error) {
            console.error('Webuzo deleteDomain error:', error);
            return {
                success: false,
                message: 'API request failed: ' + error.message,
                error: error.message
            };
        }
    }

    // Create database
    async createDatabase(databaseName) {
        try {
            const postData = {
                submitdb: '1',
                db: databaseName
            };

            const response = await this.makeRequest('dbmanage', postData);
            
            if (response.done) {
                return {
                    success: true,
                    message: response.done.msg || 'Database created successfully',
                    data: response.done
                };
            } else {
                return {
                    success: false,
                    message: response.error || 'Failed to create database',
                    error: response.error
                };
            }
        } catch (error) {
            console.error('Webuzo createDatabase error:', error);
            return {
                success: false,
                message: 'API request failed: ' + error.message,
                error: error.message
            };
        }
    }

    // Add database user to database
    async addDatabaseUser(databaseName, databaseUser, host = 'localhost') {
        try {
            const privileges = {
                'SELECT': 'Y',
                'CREATE': 'Y',
                'INSERT': 'Y',
                'UPDATE': 'Y',
                'ALTER': 'Y',
                'DELETE': 'Y',
                'INDEX': 'Y',
                'CREATE_TEMPORARY_TABLES': 'Y',
                'EXECUTE': 'Y',
                'DROP': 'Y',
                'LOCK_TABLES': 'Y',
                'REFERENCES': 'Y',
                'CREATE_ROUTINE': 'Y',
                'ALTER_ROUTINE': 'Y',
                'EVENT': 'Y',
                'CREATE_VIEW': 'Y',
                'SHOW_VIEW': 'Y',
                'TRIGGER': 'Y'
            };

            const postData = {
                submitpri: '1',
                dbname: 'edusofto_' + databaseName,
                dbuser: 'edusofto_tenant',
                host: host,
                pri: privileges
            };

            const response = await this.makeRequest('dbmanage', postData);
            
            if (response.done) {
                return {
                    success: true,
                    message: response.done.msg || 'Database privileges updated successfully',
                    data: response.done
                };
            } else {
                return {
                    success: false,
                    message: response.error || 'Failed to add database user',
                    error: response.error
                };
            }
        } catch (error) {
            console.error('Webuzo addDatabaseUser error:', error);
            return {
                success: false,
                message: 'API request failed: ' + error.message,
                error: error.message
            };
        }
    }

    // Delete database
    async deleteDatabase(databaseNames) {
        try {
            const databases = Array.isArray(databaseNames) ? databaseNames.join(', ') : databaseNames;
            
            const postData = {
                delete_db: databases
            };

            const response = await this.makeRequest('dbmanage', postData);
            
            if (response.done) {
                return {
                    success: true,
                    message: response.done.msg || 'Database(s) deleted successfully',
                    data: response.done
                };
            } else {
                return {
                    success: false,
                    message: response.error || 'Failed to delete database(s)',
                    error: response.error
                };
            }
        } catch (error) {
            console.error('Webuzo deleteDatabase error:', error);
            return {
                success: false,
                message: 'API request failed: ' + error.message,
                error: error.message
            };
        }
    }

    // Create complete setup (domain + database with user)
    async createCompleteSetup(domainName, databaseName) {
        try {
            console.log(`Creating complete setup for domain: ${domainName}, database: ${databaseName}`);
            
            // Step 1: Add addon domain
            const domainResult = await this.addAddonDomain(domainName);
            if (!domainResult.success) {
                console.log('Domain creation failed, but continuing with database creation...');
            }

            // Step 2: Create database
            const dbResult = await this.createDatabase(databaseName);
            if (!dbResult.success) {
                return {
                    success: false,
                    message: 'Failed to create database: ' + dbResult.message,
                    domainResult,
                    dbResult
                };
            }

            // Step 3: Add existing user to database
            const userResult = await this.addDatabaseUser(databaseName, this.user);
            
            return {
                success: true,
                message: 'Complete setup created successfully',
                domainResult,
                dbResult,
                userResult
            };
        } catch (error) {
            console.error('Webuzo createCompleteSetup error:', error);
            return {
                success: false,
                message: 'Complete setup failed: ' + error.message,
                error: error.message
            };
        }
    }

    // Test API connection
    async testConnection() {
        try {
            const response = await this.makeRequest('domainadd');
            return {
                success: true,
                message: 'API connection successful',
                data: response
            };
        } catch (error) {
            console.error('Webuzo connection test failed:', error);
            return {
                success: false,
                message: 'API connection failed: ' + error.message,
                error: error.message
            };
        }
    }
}

module.exports = new WebuzoService(); 