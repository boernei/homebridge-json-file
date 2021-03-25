'use strict';
var fs = require('fs');
var inherits = require('util').inherits;
var Service, Characteristic, FakeGatoHistoryService;





module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    FakeGatoHistoryService = require('fakegato-history')(homebridge);
    homebridge.registerAccessory("homebridge-json-file", "json-file", HttpAccessory);
}

function HttpAccessory(log, config) {
    this.log = log;
    this.service = config["service"];
    this.name = config["name"];
    this.path = config["path"];
    this.sensors = config["sensors"];
    this.hostname = config["hostname"];
    this.deviceType = config["service"] || this.accessory;
    this.services = [];

    this.EvePowerConsumption = function() {
        Characteristic.call(this, 'Consumption', 'E863F10D-079E-48FF-8F27-9C2605A29F52');
        this.setProps({
            format: Characteristic.Formats.UINT16,
            unit: 'watts',
            maxValue: 1000000000,
            minValue: 0,
            minStep: 1,
            perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
        });
        this.value = this.getDefaultValue();
    };
    inherits(this.EvePowerConsumption, Characteristic);

    this.EveTotalPowerConsumption = function() {
        Characteristic.call(this, 'Total Consumption', 'E863F10C-079E-48FF-8F27-9C2605A29F52');
        this.setProps({
            format: Characteristic.Formats.FLOAT, // Deviation from Eve Energy observed type
            unit: 'kilowatthours',
            maxValue: 1000000000,
            minValue: 0,
            minStep: 0.001,
            perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
        });
        this.value = this.getDefaultValue();
    };
    inherits(this.EveTotalPowerConsumption, Characteristic);
}

HttpAccessory.prototype = {
    identify: function(callback) {
        this.log("Identify requested!");
        callback(); // success
    },
    getServices: function () {
        var informationService = new Service.AccessoryInformation();

        informationService
            .setCharacteristic(Characteristic.Manufacturer, "Bernhard Hering")
            .setCharacteristic(Characteristic.Model, this.deviceType)
            .setCharacteristic(Characteristic.SerialNumber, this.hostname + "-" +  this.name)

        this.services.push(informationService);

        for (var i = this.sensors.length - 1; i >= 0; i--) {
            let sensor = this.sensors[i];
            let path = this.path;
            this.log("Setting up: " + sensor.name);
            var myService = new Service [sensor.service](sensor.name);
            myService.log = this.log;
            var loggingService;
            if (sensor.caractheristic == "CurrentTemperature") {
                loggingService = new FakeGatoHistoryService('room', myService, {
                    size: 360 * 24 * 6,
                    storage: 'fs'
                });
                console.log("caractheristic" + sensor.caractheristic);
                myService.getCharacteristic(Characteristic[sensor.caractheristic])
                    .setProps({minValue: -10, maxValue: 100, minStep: 0.1})
                    .on('get', this.getState.bind(this,myService, loggingService, path, sensor.service, sensor.field, sensor.field2));

            } else {
                loggingService = new FakeGatoHistoryService('energy', myService, {
                    size: 360 * 24 * 6,
                    storage: 'fs'
                });
                myService.addCharacteristic(this.EvePowerConsumption);
                myService.addOptionalCharacteristic(this.EveTotalPowerConsumption)
                console.log("caractheristic" + sensor.caractheristic);
                myService.getCharacteristic(this.EvePowerConsumption)
                    .on('get', this.getState.bind(this,myService, loggingService, path, sensor.service, sensor["field"], sensor["field2"]));

                myService.getCharacteristic(this.EveTotalPowerConsumption)
                    .on('get', (callback) => {
                        var extraPersistedData = loggingService.getExtraPersistedData();
                        var totalenergy = 0
                        if (extraPersistedData != undefined)
                            totalenergy = extraPersistedData.totalenergy;
                        this.log.debug("getConsumptio" +  totalenergy);
                        callback(null, totalenergy);
                    });
            }


            this.services.push(loggingService);
            this.services.push(myService);

            this.timer_temp = setInterval(this.getState.bind(this, myService, loggingService, path, sensor.service, sensor["field"], sensor["field2"]), 10 * 60000);
        }

        return this.services;
    },
    getState: function (service, loggingService, path, servicetype, sensorfield, sensorfield2,callback) {
        fs.readFile(path, 'utf8' , (err, data) => {
            if (err) {
                console.error(err)
                return
            }
            try {
                let json = JSON.parse(data);
                var reading1 = -1;
                var reading2 = -1;
                json.body.records.forEach(function (element) {
                    if (element["type"] == sensorfield) {
                        reading1 = element["value"];
                    }
                    if (element["type"] == sensorfield2) {
                        reading2 = element["value"];
                    }
                });
                console.log("reading 1 und 2 " + reading1 + " : " + reading2)
                if (servicetype == "TemperatureSensor") {
                    console.log("TemperatureSensor")
                    service.getCharacteristic(Characteristic.CurrentTemperature).updateValue(reading1, null);
                    loggingService.addEntry({
                        time: Math.round(new Date().valueOf() / 1000),
                        temp: reading1,
                        humidity: 0,
                        ppm: 0
                    })
                } else { // CurrentPowerConsumption
                    console.log("power")
                    service.getCharacteristic(this.EvePowerConsumption).updateValue(reading1, null);
                    service.getCharacteristic(this.EveTotalPowerConsumption).updateValue((reading2 / 1000), null);

                    loggingService.addEntry({time: Math.round(new Date().valueOf() / 1000), power: reading1});
                    loggingService.setExtraPersistedData({totalenergy: (reading2 / 1000), lastReset: 0});

                }
                if (typeof callback == 'function') {
                    callback(null, reading1);
                }
                return reading1;
            } catch(e) {
                console.log(e); // error in the above string (in this case, yes)!
            }
            return
        })
    }

};


