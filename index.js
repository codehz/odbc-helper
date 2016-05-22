const ODBC = require('odbc');

const checkProperty = property => typeof property === 'string' && property.startsWith('$');
const callback2promise = (func, ...args) =>
    new Promise((resolve, reject) => func(...args, (err, ret) => err ? reject(err) : resolve(ret)));
const genConstruct = construct => new Proxy(function () {}, {
    construct
});
const log = content => (DB.debug && console.log(content), content);
const mixFunction = mix => (func => (Object.keys(mix).forEach(key => func[key] = mix[key]), func))(function () {});
const mapParams = (maps, txt) => txt.replace(/\$\w+/gi, match => (maps.push(match), '?'));
const unmapParams = (maps, value) => (arr =>
    (Object.keys(value).forEach(v =>
        arr[maps.indexOf(v)] = value[v]), arr))([]);

const DBMethods = (db, table) => ({
    create: genConstruct(() => {
        const PRIMARY = keys => keys ? `PRIMARY KEY(${keys.join(', ')})` : '';
        const generator = target => target.map(item => [item.name, item.type]
                .concat(item.unique ? 'UNIQUE' : [])
                .concat(item.notnull ? 'NOT NULL' : [])
                .concat(item.default ? `DEFAULT ${item.default}` : [])
                .join(' '))
            .concat(PRIMARY(target.filter(item => item.conf.primary).map(item => item.name)))
            .concat(target.filter(item => item.conf.foreign)
                .map(({
                    name: src,
                    conf: {
                        foreign: {
                            target,
                            key = src
                        }
                    }
                }) => `FOREIGN KEY(${src}) REFERENCES ${target}(${key}) ON DELETE CASCADE`))
            .join(', ');
        const self = new Proxy(mixFunction({
            content: []
        }), {
            get: (target, property) => checkProperty(property) ?
                (name =>
                    (type = '', conf = {}) => (target.content.push({
                        name,
                        type,
                        conf
                    }), self))(property.substr(1)) : target[property],
            apply: target => (stmt => callback2promise(stmt.execute.bind(stmt)))
                (db.prepareSync(log(`CREATE TABLE IF NOT EXISTS ${table} (${generator(target.content)})`)))
        });
        return self;
    }),
    insert: genConstruct(() => {
        const self = new Proxy(mixFunction({
            keys: [],
            maps: [],
            stmt: null
        }), {
            get: (target, property) => checkProperty(property) ?
                (target.keys.push(property.substr(1)), self) : target[property],
            apply: (target, ctx, [value = {}]) => (stmt =>
                    callback2promise(stmt.execute.bind(stmt), unmapParams(target.maps, value)))
                (target.stmt || (target.stmt = db.prepareSync(log(mapParams(target.maps,
                    `INSERT INTO ${table} (${target.keys.join(', ')}) VALUES (${target.keys.map(key => '$' + key).join(', ')})`))))),
        });
        return log(self);
    }),
    select: genConstruct(() => {
        const resultHelper = prm => new Promise((resolve, reject) => prm.then(src => resolve(new Proxy(src, {
            get: (target, property) => property === 'data' ? new Promise((rv, rj) =>
                target.data ? rv(target.data) :
                target.fetchAll((err, data) => (target.closeSync(), err ? rj(err) : rv(data)))) : target[property]
        }))).catch(reject));
        const self = new Proxy(mixFunction({
            stmt: null,
            keys: [],
            maps: [],
            wheres: [],
            limit: [],
            orders: {}
        }), {
            get: (target, property) => checkProperty(property) ?
                (target.keys.push(property === '$' ? '*' : property.substr(1)), self) : property === 'limit' ?
                (offset, rows) => (target.limit = {
                    offset, rows
                }, self) : property === 'where' ?
                cond => (target.wheres.push(cond), self) : property === 'order' ?
                (by, asc = 'asc') => (target.orders.push({
                    by, asc
                }), self) : target[property],
            apply: (target, ctx, [value = {}]) => (stmt =>
                    resultHelper(callback2promise(stmt.execute.bind(stmt), unmapParams(target.maps, value))))
                (target.stmt || (target.stmt =
                    db.prepareSync(log(mapParams(target.maps, [`SELECT ${target.keys.join(', ')} FROM ${table}`]
                        .concat(target.wheres.length > 0 ? `WHERE ` + target.wheres.join(' AND ') : [])
                        .concat(target.orders.length > 0 ? `ORDER BY ` + target.orders.map(({
                            by, asc
                        }) => `${by} ${asc}`).join(', ') : [])
                        .concat(target.limit.offset ? `LIMIT ${target.limit.offset}, ${target.limit.rows}` : [])
                        .join(' '))))))
        });
        return self;
    }),
    update: genConstruct(() => {
        const generator = keys => keys.map(key => `${key} = \$${key}`).join(', ');
        const self = new Proxy(mixFunction({
            keys: [],
            wheres: [],
            maps: [],
            stmt: null
        }), {
            get: (target, property) => checkProperty(property) ?
                (target.keys.push(property.substr(1)), self) : property === 'where' ?
                cond => (target.wheres.push(cond), self) : target[property],
            apply: (target, ctx, [value = {}]) => (stmt =>
                    callback2promise(stmt.execute.bind(stmt), unmapParams(target.maps, value)))
                (target.stmt || (target.stmt =
                    db.prepareSync(log(mapParams(
                        target.maps, [`UPDATE ${table} SET ${generator(target.keys, target.maps)}`]
                        .concat(target.wheres.length > 0 ? `WHERE ` + target.wheres.join(' AND ') : [])
                        .join(' ')))))),
        });
        return self;
    }),
    delete: genConstruct(() => {
        const self = new Proxy(mixFunction({
            stmt: null,
            wheres: [],
            maps: [],
        }), {
            get: (target, property) => property === 'where' ?
                cond => (target.wheres.push(cond), self) : target[property],
            apply: (target, ctx, [value = {}]) => (stmt =>
                    callback2promise(stmt.execute.bind(stmt), unmapParams(target.maps, value)))
                (target.stmt || (target.stmt = db.prepareSync(log(mapParams(target.maps, [`DELETE FROM ${table}`]
                    .concat(target.wheres.length > 0 ? `WHERE ` + target.wheres.join(' AND ') : [])
                    .join(' '))))))
        });
        return self;
    })
});

function setup(db) {
    return new Proxy(db, {
        get: (target, property) => checkProperty(property) ? DBMethods(target, property.substr(1)) : target[property]
    });
}

function DB(cn) {
    return new Promise((resolve, reject) => ODBC.open(cn, (err, db) => err ? reject(err) : resolve(setup(db))));
}

DB.debug = false;

module.exports = DB;