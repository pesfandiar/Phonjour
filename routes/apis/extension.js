var express = require('express');
var router = express.Router();
var utils = require('../../utils/index');


module.exports = function(db, config, passport) {

    router.post('/list', passport.httpAuthenticator, function(req, res) {
        db.PhoneNumber.find({
                                where: {
                                        AccountId: req.user.id
                                    },
                                include: [
                                    {
                                        model: db.Extension,
                                        where: {
                                            main: false
                                        }
                                    }
                                ]
                            })
            .then(function(phoneNumber) {
                var extensions = [];
                if (phoneNumber && phoneNumber.Extensions) {
                    for (var i = 0; i < phoneNumber.Extensions.length; i++) {
                        extensions.push({
                            extension: phoneNumber.Extensions[i].number,
                            name: phoneNumber.Extensions[i].name,
                            phoneNumber: phoneNumber.Extensions[i].external_phone_number,
                            extensionId: phoneNumber.Extensions[i].id
                        });
                    }
                }
                res.send({extensions: extensions});
            }).catch(function(error) {
                res.status(500).send("Error retrieving extensions!");
            });
    });


    router.post('/save', passport.httpAuthenticator, function(req, res) {
        var extensionId = req.body.extensionId &&  req.body.extensionId >= 0 ? req.body.extensionId : null;
        var extension = req.body.extension;
        var name = req.body.name;
        var externalPhoneNumber = req.body.externalPhoneNumber;
        var finalExtension;

        if (!extension || !name || !externalPhoneNumber) {
            res.status(403).send("Missing parameters!");
            return;
        }
        if (!db.Extension.isExtensionValid(extension)) {
            res.status(403).send("Invalid extension!");
            return;
        }

        var COUNTRY_CODE = db.PhoneNumber.getCountryCode();
        externalPhoneNumber = utils.canonizePhoneNumber(externalPhoneNumber, COUNTRY_CODE);
        var areaCode = utils.getAreaCode(externalPhoneNumber, COUNTRY_CODE);
        if (!externalPhoneNumber ||
                db.PhoneNumber.isShortCode(externalPhoneNumber) ||
                !db.PhoneNumber.isAreaCodeAllowed(areaCode) ||
                db.PhoneNumber.isTollFree(areaCode)) {
            res.status(403).send("Phone number not allowed!");
            return;
        }

        var extensionConditions = {main: true};
        if (extensionId !== null) {
            extensionConditions.main = false;
            extensionConditions.id = extensionId;
        }
        db.PhoneNumber.find({
                                where: {
                                        AccountId: req.user.id
                                    },
                                include: [
                                    {
                                        model: db.Extension,
                                        where: {
                                            main: false,
                                            id: {$not: extensionId},
                                            number: extension
                                        }
                                    }
                                ]
                            })
            .then(function (phoneNumber) {
                if (phoneNumber && phoneNumber.Extensions && phoneNumber.Extensions.length) {
                    throw new Error("Extension already exists!");
                }
                return db.PhoneNumber.find({
                                where: {
                                        AccountId: req.user.id
                                    },
                                include: [
                                    {
                                        model: db.Extension,
                                        where: extensionConditions
                                    }
                                ]
                            });
            }).then(function (phoneNumber) {
                var upsertObject = {
                    PhoneNumberId: phoneNumber.id,
                    number: extension,
                    name: name,
                    main: false,
                    use_global_schedule: true,
                    external_phone_number: externalPhoneNumber
                };
                if (extensionId !== null) {
                    upsertObject.id = extensionId;
                }
                return db.Extension.upsert(upsertObject);
            }).then(function (result) {
                return db.PhoneNumber.find({
                                        where: {
                                                AccountId: req.user.id
                                            },
                                        include: [
                                            {
                                                model: db.Extension,
                                                where: {
                                                    main: false,
                                                    number: extension
                                                },
                                                include: [
                                                    {
                                                        model: db.Greeting
                                                    }
                                                ]
                                            }
                                        ]
                                    });
            }).then(function (phoneNumber) {
                finalExtension = phoneNumber.Extensions[0];
                if (!finalExtension) {
                    throw new Error("Extension was not properly saved!");
                }

                if (!finalExtension.Greetings || !finalExtension.Greetings.length) {
                    return db.Greeting.bulkCreate([{
                                ExtensionId: finalExtension.id,
                                type: "T2S",
                                text: db.Greeting.defaultAvailableGreeting(),
                                open: true
                            }, {
                                ExtensionId: finalExtension.id,
                                type: "T2S",
                                text: db.Greeting.defaultUnavailableGreeting(),
                                open: false
                            }
                        ], {ignoreDuplicates: true});
                }

                return true;
            }).then(function (result) {
                res.send({
                    extension: finalExtension.number,
                    name: finalExtension.name,
                    phoneNumber: finalExtension.external_phone_number,
                    extensionId: finalExtension.id
                });
            }).catch(function(error) {
                res.status(500).send("Error saving the extension! " + error.message);
            });
    });

    router.post('/delete', passport.httpAuthenticator, function(req, res) {
        var extensionId = req.body.extensionId;

        if (!extensionId) {
            res.status(403).send("Extension ID required!");
            return;
        }

        db.PhoneNumber.find({
                                where: {
                                        AccountId: req.user.id
                                    },
                                include: [
                                    {
                                        model: db.Extension,
                                        where: {
                                            main: false,
                                            id: extensionId
                                        }
                                    }
                                ]
                            })
            .then(function (phoneNumber) {
                if (phoneNumber.Extensions[0]) {
                    return phoneNumber.Extensions[0].destroy();
                } else {
                    throw new Error("Extension not found!");
                }
            }).then(function (result) {
                res.send({success: true});
            }).catch(function(error) {
                res.status(500).send("Error deleting the extension! " + error.message);
            });

    });


    return router;
};
