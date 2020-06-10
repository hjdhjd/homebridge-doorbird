var Accessory, hap, Service, Characteristic, UUIDGen;

var FFMPEG = require('./ffmpeg').FFMPEG;

var request = require('request');
var rp = require('request-promise');
var exec = require('child_process').exec;

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

  // Are we debugging everything?
  self.debug = self.config.debug === true;

  if(self.config.doorbirds) {
    var configuredAccessories = [];
    var cameras = self.config.doorbirds;
    var options = self.config.options;

    self.doorBirds = {};

    cameras.forEach(function(cameraConfig) {
      var doorBirdInfo = {};
      var cameraName = cameraConfig.name || self.config.name || 'Doorbird';
      var cameraOpts = cameraConfig.options;

      // You must specify at least the IP of the Doorbird, a username, and a password.
      if(!cameraConfig.ip || !cameraConfig.username || !cameraConfig.password) {
        self.log('%s: missing required configuration parameters.', cameraName);
        return(Error("Unable to initialize the Doorbird plugin: missing configuration parameters."));
      }

      // Shorten the alias to IP for convenience.
      var birdIndex = cameraConfig.ip;

      // Initialize our state for this camera. We need to maintain state separately for each camera.
      self.doorBirds[birdIndex] = {};

      // Initialize the array of relays.
      self.doorBirds[birdIndex].lockService = {};
      self.doorBirds[birdIndex].lockState = {};
      self.doorBirds[birdIndex].lockUrl = {};
      self.doorBirds[birdIndex].primaryRelay = 0;

      // Doorbird log name.
      self.doorBirds[birdIndex].cameraLog = cameraName + '@' + cameraConfig.ip;
      var cameraLog = self.doorBirds[birdIndex].cameraLog;

      // Optional command line actions for Doorbird events.
      self.doorBirds[birdIndex].cmdDoorbell = cameraConfig.cmdDoorbell;
      self.doorBirds[birdIndex].cmdMotion = cameraConfig.cmdMotion;

      // Doorbird credentials.
      self.doorBirds[birdIndex].doorBirdAuth = cameraConfig.username + ':' + cameraConfig.password + '@' + cameraConfig.ip;

      // Set the night light URL.
      self.doorBirds[birdIndex].lightUrl = 'http://' + self.doorBirds[birdIndex].doorBirdAuth + '/bha-api/light-on.cgi?';

      // Let's configure reasonable defaults for Doorbird.
      var videoConfig = self.config.videoConfig;
      var webserverPort = cameraConfig.port || 5005;

      var source = '-re -rtsp_transport tcp -i rtsp://' + self.doorBirds[birdIndex].doorBirdAuth + ':8557/mpeg/media.amp';
      var stillImageSource = '-i http://' + self.doorBirds[birdIndex].doorBirdAuth + '/bha-api/image.cgi';
      var additionalCommandline = '-preset slow -profile:v high -level 4.2 -x264-params intra-refresh=1:bframes=0';
      var audio = (options && options.indexOf("Audio.Enable") != -1) ? true : false;
      var mapaudio;
      var mapvideo;
      var maxStreams = 4;
      var maxWidth = 1280;
      var maxHeight = 720;
      var maxFPS = 15;
      var packetSize = 376;
      var videoDebug = false;

      // Configure audio.
      if(audio) {
        self.log("%s: enabling audio support.", cameraLog);
        source += ' -f mulaw -ar 8000 -i http://' + self.doorBirds[birdIndex].doorBirdAuth + '/bha-api/audio-receive.cgi';
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

        if(videoConfig.maxStreams) {
          maxStreams = videoConfig.maxStreams;
        }

        if(videoConfig.maxWidth) {
          maxWidth = videoConfig.maxWidth;
        }

        if(videoConfig.maxHeight) {
          maxHeight = videoConfig.maxHeight;
        }

        if(videoConfig.maxFPS) {
          maxFPS = videoConfig.maxFPS;
        }

        if(videoConfig.packetSize) {
          packetSize = videoConfig.packetSize;
        }

        if(videoConfig.mapaudio) {
          mapaudio = videoConfig.mapaudio;
        }

        if(videoConfig.mapvideo) {
          mapvideo = videoConfig.mapvideo;
        }
      }

      // Get Doorbird device information.
      const infoOptions = {
        uri: 'http://' + self.doorBirds[birdIndex].doorBirdAuth + '/bha-api/info.cgi',
        json: true
      };

      rp(infoOptions)
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
            .setCharacteristic(hap.Characteristic.SerialNumber, doorBirdUUID);

          // Check to see what relays we have available to us and add them.
          var relays = doorBirdInfo["RELAYS"];

          relays.forEach(function(doorBirdRelay) {
            if(cameraOpts && cameraOpts.indexOf("Relay.Hide." + doorBirdRelay) != -1) {
              self.log("%s: hiding relay: %s.", cameraLog, doorBirdRelay);
            } else {
              // Default to setting the primary relay to the first one unless configured otherwise.
              if(!self.doorBirds[birdIndex].primaryRelay || cameraConfig.primaryRelay == doorBirdRelay) {
                self.doorBirds[birdIndex].primaryRelay = doorBirdRelay;
              }

              // Set the unlock URL.
              self.doorBirds[birdIndex].lockUrl[doorBirdRelay] = 'http://' + self.doorBirds[birdIndex].doorBirdAuth +
                '/bha-api/open-door.cgi?r=' + doorBirdRelay;

              // Add the lock Accessory.
              self.log("%s: detected relay: %s.", cameraLog, doorBirdRelay);
              self.doorBirds[birdIndex].lockService[doorBirdRelay] = doorBirdAccessory.addService(Service.LockMechanism, 'Relay ' + doorBirdRelay, doorBirdRelay);

              // Set the initial lock state to secured before we start listening to events from the lock.
              self.doorBirds[birdIndex].lockState[doorBirdRelay] = Characteristic.LockCurrentState.SECURED;
              self.doorBirds[birdIndex].lockService[doorBirdRelay]
                .setCharacteristic(Characteristic.LockCurrentState, Characteristic.LockCurrentState.SECURED);
              self.doorBirds[birdIndex].lockService[doorBirdRelay]
                .setCharacteristic(Characteristic.LockTargetState, Characteristic.LockTargetState.SECURED);

              // Configure the events for LockMechanism.
              self.doorBirds[birdIndex].lockService[doorBirdRelay]
                .getCharacteristic(Characteristic.LockCurrentState)
                .on('get', self.getState.bind(self, birdIndex, doorBirdRelay));

              self.doorBirds[birdIndex].lockService[doorBirdRelay]
                .getCharacteristic(Characteristic.LockTargetState)
                .on('get', self.getState.bind(self, birdIndex, doorBirdRelay))
                .on('set', self.setState.bind(self, birdIndex, doorBirdRelay));
            }
          });

          if(self.doorBirds[birdIndex].primaryRelay) {
            self.log("%s: primary relay set to: %s.", cameraLog, self.doorBirds[birdIndex].primaryRelay);
          } else {
            self.log("%s: no relays have been configured. The Doorbird must have at least one active relay.", cameraLog);
            return(Error("Unable to initialize the Doorbird plugin: no relays configured."));
          }

          // Add the motion accessory.
          self.doorBirds[birdIndex].motionService = doorBirdAccessory.addService(Service.MotionSensor,  'Motion Sensor');

          // Add the light accessory.
          self.doorBirds[birdIndex].lightService = doorBirdAccessory.addService(Service.Lightbulb, 'Infrared Light');

          self.doorBirds[birdIndex].lightService.getCharacteristic(Characteristic.On)
            .on('set', function(value, callback) {

            // If we're already on, don't allow us to be turned off until the timer runs out.
            if(self.doorBirds[birdIndex].lightPoll) {
              self.log("%s: Doorbird night vision is already active.", cameraLog);

              setTimeout(function() {
                self.doorBirds[birdIndex].lightService.getCharacteristic(Characteristic.On).updateValue(true);
              }.bind(self), 10);

            } else {
              request.get({
                url: self.doorBirds[birdIndex].lightUrl,
              }, function(err, response, body) {
                if(!err && response.statusCode == 200) {
                  // Clear old countdowns first.
                  if(self.doorBirds[birdIndex].lightPoll) {
                    clearTimeout(self.doorBirds[birdIndex].lightPoll);
                  }

                  self.log('%s: Doorbird infrared light activated for 3 minutes.', cameraLog);

                  self.doorBirds[birdIndex].lightPoll = setTimeout(function() {
                    self.doorBirds[birdIndex].lightService.getCharacteristic(Characteristic.On).updateValue(false);
                    self.doorBirds[birdIndex].lightPoll = 0;
                  }.bind(self), 1000 * 60 * 3);
                } else {
                  self.log("%s: Doorbird error '%s' setting the light state. Response: %s", cameraLog, err, body);
                  callback(err || new Error('Error setting the light state.'));
                }
              });
            }

            callback();
          });

          // Doorbell has to be the primary service.
          var primaryService = new Service.Doorbell(cameraName);
          primaryService.getCharacteristic(Characteristic.ProgrammableSwitchEvent)
            .on('get', self.getState.bind(this, birdIndex, self.doorBirds[birdIndex].primaryRelay));

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
              mapvideo: mapvideo,
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

          // We only want to publish our cameras if we are on the last configured Doorbird.
          if(configuredAccessories.length == cameras.length) {
            self.api.publishExternalAccessories('homebridge-doorbird', configuredAccessories);
          }

          // Connect to the Doorbird monitor API.
          self.doorBirdEvents(birdIndex, doorBirdAccessory);

        })
      .catch(function(error) {
        self.log("%s: error in configuring this Doorbird: %s", cameraLog, error);
      });
    });
  } else {
    self.log('No Doorbirds configured.');
  }
}

doorBirdPlatform.prototype.getState = function(birdIndex, relayIndex, callback) {
  callback(null, this.doorBirds[birdIndex].lockState[relayIndex]);
}

doorBirdPlatform.prototype.setState = function(birdIndex, relayIndex, state, callback) {
  var lockState = (state == Characteristic.LockTargetState.SECURED) ? "locking" : "unlocking";
  var updateState = (state == Characteristic.LockTargetState.SECURED) ? true : false;

  var self = this;

  if(self.debug) {
    self.log("%s: relay %s %s.", self.doorBirds[birdIndex].cameraLog, relayIndex, lockState);
  }

  self.doorBirds[birdIndex].lockState[relayIndex] = (state == Characteristic.LockTargetState.SECURED) ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED;

  if(lockState == "unlocking") {
    request.get({
      url: self.doorBirds[birdIndex].lockUrl[relayIndex],
    }, function(err, response, body) {
      if(!err && response.statusCode == 200) {
        // Set state to unlocked.
        self.doorBirds[birdIndex].lockService[relayIndex]
          .setCharacteristic(Characteristic.LockCurrentState, self.doorBirds[birdIndex].lockState[relayIndex]);

        self.log('%s: relay %s unlocked.', self.doorBirds[birdIndex].cameraLog, relayIndex);

        if(!updateState) {
          setTimeout(function() {
            // Set state to unlocked, and relock in 5 seconds.
            self.doorBirds[birdIndex].lockService[relayIndex]
              .setCharacteristic(Characteristic.LockTargetState, Characteristic.LockTargetState.SECURED)
              .setCharacteristic(Characteristic.LockCurrentState, self.doorBirds[birdIndex].lockState[relayIndex]);
            updateState = true;
            self.log('%s: relay %s locked (auto initiated after 5 seconds).', self.doorBirds[birdIndex].cameraLog, relayIndex);
          }.bind(this), 1000 * 5);
        }
      } else {
        self.log("%s: error '%s' opening relay %s. Response: %s", self.doorBirds[birdIndex].cameraLog, err, relayIndex, body);
        callback(err || new Error("Doorbird error setting the lock state."));
      }
    });
  }

  callback(null);
};

// Motion event handler.
doorBirdPlatform.prototype.doorBirdEventMotion = function(birdIndex, birdAccessory) {
  var self = this;
  var thisBird = self.doorBirds[birdIndex];
  var cameraLog = thisBird.cameraLog;

  // Tell the sensor we've detected motion.
  setTimeout(function() {
    self.log('%s: Doorbird detected motion.', cameraLog);
    birdAccessory.getService(Service.MotionSensor)
      .getCharacteristic(Characteristic.MotionDetected).updateValue(true);
  }.bind(self), 10);

  // Execute any command associated with motion detection.
  if(thisBird.cmdMotion) {
    self.log("%s: executing motion command: %s.", cameraLog, thisBird.cmdMotion);

    exec(thisBird.cmdMotion, function(error, stdout, stderr) {
      // Command output is in stdout.
      if(error) {
        self.log(error);
      }
    });
  }

  // Reset the motion sensor after 5 seconds.
  setTimeout(function() {
    self.log('%s: Doorbird resetting the motion event after 5 seconds.', cameraLog);

    birdAccessory.getService(Service.MotionSensor)
      .getCharacteristic(Characteristic.MotionDetected).updateValue(false);
  }.bind(self), 1000 * 5);
}

// Doorbell event handler.
doorBirdPlatform.prototype.doorBirdEventDoorbell = function(birdIndex, birdAccessory) {
  var self = this;
  var thisBird = self.doorBirds[birdIndex];
  var cameraLog = thisBird.cameraLog;

  // Tell HomeKit about the doorbell event.
  self.log("%s: Doorbird detected a doorbell ring.", cameraLog);
  self.EventWithAccessory(birdAccessory);

  // Execute any command associated with ringing the doorbell.
  if(thisBird.cmdDoorbell) {
    self.log("%s: executing doorbell command: %s.", cameraLog, thisBird.cmdDoorbell);
    exec(thisBird.cmdDoorbell, function(error, stdout, stderr) {
      // Command output is in stdout.
      if(error) {
        self.log(error);
      }
    });
  }
}

// Process events from the Doorbird monitor API.
doorBirdPlatform.prototype.doorBirdEvents = function(birdIndex, birdAccessory) {
  var self = this;
  var thisBird = self.doorBirds[birdIndex];
  var cameraLog = thisBird.cameraLog;
  var contentBoundary;

  // We want to monitor all motion and doorbell events.
  // Doorbird has roughly a 20 second heartbeat interval in the monitor API so we use 25 seconds just to be safe.
  const monOptions = {
    url: 'http://' + thisBird.doorBirdAuth + '/bha-api/monitor.cgi?ring=doorbell,motionsensor',
    timeout: 1000 * 25
  };

  // Create the connection to the Doorbird monitor API.
  // If we need to reconnect to the Doorbird, it's typically for a reboot which takes ~2 minutes to complete.
  doorBirdMonitor = new request(monOptions, function(error, response, body) {
    setTimeout(function() {
      self.log("%s: reconnecting to the Doobird monitor API.", cameraLog);
      return self.doorBirdEvents(birdIndex, birdAccessory);
    }, 1000 * 120);
  });

  // If the connection ends, usually due to a reboot or power loss.
  doorBirdMonitor.on('end', function() {
    self.log("%s: connection to Doorbird has been lost. Reconnection attempt in 2 minutes.", cameraLog);
  });

  // On connect, we need to parse the response header to figure out what the boundary string is.
  doorBirdMonitor.on('response', function(response) {
    var contentType = response.headers['content-type'];

    // Response we should receive: multipart/x-mixed-replace; boundary=--ioboundary
    // A little regex magic here. We don't want to match on the parts we don't want. Just save everything after boundary=
    var reBoundary = /(?<=^multipart\/x-mixed-replace; boundary=).*$/;

    var ctParse = reBoundary.exec(contentType);

    if(ctParse) {
      contentBoundary = ctParse[0];
    } else {
      self.log('%s: unable to parse content-type header: %s', cameraLog, contentType);
    }
  });

  // Monitor and process the notification stream from the Doorbird.
  doorBirdMonitor.on('data', function(data) {
    var monEvents = data.toString().split('\r\n');

    for(var i = 0; i < monEvents.length; i++) {

      // Skip if we are a blank line.
      if(!monEvents[i].length) {
        continue;
      }

      // Skip if we are at the content boundary.
      if(monEvents[i] == contentBoundary) {
        continue;
      }

      // Skip if we are the Content-Type header.
      if(monEvents[i] == 'Content-Type: text/plain') {
        continue;
      }

      // Monitor events should be in the form of event:value.
      var reMon = /^(.*):(.*)$/;
      var monEvent = reMon.exec(monEvents[i]);

      // Two monitor events exist, motionsensor and doorbell.
      if(monEvent && monEvent[1] == 'motionsensor') {
        if(monEvent[2] == 'H') {
          self.doorBirdEventMotion(birdIndex, birdAccessory);
        }
      } else if(monEvent && monEvent[1] == 'doorbell') {
        if(monEvent[2] == 'H') {
          self.doorBirdEventDoorbell(birdIndex, birdAccessory);
        }
      } else {
        self.log("%s: unknown event received: %s", monEvents[i]);
      }
    }
  });
}
