var reverse = require('./reverse'),
  net = require('net');

var remote = {host: '127.0.0.1', port: 5050}
var local = {host: '127.0.0.1', port: 5060}

var server = reverse(local.port, local.host, remote, true);
server.on('connected', function(req, dest) {
  req.pipe(dest);
  dest.pipe(req);
});

var connected = false;

var forwardLocal = function(buffer){
  var sock = net.createConnection(local.port, local.host, function() {
    sock.write(buffer);
  })
}

var tunnel = net.createConnection(remote.port, remote.host, function() {
  console.log("Connected to tunnel", remote);
  tunnel.write(new Buffer([0x01, 0x03]))
  var buff = null;
  tunnel.on('data', function(buffer){
    console.log("Data", buffer);
    var i=0;
    if(buff && buffer.length > 0){
      forwardLocal(new Buffer([buff, buffer[0]]));
      i++;
      buff = null;
    } 
    for(; i+1<buffer.length; i+=2){
      forwardLocal(new Buffer([buffer[i], buffer[i+1]]));  
    }
    if(i+1 != buffer.length) buff = buffer[i];
  })
}).once('error', function(err) {
  console.log("Error: ", err)
}).once('close', function() {
  console.log("Exiting");
  process.exit(0)
})
