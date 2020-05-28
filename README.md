# homebridge-doorbird

`homebridge-doorbird` is a plugin for Homebridge.  Giving you an integrated experience with your [DoorBird](https://www.doorbird.com) unit.

It provides; a camera stream using the [FFMpeg plugin](https://github.com/KhaosT/homebridge-camera-ffmpeg) project as a basis for this DoorBird Platform.  The doorbell is part of the camera as a service.  Motion sensor, lock mechanism and light service is all included. Activate notifications on the sensor(s) if you want iOS notifications pushed to your Home screen (requires a HomeKit Hub e.g. Apple TV or iPad for remote access).  Basic audio recieve is supported in the intercom as a Speaker service.  Microphone is to be implemented.

![Alt Text](https://github.com/brownad/homebridge-doorbird/blob/master/doorbird.gif)

## Installation

If you are new to Homebridge, please first read the Homebridge [documentation](https://www.npmjs.com/package/homebridge).

1 Install Homebridge:
```sh
sudo npm install -g homebridge
```
2 Install FFMpeg, and setup Google Drive (optional) as per  [FFMpeg plugin](https://github.com/KhaosT/homebridge-camera-ffmpeg), for Audio support you must have a compiled version of FFMpeg with fdk-aac support.

3 Install homebridge-doorbird:
```sh
sudo npm install -g homebridge-doorbird
```
4 Configure plugin:
```
 Update your configuration file. See config.json in this repository for a sample. Swap xxx for IP or credentials, wherever appropriate. 
```

Use RTSP camera stream if you want to enable Audio:

`"source": "-re -rtsp_transport tcp -i rtsp://doorbirduser:doorbirdpass@doorbirdip:8557/mpeg/media.amp -f mulaw -ar 8000 -i http://doorbirduser:doorbirdpass@doorbirdip/bha-api/audio-receive.cgi`

Along with setting:

`"audio": true`

If you want MJPEG and no Audio use: 

`-re -f mjpeg -i http://xxxusername:xxxpassword@xxx.xxx.xxx/bha-api/video.cgi` 

5. Add Accessory:
Add DoorBird accessory in Home app. The setup code is the same as homebridge.  The device does not appear automatically in Home app.  It requires you to add the Accessory and onboard it.

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

* Relays and Devices

The default relay for the plugin to lock/unlock is the first relay in the Video Door Station.

Doorbird supports multiple relays in the door station itself and on the following optionally attached peripheral devices:
- A1081 E/A Controller (https://www.doorbird.com/downloads/manual_a1081_en_de.pdf) - TESTED
- A1101 Indoor Station (https://www.doorbird.com/downloads/datasheet/datasheet_a1101_en.pdf) - UNTESTED

You may switch the lock/unlock functionality to any of the relays in either the door station, E/A controller or the indoor station (UNTESTED).

Sample Config snippet for alternate relay:
```
"relay_no": "2"
````

Sample Config snippet for peripheral device:
```
"use_peripheral": true,
"peripheral_name": "gggggg",
"peripheral_relay_no": "1",
```

The name of the controller or station can be found in the App: 
Administration > Peripherals > Device (6-letter word)

_ToDo: expose additional relays and digital inputs in homekit_


## Credits
https://github.com/Samfox2/homebridge-videodoorbell

https://github.com/KhaosT/homebridge-camera-ffmpeg
