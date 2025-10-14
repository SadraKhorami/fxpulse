require('colors');
const fs = require('fs');

const LOG_PATH = './terminal.log';

const loadLog = () => {
    try {
        if (fs.existsSync(LOG_PATH)) {
            return fs.readFileSync(LOG_PATH, 'utf-8');
        }
    } catch {
        // ignore read errors, we'll recreate the file below
    }
    return '';
};

const persistLog = (content) => {
    try {
        fs.writeFileSync(LOG_PATH, content, 'utf-8');
    } catch {
        // ignore write failures; console output already occurred
    }
};

/**
 * @param {string[]} message 
 */
const info = (...message) => {
    const time = new Date().toLocaleTimeString();
    let fileContent = loadLog();

    console.info(`[${time}]`.gray, '[Info]'.blue, message.join(' '));
    fileContent += [`[${time}]`.gray, '[Info]'.blue, message.join(' ')].join(' ') + '\n';

    persistLog(fileContent);
}

/**
 * @param {string[]} message 
 */
const success = (...message) => {
    const time = new Date().toLocaleTimeString();
    let fileContent = loadLog();

    console.info(`[${time}]`.gray, '[OK]'.green, message.join(' '));
    fileContent += [`[${time}]`.gray, '[OK]'.green, message.join(' ')].join(' ') + '\n';

    persistLog(fileContent);
}

/**
 * @param {string[]} message 
 */
const error = (...message) => {
    const time = new Date().toLocaleTimeString();
    let fileContent = loadLog();

    console.error(`[${time}]`.gray, '[Error]'.red, message.join(' '));
    fileContent += [`[${time}]`.gray, '[Error]'.red, message.join(' ')].join(' ') + '\n';

    persistLog(fileContent);
}

/**
 * @param {string[]} message 
 */
const warn = (...message) => {
    const time = new Date().toLocaleTimeString();
    let fileContent = loadLog();

    console.warn(`[${time}]`.gray, '[Warning]'.yellow, message.join(' '));
    fileContent += [`[${time}]`.gray, '[Warning]'.yellow, message.join(' ')].join(' ') + '\n';

    persistLog(fileContent);
}

module.exports = { info, success, error, warn }
