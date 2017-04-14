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
		  var accessory  = new DoorBirdAccessory(this.log, this.devices[index]);
		  foundAccessories.push(accessory);
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
  this.url = config["doorbird_url"];
  this.serial = config["doorbird_serial"] || "4260423860001";
  this.model = config["doorbird_model"] || "D101";
  this.binaryState = 0;
  this.log("Starting a homebridge-doorbird device with name '" + this.name + "'...");
  this.service;
  this.timeout = 2;
  var url = "http://" + this.ip + this.url + "&http-user=" + this.username + "&http-password=" + this.password

  var r = hyperquest(url)
  r.on('data', function(response) {
    var doorbirdResponse = String(response)
    var doorbellState = doorbirdResponse.split(/[:]+/).pop();
    if(doorbellState.trim() != "L") {
          setTimeout(function() {
 	        self.service.getCharacteristic(Characteristic.MotionDetected).updateValue(true);
 	      }.bind(self), 10);

      //reset state
      setTimeout(function() {
        console.log("Resetting Doorbird")
        self.service.getCharacteristic(Characteristic.MotionDetected).updateValue(false);
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

    this.service = new Service.MotionSensor(this.name);

    var targetChar = this.service
      .getCharacteristic(Characteristic.MotionDetected);

return [this.service, informationService];
};
