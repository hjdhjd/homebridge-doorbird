/* Copyright(C) 2017-2020, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * doorbird-doorbell.ts:Doorbird doorbell device class.
 */
import { exec } from "child_process";
import { DoorbirdApi } from "./doorbird-api";
import { DoorbirdPlatform } from "./doorbird-platform";
import { DoorbirdStreamingDelegate } from "./doorbird-stream";
import { DoorbirdStationConfig } from "./doorbird-types";
import {
  API,
  CharacteristicEventTypes,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  HAP,
  Logging,
  PlatformAccessory
} from "homebridge";
import {
  DOORBIRD_MOTION_DURATION,
  DOORBIRD_NIGHTVISION_DURATION,
  DOORBIRD_UNLOCK_DURATION,
  PLATFORM_NAME,
  PLUGIN_NAME
} from "./settings";

export class DoorbirdStation {
  accessory!: PlatformAccessory;
  api: API;
  audioUrl!: string;
  cameraUrl!: string;
  config: DoorbirdStationConfig;
  private doorbirdAddress: string;
  dbApi!: DoorbirdApi;
  platform: DoorbirdPlatform;
  debug: (message: string, ...parameters: any[]) => void;
  private hap: HAP;
  private lockEventTimers: { [index: string]: NodeJS.Timeout };
  private nightVision: boolean;
  private nightVisionTimer!: NodeJS.Timeout;
  options: string[];
  private log: Logging;
  private motionEvent: boolean;
  name: string;
  private primaryRelay: string;
  private relayCurrentState: { [index: string]: CharacteristicValue};
  private relayTargetState: { [index: string]: CharacteristicValue};
  snapshotUrl!: string;
  private streamingDelegate: DoorbirdStreamingDelegate;

  constructor(platform: DoorbirdPlatform, doorbirdConfig: DoorbirdStationConfig) {
    this.api = platform.api;
    this.config = doorbirdConfig;
    this.debug = platform.debug.bind(platform);
    this.hap = this.api.hap;
    this.lockEventTimers = {};
    this.log = platform.log;
    this.motionEvent = false;
    this.name = doorbirdConfig.name;
    this.nightVision = false;
    this.options = [];
    this.doorbirdAddress = doorbirdConfig.ip;
    this.platform = platform;
    this.primaryRelay = null as any;
    this.relayCurrentState = {};
    this.relayTargetState = {};
    this.streamingDelegate = null as any;

    // Validate our Doorbird address and login information.
    if(!doorbirdConfig.ip || !doorbirdConfig.username || !doorbirdConfig.password) {
      return;
    }

    // If we have feature options, put them into their own array, upper-cased for future reference.
    if(doorbirdConfig.options) {
      doorbirdConfig.options.forEach((option: string) => {
        this.options.push(option.toUpperCase());
      });
    }

    // Initialize our connection to the Doorbird API and instantiate our accessory.
    this.dbApi = new DoorbirdApi(platform, this.name, doorbirdConfig.ip, doorbirdConfig.username, doorbirdConfig.password);
    this.configureDoorbird();
  }

  // Configure the Doorbird for HomeKit.
  private async configureDoorbird(): Promise<boolean> {

    // Login to the Doorbird.
    if(!(await this.dbApi.login())) {
      return false;
    }

    // Generate this Doorbird's unique identifier.
    const uuid = this.hap.uuid.generate(this.dbApi.mac);

    // See if we already know about this accessory or if it's truly new. If it is new, add it to HomeKit.
    if((this.accessory = this.platform.accessories.find((x: PlatformAccessory) => x.UUID === uuid)!) === undefined) {

      // Assign a name, if we don't have one already.
      if(!this.name) {
        this.name = this.dbApi.deviceType || "Doorbird";
      }

      this.accessory = new this.api.platformAccessory(this.name, uuid);

      this.log("%s: Adding to HomeKit (address: %s, mac: %s).",
        this.name, this.doorbirdAddress, this.dbApi.mac);

      // Register this accessory with homebridge and add it to the accessory array so we can track it.
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [this.accessory]);
      this.platform.accessories.push(this.accessory);
    }

    // Assign a name, if we don't have one yet from the accessory.
    if(!this.name) {
      this.name = this.accessory.displayName || this.dbApi.deviceType || "Doorbird";
    }

    // Let the API know what our name is for logging purposes.
    this.dbApi.name = this.name;

    // Set device information.
    if(!(await this.configureInfo())) {
      return false;
    }

    // Configure the relays.
    if(!(await this.configureRelays())) {
      return false;
    }

    // Configure the motion sensor.
    if(!(await this.configureMotionSensor())) {
      return false;
    }

    // Configure night vision.
    if(!(await this.configureNightVision())) {
      return false;
    }

    // Configure the video doorbell.
    if(!(await this.configureVideoDoorbell())) {
      return false;
    }

    // Inform the API of our event handlers.
    this.dbApi.events.doorbell = this.doorbellEventHandler.bind(this);
    this.dbApi.events.motionsensor = this.motionEventHandler.bind(this);

    // Inform the user if we have any night vision triggers active.
    if(this.config.nightVisionDoorbell) {
      this.log("%s: Night vision will be activated for all doorbell events.", this.name);
    }

    if(this.config.nightVisionSnapshot) {
      this.log("%s: Night vision will be activated for all snapshot requests.", this.name);
    }

    if(this.config.nightVisionVideo) {
      this.log("%s: Night vision will be activated for all video streaming.", this.name);
    }

    if(this.config.nightVisionDoorbellNight) {
      this.log("%s: Night vision will be activated for doorbell events at night.", this.name);
    }

    if(this.config.nightVisionSnapshotNight) {
      this.log("%s: Night vision will be activated for all snapshot requests at night.", this.name);
    }

    if(this.config.nightVisionVideoNight) {
      this.log("%s: Night vision will be activated for video streaming at night.", this.name);
    }

    // Refresh the accessory cache with these values.
    this.api.updatePlatformAccessories([this.accessory]);
    return true;
  }

  // Configure Doorbird device information for HomeKit.
  private async configureInfo(): Promise<boolean> {
    const accessory = this.accessory;
    const hap = this.hap;

    // Update the manufacturer information for this Doorbird.
    accessory
      .getService(hap.Service.AccessoryInformation)!
      .getCharacteristic(hap.Characteristic.Manufacturer).updateValue("Bird Home Automation GmbH");

    // Update the model information for this Doorbird.
    accessory
      .getService(hap.Service.AccessoryInformation)!
      .getCharacteristic(hap.Characteristic.Model).updateValue(this.dbApi.deviceType);

    // Update the serial number for this Doorbird.
    accessory
      .getService(hap.Service.AccessoryInformation)!
      .getCharacteristic(hap.Characteristic.SerialNumber).updateValue(this.dbApi.mac);

    // Update the firmware revision for this Doorbird.
    accessory
      .getService(hap.Service.AccessoryInformation)!
      .getCharacteristic(hap.Characteristic.FirmwareRevision).updateValue("0." + parseInt(this.dbApi.firmware));

    return true;
  }

  // Configure the motion sensor on the Doorbird for HomeKit.
  private async configureMotionSensor(): Promise<boolean> {

    // Clear out any previous motion sensor service.
    let motionService = this.accessory.getService(this.hap.Service.MotionSensor);

    if(motionService) {
      this.accessory.removeService(motionService);
    }

    // Add the motion sensor to the Doorbird.
    motionService = new this.hap.Service.MotionSensor(this.accessory.displayName);
    this.accessory.addService(motionService);

    return true;
  }

  // Configure night vision on this Doorbird for HomeKit.
  private async configureNightVision(): Promise<boolean> {

    // Clear out any previous lightbulb service.
    let lightService = this.accessory.getService(this.hap.Service.Lightbulb);

    if(lightService) {
      this.accessory.removeService(lightService);
    }

    // Grab the lightbulb service.
    lightService = new this.hap.Service.Lightbulb(this.accessory.displayName);

    if(!lightService) {
      return false;
    }

    // Activate or deactivate night vision.
    this.accessory.addService(lightService, "Night Vision")
      .getCharacteristic(this.hap.Characteristic.On)!
      .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
        callback(null, this.nightVision);
      })
      .on(CharacteristicEventTypes.SET, async (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        let resetLight = false;

        // If night vision is already active, we're done. Reset our bulb status to what it should be.
        if(this.nightVision) {
          this.log("%s: Doorbird night vision is already active.", this.name);
          resetLight = true;
        } else if(!(await this.activateNightVision())) {
          // If we failed to activate night vision, we're also done. Reset the bulb status to what it should be.
          resetLight = true;
        }

        // Reset the night vision light switch due to an error.
        if(resetLight) {
          const self = this;

          setTimeout(() => {
            lightService!.getCharacteristic(this.hap.Characteristic.On).updateValue(self.nightVision);
          }, 100);
        }

        callback(null);
      })
      .updateValue(this.nightVision);

    return true;
  }

  // Configure the relays on the Doorbird for HomeKit.
  private async configureRelays(): Promise<boolean> {

    // Clear out any previous locks.
    let relayService;
    while((relayService = this.accessory.getService(this.hap.Service.LockMechanism))) {
      this.accessory.removeService(relayService);
    }

    for(const relay of this.dbApi.relays) {
      // Are we hiding this relay?
      if(this.options.indexOf("RELAY.HIDE." + relay.toUpperCase()) !== -1) {
        this.log("%s: Hiding relay: %s", this.name, relay);
        continue;
      }

      // We default to setting the primary relay to the first relay we come across, unless the user configures something else.
      if(!this.primaryRelay || (this.config.primaryRelay && (this.config.primaryRelay.toUpperCase() === relay.toUpperCase()))) {
        this.primaryRelay = relay;
      }

      this.log("%s: Detected relay: %s%s.", this.name, relay, (this.primaryRelay === relay) ? " (primary)" : "");

      // Set the initial state to locked.
      this.relayCurrentState[relay] = this.hap.Characteristic.LockCurrentState.SECURED;
      this.relayTargetState[relay] = this.hap.Characteristic.LockTargetState.SECURED;

      // Make the relay available to HomeKit.
      const relayService = new this.hap.Service.LockMechanism(this.accessory.displayName + " Relay " + relay, relay);
      this.accessory
        .addService(relayService)
        .setCharacteristic(this.hap.Characteristic.LockCurrentState, this.relayCurrentState[relay])
        .setCharacteristic(this.hap.Characteristic.LockTargetState, this.relayTargetState[relay]);

      relayService
        .getCharacteristic(this.hap.Characteristic.LockCurrentState)!
        .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
          callback(null, this.relayCurrentState[relay]);
        });

      relayService
        .getCharacteristic(this.hap.Characteristic.LockTargetState)!
        .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
          callback(null, this.relayTargetState[relay]);
        })
        .on(CharacteristicEventTypes.SET, async (value: CharacteristicValue, callback: CharacteristicSetCallback) => {

          // Doorbird automatically locks a relay once it's been unlocked. There is no user-controllable method for locking a relay directly.
          if(value === this.hap.Characteristic.LockTargetState.SECURED) {

            // If the user tries to lock this on their own while we're unlocked, revert to being unlocked since we can't force the state change.
            if(this.relayCurrentState[relay] === this.hap.Characteristic.LockCurrentState.UNSECURED) {
              this.relayTargetState[relay] = this.hap.Characteristic.LockTargetState.UNSECURED;
              relayService.getCharacteristic(this.hap.Characteristic.LockTargetState).updateValue(this.relayTargetState[relay]);
            }
            callback(null);
            return;
          }

          // Tell the Doorbird to unlock this relay.
          if(!(await this.dbApi.openDoor(relay))) {
            callback(new Error("Error unlocking relay " + relay + "."));
            return;
          }

          // Update our current state.
          this.relayCurrentState[relay] = this.hap.Characteristic.LockCurrentState.UNSECURED;
          this.log("%s: Relay %s unlocked.", this.name, relay);

          // The Doorbird will automatically lock the relay after a few seconds.
          clearTimeout(this.lockEventTimers[relay]);
          const self = this;

          this.lockEventTimers[relay] = setTimeout(() => {
            self.relayCurrentState[relay] = self.hap.Characteristic.LockCurrentState.SECURED;
            self.relayTargetState[relay] = self.hap.Characteristic.LockTargetState.SECURED;

            relayService.getCharacteristic(this.hap.Characteristic.LockTargetState).updateValue(self.relayTargetState[relay]);
            relayService.getCharacteristic(this.hap.Characteristic.LockCurrentState).updateValue(self.relayCurrentState[relay]);

            self.log("%s: Relay %s locked (auto-initiated after %s seconds).", self.name, relay, DOORBIRD_UNLOCK_DURATION);
          }, 1000 * DOORBIRD_UNLOCK_DURATION);

          this.log("%s: Doorbird night vision activated for %s minutes.", this.name, DOORBIRD_NIGHTVISION_DURATION / 60);
          callback(null);
        });
    }

    // No relays configured...we error out.
    if(!this.primaryRelay) {
      this.log("%s: no relays have been configured. The Doorbird must have at least one active relay.", this.name);
      return false;
    }

    return true;
  }

  // Configure a camera accessory for HomeKit.
  private async configureVideoDoorbell(): Promise<boolean> {

    // Clear out any previous doorbell service.
    let doorbellService = this.accessory.getService(this.hap.Service.Doorbell);

    if(doorbellService) {
      this.accessory.removeService(doorbellService);
    }

    // Add the doorbell service to the Doorbird. HomeKit requires the doorbell service to be
    // the primary service on the accessory.
    doorbellService = new this.hap.Service.Doorbell(this.accessory.displayName);

    this.accessory.addService(doorbellService)
      .getCharacteristic(this.hap.Characteristic.ProgrammableSwitchEvent)
      .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
        // Provide the status of our primary relay.
        callback(null, this.relayCurrentState[this.primaryRelay]);
      });

    doorbellService.setPrimaryService(true);

    // Set the audio, video and shapshot URLs.
    this.audioUrl = this.dbApi.audioUrl();
    this.cameraUrl = this.dbApi.rtspUrl();
    this.snapshotUrl = this.config.snapshotUrl ? this.config.snapshotUrl : this.dbApi.snapshotUrl();

    // Configure the video stream and inform HomeKit about it.
    this.streamingDelegate = new DoorbirdStreamingDelegate(this);
    this.accessory.configureController(this.streamingDelegate.controller);

    return true;
  }

  // Turn on night vision on the Doorbird.
  async activateNightVision(): Promise<boolean> {

    if(this.nightVision) {
      return false;
    }

    // Assume we're going to be able to activate it until proven otherwise for responsiveness.
    this.nightVision = true;

    // Tell the Doorbird to turn on night vision.
    if(!(await this.dbApi.lightOn())) {
      this.nightVision = false;
      return false;
    }

    // Reflect our status in HomeKit.
    const lightService = this.accessory.getService(this.hap.Service.Lightbulb);

    if(!lightService) {
      return false;
    }

    lightService!.getCharacteristic(this.hap.Characteristic.On).updateValue(this.nightVision);

    // We've activated the light, now set a timer to turn it off in HomeKit. The light is automatically turned off after
    // 3 minutes on the Doorbird itself. It's not user-configurable.
    clearTimeout(this.nightVisionTimer);
    const self = this;

    this.nightVisionTimer = setTimeout(() => {
      self.nightVision = false;
      self.accessory.getService(this.hap.Service.Lightbulb)!.getCharacteristic(this.hap.Characteristic.On).updateValue(self.nightVision);

      // We also check to see if we're currently doing something that requires this light on. In practice,
      // what it means is that video streaming needs to be validated.
      if(this.streamingDelegate.needNightVision) {
        this.activateNightVision();
      }
    }, 1000 * DOORBIRD_NIGHTVISION_DURATION);

    this.log("%s: Doorbird night vision activated for %s minutes.", this.name, DOORBIRD_NIGHTVISION_DURATION / 60);
    return true;
  }

  // Motion event processing from Doorbird and delivered to HomeKit.
  private motionEventHandler(): void {

    if(!this.accessory) {
      return;
    }

    // If we already have a motion inflight, allow the event to complete so we don't spam users.
    if(this.motionEvent) {
      return;
    }

    // Retrieve our motion sensor.
    const motionService = this.accessory.getService(this.hap.Service.MotionSensor);

    if(!motionService) {
      return;
    }

    // Trigger the motion event.
    motionService.getCharacteristic(this.hap.Characteristic.MotionDetected).updateValue(true);
    this.motionEvent = true;
    this.log("%s: Motion detected.", this.name);

    // Reset our motion event after DOORBIRD_MOTION_DURATION.
    const self = this;
    setTimeout(() => {
      motionService.getCharacteristic(self.hap.Characteristic.MotionDetected).updateValue(false);
      self.motionEvent = false;
      self.debug("%s: Resetting motion event.", this.name);
    }, 1000 * DOORBIRD_MOTION_DURATION);

    // If configured, trigger a command line script.
    if(this.config.cmdMotion) {
      this.log("%s: Executing doorbell command: %s.", this.name, this.config.cmdMotion);
      exec(this.config.cmdMotion, (error) => {
        if(error) {
          this.log(this.name + ": Error executing motion command: " + error);
        }
      });
    }

  }

  // Doorbell event processing from Doorbird and delivered to HomeKit.
  private async doorbellEventHandler(): Promise<void> {

    if(!this.accessory) {
      return;
    }

    const doorbellService = this.accessory.getService(this.hap.Service.Doorbell);

    if(!doorbellService) {
      return;
    }

    // Should we use night vision?
    if(this.config.nightVisionDoorbell || (this.config.nightVisionDoorbellNight && this.platform.isNight())) {
      await this.activateNightVision();
    }

    // Tell HomeKit about the doorbell event.
    doorbellService
      .getCharacteristic(this.hap.Characteristic.ProgrammableSwitchEvent)
      .setValue(this.hap.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS);

    this.log("%s: Doorbird detected a doorbell ring.", this.name);

    // If configured, trigger a command line script.
    if(this.config.cmdDoorbell) {
      this.log("%s: Executing doorbell command: %s.", this.name, this.config.cmdDoorbell);
      exec(this.config.cmdDoorbell, (error) => {
        if(error) {
          this.log(this.name + ": Error executing doorbell command: " + error);
        }
      });
    }
  }
}
