var Service, Characteristic;
var http = require("http");

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerPlatform("homebridge-doorbird", "DoorBird", DoorBirdPlatform);
};

function DoorBirdPlatform(log, config) {
    this.log = log;
    this.devices = config["doorbird"];
    log("Starting discovery...");
}

DoorBirdPlatform.prototype = {
    accessories: function (callback) {
        var foundAccessories = [];
        var count = this.devices.length;

        for (index = 0; index < count; index++) {
            var doorBird = new DoorBird(this.log, this.devices[index]);
            foundAccessories.push(doorBird);
        }
        callback(foundAccessories);
    }
};

function DoorBird(log, config) {
    var self = this;
    this.log = log;
    this.name = config["name"];
    this.username = config["doorbird_username"];
    this.password = config["doorbird_password"];
    this.ip = config["doorbird_ip"];
    this.monitor = '/bha-api/monitor.cgi?ring=doorbell,motionsensor';
    this.open = '/bha-api/open-door.cgi?';
    this.light = '/bha-api/light-on.cgi?';
    this.serial = config["doorbird_serial"] || "4260423860001";
    this.model = config["doorbird_model"] || "D101";
    this.currentState = true;
    this.binaryState = 0;
    this.timeout = 2;
    this.httpport = config["http_port"];
    this.doorbellService = new Service.MotionSensor(this.name + ' Doorbell', 'Doorbell');
    this.motionService = new Service.MotionSensor(this.name + ' Motion', 'Motion');
    this.lightService = new Service.Lightbulb(this.name + ' Light');
    this.lockService = new Service.LockMechanism(this.name + ' Lock');

    this.log("Starting a homebridge-doorbird device with name '" + this.name + "'...");

    //Start HTTP server to listen for events
    var server = http.createServer(function (req, resp) {
        if (req.url == "/doorbell.html") {
            server.status_code = 204
            resp.writeHead(204, {
                "Content-Type": "text/plain"
            });
            resp.end("GET 204 " + http.STATUS_CODES[204] + " " + req.url + "\nThe server successfully processed the request and is not returning any content.")
            self.log("HTTP Server: doorbell.html was called, sending event to homebridge.")
            setTimeout(function () {
                self.doorbellService.getCharacteristic(Characteristic.MotionDetected).updateValue(true);
            }.bind(self), 10);

            setTimeout(function () {
                self.log('DoorBird resetting doorbell')
                self.doorbellService.getCharacteristic(Characteristic.MotionDetected).updateValue(false);
            }.bind(self), 5000);
        } else if (req.url == "/motion.html") {
            server.status_code = 204
            resp.writeHead(204, {
                "Content-Type": "text/plain"
            });
            resp.end("GET 204 " + http.STATUS_CODES[204] + " " + req.url + "\nThe server successfully processed the request and is not returning any content.")
            self.log("HTTP Server: motion.html was called, sending event to homebridge.")
            setTimeout(function () {
                self.motionService.getCharacteristic(Characteristic.MotionDetected).updateValue(true);
            }.bind(self), 10);

            setTimeout(function () {
                self.log('DoorBird resetting mtion')
                self.motionService.getCharacteristic(Characteristic.MotionDetected).updateValue(false);
            }.bind(self), 5000);
        } else {
            server.status_code = 404
            resp.writeHead(404, {
                "Content-Type": "text/plain"
            });
            resp.end("GET 404 " + http.STATUS_CODES[404] + " " + req.url + "\nThat File cannot be found")
            self.log("HTTP Server: GET 404 " + http.STATUS_CODES[404] + " " + req.url)
        }
    });
    server.listen(this.httpport, "0.0.0.0")
    this.log("HTTP Server started on port " + this.httpport);

    //Definde URLs for actions
    this.lockUrl = "http://" + this.ip + this.open + "&http-user=" + this.username + "&http-password=" + this.password
    var lightUrl = "http://" + this.ip + this.light + "&http-user=" + this.username + "&http-password=" + this.password

    //Unlock door event
    this.lockService
        .getCharacteristic(Characteristic.LockCurrentState)
        .on('get', this.getState.bind(this));

    this.lockService
        .getCharacteristic(Characteristic.LockTargetState)
        .on('get', this.getState.bind(this))
        .on('set', this.setState.bind(this));

    //Night vision event
    this.lightService.getCharacteristic(Characteristic.On)
        .on('set', function (value, callback) {
            request.get({
                url: lightUrl,
            }, function (err, response, body) {
                if (!err && response.statusCode == 200) {
                    self.log('DoorBird night vision activated for 3 minutes');
                    setTimeout(function () {
                        this.log('DoorBird resetting light event');
                        this.lightService.getCharacteristic(Characteristic.On).updateValue(0);
                    }.bind(self), 5000);
                }
                else {
                    self.log("DoorBird error '%s' setting light. Response: %s", err, body);
                    callback(err || new Error("Error setting light state"));
                }
            });
            callback();
        });
}

DoorBird.prototype.setState = function (state, callback) {
    var lockState = (state == Characteristic.LockTargetState.SECURED) ? "lock" : "unlock";
    var update = (state == Characteristic.LockTargetState.SECURED) ? true : false;
    self = this;

    self.log("DoorBird set state to ", lockState);
    self = this;
    self.currentState = (state == Characteristic.LockTargetState.SECURED) ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED;

    if (lockState == "unlock") {
        request.get({
            url: this.lockUrl,
        }, function (err, response, body) {
            if (!err && response.statusCode == 200) {

                //set state to unlocked
                self.lockService
                    .setCharacteristic(Characteristic.LockCurrentState, self.currentState);
                self.log("DoorBird lock opened")

                if (!update) {
                    setTimeout(function () {
                        //set state to unlocked
                        self.lockService
                            .setCharacteristic(Characteristic.LockTargetState, Characteristic.LockTargetState.SECURED)
                            .setCharacteristic(Characteristic.LockCurrentState, self.currentState);
                        update = true;
                        self.log("DoorBird auto lock initiated")
                    }.bind(this), 4000);
                }
            }

            else {
                self.log("DoorBird error '%s' opening lock. Response: %s", err, body);
                callback(err || new Error("DoorBird error setting lock state"));
            }
        });
    }

    callback(null);

};

DoorBird.prototype.getState = function (callback) {
    callback(null, this.currentState);
}

DoorBird.prototype.getServices = function () {
    var informationService = new Service.AccessoryInformation();
    informationService
        .setCharacteristic(Characteristic.Manufacturer, "DoorBird")
        .setCharacteristic(Characteristic.Model, this.model)
        .setCharacteristic(Characteristic.SerialNumber, this.serial);

    return [this.doorbellService, this.motionService, this.lightService, this.lockService, informationService];
};
