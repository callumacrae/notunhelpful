var fs = require('fs'),
	net = require('net'),
	config, i, socket, users;

config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
users = {};

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
			var i, info, mode, msg, op;

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
							if (info[5] && !isOp(info[5][1], info[5][2] && (op || !isVoice(info[5][1], info[5][2])))) {
								config[(op) ? 'ops' : 'voice'].push([info[5][1], info[5][2]]);
								socket.write('MODE ' + info[3] + (op ? ' +o ' : ' +v ') + info[5][1] + '\n', 'ascii');

								flushConfig(function () {
									socket.write('PRIVMSG ' + info[3] + ' :Successfully added ' + info[5][1] + ', and flushed configuration.\n', 'ascii');
								});
							}
						}
						break;

					case '+bot':
						if (isOwner(info[1], info[2]) && info[5]) {
							info[5] = /^([^ ]+)![^ ]+@([^ ]+)$/.exec(info[5]);
							if (info[5] && !isBot(info[5][1], info[5][2])) {
								config['bots'].push(info[5][1], info[5][2]);
								socket.write('MODE ' + info[3] + ' +o ' + info[5][1] + '\n', 'ascii');

								flushConfig(function () {
									socket.write('PRIVMSG ' + info[3] + ' :Successfully added ' + info[5][1] + ', and flushed configuration.\n', 'ascii');
								});
							}
						}
						break;

					case 'whoami':
						var msg = 'PRIVMSG ' + info[3] + ' :You are ' + info[0].split(' ')[0] + '.';
						if (isOwner(info[1], info[2])) {
							msg += ' You are owner.';
						} else if (isOp(info[1], info[2])) {
							msg += ' You are op.';
						} else if (isVoice(info[1], info[2])) {
							msg += ' You are voiced.';
						}
						socket.write(msg + '\n', 'ascii');
						break;
				}
			} else if (info = /^:([^ ]+)![^ ]+@([^ ]+) JOIN :?([^ ]+)$/.exec(data)) {
				users[info[1].toLowerCase()] = info[2];
				if (isOp(info[1], info[2]) || isBot(info[1], info[2])) {
					socket.write('MODE ' + info[3] + ' +o ' + info[1] + '\n', 'ascii');
				} else if (isVoice(info[1], info[2])) {
					socket.write('MODE ' + info[3] + ' +v ' + info[1] + '\n', 'ascii');
				}
			} else if (info = /^:([^ ]+)![^ ]+@([^ ]+) NICK ([^ ]+)$/.exec(data)) {
				if (users[info[1].toLowerCase()]) {
					delete users[info[1].toLowerCase()];
				}
				users[info[3].toLowerCase()] = info[2];
			} else if (info = /^:([^ ]+)![^ ]+@([^ ]+) KICK ([^ ]+) ([^ ]+) :/.exec(data)) {
				if (info[4] === config.nick) {
					socket.write('JOIN ' + info[3] + '\n', 'ascii');
				} else if (!isBotOrOwner(info[1], info[2]) && isBotOrOwner(info[4])) {
					socket.write('MODE ' + info[3] + ' -o ' + info[1] + '\n', 'ascii');
					for (i = 0; i < config.ops.length; i++) {
						if (config.ops[i][0] === info[1]) {
							op = config.ops[i];
							config.ops.splice(i, 1);
						}
					}
					setTimeout(function () {
						socket.write('KICK ' + info[3] + ' ' + info[1] + ' :lol\n', 'ascii');
					}, 5000);
					if (typeof op === 'object') {
						setTimeout(function () {
							config.ops.push(op);
						}, 300000);
					}
				}
			} else if (info = /^:([^ ]+)![^ ]+@([^ ]+) MODE ([^ ]+) (?:\+[a-z]+)?\-[a-z]*o[a-z]*(?:\+[a-z]+)? ([^ ]+)$/.exec(data)) {
				if (isBotOrOwner(info[4])) {
					if (isOwner(info[4]) && info[1] !== info[4]) {
						socket.write('MODE ' + info[3] + ' +o ' + info[4] + '\n', 'ascii');
					}

					if (!isBotOrOwner(info[1], info[2])) {
						socket.write('MODE ' + info[3] + ' +b *!*@' + info[2] + '\n', 'ascii');
						setTimeout(function () {
							socket.write('KICK ' + info[3] + ' ' + info[1] + ' :Don\'t do that\n', 'ascii');
						}, 1000);
					}
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
	if (typeof host === 'undefined' && users[nick.toLowerCase()]) {
		host = users[nick.toLowerCase()];
	} else if (typeof host === 'undefined') {
		return false;
	}

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
	if (typeof host === 'undefined' && users[nick.toLowerCase()]) {
		host = users[nick.toLowerCase()];
	} else if (typeof host === 'undefined') {
		return false;
	}

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
	if (typeof host === 'undefined' && users[nick.toLowerCase()]) {
		host = users[nick.toLowerCase()];
	} else if (typeof host === 'undefined') {
		return false;
	}

	for (var i = 0; i < config.voice.length; i++) {
		if (config.voice[i][0] === nick && config.voice[i][1] === host) {
			return true;
		}
	}

	return isOp(nick, host);
}

/**
 * Returns true if user is another bot.
 *
 * @param string nick The nick of the user.
 * @param string host The vhost of the user.
 */
function isBot(nick, host) {
	if (typeof host === 'undefined' && users[nick.toLowerCase()]) {
		host = users[nick.toLowerCase()];
	} else if (typeof host === 'undefined') {
		return false;
	}

	for (var i = 0; i < config.voice.length; i++) {
		if (config.bots[i][0] === nick && config.bots[i][1] === host) {
			return true;
		}
	}

	return false;
}

/**
 * Returns true if user is either a bot or an owner.
 *
 * @param string nick The nick of the user.
 * @param string host The vhost of the user.
 */
function isBotOrOwner(nick, host) {
	return isBot(nick, host) || isOwner(nick, host);
}

/**
 * Flushes the config back to config.json.
 */
function flushConfig(cb) {
	var conf = JSON.stringify(config);
	fs.writeFile('config.json', conf, cb);
}
