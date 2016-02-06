var express = require('express');
var router = express.Router();
var utils = require('../../utils/index');
var moment = require('moment-timezone');

module.exports = function(db, config, passport) {

    router.post('/getPlans', passport.httpAuthenticator, function(req, res) {
        var now = new moment();
        db.Account.findOne({
            where: {id: req.user.id},
            include: [
                {
                    model: db.Plan,
                    where: db.Sequelize.or({
                                    end_date: null,
                                },
                                {
                                    end_date: {$gt: now.toDate()}
                                }
                            )
                },
                {
                    model: db.PhoneNumber
                }
            ]
        }).then(function(account) {
            if (account && account.Plans && account.Plans.length && account.PhoneNumber) {
                var index, data = {
                    phoneNumber: account.PhoneNumber.number,
                    phoneNumberType: account.PhoneNumber.type === "LOCAL" ? "Local" : "Toll free"
                };

                var preparePlanObject = function (data, plan, key) {
                    data[key] = {
                        monthlyFee: "$" + plan.price.toFixed(2),
                        addOn: db.Plan.getAddOn(plan.minutes_included),
                        minuteRate: "$" + plan.minute_rate.toFixed(2),
                        startDateUtc: plan.start_date,
                        startDate: moment(plan.start_date).tz(account.timezone).format("MMM DD, YYYY"),
                        endDate: plan.end_date ?
                                    moment(plan.end_date).tz(account.timezone).format("MMM DD, YYYY") :
                                    "Ongoing"
                    };
                };

                for (index = 0; index < account.Plans.length; index++) {
                    var plan = account.Plans[index];
                    var startDate = moment(plan.start_date);
                    var endDate = moment(plan.end_date);
                    if (startDate.isBefore(now) && (plan.end_date === null || endDate.isAfter(now))) {
                        preparePlanObject(data, plan, "currentPlan");
                    } else if (startDate.isAfter(now)) {
                        preparePlanObject(data, plan, "futurePlan");
                    }
                }

                if (data.currentPlan) {
                    var newStartDate = utils.getNextPlanStartDate(data.currentPlan.startDateUtc);
                    data.newStartDate = newStartDate.tz(account.timezone).format("MMM DD, YYYY");
                }

                res.send({data: data});
            } else {
                res.status(500).send("Plan info not found!");
            }
        }).catch(function(error) {
            res.status(500).send("Error retrieving plan info!");
        });
    });

    router.post('/changePlan', passport.httpAuthenticator, passport.statusAuthenticatorFactory("PURCHASED"), function(req, res) {
        var addOn = req.body.addOn;

        if (addOn === null || addOn === undefined) {
            res.status(403).send("Required parameter not provided!");
            return;
        }

        var monthlyRate = db.Plan.getAddOnMonthlyRate(addOn);
        var minutesIncluded = db.Plan.getAddOnMinutesIncluded(addOn);

        if (monthlyRate === undefined || minutesIncluded === undefined) {
            res.status(403).send("Add-on not defined!");
            return;
        }

        var currentPlan, futurePlan, newStartDate, phoneNumber;
        var now = new moment();

        db.Account.findOne({
            where: {id: req.user.id},
            include: [
                {
                    model: db.Plan,
                    where: db.Sequelize.or({
                                    end_date: null,
                                },
                                {
                                    end_date: {$gt: now.toDate()}
                                }
                            )
                },
                {
                    model: db.PhoneNumber
                }
            ]
        }).then(function(account) {
            if (!account || !account.Plans || !account.Plans.length || !account.PhoneNumber) {
                throw new Error("Plan info not found!");
            }

            phoneNumber = account.PhoneNumber;

            for (index = 0; index < account.Plans.length; index++) {
                var plan = account.Plans[index];
                var startDate = moment(plan.start_date);
                var endDate = moment(plan.end_date);
                if (startDate.isBefore(now) && (plan.end_date === null || endDate.isAfter(now))) {
                    currentPlan = plan;
                } else if (startDate.isAfter(now)) {
                    futurePlan = plan;
                }
            }

            if (!currentPlan) {
                throw new Error("Current plan info not found!");
            }

            newStartDate = utils.getNextPlanStartDate(currentPlan.start_date, now);

            return db.Plan.update({end_date: newStartDate.toDate()}, {where: {id: currentPlan.id}});
        }).then(function(result) {
            var futurePlanData = {
                AccountId: req.user.id,
                code: db.Plan.getCode(phoneNumber.type, addOn),
                price: monthlyRate.toFixed(2),
                minute_rate: db.Plan.getPlanMinuteRate(phoneNumber.type).toFixed(2),
                minutes_included: minutesIncluded,
                start_date: newStartDate.toDate(),
                end_date: null
            };

            if (futurePlan && futurePlan.id) {
                futurePlanData.id = futurePlan.id;
            }

            return db.Plan.upsert(futurePlanData);
        }).then(function(result) {
            res.send({success: true});
        }).catch(function(error) {
            res.status(500).send("Error changing plan info!");
        });
    });

    return router;
};
