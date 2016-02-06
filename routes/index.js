var fs = require('fs');
var path  = require('path');
var utils = require('../utils/index');

module.exports = function(db, config, passport) {
    var routes = {};

    // Read route files in the directory and import them
    fs
        .readdirSync(__dirname)
        .filter(function(file) {
            return (file.indexOf('.') !== 0) && (file !== 'index.js');
        })
        .forEach(function(file) {
            var route = require(path.join(__dirname, file))(db, config, passport);
            var routeName = utils.camelizeFileName(file, '.js');
            routes[routeName] = route;
        });

    return routes;
};