var fs = require('fs'),
	net = require('net'),
	config, i, socket;

config = JSON.parse(fs.readFileSync('config.json', 'utf8'));

// Handle connect; send creds and join channels
socket = new net.Socket();
socket.on('connect', function () {
	console.log('Connected, sending nick and shit...');
	setTimeout(function () {
		socket.write('NICK ' + config.nick + '\n', 'ascii');
		socket.write('USER ' + config.nick + ' 8 * :!unhelpful\n', 'ascii');
		setTimeout(function () {
			for (var i = 0; i < config.chans.length; i++) {
				socket.write('JOIN ' + config.chans[i] + '\n', 'ascii');
			}
		}, 5000);
	}, 1000); // Wait a second
});

/**
 * The disconnect code increases the wait time by five seconds every time it fails.
 * Once a minute, it goes down by five seconds. This means that if the bot has been
 * banned, or the connection has died, it won't try to reconnect once a second.
 */
i = 0;
socket.on('disconnect', function () {
	console.log('Disconnected, reconnectingÉ');
	setTimeout(function () {
		socket.connect(config.server.port, config.server.addr);
	}, i++ * 5000);
});
setInterval(function () {
	if (i > 0) {
		i--;
	}
}, 60000);

// Handle errors
socket.on('error', function (e) {
	console.error(e);
});

// Connect
socket.setEncoding('ascii');
socket.setNoDelay();
socket.connect(config.server.port, config.server.addr);

// Handle incoming data
socket.on('data', function (data) {
	data = data.split('\r\n');
	for (i = 0; i < data.length; i++) {
		data[i] && (function (data) {
			var info;

			// Debug:
			console.log(data);

			if (info = /^PING :(.+)$/.exec(data)) {
				socket.write('PONG :' + info[1] + '\n', 'ascii');
			} else if (info = /^:([^ ]+)![^ ]+@[^ ]+ PRIVMSG ([^ ]+) :!([^ ]+)(?: ([^ ]+))?$/.exec(data)) {
				switch (info[3].toLowerCase()) {
					case 'ping':
						socket.write('PRIVMSG ' + info[2] + ' :pong\n', 'ascii');
						break;

					case 'op':
						socket.write('MODE ' + info[2] + ' +o ' + info[1] + '\n', 'ascii');
						break;
				}
			}
		})(data[i]);
	}
});
