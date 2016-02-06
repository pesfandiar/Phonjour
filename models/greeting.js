module.exports = function(sequelize, DataTypes) {
    var Greeting = sequelize.define('Greeting', {
            type: DataTypes.ENUM('T2S', 'RECORDED'),
            text: DataTypes.STRING,
            open: DataTypes.BOOLEAN
        }, {
            classMethods: {
                associate: function(models) {
                    Greeting.belongsTo(models.Extension);
                },
                defaultOpenGreeting: function() {
                    return "Hello. Please enter the extension number you are trying to reach and then press the number sign.";
                },
                defaultClosedGreeting: function() {
                    return "Hello. We are closed at this time. Please call again during business hours.";
                },
                defaultAvailableGreeting: function() {
                    return "Please wait while we connect you to the extension.";
                },
                defaultUnavailableGreeting: function() {
                    return "Hello. The extension is not available at this time. Please call again during available hours.";
                }
            }
        });

    return Greeting;
};
