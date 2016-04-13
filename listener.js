var net = require('net'),
    multipipe = require('./multipipe');

var listenerHost = process.argv[2];
var listenerPort = process.argv[3];

var STATES = { 
  HANDSHAKE: 0, 
  STARTED: 1,
  LENGTH: 2,
  DATA: 3,
  ENDED: 4
}

var CODES = {
  SUCCESS: 0x00,
  ERROR: 0xFF,
  REMOTE_END: 0x01,
  REMOTE_ERROR: 0x02,
  REMOTE_DATA: 0x03
}

var ERRORS = {
  HANDSHAKE: 0x00,
  PORT: 0x01
}

var remotes = {}
var listening = {}
var remoteIndex = {}
var dests = {}

var listener = net.createServer()

listener.on('listening', function() {
  var addr = listener.address()
  console.log('listener listening on %s:%s', addr.address, addr.port)
})

listener.on('connection', function(client) {
  var server = null

  function cleanup(){
    server.close();
  }

  client.on('end', cleanup)
  .on('error', cleanup)  

  multipipe.readMultiPipe(client, dests, function(buffer, chunk){
    buffer = multipipe.expandAndCopy(buffer, chunk)
    if(buffer.length < 4) return

    if(!(buffer[0] == 0x00 && buffer[1] == 0x00)){
      client.write(new Buffer([CODES.ERROR, ERRORS.HANDSHAKE]))
      return false
    }

    serverPort = buffer.readUInt16BE(2)
    buffer = buffer.slice(2)

    if(serverPort == listenerPort){
      client.write(new Buffer([CODES.ERROR, ERRORS.PORT]))
      return false
    }

    client.serverPort = serverPort
    dests[serverPort] = {sockets: {}, socketRef: 0, buffers: {}}
    if(typeof remotes[serverPort] == "undefined") {
      remotes[serverPort] = []
      server = net.createServer(),
      server.listen(serverPort, listenerHost)

      server.on('listening', function() {
        var addr = server.address()
        console.log('client server listening on %s:%s', addr.address, addr.port)
        //client.write(new Buffer([CODES.SUCCESS, 0x00]));
        listening[client.serverPort] = true
        for(var i in remotes[client.serverPort]){
          remotes[client.serverPort][i].write(new Buffer([CODES.SUCCESS, 0x00]));
        }
      })

      server.on('connection', function(remote) {
        var remoteRef = dests[serverPort].socketRef++;
        dests[serverPort].sockets[remoteRef] = remote;
        dests[serverPort].buffers[remoteRef] = [];

        remoteIndex[client.serverPort] = remoteIndex[client.serverPort] || 0
        remoteIndex[client.serverPort]++
        remoteIndex[client.serverPort] = remoteIndex[client.serverPort] % remotes[client.serverPort].length
        console.log("Using remote: ", remoteIndex[client.serverPort])
        multipipe.writeMultiPipe(remote, remotes[client.serverPort][remoteIndex[client.serverPort]], remoteRef, dests[serverPort].sockets, dests[serverPort].buffers)
      })
    }
    else if(listening[serverPort]) {
      client.write(new Buffer([CODES.SUCCESS, 0x00]));
    }

    remotes[serverPort].push(client)
    return true
  })
})

listener.listen(listenerPort, listenerHost)
