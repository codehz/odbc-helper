const helper = require("./index");
console.log('start');

helper.debug = true;

helper('DRIVER=SQLite3;Database=./test.db;FKSupport=True').then(async function (db) {
        const logTable = new db.$log.create()
            .$id('INTEGER', {
                primary: true,
                unique: true
            })
            .$src('TINYTEXT', {
                notnull: true
            })
            .$content('TEXT', {
                notnull: 'true'
            })
            .$ctime('DATETIME', {
                default: 'CURRENT_TIMESTAMP'
            });
        const testTable = new db.$test.create()
            .$id('INTEGER', {
                primary: true,
                unique: true
            })
            .$name('TEXT', {
                default: 'test'
            })
            .$info('TEXT');

        console.log('create', typeof createTable);
        await logTable();
        await testTable();
        console.log('create', 'after create');

        const testLogTrigger = new db._trigger.$testlog()
            .after('INSERT').on('test').do(new db.$log.insert().$src.$content, {
                $src: '"test"',
                $content: '"insert " || NEW.id'
            });
        console.log(testLogTrigger.do);
        await testLogTrigger();

        const selectLogData = new db.$log.select().$;

        const insertData = new db.$test.insert().$name.$info;
        console.log('insert');
        await insertData({
            $name: 'TEST',
            $info: 'info'
        });
        await insertData({
            $name: 'TEST',
            $info: 'info2'
        });
        await insertData({
            $name: 'TEST2',
            $info: 'info'
        });
        await insertData({
            $name: 'TEST3',
            $info: 'info2'
        });
        console.log('insert', 'after insert');

        console.log(await (await selectLogData()).data);

        const selectData = new db.$test.select().$;
        console.log(await (await selectData()).data);
        console.log('select', 'after select');

        console.log('delete');
        const deleteCommand = new db.$test.delete().where('name = $name');
        await deleteCommand({
            $name: 'TEST'
        });
        console.log('delete', 'after delete');

        console.log(await (await selectData()).data);

        console.log('update');
        const updateCommand = new db.$test.update().$info.where('name == $name');
        await updateCommand({
            $name: 'TEST2',
            $info: 'modify'
        });
        console.log('update', 'after update');

        console.log(await (await selectData()).data);

        const anotherTable = new db.$another.create()
            .$id('TEXT', {
                primary: true,
                unique: true,
                foreign: {
                    target: 'test',
                    key: 'id'
                }
            })
            .$info('TEXT', {
                notnull: true
            });
        await anotherTable();

        const insertAnotherData = new db.$another.insert().$id.$info;
        await insertAnotherData({
            $id: '3',
            $info: 'INFO'
        });

        const selectAnotherData = new db.$another.select().$;
        console.log(await (await selectAnotherData()).data);

        await new db.$test.delete()();

        console.log(await (await selectAnotherData()).data);

        delete db._trigger.$testlog;
        delete db.$log;
        delete db.$test;
        delete db.$another;
    })
    .catch(err => console.error('err', err));