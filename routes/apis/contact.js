var express = require('express');
var router = express.Router();

module.exports = function(db, config, passport) {

    router.post('/saveEmail', function(req, res) {
        var email = req.body.email;

        if (!email || email.length === 0) {
            res.status(403).send("Required fields not provided!");
            return;
        }

        db.Contact.create({
            email: email
        }).then(function (result) {
           res.send({success: true});
        }).catch(function(error) {
            res.status(500).send("Error saving the email address!");
        });
    });

    return router;
};
