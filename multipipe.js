var STATES = { 
  HANDSHAKE: 0, 
  STARTED: 1,
  LENGTH: 2,
  DATA: 3,
  ENDED: 4
}
exports.STATES = STATES;

var CODES = {
  SUCCESS: 0x00,
  ERROR: 0xFF,
  REMOTE_END: 0x01,
  REMOTE_ERROR: 0x02,
  REMOTE_DATA: 0x03
}
exports.CODES = CODES;

var ERRORS = {
  HANDSHAKE: 0x00,
  PORT: 0x01
}
exports.ERRORS = ERRORS

var expandAndCopy = function(old, newer) {
  if(!old) return newer;
  var newBuf = new Buffer(old.length + newer.length);
  old.copy(newBuf);
  newer.copy(newBuf, old.length);

  return newBuf;
}
exports.expandAndCopy = expandAndCopy;

exports.readMultiPipe = function(source, dest, handshake){
  var curState = STATES.HANDSHAKE,
    curRef = 0,
    curSocket = null,
    curLength = 0,
    handlers = {},
    self = this,
    sockets = dest.sockets,
    socketRef = dest.socketRef

  function onClientData(chunk) {
    //console.log("Chunk", curState, chunk);
    handlers[curState](chunk)
  }

  source.on('data', onClientData)

  var buffer = null
  handlers[STATES.HANDSHAKE] = function (chunk){
    if(handshake(buffer, chunk, curState)) curState++
    if(buffer && buffer.length > 0){
      var newChunk = buffer
      buffer = null
      onClientData(newChunk)
    }
  }

  handlers[STATES.STARTED] = function (chunk){
    buffer = expandAndCopy(buffer, chunk)
    if(buffer.length < 5) return

    curRef = buffer.readUInt32BE(1)
    //console.log("got curRef", curRef)
    if(typeof sockets[curRef] == "undefined" && dest.create){
      sockets[curRef] = dest.create(curRef);
    }
    curSocket = sockets[curRef];

    //console.log("checking event type", buffer[0])
    switch(buffer[0]){
      case CODES.REMOTE_END:
        console.log("[INFO] Read Socket: " + curRef + " End")
        curSocket.end()
        break

      case CODES.REMOTE_ERROR:
        console.log("[INFO] Read Socket: " + curRef + " Error")
        curSocket.destroy()
        break

      case CODES.REMOTE_DATA:
        curState++
        break

      default:
        console.log("[WARN] Didnt match any :(")
    }

    buffer = buffer.slice(5)
    if(buffer.length > 0){
      var newChunk = buffer
      buffer = null
      onClientData(newChunk)
    }
  }

  handlers[STATES.LENGTH] = function (chunk){
    buffer = expandAndCopy(buffer, chunk)
    if(buffer.length < 4) return

    curLength = buffer.readUInt32BE(0)
    curState++

    //console.log("got curLength", curLength)
    buffer = buffer.slice(4)
    if(buffer.length > 0){
      var newChunk = buffer
      buffer = null
      onClientData(newChunk)
    }
  }

  handlers[STATES.DATA] = function (chunk){
    buffer = expandAndCopy(buffer, chunk)
    if(buffer.length < curLength) return

    console.log("[INFO] Read Socket: " + curRef + " Length: " + curLength + " Buffer " + buffer)

    curSocket.write(buffer)

    buffer = buffer.slice(curLength)
    curState = STATES.STARTED
    curLength = 0

    if(buffer.length > 0){
      var newChunk = buffer
      buffer = null
      onClientData(newChunk)
    }
  }
}

exports.writeMultiPipe = function(source, dest, destRef){
  function ondata(chunk) {
    if (dest.writable) {
      if (false === dest.write(chunk) && source.pause) {
        console.log("Pausing")
        source.pause();
      }
    }
  }

  source.on('end', function(){
    var buf = new Buffer(5);
    buf.writeUInt8(CODES.REMOTE_END, 0);
    buf.writeUInt32BE(destRef, 1);

    console.log("[INFO] Write Socket: " + destRef + " End")
    ondata(buf)
  })
  
  source.on('error', function(err){
    var buf = new Buffer(5);
    buf.writeUInt8(CODES.REMOTE_ERROR, 0);
    buf.writeUInt32BE(destRef, 1);

    console.log("[INFO] Write Socket: " + destRef + " Error :" + err)
    ondata(buf)
  })

  source.on('data', function(chunk){
    var buf = new Buffer(9 + chunk.length);
    buf.writeUInt8(CODES.REMOTE_DATA, 0);
    buf.writeUInt32BE(destRef, 1);
    buf.writeUInt32BE(chunk.length, 5);
    chunk.copy(buf, 9)

    console.log("[INFO] Write Socket: " + destRef + " Length: " + chunk.length + " Buffer " + buf)
    ondata(buf)
  })

  dest.on('drain', function() {
    if (source.readable && source.resume) {
      console.log("Resuming")
      source.resume();
    }
  });
}
