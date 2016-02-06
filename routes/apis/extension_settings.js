var express = require('express');
var router = express.Router();
var utils = require('../../utils/index');

var HOLIDAYS_ENABLED = false;
var DAY_COUNT = 7 + (HOLIDAYS_ENABLED ? 1 : 0);

module.exports = function(db, config, passport) {

    router.post('/get', passport.httpAuthenticator, function(req, res) {
        var extensionId = req.body.extensionId;
        var extensionCondition = {};
        if (extensionId) {
            extensionCondition.id = extensionId;
            extensionCondition.main = false;
        } else {
            extensionCondition.main = true;
        }

        db.PhoneNumber.find({
                                where: {
                                        AccountId: req.user.id
                                    },
                                include: [
                                    {
                                        model: db.Extension,
                                        where: extensionCondition,
                                        include: [
                                            {
                                                model: db.Greeting
                                            },
                                            {
                                                model: db.Schedule
                                            }
                                        ]
                                    }
                                ]
                            })
            .then(function(phoneNumber) {
                if (!phoneNumber || !phoneNumber.Extensions.length) {
                    res.status(500).send("Error retrieving extensions!");
                    return;
                }
                var i, extension = phoneNumber.Extensions[0];
                var result = {
                    extensionId: extension.id,
                    main: extension.main,
                    useGlobalSchedule: extension.use_global_schedule,
                    voicemail: extension.voicemail,
                    name: extension.name,
                    extension: extension.number
                };

                result.greetings = {};
                for (i = 0; i < extension.Greetings.length; i++) {
                    var greeting = extension.Greetings[i];
                    result.greetings[greeting.open] = {
                        text: greeting.text,
                        type: greeting.type
                    };
                }

                result.schedules = [];
                for (i = 0; i < extension.Schedules.length; i++) {
                    var schedule = extension.Schedules[i];
                    result.schedules[schedule.day_of_week] = {
                        fromTime: schedule.start_time,
                        toTime: schedule.end_time,
                        open: schedule.open
                    };
                }

                res.send({extension: result});
            }).catch(function(error) {
                res.status(500).send("Error retrieving extension settings!");
            });
    });


    router.post('/save', passport.httpAuthenticator, function(req, res) {
        var extensionId = req.body.extensionId;
        var newGreetings = req.body.greetings;
        var newSchedules = req.body.schedules;
        var useGlobalSchedule = !!req.body.useGlobalSchedule;
        var voicemail = !!req.body.voicemail;

        if (!extensionId || !newGreetings || !newSchedules) {
            res.status(403).send("Required parameters missing!");
            return;
        }

        db.PhoneNumber.find({
                                where: {
                                        AccountId: req.user.id
                                    },
                                include: [
                                    {
                                        model: db.Extension,
                                        where: {id: extensionId},
                                        include: [
                                            {
                                                model: db.Greeting
                                            },
                                            {
                                                model: db.Schedule
                                            }
                                        ]
                                    }
                                ]
                            })
            .then(function(phoneNumber) {
                if (!phoneNumber || !phoneNumber.Extensions.length) {
                    throw new Error("Phone number or extension not found!");
                }

                var i, extension = phoneNumber.Extensions[0];
                var greetings = {};
                for (i = 0; i < extension.Greetings.length; i++) {
                    greetings[extension.Greetings[i].open] = extension.Greetings[i].id;
                }

                var schedules = [];
                for (i = 0; i < extension.Schedules.length; i++) {
                    schedules[extension.Schedules[i].day_of_week] = extension.Schedules[i].id;
                }


                var newGreeting = {
                    ExtensionId: extensionId,
                    open: true,
                    text: newGreetings[true]
                };
                if (greetings[true]) {
                    newGreeting.id = greetings[true];
                }
                var promise = db.Greeting.upsert(newGreeting);

                newGreeting = {
                    ExtensionId: extensionId,
                    open: false,
                    text: newGreetings[false]
                };
                if (greetings[false]) {
                    newGreeting.id = greetings[false];
                }
                promise = promise.then(function() {
                    db.Greeting.upsert(newGreeting);
                });

                function upsertSchedule(newSchedule) {
                    promise = promise.then(function() {
                        db.Schedule.upsert(newSchedule);
                    });
                }

                for (var day = 0; day < DAY_COUNT; day++) {
                    if (!newSchedules[day]) {
                        continue;
                    }

                    var newSchedule = {
                        ExtensionId: extensionId,
                        start_time: newSchedules[day].fromTime,
                        end_time: newSchedules[day].toTime,
                        open: newSchedules[day].open,
                        day_of_week: day
                    };
                    if (schedules[day]) {
                        newSchedule.id = schedules[day];
                    }

                    upsertSchedule(newSchedule);
                }

                if (extension.use_global_schedule !== useGlobalSchedule || extension.voicemail !== voicemail) {
                    promise = promise.then(function() {
                        extension.updateAttributes({use_global_schedule: useGlobalSchedule, voicemail: voicemail});
                    });
                }

                return promise;
            }).then(function() {
                res.send({success: true});
            }).catch(function(error) {
                res.status(500).send("Error saving extension settings!");
            });
    });

    return router;
};
