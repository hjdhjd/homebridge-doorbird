var Accessory, hap, Service, Characteristic, UUIDGen;

var FFMPEG = require('./ffmpeg').FFMPEG;

var http = require('http');
var qs = require('querystring');
var concat = require('concat-stream');
var request = require("request");
var exec = require("child_process").exec;

module.exports = function (homebridge) {
    Accessory = homebridge.platformAccessory;
    hap = homebridge.hap;
    Service = hap.Service;
    Characteristic = hap.Characteristic;
    UUIDGen = homebridge.hap.uuid;

    homebridge.registerPlatform("homebridge-doorbird", "DoorBird", doorBirdPlatform, true);
}

function doorBirdPlatform(log, config, api) {
    var self = this;

    self.log = log;
    self.config = config || {};
    self.currentState = true;

    if (api) {
        self.api = api;

        if (api.version < 2.1) {
            throw new Error("Unexpected API version.");
        }

        self.api.on('didFinishLaunching', self.didFinishLaunching.bind(this));
    }
}

doorBirdPlatform.prototype = {
    accessories: function (callback) {
        var foundAccessories = [];
        var count = this.devices.length;

        for (index = 0; index < count; index++) {
            var doorBirdPlatform = new doorBirdPlatform(this.log, this.devices[index]);
            foundAccessories.push(doorBirdPlatform);
        }
        callback(foundAccessories);
    }
};

doorBirdPlatform.prototype.configureAccessory = function (accessory) {
    // Won't be invoked
}

doorBirdPlatform.prototype.identify = function (primaryService, paired, callback) {

    primaryService.getCharacteristic(Characteristic.ProgrammableSwitchEvent).setValue(0);
    callback();
}

doorBirdPlatform.prototype.EventWithAccessory = function (accessory) {

    accessory.getService(Service.Doorbell).getCharacteristic(Characteristic.ProgrammableSwitchEvent).setValue(0);
}

doorBirdPlatform.prototype.didFinishLaunching = function () {
    var self = this;
    var videoProcessor = self.config.videoProcessor || 'ffmpeg';

    if (self.config.cameras) {
        var configuredAccessories = [];

        var cameras = self.config.cameras;
        cameras.forEach(function (cameraConfig) {
            var cameraName = cameraConfig.name;

            self.ip = cameraConfig.doorbird_ip;
            self.username = cameraConfig.doorbird_username;
            self.password = cameraConfig.doorbird_password;
            self.cmdDoorbell = cameraConfig.cmd_doorbell;
            self.cmdMotionsensor = cameraConfig.cmd_motionsensor;
            self.light = '/bha-api/light-on.cgi?';
            self.open = '/bha-api/open-door.cgi?';

            var videoConfig = cameraConfig.videoConfig;
            var webserverPort = videoConfig.port || 5005;

            if (!cameraName || !videoConfig) {
                self.log("Missing parameters.");
                return;
            }

            var uuid = UUIDGen.generate(cameraName);
            var doorBirdAccessory = new Accessory(cameraName, uuid, hap.Accessory.Categories.VIDEO_DOORBELL);

            self.lockUrl = "http://" + self.ip + self.open + "&http-user=" + self.username + "&http-password=" + self.password
            var lightUrl = "http://" + self.ip + self.light + "&http-user=" + self.username + "&http-password=" + self.password

            //Add motion Accessory to Platform
            var motionService = doorBirdAccessory.addService(Service.MotionSensor,  "Motion Sensor");

            //Add light Accessory to Platform
            var lightService = doorBirdAccessory.addService(Service.Lightbulb, "Light");

            lightService.getCharacteristic(Characteristic.On)
               .on('set', function (value, callback) {
                   request.get({
                       url: lightUrl,
                   }, function (err, response, body) {
                       if (!err && response.statusCode == 200) {
                           self.log('DoorBird night vision activated for 3 minutes');
                           setTimeout(function () {
                               self.log('DoorBird resetting light event');
                               lightService.getCharacteristic(Characteristic.On).updateValue(0);
                           }.bind(self), 5000);
                       }
                       else {
                           self.log("DoorBird error '%s' setting light. Response: %s", err, body);
                           callback(err || new Error("Error setting light state"));
                       }
                   });
                   callback();
            });

            //Add lock Accessory
            self.lockService = doorBirdAccessory.addService(Service.LockMechanism,  " Lock");

            //Setup LockMechanism
            self.lockService
              .getCharacteristic(Characteristic.LockCurrentState)
              .on('get', self.getState.bind(self));

            self.lockService
              .getCharacteristic(Characteristic.LockTargetState)
              .on('get', self.getState.bind(self))
              .on('set', self.setState.bind(self));

            // Doorbell has to be the primary service
            var primaryService = new Service.Doorbell(cameraName);
            primaryService.getCharacteristic(Characteristic.ProgrammableSwitchEvent).on('get', self.getState.bind(this));

            // Setup and configure the camera services
            var cameraSource = new FFMPEG(hap, cameraConfig, self.log, videoProcessor);
            doorBirdAccessory.configureCameraSource(cameraSource);

            // Setup HomeKit doorbell service
            doorBirdAccessory.addService(primaryService);

            // Identify
            doorBirdAccessory.on('identify', self.identify.bind(this, primaryService));

            //Add Services
            var speakerService = new Service.Speaker("Speaker");
            doorBirdAccessory.addService(speakerService);

            var microphoneService = new Service.Microphone("Microphone");
            doorBirdAccessory.addService(microphoneService);

            configuredAccessories.push(doorBirdAccessory);

            self.api.publishCameraAccessories("homebridge-doorbird", configuredAccessories);

            var server = http.createServer(function (req, res) {
              if (req.url == "/doorbell.html") {
                    server.status_code = 204
                    res.writeHead(204, {
                        "Content-Type": "text/plain"
                    });
                    self.EventWithAccessory(doorBirdAccessory);
                    res.end("GET 204 " + http.STATUS_CODES[204] + " " + req.url + "\nThe server successfully processed the request and is not returning any content.")
                    self.log("HTTP Server: doorbell.html was called, sending event to homebridge.")

                    self.log(this.cmdDoorbell);
                    if (self.cmdDoorbell)
                    {
                       self.log("HTTP Server: executing '%s'", self.cmdDoorbell);
                       exec(self.cmdDoorbell, function(error, stdout, stderr) {
                         // command output is in stdout
                         if (error)
                         {
                            self.log(error);
                         }
                       });
                    }

                } else if (req.url == "/motion.html") {
                    server.status_code = 204
                    res.writeHead(204, {
                        "Content-Type": "text/plain"
                    });
                    res.end("GET 204 " + http.STATUS_CODES[204] + " " + req.url + "\nThe server successfully processed the request and is not returning any content.")
                    self.log("HTTP Server: motion.html was called, sending event to homebridge.")
                    setTimeout(function () {

                        motionService.getCharacteristic(Characteristic.MotionDetected).updateValue(true);

                    }.bind(self), 10);

                    if (self.cmdMotionsensor)
                    {
                       self.log("HTTP Server: executing '%s'", self.cmdMotionsensor);
                       exec(self.cmdMotionsensor, function(error, stdout, stderr) {
                         // command output is in stdout
                         if (error)
                         {
                            self.log(error);
                         }
                       });
                    }

                    setTimeout(function () {

                        self.log('DoorBird resetting motion')
                        motionService.getCharacteristic(Characteristic.MotionDetected).updateValue(false);

                    }.bind(self), 5000);

                } else {
                    server.status_code = 404
                    res.writeHead(404, {
                        "Content-Type": "text/plain"
                    });
                    res.end("GET 404 " + http.STATUS_CODES[404] + " " + req.url + "\nThat File cannot be found")
                    self.log("HTTP Server: GET 404 " + http.STATUS_CODES[404] + " " + req.url)
                }

            });

            server.listen(webserverPort, function () {
                self.log(" %s is listening on port %s", cameraName, webserverPort);
            }.bind(this));

	          server.on('error', function (err) {
                self.log(" %s Port %s Server %s ", cameraName, webserverPort, err);
            }.bind(this));
        });
    }
}

doorBirdPlatform.prototype.getState = function (callback) {

    callback(null, this.currentState);
}

doorBirdPlatform.prototype.setState = function (state, callback) {
    var lockState = (state == Characteristic.LockTargetState.SECURED) ? "lock" : "unlock";
    var update = (state == Characteristic.LockTargetState.SECURED) ? true : false;
    self = this;
    self.log("DoorBird set state to ", lockState);
    self.currentState = (state == Characteristic.LockTargetState.SECURED) ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED;

    if (lockState == "unlock") {
        request.get({
            url: self.lockUrl,
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
