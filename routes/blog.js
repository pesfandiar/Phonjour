var express = require('express');
var router = express.Router();
var fs = require('fs');
var path  = require('path');
var utils = require('../utils/index');


module.exports = function(db, config, passport) {
    var apiPath = path.join(__dirname, '../views/blogs');

    // Read all files under 'blogs' folder, and add them to "/blog/<file_name>" path
    fs
        .readdirSync(apiPath)
        .filter(function(file) {
            return file.indexOf('.') !== 0;
        })
        .forEach(function(file) {
            var blogName = path.parse(file).name;
            router.use('/' + blogName, (function (blogName) {
                return function(req, res) {
                    res.render("blogs/" + blogName, {override_page_title: true});
                };
            })(blogName));
        });

    return router;
};
