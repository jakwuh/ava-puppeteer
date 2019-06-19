const puppeteer = require('puppeteer');
const looksSame = require('looks-same');
const {URL} = require('url');
const {join} = require('path');
const mkdirp = require('mkdirp-promise');
const fs = require('fs');
const {promisify} = require('es6-promisify');
const chalk = require('chalk');
const del = require('del');
const minimist = require('minimist');

const access = promisify(fs.access);
const compareSnapshots = promisify(looksSame);
const createSnapshotsDiff = promisify(looksSame.createDiff);
const args = minimist(process.argv);

const DIFF_FOLDER_PREFIX = '.diff';
const CURRENT_FOLDER_PREFIX = '.current';

function log(line) {
    // console.info(chalk.cyan(line));
}

/**
 * @param {string|null[]} parts
 * @return {string}
 */
function joinAndStrip(parts) {
    return parts.filter(Boolean).join('').replace(/[^\w]+/g, '-');
}

/**
 * @param {string} root
 * @param {string} url
 * @param {string} selector
 * @return {{file: string, folder: string, path: string}}
 */
async function buildPath({root, url, selector}) {
    log(`Building path for ${url} - ${selector}`);

    let parts = new URL(url);

    let folder = joinAndStrip([parts.origin]);
    let subFolder = joinAndStrip([parts.pathname, parts.search]);
    let file = joinAndStrip([selector]);
    let extension = '.png';

    let paths = {
        file,
        folder: join(root, folder, subFolder),
        path: join(root, folder, subFolder, file + extension)
    };

    log(`Path is ${paths.path}`);

    return paths;
}

async function getPage(browser, url) {
    log(`Creating a page for ${url}`);
    let page = await browser.newPage();

    page.on('console', (...args) => {
        console.log('[Chromium console:] ', ...args);
    });

    await page.goto(url);

    log(`Page has been created`);

    return page;
}

async function getClip({page, selector}) {
    log(`Getting clip for ${selector}`);

    let clip = await page.evaluate((selector) => {
        let el = document.querySelector(selector);

        if (!el) {
            throw new Error(`An el matching selector \`${selector}\` wasn't found`);
        }

        let rect = el.getBoundingClientRect();

        return {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height
        }
    }, selector);

    log(`Clip has been retrieved: ${JSON.stringify(clip)}`);

    return clip;
}

async function getSnapshot({root, url, selector, page, clip}) {
    log(`Making a snapshot`);

    let {path, folder} = await buildPath({root, url, selector});

    mkdirp(folder);

    await page.screenshot({path, clip});

    log(`Snapshot was saved in ${path}`);

    return {
        path
    };
}

async function getReference({root, url, selector}) {
    log(`Searching for the reference`);

    let {path} = await buildPath({root, url, selector});

    try {
        await access(path);

        log(`Reference is in ${path}`);

        return {
            path
        };
    } catch (e) {
        log(`Reference was not found`);
    }
}

const snapshotsCompareOptions = {
    highlightColor: '#ff00ff',
    strict: false,
    tolerance: 2.5
};

async function validateSnapshot(suite) {
    let {current, reference} = suite;
    log(`Validating snapshot`);

    let equal = await compareSnapshots(current.path, reference.path, snapshotsCompareOptions);

    if (!equal) {
        let {path} = await invalidateSnapshots(suite);
        throw new Error(`Snapshots mismatch. Diff saved in ${path}`);
    } else {
        log(`Snapshot is valid`);
    }
}

async function invalidateSnapshots({diffRoot: root, url, selector, reference, current}) {
    let {path, folder} = await buildPath({root, url, selector});

    mkdirp(folder);

    await createSnapshotsDiff({
        ...snapshotsCompareOptions,
        reference: reference.path,
        current: current.path,
        diff: path,
    });

    log(`Snapshot is invalid. Diff saved in ${path}`);

    return {
        path
    }
}

async function clearFolders({diffRoot}) {
    del(diffRoot);
}

let updateSnapshots = args['update-snapshots'] || process.env.UPDATE_SNAPSHOTS;

try {
    const avaConfig = JSON.parse(args._[2]);
    updateSnapshots = avaConfig.updateSnapshots;
} catch (e) {
}

/**
 * @param {string} [root = 'screenshots']
 * @return {capture}
 */
function createCapture({root = 'screenshots'} = {}) {
    const paths = {
        root,
        diffRoot: join(root, DIFF_FOLDER_PREFIX),
        currentRoot: join(root, CURRENT_FOLDER_PREFIX)
    };

    const browserPromise = Promise.all([
        puppeteer.launch(),
        clearFolders(paths)
    ]).then(([browser]) => browser);

    process.on('beforeExit', function () {
        browserPromise.then(browser => browser.close());
    });

    return async function capture({url, selector = 'body'}) {
        const suite = {
                ...paths,
            url,
            selector
        };

        let browser = await browserPromise;

        suite.page = await getPage(browser, url);
        suite.clip = await getClip(suite);

        if (updateSnapshots) {
            await getSnapshot(suite);
        } else {
            suite.current = await getSnapshot({...suite, root: suite.currentRoot});
            suite.reference = await getReference(suite);

            if (suite.reference) {
                await validateSnapshot(suite);
            } else {
                throw new Error('No reference snapshot was found.');
            }
        }
    }
}

exports.createCapture = createCapture;
