var chai = require("chai");
var chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);
var expect = chai.expect;

var SequelizeMock = require('sequelize-mock');
var query = require('../lib').default;
var dbMock = new SequelizeMock();

var UserMock = dbMock.define('user', {
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'test@example.com'
});

UserMock.sequelize = dbMock;

afterEach(function () {
	dbMock.$clearQueue();
})

function isFunction(functionToCheck) {
 var getType = {};
 return functionToCheck && getType.toString.call(functionToCheck) === '[object Function]';
}

describe('query', function() {
	it('must return a function', function() {
		expect(isFunction(query())).to.equal(true);
		expect(isFunction(query({}))).to.equal(true);
	});
});

describe('select', function() {
	it('must return a record', function() {
		var func = query({
			method: 'select',
			model: UserMock
		});

		var tgt = { res: false, next: false };
		var req = { params: {} };
		var res = { send: function(msg) { tgt.res = msg[0].firstName; } };
		var next = function(msg) { tgt.next = msg; };

		return expect(func(req, res, next).then(() => tgt.res)).to.eventually.equal('Jane');
	});
});

describe('upsert', function() {
	it('must upsert a record', function() {
		var func = query({
			method: 'upsert',
			model: UserMock
		});

		var tgt = { res: false, next: false };
		var req = { 
			contentType: function() { return "application/json"; },
			body: { id: 1, firstName: 'John', lastName: 'Doe' } 
		};
		var res = { send: function(msg) { tgt.res = msg[0]; } };
		var next = function(msg) { tgt.next = msg; };

		return expect(func(req, res, next).then(() => tgt.res)).to.eventually.equal(true);
	});
});

describe('insert', function() {
	it('must insert a record', function() {
		var func = query({
			method: 'insert',
			model: UserMock
		});

		var tgt = { res: false, next: false };
		var req = { 
			contentType: function() { return "application/json"; },
			body: { firstName: 'John', lastName: 'Doe' } 
		};
		var res = { send: function(msg) { tgt.res = msg; } };
		var next = function(msg) { tgt.next = msg; };

		return expect(func(req, res, next).then(() => tgt.next)).to.eventually.equal(undefined);
	});
});

describe('delete', function() {
	it('must delete a record', function() {
		var func = query({
			method: 'delete',
			model: UserMock,
			where: params => ({ id: params.id })
		});

		var tgt = { res: false, next: false };
		var req = { 
			contentType: function() { return "application/json"; },
			body: { id: 2 }
		};
		var res = { send: function(msg) { tgt.res = msg; } };
		var next = function(msg) { tgt.next = msg; };

		return expect(func(req, res, next).then(() => tgt.res[0].deleted)).to.eventually.equal(1);
	});
});


describe('update', function() {
	it('must update a record', function() {
		var func = query({
			method: 'update',
			model: UserMock,
			where: params => ({ id: params.id })
		});

		var tgt = { res: false, next: false };
		var req = { 
			contentType: function() { return "application/json"; },
			body: { id: 0, firstName: 'Sam' }
		};
		var res = { send: function(msg) { tgt.res = msg; } };
		var next = function(msg) { tgt.next = msg; };

		return expect(func(req, res, next).then(() => tgt.res[0].updated)).to.eventually.equal(1);
	});
});

describe('exec', function() {
	it('must execute a query', function() {
		var func = query({
			method: 'exec',
			sequelize: dbMock,
			sql: 'select 1 as one'
		});

		var tgt = { res: false, next: false };
		var req = { 
			method: 'GET',
		};
		var res = { send: function(msg) { tgt.res = msg; } };
		var next = function(msg) { tgt.next = msg; };

		dbMock.$queueResult({ "one": 1 });

		return expect(func(req, res, next).then(() => tgt.res.one)).to.eventually.equal(1);
	});
});

describe('multiexec', function() {
	it('must execute queries', function() {
		var func = query({
			method: 'multiexec',
			sequelize: dbMock,
			sql: 'select 1 as one'
		});

		var tgt = { res: false, next: false };
		var req = { 
			method: 'POST',
			contentType: function() { return "application/json"; },
			body: [ [0], [1] ]
		};
		var res = { send: function(msg) { tgt.res = msg; } };
		var next = function(msg) { tgt.next = msg; };

		dbMock.$queueResult({ "one": 1 });
		dbMock.$queueResult({ "one": 2 });

		return expect(func(req, res, next).then(() => tgt.res)).to.eventually.have.length(2);
	});
});
