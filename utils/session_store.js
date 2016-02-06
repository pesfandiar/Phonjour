var moment = require('moment');

module.exports = function (db, config, session) {
    var Store = session.Store;

    function SessionStore(options) {
        options = options || {};
        Store.call(this, options);

        function isExpired(lastTouch) {
            return moment(lastTouch).add(config.sessionMaxAge, 'milliseconds').isBefore(moment());
        }

        this.get = function(sessionId, callback) {
            db.Session.find(sessionId)
                .then(function(session) {
                    if (!session || isExpired(session.last_touch)) {
                        return callback(null);
                    }
                    return callback(null, JSON.parse(session.session_data));
                }).catch(function(error) {
                    return callback(error);
                });
        };


        this.set = function(sessionId, sessionData, callback) {
            db.Session.upsert({
                session_id: sessionId,
                session_data: JSON.stringify(sessionData),
                last_touch: new moment().toDate()
            }).then(function() {
                callback();
            }).catch(function(error) {
                callback(error);
            });
        };


        this.destroy = function(sessionId, callback) {
            db.Session.find(sessionId)
                .then(function(session) {
                    if (!session) {
                        return callback();
                    }
                    session.destroy()
                        .then(function() {
                            callback();
                        }).catch(function(error) {
                            callback(error);
                        });
                }).catch(function(error) {
                    callback(error);
                });
        };


        this.touch = function(sessionId, sessionData, callback) {
            db.Session.update(
                {last_touch: new moment().toDate()},
                {where: {session_id: sessionId}})
            .then(function() {
                return callback();
            }).catch(function(error) {
                return callback(error);
            });
        };


        this.length = function(callback) {
            db.Session.count()
                .then(function(count) {
                    callback(null, count);
                }).catch(function(error) {
                    callback(error);
                });
        };


        this.clear = function(callback) {
            db.Session.findAll()
                .then(function (sessions) {
                    if (!sessions) {
                        return callback();
                    }
                    sessions.destory()
                        .then(function () {
                            callback();
                        }).catch(function (error) {
                            callback(error);
                        });
                }).catch(function (error) {
                    callback(error);
                });
        };


        this.expired = function(sessionId, callback) {
            db.Session.find(sessionId)
                .then(function(session) {
                    if (!session) {
                        return callback("Session not found!");
                    }
                    return callback(null, isExpired(session.last_touch));
                }).catch(function(error) {
                    return callback(error);
                });
        };


        this.cleanUp = function(callback) {
            db.Session.destroy({
                where: {
                    last_touch: {$lt: moment().subtract(config.sessionMaxAge, 'milliseconds').toDate()}
                }
            }).then(function (numDeleted) {
                return callback(null, numDeleted);
            }).catch(function(error) {
                return callback(error);
            });
        };
    }
    /* jshint ignore:start */
    SessionStore.prototype.__proto__ = Store.prototype;
    /* jshint ignore:end */

    return SessionStore;
};
