module.exports = function(sequelize, DataTypes) {
    var Account = sequelize.define('Account', {
            name: DataTypes.STRING,
            phone: DataTypes.STRING,
            email: DataTypes.STRING,
            company: DataTypes.STRING,
            timezone: DataTypes.STRING,
            password_hash: DataTypes.STRING,
            uuid: DataTypes.STRING,
            status: DataTypes.ENUM('SIGNED_UP', 'PAYMENT_ON_FILE', 'PURCHASED', 'TERMINATED'),
            note: DataTypes.STRING
        }, {
            classMethods: {
                associate: function(models) {
                    Account.hasOne(models.PhoneNumber);
                    Account.hasOne(models.PaymentInfo);
                    Account.hasMany(models.Plan);
                    Account.hasMany(models.Billing);
                    Account.hasMany(models.Promotion);
                }
            },
            instanceMethods: {
                isFunctional: function() {
                    return this.status !== "TERMINATED";
                }
            }
        });

    return Account;
};
