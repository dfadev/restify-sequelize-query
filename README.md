# restify-sequelize-query

Create REST APIs using Restify and Sequelize.

Example:
```js
var query = require('restify-sequelize-query').query;

server.get(
    { path: '/stuff/:id' },
    query({
        method: 'select',
        model: StuffModel,
        attributes: [ 'id', 'col1', 'col2' ],
        order: [ 'id' ],
        where: (params) => ({ id: params.id }),
        limit: 1,
        format: (results) => results.map(result => ({ column1: result.col1, column2: result.col2 }))
    })
);
```

## query(*options*):

### Returns:
A Restify middleware function.

### options
Specifies Sequelize query options.  Options are passed directly to the Sequelize method selected by `options.method`.
### options.method:
- `select`: Execute one `findAll` query
- `update`: Execute `update` calls based on `req.body` contents
- `upsert`: Execute `upsert` calls based on `req.body` contents
- `delete`: Execute `delete` calls based on `req.body` contents
- `exec`: Execute one raw SQL query
- `multiexec`: Execute raw SQL queries based on `req.body` contents

### options.model:
Specifies the Sequelize model to query.

### options.where:

A function with one parameter that returns either an object literal or a `Promise` that resolves to an object literal describing the where clause.  The parameter is either `req.params` or `req.body[idx]` depending on which query method is used.  This option is only supported for `select`, `update`, and `delete` query methods.

Use this to create custom where clauses based on either the request parameters or individual request body items.

### options.parse:

A function with `req.body` as it's parameter and returns either a `Promise` or undefined.  `req.body` is forced to be an `Array` if it isn't already.  The parse function should iterate and alter each body item if necessary.

Use this to alter the request body if necessary.

### options.format:

A function that receives an array of query results and must return either an array of formatted results or a `Promise` that resolves to the same.

Use this to format data results.  

### options.sql:

A SQL string used to specify the raw SQL to execute for `exec` and `multiexec` methods.

### options.sequelize:

Set this to the `sequelize` instance used to execute raw SQL queries when using the `exec` and `multiexec` query methods.

### options.replacements:
For `exec` queries:

This can be set to a function accepting `req` as it's parameter and returning a value or `Promise` that describes the parameter replacements to be made in the raw SQL.

For `multiexec` queries:

This can be set to a function accepting `req.body[idx]` as it's parameter and returning a value or `Promise` that describes the parameter replacements to be made in the raw SQL.

### options.bind:
For `exec` queries:

This can be set to a function accepting `req` as it's parameter and returning a value or `Promise` that describes the parameter binds to be made in the raw SQL.

For `multiexec` queries:

This can be set to a function accepting `req.body[idx]` as it's parameter and returning a value or `Promise` that describes the parameter binds to be made in the raw SQL.

### options.cache:

This can be set to a cache class that should have the following methods:

- *set(shard, key, value)*: Return a `Promise` that sets a cache value and resolves to that same value.
- *get(shard, key)*: Return a `Promise` that resolves either to the cache value specified by the key or `undefined`.
- *clear(shard)*: Return a `Promise` that removes all keys associated with the shard.

### options.invalidate:

This is an `Array` of either model names or model references used to invalidate cache entries.
