# homebridge-doorbird

`homebridge-doorbird` is a plugin for Homebridge.  Giving you an integrated experience with your [DoorBird](https://www.doorbird.com) unit.

It provides; a camera stream using the [FFMpeg plugin](https://github.com/KhaosT/homebridge-camera-ffmpeg) project as a basis for this DoorBird Platform.  The doorbell is part of the camera as a service.  Motion sensor, lock mechanism and light service is all included. Activate notifications on the sensor(s) if you want iOS notifications pushed to your Home screen (requires a HomeKit Hub e.g. Apple TV or iPad for remote access).  You will see the Intercom on your DoorBird stream, however this is not supported in FFMpeg currently, it needs work.

![Alt Text](https://github.com/brownad/homebridge-doorbird/blob/master/doorbird.gif)

## Installation

If you are new to Homebridge, please first read the Homebridge [documentation](https://www.npmjs.com/package/homebridge).

1 Install Homebridge:
```sh
sudo npm install -g homebridge
```
2 Install FFMpeg, and setup Google Drive (optional) as per  [FFMpeg plugin](https://github.com/KhaosT/homebridge-camera-ffmpeg)

3 Install homebridge-doorbird:
```sh
sudo npm install -g homebridge-doorbird
```
4 Configure plugin:
```
 Update your configuration file. See config.json in this repository for a sample. Swap xxx for IP or credentials, wherever appropriate.
```

Try either RTSP or MJPEG for your camera stream, stability and speed is variable between the two:

`-re -f mjpeg -i http://xxxusername:xxxpassword@xxx.xxx.xxx/bha-api/video.cgi` 
`-rtsp_transport tcp -re -i rtsp://xxxusername:xxxpassword@xxx.xxx.xxx:8557/mpeg/media.amp`


## Configuration

Add the platform in [`config.json`](https://github.com/brownad/homebridge-doorbird/blob/master/config.json) in your home directory inside `.homebridge`.  

This uses the DoorBird notifications API, you must register your endpoint(s) like so as DoorBird will make calls to the included webserver using DoorBird's `notification api`:

* Doorbell
```sh
wget -q 'http://doorbird-ip/bha-api/notification.cgi?http-user=XXX&http-password=XXX&event=doorbell&subscribe=1&url=http://homebridge-ip:5005/doorbell.html'
```
* Motion sensor
```sh
wget -q 'http://doorbird-ip/bha-api/notification.cgi?http-user=XXX&http-password=XXX&event=motionsensor&subscribe=1&url=http://homebridge-ip:5005/motion.html'
```

You can check your API registrations inside the DoorBird app itself, under Administration -> HTTP Calls.

If you want command line events to fire off on Doorbell and Motion Sensor, then add the call(s) in your `config.json` to the `cmd_doorbell` or `cmd_motionsensor`.
This is useful if you want Homebridge to talk to other home automation endpoints, you can add a simple `wget -q foo`.

## Credits
https://github.com/Samfox2/homebridge-videodoorbell

https://github.com/KhaosT/homebridge-camera-ffmpeg
