module.exports = function(db, config) {
    var nodemailer = require('nodemailer');
    var ses = require('nodemailer-ses-transport');
    var transporter = nodemailer.createTransport(ses({
        accessKeyId: config.awsMailerKeyId,
        secretAccessKey: config.awsMailerSecretKey,
        rateLimit: config.emailRateLimit
    }));

    var jade = require('jade');
    var fs = require('fs');
    var path  = require('path');
    var Q = require('q');

    function _renderJade(fileName, locals, callback) {
        try {
            fs.readFile(fileName, 'utf8', function (error, data) {
                if (error) {
                    return callback(error);
                }
                var jadeCompiler = jade.compile(data);
                var html = jadeCompiler(locals);
                return callback(null, html);
            });
        } catch(error) {
            return callback(error);
        }
    }

    this.sendEmail = function(recipient, subject, locals, htmlTemplate, textTemplate, attachments) {
        var deferred = Q.defer();
        var emailData = {
            to: recipient,
            from: config.fromEmail,
            replyTo: config.replyToEmail,
            subject: subject
        };

        if (attachments) {
            emailData.attachments = attachments;
        }

        var _sendEmail = function() {
            transporter.sendMail(emailData, function(error, emailResult) {
                if (error) {
                    return deferred.reject(error);
                }
                deferred.resolve(emailResult);
            });
        };

        _renderJade(path.join(__dirname, "../views/emails/", htmlTemplate + ".jade"), locals, function(error, htmlEmail) {
            if (error) {
                return deferred.reject(error);
            }
            emailData.html = htmlEmail;
            if (textTemplate) {
                _renderJade(path.join(__dirname, "../views/emails/", textTemplate + ".jade"), locals, function(error, textEmail) {
                    if (error) {
                        return deferred.reject(error);
                    }
                    emailData.text = textEmail;
                    _sendEmail();
                }.bind(this));
            } else {
                _sendEmail();
            }
        }.bind(this));

        return deferred.promise;
    };

    return this;
};