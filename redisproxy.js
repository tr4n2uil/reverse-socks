var redis = require('redis');

var redisHost = process.argv[2];
var redisPort = process.argv[3];
var redisAuth = "" //process.argv[4] || "";

var sockets = {}
var socketRef = 0

var redisSub = redis.createClient(redisPort, redisHost, {auth_pass: redisAuth});
var redisPub = redis.createClient(redisPort, redisHost, {auth_pass: redisAuth});

var eventHandlers = {}
var controlChannel = "CONTROL"

eventHandlers[controlChannel] = function(message){
  var data = JSON.parse(message)
  var socket = sockets[data.channel]

  switch(data.event){
    case 'error':
      if(socket) socket.emit('error', new Error(data.message))
      break;

    case 'end':
      if(socket) socket.end()
      delete sockets[data.channel]
      delete eventHandlers[data.channel]
      break;
  }
}

redisSub.on('message', function(channel, message){
  if(typeof eventHandlers[channel] != "undefined")
    eventHandlers[channel](message)
})

var redisPipe = function(socket){
  var channel = socket.socketRef;
  eventHandlers[channel] = function(message){
    socket.write(message)
  }
  redisSub.subscribe(channel)

  socket.on('data', function(chunk){
    redisPub.publish(channel, chunk);
  })
  socket.on('error', function(error){
    redisPub.publish(controlChannel, JSON.stringify{event: 'error', channel: channel, message: error.toString()});
  })
  socket.on('end', function(error){
    redisPub.publish(controlChannel, JSON.stringify{event: 'end', channel: channel});
    delete sockets[channel]
    delete eventHandlers[channel]
  })
}

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
