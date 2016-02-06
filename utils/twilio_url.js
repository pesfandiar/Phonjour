module.exports = function(db, config) {
    this.init = function (uuid) {
        return config.twilioUrl + "/init/" + uuid;
    };

    this.extension = function(uuid) {
        return config.twilioUrl + "/extension/" + uuid;
    };

    this.callEnded = function(uuid, externalPhoneNumber) {
        return config.twilioUrl + "/callEnded/" + uuid + "/" + externalPhoneNumber;
    };

    this.forward = function(uuid, externalPhoneNumber) {
        return config.twilioUrl + "/forward/" + uuid + "/" + externalPhoneNumber;
    };

    this.record = function(uuid) {
        return config.twilioUrl + "/record/" + uuid;
    };

    return this;
};