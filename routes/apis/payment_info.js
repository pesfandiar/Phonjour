var express = require('express');
var router = express.Router();
var utils = require('../../utils/index');


module.exports = function(db, config, passport) {
    var stripe = require('stripe')(config.stripePrivate);
    var authenticationUtils = utils.authentication(db, config);

    // This should be used the first time account is entering payment info
    router.post('/saveStripeToken', passport.httpAuthenticator, passport.statusAuthenticatorFactory("SIGNED_UP"), function(req, res) {
        var stripeToken = req.body.stripeToken;

        if (!stripeToken || stripeToken.length === 0) {
            res.status(403).send("Required fields not provided!");
            return;
        }

        stripe.customers.create({
            source: stripeToken,
            description: "ID=" + req.user.id + "&EMAIL=" + req.user.email
        }).then(function(customer) {
            if (customer) {
                db.PaymentInfo.upsert({
                    AccountId: req.user.id,
                    external_id: customer.id,
                    provider: "STRIPE"
                }).then(function () {
                    return db.Account.update({
                            status: "PAYMENT_ON_FILE"
                        }, {
                            where: {id: req.user.id}
                        });
                }).then(function () {
                    var user = authenticationUtils.createUser(req.user.id, req.user.uuid, req.user.email, "PAYMENT_ON_FILE");
                    req.login(user, function(error) {
                        if (error) {
                            return res.status(500).send("Unable to log in!");
                        }
                        res.send({stripeToken: stripeToken});
                    });
                }).catch(function (error) {
                    res.status(500).send("Error updating account information!");
                });
            } else {
                res.status(500).send("Stripe customer not created!");
            }
        }).catch(function(error) {
            res.status(500).send("Error creating a Stripe customer!");
        });
    });

    router.post('/getCurrentInfo', passport.httpAuthenticator, function(req, res) {
        db.PaymentInfo.findOne({where: {AccountId: req.user.id}})
            .then(function (paymentInfo) {
                if (!paymentInfo) {
                    throw new Error("Payment info not found!");
                }

                stripe.customers.retrieve(
                    paymentInfo.external_id,
                    function(error, customer) {
                        if (error || !customer || !customer.default_source) {
                            res.status(500).send("Customer not found!");
                            return;
                        }

                        stripe.customers.retrieveCard(
                            paymentInfo.external_id,
                            customer.default_source,
                            function(error, card) {
                                if (error || !card) {
                                    res.status(500).send("Credit card not found!");
                                    return;
                                }

                                res.send({creditCard: {
                                    brand: card.brand,
                                    last4: card.last4,
                                    expiry: utils.getMonthName(card.exp_month) + " " + card.exp_year
                                }});
                            }
                        );
                    }
                );
            }).catch(function (error) {
                res.status(500).send("Error retrieving credit card information!");
            });
    });

    // This is used to update the credit card on file
    router.post('/updateStripeToken', passport.httpAuthenticator, passport.statusAuthenticatorFactory(["PAYMENT_ON_FILE", "PURCHASED"]), function(req, res) {
        var stripeToken = req.body.stripeToken;

        if (!stripeToken || stripeToken.length === 0) {
            res.status(403).send("Required fields not provided!");
            return;
        }

        db.PaymentInfo.findOne({where: {AccountId: req.user.id}})
            .then(function (paymentInfo) {
                if (!paymentInfo) {
                    throw new Error("Payment info not found!");
                }

                stripe.customers.retrieve(
                    paymentInfo.external_id,
                    function(error, customer) {
                        if (error || !customer || !customer.default_source) {
                            res.status(500).send("Customer not found!");
                            return;
                        }

                        stripe.customers.createSource(
                            paymentInfo.external_id,
                            {source: stripeToken},
                            function(error, card) {
                                if (error || !card) {
                                    res.status(500).send("Error creating a new credit card!");
                                    return;
                                }

                                stripe.customers.update(paymentInfo.external_id, {
                                        default_source: card.id
                                    }, function(error, customer) {
                                        if (error || !customer) {
                                            res.status(500).send("Unable to update the credit card on file!");
                                            return;
                                        }

                                        res.send({success: true});
                                    });
                            }
                        );
                    }
                );
            }).catch(function (error) {
                res.status(500).send("Error updating credit card information!");
            });

    });

    return router;
};
