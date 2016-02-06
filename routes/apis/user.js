var express = require('express');
var router = express.Router();
var utils = require('../../utils/index');
var uuidGenerator = require('node-uuid');
var moment = require('moment');


var PASSWORD_MIN_LEN = 8;

module.exports = function(db, config, passport) {
    var twilio = require('twilio');
    var twilioClient = twilio(config.twilioSid, config.twilioToken);
    var twilioSensitiveClient = twilio(config.twilioSensitiveSid, config.twilioSensitiveToken);

    var authenticationUtils = utils.authentication(db, config);
    var mailer = utils.mailer(db, config);

    router.post('/signUp', function(req, res) {
        var name = req.body.name;
        var email = req.body.email;
        var phone = req.body.phone;
        var company = req.body.company;
        var timezone = req.body.timezone;
        var password = req.body.password;

        if (!name || !email || !password || !timezone) {
            res.status(403).send("Required fields not provided!");
            return;
        }

        email = email.toLowerCase();

        if (password.length < PASSWORD_MIN_LEN) {
            res.status(403).send("Password too short!");
            return;
        }

        db.Account.find({where: {email: email}})
            .then(function (account) {
                if (account) {
                    res.status(409).send("Email already in use!");
                    return;
                }
                var hash = authenticationUtils.hashPassword(password);
                var uuid = uuidGenerator.v4();
                db.Account.create({
                    name: name,
                    email: email,
                    phone: phone,
                    company: company,
                    timezone: timezone,
                    password_hash: hash,
                    uuid: uuid,
                    status: "SIGNED_UP"
                }).then(function(account) {
                    var user = authenticationUtils.createUser(account.id, uuid, email, account.status);
                    req.login(user, function(error) {
                        if (error) {
                            return res.status(500).send("Unable to log in!");
                        }

                        return db.PhoneNumber.upsert({
                                        AccountId: req.user.id,
                                        friendly_name: "Not Purchased Yet",
                        }).then(function (result) {
                            return db.PhoneNumber.findOne({where: {AccountId: req.user.id}});
                        }).then(function (result) {
                            phoneNumberId = result.id;
                            return db.Extension.upsert({
                                        PhoneNumberId: phoneNumberId,
                                        main: true
                                    });
                        }).then(function (result) {
                            return db.Extension.findOne({where: {PhoneNumberId: phoneNumberId, main: true}});
                        }).then(function (result) {
                            extensionId = result.id;
                            return db.Greeting.bulkCreate([{
                                            ExtensionId: extensionId,
                                            type: "T2S",
                                            text: db.Greeting.defaultOpenGreeting(),
                                            open: true
                                        }, {
                                            ExtensionId: extensionId,
                                            type: "T2S",
                                            text: db.Greeting.defaultClosedGreeting(),
                                            open: false
                                        }
                                    ], {ignoreDuplicates: true});
                        }).then(function (result) {
                            var startTime = 36; // 9:00
                            var endTime = 68; // 17:00
                            return db.Schedule.bulkCreate([{
                                            ExtensionId: extensionId,
                                            start_time: startTime,
                                            end_time: endTime,
                                            open: true,
                                            day_of_week: 0
                                        }, {
                                            ExtensionId: extensionId,
                                            start_time: startTime,
                                            end_time: endTime,
                                            open: true,
                                            day_of_week: 1
                                        }, {
                                            ExtensionId: extensionId,
                                            start_time: startTime,
                                            end_time: endTime,
                                            open: true,
                                            day_of_week: 2
                                        }, {
                                            ExtensionId: extensionId,
                                            start_time: startTime,
                                            end_time: endTime,
                                            open: true,
                                            day_of_week: 3
                                        }, {
                                            ExtensionId: extensionId,
                                            start_time: startTime,
                                            end_time: endTime,
                                            open: true,
                                            day_of_week: 4
                                        }
                                    ], {ignoreDuplicates: true});
                        }).then(function (result) {
                            if (config.introductionEmailDelay !== null) {
                                setTimeout(function() {
                                    mailer.sendEmail(email,
                                                        "Welcome to Phonjour!",
                                                        {
                                                            name: name
                                                        },
                                                        "welcome_html",
                                                        "welcome_text");
                                }, config.introductionEmailDelay);
                            }

                            res.send({user: user});
                        }).catch(function(error) {
                            res.status(403).send("Unable to populate user data!");
                        });
                    });
                }).catch(function(error) {
                    res.status(403).send("Unable to save data!");
                });
            })
            .catch(function(error) {
                res.status(500).send("Unable to retrieve data!");
            });
    });


    router.post('/signIn', passport.authenticate('local'), function(req, res) {
        db.Account.find(req.user.id)
            .then(function(account) {
                var redirectUrl = "/dashboard";
                switch(account.status) {
                    case "SIGNED_UP":
                        redirectUrl = "/payment_setup";
                        break;
                    case "PAYMENT_ON_FILE":
                        redirectUrl = "/select_phone_number";
                        break;
                    case "PURCHASED":
                        redirectUrl = "/dashboard";
                        break;
                    case "TERMINATED":
                        req.logout();
                        res.status(401).send("Account terminated! Please create another account.");
                        return;
                }
                res.send({redirectUrl: redirectUrl});
            }).catch(function(error) {
                res.status(500).send("Error retrieving user info!");
            });
    });


    router.post('/forgotPassword', function(req, res) {
        var email = req.body.email;

        if (!email) {
            res.status(403).send("Required field not provided!");
            return;
        }

        email = email.toLowerCase();

        db.Account.find({where: {email: email}})
            .then(function (account) {
                // Do not reveal the account doesn't exist!
                if (!account) {
                    res.send({successful: true});
                    return;
                }
                var randomPassword = authenticationUtils.randomPassword();
                var password = randomPassword.password;
                var hash = randomPassword.hash;

                account.updateAttributes({
                    password_hash: hash
                }).then(function(account) {
                    return mailer.sendEmail(account.email,
                                            "Your Password Was Reset",
                                            {
                                                name: account.name,
                                                password: password
                                            },
                                            "password_reset_html",
                                            "password_reset_text");
                }).then(function(emailResult) {
                    res.send({successful: true});
                }).catch(function(error) {
                    res.status(403).send("Unable to reset password and send email!");
                });
            })
            .catch(function(error) {
                res.status(500).send("Unable to retrieve data!");
            });
    });


    router.post('/getSettings', passport.httpAuthenticator, function(req, res) {
        db.Account.find(req.user.id)
            .then(function (account) {
                if (account) {
                    var settings = {
                        name: account.name,
                        email: account.email,
                        phone: account.phone,
                        company: account.company,
                        timezone: account.timezone
                    };
                    res.send({settings: settings});
                } else {
                    throw new Error("No account found!");
                }
            })
            .catch(function(error) {
                res.status(500).send("Unable to retrieve data!");
            });
    });


    router.post('/saveSettings', passport.httpAuthenticator, function(req, res) {
        var name = req.body.name;
        var email = req.body.email;
        var phone = req.body.phone;
        var company = req.body.company;
        var timezone = req.body.timezone;

        if (!name || !email || !phone || !timezone) {
            res.status(403).send("Required fields not provided!");
            return;
        }

        email = email.toLowerCase();

        var updatedSettings = {
            name: name,
            email: email,
            phone: phone,
            company: company,
            timezone: timezone
        };

        db.Account.findOne({
                                where: {
                                    email: email,
                                    id: {$ne: req.user.id}
                                }
                            })
            .then(function (account) {
                if (account) {
                    throw new Error("Email already exists!");
                }

                return db.Account.update(updatedSettings, {where: {id: req.user.id}});
            })
            .then(function (result) {
                if (!result || !result.length && !result[0]) {
                    res.status(500).send("Was not able to save settings!");
                    return;
                }
                res.send({settings: updatedSettings});
            })
            .catch(function(error) {
                res.status(500).send("Unable to save data!");
            });
    });


    router.post('/changePassword', passport.httpAuthenticator, function(req, res) {
        var oldPassword = req.body.oldPassword;
        var password = req.body.password;

        if (!password || !oldPassword) {
            res.status(403).send("Required fields not provided!");
            return;
        }

        if (password.length < PASSWORD_MIN_LEN) {
            res.status(403).send("Password too short!");
            return;
        }

        authenticationUtils.localAuthentication(req.user.email, oldPassword, function(dummy, user, error) {
            if (error) {
                res.status(401).send(error.message);
                return;
            }

            var hash = authenticationUtils.hashPassword(password);

            db.Account.update({password_hash: hash}, {where: {id: req.user.id}})
                .then(function (result) {
                    if (!result || !result.length && !result[0]) {
                        res.status(500).send("Was not able to change password!");
                        return;
                    }
                    res.send({success: true});
                })
                .catch(function(error) {
                    res.status(500).send("Unable to change password!");
                });
        });
    });

    router.post('/terminate', passport.httpAuthenticator, passport.statusAuthenticatorFactory("PURCHASED"), function(req, res) {
        var password = req.body.password;
        var reason = req.body.reason;
        var agreeToTerms = req.body.agreeToTerms;

        if (!password || !agreeToTerms) {
            res.status(403).send("Required fields not provided!");
            return;
        }

        if (password.length < PASSWORD_MIN_LEN) {
            res.status(403).send("Password too short!");
            return;
        }

        var now = new moment();
        var plan, phoneNumnber, account, terminationDate;

        authenticationUtils.localAuthentication(req.user.email, password, function(dummy, user, error) {
            if (error) {
                res.status(401).send(error.message);
                return;
            }

            db.Account.find({
                        where: {id: req.user.id},
                        include: [
                            {
                                model: db.Plan,
                                where: db.Sequelize.and(
                                    {AccountId: req.user.id},
                                    {start_date: {$lte: now.toDate()}},
                                    db.Sequelize.or(
                                        {end_date: null},
                                        {end_date: {$gt: now.toDate()}}
                                    )
                                ),
                                order: "start_date DESC",
                                limit: 1
                            },
                            {
                                model: db.PhoneNumber
                            }
                        ]
                })
                .then(function (result) {
                    account = result;
                    if (!account || !account.Plans || !account.Plans.length || !account.PhoneNumber) {
                        throw new Error("Was not able to terminate the account! Please contact us.");
                    }

                    plan = account.Plans[0];
                    phoneNumber = account.PhoneNumber;

                    return account.updateAttributes({
                        status: "TERMINATED",
                        note: account.note + "<reason>" + reason + "</reason>"
                    });
                })
                .then(function (result) {
                    terminationDate = utils.getNextPlanStartDate(plan.start_date, now);
                    return plan.updateAttributes({
                        end_date: terminationDate.toDate()
                    });
                })
                .then(function (result) {
                    // Fire and forget email
                    mailer.sendEmail(account.email,
                                        "Your Phonjour Account Was Terminated",
                                        {
                                            name: account.name,
                                            phoneNumber: phoneNumber.friendly_name,
                                            terminationDate: terminationDate.format("MMM DD, YYYY")
                                        },
                                        "terminate_html",
                                        "terminate_text");

                    return twilioSensitiveClient.incomingPhoneNumbers(phoneNumber.sid).delete(function(error) {
                        if (error) {
                            res.send({success: true});
                            // TODO: The number was not released. Panic!
                        } else {
                            res.send({success: true});
                        }
                    });
                })
                .catch(function(error) {
                    res.status(500).send("Unable to terminate account! Please contact us.");
                });
        });
    });

    return router;
};
