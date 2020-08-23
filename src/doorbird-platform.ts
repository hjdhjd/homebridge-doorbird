/* Copyright(C) 2017-2020, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * doorbird-platform.ts: homebridge-doorbird platform class.
 */
import daynight from "daynight";
import { DoorbirdStation } from "./doorbird-station";
import { DoorbirdConfig } from "./doorbird-types";
import { API, APIEvent, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig } from "homebridge";
import { DOORBIRD_FFMPEG_OPTIONS } from "./settings";
import util from "util";

export class DoorbirdPlatform implements DynamicPlatformPlugin {
  accessories: PlatformAccessory[] = [];
  config: DoorbirdConfig;
  debugMode = false;
  readonly log: Logging;
  readonly api: API;
  private readonly doorbirds: DoorbirdStation[] = [];

  constructor(log: Logging, config: PlatformConfig, api: API) {
    this.api = api;

    // Force this to DoorbirdConfig.
    this.config = config as any;
    this.log = log;

    // We can't start without being configured.
    if(!config) {
      return;
    }

    // We need a Doorbird configured to do anything.
    if(!config.doorbirds) {
      this.log("No Doorbirds have been configured.");
      return;
    }

    // Capture configuration parameters.
    if(config.debug) {
      this.debugMode = config.debug === true;
      this.debug("Debug logging on. Expect a lot of data.");
    }

    // Additional ffmpeg options, in case the user wants to override the defaults. This option may be removed in a future release.
    if(!config.ffmpegOptions) {
      config.ffmpegOptions = DOORBIRD_FFMPEG_OPTIONS;
    }

    // Avoid a prospective race condition by waiting to configure our Doorbirds until Homebridge is done
    // loading all the cached accessories it knows about, and calling configureAccessory() on each.
    api.on(APIEvent.DID_FINISH_LAUNCHING, this.launchDoorbirds.bind(this));
  }

  // This gets called when homebridge restores cached accessories at startup. We
  // intentionally avoid doing anything significant here, and save all that logic
  // for device discovery.
  configureAccessory(accessory: PlatformAccessory): void {

    // Add this to the accessory array so we can track it.
    this.accessories.push(accessory);
  }

  // Launch Doorbirds.
  private launchDoorbirds(): void {

    // Loop through each configured Doorbird and instantiate it.
    for(const doorbirdStationConfig of this.config.doorbirds) {

      // We need an IP address, or there's nothing to do.
      if(!doorbirdStationConfig.ip) {
        this.log("No host or IP address has been configured.");
        return;
      }

      // We need login credentials or we're skipping this one.
      if(!doorbirdStationConfig.username || !doorbirdStationConfig.password) {
        this.log("No Doorbird login credentials have been configured.");
        return;
      }

      // Validate our night vision settings.
      doorbirdStationConfig.nightVisionDoorbell = doorbirdStationConfig.nightVisionDoorbell === true;
      doorbirdStationConfig.nightVisionSnapshot = doorbirdStationConfig.nightVisionSnapshot === true;
      doorbirdStationConfig.nightVisionVideo = doorbirdStationConfig.nightVisionVideo === true;
      doorbirdStationConfig.nightVisionDoorbellNight = doorbirdStationConfig.nightVisionDoorbellNight === true;
      doorbirdStationConfig.nightVisionSnapshotNight = doorbirdStationConfig.nightVisionSnapshotNight === true;
      doorbirdStationConfig.nightVisionVideoNight = doorbirdStationConfig.nightVisionVideoNight === true;

      this.doorbirds.push(new DoorbirdStation(this, doorbirdStationConfig));
    }
  }

  // Utility function to determine whether it's day or night.
  isNight(): boolean {
    const dayNight = daynight();

    // If we can't figure out if it's night, always assume it's day.
    return dayNight.error ? false : dayNight.dark;
  }

  // Utility for debug logging.
  debug(message: string, ...parameters: any[]) {
    if(this.debugMode) {
      this.log(util.format(message, ...parameters));
    }
  }
}
