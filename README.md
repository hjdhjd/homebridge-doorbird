<SPAN ALIGN="CENTER">

[![homebridge-doorbird: Native HomeKit support for Doorbird](https://raw.githubusercontent.com/brownad/homebridge-doorbird/master/homebridge-doorbird.svg)](https://github.com/brownad/homebridge-doorbird)

# Homebridge Doorbird

[![Downloads](https://badgen.net/npm/dt/homebridge-doorbird)](https://www.npmjs.com/package/homebridge-doorbird)
[![Version](https://badgen.net/npm/v/homebridge-doorbird)](https://www.npmjs.com/package/homebridge-doorbird)

## HomeKit support for Doorbird video doorbells using [Homebridge](https://homebridge.io).
</SPAN>

`homebridge-doorbird` is a plugin for Homebridge intended to give you an integrated experience with your [Doorbird](https://www.doorbird.com) devices.

It provides the HomeKit video doorbell service which includes a camera, lock, motion sensor, and infrared light service, using the excellent [homebridge-camera-ffmpeg](https://github/KhaosT/homebridge-camera-ffmpeg) as a foundation.

## Requirements and Limitations
* Audio requires a version of [FFmpeg](https://ffmpeg.org) that is compiled with `fdk-aac` support. This plugin uses [ffmpeg-for-homebridge](https://github.com/homebridge/ffmpeg-for-homebridge) to streamline this for some of the more common operating systems. Check the [ffmpeg-for-homebridge](https://github.com/homebridge/ffmpeg-for-homebridge) page for details on supported operating systems. If your operating system isn't supported, you'll need to compile your own. Instructions are beyond the scope of this plugin.

* Two-way audio is not currently supported. Currently, you can hear audio but the microphone capability is yet to be implemented.

## Installation

If you are new to Homebridge, please first read the Homebridge [documentation](https://www.npmjs.com/package/homebridge).

1. Install Homebridge:
```sh
sudo npm install -g --unsafe-perm homebridge
```

2. Install homebridge-doorbird:
```sh
sudo npm install -g --unsafe-perm homebridge-doorbird
```

## Plugin configuration
Add the platform in `config.json` in your home directory inside `.homebridge` and edit the required fields. If you want audio support, make sure to enable the feature option `Audio.Enable` in `options`.

```js
"platforms": [
  {
    "platform": "Doorbird",

    "doorbirds": [
      {
        "name": "Doorbird 1",
        "ip": "your.doorbird.ip",
        "username": "some-doorbird-user (or create a new one just for homebridge)",
        "password": "some-doorbird-password",
        "options": [ "Relay.Hide.2" ]
      }
    ]
  }
]
```

### Feature Options
Feature options allow you to enable or disable certain features in this plugin. Feature options are specific to individual Doorbirds.

The feature options for individual Doorbird devices can be customized using the `options` setting inside the `doorbirds` section. Available options:

* <CODE>Relay.Hide.<I>relay</I></CODE> - hide the relay named *relay* from being shown in HomeKit.

### Night vision
Depending on your situation, you might benefit from having Doorbird's infrared light (aka night vision) turn on automatically for you.

This plugin supports the ability to enable night vision when the doorbell rings, HomeKit requests snapshots, or stream video. Night vision can be always-on or activated only at night, for supported events.

See [advanced configuration](#advanced-config) for more details, or configure this plugin using the Homebridge webUI.

### Command line scripts.
If you would like to configure a command line to execute when motion or doorbell events are triggered, you can configure the `cmdDoorbell` and `cmdMotion`, respectively.

### Relays and peripheral devices

The default for this plugin is to lock or unlock the first relay (relay 1) in the Doorbird. This is typically a door strike that unlocks a gate or door.

Support for multiple relays is available on some Doorbird devices and on the following optionally attached peripheral devices:

* A1081 E/A Controller (https://www.doorbird.com/downloads/manual_a1081_en_de.pdf) - TESTED
* A1101 Indoor Station (https://www.doorbird.com/downloads/datasheet/datasheet_a1101_en.pdf) - UNTESTED

All relays found on the Doorbird, including peripherals, will be made available in HomeKit and the Home app.

You may switch the default relay using the `primaryRelay` configuration parameter.
To identify the relay names to use, review the homebridge log and look for log entries beginning with `detected relay: xxxx` to identify the relay you wish to use by default.
In the previous example, you would use `"primaryRelay": "xxxx"` to set `xxxx` as the default relay to unlock.

Example configuration for an alternate relay as the default:
```js
"primaryRelay": "2"
```

Another example configuration using a relay on a peripheral device:
```js
"primaryRelay": "gggggg@1"
```

The name of the controller or station can be found in the App:
Administration > Peripherals > Device (6-letter word)

### <A NAME="advanced-config"></A>Advanced configuration (optional)
This step is not required. For those that prefer to tailor the defaults to their liking, here are the supported parameters.

```js
"platforms": [
  {
    "platform": "Doorbird",
    "name": "Doorbird",
    "videoProcessor": "/usr/local/bin/ffmpeg",
    "ffmpegOptions": "-probesize 32 -analyzeduration 0 -fflags nobuffer -preset veryfast -refs 1 -x264-params intra-refresh=1:bframes=0",

    "doorbirds": [
      {
        "ip": "your.doorbird.ip",
        "username": "some-doorbird-user (or create a new one just for homebridge)",
        "password": "some-doorbird-password",
        "name": "My Doorbird",
        "nightVisionDoorbell": false,
        "nightVisionSnapshot": false,
        "nightVisionVideo": false,
        "nightVisionDoorbellNight": false,
        "nightVisionSnapshotNight": false,
        "nightVisionVideoNight": false,
        "primaryRelay": "1",
        "cmdDoorbell": "/some/doorbell/script",
        "cmdMotion": "/some/motion/script",
        "options": [ "Relay.Hide.2" ]
      }
    ]
  }
]
```

Platform-level configuration parameters:

| Fields                 | Description                                             | Default                                                                               | Required |
|------------------------|---------------------------------------------------------|---------------------------------------------------------------------------------------|----------|
| platform               | Must always be `Doorbird`.                              |                                                                                       | Yes      |
| name                   | Name to use for the Doorbird platform.                  |                                                                                       | No       |
| videoProcessor         | Specify path of ffmpeg or avconv.                       | "ffmpeg"                                                                              | No       |
| ffmpegOptions          | Additional parameters to pass ffmpeg to render video.   | "-probesize 32 -analyzeduration 0 -fflags nobuffer -preset veryfast -refs 1 -x264-params intra-refresh=1:bframes=0"      | No       |
| debug                  | Enable debug logging.                                   | false                                                                                 | No       |

`doorbirds` configuration parameters:

| Fields                 | Description                                             | Default                                                                               | Required |
|------------------------|---------------------------------------------------------|---------------------------------------------------------------------------------------|----------|
| ip                     | IP address of your Doorbird                             |                                                                                       | Yes      |
| username               | Your Doorbird username.                                 |                                                                                       | Yes      |
| password               | Your Doorbird password.                                 |                                                                                       | Yes      |
| name                   | Name to use for this Doorbird.                          |                                                                                       | No       |
| nightVisionDoorbell    | Always activate night vision when the doorbell rings.   | false                                                                                 | No       |
| nightVisionSnapshot    | Always activate night vision when taking snapshots.     | false                                                                                 | No       |
| nightVisionVideo       | Always activate night vision when streaming video.      | false                                                                                 | No       |
| nightVisionDoorbellNight | Activate night vision when the doorbell rings at night. | false                                                                               | No       |
| nightVisionSnapshotNight | Activate night vision when taking snapshots at night. | false                                                                                 | No       |
| nightVisionVideoNight    | Activate night vision when streaming video at night.  | false                                                                                 | No       |
| primaryRelay           | Default relay to use for doorbell lock events.          | "1"                                                                                   | No       |
| cmdDoorbell            | Command line to execute when a doorbell event is triggered. |                                                                                   | No       |
| cmdMotion              | Command line to execute when a motion event is triggered. |                                                                                     | No       |
| options                | Configure [feature options](#feature-options) for this Doorbird. |                                                                              | No       |

## Credits
* [homebridge-videodoorbell](https://github.com/Samfox2/homebridge-videodoorbell)
* [homebridge-camera-ffmpeg](https://github.com/KhaosT/homebridge-camera-ffmpeg)
* [hjdhjd](https://github.com/hjdhjd)
