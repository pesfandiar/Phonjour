var express = require('express');
var moment = require('moment');
var BigNumber = require('bignumber.js');
var router = express.Router();
var utils = require('../../utils/index');

var ALLOWED_COUNTRY_CODES = Object.freeze({
    CA: true,
    US: true
});


module.exports = function(db, config, passport) {
    var twilio = require('twilio');
    var twilioClient = twilio(config.twilioSid, config.twilioToken);
    var twilioSensitiveClient = twilio(config.twilioSensitiveSid, config.twilioSensitiveToken);
    var twilioUrl = utils.twilioUrl(db, config);
    var mailer = utils.mailer(db, config);
    var authenticationUtils = utils.authentication(db, config);


    // To be replaced when other countries enter the game!
    var COUNTRY_CODE = db.PhoneNumber.getCountryCode();

    router.post('/available', passport.httpAuthenticator, passport.statusAuthenticatorFactory("PAYMENT_ON_FILE"), function(req, res) {
        var countryCode = (req.body.countryCode || 'CA').toUpperCase();
        var localOrTollFree = req.body.tollFree ? 'tollFree' : 'local';
        var areaCode = req.body.areaCode;

        if (!(countryCode in ALLOWED_COUNTRY_CODES)) {
            res.status(403).send("Country code not allowed!");
            return;
        }

        if (!db.PhoneNumber.isAreaCodeAllowed(areaCode)) {
            res.status(403).send("Area code not allowed!");
            return;
        }

        if (localOrTollFree === "local" && db.PhoneNumber.isTollFree(areaCode) ||
                localOrTollFree === "tollFree" && !db.PhoneNumber.isTollFree(areaCode)) {
            res.status(403).send("Incorrect toll-free/local option!");
            return;
        }

        twilioClient.availablePhoneNumbers(countryCode)[localOrTollFree].list({
                areaCode: areaCode,
                VoiceEnabled: true,
                SmsEnabled: true
            }, function(err, numbers) {
                if (err) {
                    res.status(500).send("Could not fetch the available phone numbers!");
                    return;
                }
                availablePhoneNumbers = numbers ? numbers.available_phone_numbers : undefined;
                res.send({numbers: availablePhoneNumbers});
            });
    });


    router.post('/buyPhoneNumber', passport.httpAuthenticator, passport.statusAuthenticatorFactory("PAYMENT_ON_FILE"), function(req, res) {
        var localOrTollFree = req.body.tollFree ? 'TOLL_FREE' : 'LOCAL';
        var phoneNumber = utils.canonizePhoneNumber(req.body.phoneNumber, COUNTRY_CODE);
        var addOn = req.body.addOn || "0";
        var phoneUrl = twilioUrl.init(req.user.uuid);
        var callbackUrl = twilioUrl.callEnded(req.user.uuid, "-");
        var promotion = (req.body.promotion || "").toUpperCase();

        var areaCode = utils.getAreaCode(phoneNumber, COUNTRY_CODE);
        var startDate = new moment().startOf("day");

        var phoneNumberId, extensionId;

        if (localOrTollFree === "LOCAL" && db.PhoneNumber.isTollFree(areaCode) ||
                localOrTollFree === "TOLL_FREE" && !db.PhoneNumber.isTollFree(areaCode)) {
            res.status(403).send("Incorrect toll-free/local option!");
            return;
        }

        if (!phoneNumber || !db.Plan.getAddOnMonthlyRate(addOn)) {
            res.status(403).send("Phone number or add-on not valid!");
            return;
        }

        if (!db.PhoneNumber.isAreaCodeAllowed(utils.getAreaCode(phoneNumber, COUNTRY_CODE))) {
            res.status(403).send("Area code not allowed!");
            return;
        }

        if (config.env === "DEVELOPMENT") {
            phoneNumber = config.testPhoneNumber;
        }

        twilioSensitiveClient.incomingPhoneNumbers.create({
            phoneNumber: phoneNumber,
            voiceUrl: phoneUrl,
            statusCallback: callbackUrl
        }).then(function(purchasedNumber) {
            db.Account.update({
                            status: "PURCHASED"
                        }, {
                            where: {id: req.user.id}
                        }
            ).then(function (result) {
                var promotionObject = db.Promotion.getPromotion(promotion);
                if (!promotionObject) {
                    return null;
                }

                return db.Promotion.upsert({
                            AccountId: req.user.id,
                            code: promotionObject.code,
                            description: promotionObject.description,
                            start_date: startDate.toDate(),
                            end_date: moment(startDate).add(promotionObject.duration, promotionObject.durationUnit).toDate(),
                            price_discount: promotionObject.priceDiscount,
                            minute_rate_discount: promotionObject.minuteRateDiscount
                        });
            }).then(function (result) {
                return db.PhoneNumber.upsert({
                            AccountId: req.user.id,
                            number: purchasedNumber.phoneNumber,
                            friendly_name: purchasedNumber.friendlyName,
                            sid: purchasedNumber.sid,
                            type: localOrTollFree,
                            url: phoneUrl
                        });
            }).then(function (result) {
                var price = new BigNumber(0);
                price = price.plus(db.Plan.getAddOnMonthlyRate(addOn));
                price = price.plus(db.Plan.getPlanMonthlyRate(localOrTollFree));
                return db.Plan.upsert({
                            AccountId: req.user.id,
                            code: db.Plan.getCode(localOrTollFree, addOn),
                            price: price.toFormat(2),
                            minute_rate: db.Plan.getPlanMinuteRate(localOrTollFree).toFixed(2),
                            minutes_included: db.Plan.getAddOnMinutesIncluded(addOn),
                            start_date: startDate.toDate(),
                        });
            }).then(function (result) {
                // Fire and forget email
                db.Account.findOne(req.user.id)
                    .then(function(account) {
                        mailer.sendEmail(account.email,
                                            "Phonjour Number Activated",
                                            {
                                                name: account.name,
                                                phoneNumber: purchasedNumber.friendlyName
                                            },
                                            "phone_purchase_html",
                                            "phone_purchase_text");
                    });

                var user = authenticationUtils.createUser(req.user.id, req.user.uuid, req.user.email, "PURCHASED");
                req.login(user, function(error) {
                    if (error) {
                        return res.status(500).send("Unable to log in!");
                    }
                    return res.send({success: true});
                });
            }).fail(function (error) {
                res.status(500).send("Unable to update user info!");
            });
        }).fail(function(error) {
            res.status(500).send("Unable to buy the number!");
        });

    });

    router.post('/makeCall', passport.httpAuthenticator, passport.statusAuthenticatorFactory("PURCHASED"), function(req, res) {
        var fromNumber = req.body.fromNumber;
        var toNumber = req.body.toNumber;

        var COUNTRY_CODE = db.PhoneNumber.getCountryCode();
        fromNumber = utils.canonizePhoneNumber(fromNumber, COUNTRY_CODE);
        toNumber = utils.canonizePhoneNumber(toNumber, COUNTRY_CODE);

        if (!fromNumber || !toNumber) {
            res.status(403).send("Please enter a valid phone number including numbers, spaces, hyphens or brackets.");
            return;
        }

        var toNumberAreaCode = utils.getAreaCode(toNumber, COUNTRY_CODE);

        if (db.PhoneNumber.isShortCode(toNumber) ||
                !db.PhoneNumber.isAreaCodeAllowed(toNumberAreaCode)) {
            res.status(403).send("Phone number not allowed!");
            return;
        }

        db.PhoneNumber.findOne({
            where: {
                AccountId: req.user.id,
            },
            include: [
                {
                    model: db.Extension,
                    where: {
                        external_phone_number: fromNumber,
                        main: false
                    }
                }
            ]
        }).then(function (phoneNumber) {
            if (!phoneNumber || !phoneNumber.Extensions || !phoneNumber.Extensions.length) {
                res.status(403).send("Could not find the phone number!");
                return;
            }

            twilioClient.calls.create({
                url: twilioUrl.forward(req.user.uuid, toNumber),
                statusCallback: twilioUrl.callEnded(req.user.uuid, toNumber),
                to: fromNumber,
                from: phoneNumber.number
            }, function(error, call) {
                if (error) {
                    res.status(500).send("Was not able to make the call!");
                    return;
                }
                res.send({success: true, toNumber: toNumber});
            });
        }).catch(function (error) {
            res.status(500).send("Cannot make a call!");
        });
    });

    router.post('/doNotDisturb', passport.httpAuthenticator, function(req, res) {
        var isSetter = req.body.doNotDisturb === "true" || req.body.doNotDisturb === "false";
        var doNotDisturb = req.body.doNotDisturb === "true";

        db.PhoneNumber.findOne({
            where: {
                AccountId: req.user.id,
            }
        }).then(function (phoneNumber) {
            if (!phoneNumber) {
                res.status(403).send("Could not find the phone number!");
                return;
            }

            if (!isSetter) {
                return phoneNumber;
            }

            return phoneNumber.update({do_not_disturb: doNotDisturb});
        }).then(function (phoneNumber) {
            res.send({doNotDisturb: phoneNumber.do_not_disturb});
        }).catch(function (error) {
            res.status(500).send("Cannot retrieve or change the information!");
        });
    });

    return router;
};
