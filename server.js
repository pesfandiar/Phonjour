var express = require('express');
var fs = require('fs');
var http = require('http');
var https = require('https');
var app = express();
var config = require('./config')();
var utils = require('./utils/index');
var envLikeProduction = config.env === 'PRODUCTION' || config.env === 'STAGING';

// Middleware
var multer = require('multer');
var path = require('path');
var favicon = require('static-favicon');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var assetManager = require('connect-assets');
var session = require('express-session');
var passport = require('passport');
var passportLocalStrategy = require('passport-local').Strategy;

// Models and database
var db = require('./models/index');

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// Add middleware
app.use(favicon(__dirname + '/public/images/favicon.ico'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  extended: true
}));
app.use(multer({inMemory: true}));
app.use(cookieParser(config.cookieSecret));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(assetManager({
    build: envLikeProduction,
    buildDir: envLikeProduction ? 'builtAssets' : false,
    compress: envLikeProduction,
    fingerprinting: envLikeProduction
}));

// Authentication configuration
var authenticationUtils = utils.authentication(db, config);
var SessionStore = utils.SessionStore(db, config, session);
db.SessionStore = new SessionStore();
passport.use(new passportLocalStrategy(authenticationUtils.localAuthentication));
passport.serializeUser(authenticationUtils.serializeUser);
passport.deserializeUser(authenticationUtils.deserializeUser);
// Redirects unauthenticated requests to "/"
passport.redirectingAuthenticator = authenticationUtils.redirectingAuthenticator.bind(null, '/sign_in');
// Returns HTTP 401 if request is unauthenticated
passport.httpAuthenticator = authenticationUtils.httpAuthenticator;
// Takes an expected status and returns an HTTP authenticator based on that
passport.statusAuthenticatorFactory = authenticationUtils.statusAuthenticatorFactory;
app.use(session({
    cookie: {
        path: '/',
        secure: true,
        maxAge: config.sessionMaxAge
    },
    name: 'phonjour.sid',
    secret: config.cookieSecret,
    saveUninitialized: true,
    resave: true,
    store: db.SessionStore
}));
app.use(passport.initialize());
app.use(passport.session());
// Log in to a test account in development
if (config.env === 'DEVELOPMENT') {
    var firstRun = true;
    app.use(function (req, res, next) {
        if (firstRun) {
            var user = authenticationUtils.createUser(1, "48c2cd45-d778-476f-87ed-0d01c9ba2521", "smith@phonjour.com", "PURCHASED");
            firstRun = false;
            req.login(user, next);
        } else {
            next();
        }
    });
}

// Disable the Express HTTP header
app.disable('x-powered-by');

// Routes
var routes = require('./routes/index')(db, config, passport);

app.use('/', function(req, res, next) {
    if (req.secure) {
        return next();
    }
    var redirectAddress = "https://" + req.hostname;
    if (config.port != "443" && config.env === "development") {
        redirectAddress += ":" + config.port;
    }
    redirectAddress += req.url;
    res.redirect(redirectAddress);
});
app.use('/', routes.HomePage);
app.use('/api', routes.Apis);
app.use('/twilio', routes.Twilio);
app.use('/blog', routes.Blog);

/// Catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error("Requested URL not found: " + req.originalUrl);
    err.status = 404;
    next(err);
});

/// Error handlers start here

// Development error handler; will print stacktrace
if (config.env === 'DEVELOPMENT') {
    app.use(function(err, req, res) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// Production error handler; no stacktraces leaked to user
app.use(function(err, req, res) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});

/// Start the server
var serverOptions = {
    key: fs.readFileSync(config.rsaKey),
    cert: fs.readFileSync(config.sslCertificate)
};
if (config.rsaKeyPassphrase) {
    serverOptions.passphrase = config.rsaKeyPassphrase;
}
if (config.sslCABundle) {
    var chainLines = fs.readFileSync(config.sslCABundle, "utf8").split("\n");
    var certificate = [];
    serverOptions.ca = [];
    chainLines.forEach(function(line) {
        certificate.push(line);
        if (line.indexOf("END CERTIFICATE") > -1) {
            serverOptions.ca.push(certificate.join("\n"));
            certificate = [];
        }
    });
}
var server = https.createServer(serverOptions, app).listen(config.port);
console.log('Listening at https://%s:%s', server.address().address, server.address().port);
var httpServer = http.createServer(app).listen(config.httpPort);
console.log('Listening at http://%s:%s to redirect', httpServer.address().address, httpServer.address().port);

// END
