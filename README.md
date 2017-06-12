# homebridge-doorbird

`homebridge-doorbird` is a plugin for Homebridge.  Giving you a basic experience with your [DoorBird](https://www.doorbird.com) unit.

It connects a motion sensor to your DoorBird unit, acting on doorbell and a separate motion sensor for motion activity.  Add the motion sensors to the same room as the camera stream (use [FFMpeg plugin](https://github.com/KhaosT/homebridge-camera-ffmpeg)) and activate notifications on the sensors if you want iOS notifications pushed to your Home screen (requires a HomeKit Hub e.g. Apple TV or iPad).  You can also trigger the door open and the light on the DoorBird.

## Installation

If you are new to Homebridge, please first read the Homebridge [documentation](https://www.npmjs.com/package/homebridge).

1 Install homebridge:
```sh
sudo npm install -g homebridge
```
2 Install homebridge-doorbird:
```sh
sudo npm install -g git+https://github.com/brownad/homebridge-doorbird.git
```
3 Configure plugin:
```
 Update your configuration file. See config.json in this repository for a sample.
```

## Configuration

Add the platform in [`config.json`](https://github.com/brownad/homebridge-doorbird/blob/master/config.json) in your home directory inside `.homebridge`.  

This uses the DoorBird notifications API, you must register your endpoint like so:

```sh
wget -q 'http://doorbird-ip/bha-api/notification.cgi?http-user=XXX&http-password=XXX&event=doorbell&subscribe=1&url=http://homebridge-ip:8080/doorbell.html'
```

## Note
If placed in a room with a camera it sends a notification with a snapshot to your iOS device(s) after the user activates the DoorBird's doorbell or motion is detected.

## Credits
https://github.com/Samfox2/homebridge-doorbell
