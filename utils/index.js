var path = require('path');

var SessionStore = require('./session_store');
var authentication = require('./authentication');
var mailer = require('./mailer');
var twilioUrl = require('./twilio_url');
var moment = require('moment-timezone');

module.exports.camelizeFileName = function(file, extension) {
    return path.basename(file, extension).replace (/(?:^|[-_])(\w)/g, function (_, c) {
          return c ? c.toUpperCase () : '';
    });
};


module.exports.canonizePhoneNumber = function(phoneNumber, countryNumber) {
    phoneNumber = phoneNumber || "";
    countryNumber = countryNumber || "";
    if (!phoneNumber.match(/^\+?[\(\)\d \-]{5,}$/)) {
        return null;
    }

    var result = '+';
    var countryNumberRegexp = new RegExp("^\\+?[\\(\\) \\-]*" + countryNumber);
    if (!phoneNumber.match(countryNumberRegexp)) {
        result += countryNumber;
    }

    for (var i = 0; i < phoneNumber.length; i++) {
        if (phoneNumber[i].match(/\d/)) {
            result += phoneNumber[i];
        }
    }

    if (result.length < 5) {
        return null;
    }

    return result;
};


// Takes canonized phone number and returns area code
module.exports.getAreaCode = function(phoneNumber, countryNumber) {
    phoneNumber = phoneNumber || "";
    countryNumber = countryNumber || "";
    if (!phoneNumber.match(/^\+\d{5,}$/)) {
        return null;
    }

    return phoneNumber.substring(1 + countryNumber.length, 4 + countryNumber.length);
};


module.exports.getTimezoneOffset = function(timezone, time) {
    timezone = timezone || "America/Vancouver";
    time = time || moment().utc();

    var zone = moment.tz.zone(timezone);
    return zone.parse(time.toDate());
};

// monthNumber in [0, 11]
module.exports.getMonthName = function(monthNumber) {
    return moment().months(parseInt(monthNumber) - 1).format("MMM");
};

// Returns the date when a new plan should start
module.exports.getNextPlanStartDate = function(startDate, now) {
    now = now || new moment();
    var newStartDate = moment(startDate);

    while(newStartDate.isBefore(now) || newStartDate.isSame(now)){
        newStartDate.add(1, "months");
    }

    return newStartDate.startOf("day");
};

// Returns important dates of a period (just monthly for now)
module.exports.getPeriodDates = function(startDate, now) {
    now = now || new moment();
    var periodEndDate = moment(startDate);
    periodEndDate.add(1, "months");

    while (periodEndDate.isBefore(now) || periodEndDate.isSame(now)) {
        periodEndDate.add(1, "months");
    }

    var periodStartDate = moment(periodEndDate);
    periodStartDate.subtract(1, "months");
    periodEndDate.subtract(1, "seconds");

    return {
        startDate: periodStartDate,
        endDate: periodEndDate
    };
};

module.exports.SessionStore = function(db, config, session) {
    return new SessionStore(db, config, session);
};

module.exports.authentication = function(db, config) {
    return new authentication(db, config);
};

module.exports.mailer = function(db, config) {
    return new mailer(db, config);
};

module.exports.twilioUrl = function(db, config) {
    return new twilioUrl(db, config);
};
