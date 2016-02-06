function Config(env) {
    env = env || process.env.NODE_ENV || 'development';

    /// Development and default options
    this.env = "DEVELOPMENT";

    this.privateBetaPassword = false;

    // The server listens on this port
    this.port = process.env.PORT || 3000;
    // The server listens on this port in order to redirect to HTTPS
    this.httpPort = process.env.HTTP_PORT || 3001;

    this.sessionMaxAge = 3600000;
    this.cookieSecret = 'There is none';

    this.rsaKey = 'rsaKey.pem';
    this.rsaKeyPassphrase = false;
    this.sslCertificate = 'sslCertificate.crt';

    // Database connection info
    this.db_host = 'localhost';
    this.db_port = '3306';
    this.db_username = 'root';
    this.db_password = '';
    this.db_database = 'phonjour';
    // sync-force database on start (NOTE: this will delete all tables)
    this.sync_db_on_start = true;
    // Add fixture data to the database
    this.add_db_fixture = true;

    // Credentials that shouldn't be checked in
    var credentials = require('./credentials');
    this.twilioSid = process.env.TWILIO_SID || credentials.twilioSid;
    this.twilioToken = process.env.TWILIO_TOKEN || credentials.twilioToken;
    this.stripePrivate = process.env.STRIPE_PRIVATE || credentials.stripeTestPrivate;
    this.stripePublic = process.env.STRIPE_PUBLIC || credentials.stripeTestPublic;
    // Sensitive credentials are used for API calls that cost money
    this.twilioSensitiveSid = process.env.TWILIO_TEST_SID || credentials.twilioTestSid;
    this.twilioSensitiveToken = process.env.TWILIO_TEST_TOKEN || credentials.twilioTestToken;
    this.testPhoneNumber = "+15005550006";

    this.phonjourOpsKey = process.env.PHONJOUR_OPS_KEY || credentials.phonjourOpsKey;
    this.phonjourMasterPassword = process.env.PHONJOUR_MASTER_PASSWORD || credentials.phonjourMasterPassword;
    this.twilioUrl = "https://www.phonjour.com/twilio";

    this.googleAnalyticsId = credentials.googleAnalyticsId;

    // Email settings
    this.awsMailerKeyId = process.env.AWS_MAILER_KEY_ID || credentials.awsMailerKeyId;
    this.awsMailerSecretKey = process.env.AWS_MAILER_SECRET_KEY || credentials.awsMailerSecretKey;
    this.emailRateLimit = 15;
    this.fromEmail = "Phonjour <admin@phonjour.com>";
    this.replyToEmail = "admin@phonjour.com";
    this.introductionEmailDelay = 1000*60*30;

    /// Production configurations go here
    if (env === 'production') {
        this.env = "PRODUCTION";
        this.db_uri = process.env.DATABASE_URL || this.db_uri;
        this.sync_db_on_start = false;
        this.add_db_fixture = false;

        this.db_host = 'DB HOST GOES HERE';
        this.db_port = '3306';
        this.db_username = 'phonjour';
        this.db_password = 'PASSWORD GOES HERE';
        this.db_database = 'phonjour';

        this.sslCABundle = 'sslCABundle.crt';

        // NOTE: Only in production are real credentials used for sensitive (money-costing) actions!
        this.twilioSensitiveSid = this.twilioSid;
        this.twilioSensitiveToken = this.twilioToken;

        // NOTE: Only in production, we work with real Stripe keys!
        this.stripePrivate = credentials.stripePrivate;
        this.stripePublic = credentials.stripePublic;
    }

    // Staging configurations go here
    if (!!process.env.STAGING) {
        this.env = "STAGING";
        this.db_host = 'DB GOES HERE';
        this.db_port = '3306';
        this.db_username = 'phonjour';
        this.db_password = 'PASSWORD GOES HERE';
        this.db_database = 'phonjour';
        this.sync_db_on_start = true;
        this.add_db_fixture = true;
    }

    return this;
}

module.exports = Config;
