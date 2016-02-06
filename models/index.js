var fs = require('fs');
var path  = require('path');
var Sequelize = require('sequelize');
var lodash  = require('lodash');
var sequelize_fixtures = require('sequelize-fixtures');
var async = require('async');

var config = require('../config')();

// Instantiate a sequelize and connect to the database
var sequelize = new Sequelize(config.db_database, config.db_username, config.db_password, {
    host: config.db_host,
    port: config.db_port,
    dialect: 'mysql',
    logging: false,
    pool: {
        maxConnections: 5,
        maxIdleTime: 30000
    }
});

var db = {};

// Read model files in the directory and import them
fs
    .readdirSync(__dirname)
    .filter(function(file) {
        return (file.indexOf('.') !== 0) && (file.indexOf('.js', file.length - 3) !== -1) && (file !== 'index.js');
    })
    .forEach(function(file) {
        var model = sequelize.import(path.join(__dirname, file));
        db[model.name] = model;
    });

// Define associations
Object.keys(db).forEach(function(modelName) {
    if ('associate' in db[modelName]) {
        db[modelName].associate(db);
    }
});

async.series([
    // Force deletion and creation of database tables
    function(callback) {
        if (config.sync_db_on_start) {
            sequelize
                .sync({force: true})
                .complete(function(err) {
                    if (!!err) {
                        console.log("Error: Unable to synchronize the database.");
                        throw err[0];
                    }
                    callback(null);
                });
        } else {
            callback(null);
        }
    },
    // Add fixture to the database
    function(callback) {
        if (config.add_db_fixture) {
            sequelize_fixtures.loadFile(path.join(__dirname, 'fixtures/*.json'), db, function(err){
                if (!!err) {
                    console.log("Error: Unable to add fixtures to the database.");
                    throw err;
                }
                callback(null);
            });
        } else {
            callback(null);
        }
    }
]);

// Combine Sequelize (the library) and sequelize (the instance) with db (the models)
module.exports = lodash.extend({
  sequelize: sequelize,
  Sequelize: Sequelize
}, db);