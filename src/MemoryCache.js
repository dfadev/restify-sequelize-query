class MemoryCache {
	constructor() { }

	configure(ttl, updateTtlOnAccess) {
		this.cache = {};
		this.ttl = ttl | 1000; // milliseconds
		this.updateTtlOnAccess = updateTtlOnAccess;
	}

	set(shard, key, value) {
		return new Promise((resolve, reject) => {
			var entries = this.cache[shard];
			if (entries == undefined) {
				entries = this.cache[shard] = {};
			}
			entries[key] = { val: value, last: Date.now() };
			resolve(value);
		});
	}

	get(shard, key) {
		return new Promise((resolve, reject) => {
			var entries = this.cache[shard];
			if (entries == undefined) return resolve(undefined);
			var entry = entries[key];
			if (entry == undefined) return resolve(undefined);
			var now = Date.now();
			var diff = now - entry.last;
			if (diff > this.ttl) {
				delete entries[key];
				return resolve(undefined);
			}
			if (this.updateTtlOnAccess)
				entry.last = now;
			return resolve(entry.val);
		});
	}

	clear(shard) {
		return new Promise((resolve, reject) => {
			delete this.cache[shard];
			resolve();
		});
	}
}

let cache = new MemoryCache();
export default cache;
