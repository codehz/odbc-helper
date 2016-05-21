const helper = require("./index");
console.log('start');

helper('DRIVER=SQLite3;Database=./test.db;').then(async function (db) {
        const createTable = new db.$test.create()
            .$id('INTEGER', {
                primary: true,
                unique: true
            })
            .$name('TEXT', {
                default: 'test'
            })
            .$info('TEXT');
        console.log('create', typeof createTable);
        await createTable();
        console.log('create', 'after create');

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

        const selectData = new db.$test.select().$;
        console.log(await (await selectData()).data);
        console.log('select', 'after select');

        console.log('delete');
        const deleteCommand = new db.$test.delete().where('name = $name');
        await deleteCommand({$name: 'TEST'});
        console.log('delete', 'after delete');

        console.log(await (await selectData()).data);

        console.log('update');
        const updateCommand = new db.$test.update().$info.where('name == $name');
        await updateCommand({$name: 'TEST2', $info: 'modify'});
        console.log('update', 'after update');

        console.log(await (await selectData()).data);

        await new db.$test.delete()();
    })
    .catch(err => console.error('err', err));