var reverse = require('./reverse'),
  net = require('net'),
  constants = require('./constants'),
  WebSocket = require('ws');

var remote = {host: '127.0.0.1', port: 5051, tcp: false}
var local = {host: '127.0.0.1', port: 5060}

var server = reverse.Server(local.port, local.host, remote, true);
server.on('connected', function(req, dest) {
  req.pipe(dest);
  dest.pipe(req);
});

if(remote.tcp){
  var tunnel = net.createConnection(remote.port, remote.host, function() {
    console.log("Connected to tunnel", remote);
    tunnel.write(new Buffer([0x01, constants.CODE.accept]))
    var buff = null;
    tunnel.on('data', function(buffer){
      console.log("Data", buffer);
      var i=0;
      if(buff && buffer.length > 0){
        reverse.forwardLocal(new Buffer([buff, buffer[0]]), tunnel, remote, server);
        i++;
        buff = null;
      } 
      for(; i+1<buffer.length; i+=2){
        reverse.forwardLocal(new Buffer([buffer[i], buffer[i+1]]), tunnel, remote, server);  
      }
      if(i+1 != buffer.length) buff = buffer[i];
    })
  }).once('error', function(err) {
    console.log("Error: ", err)
  }).once('close', function() {
    console.log("Exiting");
    process.exit(0)
  })
}
else {
  var forwardLocalWS = function(buffer, remote, server){
    var id = buffer[1];

    console.log("requestCode", buffer)
    var connected = false;

    var ws = new WebSocket('ws://' + remote.host + ":" + remote.port);

    ws.on('open', function(){
      ws._socket.removeAllListeners('data')
      ws._socket.removeAllListeners('error');
      ws._socket.removeAllListeners('close');
      ws._socket.removeAllListeners('end');
      ws._ultron.on = function(){}
      server.handleConnection(ws._socket)
      ws.send(new Buffer([0x03, id]), {binary: true})
    })

    ws.once('error', function(err) {
      console.log("Error: ", err)
    })

    ws.on('data', function(buffer, flags){
      console.log("Got data", buffer)
    })
  }

  var ws = new WebSocket('ws://' + remote.host + ":" + remote.port);
  ws.on('open', function open() {
    console.log("Connected to tunnel", remote);
    ws.send(new Buffer([0x01, constants.CODE.accept]), {binary: true})
  });

  var buff = null;
  ws.on('message', function incoming(buffer, flags){
    console.log("Data in", buffer);
    var i=0;
    if(buff && buffer.length > 0){
      forwardLocalWS(new Buffer([buff, buffer[0]]), remote, server);
      i++;
      buff = null;
    } 
    for(; i+1<buffer.length; i+=2){
      forwardLocalWS(new Buffer([buffer[i], buffer[i+1]]), remote, server);  
    }
    if(i+1 != buffer.length) buff = buffer[i];
  })

  ws.once('error', function(err) {
    console.log("Error: ", err)
  })

  ws.once('close', function() {
    console.log("Exiting");
    process.exit(0)
  })
}
