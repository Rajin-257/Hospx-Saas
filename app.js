const express = require('express');
const session = require('express-session');
const flash = require('express-flash');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Import database and email initialization
const db = require('./config/database');
const emailService = require('./services/emailService');

// Import routes
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const userRoutes = require('./routes/user');
const paymentRoutes = require('./routes/payment');
const apiRoutes = require('./routes/api');

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com", "https://stackpath.bootstrapcdn.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://code.jquery.com", "https://stackpath.bootstrapcdn.com", "https://cdn.jsdelivr.net"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));

app.use(cors());

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Set to true in production with HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

app.use(flash());

// Global variables for views
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    res.locals.error = req.flash('error');
    next();
});

// Routes
app.use('/', authRoutes);
app.use('/admin', adminRoutes);
app.use('/user', userRoutes);
app.use('/payment', paymentRoutes);
app.use('/api', apiRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).render('error', {
        title: '404 - Page Not Found',
        message: 'The page you are looking for does not exist.'
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error', {
        title: '500 - Internal Server Error',
        message: 'Something went wrong on our end.'
    });
});

const PORT = process.env.APP_PORT || 3000;

// Initialize database and start server
async function startServer() {
    try {
        // Initialize database
        await db.initializeDatabase();
        
        // Initialize email service
        await emailService.initialize();
        
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
            console.log(`Environment: ${process.env.APP_ENV || 'development'}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer(); 