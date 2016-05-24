const helper = require("./index");
log('start');

helper.debug = true;

function log(...args) {
    console.log('\u001B[1;32m');
    console.log(...args);
    console.log('\u001B[0m');
}

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

        await logTable();
        await testTable();

        log('create', 'trigger for test');
        const testLogTrigger = new db._trigger.$testlog()
            .after('INSERT').on('test').do(new db.$log.insert().$src.$content, {
                $src: '"test"',
                $content: '"insert " || NEW.id'
            });
        await testLogTrigger();

        const selectLogData = new db.$log.select().$;

        const insertData = new db.$test.insert().$name.$info;
        log('insert');
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

        log(await (await selectLogData()).data);

        const selectData = new db.$test.select().$;
        log(await (await selectData()).data);

        log('delete');
        const deleteCommand = new db.$test.delete().where('name == $name');
        await deleteCommand({
            $name: 'TEST'
        });

        log(await (await selectData()).data);

        log('update');
        const updateCommand = new db.$test.update().$info.where('name == $name');
        await updateCommand({
            $name: 'TEST2',
            $info: 'modify'
        });

        log(await (await selectData()).data);

        log('create', 'anotherTable');
        const anotherTable = new db.$another.create()
            .$id('TEXT', {
                primary: true,
                unique: true,
                foreign: {
                    target: 'test',
                    key: 'id',
                    restrict: {
                        ondelete: {
                            cascade: true
                        }
                    }
                }
            })
            .$info('TEXT', {
                notnull: true
            });
        await anotherTable();

        log('create', 'trigger for another');
        await (new db._trigger.$anotherlog()
            .on('another').after('INSERT').do(new db.$log.insert().$src.$content, {
                $src: '"another"',
                $content: '"insert " || NEW.id'
            }))();

        const insertAnotherData = new db.$another.insert().$id.$info;
        await insertAnotherData({
            $id: '3',
            $info: 'INFO'
        });
        await insertAnotherData({
            $id: '4',
            $info: 'INFO'
        });

        log('select', 'from another');
        const selectAnotherData = new db.$another.select().$;
        log(await (await selectAnotherData()).data);

        await new db.$test.delete()();

        log(await (await selectAnotherData()).data);

        log(await (await selectLogData()).data);

        log('create', 'view');
        const logView = new db._view.$anotherlogview()
            .as(new db.$log.select().$.where('src == "another"'));
        await logView();

        log('select', 'from view');
        const selectFromView = new db.$anotherlogview.select().$;
        log(await (await selectFromView()).data);

        log('delete', 'all');
        delete db._trigger.$testlog;
        delete db._trigger.$anotherlog;
        delete db._view.$anotherlogview;
        delete db.$log;
        delete db.$test;
        delete db.$another;
    })
    .catch(err => console.error('err', err));