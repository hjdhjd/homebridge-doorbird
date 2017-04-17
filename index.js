var Service, Characteristic;
var request = require('request');
var hyperquest = require('hyperquest');

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  homebridge.registerPlatform("homebridge-doorbird", "Doorbell", DoorBirdPlatform);
};

function DoorBirdPlatform(log, config) {
  this.log = log;
  this.devices = config["doorbells"];
  log("Starting discovery...");
}

DoorBirdPlatform.prototype = {
  accessories: function(callback) {
    var foundAccessories = [];
    var count = this.devices.length;

    for(index = 0; index < count; index++){
		  var doorBellAccessory  = new DoorBirdAccessory(this.log, this.devices[index]);
		  foundAccessories.push(doorBellAccessory);
	  }
      callback(foundAccessories);
  }
};

function DoorBirdAccessory(log, config) {
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
  this.binaryState = 0;
  this.doorbellService;
  this.motionService;
  this.timeout = 2;
  this.doorbellService = new Service.MotionSensor(this.name + ' Doorbell', 'Doorbell');
  this.motionService = new Service.MotionSensor(this.name + ' Motion', 'Motion');
  this.lightService = new Service.Lightbulb(this.name + ' Light');
  this.openDoorService = new Service.LockMechanism(this.name + ' Lock');

  this.log("Starting a homebridge-doorbird device with name '" + this.name + "'...");

  var activityUrl = "http://" + this.ip + this.monitor + "&http-user=" + this.username + "&http-password=" + this.password
  var lockUrl = "http://" + this.ip + this.open + "&http-user=" + this.username + "&http-password=" + this.password
  var lightUrl =  "http://" + this.ip + this.light + "&http-user=" + this.username + "&http-password=" + this.password

  //Night vision event
  this.lightService.getCharacteristic(Characteristic.On)
    .on('set', function(value, callback) {
      request.get({
        url: lightUrl,
        }, function(err, response, body) {
          if (!err && response.statusCode == 200) {
            console.log('Night vision activated for 3 minutes');
            setTimeout(function() {
              console.log('Resetting light event');
              this.lightService.getCharacteristic(Characteristic.On).updateValue(0);
              }.bind(self), 5000);
          }
          else {
            console.log("Error '%s' setting light. Response: %s", err, body);
            callback(err || new Error("Error setting light state"));
          }
      });
      callback();
  });

  //Open door event
  this.openDoorService.getCharacteristic(Characteristic.LockCurrentState)
    .on('set', function(value, callback) {
      request.get({
        url: lockUrl,
        }, function(err, response, body) {
          if (!err && response.statusCode == 200) {
            console.log('DoorBird open door activated')
            setTimeout(function() {
              console.log('Resetting open door event');
              this.openDoorService.getCharacteristic(Characteristic.TargetPosition).updateValue(0);
            }.bind(self), 5000);
          }
          else {
            console.log("Error '%s' opening lock. Response: %s", err, body);
            callback(err || new Error("Error setting lock state"));
          }
      });
      callback();
  });

  //Handle streaming requests for motion and doorbell
  var r = hyperquest(activityUrl)
  r.on('data', function(response) {
    var doorbirdResponse = String(response)
    var doorbellState = doorbirdResponse.match(/doorbell:H/g);
    var motionState = doorbirdResponse.match(/motionsensor:H/g);

    if(doorbellState) {
          setTimeout(function() {
 	        self.doorbellService.getCharacteristic(Characteristic.MotionDetected).updateValue(true);
 	      }.bind(self), 10);

      setTimeout(function() {
        console.log('Resetting Doorbird doorbell')
        self.doorbellService.getCharacteristic(Characteristic.MotionDetected).updateValue(false);
        }.bind(self), 5000);
      };

    if(motionState) {
          setTimeout(function() {
          self.motionService.getCharacteristic(Characteristic.MotionDetected).updateValue(true);
        }.bind(self), 10);

      setTimeout(function() {
        console.log('Resetting Doorbird motion')
        self.motionService.getCharacteristic(Characteristic.MotionDetected).updateValue(false);
        }.bind(self), 5000);
      };
    })
   };

DoorBirdAccessory.prototype.getServices = function() {
    var informationService = new Service.AccessoryInformation();
    informationService
      .setCharacteristic(Characteristic.Manufacturer, "DoorBird")
      .setCharacteristic(Characteristic.Model, this.model)
      .setCharacteristic(Characteristic.SerialNumber, this.serial);

    return [this.doorbellService, this.motionService, this.lightService, this.openDoorService, informationService];
};
