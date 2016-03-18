var reverse = require('./reverse'),
  net = require('net'),
  constants = require('./constants');

var remote = {host: '127.0.0.1', port: 5050}
var local = {host: '127.0.0.1', port: 5060}

var server = reverse.Server(local.port, local.host, remote, true);
server.on('connected', function(req, dest) {
  req.pipe(dest);
  dest.pipe(req);
});

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
