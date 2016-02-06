var moment = require('moment');

module.exports = function(sequelize, DataTypes) {
    var Extension = sequelize.define('Extension', {
            main: DataTypes.BOOLEAN,
            number: DataTypes.STRING,
            name: DataTypes.STRING,
            external_phone_number: DataTypes.STRING,
            use_global_schedule: DataTypes.BOOLEAN,
            voicemail: DataTypes.BOOLEAN
        }, {
            classMethods: {
                associate: function(models) {
                    Extension.belongsTo(models.PhoneNumber);
                    Extension.hasMany(models.Greeting);
                    Extension.hasMany(models.Schedule);
                },
                isExtensionValid: function(extension) {
                    return extension &&
                            (extension + "").length < 15 &&
                            parseInt(extension + "") >= 0;
                }
            },
            instanceMethods: {
                // Determines if the extension (including schedules) is available now. "adjustment" (min) is added to the server time.
                isOpen: function(adjustment, now) {
                    if (!this.Schedules || !this.Schedules.length) {
                        return false;
                    }

                    adjustment = adjustment || 0;
                    now = now || moment().utc();
                    now = now.add(adjustment, "m");

                    var todayDayOfWeek = now.isoWeekday() - 1;
                    // Every 15 minutes is one unit, as per db.Schedule
                    var nowNumber = now.hour() * 4.0 + now.minute() / 15.0;

                    var scheduleIndex = null, i;
                    for (i = 0; !scheduleIndex && i < this.Schedules.length; i++) {
                        if (this.Schedules[i].day_of_week === todayDayOfWeek) {
                            scheduleIndex = i;
                        }
                    }

                    if (scheduleIndex !== null &&
                            this.Schedules[scheduleIndex].start_time <= nowNumber &&
                            this.Schedules[scheduleIndex].end_time >= nowNumber) {
                        return true;
                    }

                    // Businesses can be open until 9am next day. If after 9am, don't check for yesterday's schedule.
                    if (nowNumber > 9 * 4) {
                        return false;
                    }

                    var yesterdayDayOfWeek = (todayDayOfWeek + 6) % 7;
                    nowNumber += 24.0 * 4;
                    scheduleIndex = null;
                    for (i = 0; !scheduleIndex && i < this.Schedules.length; i++) {
                        if (this.Schedules[i].day_of_week === yesterdayDayOfWeek) {
                            scheduleIndex = i;
                        }
                    }

                    return scheduleIndex !== null &&
                            this.Schedules[scheduleIndex].start_time <= nowNumber &&
                            this.Schedules[scheduleIndex].end_time >= nowNumber;
                }
            }
        });

    return Extension;
};
