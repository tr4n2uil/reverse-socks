var argyle = require('argyle');

var server = argyle(5050, '127.0.0.1', true);
server.on('connected', function(req, dest) {
    req.pipe(dest);
    dest.pipe(req);
});

