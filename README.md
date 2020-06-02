# homebridge-doorbird

`homebridge-doorbird` is a plugin for Homebridge.  Giving you an integrated experience with your [Doorbird](https://www.doorbird.com) Door Station.

It provides the HomeKit video doorbell service which includes a camera, lock, motion sensor, and infrared light service, using the excellent [homebridge-camera-ffmpeg](https://github/KhaosT/homebridge-camera-ffmpeg) as a foundation.

## Requirements and Limitations
* Audio requires an installation of [FFmpeg](https://ffmpeg.org) that is compiled with `fdk-aac` support. This plugin uses [ffmpeg-for-homebridge](https://github.com/homebridge/ffmpeg-for-homebridge) to streamline this for some of the more common operating systems. Check the `ffmpeg-for-homebridge` for details on supported operating systems. If your operating system isn't supported, you'll need to compile your own. Instructions are beyond the scope of this plugin.

* Two-way audio is not currently supported. Currently, you can hear audio but the microphone capability is yet to be implemented.

* Additional relays and digital inputs are not currently exposed in this plugin, though you can trigger alternative relays (see below).

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
     "platform": "DoorBird",
     "name": "Doorbird",
     "cameras": [
     {
       "name": "DoorBird",
       "doorbird": "xxx",
       "username": "xxx",
       "password": "xxx",
       "audio": true
     }
    ]
  },
]
```

### Doorbird notification configuration
In order for the plugin to receive notifications from Doorbird, you need to configure the Doorbird to notify `homebridge-doorbird`.

* Doorbell notifications
```sh
wget -q 'http://doorbird-ip/bha-api/notification.cgi?http-user=XXX&http-password=XXX&event=doorbell&subscribe=1&url=http://homebridge-ip:5005/doorbell.html'
```

* Motion sensor notifications
```sh
wget -q 'http://doorbird-ip/bha-api/notification.cgi?http-user=XXX&http-password=XXX&event=motionsensor&subscribe=1&url=http://homebridge-ip:5005/motion.html'
```

You can check your API registrations inside the DoorBird app itself, under Administration > HTTP Calls.

Additionally, if you would like to configure command line scripts or commands to execute when motion or doorbell events are triggered, you can configure the `cmdDoorbell` and `cmdMotion`, respectively.

* Relays and peripheral devices

The default relay for this plugin is to lock or unlock the first relay in the Doorbird. This is typically a door strike that unlocks a gate or door.

However, there is support for multiple relays available on some Doorbird devices and on the following optionally attached peripheral devices:

* A1081 E/A Controller (https://www.doorbird.com/downloads/manual_a1081_en_de.pdf) - TESTED
* A1101 Indoor Station (https://www.doorbird.com/downloads/datasheet/datasheet_a1101_en.pdf) - UNTESTED

You may switch the lock functionality to any of the relays on Doorbird devices or peripherals using the `relay` configuration parameter.

Example configuration for an alternate relay:
```js
"relay": "2"
```

Example configuration for peripheral device:
```js
"peripheral": "gggggg",
"peripheralRelay": "1",
```

The name of the controller or station can be found in the App: 
Administration > Peripherals > Device (6-letter word)

## Advanced configuration (optional)
This step is not required. For those that prefer to tailor the defaults to their liking, here are the supported parameters.

```js
"platforms": [
  {
    "platform": "DoorBird",
    "name": "Doorbird",
    "videoProcessor": "/usr/local/bin/ffmpeg",
    "port": 5005,
    "debug": no,

    "cameras": [
      {
        "doorbird": "your.doorbird.ip",
        "username": "some-doorbird-user (or create a new one just for homebridge)",
        "password": "some-doorbird-password",
        "audio": "true",
        "cmdDoorbell": "/some/doorbell/script",
        "cmdMotion": "/some/motion/script",
        "relay": 1
      }
    ],
    
    "videoConfig": {
      "additionalCommandline": "-preset slow -profile:v high -level 4.2 -x264-params intra-refresh=1:bframes=0",
      "maxStreams": 4
      "maxWidth": 1280
      "maxHeight": 720
      "maxFPS": 15,
      "packetSize": 376
    }
  }
]
```

| Fields                 | Description                                             | Default                                                                               | Required |
|------------------------|---------------------------------------------------------|---------------------------------------------------------------------------------------|----------|
| platform               | Must always be `DoorBird`.                              |                                                                                       | Yes      |
| name                   | For logging purposes.                                   |                                                                                       | No       |
| videoProcessor         | Specify path of ffmpeg or avconv.                       | "ffmpeg"                                                                              | No       |
| port                   | Port to use for the plugin webserver for notifications. | 5005                                                                                  | No       |
| debug                  | Enable additional debug logging.                        | no                                                                                    | No       |
| doorbird               | IP address of your Doorbird                             |                                                                                       | Yes      |
| username               | Your Doorbird username.                                 |                                                                                       | Yes      |
| password               | Your Doorbird password.                                 |                                                                                       | Yes      |
| cmdDoorbell            | Command line to execute when a doorbell event is triggered. |                                                                                   | No       |
| cmdMotion              | Command line to execute when a motion event is triggered. |                                                                                     | No       |
| relay                  | Alternate relay to use for lock events.                 |                                                                                       | No       |
| peripheral             | Alternate peripheral name to use for lock events.       |                                                                                       | No       |
| peripheralRelay        | Alternate peripheral relay to use for lock events. (must be used with peripheral) |                                                             | No       |
| additionalCommandline  | Additional parameters to pass ffmpeg to render video.   | "-preset slow -profile:v high -level 4.2 -x264-params intra-refresh=1:bframes=0"      | No       |
| maxStreams             | Maximum number of streams allowed for a camera.         | 4                                                                                     | No       |
| maxWidth               | Maximum width of a video stream allowed.                | 1280                                                                                  | No       |
| maxHeight              | Maximum height of a video stream allowed.               | 720                                                                                   | No       |
| maxFPS                 | Maximum framerate for a video stream.                   | 15                                                                                    | No       |
| packetSize             | Packet size for the camera stream in multiples of 188.  | 376                                                                                   | No       |
| audio                  | Enable audio support for Doorbird.                      | no                                                                                    | No       |

## Credits
* [homebridge-videodoorbell](https://github.com/Samfox2/homebridge-videodoorbell)
* [homebridge-camera-ffmpeg](https://github.com/KhaosT/homebridge-camera-ffmpeg)
* [hjdhjd](https://github.com/hjdhjd)
