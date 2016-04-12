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
  REMOTE_DATA: 0x03,
  REMOTE_DRAIN: 0x04
}
exports.CODES = CODES;

var ERRORS = {
  HANDSHAKE: 0x00,
  PORT: 0x01
}
exports.ERRORS = ERRORS

var load = 4096;

var expandAndCopy = function(old, newer) {
  if(!old) return newer;
  var newBuf = new Buffer(old.length + newer.length);
  old.copy(newBuf);
  newer.copy(newBuf, old.length);

  return newBuf;
}
exports.expandAndCopy = expandAndCopy;

var writeData = function(chunk, dest, source) {
  if (dest.writable) {
    // var next = false
    // for(var i in buffers){
    //   if(buffers[i].length){
    //     var buf = buffers[i].shift()
    //     if(Array.isArray(buf)){
    //       dest.write(buf[0])
    //       dest.write(buf[1])
    //     }
    //     else 
    //       dest.write(buf)
    //     if(buffers[i].length) next = true
    //   }
    // }
    // if(next) setTimeout(ondata, 0)
    if (false === dest.write(chunk) && source.pause) {
      console.log("Pausing")
      //source.pause();
    }
  }
}
exports.writeData = writeData;

exports.readMultiPipe = function(source, dest, handshake){
  var curState = STATES.HANDSHAKE,
    curRef = 0,
    curSocket = null,
    curLength = 0,
    handlers = {},
    self = this,
    sockets = dest.sockets,
    socketRef = dest.socketRef,
    buffers = dest.buffers

  function onClientData(chunk) {
    console.log("Got other data", chunk.length)
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
    else {
      source.resume()
    }
  }

  handlers[STATES.STARTED] = function (chunk){
    var expectedLength = 5 - (buffer ? buffer.length : 0);
    var lastChunk = chunk.slice(expectedLength)
    buffer = expandAndCopy(buffer, chunk.slice(0, expectedLength))
    if(buffer.length < 5) return
    source.pause()

    curRef = buffer.readUInt32BE(1)
    //console.log("got curRef", curRef, buffer, lastChunk)
    if(typeof sockets[curRef] == "undefined" && dest.create){
      sockets[curRef] = dest.create(curRef);
      //buffers[curRef] = [];
    }
    curSocket = sockets[curRef];

    //console.log("checking event type", buffer[0])
    switch(buffer[0]){
      case CODES.REMOTE_END:
        console.log("[INFO] Read Socket: " + curRef + " End")
        if(curSocket) curSocket.end()
        delete sockets[curRef]
        //delete buffers[curRef]
        break

      case CODES.REMOTE_ERROR:
        console.log("[INFO] Read Socket: " + curRef + " Error")
        if(curSocket) curSocket.destroy()
        delete sockets[curRef]
        //delete buffers[curRef]
        break

      case CODES.REMOTE_DRAIN:
        console.log("[INFO] Read Socket: " + curRef + " Drain")
        if(curSocket) curSocket.resume()
        break

      case CODES.REMOTE_DATA:
        curState++
        break

      default:
        console.log("[WARN] Didnt match any :(")
    }

    buffer = null
    if(lastChunk && lastChunk.length > 0){
      onClientData(lastChunk)
    }
    else {
      source.resume()
    }
  }

  handlers[STATES.LENGTH] = function (chunk){
    var expectedLength = 2 - (buffer ? buffer.length : 0);
    var lastChunk = chunk.slice(expectedLength)
    buffer = expandAndCopy(buffer, chunk.slice(0, expectedLength))
    if(buffer.length < 2) return
    source.pause()

    curLength = buffer.readUInt16BE(0)
    curState++

    //console.log("got curLength", curLength, buffer, lastChunk)
    buffer = null
    if(lastChunk && lastChunk.length > 0){
      onClientData(lastChunk)
    }
    else {
      source.resume()
    }
  }

  handlers[STATES.DATA] = function (chunk){
    var expectedLength = curLength - (buffer ? buffer.length : 0);
    var lastChunk = chunk.slice(expectedLength)
    buffer = expandAndCopy(buffer, chunk.slice(0, expectedLength))
    //if(buffer.length < curLength) return source.resume()
    //console.log("[INFO] Read Socket: " + curRef + " Length: " + curLength + " Buffer " + buffer)
    //var newBuf = buffer.slice(0, curLength)
    //buffer.copy(newBuf, 0, 0, curLength)
    if(curSocket)
      writeData(buffer, curSocket, source)

    curLength = curLength - buffer.length
    if(curLength == 0) {
      curState = STATES.STARTED
      curSocket.emit('drain')
    }

    buffer = null
    if(lastChunk && lastChunk.length > 0){
      onClientData(lastChunk)
    }
    else {
      source.resume()
    }
  }
}

exports.writeMultiPipe = function(source, dest, destRef, sockets, buffers){
  source.on('end', function(){
    var buf = new Buffer(5);
    buf.writeUInt8(CODES.REMOTE_END, 0);
    buf.writeUInt32BE(destRef, 1);

    console.log("[INFO] Write Socket: " + destRef + " End")
    writeData(buf, dest, source)
    //buffers[destRef].push(buf);
    delete sockets[destRef]
    //delete buffers[destRef]
  })
  
  source.on('error', function(err){
    var buf = new Buffer(5);
    buf.writeUInt8(CODES.REMOTE_ERROR, 0);
    buf.writeUInt32BE(destRef, 1);

    console.log("[INFO] Write Socket: " + destRef + " Error :" + err)
    writeData(buf, dest, source)
    //buffers[destRef].push(buf);
    delete sockets[destRef]
    //delete buffers[destRef]
  })

  source.on('drain', function(err){
    var buf = new Buffer(5);
    buf.writeUInt8(CODES.REMOTE_DRAIN, 0);
    buf.writeUInt32BE(destRef, 1);

    console.log("[INFO] Write Socket: " + destRef + " Drain")
    writeData(buf, dest, source)
    //buffers[destRef].push(buf);
  })

  source.on('data', function(chunk){
    console.log("Got data", destRef, chunk.length)
    //dest.resume()
    var buf = new Buffer(7);
    buf.writeUInt8(CODES.REMOTE_DATA, 0);
    buf.writeUInt32BE(destRef, 1);
    buf.writeUInt16BE(chunk.length, 5);
    writeData(buf, dest, source)
    writeData(chunk, dest, source)
    source.pause()

    /*var j = chunk.length/2;

    var tmpChunk = chunk.slice(0,j);
    var buf = new Buffer(7);
    buf.writeUInt8(CODES.REMOTE_DATA, 0);
    buf.writeUInt32BE(destRef, 1);
    buf.writeUInt16BE(tmpChunk.length, 5);

    buffers[destRef].push([buf, tmpChunk]);

    tmpChunk = chunk.slice(j);
    var buf = new Buffer(7);
    buf.writeUInt8(CODES.REMOTE_DATA, 0);
    buf.writeUInt32BE(destRef, 1);
    buf.writeUInt16BE(tmpChunk.length, 5);
    //tmpChunk.copy(buf, 7)
    buffers[destRef].push([buf, tmpChunk])

    ondata(buf)*/
    //console.log("[INFO] Write Socket: " + destRef + " Length: " + chunk.length + " Buffer " + buf + chunk)
  })

  /*dest.on('drain', function() {
    //if (source.readable && source.resume) {
      console.log("Resuming")
      //source.resume();
    //}
  });*/
}
