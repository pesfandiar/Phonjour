module.exports = function(sequelize, DataTypes) {
    var Contact = sequelize.define('Contact', {
            email: DataTypes.STRING,
            note: DataTypes.STRING
        }, {
            classMethods: {
                associate: function(models) {
                }
            }
        });

    return Contact;
};
