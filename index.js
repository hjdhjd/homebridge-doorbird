var Accessory, hap, Service, Characteristic, UUIDGen;

var FFMPEG = require('./ffmpeg').FFMPEG;

var http = require('http');
var qs = require('querystring');
var concat = require('concat-stream');
var request = require('request');
var exec = require('child_process').exec;
var rp = require('request-promise');

module.exports = function(homebridge) {
  Accessory = homebridge.platformAccessory;
  hap = homebridge.hap;
  Service = hap.Service;
  Characteristic = hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;

  homebridge.registerPlatform('homebridge-doorbird', 'Doorbird', doorBirdPlatform, true);
}

function doorBirdPlatform(log, config, api) {
  var self = this;

  self.log = log;
  self.config = config || {};
  
  if(api) {
    self.api = api;

    if(api.version < 2.1) {
      throw new Error('Unexpected Homebridge API version.');
    }

    self.api.on('didFinishLaunching', self.didFinishLaunching.bind(this));
  }
}

doorBirdPlatform.prototype = {
  accessories: function(callback) {
    var foundAccessories = [];
    var count = this.devices.length;
    var index;

    for(index = 0; index < count; index++) {
      var doorBirdPlatform = new doorBirdPlatform(this.log, this.devices[index]);
      foundAccessories.push(doorBirdPlatform);
    }
    
    callback(foundAccessories);
  }
};

doorBirdPlatform.prototype.configureAccessory = function(accessory) {
    // Won't be invoked.
}

doorBirdPlatform.prototype.identify = function(primaryService, paired, callback) {
  primaryService.getCharacteristic(Characteristic.ProgrammableSwitchEvent).setValue(0);
  callback();
}

doorBirdPlatform.prototype.EventWithAccessory = function(accessory) {
  accessory.getService(Service.Doorbell).getCharacteristic(Characteristic.ProgrammableSwitchEvent).setValue(0);
}

doorBirdPlatform.prototype.didFinishLaunching = function() {
  var self = this;
  var videoProcessor = self.config.videoProcessor;

  if(self.config.cameras) {
    var configuredAccessories = [];
    var cameras = self.config.cameras;
    
    cameras.forEach(function(cameraConfig) {
      var doorBirdInfo = {};
      var cameraName = cameraConfig.name || self.config.name || 'Doorbird';

      // Debugging?
      self.debug = cameraConfig.debug === true;

      // Required parameters to configure Doorbird.
      self.ip = cameraConfig.doorbird;
      self.username = cameraConfig.username;
      self.password = cameraConfig.password;

      // Optional command line actions on certain events.
      self.cmdDoorbell = cameraConfig.cmdDoorbell;
      self.cmdMotion = cameraConfig.cmdMotion;

      // Initialize the array of relays.
      self.lockService = {};
      self.lockState = {};
      self.lockUrl = {};
      self.primaryRelay = 0;

      // You must specify at least the IP of the Doorbird,
      // a username, and a password.
      if(!self.ip || !self.username || !self.password) {
        self.log('Missing required configuration parameters.');
        return;
      }

      // Doorbird credentials.
      self.doorBirdAuth = self.username + ':' + self.password + '@' + self.ip;

      // Set the night light URL.
      self.lightUrl = 'http://' + self.doorBirdAuth + '/bha-api/light-on.cgi?';

      // Let's configure reasonable defaults for Doorbird.
      var videoConfig = self.config.videoConfig;
      var webserverPort = self.config.port || 5005;

      var source = '-re -rtsp_transport tcp -i rtsp://' + self.doorBirdAuth + ':8557/mpeg/media.amp';
      var stillImageSource = '-i http://' + self.doorBirdAuth + '/bha-api/image.cgi';
      var additionalCommandline = '-preset slow -profile:v high -level 4.2 -x264-params intra-refresh=1:bframes=0';
      var audio = cameraConfig.audio === true;
      var mapaudio;
      var maxStreams = 4;
      var maxWidth = 1280;
      var maxHeight = 720;
      var maxFPS = 15;
      var packetSize = 376;
      var videoDebug = false;
      
      // Configure audio.
      if(cameraConfig.audio) {
        source += ' -f mulaw -ar 8000 -i http://' + self.doorBirdAuth + '/bha-api/audio-receive.cgi';
        mapaudio = '1:0';
      }
      
      // User-defined configuration to override the defaults.
      if(videoConfig) {
        videoDebug = videoConfig.debug === true;
        
        if(videoConfig.source) {
          source = videoConfig.source;
        }

        if(videoConfig.stillImageSource) {
          stillImageSource = videoConfig.stillImageSource;
        }

        if(videoConfig.additionalCommandline) {
          additionalCommandline = videoConfig.additionalCommandline;
        }

        if(!videoConfig.maxStreams) {
          maxStreams = videoConfig.maxStreams;
        }

        if(!videoConfig.maxWidth) {
          maxWidth = videoConfig.maxWidth;
        }

        if(!videoConfig.maxHeight) {
          maxHeight = videoConfig.maxHeight;
        }

        if(!videoConfig.maxFPS) {
          maxFPS = videoConfig.maxFPS;
        }

        if(!videoConfig.packetSize) {
          packetSize = videoConfig.packetSize;
        }
      }
      
      // Get Doorbird device information.
      var rpOpts = {
        uri: 'http://' + self.doorBirdAuth + '/bha-api/info.cgi',
        json: true
      };
          
      rp(rpOpts)
        .then(function(dbInfo) {
          doorBirdInfo =  dbInfo.BHA.VERSION[0]; 
          
          // Use the MAC address to uniquely identify each Doorbird.
          var doorBirdUUID = doorBirdInfo["PRIMARY_MAC_ADDR"] || doorBirdInfo["WIFI_MAC_ADDR"];

          // Create the accessory.
          var uuid = UUIDGen.generate(doorBirdUUID);
          var doorBirdAccessory = new Accessory(cameraName, uuid, hap.Accessory.Categories.VIDEO_DOORBELL);

          // Set the accessory information.
          doorBirdAccessory.getService(hap.Service.AccessoryInformation)
            .setCharacteristic(hap.Characteristic.Manufacturer, 'Bird Home Automation GmbH')        
            .setCharacteristic(hap.Characteristic.Model, doorBirdInfo["DEVICE-TYPE"])
            .setCharacteristic(hap.Characteristic.FirmwareRevision, doorBirdInfo["FIRMWARE"] + '.' + doorBirdInfo["BUILD_NUMBER"])
            .setCharacteristic(hap.Characteristic.SerialNumber, doorBirdInfo["WIFI_MAC_ADDR"]);        
    
          // Check to see what relays we have available to us and add them.
          var relays = doorBirdInfo["RELAYS"];
      
          relays.forEach(function(doorBirdRelay) {                        
            // Default to setting the primary relay to the first one unless configured otherwise.
            if(!self.primaryRelay || cameraConfig.defaultRelay == doorBirdRelay) {
              self.primaryRelay = doorBirdRelay;
            }
    
            // Set the unlock URL.
            self.lockUrl[doorBirdRelay] = 'http://' + self.doorBirdAuth +
              '/bha-api/open-door.cgi?r=' + doorBirdRelay;

            // Add the lock Accessory.
            self.log("Detected relay: %s.", doorBirdRelay);
            self.lockService[doorBirdRelay] = doorBirdAccessory.addService(Service.LockMechanism, 'Relay ' + doorBirdRelay, doorBirdRelay);

            // Assume initial lock state to secured until we learn otherwise.
            self.lockState[doorBirdRelay] = Characteristic.LockCurrentState.SECURED;
        
            // Configure LockMechanism.
            self.lockService[doorBirdRelay]
              .getCharacteristic(Characteristic.LockCurrentState)
              .on('get', self.getState.bind(self, doorBirdRelay));
           
            self.lockService[doorBirdRelay]
              .getCharacteristic(Characteristic.LockTargetState)
              .on('get', self.getState.bind(self, doorBirdRelay))
              .on('set', self.setState.bind(self, doorBirdRelay));
          });

          if(self.primaryRelay) {
            self.log("Primary relay set to: %s.", self.primaryRelay);
          }

          // Add the motion accessory.
          var motionService = doorBirdAccessory.addService(Service.MotionSensor,  'Motion Sensor');

          // Add the light accessory.
          var lightService = doorBirdAccessory.addService(Service.Lightbulb, 'Infrared Light');

          lightService.getCharacteristic(Characteristic.On)
            .on('set', function(value, callback) {
          
              // If we're already on, don't allow us to be turned off until the timer runs out.
              if(self.lightPoll) {
                self.log("Doorbird night vision is already active.");
            
                setTimeout(function() {
                  lightService.getCharacteristic(Characteristic.On).updateValue(true);
                }.bind(self), 10);
            
              } else {
                request.get({
                  url: self.lightUrl,
                }, function(err, response, body) {
                  if(!err && response.statusCode == 200) {
                    // Clear old countdowns first.
                    if(self.lightPoll) {
                      clearTimeout(self.lightPoll);
                    }
              
                    self.log('Doorbird infrared light activated for 3 minutes.');

                    self.lightPoll = setTimeout(function() {
                      lightService.getCharacteristic(Characteristic.On).updateValue(false);
                      self.lightPoll = 0;
                    }.bind(self), 1000 * 60 * 3);
                  } else {
                    self.log("Doorbird error '%s' setting the light state. Response: %s", err, body);
                    callback(err || new Error('Error setting the light state.'));
                  }
                });
            }
          
            callback();
          });

          // Doorbell has to be the primary service.
          var primaryService = new Service.Doorbell(cameraName);
          primaryService.getCharacteristic(Characteristic.ProgrammableSwitchEvent)
            .on('get', self.getState.bind(this, self.primaryRelay));        
      
          // Setup and configure the camera services.
          var doorbirdCamera = {
            name: cameraName,
        
            videoConfig: {
              source: source,
              stillImageSource: stillImageSource,
              additionalCommandline: additionalCommandline,
              maxStreams: maxStreams,
              maxWidth: maxWidth,
              maxHeight: maxHeight,
              maxFPS: maxFPS,
              packetSize: packetSize,
              audio: audio,
              mapaudio: mapaudio,
              debug: videoDebug
            }
          };

          var cameraSource = new FFMPEG(hap, doorbirdCamera, self.log, videoProcessor);
          doorBirdAccessory.configureCameraSource(cameraSource);

          // Setup HomeKit doorbell service
          doorBirdAccessory.addService(primaryService);

          // Identify
          doorBirdAccessory.on('identify', self.identify.bind(this, primaryService));

          //Add Services
          var speakerService = new Service.Speaker('Speaker');
          doorBirdAccessory.addService(speakerService);

          var microphoneService = new Service.Microphone('Microphone');
          doorBirdAccessory.addService(microphoneService);

          configuredAccessories.push(doorBirdAccessory);

          self.api.publishCameraAccessories('homebridge-doorbird', configuredAccessories);

          var server = http.createServer(function(req, res) {
      
            if(self.debug) {
              self.log("Notification server URL: %s", req.url);
            }
        
            if(req.url == '/doorbell.html') {
              server.status_code = 204;
          
              res.writeHead(204, {'Content-Type': 'text/plain'});
              res.end("GET 204 " + http.STATUS_CODES[204] + " " + req.url + "\nThe server successfully processed the request and is not returning any content.");

              // Tell HomeKit about the doorbell event.
              self.log("Doorbird detected a doorbell ring.");
              self.EventWithAccessory(doorBirdAccessory);
          
              // Execute any command associated with ringing the doorbell.
              if(self.cmdDoorbell) {
                self.log("Executing doorbell command: %s.", self.cmdDoorbell);
                exec(self.cmdDoorbell, function(error, stdout, stderr) {
                  // Command output is in stdout.
                  if(error) {
                    self.log(error);
                  }
                });
              }
            } else if(req.url == '/motion.html') {
              server.status_code = 204;
          
              res.writeHead(204, {'Content-Type': 'text/plain'});
              res.end("GET 204 " + http.STATUS_CODES[204] + " " + req.url + "\nThe server successfully processed the request and is not returning any content.");

              // Tell the sensor we've detected motion.
              setTimeout(function() {
                self.log('Doorbird detected motion.');
                motionService.getCharacteristic(Characteristic.MotionDetected).updateValue(true);
              }.bind(self), 10);

              // Execute any command associated with motion detection.
              if(self.cmdMotion) {
                self.log("Executing motion command: %s.", self.cmdMotion);
            
                exec(self.cmdMotion, function(error, stdout, stderr) {
                  // Command output is in stdout.
                  if(error) {
                    self.log(error);
                  }
                });
              }

              // Reset the motion sensor after 5 seconds.
              setTimeout(function() {
                self.log('Doorbird resetting the motion event after 5 seconds.');
            
                motionService.getCharacteristic(Characteristic.MotionDetected).updateValue(false);
              }.bind(self), 1000 * 5);
            } else {
              server.status_code = 404;
          
              res.writeHead(404, {'Content-Type': 'text/plain'});
              res.end("GET 404 " + http.STATUS_CODES[404] + " " + req.url + "\nThe file cannot be found.");
          
              self.log("HTTP Server: GET 404 " + http.STATUS_CODES[404] + " " + req.url);
            }
          });
      
          // Fire up the web server to listen to notifications from Doorbird.
          server.listen(webserverPort, function() {
            self.log("%s is listening on port %s.", cameraName, webserverPort);
          }.bind(this));
            server.on('error', function(err) {
              self.log("%s (port %s) error: %s.", cameraName, webserverPort, err);
          }.bind(this));
        })
      .catch(function(error) {
        self.log("Unable to query the Doorbird: " + error);
      });
    });
  }
}

doorBirdPlatform.prototype.getState = function(relayIndex, callback) {
  callback(null, this.lockState[relayIndex]);
}

doorBirdPlatform.prototype.setState = function(relayIndex, state, callback) {
  var lockState = (state == Characteristic.LockTargetState.SECURED) ? "locking" : "unlocking";
  var updateState = (state == Characteristic.LockTargetState.SECURED) ? true : false;
  
  self = this;
  
  if(self.debug) {
    self.log("Doorbird relay %s %s.", relayIndex, lockState);
  }
  
  self.lockState[relayIndex] = (state == Characteristic.LockTargetState.SECURED) ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED;

  if(lockState == "unlocking") {
    request.get({
      url: self.lockUrl[relayIndex],
    }, function(err, response, body) {
      if(!err && response.statusCode == 200) {
        // Set state to unlocked.
        self.lockService[relayIndex]
          .setCharacteristic(Characteristic.LockCurrentState, self.lockState[relayIndex]);

        self.log('Doorbird relay %s unlocked.', relayIndex);

        if(!updateState) {
          setTimeout(function() {
            // Set state to unlocked, and relock in 5 seconds.
            self.lockService[relayIndex]
              .setCharacteristic(Characteristic.LockTargetState, Characteristic.LockTargetState.SECURED)
              .setCharacteristic(Characteristic.LockCurrentState, self.lockState[relayIndex]);
            updateState = true;
            self.log('Doorbird relay %s locked (auto initiated after 5 seconds).', relayIndex);
          }.bind(this), 1000 * 5);
        }
      } else {
        self.log("Doorbird error '%s' opening relay %s. Response: %s", err, relayIndex, body);
        callback(err || new Error("Doorbird error setting the lock state."));
      }
    });
  }

  callback(null);
};
