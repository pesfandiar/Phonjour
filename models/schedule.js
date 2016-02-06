module.exports = function(sequelize, DataTypes) {
    var Schedule = sequelize.define('Schedule', {
            start_time: DataTypes.INTEGER, // Multiplier of 15-min time slots from midnight [0, 24*4*2)
            end_time: DataTypes.INTEGER, // Multiplier of 15-min time slots from midnight [0, 24*4*2)
            day_of_week: DataTypes.INTEGER, // Starting from Monday = 0, where 7 is reserved for holidays
            open: DataTypes.BOOLEAN
        }, {
            classMethods: {
                associate: function(models) {
                    Schedule.belongsTo(models.Extension);
                }
            }
        });

    return Schedule;
};
