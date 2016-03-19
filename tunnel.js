var reverse = require('./reverse'),
  constants = require('./constants'),
  WebSocketServer = require('ws').Server;

var server = reverse.Server(5050, '0.0.0.0', true);
server.on('connected', function(req, dest) {
  req.pipe(dest);
  dest.pipe(req);
});

var wss = new WebSocketServer({ port: 5051 });
wss.on('connection', function connection(ws) {
  console.log("New connection", ws._socket._handle.fd);

  ws.on('message', function incoming(buffer, flags) {
    console.log('received', buffer);

    var firstByte = buffer[0];
    console.log("Handshake", buffer)
    if(firstByte == constants.CODE.register){
      var id = buffer[1];

      var rClient = constants.REGISTRY[id] || new reverse.Client(id, true);
      rClient.add(ws);
      ws.on('error', function(){
        rClient.remove(ws);
      });
      ws.on('close', function(){
        rClient.remove(ws);
      });
      constants.REGISTRY[id] = rClient;
    }
    else if(firstByte == constants.CODE.accept){
      var id = buffer[1];
      var rClient = constants.REGISTRY[id];
      if(!rClient) return;

      ws._socket.removeAllListeners('data');
      ws._socket.removeAllListeners('error');
      ws._socket.removeAllListeners('close');
      ws._socket.removeAllListeners('end');
      ws._ultron.on = function(){}
      console.log("Got accept", id);
      rClient.serve(ws._socket);
    }
  });

  ws.on('error', function(err){
    console.log("Error on connection", err);
  });

  ws.on('close', function(){
    console.log("Closing connection");
  });
});

console.log("ws server started");
