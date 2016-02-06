(function() {
    Phonjour = {
        // Returns promise that will call the callback function(data, textStatus, jqXHR)
        api: function(category, command, data) {
            return $.ajax('https://' + window.location.host + '/api/' + category + '/' + command, {
                dataType: "json",
                contentType: "application/json",
                data: JSON.stringify(data),
                method: "POST"}
            );
        }
    };
})();