const User = require('../models/User');

// Check if user is authenticated
const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    }
    
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    req.flash('error_msg', 'Please log in to access this page');
    res.redirect('/login');
};

// Check if user is not authenticated (for login/register pages)
const isNotAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        return res.redirect('/dashboard');
    }
    next();
};

// Check if user has specific role
const hasRole = (...roles) => {
    return (req, res, next) => {
        if (!req.session || !req.session.user) {
            if (req.xhr || req.headers.accept.indexOf('json') > -1) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            req.flash('error_msg', 'Please log in to access this page');
            return res.redirect('/login');
        }

        if (!roles.includes(req.session.user.role)) {
            if (req.xhr || req.headers.accept.indexOf('json') > -1) {
                return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
            }
            req.flash('error_msg', 'Access denied. Insufficient permissions.');
            return res.redirect('/dashboard');
        }

        next();
    };
};

// Check if user is superadmin
const isSuperAdmin = hasRole('superadmin');

// Check if user is admin or superadmin
const isAdmin = hasRole('superadmin', 'admin');

// Check if user is executive or higher
const isExecutive = hasRole('superadmin', 'admin', 'executive');

// Check if user account is active
const isActiveUser = async (req, res, next) => {
    try {
        if (!req.session || !req.session.user) {
            if (req.xhr || req.headers.accept.indexOf('json') > -1) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            req.flash('error_msg', 'Please log in to access this page');
            return res.redirect('/login');
        }

        // Get fresh user data from database
        const user = await User.findById(req.session.user.id);
        
        if (!user) {
            req.session.destroy();
            if (req.xhr || req.headers.accept.indexOf('json') > -1) {
                return res.status(401).json({ error: 'User not found' });
            }
            req.flash('error_msg', 'User account not found');
            return res.redirect('/login');
        }

        if (user.status !== 'active') {
            req.session.destroy();
            if (req.xhr || req.headers.accept.indexOf('json') > -1) {
                return res.status(403).json({ error: 'Account has been deactivated' });
            }
            req.flash('error_msg', 'Your account has been deactivated. Please contact support.');
            return res.redirect('/login');
        }

        // Update session with fresh user data
        req.session.user = user.toJSON();
        next();
    } catch (error) {
        console.error('Active user check error:', error);
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.status(500).json({ error: 'Server error' });
        }
        req.flash('error_msg', 'An error occurred. Please try again.');
        res.redirect('/login');
    }
};

// Check if user has password (for users promoted to executive)
const hasPassword = (req, res, next) => {
    if (!req.session || !req.session.user) {
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        req.flash('error_msg', 'Please log in to access this page');
        return res.redirect('/login');
    }

    // Users without role or with 'user' role cannot login until promoted
    if (!req.session.user.role || req.session.user.role === 'user') {
        req.session.destroy();
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.status(403).json({ error: 'Account pending approval' });
        }
        req.flash('error_msg', 'Your account is pending approval. You will receive login credentials once approved.');
        return res.redirect('/login');
    }

    next();
};

// Combined middleware for authenticated and active users
const requireAuth = [isAuthenticated, isActiveUser, hasPassword];

// Middleware to set user in response locals
const setUserLocals = (req, res, next) => {
    res.locals.user = req.session ? req.session.user : null;
    next();
};

module.exports = {
    isAuthenticated,
    isNotAuthenticated,
    hasRole,
    isSuperAdmin,
    isAdmin,
    isExecutive,
    isActiveUser,
    hasPassword,
    requireAuth,
    setUserLocals
}; 