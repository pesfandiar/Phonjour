module.exports = function(sequelize, DataTypes) {
    var Billing = sequelize.define('Billing', {
            amount: DataTypes.DECIMAL(10, 2),
            external_id: DataTypes.STRING,
            paid: DataTypes.BOOLEAN,
            period_start: DataTypes.DATE,
            period_end: DataTypes.DATE,
            message: DataTypes.STRING
        }, {
            classMethods: {
                associate: function(models) {
                    Billing.belongsTo(models.Account);
                }
            }
        });

    return Billing;
};
