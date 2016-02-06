module.exports = function(sequelize, DataTypes) {
    var PaymentInfo = sequelize.define('PaymentInfo', {
            external_id: DataTypes.STRING,
            provider: DataTypes.ENUM('STRIPE')
        }, {
            classMethods: {
                associate: function(models) {
                    PaymentInfo.belongsTo(models.Account);
                }
            }
        });

    return PaymentInfo;
};
