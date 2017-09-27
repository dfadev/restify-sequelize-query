'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});

var _redis = require('redis');

var _redis2 = _interopRequireDefault(_redis);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class RedisCache {
	constructor() {}

	configure(shards, ttl, redisOptions) {
		this.ttl = ttl | 10;
		this.clients = {};
		this.redisOptions = redisOptions || {
			retryStrategy: options => {
				return 2000;
			},
			enable_offline_queue: false
		};

		for (var shard in shards) {
			this.clients[shard] = _redis2.default.createClient(shards[shard], this.redisOptions);
		}
	}

	set(shard, key, value) {
		var obj = JSON.stringify(value);
		return new Promise((resolve, reject) => {
			this.clients[shard].setex(key, this.ttl, obj, function (err, rslt) {
				resolve(value);
			});
		});
	}

	get(shard, key) {
		return new Promise((resolve, reject) => {
			this.clients[shard].get(key, function (err, rslt) {
				if (err) {
					resolve(undefined);
				} else {
					var obj = JSON.parse(rslt);
					resolve(obj);
				}
			});
		});
	}

	clear(shard) {
		return new Promise((resolve, reject) => {
			this.clients[shard].flushdb(function (err, rslt) {
				if (err) reject(err);else resolve();
			});
		});
	}
}

let cache = new RedisCache();
exports.default = cache;