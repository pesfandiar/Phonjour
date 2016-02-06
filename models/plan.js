var BigNumber = require('bignumber.js');

var ADDON_MONTHLY_RATES = Object.freeze({
    '0': new BigNumber("0"),
    '200': new BigNumber("6.99"),
    '500': new BigNumber("15.99")
});

var PLAN_RATES = Object.freeze({
    'TOLL_FREE': new BigNumber("9.99"),
    'LOCAL': new BigNumber("5.99")
});

var MINUTE_RATE = Object.freeze({
    'TOLL_FREE': new BigNumber("0.06"),
    'LOCAL': new BigNumber("0.04")
});

var ADDON_MINUTES = Object.freeze({
    '0': 0,
    '200': 200,
    '500': 500
});


module.exports = function(sequelize, DataTypes) {
    var Plan = sequelize.define('Plan', {
            code: DataTypes.STRING,
            price: DataTypes.DECIMAL(10, 2),
            minute_rate: DataTypes.DECIMAL(10, 2),
            minutes_included: DataTypes.INTEGER,
            start_date: DataTypes.DATE,
            end_date: DataTypes.DATE // NULL = ongoing, otherwise it's at whole months after start_date (using moment.js's add("months"))
        }, {
            classMethods: {
                associate: function(models) {
                    Plan.belongsTo(models.Account);
                },
                getAddOnMonthlyRate: function(addOn) {
                    return ADDON_MONTHLY_RATES[addOn];
                },
                getPlanMonthlyRate: function(plan) {
                    return PLAN_RATES[plan];
                },
                getPlanMinuteRate: function(plan) {
                    return MINUTE_RATE[plan];
                },
                getAddOnMinutesIncluded: function(addOn) {
                    return ADDON_MINUTES[addOn];
                },
                getCode: function(localOrTollFree, addOn) {
                    return localOrTollFree + ":" + addOn;
                },
                getAddOn: function(minutesIncluded) {
                    for (var addOn in ADDON_MINUTES) {
                        if (ADDON_MINUTES[addOn] === minutesIncluded) {
                            return addOn;
                        }
                    }
                    return null;
                },
                // Create a string that will initialize the constant once evaluated in javascript. BigNumber.js should be present.
                getFrontendInitialization: function() {
                    function addBigNumberValues(list) {
                        var result = "";
                        for (var index in list) {
                            if (list.hasOwnProperty(index)) {
                                result += "'" + index + "':new BigNumber('" + list[index].toFixed(2) + "'),";
                            }
                        }
                        return result;
                    }
                    var index;
                    var result = "var ADDON_MONTHLY_RATES = Object.freeze({";
                    result += addBigNumberValues(ADDON_MONTHLY_RATES);
                    result += "});";

                    result += "var PLAN_RATES = Object.freeze({";
                    result += addBigNumberValues(PLAN_RATES);
                    result += "});";

                    result += "var MINUTE_RATE = Object.freeze({";
                    result += addBigNumberValues(MINUTE_RATE);
                    result += "});";

                    result += "var ADDON_MINUTES = Object.freeze({";
                    for (index in ADDON_MINUTES) {
                        if (ADDON_MINUTES.hasOwnProperty(index)) {
                            result += "'" + index + "':" + ADDON_MINUTES[index] + ",";
                        }
                    }
                    result += "});";

                    return result;
                }
            }
        });

    return Plan;
};
