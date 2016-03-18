var reverse = require('./reverse');

var server = reverse.Server(5050, '0.0.0.0', true);
server.on('connected', function(req, dest) {
  req.pipe(dest);
  dest.pipe(req);
});
