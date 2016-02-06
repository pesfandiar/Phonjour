var express = require('express');
var router = express.Router();
var fs = require('fs');
var path  = require('path');
var utils = require('../utils/index');


module.exports = function(db, config, passport) {
    var apiPath = path.join(__dirname, 'apis');

    // Read all files under 'apis' folder, and add them to "/api/<api_name>" path
    fs
        .readdirSync(apiPath)
        .filter(function(file) {
            return file.indexOf('.') !== 0;
        })
        .forEach(function(file) {
            var apiRouter = require(path.join(apiPath, file))(db, config, passport);
            var routerName = utils.camelizeFileName(file, '.js');
            router.use('/' + routerName, apiRouter);
        });

    return router;
};
