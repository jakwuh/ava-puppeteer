import test from 'ava';

test('time.is index has clock', async t => {
    await capture({
        url: 'https://time.is/',
        selector: 'div#twd'
    });
    t.pass();
});
