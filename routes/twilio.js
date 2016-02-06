var express = require('express');
var router = express.Router();
var utils = require('../utils/index');
var moment = require('moment-timezone');

module.exports = function(db, config) {
    var twilio = require('twilio');
    var twilioClient = twilio(config.twilioSid, config.twilioToken);
    var twilioUrl = utils.twilioUrl(db, config);
    var mailer = utils.mailer(db, config);

    var VOICE_SETTINGS = {
                    voice: 'woman',
                    language: 'en-us'
                };
    var VOICEMAIL_MAX_LENGTH = 300; // seconds

    function authenticateRequest(uuid, accountSid, twilioNumber) {
        if (accountSid !== config.twilioSid) {
            throw new Error("Authentication failed!");
        }

        return db.Account.find({
                            where: {
                                uuid: uuid
                            },
                            include: [
                                        {
                                            model: db.PhoneNumber,
                                            where: {number: twilioNumber}
                                        }
                                    ]
                        })
                .then(function (account) {
                    if (!account || !account.PhoneNumber || !account.PhoneNumber.number) {
                        throw new Error("Authentication failed!");
                    }
                    if (!account.isFunctional()) {
                        throw new Error("This account is not functional!");
                    }

                    return account;
                });
    }

    router.post('/init/:uuid', function(req, res) {
        var uuid = req.params.uuid;
        var accountSid = req.body.AccountSid;
        var toNumber = req.body.To;
        var phoneNumberId, mainExtension, timezoneOffset;

        authenticateRequest(uuid, accountSid, toNumber)
            .then(function (account) {
                phoneNumberId = account.PhoneNumber.id;
                timezoneOffset = utils.getTimezoneOffset(account.timezone);

                return db.PhoneNumber.find({
                            where: {id: phoneNumberId},
                            include: [
                                        {
                                            model: db.Extension,
                                            where: {main: true},
                                            include: [
                                                {
                                                    model: db.Schedule
                                                },
                                                {
                                                    model: db.Greeting
                                                }
                                            ]
                                        }
                                    ]
                        });
            })
            .then(function (phoneNumber) {
                if (!phoneNumber || !phoneNumber.Extensions || !phoneNumber.Extensions.length) {
                    throw new Error("Main extension and greeting not defined!");
                }
                mainExtension = phoneNumber.Extensions[0];

                var isOpen = !phoneNumber.do_not_disturb && mainExtension.isOpen(-timezoneOffset);
                var greeting = null;
                for (var i = 0; !greeting && i < mainExtension.Greetings.length; i++) {
                    if (mainExtension.Greetings[i].open === isOpen) {
                        greeting = mainExtension.Greetings[i].text;
                    }
                }

                if (!greeting || !greeting.length) {
                    greeting = "No greeting message was recorded on the system.";
                }

                var twiml = new twilio.TwimlResponse();

                if (isOpen) {
                    twiml.gather({
                        action: twilioUrl.extension(uuid),
                        finishOnKey: "#",
                        timeout: 30
                    }, function(twiml) {
                        twiml.say(greeting, VOICE_SETTINGS);
                    });
                    twiml.say("Sorry. We did not receive any signal from your phone. Goodbye!", VOICE_SETTINGS);
                } else {
                    twiml.say(greeting, VOICE_SETTINGS);
                    if (mainExtension.voicemail) {
                        twiml.record({
                            action: twilioUrl.record(uuid),
                            maxLength: VOICEMAIL_MAX_LENGTH,
                            transcribe: false,
                            playBeep: true,
                            trim: "trim-silence"
                        });
                        twiml.say("Sorry. We did not hear anything to record. Goodbye!", VOICE_SETTINGS);
                    }
                }

                res.writeHead(200, {'Content-Type': 'text/xml'});
                res.end(twiml.toString());
            })
            .catch(function (err) {
                res.status(500).send(err.message);
            });
    });

    router.post('/extension/:uuid', function(req, res) {
        var uuid = req.params.uuid;
        var accountSid = req.body.AccountSid;
        var fromNumber = req.body.From;
        var toNumber = req.body.To;
        var extensionNumber = req.body.Digits;
        var phoneNumberId, extension, timezoneOffset;

        authenticateRequest(uuid, accountSid, toNumber)
            .then(function (account) {
                phoneNumberId = account.PhoneNumber.id;
                timezoneOffset = utils.getTimezoneOffset(account.timezone);

                return db.PhoneNumber.find({
                            where: {id: phoneNumberId},
                            include: [
                                        {
                                            model: db.Extension,
                                            where: {main: false, number: extensionNumber},
                                            include: [
                                                {
                                                    model: db.Schedule
                                                },
                                                {
                                                    model: db.Greeting
                                                }
                                            ]
                                        }
                                    ]
                        });
            })
            .then(function (phoneNumber) {
                var twiml = new twilio.TwimlResponse();

                if (!phoneNumber || !phoneNumber.Extensions || !phoneNumber.Extensions.length) {
                    twiml.say("Sorry. The number you entered was not valid. Going back to the main menu.", VOICE_SETTINGS);
                    twiml.redirect(twilioUrl.init(uuid));
                } else {
                    extension = phoneNumber.Extensions[0];

                    // This assumes an extension can be reached if the business is open (the useGlobalSchedule case)
                    var isOpen = !phoneNumber.do_not_disturb && (extension.use_global_schedule || extension.isOpen(-timezoneOffset));
                    var greeting = "";
                    for (var i = 0; i < extension.Greetings.length; i++) {
                        if (extension.Greetings[i].open === isOpen) {
                            greeting = extension.Greetings[i].text;
                            break;
                        }
                    }

                    twiml.say(greeting, VOICE_SETTINGS);

                    if (isOpen) {
                        twiml.dial(extension.external_phone_number, {
                            action: twilioUrl.callEnded(uuid, extension.external_phone_number),
                        });
                        twiml.say("Sorry. We were not able to connect you to the extension. Goodbye!", VOICE_SETTINGS);
                    }
                }

                res.writeHead(200, {'Content-Type': 'text/xml'});
                res.end(twiml.toString());
            })
            .catch(function (err) {
                res.status(500).send(err.message);
            });
    });

    router.post('/forward/:uuid/:externalPhoneNumber', function(req, res) {
        var uuid = req.params.uuid;
        var extensionNumber = req.params.extensionId;
        var externalPhoneNumber = req.params.externalPhoneNumber;
        var accountSid = req.body.AccountSid;
        var twilioNumber = req.body.From;

        if (!uuid || !externalPhoneNumber) {
            res.status(403).send("Missing parameters!");
            return;
        }

        var COUNTRY_CODE = db.PhoneNumber.getCountryCode();
        externalPhoneNumber = utils.canonizePhoneNumber(externalPhoneNumber, COUNTRY_CODE);
        var areaCode = utils.getAreaCode(externalPhoneNumber, COUNTRY_CODE);
        if (!externalPhoneNumber ||
                db.PhoneNumber.isShortCode(externalPhoneNumber) ||
                !db.PhoneNumber.isAreaCodeAllowed(areaCode)) {
            res.status(403).send("Phone number not allowed!");
            return;
        }

        authenticateRequest(uuid, accountSid, twilioNumber)
            .then(function (account) {
                var twiml = new twilio.TwimlResponse();

                twiml.say("Please wait while we connect you to the requested number.", VOICE_SETTINGS);
                twiml.dial(externalPhoneNumber, {
                    action: twilioUrl.callEnded(uuid, externalPhoneNumber),
                });
                twiml.say("Sorry. We were not able to connect you to the requested number. Goodbye!", VOICE_SETTINGS);

                res.writeHead(200, {'Content-Type': 'text/xml'});
                res.end(twiml.toString());
            })
            .catch(function (err) {
                res.status(500).send(err.message);
            });
    });

    router.post('/callEnded/:uuid/:externalPhoneNumber', function(req, res) {
        var uuid = req.params.uuid;
        var externalPhoneNumber = req.params.externalPhoneNumber;

        var accountSid = req.body.AccountSid;
        var fromNumber = req.body.From;
        var toNumber = req.body.To;

        var status = req.body.CallStatus;
        var callSid = req.body.CallSid;
        var duration = req.body.CallDuration;

        var dialStatus = req.body.DialCallStatus;
        var dialSid = req.body.DialCallSid;
        var dialDuration = req.body.DialCallDuration;

        var direction = req.body.Direction;

        var isDirectionOutbound = direction.indexOf("outbound") >= 0;
        var isDialLog = !duration && !!dialDuration;

        // Depending on the direction, from or to will be the Twilio number
        var twilioNumber = isDirectionOutbound ? fromNumber : toNumber;

        authenticateRequest(uuid, accountSid, twilioNumber)
            .then(function (account) {
                phoneNumberId = account.PhoneNumber.id;

                var realFromNumber = fromNumber;
                var realToNumber = toNumber;

                if (!isDirectionOutbound && isDialLog) {
                    // type = "In-Forwarded";
                    realFromNumber = toNumber;
                    realToNumber = externalPhoneNumber;
                } else if (isDirectionOutbound && isDialLog) {
                    // type = "Out-Forwarded";
                    realFromNumber = fromNumber;
                    realToNumber = externalPhoneNumber;
                }

                return db.Usage.create({
                    PhoneNumberId: phoneNumberId,
                    from_number: realFromNumber,
                    to_number: realToNumber,
                    duration: duration,
                    status: status,
                    sid: callSid,
                    dial_duration: dialDuration,
                    dial_status: dialStatus,
                    dial_sid: dialSid,
                    direction: direction
                });
            })
            .then(function () {
                var twiml = new twilio.TwimlResponse();
                res.writeHead(200, {'Content-Type': 'text/xml'});
                res.end(twiml.toString());
            })
            .catch(function (err) {
                res.status(500).send(err.message);
            });
    });

    router.post('/record/:uuid', function(req, res) {
        var uuid = req.params.uuid;
        var accountSid = req.body.AccountSid;
        var fromNumber = req.body.From;
        var toNumber = req.body.To;
        var recordingUrl = req.body.RecordingUrl;
        var recordingDuration = parseInt(req.body.RecordingDuration);
        var recordingSid = req.body.RecordingSid;

        authenticateRequest(uuid, accountSid, toNumber)
            .then(function (account) {
                var twiml = new twilio.TwimlResponse();
                if (recordingDuration > 0) {
                    var timestamp = moment().tz(account.timezone);

                    mailer.sendEmail(account.email,
                                        "You Received a Voicemail",
                                        {
                                            name: account.name,
                                            fromNumber: fromNumber,
                                            timestamp: timestamp.format("MMM DD, YYYY HH:mm:ss")
                                        },
                                        "voicemail_html",
                                        "voicemail_text",
                                        [
                                            {
                                                filename: "voicemail-" + timestamp.format("YYYY-MM-DD-HH-mm-ss") + ".mp3",
                                                path: recordingUrl + ".mp3",
                                                contentType: "audio/mpeg3"
                                            }
                                        ]
                    ).then(function(emailResult) {
                        twilioClient.recordings(recordingSid).delete(function(error, data) {
                                if (error) {
                                    throw error.message;
                                } else {
                                    res.writeHead(200, {'Content-Type': 'text/xml'});
                                    res.end(twiml.toString());
                                }
                            });
                    }).catch(function(error) {
                        res.status(403).send("Unable to send email or delete recording!");
                    });
                } else {
                    res.writeHead(200, {'Content-Type': 'text/xml'});
                    res.end(twiml.toString());
                }
            })
            .catch(function (err) {
                res.status(500).send(err.message);
            });
    });

    router.post('/test', function(req, res) {
        var twiml = new twilio.TwimlResponse();

        twiml.say("This book is too difficult for me to read.", {
            voice: 'woman',
            language: 'en-gb'
        });

        res.writeHead(200, {'Content-Type': 'text/xml'});
        res.end(twiml.toString());
    });

    return router;
};
