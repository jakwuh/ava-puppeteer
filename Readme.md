# ava-puppeteer

> An ava companion for snapshots testing with puppeteer

```js
// bootstrap.js
const {createCapture} = require('ava-puppeteer');

global.capture = createCapture();
```

```js
// test-module-A.js
import test from 'ava';

test('Dailytip homepage has Telegram subscribe banner', async t => {
    await capture({
        url: 'https://akwuh.me/t/',
        selector: 'h4'
    });
    t.pass();
});
```
