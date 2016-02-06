var TOLL_FREE_PREFIXES = Object.freeze({
    '800': true,
    '888': true,
    '877': true,
    '866': true,
    '855': true,
    '844': true,
    '833': true,
    '822': true,
    '880': true,
    '881': true,
    '882': true,
    '883': true,
    '884': true,
    '885': true,
    '886': true,
    '887': true,
    '889': true
});

var COUNTRY_CODE = "1";

var BANNED_AREA_CODES = Object.freeze({
    '907': true,
    '1907': true
});

module.exports = function(sequelize, DataTypes) {
    var PhoneNumber = sequelize.define('PhoneNumber', {
            number: DataTypes.STRING,
            friendly_name: DataTypes.STRING,
            sid: DataTypes.STRING,
            type: DataTypes.ENUM('LOCAL', 'TOLL_FREE'),
            url: DataTypes.STRING,
            do_not_disturb: DataTypes.BOOLEAN
        }, {
            classMethods: {
                associate: function(models) {
                    PhoneNumber.belongsTo(models.Account);
                    PhoneNumber.hasMany(models.Extension);
                    PhoneNumber.hasMany(models.Usage);
                },
                isTollFree: function(areaCode) {
                    return (areaCode in TOLL_FREE_PREFIXES);
                },
                getCountryCode: function() {
                    return COUNTRY_CODE;
                },
                isAreaCodeAllowed: function(areaCode) {
                    return !(areaCode in BANNED_AREA_CODES);
                },
                isShortCode: function(canonicalPhoneNumber) {
                    return canonicalPhoneNumber.length - COUNTRY_CODE.length - 1 <= 6;
                }
            }
        });

    return PhoneNumber;
};
