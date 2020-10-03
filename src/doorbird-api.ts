/* Copyright(C) 2020, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * doorbird-api.ts: Our Doorbird API implementation.
 */
import { DOORBIRD_API_RESPONSE_TIME, DOORBIRD_HEARTBEAT_INTERVAL, DOORBIRD_REBOOT_DURATION } from "./settings";
import { DoorbirdDeviceDetail, DoorbirdDeviceInformation } from "./doorbird-types";
import fetch, { FetchError, RequestInfo, RequestInit, Response } from "node-fetch";
import { AbortController } from "abort-controller";
import { DoorbirdPlatform } from "./doorbird-platform";
import { Logging } from "homebridge";
import http from "http";

/*
 * The Doorbird API is well documented and supported. You can read about it at:
 * https://www.doorbird.com/downloads/api_lan.pdf
 */

export class DoorbirdApi {
  private debug: (message: string, ...parameters: unknown[]) => void;
  private doorbirdAddress: string;
  private eventHeartbeatTimer!: NodeJS.Timeout;
  events: { [index: string]: () => void };
  eventListenerConfigured = false;
  private log: Logging;
  mac: string | null;
  name: string;
  deviceType: string | null;
  firmware: string | null;
  relays: string[];
  private password: string;
  private username: string;

  // Initialize this instance with our login information.
  constructor(platform: DoorbirdPlatform, doorbirdName: string, doorbirdAddress: string, username: string, password: string) {
    this.debug = platform.debug.bind(platform);
    this.deviceType = null;
    this.events = {};
    this.doorbirdAddress = doorbirdAddress;
    this.firmware = null;
    this.log = platform.log;
    this.mac = null;
    this.name = doorbirdName;
    this.username = username;
    this.password = password;
    this.relays = [];
  }

  async login(): Promise<boolean> {
    const response = await this.fetch(this.authUrl() + "/bha-api/info.cgi", { method: "GET" });

    if(!response || !response.ok) {
      this.log("%s: Unable to retrieve device information from the Doorbird.", this.getName());

      return false;
    }

    // Now let's get our Doorbird configuration information.
    let data = null;

    try {
      data = await response.json() as DoorbirdDeviceInformation;
    } catch(error) {
      data = null;
      this.log("%s: Unable to parse the device information retrieved from the Doorbird.", this.getName());
    }

    // No device information returned.
    if(!data || !data.BHA) {
      this.log("%s: Unable to retrieve device information from the Doorbird.", this.getName());
      return false;
    }

    // We have our configuration information. Let's save some information.
    const birdInfo: DoorbirdDeviceDetail = data.BHA.VERSION[0];

    this.mac = birdInfo.PRIMARY_MAC_ADDR || birdInfo.WIFI_MAC_ADDR;
    this.deviceType = birdInfo["DEVICE-TYPE"];
    this.firmware = birdInfo.FIRMWARE;
    this.relays = birdInfo.RELAYS;

    // Launch the Doorbird events API monitor.
    void this.launchEventMonitor();

    // We're all set.
    return true;
  }

  // Activate night vision on the Doorbird.
  async lightOn(): Promise<boolean> {
    const response = await this.fetch(this.authUrl() + "/bha-api/light-on.cgi", { method: "GET" });

    if(!response || !response.ok) {
      this.log("%s: Unable to activate night vision on the Doorbird.", this.getName());
      return false;
    }

    return true;
  }

  // Unlock a relay on the Doorbird.
  async openDoor(relay: string): Promise<boolean> {
    const params = new URLSearchParams({ r: relay });

    const response = await this.fetch(this.authUrl() + "/bha-api/open-door.cgi" + "?" + params.toString(), { method: "GET" });

    if(!response || !response.ok) {
      this.log("%s: Unable to unlock relay %s on the Doorbird.", this.getName(), relay);
      return false;
    }

    return true;
  }

  // Monitor events generated on the Doorbird.
  private async launchEventMonitor(): Promise<void> {
    const url = this.authUrl() + "/bha-api/monitor.cgi?ring=doorbell,motionsensor";

    // Make sure we maintain a heartbeat and recover in case the API connection dies.
    const httpAgent = new http.Agent({ timeout: 1000 * DOORBIRD_HEARTBEAT_INTERVAL });
    const controller = new AbortController();

    // Open our connection to the Doorbird monitor API.
    let response;

    try {
      response = await fetch(url, { agent: httpAgent, method: "GET", signal: controller.signal });
    } catch(error) {
      if(error instanceof Error) {
        this.log("Error: %s, Message: %s", error.name, error.message);
      } else {
        this.log("An unknown error has occured: %s", error);
      }
    }

    // Our connection failed for some reason. Quietly go away.
    if(!response || !response.ok) {
      return;
    }

    const contentHeader = response.headers.get("Content-Type") ?? "";

    // Response we should receive: multipart/x-mixed-replace; boundary=--ioboundary
    // A little regex magic here. We don't want to match on the parts we don't want. Just save everything after boundary=
    const findContentBoundary = /(?<=^multipart\/x-mixed-replace; boundary=).*$/;
    const foundContentBoundary = findContentBoundary.exec(contentHeader);

    if(!foundContentBoundary) {
      this.log("%s: Unable to parse content-type header: %s.", this.getName(), contentHeader);
      return;
    }

    // Save the content boundary to delimit event responses.
    const contentBoundary = foundContentBoundary[0];

    this.log("%s: Connected to the Doorbird events API.", this.getName());

    let monitorTimeout: NodeJS.Timeout;

    // Now that we have a long-lived connection to the monitor API, we can process events generated by the Doorbird.
    response.body.on("data", (data: Buffer) => {
      const birdEvents = data.toString().split("\r\n");

      // The events API heartbeats every 20 seconds or so. We want to reset and retry if we ever exceed that.
      clearTimeout(monitorTimeout);

      // We missed a heartbeat.
      monitorTimeout = setTimeout(() => {
        this.log("%s: Connection to Doorbird events API has been lost. Reconnection attempt in %s minutes.",
          this.getName(), DOORBIRD_REBOOT_DURATION / 60);

        // Kill the previous connection, if it's still around.
        controller.abort();

        // Wait for the reboot to complete before retrying so we don't spam the Doorbird.
        setTimeout(() => {
          void this.launchEventMonitor();
        }, 1000 * DOORBIRD_REBOOT_DURATION );
      }, 1000 * DOORBIRD_HEARTBEAT_INTERVAL);

      // Iterate through the data chunk we've just received.
      for(const birdEventEntry of birdEvents) {

        // Skip if we're a blank line.
        if(!birdEventEntry.length) {
          continue;
        }

        // Skip if we are the content boundary.
        if(birdEventEntry === contentBoundary) {
          continue;
        }

        // Skip if we are the Content-Type header.
        if(birdEventEntry.toUpperCase() === "CONTENT-TYPE: TEXT/PLAIN") {
          continue;
        }

        // Monitor events should be in the form of event:value.
        const decodeBirdEvent = /^(.*):(.*)$/;

        // We intentionally ignore the first return value - it contains the full matching string
        // which we are uninterested in.
        const [, eventName, eventValue] = decodeBirdEvent.exec(birdEventEntry) ?? [];

        // An unknown response has been returned from the Doorbird events API. We only
        // know about two event types - doorbell and motionsensor.
        if(!eventName) {
          this.log("%s: Received an unknown response: %s.", this.getName(), birdEventEntry);
          continue;
        }

        // A low event hit means there's nothing to see here, move along.
        if(eventValue === "L") {
          continue;
        }

        // We've hit a motion sensor event.
        if(this.events[eventName]) {
          this.events[eventName]();
        } else {
          this.log("%s: Unhandled event captured: %s.", this.getName(), eventName);
        }
      }
    });
  }

  // Utility to generate a nicely formatted NVR string.
  public getName(): string {

    // Our Doorbird name, if it exists, appears as one of:
    //   DoorbirdName.
    //   DoorbirdType@Address.
    //   Address.

    if(this.name) {
      return this.name;
    }

    let birdName = "";

    if(this.deviceType) {
      birdName = this.deviceType + "@";
    }

    // Otherwise, we appear as NVRaddress.
    birdName += this.doorbirdAddress;

    return birdName;
  }

  // Return the URL for the Doorbird audio output stream.
  public systemEventsUrl(): string {

    // Audio is: http://user@password:doorbird-ip/bha-api/monitor.cgi?ring=events
    return this.authUrl() + "/bha-api/monitor.cgi?ring=doorbell,motionsensor";
  }

  // Return the URL for the Doorbird audio output stream.
  public audioUrl(): string {

    // Audio is: http://user@password:doorbird-ip/bha-api/audio-receive.cgi
    return this.authUrl() + "/bha-api/audio-receive.cgi";
  }

  // Return the URL for the Doorbird RTSP stream.
  public rtspUrl(): string {

    // RTSP video is: rtsp://user@password:doorbird-ip:8557/mpeg/media.amp
    return "rtsp://" + this.username + ":" + this.password + "@" + this.doorbirdAddress + ":8557/mpeg/media.amp";
  }

  // Return the URL for Doorbird image snapshots.
  public snapshotUrl(): string {

    // Snapshots are: http://user@password:doorbird-ip/bha-api/image.cgi
    return this.authUrl() + "/bha-api/image.cgi";
  }

  // Return the URL for Doorbird twoway audio.
  public twoWayAudioUrl(): string {

    // Return audio is: http://user@password:doorbird-ip/bha-api/audio-transmit.cgi
    return this.authUrl() + "/bha-api/audio-transmit.cgi";
  }

  // Return the URL for the Doorbird MJPEG video stream.
  public videoUrl(): string {

    // MJPEG video is: http://user@password:doorbird-ip/bha-api/video.cgi
    return this.authUrl() + "/bha-api/video.cgi";
  }

  // Return the right authentication URL for Doorbird API access.
  private authUrl(): string {
    // Authenticating against a Doorbird is done through: http://user@password:doorbird-ip.
    return "http://" + this.username + ":" + this.password + "@" + this.doorbirdAddress;
  }

  // Utility to let us streamline error handling and return checking from the Doorbird API.
  async fetch(url: RequestInfo, options: RequestInit = { method: "GET"}, logErrors = true, decodeResponse = true): Promise<Response | null> {
    let response: Response;

    // const httpAgent = new http.Agent({ timeout: 1000 * DOORBIRD_API_RESPONSE_TIME });
    const controller = new AbortController();

    // options.agent = httpAgent;
    options.signal = controller.signal;

    // Ensure API responsiveness and guard against hung connections.
    const timeout = setTimeout(() => {
      controller.abort();
    }, 1000 * DOORBIRD_API_RESPONSE_TIME);

    try {

      response = await fetch(url, options);

      // The caller will sort through responses instead of us.
      if(!decodeResponse) {
        return response;
      }

      // Bad username and password.
      if(response.status === 401) {
        this.log("%s: Invalid login credentials given. Please check your login and password.", this.getName());
        return null;
      }

      // Some other unknown error occurred.
      if(!response.ok) {
        this.log("%s: Error: %s - %s", this.getName(), response.status, response.statusText);
        return null;
      }

      return response;

    } catch(error) {

      if(error instanceof FetchError) {
        switch(error.code) {
          case "ECONNREFUSED":
            this.log("%s: Connection refused.", this.getName());
            break;

          case "ECONNRESET":
            this.log("%s: Connection reset.", this.getName());
            break;

          case "ENOTFOUND":
            this.log("%s: Hostname or IP address not found. Please ensure the address you configured for this Doorbird is correct.",
              this.getName());
            break;

          default:
            // Handle connection aborts due to Doorbird API timeouts.
            if(error.type === "aborted") {
              this.log("%s: Doorbird API connection was terminated because it was taking too long.", this.getName());
            } else if(logErrors) {
              this.log("ERROR CODE: %s", error.code);
              this.log(error.message);
            }
        }
      }

      return null;
    } finally {
      // Clear out our timeout if needed.
      clearTimeout(timeout);
    }
  }
}
