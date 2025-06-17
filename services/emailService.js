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
    const subject = '🎉 Welcome to HospX Platform!';
    const htmlBody = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { 
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                    line-height: 1.6; 
                    color: #2d3748; 
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    padding: 20px;
                }
                .email-container { 
                    max-width: 560px; 
                    margin: 0 auto; 
                    background: #ffffff; 
                    border-radius: 16px; 
                    overflow: hidden; 
                    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                }
                .header { 
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                    padding: 40px 30px; 
                    text-align: center; 
                    position: relative;
                }
                .header::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="20" cy="20" r="2" fill="rgba(255,255,255,0.1)"/><circle cx="80" cy="40" r="1.5" fill="rgba(255,255,255,0.1)"/><circle cx="40" cy="70" r="1" fill="rgba(255,255,255,0.1)"/></svg>');
                }
                .header h1 { 
                    color: #ffffff; 
                    font-size: 28px; 
                    font-weight: 700; 
                    margin-bottom: 8px;
                    position: relative;
                    z-index: 1;
                }
                .header p { 
                    color: rgba(255, 255, 255, 0.9); 
                    font-size: 16px; 
                    position: relative;
                    z-index: 1;
                }
                .content { 
                    padding: 40px 30px; 
                }
                .welcome-text {
                    font-size: 18px;
                    color: #4a5568;
                    margin-bottom: 24px;
                    text-align: center;
                }
                .domain-card { 
                    background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%); 
                    padding: 24px; 
                    margin: 24px 0; 
                    border-radius: 12px; 
                    border-left: 4px solid #667eea;
                    position: relative;
                }
                .domain-card h3 { 
                    color: #2d3748; 
                    font-size: 18px; 
                    font-weight: 600; 
                    margin-bottom: 16px;
                    display: flex;
                    align-items: center;
                }
                .domain-card h3::before {
                    content: '🌐';
                    margin-right: 8px;
                }
                .detail-item { 
                    display: flex; 
                    justify-content: space-between; 
                    align-items: center;
                }
                .detail-label { 
                    font-weight: 500; 
                    color: #718096; 
                    font-size: 14px;
                }
                .detail-value { 
                    font-weight: 600; 
                    color: #2d3748; 
                    font-family: 'Monaco', 'Menlo', monospace;
                    border-radius: 6px;
                    font-size: 13px;
                    margin-left: 10px;
                    margin-top: 1px;
                }
                .status-badge {
                    display: inline-block;
                    background: linear-gradient(135deg, #ffd89b 0%, #19547b 100%);
                    color: #ffffff;
                    padding: 12px 24px;
                    border-radius: 25px;
                    font-weight: 600;
                    text-align: center;
                    margin: 24px 0;
                    font-size: 14px;
                }
                .footer { 
                    padding: 30px; 
                    text-align: center; 
                    background: #f7fafc;
                    border-top: 1px solid #e2e8f0;
                }
                .footer p { 
                    color: #718096; 
                    font-size: 14px; 
                    margin-bottom: 8px;
                }
                .brand { 
                    font-weight: 700; 
                    color: #667eea; 
                }
            </style>
        </head>
        <body>
            <div class="email-container">
                <div class="header">
                    <h1>Welcome to HospX!</h1>
                    <p>Your journey to better healthcare management starts here</p>
                </div>
                <div class="content">
                    <p class="welcome-text">Hello <strong>${userName}</strong>! 👋</p>
                    <p style="color: #4a5568; margin-bottom: 24px; text-align: center;">We're excited to have you on board. Your account has been created successfully and your domain is ready to use.</p>
                    
                    <div class="domain-card">
                        <h3 class="text-center">Your Domain Setup</h3>
                        <div class="detail-item">
                            <span class="detail-label">Website:</span>
                            <span class="detail-value">${domainName}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Username:</span>
                            <span class="detail-value">softadmin</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Password:</span>
                            <span class="detail-value">123</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Trial Period:</span>
                            <span class="detail-value">15 days</span>
                        </div>
                    </div>
                    
                    <div style="text-align: center;">
                        <a href="http://${domainName}/login" class="status-badge" style="text-decoration: none; color: #ffffff;">Access Hospital Dashboard →</a>
                    </div>
                    
                    <p style="color: #718096; font-size: 14px; text-align: center; margin-top: 24px;">If You Suffer Any Problem, Contact Our Support Team Anytime.</p>
                </div>
                <div class="footer">
                    <p>Best regards,</p>
                    <p class="brand">The HospX Team</p>
                </div>
            </div>
        </body>
        </html>
    `;
    
    return await sendEmail(userEmail, subject, htmlBody);
}

// Credentials email template
async function sendCredentialsEmail(userEmail, userName, password, referenceCode) {
    const subject = '🚀 Your HospX Account is Ready!';
    const htmlBody = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { 
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                    line-height: 1.6; 
                    color: #2d3748; 
                    background: linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%);
                    padding: 20px;
                }
                .email-container { 
                    max-width: 560px; 
                    margin: 0 auto; 
                    background: #ffffff; 
                    border-radius: 16px; 
                    overflow: hidden; 
                    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                }
                .header { 
                    background: linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%); 
                    padding: 40px 30px; 
                    text-align: center; 
                    position: relative;
                }
                .header::before {
                    content: '🎉';
                    position: absolute;
                    top: 20px;
                    right: 20px;
                    font-size: 24px;
                }
                .header h1 { 
                    color: #ffffff; 
                    font-size: 28px; 
                    font-weight: 700; 
                    margin-bottom: 8px;
                }
                .header p { 
                    color: rgba(255, 255, 255, 0.9); 
                    font-size: 16px; 
                }
                .content { 
                    padding: 40px 30px; 
                }
                .celebration-text {
                    font-size: 18px;
                    color: #4a5568;
                    margin-bottom: 24px;
                    text-align: center;
                }
                .credentials-card { 
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                    padding: 24px; 
                    margin: 24px 0; 
                    border-radius: 12px; 
                    color: #ffffff;
                    position: relative;
                    overflow: hidden;
                }
                .credentials-card::before {
                    content: '';
                    position: absolute;
                    top: -50%;
                    right: -50%;
                    width: 100%;
                    height: 100%;
                    background: radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px);
                    background-size: 20px 20px;
                    animation: float 20s linear infinite;
                }
                @keyframes float { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
                .credentials-card h3 { 
                    font-size: 18px; 
                    font-weight: 600; 
                    margin-bottom: 20px;
                    display: flex;
                    align-items: center;
                    position: relative;
                    z-index: 1;
                }
                .credentials-card h3::before {
                    content: '🔑';
                    margin-right: 8px;
                }
                .credential-item { 
                    background: rgba(255, 255, 255, 0.1); 
                    padding: 12px 16px; 
                    margin-bottom: 12px; 
                    border-radius: 8px; 
                    display: flex; 
                    justify-content: space-between; 
                    align-items: center;
                    position: relative;
                    z-index: 1;
                    backdrop-filter: blur(10px);
                }
                .credential-label { 
                    font-weight: 500; 
                    font-size: 14px;
                    opacity: 0.9;
                }
                .credential-value { 
                    font-weight: 600; 
                    font-family: 'Monaco', 'Menlo', monospace;
                    font-size: 14px;
                    margin-left: 10px;
                }
                .security-warning {
                    background: linear-gradient(135deg, #fed7d7 0%, #feb2b2 100%);
                    border: 1px solid #fc8181;
                    padding: 16px;
                    border-radius: 12px;
                    margin: 24px 0;
                    display: flex;
                    align-items: center;
                }
                .security-warning::before {
                    content: '⚠️';
                    margin-right: 12px;
                    font-size: 20px;
                }
                .security-warning p {
                    color:rgb(241, 231, 231);
                    font-weight: 500;
                    font-size: 14px;
                }
                .cta-button { 
                    display: inline-block;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                    color: #ffffff; 
                    padding: 16px 32px; 
                    text-decoration: none; 
                    border-radius: 50px; 
                    font-weight: 600;
                    font-size: 16px;
                    box-shadow: 0 10px 25px rgba(102, 126, 234, 0.3);
                    transition: transform 0.2s ease;
                }
                .cta-button:hover {
                    transform: translateY(-2px);
                }
                .footer { 
                    padding: 30px; 
                    text-align: center; 
                    background: #f7fafc;
                    border-top: 1px solid #e2e8f0;
                }
                .footer p { 
                    color: #718096; 
                    font-size: 14px; 
                    margin-bottom: 8px;
                }
                .brand { 
                    font-weight: 700; 
                    color: #667eea; 
                }
            </style>
        </head>
        <body>
            <div class="email-container">
                <div class="header">
                    <h1>Account Activated!</h1>
                    <p>You're all set to explore HospX Platform as Executive</p>
                </div>
                <div class="content">
                    <p class="celebration-text">Hello <strong>${userName}</strong>! 🎊</p>
                    <p style="color: #4a5568; margin-bottom: 24px; text-align: center;">Great news! Your account has been activated and you can now access all features of our platform.</p>
                    
                    <div class="credentials-card">
                        <h3>Your Login Credentials</h3>
                        <div class="credential-item">
                            <span class="credential-label">Email:</span>
                            <span class="credential-value" style="text-decoration: none;color: #ffffff;"> ${userEmail}</span>
                        </div>
                        <div class="credential-item">
                            <span class="credential-label">Password:</span>
                            <span class="credential-value"> ${password}</span>
                        </div>
                        <div class="credential-item">
                            <span class="credential-label">Reference Code:</span>
                            <span class="credential-value"> ${referenceCode}</span>
                        </div>
                    </div>
                    
                    <div class="security-warning">
                        <p>Please change your password after your first login for enhanced security.</p>
                    </div>
                    
                    <div style="text-align: center; margin-top: 32px;">
                        <a href="http://hospx.app/login" class="cta-button">Access Dashboard →</a>
                    </div>
                </div>
                <div class="footer">
                    <p>Best regards,</p>
                    <p class="brand">The HospX Team</p>
                </div>
            </div>
        </body>
        </html>
    `;
    
    return await sendEmail(userEmail, subject, htmlBody);
}

// Password reset email template
async function sendPasswordResetEmail(userEmail, userName, resetToken) {
    const subject = '🔐 Reset Your HospX Password';
    const resetUrl = `http://hospx.app/reset-password?token=${resetToken}`;
    
    const htmlBody = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { 
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                    line-height: 1.6; 
                    color: #2d3748; 
                    background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
                    padding: 20px;
                }
                .email-container { 
                    max-width: 560px; 
                    margin: 0 auto; 
                    background: #ffffff; 
                    border-radius: 16px; 
                    overflow: hidden; 
                    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                }
                .header { 
                    background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); 
                    padding: 40px 30px; 
                    text-align: center; 
                    position: relative;
                }
                .header::before {
                    content: '🔒';
                    position: absolute;
                    top: 20px;
                    right: 20px;
                    font-size: 24px;
                }
                .header h1 { 
                    color: #ffffff; 
                    font-size: 28px; 
                    font-weight: 700; 
                    margin-bottom: 8px;
                }
                .header p { 
                    color: rgba(255, 255, 255, 0.9); 
                    font-size: 16px; 
                }
                .content { 
                    padding: 40px 30px; 
                }
                .reset-text {
                    font-size: 18px;
                    color: #4a5568;
                    margin-bottom: 24px;
                    text-align: center;
                }
                .reset-card { 
                    background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%); 
                    padding: 24px; 
                    margin: 24px 0; 
                    border-radius: 12px; 
                    border-left: 4px solid #fa709a;
                    text-align: center;
                }
                .reset-card p {
                    color: #4a5568;
                    margin-bottom: 24px;
                    font-size: 16px;
                }
                .reset-button { 
                    display: inline-block;
                    background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); 
                    color: #ffffff; 
                    padding: 16px 32px; 
                    text-decoration: none; 
                    border-radius: 50px; 
                    font-weight: 600;
                    font-size: 16px;
                    box-shadow: 0 10px 25px rgba(250, 112, 154, 0.3);
                    transition: transform 0.2s ease;
                }
                .reset-button:hover {
                    transform: translateY(-2px);
                }
                .timer-warning {
                    background: linear-gradient(135deg, #fef5e7 0%, #fbd38d 100%);
                    border: 1px solid #f6ad55;
                    padding: 16px;
                    border-radius: 12px;
                    margin: 24px 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .timer-warning::before {
                    content: '⏰';
                    margin-right: 12px;
                    font-size: 20px;
                }
                .timer-warning p {
                    color: #744210;
                    font-weight: 600;
                    font-size: 14px;
                    text-align: center;
                }
                .security-note {
                    background: #f0fff4;
                    border-left: 4px solid #38a169;
                    padding: 16px;
                    border-radius: 0 12px 12px 0;
                    margin: 24px 0;
                }
                .security-note p {
                    color: #22543d;
                    font-size: 14px;
                    margin: 0;
                }
                .footer { 
                    padding: 30px; 
                    text-align: center; 
                    background: #f7fafc;
                    border-top: 1px solid #e2e8f0;
                }
                .footer p { 
                    color: #718096; 
                    font-size: 14px; 
                    margin-bottom: 8px;
                }
                .brand { 
                    font-weight: 700; 
                    color: #667eea; 
                }
            </style>
        </head>
        <body>
            <div class="email-container">
                <div class="header">
                    <h1>Password Reset</h1>
                    <p>Secure your account with a new password</p>
                </div>
                <div class="content">
                    <p class="reset-text">Hello <strong>${userName}</strong>! 🔑</p>
                    
                    <div class="reset-card">
                        <p>We received a request to reset your password for your HospX account. Click the button below to create a new password:</p>
                        <a href="${resetUrl}" class="reset-button">Reset Password →</a>
                    </div>
                    
                    <div class="timer-warning">
                        <p>This link expires in 1 hour for security</p>
                    </div>
                    
                    <div class="security-note">
                        <p><strong>Didn't request this?</strong> If you didn't ask to reset your password, you can safely ignore this email. Your password won't be changed until you access the link above and create a new one.</p>
                    </div>
                </div>
                <div class="footer">
                    <p>Best regards,</p>
                    <p class="brand">The HospX Team</p>
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