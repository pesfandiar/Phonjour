module.exports = function(sequelize, DataTypes) {
    var Usage = sequelize.define('Usage', {
            from_number: DataTypes.STRING,
            to_number: DataTypes.STRING,
            duration: DataTypes.INTEGER, // This is in seconds
            status: DataTypes.STRING,
            sid: DataTypes.STRING,
            dial_duration: DataTypes.INTEGER, // This is in seconds
            dial_status: DataTypes.STRING,
            dial_sid: DataTypes.STRING,
            direction: DataTypes.STRING
        }, {
            classMethods: {
                associate: function(models) {
                    Usage.belongsTo(models.PhoneNumber);
                }
            }
        });

    return Usage;
};
