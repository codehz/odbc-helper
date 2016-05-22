const ODBC = require('odbc');

const checkProperty = (property, ch = '$') => typeof property === 'string' && property.startsWith(ch);
const callback2promise = (func, ...args) =>
    new Promise((resolve, reject) => func(...args, (err, ret) => err ? reject(err) : resolve(ret)));
const genConstruct = construct => new Proxy(function () {}, {
    construct
});
const log = (...content) => (DB.debug && console.log(...content), content.pop());
const fakeFunction = mix => (func => (Object.keys(mix).forEach(key => func[key] = mix[key]), func))(function () {});
const mapParams = (maps, txt) => (maps.splice(0),
    txt.replace(/\$\w+/gi, match => ((maps.includes(match) || maps.push(match)), '?')));
const unmapParams = (maps, value) => (arr =>
    (Object.keys(value).forEach(v =>
        arr[maps.indexOf(v)] = value[v]), arr))([]);
const directMapParams = (map, txt) => txt.replace(/\$\w+/gi, match => map[match]);

const DBMethods = (db, table) => ({
    create: genConstruct(() => {
        const PRIMARY = keys => keys ? [
            ['PRIMARY KEY', `(${keys.join(', ')})`].join(' ')
        ] : [];
        const generator = target => [
                ...target.map(item => [
                        item.name,
                        item.type,
                        ...(item.conf.unique ? ['UNIQUE'] : []),
                        ...(item.conf.notnull ? ['NOT NULL'] : []),
                        ...(item.conf.default ? ['DEFAULT', item.conf.default] : []),
                    ]
                    .join(' ')),
                ...PRIMARY(target.filter(item => item.conf.primary).map(item => item.name)),
                ...target.filter(item => item.conf.foreign)
                .map(({
                    name: src,
                    conf: {
                        foreign: {
                            target,
                            key = src
                        }
                    }
                }) => `FOREIGN KEY(${src}) REFERENCES ${target}(${key}) ON DELETE CASCADE`)
            ]
            .join(', ');
        const self = new Proxy(fakeFunction({
            content: [],
            maps: []
        }), {
            get: (target, property) => checkProperty(property) ?
                (name =>
                    (type = '', conf = {}) => (target.content.push({
                        name,
                        type,
                        conf
                    }), self))(property.substr(1)) : property === 'raw' ?
                mapParams(target.maps, [
                    'CREATE TABLE IF NOT EXISTS',
                    table,
                    `(${generator(target.content)})`
                ].join(' ')) : target[property],
            apply: (target, ctx, [value = {}]) => (stmt =>
                    callback2promise(stmt.execute.bind(stmt), unmapParams(target.maps, value)))
                (target.stmt || (target.stmt = db.prepareSync(log('create', mapParams(target.maps, self.raw))))),
        });
        return self;
    }),
    insert: genConstruct(() => {
        const self = new Proxy(fakeFunction({
            keys: [],
            maps: [],
            stmt: null
        }), {
            get: (target, property) => checkProperty(property) ?
                (target.keys.push(property.substr(1)), self) : property === 'raw' ? [
                    'INSERT INTO',
                    table,
                    `(${target.keys.join(', ')})`,
                    'VALUES',
                    `(${target.keys.map(key => '$' + key).join(', ')})`
                ].join(' ') : target[property],
            apply: (target, ctx, [value = {}]) => (stmt =>
                    callback2promise(stmt.execute.bind(stmt), unmapParams(target.maps, value)))
                (target.stmt || (target.stmt = db.prepareSync(log('create', mapParams(target.maps, self.raw))))),
        });
        return log(self);
    }),
    select: genConstruct(() => {
        const resultHelper = prm => new Promise((resolve, reject) => prm.then(src => resolve(new Proxy(src, {
            get: (target, property) => property === 'data' ? new Promise((rv, rj) =>
                target.data ? rv(target.data) :
                target.fetchAll((err, data) => (target.closeSync(), err ? rj(err) : rv(data)))) : target[property]
        }))).catch(reject));
        const self = new Proxy(fakeFunction({
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
                }), self) : property === 'raw' ? ['SELECT',
                    target.keys.join(', '),
                    'FROM',
                    table,
                    ...(target.wheres.length > 0 ? ['WHERE', target.wheres.join(' AND ')] : []),
                    ...(target.orders.length > 0 ? ['ORDER BY', target.orders.map(({
                        by, asc
                    }) => `${by} ${asc}`).join(', ')] : []),
                    ...(target.limit.offset ? ['LIMIT', `${target.limit.offset}, ${target.limit.rows}`] : [])
                ]
                .join(' ') : target[property],
            apply: (target, ctx, [value = {}]) => (stmt =>
                    resultHelper(callback2promise(stmt.execute.bind(stmt), unmapParams(target.maps, value))))
                (target.stmt || (target.stmt = db.prepareSync(log('create', mapParams(target.maps, self.raw))))),
        });
        return self;
    }),
    update: genConstruct(() => {
        const generator = keys => keys.map(key => `${key} = \$${key}`).join(', ');
        const self = new Proxy(fakeFunction({
            keys: [],
            wheres: [],
            maps: [],
            stmt: null
        }), {
            get: (target, property) => checkProperty(property) ?
                (target.keys.push(property.substr(1)), self) : property === 'where' ?
                cond => (target.wheres.push(cond), self) : property === 'raw' ? [`UPDATE ${table} SET ${generator(target.keys, target.maps)}`]
                .concat(target.wheres.length > 0 ? `WHERE ` + target.wheres.join(' AND ') : [])
                .join(' ') : target[property],
            apply: (target, ctx, [value = {}]) => (stmt =>
                    callback2promise(stmt.execute.bind(stmt), unmapParams(target.maps, value)))
                (target.stmt || (target.stmt = db.prepareSync(log('create', mapParams(target.maps, self.raw))))),
        });
        return self;
    }),
    delete: genConstruct(() => {
        const self = new Proxy(fakeFunction({
            stmt: null,
            wheres: [],
            maps: [],
        }), {
            get: (target, property) => property === 'where' ?
                cond => (target.wheres.push(cond), self) : property === 'raw' ? [`DELETE FROM ${table}`]
                .concat(target.wheres.length > 0 ? `WHERE ${target.wheres.join(' AND ')}` : [])
                .join(' ') : target[property],
            apply: (target, ctx, [value = {}]) => (stmt =>
                    callback2promise(stmt.execute.bind(stmt), unmapParams(target.maps, value)))
                (target.stmt || (target.stmt = db.prepareSync(log('create', mapParams(target.maps, self.raw))))),
        });
        return self;
    })
});

const others = {
    raw: db => (text) => new Proxy(fakeFunction({
        data: text,
        stmt: null,
        maps: []
    }), {
        get: (target, property) => property === 'raw' ?
            text : target[property],
        apply: (target, ctx, [value = {}]) => (stmt =>
                callback2promise(stmt.execute.bind(stmt), unmapParams(target.maps, value)))
            (target.stmt || (target.stmt = db.prepareSync(log('create', mapParams(target.maps, text))))),
    }),
    trigger: db => new Proxy(db, {
        get: (clazz, trigger_name) => checkProperty(trigger_name) ? genConstruct(() => {
            const self = new Proxy(fakeFunction({
                after: true,
                event: '',
                on: '',
                ops: [],
                maps: []
            }), {
                get: (obj, property) => property === 'before' ?
                    ((obj.after = false), event => ((obj.event = event), self)) : property === 'after' ?
                    ((obj.after = true), event => ((obj.event = event), self)) : property === 'on' ?
                    (on => ((obj.on = on), self)) : property === 'do' ?
                    ((op, args) => (obj.ops.push((args ? directMapParams(args, op.raw) : op.raw) + ';'), self)) : property === 'raw' ? [
                        'CREATE TRIGGER IF NOT EXISTS',
                        trigger_name.substr(1),
                        obj.after ? 'AFTER' : 'BEFORE',
                        obj.event,
                        'ON',
                        obj.on,
                        'FOR EACH ROW BEGIN',
                        ...obj.ops,
                        'END'
                    ].join(' ') : obj[property],
                apply: (target, ctx, [value = {}]) => (stmt =>
                        callback2promise(stmt.execute.bind(stmt), unmapParams(target.maps, value)))
                    (target.stmt || (target.stmt = db.prepareSync(log('create', mapParams(target.maps, self.raw))))),
            });
            return self;
        }) : clazz[trigger_name],
        deleteProperty: (target, property) => checkProperty(property) ?
            (others.raw(db)(`DROP TRIGGER IF EXISTS ${property.substr(1)}`)(), true) : false
    })
};

function setup(db) {
    return new Proxy(db, {
        get: (target, property) => checkProperty(property, '$') ?
            DBMethods(target, property.substr(1)) : checkProperty(property, '_') ?
            others[property.substr(1)](db) : target[property],
        deleteProperty: (target, property) => checkProperty(property) ?
            (others.raw(db)(`DROP TABLE IF EXISTS ${property.substr(1)}`)(), true) : false
    });
}

function DB(cn) {
    return new Promise((resolve, reject) => ODBC.open(cn, (err, db) => err ? reject(err) : resolve(setup(db))));
}

DB.debug = false;

module.exports = DB;