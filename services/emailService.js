const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

let transporter;

// Initialize email service (only once when application starts)
async function initialize() {
    try {
        if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
            console.log('SMTP configuration not found, email service disabled');
            return;
        }

        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT) || 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD
            }
        });

        // Verify connection
        await transporter.verify();
        console.log('SMTP server connected successfully');
    } catch (error) {
        console.error('SMTP connection error:', error);
        transporter = null;
    }
}

// Send email function
async function sendEmail(to, subject, htmlBody, textBody = null) {
    const emailId = uuidv4();
    
    try {
        if (!transporter) {
            throw new Error('Email service not initialized');
        }

        const mailOptions = {
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: to,
            subject: subject,
            html: htmlBody,
            text: textBody || htmlBody.replace(/<[^>]*>?/gm, '') // Strip HTML for text version
        };

        const result = await transporter.sendMail(mailOptions);
        
        // Log successful email
        await db.executeQuery(
            'INSERT INTO email_logs (id, to_email, subject, body, status) VALUES (?, ?, ?, ?, ?)',
            [emailId, to, subject, htmlBody, 'sent']
        );

        console.log('Email sent successfully to:', to);
        return { success: true, messageId: result.messageId };
    } catch (error) {
        // Log failed email
        await db.executeQuery(
            'INSERT INTO email_logs (id, to_email, subject, body, status, error_message) VALUES (?, ?, ?, ?, ?, ?)',
            [emailId, to, subject, htmlBody, 'failed', error.message]
        );

        console.error('Email sending error:', error);
        return { success: false, error: error.message };
    }
}

// Welcome email template
async function sendWelcomeEmail(userEmail, userName, domainName) {
    const subject = 'Welcome to HospX Platform!';
    const htmlBody = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #007bff; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; background: #f9f9f9; }
                .footer { padding: 20px; text-align: center; color: #666; }
                .domain-info { background: #e9ecef; padding: 15px; margin: 15px 0; border-radius: 5px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Welcome to HospX!</h1>
                </div>
                <div class="content">
                    <h2>Hello ${userName}!</h2>
                    <p>Thank you for registering with our platform. Your account has been created successfully.</p>
                    
                    <div class="domain-info">
                        <h3>Your Domain Details:</h3>
                        <p><strong>Domain:</strong> ${domainName}</p>
                        <p><strong>Database:</strong> A database has been created with 15 days validity</p>
                        <p><strong>Status:</strong> Active</p>
                    </div>
                    
                    <p>Your account is currently pending approval. Once an administrator assigns you a role, you will receive login credentials via email.</p>
                    
                    <p>If you have any questions, please contact our support team.</p>
                </div>
                <div class="footer">
                    <p>Best regards,<br>HospX Team</p>
                </div>
            </div>
        </body>
        </html>
    `;
    
    return await sendEmail(userEmail, subject, htmlBody);
}

// Credentials email template
async function sendCredentialsEmail(userEmail, userName, password, referenceCode) {
    const subject = 'Your Login Credentials - HospX Platform';
    const htmlBody = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #28a745; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; background: #f9f9f9; }
                .credentials { background: #e9ecef; padding: 15px; margin: 15px 0; border-radius: 5px; }
                .footer { padding: 20px; text-align: center; color: #666; }
                .important { color: #dc3545; font-weight: bold; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Account Activated!</h1>
                </div>
                <div class="content">
                    <h2>Hello ${userName}!</h2>
                    <p>Great news! Your account has been activated and you can now access our platform.</p>
                    
                    <div class="credentials">
                        <h3>Your Login Credentials:</h3>
                        <p><strong>Email:</strong> ${userEmail}</p>
                        <p><strong>Password:</strong> ${password}</p>
                        <p><strong>Reference Code:</strong> ${referenceCode}</p>
                    </div>
                    
                    <p class="important">Please change your password after your first login for security purposes.</p>
                    
                    <p>You can now log in to your dashboard and access all features.</p>
                    
                    <p><a href="${process.env.APP_URL || 'http://localhost:3000'}/login" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Login Now</a></p>
                </div>
                <div class="footer">
                    <p>Best regards,<br>HospX Team</p>
                </div>
            </div>
        </body>
        </html>
    `;
    
    return await sendEmail(userEmail, subject, htmlBody);
}

// Password reset email template
async function sendPasswordResetEmail(userEmail, userName, resetToken) {
    const subject = 'Password Reset Request - HospX Platform';
    const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
    
    const htmlBody = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #ffc107; color: #333; padding: 20px; text-align: center; }
                .content { padding: 20px; background: #f9f9f9; }
                .footer { padding: 20px; text-align: center; color: #666; }
                .warning { color: #dc3545; font-weight: bold; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Password Reset Request</h1>
                </div>
                <div class="content">
                    <h2>Hello ${userName}!</h2>
                    <p>We received a request to reset your password for your HospX account.</p>
                    
                    <p>Click the link below to reset your password:</p>
                    
                    <p><a href="${resetUrl}" style="background: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a></p>
                    
                    <p class="warning">This link will expire in 1 hour for security reasons.</p>
                    
                    <p>If you didn't request this password reset, please ignore this email or contact support if you have concerns.</p>
                </div>
                <div class="footer">
                    <p>Best regards,<br>HospX Team</p>
                </div>
            </div>
        </body>
        </html>
    `;
    
    return await sendEmail(userEmail, subject, htmlBody);
}

module.exports = {
    initialize,
    sendEmail,
    sendWelcomeEmail,
    sendCredentialsEmail,
    sendPasswordResetEmail
}; 