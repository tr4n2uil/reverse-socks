/*jshint laxcomma:true asi:true */
var net = require('net')
  , util = require('util')
  , EventEmitter = require('events').EventEmitter
  , constants = require('./constants')

var debugOut = console.log.bind(console)

module.exports.Server = function(port, host, remote, backlog, debug) {
  if(!port) port = 8080
  if(!host) host = '127.0.0.1'
  if(typeof remote === 'boolean') {
    debug = remote
    remote = undefined
    backlog = undefined
  }
  if(typeof backlog === 'boolean') {
    debug = backlog
    backlog = undefined
  }

  return new Reverse(port, host, remote, backlog, debug)
}

function Client(id, wss){
  var self = this

  this.id = id
  this.sockets = []
  this.index = 0
  this.requests = [];
  this.wss = wss;

  this.add = function(socket){
    self.sockets.push(socket)
  }

  this.next = function(){
    this.index++
    this.index = this.index % this.sockets.length;
    console.log("Next", this.index);
    return this.sockets[this.index];
  }

  this.request = function(callback){
    var sock = this.next();
    var data = new Buffer([constants.CODE.request, this.id])
    if(this.wss)
      sock.send(data, {binary: true})
    else
      sock.write(data)
    this.requests.push(callback)
  }

  this.serve = function(socket){
    var cb = this.requests.pop();
    if(cb) cb(socket);
  }

  this.remove = function(socket){
    self.sockets.splice(self.sockets.indexOf(socket), 0);
  }  
}

module.exports.Client = Client;

module.exports.forwardLocal = function(buffer, tunnel, remote, server){
  var id = buffer[1];

  console.log("requestCode", buffer)
  var connected = false;
  var dest = net.createConnection(remote.port, remote.host, function() {
    server.handleConnection(dest);
    dest.write(new Buffer([0x03, id]))
  }).once('error', function(err) {
    if(!connected) {
      //tunnel.end(new Buffer([0x05, 0x01]))
    }
  }).once('close', function() {
    if(!connected) {
      //tunnel.end()
    }
  })

  // var rClient = constants.REGISTRY[id] || new exports.Client(id);
  // rClient.add(client);
  // client.on('error', function(){
  //   rClient.remove(client);
  // });
  // contants.REGISTRY[id] = rClient;

  // var sock = net.createConnection(local.port, local.host, function() {
  //   sock.write(buffer);
  // })
}

function Reverse(port, host, remote, backlog, debug) {
  Reverse.super_.call(this)
  var self = this
  this.remote = remote;
  this.local = {host: host, port: port};

  if(!!debug) this._debug = debugOut
  else this._debug = function() {}

  this.serverSock = net.createServer()
  this.serverSock.on('listening', function() {
    var addr = self.serverSock.address()
    self._debug('reverse server listening on %s:%s', addr.address, addr.port)
  }).on('connection', function(client) {
    self.handleConnection(client)
  })

  if(backlog) {
    this.serverSock.listen(port, host, backlog)
  } else {
    this.serverSock.listen(port, host)
  }
}
util.inherits(Reverse, EventEmitter);

Reverse.prototype.handleConnection = function(client) {
  var curState = constants.STATES.handshake
    , handlers = {}
    , self = this

  function onClientData(chunk) {
    console.log("Chunk", chunk);
    handlers[curState](chunk)
  }

  client.on('end', function() {
  }).on('error', function(err) {
  }).on('data', onClientData)

  var buffer = null
  handlers[constants.STATES.handshake] = function(chunk) {
    buffer = expandAndCopy(buffer, chunk)
    if(buffer.length < 2) return

    var firstByte = buffer[0];
    console.log("Handshake", buffer)
    if(firstByte == constants.CODE.register){
      var id = buffer[1];

      var rClient = constants.REGISTRY[id] || new Client(id);
      rClient.add(client);
      client.on('error', function(){
        rClient.remove(client);
      });
      constants.REGISTRY[id] = rClient;
    }
    else if(firstByte == constants.CODE.request){
      // var id = buffer[1];

      // console.log("requestCode", buffer)
      // var connected = false;
      // var dest = net.createConnection(self.remote.port, self.remote.host, function() {
      //   dest.write(new Buffer([Reverse.acceptCode, id]))
      //   var newChunk = false;
      //   if(buffer.length > 2){
      //     var newChunk = buffer.slice(2)
      //     buffer = null
      //   }
      //   buffer = null
      //   dest.removeListener('data', onClientData);

      //   var local = net.createConnection(self.local.port, self.local.host, function() {
      //     console.log("Piping dest to local", newChunk)
      //     if(newChunk) local.emit('data', newChunk)
      //     dest.pipe(local);
      //     local.pipe(dest);
      //   })
      // }).once('error', function(err) {
      //   if(!connected) {
      //     client.end(new Buffer([0x05, 0x01]))
      //   }
      // }).once('close', function() {
      //   if(!connected) {
      //     client.end()
      //   }
      // })

      // var rClient = Reverse.registeredClients[id] || new Client(id);
      // rClient.add(client);
      // client.on('error', function(){
      //   rClient.remove(client);
      // });
      // Reverse.registeredClients[id] = rClient;
    }
    else if(firstByte == constants.CODE.accept){
      var id = buffer[1];
      var rClient = constants.REGISTRY[id];
      if(!rClient) return;

      client.removeListener('data', onClientData);
      console.log("Got accept", id);
      rClient.serve(client);
    }
    else if(firstByte != constants.socksVersion) {
      self._debug('unsupported client version: %d', constants.socksVersion)
      return client.end()
    }

    var nMethods = buffer[1];
    if(buffer.length < nMethods + 2) return;
    for(var i = 0; i < nMethods; i++) {
      // try to find the no-auth method type, and if found, choose it
      if(buffer[i+2] === 0) {
        if(!self.remote) client.write(new Buffer([0x05, 0x00]))
        curState++
        if(!self.remote && buffer.length > nMethods + 2) {
          var newChunk = buffer.slice(nMethods + 2)
          buffer = null
          handlers[constants.STATES.request](newChunk)
        }
        else if(self.remote) handlers[constants.STATES.request](buffer)
        buffer = null
        return
      }
    }

    self._debug('No supported auth methods found, disconnecting.')
    client.end(new Buffer([0x05, 0xff]))
  }

  var proxyBuffers = []
  handlers[constants.STATES.request] = function(chunk) {
    buffer = expandAndCopy(buffer, chunk);
    console.log("request", buffer);
    if(buffer.length < 4) return

    var socksVersion = buffer[0];
    if(socksVersion != constants.socksVersion) {
      self._debug('unsupported client version: %d', socksVersion)
      return client.end()
    }

    var cmd = buffer[1];
    if(cmd != 0x01) {
      self._debug('unsupported command: %d', cmd)
      return client.end(new Buffer([0x05, 0x01]))
    }

    if(self.remote){
      var addressType = buffer[3]
        , host
        , port
        , responseBuf
      console.log("addressType", buffer[3]);
      if(addressType == 0x01) { // ipv4
        if(buffer.length < 10) return // 4 for host + 2 for port
        host = util.format('%d.%d.%d.%d', buffer[4], buffer[5], buffer[6], buffer[7])
        port = buffer.readUInt16BE(8)
        responseBuf = new Buffer(10)
        buffer.copy(responseBuf, 0, 0, 10)
        buffer = buffer.slice(10)
      }
      else if(addressType == 0x03) { // dns
        if(buffer.length < 5) return // if no length present yet
        var addrLength = buffer[4]
        if(buffer.length < 5 + addrLength + 2) return // host + port
        host = buffer.toString('utf8', 5, 5+addrLength)
        port = buffer.readUInt16BE(5+addrLength)
        responseBuf = new Buffer(5 + addrLength + 2)
        buffer.copy(responseBuf, 0, 0, 5 + addrLength + 2)
        buffer = buffer.slice(5 + addrLength + 2)
      }
      else if(addressType == 0x04) { // ipv6
        if(buffer.length < 22) return // 16 for host + 2 for port
        host = buffer.slice(4, 20)
        port = buffer.readUInt16BE(20)
        responseBuf = new Buffer(22)
        buffer.copy(responseBuf, 0, 0, 22)
        buffer = buffer.slice(22);
      }
      else {
        self._debug('unsupported address type: %d', addressType)
        return client.end(new Buffer([0x05, 0x01]))
      }
    }
    else {

    }

    self._debug('Request to %s:%s', host, port)
    curState++

    var connected = false
    var doneCallback = function(dest){
      console.log("doneCallback called", dest._handle.fd);
      client.removeListener('data', onClientData)

      client.resume()
      self.emit('connected', client, dest)
      connected = true
      console.log("Writing buffer", buffer);
      if(buffer && buffer.length) {
        client.emit('data', buffer)
        buffer = null
      }
      console.log("Writing proxyBuffers", proxyBuffers);
      for(var j = 0; j < proxyBuffers.length; j++) { // re-emit any leftover data for proxy to handle
        client.emit('data', proxyBuffers[i])
      }
      proxyBuffers = []
    }

    if(self.remote){
      console.log("Connecting to ", host, port)
      var dest = net.createConnection(port, host, function() {
        responseBuf[1] = 0
        responseBuf[2] = 0
        console.log("response", responseBuf);
        client.write(responseBuf) // emit success to client
        
        doneCallback(dest);
      }).once('error', function(err) {
        if(!connected) {
          client.end(new Buffer([0x05, 0x01]))
        }
      }).once('close', function() {
        if(!connected) {
          client.end()
        }
      })
    }
    else {
      var rClient = constants.REGISTRY[constants.defaultID];
        if(!rClient) return;

      rClient.request(doneCallback)
    }
    client.pause()
  }

  handlers[constants.STATES.forwarding] = function (chunk) {
    proxyBuffers.push(chunk);
  }
}

function expandAndCopy(old, newer) {
  if(!old) return newer;
  var newBuf = new Buffer(old.length + newer.length);
  old.copy(newBuf);
  newer.copy(newBuf, old.length);

  return newBuf;
}

// vim: tabstop=2:shiftwidth=2:softtabstop=2:expandtab

