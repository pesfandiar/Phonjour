var express = require('express');
var moment = require('moment-timezone');
var BigNumber = require('bignumber.js');
var router = express.Router();
var utils = require('../../utils/index');

module.exports = function(db, config, passport) {

    router.post('/getPeriodData', passport.httpAuthenticator, function(req, res) {
        var TOO_LONG_YEARS = 30;

        var now = new moment(req.body.periodDate);
        var lastUsagesCount = req.body.lastUsagesCount === undefined ? null : parseInt(req.body.lastUsagesCount, 10);

        if (moment().add(TOO_LONG_YEARS, "years").isBefore(now)) {
            res.status(500).send("We haven't planned to live that long!");
            return;
        }

        var periodDates, plan, phoneNumber, timezone, promotion;

        db.Account.find({
            where: {id: req.user.id},
            include: [
                {
                    model: db.Plan,
                    where: db.Sequelize.and(
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
                },
                {
                    model: db.Promotion,
                    where: {
                        start_date: {$lte: now.toDate()},
                        end_date: {$gt: now.toDate()}
                    },
                    required: false
                }
            ]
        })
        .then(function (account) {
            if (!account || !account.Plans || !account.Plans.length || !account.PhoneNumber) {
                throw new Error("Plan or phone number not found!");
            }

            plan = account.Plans[0];
            periodDates = utils.getPeriodDates(plan.start_date, now);
            phoneNumber = account.PhoneNumber;
            timezone = account.timezone;
            promotion = account.Promotions && account.Promotions.length ? account.Promotions[0] : null;

            return db.Usage.findAll({
                where: db.Sequelize.and(
                    {PhoneNumberId: account.PhoneNumber.id},
                    {createdAt: {$gte: periodDates.startDate.toDate()}},
                    {createdAt: {$lt: periodDates.endDate.toDate()}}
                ),
                sort: "createdAt ASC"
            });
        })
        .then(function (usages) {
            var minuteRate = plan.minute_rate.toFixed(2);
            var planRate =  plan.price.toFixed(2);

            var result = {
                periodStartDate: moment(periodDates.startDate).tz(timezone).format("MMM DD, YYYY"),
                periodEndDate: moment(periodDates.endDate).tz(timezone).format("MMM DD, YYYY"),
                minutesIncluded: plan.minutes_included,
                minuteRate: minuteRate,
                planRate: planRate,
                phoneNumber: phoneNumber.friendly_name,
                usageList: []
            };

            var minutesUsedRunning = 0;

            function calculateMinutes(duration) {
                return Math.ceil((duration + 1) / 60.0);
            }

            function calculateMinutesIncluded(minutes) {
                return minutesUsedRunning + minutes < plan.minutes_included ? minutes :
                                            minutesUsedRunning >= plan.minutes_included ? 0 :
                                                plan.minutes_included - minutesUsedRunning;
            }

            var usageFee = new BigNumber(0);

            for (var i = 0; i < usages.length; i++) {
                var minutes, minutesIncluded;
                var usage = usages[i];
                var usageItem = {};
                var cost, type;
                var timestamp = moment(usage.createdAt).tz(timezone).format("MMM DD, YYYY HH:mm:ss z");
                if (usage.direction === "inbound" && usage.duration !== null && usage.dial_duration === null) {
                    type = "Incoming";
                    minutes = calculateMinutes(usage.duration);
                    minutesIncluded = calculateMinutesIncluded(minutes);
                    cost = new BigNumber(minutes - minutesIncluded).times(plan.minute_rate);
                } else if (usage.direction === "inbound" && usage.duration === null && usage.dial_duration !== null) {
                    type = "In-Forwarded";
                    minutes = calculateMinutes(usage.dial_duration);
                    minutesIncluded = calculateMinutesIncluded(minutes);
                    cost = new BigNumber(minutes - minutesIncluded).times(plan.minute_rate);
                } else if (usage.direction === "outbound-api" && usage.duration !== null && usage.dial_duration === null) {
                    type = "Outgoing";
                    minutes = calculateMinutes(usage.duration);
                    minutesIncluded = calculateMinutesIncluded(minutes);
                    cost = new BigNumber(minutes - minutesIncluded).times(plan.minute_rate);
                } else if (usage.direction === "outbound-api" && usage.duration === null && usage.dial_duration !== null) {
                    type = "Out-Forwarded";
                    minutes = calculateMinutes(usage.dial_duration);
                    minutesIncluded = calculateMinutesIncluded(minutes);
                    cost = new BigNumber(minutes - minutesIncluded).times(plan.minute_rate);
                } else {
                    type = "Unsuccessful";
                    minutes = 0;
                    minutesIncluded = 0;
                    cost = new BigNumber(0);
                }

                usageItem = {
                    type: type,
                    minutes: minutes,
                    minutesIncluded: minutesIncluded,
                    timestamp: timestamp,
                    cost: "$" + cost.toFixed(2),
                    fromNumber: usage.from_number,
                    toNumber: usage.to_number
                };

                minutesUsedRunning += minutes;

                if (lastUsagesCount === null || usages.length - i <= lastUsagesCount) {
                    result.usageList.push(usageItem);
                }
                usageFee = usageFee.add(cost);
            }

            result.usageFee = "$" + usageFee.toFixed(2);
            result.totalFee = "$" + usageFee.plus(planRate).toFixed(2);
            result.minutesUsed = minutesUsedRunning;

            // Promotions are assumed to be active during the whole period
            if (promotion) {
                var promotionDiscount = new BigNumber(0);
                if (promotion.price_discount) {
                    promotionDiscount = promotionDiscount.plus(new BigNumber(planRate).times(promotion.price_discount));
                }
                if (promotion.minute_rate_discount) {
                    promotionDiscount = promotionDiscount.plus(usageFee.times(promotion.minute_rate_discount));
                }

                result.promotionDiscount = "$" + promotionDiscount.toFixed(2);
                result.totalFeeDiscounted = "$" + usageFee.plus(planRate).minus(promotionDiscount).toFixed(2);
            }

            res.send({periodData: result});
        })
        .catch(function(error) {
            res.status(500).send("Unable to retrieve usage data!");
        });

    });

    return router;
};
