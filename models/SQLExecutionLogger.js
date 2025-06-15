const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

class SQLExecutionLogger {
    constructor() {
        this.batchId = null;
        this.batchName = null;
        this.totalDatabases = 0;
        this.successfulDatabases = 0;
        this.failedDatabases = 0;
        this.pendingDatabases = 0;
        this.totalExecutionTime = 0;
    }

    // Generate a human-readable batch name
    _generateBatchName(sqlQuery) {
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
        const queryType = this._extractQueryType(sqlQuery);
        return `${queryType}_${timestamp}`;
    }

    // Extract query type from SQL
    _extractQueryType(sqlQuery) {
        const query = sqlQuery.trim().toLowerCase();
        if (query.startsWith('select')) return 'SELECT';
        if (query.startsWith('insert')) return 'INSERT';
        if (query.startsWith('update')) return 'UPDATE';
        if (query.startsWith('delete')) return 'DELETE';
        if (query.startsWith('create')) return 'CREATE';
        if (query.startsWith('alter')) return 'ALTER';
        if (query.startsWith('drop')) return 'DROP';
        return 'QUERY';
    }

    // Start a new execution batch
    async startBatch(sqlQuery, totalDatabases, executedBy) {
        try {
            this.batchId = uuidv4();
            this.batchName = this._generateBatchName(sqlQuery);
            this.totalDatabases = totalDatabases;
            this.pendingDatabases = totalDatabases;

            const id = uuidv4();
            const query = `
                INSERT INTO sql_execution_logs 
                (id, execution_batch_id, execution_batch_name, sql_query, total_databases, pending_databases, executed_by)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            
            await db.executeQuery(query, [
                id,
                this.batchId,
                this.batchName,
                sqlQuery,
                totalDatabases,
                totalDatabases,
                executedBy
            ]);

            return this.batchId;
        } catch (error) {
            console.error('Error starting batch:', error);
            throw error;
        }
    }

    // Log a successful execution
    async logSuccess(executionTimeMs) {
        try {
            this.successfulDatabases++;
            this.pendingDatabases--;
            this.totalExecutionTime += executionTimeMs;

            await this._updateBatchSummary();
            
        } catch (error) {
            console.error('Error logging success:', error);
            throw error;
        }
    }

    // Log an error execution (stores detailed error info)
    async logError(databaseName, sqlQuery, executionTimeMs, errorMessage, userName = '', domainName = '', executedBy = '') {
        try {
            this.failedDatabases++;
            this.pendingDatabases--;
            this.totalExecutionTime += executionTimeMs;

            // Insert detailed error into errors table
            const errorId = uuidv4();
            const errorQuery = `
                INSERT INTO sql_execution_errors 
                (id, execution_batch_id, execution_batch_name, database_name, sql_query, execution_time_ms, error_message, user_name, domain_name, executed_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            await db.executeQuery(errorQuery, [
                errorId,
                this.batchId,
                this.batchName,
                databaseName,
                sqlQuery,
                executionTimeMs,
                errorMessage,
                userName,
                domainName,
                executedBy
            ]);

            await this._updateBatchSummary();
        } catch (error) {
            console.error('Error logging error:', error);
            throw error;
        }
    }

    // Complete the batch execution
    async completeBatch() {
        try {
            const query = `
                UPDATE sql_execution_logs 
                SET status = 'completed', completed_at = CURRENT_TIMESTAMP
                WHERE execution_batch_id = ?
            `;
            
            await db.executeQuery(query, [this.batchId]);
        } catch (error) {
            console.error('Error completing batch:', error);
            throw error;
        }
    }

    // Stop batch execution early
    async stopBatch() {
        try {
            const query = `
                UPDATE sql_execution_logs 
                SET status = 'stopped', completed_at = CURRENT_TIMESTAMP
                WHERE execution_batch_id = ?
            `;
            
            await db.executeQuery(query, [this.batchId]);
        } catch (error) {
            console.error('Error stopping batch:', error);
            throw error;
        }
    }

    // Update batch summary statistics
    async _updateBatchSummary() {
        try {
            const avgExecutionTime = this.totalDatabases > 0 ? 
                Math.round(this.totalExecutionTime / (this.successfulDatabases + this.failedDatabases)) : 0;

            const query = `
                UPDATE sql_execution_logs 
                SET successful_databases = ?, failed_databases = ?, pending_databases = ?, 
                    avg_execution_time_ms = ?, total_execution_time_ms = ?
                WHERE execution_batch_id = ?
            `;
            
            await db.executeQuery(query, [
                this.successfulDatabases,
                this.failedDatabases,
                this.pendingDatabases,
                avgExecutionTime,
                this.totalExecutionTime,
                this.batchId
            ]);
        } catch (error) {
            console.error('Error updating batch summary:', error);
            throw error;
        }
    }

    // Get batch summary
    static async getBatchSummary(batchId) {
        try {
            const query = `
                SELECT * FROM sql_execution_logs 
                WHERE execution_batch_id = ?
            `;
            
            const results = await db.executeQuery(query, [batchId]);
            return results[0] || {};
        } catch (error) {
            console.error('Error getting batch summary:', error);
            throw error;
        }
    }

    // Get batch errors (detailed error information)
    static async getBatchErrors(batchId) {
        try {
            const query = `
                SELECT * FROM sql_execution_errors 
                WHERE execution_batch_id = ? 
                ORDER BY created_at ASC
            `;
            
            const results = await db.executeQuery(query, [batchId]);
            return results;
        } catch (error) {
            console.error('Error getting batch errors:', error);
            throw error;
        }
    }

    // Get recent execution batches
    static async getRecentBatches(limit = 10) {
        try {
            const query = `
                SELECT 
                    execution_batch_id,
                    execution_batch_name,
                    total_databases,
                    successful_databases,
                    failed_databases,
                    status,
                    started_at,
                    completed_at,
                    avg_execution_time_ms,
                    SUBSTRING(sql_query, 1, 100) as query_preview
                FROM sql_execution_logs 
                ORDER BY started_at DESC 
                LIMIT ?
            `;
            
            const results = await db.executeQuery(query, [limit]);
            return results;
        } catch (error) {
            console.error('Error getting recent batches:', error);
            throw error;
        }
    }

    // Get all error logs with pagination and filtering
    static async getErrorLogs(page = 1, limit = 20, filters = {}) {
        try {
            const offset = (page - 1) * limit;
            let whereConditions = [];
            let queryParams = [];

            // Build WHERE conditions
            if (filters.batch_name) {
                whereConditions.push('e.execution_batch_name LIKE ?');
                queryParams.push(`%${filters.batch_name}%`);
            }
            if (filters.database_name) {
                whereConditions.push('e.database_name LIKE ?');
                queryParams.push(`%${filters.database_name}%`);
            }
            if (filters.date_from) {
                whereConditions.push('DATE(e.created_at) >= ?');
                queryParams.push(filters.date_from);
            }
            if (filters.date_to) {
                whereConditions.push('DATE(e.created_at) <= ?');
                queryParams.push(filters.date_to);
            }

            const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

            // Get total count
            const countQuery = `
                SELECT COUNT(*) as total 
                FROM sql_execution_errors e 
                ${whereClause}
            `;
            const countResult = await db.executeQuery(countQuery, queryParams);
            const total = countResult[0].total;

            // Get paginated results
            const dataQuery = `
                SELECT 
                    e.*,
                    l.status as batch_status,
                    l.started_at as batch_started_at,
                    l.completed_at as batch_completed_at
                FROM sql_execution_errors e
                LEFT JOIN sql_execution_logs l ON e.execution_batch_id = l.execution_batch_id
                ${whereClause}
                ORDER BY e.created_at DESC 
                LIMIT ? OFFSET ?
            `;
            
            queryParams.push(limit, offset);
            const errors = await db.executeQuery(dataQuery, queryParams);

            return {
                errors,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            };
        } catch (error) {
            console.error('Error getting error logs:', error);
            throw error;
        }
    }

    // Get error statistics
    static async getErrorStats() {
        try {
            const query = `
                SELECT 
                    COUNT(*) as total_errors,
                    COUNT(DISTINCT execution_batch_id) as affected_batches,
                    COUNT(DISTINCT database_name) as affected_databases,
                    DATE(created_at) as error_date,
                    COUNT(*) as daily_errors
                FROM sql_execution_errors 
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                GROUP BY DATE(created_at)
                ORDER BY error_date DESC
                LIMIT 30
            `;
            
            const dailyStats = await db.executeQuery(query);

            const summaryQuery = `
                SELECT 
                    COUNT(*) as total_errors,
                    COUNT(DISTINCT execution_batch_id) as total_affected_batches,
                    COUNT(DISTINCT database_name) as total_affected_databases,
                    AVG(execution_time_ms) as avg_error_time
                FROM sql_execution_errors
            `;
            
            const summaryResult = await db.executeQuery(summaryQuery);

            return {
                summary: summaryResult[0],
                daily: dailyStats
            };
        } catch (error) {
            console.error('Error getting error stats:', error);
            throw error;
        }
    }

    // Get all execution statistics
    static async getExecutionStats() {
        try {
            const query = `
                SELECT 
                    COUNT(*) as total_executions,
                    SUM(total_databases) as total_databases_processed,
                    SUM(successful_databases) as total_successful,
                    SUM(failed_databases) as total_failed,
                    AVG(avg_execution_time_ms) as overall_avg_time,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_batches,
                    COUNT(CASE WHEN status = 'running' THEN 1 END) as running_batches
                FROM sql_execution_logs
            `;
            
            const results = await db.executeQuery(query);
            return results[0] || {};
        } catch (error) {
            console.error('Error getting execution stats:', error);
            throw error;
        }
    }

    // Delete old logs (cleanup)
    static async cleanupOldLogs(daysOld = 30) {
        try {
            const query = `
                DELETE FROM sql_execution_logs 
                WHERE started_at < DATE_SUB(NOW(), INTERVAL ? DAY)
            `;
            
            const result = await db.executeQuery(query, [daysOld]);
            return result.affectedRows;
        } catch (error) {
            console.error('Error cleaning up old logs:', error);
            throw error;
        }
    }
}

module.exports = SQLExecutionLogger; 