# homebridge-doorbird

`homebridge-doorbird` is a plugin for Homebridge.  Giving you an integrated experience with your [Doorbird](https://www.doorbird.com) Door Station.

It provides the HomeKit video doorbell service which includes a camera, lock, motion sensor, and infrared light service, using the excellent [homebridge-camera-ffmpeg](https://github/KhaosT/homebridge-camera-ffmpeg) as a foundation.

## Requirements and Limitations
* Audio requires an installation of [FFmpeg](https://ffmpeg.org) that is compiled with `fdk-aac` support. This plugin uses [ffmpeg-for-homebridge](https://github.com/homebridge/ffmpeg-for-homebridge) to streamline this for some of the more common operating systems. Check the `ffmpeg-for-homebridge` for details on supported operating systems. If your operating system isn't support, you'll need to compile your own. Instructions are beyond the scope of this plugin.

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
Add the platform in `config.json` in your home directory inside `.homebridge` and edit the required fields. If you want audio support, make sure to set `audio` to `true`.

```js
"platforms": [
  {
    "platform": "Doorbird",

    "cameras": [
      {
        "name": "Doorbird 1",
        "doorbird": "your.doorbird.ip",
        "username": "some-doorbird-user (or create a new one just for homebridge)",
        "password": "some-doorbird-password",
        "audio": true
      }
    ]
  }
]
```

### Doorbird notification configuration
In order for the plugin to receive notifications from Doorbird, you need to configure the Doorbird to notify `homebridge-doorbird`.

#### Doorbell notifications
```sh
wget -q 'http://doorbird-ip/bha-api/notification.cgi?http-user=XXX&http-password=XXX&event=doorbell&subscribe=1&url=http://homebridge-ip:5005/doorbell.html'
```

* Motion sensor notifications
```sh
wget -q 'http://doorbird-ip/bha-api/notification.cgi?http-user=XXX&http-password=XXX&event=motionsensor&subscribe=1&url=http://homebridge-ip:5005/motion.html'
```

You can check your API registrations inside the Doorbird app itself, under Administration > HTTP Calls.

Additionally, if you would like to configure command line scripts or commands to execute when motion or doorbell events are triggered, you can configure the `cmdDoorbell` and `cmdMotion`, respectively.

### Relays and peripheral devices

The default for this plugin is to lock or unlock the first relay (relay 1) in the Doorbird. This is typically a door strike that unlocks a gate or door.

Support for multiple relays is available on some Doorbird devices and on the following optionally attached peripheral devices:

* A1081 E/A Controller (https://www.doorbird.com/downloads/manual_a1081_en_de.pdf) - TESTED
* A1101 Indoor Station (https://www.doorbird.com/downloads/datasheet/datasheet_a1101_en.pdf) - UNTESTED

All relays found on the Doorbird, including peripherals, will be made available in HomeKit and the Home app.

You may switch the default relay using the `defaultRelay` configuration parameter. 
To identify the relay names to use, review the homebridge log and look for log entries beginning with `Detected relay: xxxx` to identify the relay you wish to use by default. 
In the previous example, you would use `"defaultRelay": "xxxx"` to set `xxxx` as the default relay to unlock.

Example configuration for an alternate relay as the default:
```js
"defaultRelay": "2"
```

Another example configuration using a relay on a peripheral device:
```js
"defaultRelay": "gggggg@1"
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
    "debug": no,

    "cameras": [
      {
        "name": "My Doorbird",
        "doorbird": "your.doorbird.ip",
        "username": "some-doorbird-user (or create a new one just for homebridge)",
        "password": "some-doorbird-password",
        "audio": true,
        "defaultRelay": "1",
        "cmdDoorbell": "/some/doorbell/script",
        "cmdMotion": "/some/motion/script",
        "port": 5005
      }
    ],
    
    "videoConfig": {
      "additionalCommandline": "-preset slow -profile:v high -level 4.2 -x264-params intra-refresh=1:bframes=0",
      "maxStreams": 4,
      "maxWidth": 1280,
      "maxHeight": 720,
      "maxFPS": 15,
      "packetSize": 376
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
| debug                  | Enable additional debug logging.                        | no                                                                                    | No       |

Camera-level configuration parameters:

| Fields                 | Description                                             | Default                                                                               | Required |
|------------------------|---------------------------------------------------------|---------------------------------------------------------------------------------------|----------|
| doorbird               | IP address of your Doorbird                             |                                                                                       | Yes      |
| username               | Your Doorbird username.                                 |                                                                                       | Yes      |
| password               | Your Doorbird password.                                 |                                                                                       | Yes      |
| name                   | Name to use for this Doorbird.                          |                                                                                       | No       |
| audio                  | Enable audio support for Doorbird.                      | no                                                                                    | No       |
| cmdDoorbell            | Command line to execute when a doorbell event is triggered. |                                                                                   | No       |
| cmdMotion              | Command line to execute when a motion event is triggered. |                                                                                     | No       |
| defaultRelay           | Default relay to use for doorbell lock events.          | "1"                                                                                   | No       |
| additionalCommandline  | Additional parameters to pass ffmpeg to render video.   | "-preset slow -profile:v high -level 4.2 -x264-params intra-refresh=1:bframes=0"      | No       |
| packetSize             | Packet size for the camera stream in multiples of 188.  | 376                                                                                   | No       |
| maxStreams             | Maximum number of streams allowed for a camera.         | 4                                                                                     | No       |
| maxWidth               | Maximum width of a video stream allowed.                | 1280                                                                                  | No       |
| maxHeight              | Maximum height of a video stream allowed.               | 720                                                                                   | No       |
| maxFPS                 | Maximum framerate for a video stream.                   | 15                                                                                    | No       |
| port                   | Port to use for the plugin webserver for notifications. | 5005                                                                                  | No       |

## Credits
* [homebridge-videodoorbell](https://github.com/Samfox2/homebridge-videodoorbell)
* [homebridge-camera-ffmpeg](https://github.com/KhaosT/homebridge-camera-ffmpeg)
* [hjdhjd](https://github.com/hjdhjd)
