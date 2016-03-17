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

var tunnel = net.createConnection(remote.port, remote.host, function() {
  console.log("Connected to tunnel", remote);
  tunnel.write(new Buffer([0x01, 0x03]))
  tunnel.on('data', function(buffer){
    console.log("Data", buffer);
    var sock = net.createConnection(local.port, local.host, function() {
      sock.write(buffer);
    })
  })
}).once('error', function(err) {
  console.log("Error: ", err)
}).once('close', function() {
  console.log("Exiting");
  process.exit(0)
})
