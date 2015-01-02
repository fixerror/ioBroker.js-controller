/* jshint -W097 */// jshint strict:false
/*jslint node: true */
/*jshint -W061 */
"use strict";

var io =       require('socket.io-client');
var util     = require('util');
var stream   = require('stream');
var Writable = stream.Writable;
var memStore = {};

/* Writable memory stream */
function WMStrm(key, options) {
    // allow use without new operator
    if (!(this instanceof WMStrm)) {
        return new WMStrm(key, options);
    }

    Writable.call(this, options); // init super
    this.key = key; // save key
    memStore[key] = new Buffer(''); // empty
}
util.inherits(WMStrm, Writable);

WMStrm.prototype._write = function (chunk, enc, cb) {
    // our memory store stores things in buffers
    var buffer = (Buffer.isBuffer(chunk)) ?
        chunk :  // already is Buffer use it
        new Buffer(chunk, enc);  // string, convert

    // concat to the buffer already there
    memStore[this.key] = Buffer.concat([memStore[this.key], buffer]);
    cb();
};

function ObjectsInMemClient(settings) {
    var client;
    var that =       this;
    var subscribes = [];

    var log =  settings.logger;
    if (!log) {
        log = {
            info:  function (msg) {/*console.log(msg);*/},
            debug: function (msg) {/*console.log(msg);*/},
            warn:  function (msg) {
                console.log(msg);
            },
            error: function (msg) {
                console.log(msg);
            }
        };
    }

    var __construct = (function () {
        if (!settings.secure) {
            client = io.connect('http://' + (settings.bind != '0.0.0.0' ? settings.bind || '127.0.0.1' : '127.0.0.1') + ':' + (settings.memPort || 9001));
        } else {
            client = io.connect('https://' + (settings.bind != '0.0.0.0' ? settings.bind || '127.0.0.1' : '127.0.0.1') + ':' + (settings.memPort || 9001));
        }

        if (typeof settings.change === 'function') {
            client.on('message', function (pattern, channel, message) {
                log.debug('inMem message ', pattern, channel, message);
                try {
                    settings.change(channel, message);
                } catch (e) {
                    log.error('message ' + channel + ' ' + message + ' ' + e.message);
                    log.error(e.stack);
                }
            });
        }
        client.on('disconnect', function (error) {
            if (typeof settings.disconnected === 'function') {
                settings.disconnected(error);
            }
        });
        client.on('error', function (error) {
            if (typeof settings.disconnected === 'function') {
                settings.disconnected(error);
            } else {
                log.error(error.message);
                log.error(error.stack);
            }
        });
        client.on('error', function (error) {
            //console.log("No redis connection!");
        });
        client.on('connect', function (error) {
            if (typeof settings.connected === 'function') settings.connected();
        });
        client.on('reconnect', function (error) {
            // Re-initialise subscribes
            for (var i = 0; i < subscribes.length; i++) client.emit('subscribe', subscribes[i]);
            if (typeof settings.connected === 'function') settings.connected();
        });
    })();

    settings = settings || {};

    this.subscribe = function (pattern) {
        if (subscribes.indexOf(pattern) == -1) subscribes.push(pattern);
        if (!client) return;
        client.emit('subscribe', pattern);
    };

    this.unsubscribe = function (pattern) {
        var pos = subscribes.indexOf(pattern);
        if (pos != -1) subscribes.splice(pos, 1);

        if (!client) return;
        client.emit('unsubscribe', pattern);
    };

    this.destroy = function (callback) {
        if (!client) return;
        client.emit('destroy', callback);
    };

    this.insert = function (id, attName, ignore, mimeType, obj, callback) {
        //return pipe for write into redis
        var strm = new WMStrm(id + '/' + attName);
        strm.on('finish', function () {
            that.writeFile(id, attName, memStore[id + '/' + attName], mimeType, function () {
                delete memStore[id + '/' + attName];
                if (callback) callback(null, null);
            });
        });
        return strm;
    };

    this.writeFile = function (id, name, data, mimeType, callback) {
        if (!client) return;
        client.emit('writeFile', id, name, data, mimeType, callback);
    };

    this.readFile = function (id, name, params, callback) {
        if (!client) return;
        client.emit('readFile', id, name, params, callback);
    };

    this.unlink = function (id, name, rev, callback) {
        if (!client) return;
        client.emit('unlink', id, name, rev, callback);
    };

    this.getObjectView = function (design, search, params, callback) {
        if (!client) return;
        client.emit('getObjectView', design, search, params, callback);
    };

    this.getObjectList = function (params, callback) {
        if (!client) return;
        client.emit('getObjectList', params, callback);
    };

    this.extendObject = function (id, obj, callback) {
        if (!client) return;
        client.emit('extendObject', id, obj, callback);
    };

    this.setObject = function (id, obj, callback) {
        if (!client) return;
        client.emit('setObject', id, obj, callback);
    };

    this.delObject = function (id, callback) {
        if (!client) return;
        client.emit('delObject', id, callback);
    };

    this.getObject = function (id, callback) {
        if (!client) return;
        client.emit('getObject', id, callback);
    };
}

module.exports = ObjectsInMemClient;