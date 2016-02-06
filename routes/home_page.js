var express = require('express');
var router = express.Router();

module.exports = function(db, config, passport) {
    // Inject local variables for renderer
    router.use(function(req, res, next) {
        res.locals.signedIn = false;
        if (req.user && req.user.email) {
            res.locals.userEmail = req.user.email;
            res.locals.userStatus = req.user.status;
            res.locals.signedIn = true;
        }
        if (config.googleAnalyticsId) {
            res.locals.googleAnalyticsId = config.googleAnalyticsId;
        }
        next();
    });

    router.get('/', function(req, res) {
        res.render('index');
    });

    router.get('/robots.txt', function(req, res) {
        res.send("User-agent: *\r\nDisallow: /\r\nUser-agent: Googlebot\r\nAllow: /\r\nUser-agent: Slurp\r\nAllow: /\r\nUser-Agent: msnbot\r\nDisallow: \r\nUser-Agent: Bingbot\r\nAllow: /");
    });

    router.get('/sign_up', function(req, res) {
        if (req.isAuthenticated()) {
            res.redirect('/dashboard');
            return;
        }
        if (!config.privateBetaPassword || config.privateBetaPassword === req.query.privateBetaPassword) {
            res.render('sign_up');
        } else {
            res.redirect('private_beta');
        }
    });

    router.get('/sign_in', function(req, res) {
        if (req.isAuthenticated()) {
            res.redirect('/dashboard');
            return;
        }
        res.render('sign_in');
    });

    router.get('/sign_out', function(req, res) {
        req.logout();
        res.redirect('/sign_in');
    });

    router.get('/forgot_password', function(req, res) {
        res.render('forgot_password');
    });

    router.get('/payment_setup', passport.redirectingAuthenticator, function(req, res) {
        if (req.user.status === "PURCHASED") {
            res.redirect('/payment_settings');
            return;
        }
        res.render('payment_setup', {stripePublic: config.stripePublic});
    });

    router.get('/select_phone_number', passport.redirectingAuthenticator, function(req, res) {
        if (req.user.status === "SIGNED_UP") {
            res.redirect('/payment_setup');
            return;
        }
        if (req.user.status !== "PAYMENT_ON_FILE") {
            res.redirect('/dashboard');
            return;
        }
        res.render('select_phone_number', {
            planInitialization: db.Plan.getFrontendInitialization(),
            promotionInitialization: db.Promotion.getFrontendInitialization()
        });
    });

    router.get('/dashboard', passport.redirectingAuthenticator, function(req, res) {
        if (req.user.status === "TERMINATED") {
            res.redirect('/sign_out');
            return;
        }
        res.render('dashboard');
    });

    router.get('/extensions', passport.redirectingAuthenticator, function(req, res) {
        res.render('extensions');
    });

    router.get('/extension_settings', passport.redirectingAuthenticator, function(req, res) {
        res.render('extension_settings');
    });

    router.get('/account_settings', passport.redirectingAuthenticator, function(req, res) {
        res.render('account_settings');
    });

    router.get('/billing', passport.redirectingAuthenticator, function(req, res) {
        res.render('billing');
    });

    router.get('/payment_settings', passport.redirectingAuthenticator, function(req, res) {
        if (req.user.status === "SIGNED_UP") {
            res.redirect('/payment_setup');
            return;
        }
        res.render('payment_settings', {stripePublic: config.stripePublic});
    });

    router.get('/plan_settings', passport.redirectingAuthenticator, function(req, res) {
        if (req.user.status !== "PURCHASED") {
            res.redirect('/select_phone_number');
            return;
        }
        res.render('plan_settings', {planInitialization: db.Plan.getFrontendInitialization()});
    });

    router.get('/terms', function(req, res) {
        res.render('terms');
    });

    router.get('/terminate', passport.redirectingAuthenticator, function(req, res) {
        res.render('terminate');
    });

    router.get('/private_beta', function(req, res) {
        if (!config.privateBetaPassword || req.isAuthenticated()) {
            res.redirect('/dashboard');
            return;
        }
        res.render('private_beta');
    });

    return router;
};
