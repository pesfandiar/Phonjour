var express = require('express');
var router = express.Router();
var utils = require('../../utils/index');
var moment = require('moment');
var BigNumber = require('bignumber.js');


// This is mainly used for internal Phonjour ops, and so uses an odd name. The authentication
// is performed using phonjourOpsKey only. The operations should only be triggered from here,
// but no sensitive change should be made.
module.exports = function(db, config, passport) {
    var authenticationUtils = utils.authentication(db, config);
    var stripe = require('stripe')(config.stripePrivate);

    router.post('/cleanUpSessions', authenticationUtils.phonjourOpsAuthenticator, function(req, res) {
        var now = new moment();
        db.SessionStore.cleanUp(function (error, result) {
            if (error) {
                res.status(500).send("Unable to clean up!");
            } else {
                res.send({result: result});
            }
        });
    });

    // TODO: This doesn't take coupons into account.
    router.post('/chargeAll', authenticationUtils.phonjourOpsAuthenticator, function(req, res) {
        var now = req.body.now ? moment(req.body.now) : new moment();
        // When was the last day of period
        var billingDate = moment(now).subtract(1, "days").startOf("day");
        var billingCutoff = moment(billingDate).subtract(32, "days");
        // Still try to charge terminated accounts after so many days
        var terminationCutoff = moment(billingDate).subtract(37, "days");
        // Ignore accounts billed within this many days
        var lastBillCutoff = moment(billingDate).subtract(24, "days");
        // The date before which unpaid bills are ignored
        var lastRetryCutoff = moment(billingDate).subtract(5, "days");

        db.Account.findAll({
            where: db.Sequelize.and(
                db.Sequelize.or(
                    {status: "PURCHASED"},
                    db.Sequelize.and(
                        {status: "TERMINATED"},
                        {updatedAt: {$gt: terminationCutoff.toDate()}}
                    )
                ),
                "`Plans`.`id` IS NOT NULL",
                "`Billings`.`id` IS NULL"
            ),
            include: [
                {
                    model: db.Plan,
                    where: db.Sequelize.or(
                        db.Sequelize.and(
                            {end_date: null},
                            {start_date: {$lte: billingDate.toDate()}}
                        ),
                        {end_date: {$gte: billingDate.toDate()}}
                    ),
                    order: "start_date ASC"
                },
                {
                    model: db.PhoneNumber,
                    include: [
                        {
                            model: db.Usage,
                            where: db.Sequelize.and(
                                {createdAt: {$gt: billingCutoff.toDate()}},
                                {createdAt: {$lte: billingDate.toDate()}}
                            )
                        }
                    ]
                },
                {
                    model: db.PaymentInfo
                },
                {
                    model: db.Billing,
                    required: false,
                    where: db.Sequelize.and(
                        {createdAt: {$gt: lastBillCutoff.toDate()}},
                        db.Sequelize.or(
                            {paid: true},
                            {createdAt: {$lt: lastRetryCutoff.toDate()}}
                        )
                    )
                }
            ]
        }).then(function (accounts) {
            if (!accounts || !accounts.length) {
                res.send("No eligible accounts found!");
                return;
            }

            var handleChargedAccount = function(account, totalFeeCents, periodStart, periodEnd, error, charge) {
                var chargeSuccessful = !error && charge && charge.paid && charge.captured && charge.status === "succeeded";
                var message = null;
                var chargeId = charge ? charge.id : null;

                if (error) {
                    message = error.message;
                }

                db.Billing.create({
                    amount: new BigNumber(totalFeeCents).div(100).toFixed(2),
                    external_id: chargeId,
                    paid: chargeSuccessful,
                    period_start: periodStart.toDate(),
                    period_end: periodEnd.toDate(),
                    message: message,
                    AccountId: account.id
                }).catch(function(error) {
                    throw new Error(error.message);
                });
            };

            var eligibleAccounts = 0;
            for (var i = 0; i < accounts.length; i++) {
                var account = accounts[i];
                var usages = account.PhoneNumber.Usages;
                var plans = account.Plans;

                var currentPlan, futurePlan;

                if (plans.length === 1) {
                    currentPlan = plans[0];
                    if (account.status !== "TERMINATED") {
                        futurePlan = plans[0];
                    }
                } else if (plans.length === 2) {
                    currentPlan = plans[0];
                    if (account.status !== "TERMINATED") {
                        futurePlan = plans[1];
                    } else {
                        throw new Error("ChargeAll 1: this should not happen!");
                    }

                    if (currentPlan.end_date === null || futurePlan.end_date !== null) {
                        throw new Error("ChargeAll 2: this should not happen!");
                    }
                } else {
                    throw new Error("ChargeAll 3: this should not happen!");
                }

                var periodStart = moment(currentPlan.start_date);
                var periodEnd = moment(periodStart).add(1, "months");
                while (periodEnd.isBefore(billingDate) && !periodEnd.isSame(billingDate)) {
                    periodStart = periodStart.add(1, "months");
                    periodEnd = periodEnd.add(1, "months");
                }

                if (!periodEnd.isSame(billingDate)) {
                    continue;
                }

                var minutesUsed = 0;
                for (var usageIndex = 0; usageIndex < usages.length; usageIndex++) {
                    var usage = usages[usageIndex];
                    if ((periodStart.isBefore(usage.createdAt) || periodStart.isSame(usage.createdAt)) && periodEnd.isAfter(usage.createdAt)) {
                        var duration = usage.duration || usage.dial_duration;
                        minutesUsed += Math.ceil((duration + 1) / 60.0);
                    }
                }

                var minutesCharged = minutesUsed - currentPlan.minutes_included;
                minutesCharged = minutesCharged > 0 ? minutesCharged : 0;

                var minuteRate = new BigNumber(currentPlan.minute_rate);
                var usageFee = minuteRate.times(minutesCharged);

                var planFee = new BigNumber(0);
                if (currentPlan.end_date === null || periodEnd.isBefore(currentPlan.end_date)) {
                    planFee = new BigNumber(currentPlan.price);
                } else if (futurePlan && (periodEnd.isAfter(futurePlan.start_date) || periodEnd.isSame(futurePlan.start_date))) {
                    planFee = new BigNumber(futurePlan.price);
                }

                var totalFee = usageFee.plus(planFee);
                var totalFeeCents = totalFee.times(100).toNumber();

                if (totalFeeCents === 0) {
                    continue;
                }

                eligibleAccounts++;

                stripe.charges.create({
                    amount: totalFeeCents,
                    currency: "usd",
                    customer: account.PaymentInfo.external_id,
                    description: "Phonjour.com plan and usage fees from " +
                                    periodStart.format("MMM DD, YYYY") + " to " +
                                    periodEnd.format("MMM DD, YYYY") + " for " +
                                    account.PhoneNumber.friendly_name,
                    capture: true,
                    statement_descriptor: "Phonjour.com Bill",
                    receipt_email: account.email
                }, handleChargedAccount.bind(null, account, totalFeeCents, periodStart, periodEnd));
            }

            res.send(eligibleAccounts + " accounts were triggered to be charged!");
        }).catch(function(error) {
            res.status(500).send(error.message);
        });
    });

    return router;
};
