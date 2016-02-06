var PROMOTIONS = [
    {
        code: "TREEFIDDY",
        description: "50% off the monthly fee for 3 months",
        duration: 3,
        durationUnit: "months",
        priceDiscount: "0.5",
        minuteRateDiscount: "0.0",
        public: true
    },
    {
        code: "PLANONUS",
        description: "No monthly fee for 1 month",
        duration: 1,
        durationUnit: "months",
        priceDiscount: "1.0",
        minuteRateDiscount: "0.0",
        public: true
    },
    {
        code: "FLIPPA15",
        description: "No fees for 1 month",
        duration: 1,
        durationUnit: "months",
        priceDiscount: "1.0",
        minuteRateDiscount: "1.0",
        public: false
    }
];

module.exports = function(sequelize, DataTypes) {
    var Promotion = sequelize.define('Promotion', {
            code: DataTypes.STRING,
            description: DataTypes.STRING,
            start_date: DataTypes.DATE,
            end_date: DataTypes.DATE,
            price_discount: DataTypes.DECIMAL(5, 2), // Discount for monthly rate. 0 = no discount, 1 = free, 0.25 = 25% off, etc.
            minute_rate_discount: DataTypes.DECIMAL(5, 2), // Discount for minutes rate. 0 = no discount, 1 = free, 0.25 = 25% off, etc.
        }, {
            classMethods: {
                associate: function(models) {
                    Promotion.belongsTo(models.Account);
                },
                getPromotions: function() {
                    return PROMOTIONS;
                },
                getPromotion: function(code) {
                    for (var index = 0; index < PROMOTIONS.length; index++) {
                        if (PROMOTIONS[index].code === code) {
                            return PROMOTIONS[index];
                        }
                    }
                    return null;
                },
                // Create a string that will initialize the constant once evaluated in javascript.
                getFrontendInitialization: function() {
                    var result = "var PROMOTIONS = Object.freeze({";
                    for (var index = 0; index < PROMOTIONS.length; index++) {
                        var promotion = PROMOTIONS[index];
                        if (promotion.public) {
                            result += "'" + promotion.code + "': '" + promotion.description + "',";
                        }
                    }
                    result += "});";

                    return result;
                }
            }
        });

    return Promotion;
};
