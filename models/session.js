module.exports = function(sequelize, DataTypes) {
    var Session = sequelize.define('Session', {
            session_id: {type: DataTypes.STRING, primaryKey: true},
            session_data: DataTypes.STRING,
            last_touch: DataTypes.DATE
        }, {
            classMethods: {
                associate: function(models) {
                }
            }
        });

    return Session;
};
