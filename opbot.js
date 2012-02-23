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
			var info, mode, op;

			// Debug:
			console.log(data);

			if (info = /^PING :(.+)$/.exec(data)) {
				socket.write('PONG :' + info[1] + '\n', 'ascii');
			} else if (info = /^:([^ ]+)![^ ]+@([^ ]+) PRIVMSG ([^ ]+) :!([^ ]+)(?: ([^ ]+))?$/.exec(data)) {
				switch (info[4].toLowerCase()) {
					case 'ping':
						socket.write('PRIVMSG ' + info[3] + ' :pong\n', 'ascii');
						break;

					case 'deop':
					case 'devoice':
					case 'op':
					case 'voice':
						if (isOp(info[1], info[2])) {
							mode = ({deop: '-o', op: '+o', devoice: '-v', voice: '+v'})[info[4].toLowerCase()];
							socket.write('MODE ' + info[3] + ' ' + mode + ' ' + (info[5] || info[1]) + '\n', 'ascii');
						}
						break;

					case '+op':
					case '+voice':
						if (isOwner(info[1], info[2]) && info[5]) {
							info[5] = /^([^ ]+)![^ ]+@([^ ]+)$/.exec(info[5]);
							op = info[4].toLowerCase() === '+op';
							if (info[5] && ((op && !isOp(info[5][1], info[5][2])) || (!op && !isVoice(info[5][1], info[5][2])))) {
								config[(op) ? 'ops' : 'voice'].push([info[5][1], info[5][2]]);
								socket.write('MODE ' + info[3] + (op ? ' +o ' : ' +v ') + info[5][1] + '\n', 'ascii');

								flushConfig(function () {
									socket.write('PRIVMSG ' + info[3] + ' :Successfully added ' + info[5][1] + ', and flushed configuration.');
								});
							}
						}
						break;
				}
			}
		})(data[i]);
	}
});


/**
 * Returns true if user is a bot op.
 *
 * @param string nick The nick of the user.
 * @param string host The vhost of the user.
 */
function isOp(nick, host) {
	for (var i = 0; i < config.ops.length; i++) {
		if (config.ops[i][0] === nick && config.ops[i][1] === host) {
			return true;
		}
	}

	return isOwner(nick, host);
}

/**
 * Returns true if user is a bot owner.
 *
 * @param string nick The nick of the user.
 * @param string host The vhost of the user.
 */
function isOwner(nick, host) {
	for (var i = 0; i < config.owners.length; i++) {
		if (config.owners[i][0] === nick && config.owners[i][1] === host) {
			return true;
		}
	}

	return false;
}

/**
 * Returns true if user is a bot voicee.
 *
 * @param string nick The nick of the user.
 * @param string host The vhost of the user.
 */
function isVoice(nick, host) {
	for (var i = 0; i < config.voice.length; i++) {
		if (config.voice[i][0] === nick && config.voice[i][1] === host) {
			return true;
		}
	}

	return isOp(nick, host);
}

/**
 * Flushes the config back to config.json.
 */
function flushConfig(cb) {
	var conf = JSON.stringify(config);
	fs.writeFileSync('config.json', conf, 'ascii', cb);
}
