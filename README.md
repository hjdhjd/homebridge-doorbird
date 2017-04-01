# homebridge-doorbird

`homebridge-doorbird` is a plugin for Homebridge.  Giving you a basic experience with your [DoorBird](https://www.doorbird.com) unit.

It connects a motion sensor to your DoorBird unit, acting on doorbell activity.  You have to add the motion sensor to the same room as the camera stream (use ffmpeg plugin) and activate notfications on the sensor if you want iOS notifications pushed to your Home screen, limited to users in WIFI range only, and requires a Hub e.g. Apple TV or iPad.  

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
```sh
 Update your configuration file. See config.json in this repository for a sample. 
```
If you want it to trigger off the motion sensor, swap the `doorbell` for `motionsensor`.  Or have them both.

## Configuration

Add the platform in [`config.json`](https://github.com/brownad/homebridge-doorbird/blob/master/config.json) in your home directory inside `.homebridge`.  

## Note
If placed in a room with a camera it sends a notification with a snapshot/stream to your iOS device(s) after user pushes the DoorBird's doorbell button.

## Credits
https://github.com/Samfox2/homebridge-doorbell
