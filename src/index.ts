/* Copyright(C) 2017-2020, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * index.ts: homebridge-doorbird plugin registration.
 */
import { API } from "homebridge";

import { PLUGIN_NAME, PLATFORM_NAME } from "./settings";
import { DoorbirdPlatform } from "./doorbird-platform";

// Register our platform with homebridge.
export = (api: API) => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, DoorbirdPlatform);
}
