const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Store Chrome inside the project so it persists between build and runtime on Render
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
