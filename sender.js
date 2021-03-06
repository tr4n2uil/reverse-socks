var net = require('net'),
    multipipe = require('./multipipe');

var senderPort = process.argv[2];
var remotePort = process.argv[3];
var listenerHost = process.argv[4];
var listenerPort = process.argv[5];
var remoteNum = process.argv[6] || 1;

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

var dests = {}

var connectToListener = function(listenerPort, listenerHost){
  var remote = net.createConnection(listenerPort, listenerHost, function() {
    console.log("connected to remote ", listenerHost, listenerPort)

    var buf = new Buffer(4);
    buf.writeUInt8(CODES.SUCCESS, 0);
    buf.writeUInt8(CODES.SUCCESS, 1);
    buf.writeUInt16BE(remotePort, 2);

    remote.write(buf)

    var dest = {
      sockets: {},
      socketRef: 0,
      buffers: {},
      create: function(curRef){
        var client = net.createConnection(senderPort, "localhost", function(){
          console.log("new connection socket to sender", curRef, senderPort);
        })

        multipipe.writeMultiPipe(client, remote, curRef, dest.sockets, dest.buffers)
        client.on('drain', function() {
          if (remote.readable && remote.resume) {
            console.log("Resuming")
            remote.resume();
          }
        });
        return client
      }
    }

    remote.serverPort = senderPort;
    dests[remote.serverPort] = dest
    multipipe.readMultiPipe(remote, dests, function(buffer, chunk){
      buffer = multipipe.expandAndCopy(buffer, chunk)
      if(buffer.length < 2) return

      if(buffer[0] == 0x00 && buffer[1] == 0x00){
        console.log("remote handshake successful")
        return true
      }

      return false
    });
  });

  remote.on('error', function(err) {
    console.log("Error: ", err)
  })

  remote.on('close', function() {
    console.log("Exiting");
    process.exit(0)
  })
}

for(var i=0; i<remoteNum; i++){
  connectToListener(listenerPort, listenerHost)
}
