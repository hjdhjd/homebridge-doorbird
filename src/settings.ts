/* Copyright(C) 2017-2020, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * settings.ts: Settings and constants for homebridge-doorbird.
 */
// The name of our plugin.
export const PLUGIN_NAME = "homebridge-doorbird";

// The platform the plugin creates.
export const PLATFORM_NAME = "Doorbird";

// FFmpeg options.
export const DOORBIRD_FFMPEG_OPTIONS = "-probesize 32 -analyzeduration 0 -fflags nobuffer -preset veryfast -refs 1 -x264-params intra-refresh=1:bframes=0";

// Doorbird API response time, in seconds. This setting drives how responsive we appear to be to end users for things like night vision.
export const DOORBIRD_API_RESPONSE_TIME = 3;

// Doorbird monitor events API has a heartbeat interval of roughly every 20 seconds. We pad a little, just in case.
export const DOORBIRD_HEARTBEAT_INTERVAL = 25;

// Doorbird motion event duration, in seconds. This is set by the Doorbird itself and is not user configurable.
export const DOORBIRD_MOTION_DURATION = 30;

// Doorbird night vision infrared light duration, in seconds. This is set by the Doorbird itself and is not user configurable.
export const DOORBIRD_NIGHTVISION_DURATION = 180;

// Doorbird takes about 2 minutes to reboot.
export const DOORBIRD_REBOOT_DURATION = 120;

// Doorbird unlock relay duration, in seconds. This can be configured within the Doorbird app, but rarely customized by users.
export const DOORBIRD_UNLOCK_DURATION = 5;
