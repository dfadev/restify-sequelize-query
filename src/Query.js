import * as errors from 'restify-errors';
import CircularJSON from 'circular-json';
import crypto from 'crypto';

export default function query(options) {
	var options = options || { method: "unknown" };
	if (options.method == "select") return select(options);
	if (options.method == "upsert") return upsert(options);
	if (options.method == "update") return update(options);
	if (options.method == "insert") return insert(options);
	if (options.method == "delete") return del(options);
	if (options.method == "exec") return exec(options);
	if (options.method == "multiexec") return multiexec(options);
	
	return function (req, res, next) {
		next(new errors.BadRequestError('invalid query method: ' + options.method));
	}
}

function makeKey(options) {
	var cacheObj = Object.assign({}, options);
	delete cacheObj.cache;

  return crypto.createHash('sha1').update(CircularJSON.stringify(cacheObj, jsonReplacer)).digest('hex');
};

function jsonReplacer(key, value) {
	return (value && (value.DAO || (value.sequelize && !value.sql))) ? value.name || '' : value;
}

function checkRequiredParams(req, required) {
	if (required) {
		let missing = [];
		for (let i = 0, len = required.length; i < len; i++) {
			let paramName = required[i];
			if (!req.params.hasOwnProperty(paramName)) missing.push(paramName);
		}
		if (missing.length > 0) {
			let e = new errors.MissingParameterError();
			e.body.message = missing;
			return e;
		}
	}
}

function checkBodyFormat(req) {
	if (req.contentType() !== 'application/json') 
		return new errors.BadRequestError("content-type must be application/json");
	if (req.body == undefined) 
		return new errors.MissingParameterError("no body");
	if (!Array.isArray(req.body)) 
		req.body = [ req.body ];
}

function checkRequiredBody(req, options) {
	if (options.required) {
		let err = {};
		for (let rowIdx = 0, len = req.body.length; rowIdx < len; rowIdx++) {
			let missing = [];

			for (let i = 0, len = options.required.length; i < len; i++) {
				var param = options.required[i];
				if (!req.body[rowIdx].hasOwnProperty(param)) missing.push(param);
			}

			if (missing.length > 0) {
				err[rowIdx] = missing;
			}
		}

		if (Object.keys(err).length > 0) {
			var e = new errors.MissingParameterError();
			e.body.message = { rows: err };
			return e;
		}
	}
}

function parseBody(parse, body) {
	return (parse == undefined || body == undefined) ? Promise.resolve() : Promise.resolve(parse(body));
}

function calcWhere(options, params) {
	return options.where == undefined ? Promise.resolve() : Promise.resolve(options.where(params));
}

function formatResults(format, data) {
	return format == undefined ? Promise.resolve(data) : Promise.resolve(format(data));
}

function formatBadRequestError(err) {
	let e = new errors.BadRequestError();
	if (err.errors) {
		e.body.message = err.errors.map(item => item.message);
	} else
		e.body.message = err;
	return e;
}

function invalidateCache(options) {
	if (options.cache == undefined) return Promise.resolve();
	if (options.invalidate == undefined) {
		if (options.model) return options.cache.clear(options.model.name);
		return Promise.resolve();
	}

	var promises = [];
	for (let i = 0, len = options.invalidate.length; i < len; i++) {
		var item = options.invalidate[i];
		if (typeof item === 'string' || item instanceof String) {
			promises.push(options.cache.clear(item));
		} else {
			promises.push(options.cache.clear(item.name));
		}
	}
	return Promise.all(promises);
}

function setCache(options, shard, key, rslt) {
	return options.cache ? options.cache.set(shard, key, rslt) : Promise.resolve(rslt);
}

function select(options) {
	return function (req, res, next) {
		// check for required fields
		var c = checkRequiredParams(req, options.required);
		if (c) return next(c);
		var qry = options;

		// calculate where clause
		return calcWhere(options, req.params).then(where => {
			if (where) qry = Object.assign({}, options, { where: where });

			// check cache
			var p = Promise.resolve();
			if (options.cache) {
				var shard = options.model.name;
				var key = makeKey(qry);
				p = options.cache.get(shard, key);
			}

			return p.then(cached => {
				if (cached != undefined) {
					res.send(cached);
					return next();
				} else {
					// execute select
					return options.model.findAll(qry)
					// format results
						.then(formatResults.bind(this, options.format))
					// update cache
						.then(setCache.bind(this, options, shard, key))
					// return result
						.then(rslt => {
							// send rslt
							res.send(rslt);
							return next();
						})
				};
			});
		}).catch(err => {
			console.log(err);
			next(formatBadRequestError(err));
		});
	}
}

function upsert(options) {
	return function (req, res, next) {
		// check body format
		var chk = checkBodyFormat(req);
		if (chk) return next(chk);

		// parse body
		return parseBody(options.parse, req.body).then(() => {
			// check for required fields
			var chk = checkRequiredBody(req, options);
			if (chk) return next(chk);

			return options.model.sequelize.transaction(t => {
				var results = [];
				var p = Promise.resolve();

				// iterate over body
				for (let rowIdx = 0, len = req.body.length; rowIdx < len; rowIdx++) {
					// execute upsert
					p = p.then(options.model.insertOrUpdate.bind(options.model, req.body[rowIdx], Object.assign({ transaction: t }, options)))
						.then(data => { results.push(data); })
						.catch(err => { throw { row: rowIdx, message: err.name, errors: err.errors, fields: err.fields }; }); 
				}

				// format results
				return p.then(formatResults.bind(this, options.format, results))
					.then(rslt => { results = rslt; })
					// invalidate cache
					.then(invalidateCache.bind(this, options))
					// return results
					.then(rslt => {
						// send rslt
						res.send(results);
						return next();
					});
			});
		}).catch(err => {
			console.log(err);
			return next(formatBadRequestError(err));
		});
	};
}

function insert(options) {
	return function (req, res, next) {
		// check body format
		var chk = checkBodyFormat(req);
		if (chk) return next(chk);

		// parse body
		return parseBody(options.parse, req.body).then(() => {
			// check for required fields
			var chk = checkRequiredBody(req, options);
			if (chk) return next(chk);

			return options.model.sequelize.transaction(t => {
				var results = [];
				var p = Promise.resolve();

				// iterate over body
				for (let rowIdx = 0, len = req.body.length; rowIdx < len; rowIdx++) {
					// execute insert
					p = p.then(options.model.create.bind(options.model, req.body[rowIdx], Object.assign({ transaction: t }, options)))
						.then(data => { results.push({ row: rowIdx, updated: data }); })
						.catch(err => { throw { row: rowIdx, message: err.name, errors: err.errors, fields: err.fields }; }); 
				}

				// format results
				return p.then(formatResults.bind(this, options.format))
					.then(rslt => { results = rslt; })
					// invalidate cache
					.then(invalidateCache.bind(this, options))
					// return results
					.then(rslt => {
						// send rslt
						res.send(results);
						return next();
					})
			});
		}).catch(err => next(formatBadRequestError(err)));
	};
}

function del(options) {
	return function (req, res, next) {
		// check body format
		var chk = checkBodyFormat(req);
		if (chk) return next(chk);

		// parse body
		return parseBody(options.parse, req.body).then(() => {
			// check for required fields
			var chk = checkRequiredBody(req, options);
			if (chk) return next(chk);

			return options.model.sequelize.transaction(t => {
				let results = [];
				var p = Promise.resolve();
				let qry = Object.assign({ transaction: t }, options);

				for (let rowIdx = 0, len = req.body.length; rowIdx < len; rowIdx++) {
					// calculate where clause
					p = p.then(calcWhere.bind(this, options, req.body[rowIdx]))
						.then(where => {
							// delete records
							return options.model.destroy(where ? Object.assign({}, qry, { where: where }) : qry);
						})
						.then(data => { results.push({ row: rowIdx, deleted: data }); })
						.catch(err => { throw { row: rowIdx, message: err.name, errors: err.errors, fields: err.fields }; });
				}

				// invalidate cache
				return p.then(invalidateCache.bind(this, options))
					.then(rslt => {
						// send result
						res.send(results);
						return next();
					});
			});
		}).catch(err => {
			console.log(err);
			return next(formatBadRequestError(err));
		});
	};
}

function update(options) {
	return function (req, res, next) {
		// check body format
		var chk = checkBodyFormat(req);
		if (chk) return next(chk);

		// parse body
		return parseBody(options.parse, req.body).then(() => {
			// check for required fields
			var chk = checkRequiredBody(req, options);
			if (chk) return next(chk);

			return options.model.sequelize.transaction(t => {
				var results = [];
				var p = Promise.resolve();
				let qry = Object.assign({ transaction: t }, options);

				// iterate over body
				for (let rowIdx = 0, len = req.body.length; rowIdx < len; rowIdx++) {
					// calculate where clause
					p = p.then(calcWhere.bind(this, options, req.body[rowIdx]))
						.then(where => {
							// execute update
							return options.model.update(req.body[rowIdx], where ? Object.assign({}, qry, { where: where }) : qry);
						})
						.then(data => { results.push({ row: rowIdx, updated: data[0] }); })
						.catch(err => { throw { row: rowIdx, message: err.name, errors: err.errors, fields: err.fields }; }); 
				}

				// invalidate cache
				return p.then(invalidateCache.bind(this, options))
					.then(rslt => {
						// send results
						res.send(results);
						return next();
					});
			});
		}).catch(err => {
			console.log(err);
			return next(formatBadRequestError(err));
		});
	};
}

function undefPromise() { return Promise.resolve(undefined); }

function exec(options) {
	return function (req, res, next) {
		var isGet = req.method == "GET";
		if (!isGet) {
			// check body format
			var chk = checkBodyFormat(req);
			if (chk) return next(chk);
		}

		// check for required fields
		var c = checkRequiredParams(req, options.required);
		if (c) return next(c);

		// parse body
		var pb = isGet ? Promise.resolve() : parseBody(options.parse, req.body);
		var qry = Object.assign({ replacements: undefPromise, bind: undefPromise }, options);

		// calculate replacements
		return pb.then(qry.replacements(req)).then(replacements => {
			qry = Object.assign(qry, { replacements: replacements });
		// calculate binds
		}).then(qry.bind(req)).then(bind => {
			qry = Object.assign(qry, { bind: bind });
		}).then(() => {
			// check cache
			var p = Promise.resolve();
			if (options.cache) {
				var shard = "raw";
				var key = makeKey(qry);
				p = options.cache.get(shard, key);
			}

			var finish = (data) => {
				// format results
				return formatResults(options.format, data)
					// update cache
					.then(setCache.bind(this, options, shard, key))
					// return result
					.then(rslt => {
						res.send(rslt);
						return next();
					});
			};

			return p.then((cached) => {
				if (cached != undefined) {
					res.send(cached);
					return next();
				} else {
					if (qry.transaction === true) {
						return qry.sequelize.transaction(t => {
							qry.transaction = t;
							// execute raw query
							return qry.sequelize.query(qry.sql, qry)
								.then(finish);
						});
					} else {
						// execute raw query
						return qry.sequelize.query(qry.sql, qry).then(formatResults.bind(this, options.format))
							.then(finish);
					}
				}
			});
		}).catch(err => next(formatBadRequestError(err)));
	};
}

function multiexec(options) {
	return function (req, res, next) {
		// check body format
		var chk = checkBodyFormat(req);
		if (chk) return next(chk);

		// parse body
		return parseBody(options.parse, req.body).then(() => {
			// check for required fields
			let chk = checkRequiredBody(req, options);
			if (chk) return next(chk);

			return options.sequelize.transaction(t => {
				// execute raw
				let results = [];
				let p = Promise.resolve();
				let baseQry = Object.assign({ replacements: undefPromise, bind: undefPromise }, options, { transaction: t });

				for (let rowIdx = 0, len = req.body.length; rowIdx < len; rowIdx++) {
					let qry = Object.assign({}, baseQry);
					let shard = "raw", key;

					// calculate replacements clause
					p = p.then(baseQry.replacements.bind(this, req.body[rowIdx]))
						.then(replacements => {
							if (replacements) 
								qry.replacements = replacements;
							else
								delete qry.replacements;
							
							// calculate binds
							return qry.bind(req.body[rowIdx]);
						})
						.then(bind => {
							if (bind) 
								qry.bind = bind;
							else
								delete qry.bind;

							// check cache
							key = makeKey(qry);
							return options.cache ? options.cache.get(shard, key) : undefined;
						})
						.then(cached => {
							if (cached) return cached;

							return qry.sequelize.query(qry.sql, qry)
								.then(formatResults.bind(this, options.format))
								.then(setCache.bind(this, options, shard, key));
						})
						.then(data => { results.push({ row: rowIdx, result: data }); })
						.catch(err => { console.log(err); throw { row: rowIdx, message: err.name, errors: err.errors, fields: err.fields }; }); 
				}

				// invalidate cache
				return p.then(invalidateCache.bind(this, options))
					.then(rslt => {
						// send results
						res.send(results);
						return next();
					});
			});
		}).catch(err => {
			console.log(err);
			return next(formatBadRequestError(err));
		});
	}
}


