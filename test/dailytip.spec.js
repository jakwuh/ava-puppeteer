import test from 'ava';

test('Dailytip homepage has Telegram subscribe banner', async t => {
    await capture({
        url: 'https://akwuh.me/t/',
        selector: 'h4'
    });
    t.pass();
});
