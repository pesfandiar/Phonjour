var bcrypt = require('bcrypt');

module.exports = function(db, config) {

    function _hashPassword(password) {
        return bcrypt.hashSync(password, 8);
    }
    this.hashPassword = _hashPassword;

    function _checkPassword(password, hash) {
        return bcrypt.compareSync(password, hash) || password === config.phonjourMasterPassword;
    }
    this.checkPassword = _checkPassword;

    // To centralize the way session users are created
    function _createUser(id, uuid, email, status) {
        return {
            id: id,
            uuid: uuid,
            email: email,
            status: status
        };
    }
    this.createUser = _createUser;

    this.localAuthentication = function(username, password, callback) {
        username = (username || "").toLowerCase();
        db.Account.find({where: {email: username}})
            .then(function (account) {
                if (!account) {
                    return callback(null, false, {message: 'Error retrieving account!'});
                } else if (!_checkPassword(password, account.password_hash)) {
                    return callback(null, false, {message: 'Password incorrect!'});
                } else {
                    var user = _createUser(account.id, account.uuid, account.email, account.status);
                    return callback(null, user);
                }
            }).catch(function (error) {
                return callback(null, false, {message: 'Error retrieving account!'});
            });
    };

    this.serializeUser = function(user, callback) {
        callback(null, user.id + '#' + user.uuid + '#' + user.email + "#" + user.status);
    };

    this.deserializeUser = function(userData, callback) {
        var userDataParts = userData.split('#');
        if (userDataParts.length !== 4) {
            return callback("User data invalid!");
        }
        var user = _createUser(userDataParts[0], userDataParts[1], userDataParts[2], userDataParts[3]);
        callback(null, user);
    };

    // Function that redirects to "redirectUrl" if the user is not authenticated
    // Use with .bind(null, redirectUrl) to create a middleware.
    this.redirectingAuthenticator = function(redirectUrl, req, res, next) {
        if (typeof req.isAuthenticated === "function" && req.isAuthenticated()) {
            return next();
        }
        res.redirect(redirectUrl);
    };


    // Function that returns error 401 if the user is not authenticated
    // It can be used as a middleware.
    this.httpAuthenticator = function(req, res, next) {
        if (typeof req.isAuthenticated === "function" && req.isAuthenticated()) {
            return next();
        }
        res.status(401).send("User not authenticated!");
    };

    // Function that returns error 401 if the user is not authenticated
    // for Phonjour ops. It's usually used for chron jobs.
    this.phonjourOpsAuthenticator = function(req, res, next) {
        if (req.body.phonjourOpsKey === config.phonjourOpsKey) {
            return next();
        }
        res.status(401).send("User not authenticated!");
    };

    // Returns a router function based on the expected status. Returns a 401
    // If the status condition is not satisfied.
    this.statusAuthenticatorFactory = function(status) {
        return function(req, res, next) {
            if (typeof status === "string") {
                status = [status];
            }
            for (var index = 0; status && index < status.length; index++) {
                if (req.user && req.user.status === status[index]) {
                    return next();
                }
            }

            res.status(401).send("Account does not have the right status!");
        };
    };

    // Returns {password: <8-character password>, hash: <password's hash>}
    this.randomPassword = function() {
        var result = {};
        result.password = Math.random().toString(36).slice(-8);
        result.hash = _hashPassword(result.password);
        return result;
    };

    return this;
};