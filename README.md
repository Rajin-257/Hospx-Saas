# Hospx SaaS Platform

A comprehensive Node.js SaaS platform for domain and database management with Webuzo API integration.

## Features Implemented

### Core Features
- Static landing page with 1000 BDT subscription
- User registration with domain/email validation  
- Reference code validation system
- Webuzo API integration for domain/database creation
- Role-based authentication (SuperAdmin/Admin/Executive/User)
- Email notification system with SMTP
- Payment processing with bKash/Nagad support
- Commission tracking system
- Database expiry management

### User Management
- SuperAdmin with full system access
- User role promotion with auto-generated credentials
- Active/Inactive status management
- Complete CRUD operations

### Dashboard Features
- Admin: Users, Databases, Payments, Revenue stats
- Executive: Associated databases and commission reports
- Recent payments and expiring databases tables

### Payment & Commission
- Multiple payment methods
- Automatic commission calculation (percentage + fixed)
- Payment and commission reports
- Monthly renewal system

## Installation

1. Clone repository and install dependencies:

```bash
npm install
```

2. Create .env file (copy from config/env.example)
3. Configure database and SMTP settings
4. Start application:

```bash
npm start
```

## Default Login
- Email: admin@webuzo-saas.com
- Password: admin123

## Technology Stack
- Node.js + Express
- MySQL with mysql2
- EJS templating
- Webuzo API integration
- Email service with Nodemailer
- UUID for unique identifiers
- bcryptjs for security

## API Integration
Uses Webuzo API for:
- Domain creation/deletion
- User privilege assignment

## Project Structure
- MVC architecture
- Middleware for authentication
- Services for external APIs
- Professional code organization 

## Database management
- Initial Sql Upload
- Single or bulk Database Selection
- Query Execution


For More Info Cheak Crud_Enhancements!-------