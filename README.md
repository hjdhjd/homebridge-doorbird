# homebridge-doorbird

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
    "options": [ "Audio.Enable" ],

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

After restarting Homebridge, the DoorBird will need to be manually paired in the Home app, to do this:

1. Open the Home <img src="https://user-images.githubusercontent.com/3979615/78010622-4ea1d380-738e-11ea-8a17-e6a465eeec35.png" height="16.42px"> app on your device.
2. Tap the Home tab, then tap <img src="https://user-images.githubusercontent.com/3979615/78010869-9aed1380-738e-11ea-9644-9f46b3633026.png" height="16.42px">.
3. Tap *Add Accessory*, and select *I Don't Have a Code or Cannot Scan*.
4. Select the DoorBird for pairing.
5. Enter the Homebridge PIN, this can be found under the QR code in Homebridge UI or your Homebridge logs, alternatively you can select *Use DoorBird* and scan the QR code again.

### Feature Options
Feature options allow you to enable or disable certain features in this plugin. There are plugin-wide feature options, and some that are specific to individual Doorbirds.

The plugin-wide `options` setting is an array of strings used to customize feature options. Available options:

* `Audio.Enable` - enable Doorbird audio support in HomeKit. **This requires a version of [FFmpeg](https://ffmpeg.org) that is compiled with `fdk-aac` support.**

The feature options for individual Doorbird devices can be customized using the `options` setting inside the `doorbirds` section. Available options:

* <CODE>Relay.Hide.<I>relay</I></CODE> - hide the relay named *relay* from being shown in HomeKit.

### Doorbird notification configuration
Versions of `homebird-doorbird` prior to 0.3.0 required additional configuration in order to get notifications from Doorbird devices. Starting with 0.3.0, `homebridge-doorbird` uses the Doorbird monitoring API and no additional configuration is needed. If you previously configured notifications to Homebridge in the Doorbird, you can safely remove them by using the Doorbird app and navigating to Administration -> HTTP Calls and deleting the entries related to Homebridge.


#### Command line scripts.
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

## Advanced configuration (optional)
This step is not required. For those that prefer to tailor the defaults to their liking, here are the supported parameters.

```js
"platforms": [
  {
    "platform": "Doorbird",
    "name": "Doorbird",
    "videoProcessor": "/usr/local/bin/ffmpeg",
    "options": [ "Audio.Enable" ],

    "doorbirds": [
      {
        "name": "My Doorbird",
        "ip": "your.doorbird.ip",
        "username": "some-doorbird-user (or create a new one just for homebridge)",
        "password": "some-doorbird-password",
        "primaryRelay": "1",
        "cmdDoorbell": "/some/doorbell/script",
        "cmdMotion": "/some/motion/script",
        "options": [ "Relay.Hide.2" ]
      }
    ],

    "videoConfig": {
      "additionalCommandline": "-preset slow -profile:v high -level 4.2 -x264-params intra-refresh=1:bframes=0",
      "packetSize": 376,
      "maxStreams": 4,
      "maxWidth": 1280,
      "maxHeight": 720,
      "maxFPS": 15
    }
  }
]
```

Platform-level configuration parameters:

| Fields                 | Description                                             | Default                                                                               | Required |
|------------------------|---------------------------------------------------------|---------------------------------------------------------------------------------------|----------|
| platform               | Must always be `Doorbird`.                              |                                                                                       | Yes      |
| name                   | Name to use for the Doorbird platform.                  |                                                                                       | No       |
| videoProcessor         | Specify path of ffmpeg or avconv.                       | "ffmpeg"                                                                              | No       |
| options                | Configure plugin [feature options](#feature-options).   |                                                                                       | No       |
| debug                  | Enable debug logging.                                   | false                                                                                 | No       |

`doorbirds` configuration parameters:

| Fields                 | Description                                             | Default                                                                               | Required |
|------------------------|---------------------------------------------------------|---------------------------------------------------------------------------------------|----------|
| name                   | Name to use for this Doorbird.                          |                                                                                       | No       |
| ip                     | IP address of your Doorbird                             |                                                                                       | Yes      |
| username               | Your Doorbird username.                                 |                                                                                       | Yes      |
| password               | Your Doorbird password.                                 |                                                                                       | Yes      |
| primaryRelay           | Default relay to use for doorbell lock events.          | "1"                                                                                   | No       |
| cmdDoorbell            | Command line to execute when a doorbell event is triggered. |                                                                                   | No       |
| cmdMotion              | Command line to execute when a motion event is triggered. |                                                                                     | No       |
| options                | Configure [feature options](#feature-options) for this Doorbird.   |                                                                                       | No       |

`videoConfig` configuration parameters:

| Fields                 | Description                                             | Default                                                                               | Required |
|------------------------|---------------------------------------------------------|---------------------------------------------------------------------------------------|----------|
| additionalCommandline  | Additional parameters to pass ffmpeg to render video.   | "-preset slow -profile:v high -level 4.2 -x264-params intra-refresh=1:bframes=0"      | No       |
| packetSize             | Packet size for the camera stream in multiples of 188.  | 376                                                                                   | No       |
| maxStreams             | Maximum number of streams allowed for a camera.         | 4                                                                                     | No       |
| maxWidth               | Maximum width of a video stream allowed.                | 1280                                                                                  | No       |
| maxHeight              | Maximum height of a video stream allowed.               | 720                                                                                   | No       |
| maxFPS                 | Maximum framerate for a video stream.                   | 15                                                                                    | No       |
| source                 | Packet size for the camera stream in multiples of 188.  | autogenerated for Doorbirds                                                           | No       |
| stillImageSource       | Packet size for the camera stream in multiples of 188.  | autogenerated for Doorbirds                                                           | No       |
| mapaudio               | Mapping of audio channels for ffmpeg.                   | "1:0"                                                                                 | No       |
| mapvideo               | Mapping of video channels for ffmpeg.                   | "0:0"                                                                                 | No       |
| debug                  | Enable ffmpeg debugging for this Doorbird.              | 15                                                                                    | No       |

## Credits
* [homebridge-videodoorbell](https://github.com/Samfox2/homebridge-videodoorbell)
* [homebridge-camera-ffmpeg](https://github.com/KhaosT/homebridge-camera-ffmpeg)
* [hjdhjd](https://github.com/hjdhjd)
