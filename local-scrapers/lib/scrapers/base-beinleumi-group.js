"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.clickAccountSelectorGetAccountIds = clickAccountSelectorGetAccountIds;
exports.createLoginFields = createLoginFields;
exports.default = void 0;
exports.getPossibleLoginResults = getPossibleLoginResults;
exports.selectAccountFromDropdown = selectAccountFromDropdown;
exports.waitForPostLogin = waitForPostLogin;
var _moment = _interopRequireDefault(require("moment"));
var _constants = require("../constants");
var _elementsInteractions = require("../helpers/elements-interactions");
var _navigation = require("../helpers/navigation");
var _waiting = require("../helpers/waiting");
var _transactions = require("../transactions");
var _baseScraperWithBrowser = require("./base-scraper-with-browser");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const DATE_FORMAT = 'DD/MM/YYYY';
const NO_TRANSACTION_IN_DATE_RANGE_TEXT = 'לא נמצאו נתונים בנושא המבוקש';
const DATE_COLUMN_CLASS_COMPLETED = 'date first';
const DATE_COLUMN_CLASS_PENDING = 'first date';
const DESCRIPTION_COLUMN_CLASS_COMPLETED = 'reference wrap_normal';
const DESCRIPTION_COLUMN_CLASS_PENDING = 'details wrap_normal';
const REFERENCE_COLUMN_CLASS = 'details';
const DEBIT_COLUMN_CLASS = 'debit';
const CREDIT_COLUMN_CLASS = 'credit';
const ERROR_MESSAGE_CLASS = 'NO_DATA';
const ACCOUNTS_NUMBER = 'div.fibi_account span.acc_num';
const CLOSE_SEARCH_BY_DATES_BUTTON_CLASS = 'ui-datepicker-close';
const SHOW_SEARCH_BY_DATES_BUTTON_VALUE = 'הצג';
const COMPLETED_TRANSACTIONS_TABLE = 'table#dataTable077';
const PENDING_TRANSACTIONS_TABLE = 'table#dataTable023';
const NEXT_PAGE_LINK = 'a#Npage.paging';
const CURRENT_BALANCE = '.main_balance';
const IFRAME_NAME = 'iframe-old-pages';
const ELEMENT_RENDER_TIMEOUT_MS = 10000;
function getPossibleLoginResults() {
  const urls = {};
  urls[_baseScraperWithBrowser.LoginResults.Success] = [/fibi.*accountSummary/,
  // New UI pattern
  /Resources\/PortalNG\/shell/,
  // New UI pattern
  /FibiMenu\/Online/ // Old UI pattern
  ];
  urls[_baseScraperWithBrowser.LoginResults.InvalidPassword] = [/FibiMenu\/Marketing\/Private\/Home/];
  return urls;
}
function createLoginFields(credentials) {
  return [{
    selector: '#username',
    value: credentials.username
  }, {
    selector: '#password',
    value: credentials.password
  }];
}
function getAmountData(amountStr) {
  let amountStrCopy = amountStr.replace(_constants.SHEKEL_CURRENCY_SYMBOL, '');
  amountStrCopy = amountStrCopy.replaceAll(',', '');
  return parseFloat(amountStrCopy);
}
function getTxnAmount(txn) {
  const credit = getAmountData(txn.credit);
  const debit = getAmountData(txn.debit);
  return (Number.isNaN(credit) ? 0 : credit) - (Number.isNaN(debit) ? 0 : debit);
}
function convertTransactions(txns) {
  return txns.map(txn => {
    const convertedDate = (0, _moment.default)(txn.date, DATE_FORMAT).toISOString();
    const convertedAmount = getTxnAmount(txn);
    return {
      type: _transactions.TransactionTypes.Normal,
      identifier: txn.reference ? parseInt(txn.reference, 10) : undefined,
      date: convertedDate,
      processedDate: convertedDate,
      originalAmount: convertedAmount,
      originalCurrency: _constants.SHEKEL_CURRENCY,
      chargedAmount: convertedAmount,
      status: txn.status,
      description: txn.description,
      memo: txn.memo
    };
  });
}
function getTransactionDate(tds, transactionType, transactionsColsTypes) {
  if (transactionType === 'completed') {
    return (tds[transactionsColsTypes[DATE_COLUMN_CLASS_COMPLETED]] || '').trim();
  }
  return (tds[transactionsColsTypes[DATE_COLUMN_CLASS_PENDING]] || '').trim();
}
function getTransactionDescription(tds, transactionType, transactionsColsTypes) {
  if (transactionType === 'completed') {
    return (tds[transactionsColsTypes[DESCRIPTION_COLUMN_CLASS_COMPLETED]] || '').trim();
  }
  return (tds[transactionsColsTypes[DESCRIPTION_COLUMN_CLASS_PENDING]] || '').trim();
}
function getTransactionReference(tds, transactionsColsTypes) {
  return (tds[transactionsColsTypes[REFERENCE_COLUMN_CLASS]] || '').trim();
}
function getTransactionDebit(tds, transactionsColsTypes) {
  return (tds[transactionsColsTypes[DEBIT_COLUMN_CLASS]] || '').trim();
}
function getTransactionCredit(tds, transactionsColsTypes) {
  return (tds[transactionsColsTypes[CREDIT_COLUMN_CLASS]] || '').trim();
}
function extractTransactionDetails(txnRow, transactionStatus, transactionsColsTypes) {
  const tds = txnRow.innerTds;
  const item = {
    status: transactionStatus,
    date: getTransactionDate(tds, transactionStatus, transactionsColsTypes),
    description: getTransactionDescription(tds, transactionStatus, transactionsColsTypes),
    reference: getTransactionReference(tds, transactionsColsTypes),
    debit: getTransactionDebit(tds, transactionsColsTypes),
    credit: getTransactionCredit(tds, transactionsColsTypes)
  };
  return item;
}
async function getTransactionsColsTypeClasses(page, tableLocator) {
  const result = {};
  const typeClassesObjs = await (0, _elementsInteractions.pageEvalAll)(page, `${tableLocator} tbody tr:first-of-type td`, null, tds => {
    return tds.map((td, index) => ({
      colClass: td.getAttribute('class'),
      index
    }));
  });
  for (const typeClassObj of typeClassesObjs) {
    if (typeClassObj.colClass) {
      result[typeClassObj.colClass] = typeClassObj.index;
    }
  }
  return result;
}
function extractTransaction(txns, transactionStatus, txnRow, transactionsColsTypes) {
  const txn = extractTransactionDetails(txnRow, transactionStatus, transactionsColsTypes);
  if (txn.date !== '') {
    txns.push(txn);
  }
}
async function extractTransactions(page, tableLocator, transactionStatus) {
  const txns = [];
  const transactionsColsTypes = await getTransactionsColsTypeClasses(page, tableLocator);
  const transactionsRows = await (0, _elementsInteractions.pageEvalAll)(page, `${tableLocator} tbody tr`, [], trs => {
    return trs.map(tr => ({
      innerTds: Array.from(tr.getElementsByTagName('td')).map(td => td.innerText)
    }));
  });
  for (const txnRow of transactionsRows) {
    extractTransaction(txns, transactionStatus, txnRow, transactionsColsTypes);
  }
  return txns;
}
async function isNoTransactionInDateRangeError(page) {
  const hasErrorInfoElement = await (0, _elementsInteractions.elementPresentOnPage)(page, `.${ERROR_MESSAGE_CLASS}`);
  if (hasErrorInfoElement) {
    const errorText = await page.$eval(`.${ERROR_MESSAGE_CLASS}`, errorElement => {
      return errorElement.innerText;
    });
    return errorText.trim() === NO_TRANSACTION_IN_DATE_RANGE_TEXT;
  }
  return false;
}
async function searchByDates(page, startDate) {
  await (0, _elementsInteractions.clickButton)(page, 'a#tabHeader4');
  await (0, _elementsInteractions.waitUntilElementFound)(page, 'div#fibi_dates');
  await (0, _elementsInteractions.fillInput)(page, 'input#fromDate', startDate.format(DATE_FORMAT));
  await (0, _elementsInteractions.clickButton)(page, `button[class*=${CLOSE_SEARCH_BY_DATES_BUTTON_CLASS}]`);
  await (0, _elementsInteractions.clickButton)(page, `input[value=${SHOW_SEARCH_BY_DATES_BUTTON_VALUE}]`);
  await (0, _navigation.waitForNavigation)(page);
}
async function getAccountNumber(page) {
  // Wait until the account number element is present in the DOM
  await (0, _elementsInteractions.waitUntilElementFound)(page, ACCOUNTS_NUMBER, true, ELEMENT_RENDER_TIMEOUT_MS);
  const selectedSnifAccount = await page.$eval(ACCOUNTS_NUMBER, option => {
    return option.innerText;
  });
  return selectedSnifAccount.replace('/', '_').trim();
}
async function checkIfHasNextPage(page) {
  return (0, _elementsInteractions.elementPresentOnPage)(page, NEXT_PAGE_LINK);
}
async function navigateToNextPage(page) {
  await (0, _elementsInteractions.clickButton)(page, NEXT_PAGE_LINK);
  await (0, _navigation.waitForNavigation)(page);
}

/* Couldn't reproduce scenario with multiple pages of pending transactions - Should support if exists such case.
   needToPaginate is false if scraping pending transactions */
async function scrapeTransactions(page, tableLocator, transactionStatus, needToPaginate) {
  const txns = [];
  let hasNextPage = false;
  do {
    const currentPageTxns = await extractTransactions(page, tableLocator, transactionStatus);
    txns.push(...currentPageTxns);
    if (needToPaginate) {
      hasNextPage = await checkIfHasNextPage(page);
      if (hasNextPage) {
        await navigateToNextPage(page);
      }
    }
  } while (hasNextPage);
  return convertTransactions(txns);
}
async function getAccountTransactions(page) {
  await Promise.race([(0, _elementsInteractions.waitUntilElementFound)(page, "div[id*='divTable']", false), (0, _elementsInteractions.waitUntilElementFound)(page, `.${ERROR_MESSAGE_CLASS}`, false)]);
  const noTransactionInRangeError = await isNoTransactionInDateRangeError(page);
  if (noTransactionInRangeError) {
    return [];
  }
  const pendingTxns = await scrapeTransactions(page, PENDING_TRANSACTIONS_TABLE, _transactions.TransactionStatuses.Pending, false);
  const completedTxns = await scrapeTransactions(page, COMPLETED_TRANSACTIONS_TABLE, _transactions.TransactionStatuses.Completed, true);
  const txns = [...pendingTxns, ...completedTxns];
  return txns;
}
async function getCurrentBalance(page) {
  // Wait for the balance element to appear and be visible
  await (0, _elementsInteractions.waitUntilElementFound)(page, CURRENT_BALANCE, true, ELEMENT_RENDER_TIMEOUT_MS);

  // Extract text content
  const balanceStr = await page.$eval(CURRENT_BALANCE, el => {
    return el.innerText;
  });
  return getAmountData(balanceStr);
}
async function waitForPostLogin(page) {
  return Promise.race([(0, _elementsInteractions.waitUntilElementFound)(page, '#card-header', false),
  // New UI
  (0, _elementsInteractions.waitUntilElementFound)(page, '#account_num', true),
  // New UI
  (0, _elementsInteractions.waitUntilElementFound)(page, '#matafLogoutLink', true),
  // Old UI
  (0, _elementsInteractions.waitUntilElementFound)(page, '#validationMsg', true) // Old UI
  ]);
}
async function fetchAccountData(page, startDate) {
  const accountNumber = await getAccountNumber(page);
  const balance = await getCurrentBalance(page);
  await searchByDates(page, startDate);
  const txns = await getAccountTransactions(page);
  return {
    accountNumber,
    txns,
    balance
  };
}
async function getAccountIdsOldUI(page) {
  return page.evaluate(() => {
    const selectElement = document.getElementById('account_num_select');
    const options = selectElement ? selectElement.querySelectorAll('option') : [];
    if (!options) return [];
    return Array.from(options, option => option.value);
  });
}

/**
 * Ensures the account dropdown is open, then returns the available account labels.
 *
 * This method:
 * - Checks if the dropdown is already open.
 * - If not open, clicks the account selector to open it.
 * - Waits for the dropdown to render.
 * - Extracts and returns the list of available account labels.
 *
 * Graceful handling:
 * - If any error occurs (e.g., selectors not found, timing issues, UI version changes),
 *   the function returns an empty list.
 *
 * @param page Puppeteer Page object.
 * @returns An array of available account labels (e.g., ["127 | XXXX1", "127 | XXXX2"]),
 *          or an empty array if something goes wrong.
 */
async function clickAccountSelectorGetAccountIds(page) {
  try {
    const accountSelector = 'div.current-account'; // Direct selector to clickable element
    const dropdownPanelSelector = 'div.mat-mdc-autocomplete-panel.account-select-dd'; // The dropdown list box
    const optionSelector = 'mat-option .mdc-list-item__primary-text'; // Account option labels

    // Check if dropdown is already open
    const dropdownVisible = await page.$eval(dropdownPanelSelector, el => {
      return el && window.getComputedStyle(el).display !== 'none' && el.offsetParent !== null;
    }).catch(() => false); // catch if dropdown is not in the DOM yet

    if (!dropdownVisible) {
      await (0, _elementsInteractions.waitUntilElementFound)(page, accountSelector, true, ELEMENT_RENDER_TIMEOUT_MS);

      // Click the account selector to open the dropdown
      await (0, _elementsInteractions.clickButton)(page, accountSelector);

      // Wait for the dropdown to open
      await (0, _elementsInteractions.waitUntilElementFound)(page, dropdownPanelSelector, true, ELEMENT_RENDER_TIMEOUT_MS);
    }

    // Extract account labels from the dropdown options
    const accountLabels = await page.$$eval(optionSelector, options => {
      return options.map(option => option.textContent?.trim() || '').filter(label => label !== '');
    });
    return accountLabels;
  } catch (error) {
    return []; // Graceful fallback
  }
}
async function getAccountIdsBothUIs(page) {
  let accountsIds = await clickAccountSelectorGetAccountIds(page);
  if (accountsIds.length === 0) {
    accountsIds = await getAccountIdsOldUI(page);
  }
  return accountsIds;
}

/**
 * Selects an account from the dropdown based on the provided account label.
 *
 * This method:
 * - Clicks the account selector button to open the dropdown.
 * - Retrieves the list of available account labels.
 * - Checks if the provided account label exists in the list.
 * - Finds and clicks the matching account option if found.
 *
 * @param page Puppeteer Page object.
 * @param accountLabel The text of the account to select (e.g., "127 | XXXXX").
 * @returns True if the account option was found and clicked; false otherwise.
 */
async function selectAccountFromDropdown(page, accountLabel) {
  // Call clickAccountSelector to get the available accounts and open the dropdown
  const availableAccounts = await clickAccountSelectorGetAccountIds(page);

  // Check if the account label exists in the available accounts
  if (!availableAccounts.includes(accountLabel)) {
    return false;
  }

  // Wait for the dropdown options to be rendered
  const optionSelector = 'mat-option .mdc-list-item__primary-text';
  await (0, _elementsInteractions.waitUntilElementFound)(page, optionSelector, true, ELEMENT_RENDER_TIMEOUT_MS);

  // Query all matching options
  const accountOptions = await page.$$(optionSelector);

  // Find and click the option matching the accountLabel
  for (const option of accountOptions) {
    const text = await page.evaluate(el => el.textContent?.trim(), option);
    if (text === accountLabel) {
      const optionHandle = await option.evaluateHandle(el => el);
      await page.evaluate(el => el.click(), optionHandle);
      return true;
    }
  }
  return false;
}
async function getTransactionsFrame(page) {
  // Try a few times to find the iframe, as it might not be immediately available
  for (let attempt = 0; attempt < 3; attempt++) {
    await (0, _waiting.sleep)(2000);
    const frames = page.frames();
    const targetFrame = frames.find(f => f.name() === IFRAME_NAME);
    if (targetFrame) {
      return targetFrame;
    }
  }
  return null;
}
async function selectAccountBothUIs(page, accountId) {
  const accountSelected = await selectAccountFromDropdown(page, accountId);
  if (!accountSelected) {
    // Old UI format
    await page.select('#account_num_select', accountId);
    await (0, _elementsInteractions.waitUntilElementFound)(page, '#account_num_select', true);
  }
}
async function fetchAccountDataBothUIs(page, startDate) {
  // Try to get the iframe for the new UI
  const frame = await getTransactionsFrame(page);

  // Use the frame if available (new UI), otherwise use the page directly (old UI)
  const targetPage = frame || page;
  return fetchAccountData(targetPage, startDate);
}
async function fetchAccounts(page, startDate) {
  const accountsIds = await getAccountIdsBothUIs(page);
  if (accountsIds.length === 0) {
    // In case accountsIds could no be parsed just return the transactions of the currently selected account
    const accountData = await fetchAccountDataBothUIs(page, startDate);
    return [accountData];
  }
  const accounts = [];
  for (const accountId of accountsIds) {
    await selectAccountBothUIs(page, accountId);
    const accountData = await fetchAccountDataBothUIs(page, startDate);
    accounts.push(accountData);
  }
  return accounts;
}
class BeinleumiGroupBaseScraper extends _baseScraperWithBrowser.BaseScraperWithBrowser {
  BASE_URL = '';
  LOGIN_URL = '';
  TRANSACTIONS_URL = '';
  getLoginOptions(credentials) {
    return {
      loginUrl: `${this.LOGIN_URL}`,
      fields: createLoginFields(credentials),
      submitButtonSelector: '#continueBtn',
      postAction: async () => waitForPostLogin(this.page),
      possibleResults: getPossibleLoginResults(),
      // HACK: For some reason, though the login button (#continueBtn) is present and visible, the click action does not perform.
      // Adding this delay fixes the issue.
      preAction: async () => {
        await (0, _waiting.sleep)(1000);
      }
    };
  }
  async fetchData() {
    const defaultStartMoment = (0, _moment.default)().subtract(1, 'years').add(1, 'day');
    const startMomentLimit = (0, _moment.default)({
      year: 1600
    });
    const startDate = this.options.startDate || defaultStartMoment.toDate();
    const startMoment = _moment.default.max(startMomentLimit, (0, _moment.default)(startDate));
    await this.navigateTo(this.TRANSACTIONS_URL);
    const accounts = await fetchAccounts(this.page, startMoment);
    return {
      success: true,
      accounts
    };
  }
}
var _default = exports.default = BeinleumiGroupBaseScraper;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbW9tZW50IiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsInJlcXVpcmUiLCJfY29uc3RhbnRzIiwiX2VsZW1lbnRzSW50ZXJhY3Rpb25zIiwiX25hdmlnYXRpb24iLCJfd2FpdGluZyIsIl90cmFuc2FjdGlvbnMiLCJfYmFzZVNjcmFwZXJXaXRoQnJvd3NlciIsImUiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsIkRBVEVfRk9STUFUIiwiTk9fVFJBTlNBQ1RJT05fSU5fREFURV9SQU5HRV9URVhUIiwiREFURV9DT0xVTU5fQ0xBU1NfQ09NUExFVEVEIiwiREFURV9DT0xVTU5fQ0xBU1NfUEVORElORyIsIkRFU0NSSVBUSU9OX0NPTFVNTl9DTEFTU19DT01QTEVURUQiLCJERVNDUklQVElPTl9DT0xVTU5fQ0xBU1NfUEVORElORyIsIlJFRkVSRU5DRV9DT0xVTU5fQ0xBU1MiLCJERUJJVF9DT0xVTU5fQ0xBU1MiLCJDUkVESVRfQ09MVU1OX0NMQVNTIiwiRVJST1JfTUVTU0FHRV9DTEFTUyIsIkFDQ09VTlRTX05VTUJFUiIsIkNMT1NFX1NFQVJDSF9CWV9EQVRFU19CVVRUT05fQ0xBU1MiLCJTSE9XX1NFQVJDSF9CWV9EQVRFU19CVVRUT05fVkFMVUUiLCJDT01QTEVURURfVFJBTlNBQ1RJT05TX1RBQkxFIiwiUEVORElOR19UUkFOU0FDVElPTlNfVEFCTEUiLCJORVhUX1BBR0VfTElOSyIsIkNVUlJFTlRfQkFMQU5DRSIsIklGUkFNRV9OQU1FIiwiRUxFTUVOVF9SRU5ERVJfVElNRU9VVF9NUyIsImdldFBvc3NpYmxlTG9naW5SZXN1bHRzIiwidXJscyIsIkxvZ2luUmVzdWx0cyIsIlN1Y2Nlc3MiLCJJbnZhbGlkUGFzc3dvcmQiLCJjcmVhdGVMb2dpbkZpZWxkcyIsImNyZWRlbnRpYWxzIiwic2VsZWN0b3IiLCJ2YWx1ZSIsInVzZXJuYW1lIiwicGFzc3dvcmQiLCJnZXRBbW91bnREYXRhIiwiYW1vdW50U3RyIiwiYW1vdW50U3RyQ29weSIsInJlcGxhY2UiLCJTSEVLRUxfQ1VSUkVOQ1lfU1lNQk9MIiwicmVwbGFjZUFsbCIsInBhcnNlRmxvYXQiLCJnZXRUeG5BbW91bnQiLCJ0eG4iLCJjcmVkaXQiLCJkZWJpdCIsIk51bWJlciIsImlzTmFOIiwiY29udmVydFRyYW5zYWN0aW9ucyIsInR4bnMiLCJtYXAiLCJjb252ZXJ0ZWREYXRlIiwibW9tZW50IiwiZGF0ZSIsInRvSVNPU3RyaW5nIiwiY29udmVydGVkQW1vdW50IiwidHlwZSIsIlRyYW5zYWN0aW9uVHlwZXMiLCJOb3JtYWwiLCJpZGVudGlmaWVyIiwicmVmZXJlbmNlIiwicGFyc2VJbnQiLCJ1bmRlZmluZWQiLCJwcm9jZXNzZWREYXRlIiwib3JpZ2luYWxBbW91bnQiLCJvcmlnaW5hbEN1cnJlbmN5IiwiU0hFS0VMX0NVUlJFTkNZIiwiY2hhcmdlZEFtb3VudCIsInN0YXR1cyIsImRlc2NyaXB0aW9uIiwibWVtbyIsImdldFRyYW5zYWN0aW9uRGF0ZSIsInRkcyIsInRyYW5zYWN0aW9uVHlwZSIsInRyYW5zYWN0aW9uc0NvbHNUeXBlcyIsInRyaW0iLCJnZXRUcmFuc2FjdGlvbkRlc2NyaXB0aW9uIiwiZ2V0VHJhbnNhY3Rpb25SZWZlcmVuY2UiLCJnZXRUcmFuc2FjdGlvbkRlYml0IiwiZ2V0VHJhbnNhY3Rpb25DcmVkaXQiLCJleHRyYWN0VHJhbnNhY3Rpb25EZXRhaWxzIiwidHhuUm93IiwidHJhbnNhY3Rpb25TdGF0dXMiLCJpbm5lclRkcyIsIml0ZW0iLCJnZXRUcmFuc2FjdGlvbnNDb2xzVHlwZUNsYXNzZXMiLCJwYWdlIiwidGFibGVMb2NhdG9yIiwicmVzdWx0IiwidHlwZUNsYXNzZXNPYmpzIiwicGFnZUV2YWxBbGwiLCJ0ZCIsImluZGV4IiwiY29sQ2xhc3MiLCJnZXRBdHRyaWJ1dGUiLCJ0eXBlQ2xhc3NPYmoiLCJleHRyYWN0VHJhbnNhY3Rpb24iLCJwdXNoIiwiZXh0cmFjdFRyYW5zYWN0aW9ucyIsInRyYW5zYWN0aW9uc1Jvd3MiLCJ0cnMiLCJ0ciIsIkFycmF5IiwiZnJvbSIsImdldEVsZW1lbnRzQnlUYWdOYW1lIiwiaW5uZXJUZXh0IiwiaXNOb1RyYW5zYWN0aW9uSW5EYXRlUmFuZ2VFcnJvciIsImhhc0Vycm9ySW5mb0VsZW1lbnQiLCJlbGVtZW50UHJlc2VudE9uUGFnZSIsImVycm9yVGV4dCIsIiRldmFsIiwiZXJyb3JFbGVtZW50Iiwic2VhcmNoQnlEYXRlcyIsInN0YXJ0RGF0ZSIsImNsaWNrQnV0dG9uIiwid2FpdFVudGlsRWxlbWVudEZvdW5kIiwiZmlsbElucHV0IiwiZm9ybWF0Iiwid2FpdEZvck5hdmlnYXRpb24iLCJnZXRBY2NvdW50TnVtYmVyIiwic2VsZWN0ZWRTbmlmQWNjb3VudCIsIm9wdGlvbiIsImNoZWNrSWZIYXNOZXh0UGFnZSIsIm5hdmlnYXRlVG9OZXh0UGFnZSIsInNjcmFwZVRyYW5zYWN0aW9ucyIsIm5lZWRUb1BhZ2luYXRlIiwiaGFzTmV4dFBhZ2UiLCJjdXJyZW50UGFnZVR4bnMiLCJnZXRBY2NvdW50VHJhbnNhY3Rpb25zIiwiUHJvbWlzZSIsInJhY2UiLCJub1RyYW5zYWN0aW9uSW5SYW5nZUVycm9yIiwicGVuZGluZ1R4bnMiLCJUcmFuc2FjdGlvblN0YXR1c2VzIiwiUGVuZGluZyIsImNvbXBsZXRlZFR4bnMiLCJDb21wbGV0ZWQiLCJnZXRDdXJyZW50QmFsYW5jZSIsImJhbGFuY2VTdHIiLCJlbCIsIndhaXRGb3JQb3N0TG9naW4iLCJmZXRjaEFjY291bnREYXRhIiwiYWNjb3VudE51bWJlciIsImJhbGFuY2UiLCJnZXRBY2NvdW50SWRzT2xkVUkiLCJldmFsdWF0ZSIsInNlbGVjdEVsZW1lbnQiLCJkb2N1bWVudCIsImdldEVsZW1lbnRCeUlkIiwib3B0aW9ucyIsInF1ZXJ5U2VsZWN0b3JBbGwiLCJjbGlja0FjY291bnRTZWxlY3RvckdldEFjY291bnRJZHMiLCJhY2NvdW50U2VsZWN0b3IiLCJkcm9wZG93blBhbmVsU2VsZWN0b3IiLCJvcHRpb25TZWxlY3RvciIsImRyb3Bkb3duVmlzaWJsZSIsIndpbmRvdyIsImdldENvbXB1dGVkU3R5bGUiLCJkaXNwbGF5Iiwib2Zmc2V0UGFyZW50IiwiY2F0Y2giLCJhY2NvdW50TGFiZWxzIiwiJCRldmFsIiwidGV4dENvbnRlbnQiLCJmaWx0ZXIiLCJsYWJlbCIsImVycm9yIiwiZ2V0QWNjb3VudElkc0JvdGhVSXMiLCJhY2NvdW50c0lkcyIsImxlbmd0aCIsInNlbGVjdEFjY291bnRGcm9tRHJvcGRvd24iLCJhY2NvdW50TGFiZWwiLCJhdmFpbGFibGVBY2NvdW50cyIsImluY2x1ZGVzIiwiYWNjb3VudE9wdGlvbnMiLCIkJCIsInRleHQiLCJvcHRpb25IYW5kbGUiLCJldmFsdWF0ZUhhbmRsZSIsImNsaWNrIiwiZ2V0VHJhbnNhY3Rpb25zRnJhbWUiLCJhdHRlbXB0Iiwic2xlZXAiLCJmcmFtZXMiLCJ0YXJnZXRGcmFtZSIsImZpbmQiLCJmIiwibmFtZSIsInNlbGVjdEFjY291bnRCb3RoVUlzIiwiYWNjb3VudElkIiwiYWNjb3VudFNlbGVjdGVkIiwic2VsZWN0IiwiZmV0Y2hBY2NvdW50RGF0YUJvdGhVSXMiLCJmcmFtZSIsInRhcmdldFBhZ2UiLCJmZXRjaEFjY291bnRzIiwiYWNjb3VudERhdGEiLCJhY2NvdW50cyIsIkJlaW5sZXVtaUdyb3VwQmFzZVNjcmFwZXIiLCJCYXNlU2NyYXBlcldpdGhCcm93c2VyIiwiQkFTRV9VUkwiLCJMT0dJTl9VUkwiLCJUUkFOU0FDVElPTlNfVVJMIiwiZ2V0TG9naW5PcHRpb25zIiwibG9naW5VcmwiLCJmaWVsZHMiLCJzdWJtaXRCdXR0b25TZWxlY3RvciIsInBvc3RBY3Rpb24iLCJwb3NzaWJsZVJlc3VsdHMiLCJwcmVBY3Rpb24iLCJmZXRjaERhdGEiLCJkZWZhdWx0U3RhcnRNb21lbnQiLCJzdWJ0cmFjdCIsImFkZCIsInN0YXJ0TW9tZW50TGltaXQiLCJ5ZWFyIiwidG9EYXRlIiwic3RhcnRNb21lbnQiLCJtYXgiLCJuYXZpZ2F0ZVRvIiwic3VjY2VzcyIsIl9kZWZhdWx0IiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9zY3JhcGVycy9iYXNlLWJlaW5sZXVtaS1ncm91cC50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgbW9tZW50LCB7IHR5cGUgTW9tZW50IH0gZnJvbSAnbW9tZW50JztcclxuaW1wb3J0IHsgdHlwZSBGcmFtZSwgdHlwZSBQYWdlIH0gZnJvbSAncHVwcGV0ZWVyJztcclxuaW1wb3J0IHsgU0hFS0VMX0NVUlJFTkNZLCBTSEVLRUxfQ1VSUkVOQ1lfU1lNQk9MIH0gZnJvbSAnLi4vY29uc3RhbnRzJztcclxuaW1wb3J0IHtcclxuICBjbGlja0J1dHRvbixcclxuICBlbGVtZW50UHJlc2VudE9uUGFnZSxcclxuICBmaWxsSW5wdXQsXHJcbiAgcGFnZUV2YWxBbGwsXHJcbiAgd2FpdFVudGlsRWxlbWVudEZvdW5kLFxyXG59IGZyb20gJy4uL2hlbHBlcnMvZWxlbWVudHMtaW50ZXJhY3Rpb25zJztcclxuaW1wb3J0IHsgd2FpdEZvck5hdmlnYXRpb24gfSBmcm9tICcuLi9oZWxwZXJzL25hdmlnYXRpb24nO1xyXG5pbXBvcnQgeyBzbGVlcCB9IGZyb20gJy4uL2hlbHBlcnMvd2FpdGluZyc7XHJcbmltcG9ydCB7IFRyYW5zYWN0aW9uU3RhdHVzZXMsIFRyYW5zYWN0aW9uVHlwZXMsIHR5cGUgVHJhbnNhY3Rpb24sIHR5cGUgVHJhbnNhY3Rpb25zQWNjb3VudCB9IGZyb20gJy4uL3RyYW5zYWN0aW9ucyc7XHJcbmltcG9ydCB7IEJhc2VTY3JhcGVyV2l0aEJyb3dzZXIsIExvZ2luUmVzdWx0cywgdHlwZSBQb3NzaWJsZUxvZ2luUmVzdWx0cyB9IGZyb20gJy4vYmFzZS1zY3JhcGVyLXdpdGgtYnJvd3Nlcic7XHJcblxyXG5jb25zdCBEQVRFX0ZPUk1BVCA9ICdERC9NTS9ZWVlZJztcclxuY29uc3QgTk9fVFJBTlNBQ1RJT05fSU5fREFURV9SQU5HRV9URVhUID0gJ9ec15Ag16DXntem15DXlSDXoNeq15XXoNeZ150g15HXoNeV16nXkCDXlNee15HXlden16knO1xyXG5jb25zdCBEQVRFX0NPTFVNTl9DTEFTU19DT01QTEVURUQgPSAnZGF0ZSBmaXJzdCc7XHJcbmNvbnN0IERBVEVfQ09MVU1OX0NMQVNTX1BFTkRJTkcgPSAnZmlyc3QgZGF0ZSc7XHJcbmNvbnN0IERFU0NSSVBUSU9OX0NPTFVNTl9DTEFTU19DT01QTEVURUQgPSAncmVmZXJlbmNlIHdyYXBfbm9ybWFsJztcclxuY29uc3QgREVTQ1JJUFRJT05fQ09MVU1OX0NMQVNTX1BFTkRJTkcgPSAnZGV0YWlscyB3cmFwX25vcm1hbCc7XHJcbmNvbnN0IFJFRkVSRU5DRV9DT0xVTU5fQ0xBU1MgPSAnZGV0YWlscyc7XHJcbmNvbnN0IERFQklUX0NPTFVNTl9DTEFTUyA9ICdkZWJpdCc7XHJcbmNvbnN0IENSRURJVF9DT0xVTU5fQ0xBU1MgPSAnY3JlZGl0JztcclxuY29uc3QgRVJST1JfTUVTU0FHRV9DTEFTUyA9ICdOT19EQVRBJztcclxuY29uc3QgQUNDT1VOVFNfTlVNQkVSID0gJ2Rpdi5maWJpX2FjY291bnQgc3Bhbi5hY2NfbnVtJztcclxuY29uc3QgQ0xPU0VfU0VBUkNIX0JZX0RBVEVTX0JVVFRPTl9DTEFTUyA9ICd1aS1kYXRlcGlja2VyLWNsb3NlJztcclxuY29uc3QgU0hPV19TRUFSQ0hfQllfREFURVNfQlVUVE9OX1ZBTFVFID0gJ9eU16bXkic7XHJcbmNvbnN0IENPTVBMRVRFRF9UUkFOU0FDVElPTlNfVEFCTEUgPSAndGFibGUjZGF0YVRhYmxlMDc3JztcclxuY29uc3QgUEVORElOR19UUkFOU0FDVElPTlNfVEFCTEUgPSAndGFibGUjZGF0YVRhYmxlMDIzJztcclxuY29uc3QgTkVYVF9QQUdFX0xJTksgPSAnYSNOcGFnZS5wYWdpbmcnO1xyXG5jb25zdCBDVVJSRU5UX0JBTEFOQ0UgPSAnLm1haW5fYmFsYW5jZSc7XHJcbmNvbnN0IElGUkFNRV9OQU1FID0gJ2lmcmFtZS1vbGQtcGFnZXMnO1xyXG5jb25zdCBFTEVNRU5UX1JFTkRFUl9USU1FT1VUX01TID0gMTAwMDA7XHJcblxyXG50eXBlIFRyYW5zYWN0aW9uc0NvbHNUeXBlcyA9IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XHJcbnR5cGUgVHJhbnNhY3Rpb25zVHJUZHMgPSBzdHJpbmdbXTtcclxudHlwZSBUcmFuc2FjdGlvbnNUciA9IHsgaW5uZXJUZHM6IFRyYW5zYWN0aW9uc1RyVGRzIH07XHJcblxyXG5pbnRlcmZhY2UgU2NyYXBlZFRyYW5zYWN0aW9uIHtcclxuICByZWZlcmVuY2U6IHN0cmluZztcclxuICBkYXRlOiBzdHJpbmc7XHJcbiAgY3JlZGl0OiBzdHJpbmc7XHJcbiAgZGViaXQ6IHN0cmluZztcclxuICBtZW1vPzogc3RyaW5nO1xyXG4gIGRlc2NyaXB0aW9uOiBzdHJpbmc7XHJcbiAgc3RhdHVzOiBUcmFuc2FjdGlvblN0YXR1c2VzO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZ2V0UG9zc2libGVMb2dpblJlc3VsdHMoKTogUG9zc2libGVMb2dpblJlc3VsdHMge1xyXG4gIGNvbnN0IHVybHM6IFBvc3NpYmxlTG9naW5SZXN1bHRzID0ge307XHJcbiAgdXJsc1tMb2dpblJlc3VsdHMuU3VjY2Vzc10gPSBbXHJcbiAgICAvZmliaS4qYWNjb3VudFN1bW1hcnkvLCAvLyBOZXcgVUkgcGF0dGVyblxyXG4gICAgL1Jlc291cmNlc1xcL1BvcnRhbE5HXFwvc2hlbGwvLCAvLyBOZXcgVUkgcGF0dGVyblxyXG4gICAgL0ZpYmlNZW51XFwvT25saW5lLywgLy8gT2xkIFVJIHBhdHRlcm5cclxuICBdO1xyXG4gIHVybHNbTG9naW5SZXN1bHRzLkludmFsaWRQYXNzd29yZF0gPSBbL0ZpYmlNZW51XFwvTWFya2V0aW5nXFwvUHJpdmF0ZVxcL0hvbWUvXTtcclxuICByZXR1cm4gdXJscztcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUxvZ2luRmllbGRzKGNyZWRlbnRpYWxzOiBTY3JhcGVyU3BlY2lmaWNDcmVkZW50aWFscykge1xyXG4gIHJldHVybiBbXHJcbiAgICB7IHNlbGVjdG9yOiAnI3VzZXJuYW1lJywgdmFsdWU6IGNyZWRlbnRpYWxzLnVzZXJuYW1lIH0sXHJcbiAgICB7IHNlbGVjdG9yOiAnI3Bhc3N3b3JkJywgdmFsdWU6IGNyZWRlbnRpYWxzLnBhc3N3b3JkIH0sXHJcbiAgXTtcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0QW1vdW50RGF0YShhbW91bnRTdHI6IHN0cmluZykge1xyXG4gIGxldCBhbW91bnRTdHJDb3B5ID0gYW1vdW50U3RyLnJlcGxhY2UoU0hFS0VMX0NVUlJFTkNZX1NZTUJPTCwgJycpO1xyXG4gIGFtb3VudFN0ckNvcHkgPSBhbW91bnRTdHJDb3B5LnJlcGxhY2VBbGwoJywnLCAnJyk7XHJcbiAgcmV0dXJuIHBhcnNlRmxvYXQoYW1vdW50U3RyQ29weSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdldFR4bkFtb3VudCh0eG46IFNjcmFwZWRUcmFuc2FjdGlvbikge1xyXG4gIGNvbnN0IGNyZWRpdCA9IGdldEFtb3VudERhdGEodHhuLmNyZWRpdCk7XHJcbiAgY29uc3QgZGViaXQgPSBnZXRBbW91bnREYXRhKHR4bi5kZWJpdCk7XHJcbiAgcmV0dXJuIChOdW1iZXIuaXNOYU4oY3JlZGl0KSA/IDAgOiBjcmVkaXQpIC0gKE51bWJlci5pc05hTihkZWJpdCkgPyAwIDogZGViaXQpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjb252ZXJ0VHJhbnNhY3Rpb25zKHR4bnM6IFNjcmFwZWRUcmFuc2FjdGlvbltdKTogVHJhbnNhY3Rpb25bXSB7XHJcbiAgcmV0dXJuIHR4bnMubWFwKCh0eG4pOiBUcmFuc2FjdGlvbiA9PiB7XHJcbiAgICBjb25zdCBjb252ZXJ0ZWREYXRlID0gbW9tZW50KHR4bi5kYXRlLCBEQVRFX0ZPUk1BVCkudG9JU09TdHJpbmcoKTtcclxuICAgIGNvbnN0IGNvbnZlcnRlZEFtb3VudCA9IGdldFR4bkFtb3VudCh0eG4pO1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgdHlwZTogVHJhbnNhY3Rpb25UeXBlcy5Ob3JtYWwsXHJcbiAgICAgIGlkZW50aWZpZXI6IHR4bi5yZWZlcmVuY2UgPyBwYXJzZUludCh0eG4ucmVmZXJlbmNlLCAxMCkgOiB1bmRlZmluZWQsXHJcbiAgICAgIGRhdGU6IGNvbnZlcnRlZERhdGUsXHJcbiAgICAgIHByb2Nlc3NlZERhdGU6IGNvbnZlcnRlZERhdGUsXHJcbiAgICAgIG9yaWdpbmFsQW1vdW50OiBjb252ZXJ0ZWRBbW91bnQsXHJcbiAgICAgIG9yaWdpbmFsQ3VycmVuY3k6IFNIRUtFTF9DVVJSRU5DWSxcclxuICAgICAgY2hhcmdlZEFtb3VudDogY29udmVydGVkQW1vdW50LFxyXG4gICAgICBzdGF0dXM6IHR4bi5zdGF0dXMsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiB0eG4uZGVzY3JpcHRpb24sXHJcbiAgICAgIG1lbW86IHR4bi5tZW1vLFxyXG4gICAgfTtcclxuICB9KTtcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0VHJhbnNhY3Rpb25EYXRlKFxyXG4gIHRkczogVHJhbnNhY3Rpb25zVHJUZHMsXHJcbiAgdHJhbnNhY3Rpb25UeXBlOiBzdHJpbmcsXHJcbiAgdHJhbnNhY3Rpb25zQ29sc1R5cGVzOiBUcmFuc2FjdGlvbnNDb2xzVHlwZXMsXHJcbikge1xyXG4gIGlmICh0cmFuc2FjdGlvblR5cGUgPT09ICdjb21wbGV0ZWQnKSB7XHJcbiAgICByZXR1cm4gKHRkc1t0cmFuc2FjdGlvbnNDb2xzVHlwZXNbREFURV9DT0xVTU5fQ0xBU1NfQ09NUExFVEVEXV0gfHwgJycpLnRyaW0oKTtcclxuICB9XHJcbiAgcmV0dXJuICh0ZHNbdHJhbnNhY3Rpb25zQ29sc1R5cGVzW0RBVEVfQ09MVU1OX0NMQVNTX1BFTkRJTkddXSB8fCAnJykudHJpbSgpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBnZXRUcmFuc2FjdGlvbkRlc2NyaXB0aW9uKFxyXG4gIHRkczogVHJhbnNhY3Rpb25zVHJUZHMsXHJcbiAgdHJhbnNhY3Rpb25UeXBlOiBzdHJpbmcsXHJcbiAgdHJhbnNhY3Rpb25zQ29sc1R5cGVzOiBUcmFuc2FjdGlvbnNDb2xzVHlwZXMsXHJcbikge1xyXG4gIGlmICh0cmFuc2FjdGlvblR5cGUgPT09ICdjb21wbGV0ZWQnKSB7XHJcbiAgICByZXR1cm4gKHRkc1t0cmFuc2FjdGlvbnNDb2xzVHlwZXNbREVTQ1JJUFRJT05fQ09MVU1OX0NMQVNTX0NPTVBMRVRFRF1dIHx8ICcnKS50cmltKCk7XHJcbiAgfVxyXG4gIHJldHVybiAodGRzW3RyYW5zYWN0aW9uc0NvbHNUeXBlc1tERVNDUklQVElPTl9DT0xVTU5fQ0xBU1NfUEVORElOR11dIHx8ICcnKS50cmltKCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdldFRyYW5zYWN0aW9uUmVmZXJlbmNlKHRkczogVHJhbnNhY3Rpb25zVHJUZHMsIHRyYW5zYWN0aW9uc0NvbHNUeXBlczogVHJhbnNhY3Rpb25zQ29sc1R5cGVzKSB7XHJcbiAgcmV0dXJuICh0ZHNbdHJhbnNhY3Rpb25zQ29sc1R5cGVzW1JFRkVSRU5DRV9DT0xVTU5fQ0xBU1NdXSB8fCAnJykudHJpbSgpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBnZXRUcmFuc2FjdGlvbkRlYml0KHRkczogVHJhbnNhY3Rpb25zVHJUZHMsIHRyYW5zYWN0aW9uc0NvbHNUeXBlczogVHJhbnNhY3Rpb25zQ29sc1R5cGVzKSB7XHJcbiAgcmV0dXJuICh0ZHNbdHJhbnNhY3Rpb25zQ29sc1R5cGVzW0RFQklUX0NPTFVNTl9DTEFTU11dIHx8ICcnKS50cmltKCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdldFRyYW5zYWN0aW9uQ3JlZGl0KHRkczogVHJhbnNhY3Rpb25zVHJUZHMsIHRyYW5zYWN0aW9uc0NvbHNUeXBlczogVHJhbnNhY3Rpb25zQ29sc1R5cGVzKSB7XHJcbiAgcmV0dXJuICh0ZHNbdHJhbnNhY3Rpb25zQ29sc1R5cGVzW0NSRURJVF9DT0xVTU5fQ0xBU1NdXSB8fCAnJykudHJpbSgpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBleHRyYWN0VHJhbnNhY3Rpb25EZXRhaWxzKFxyXG4gIHR4blJvdzogVHJhbnNhY3Rpb25zVHIsXHJcbiAgdHJhbnNhY3Rpb25TdGF0dXM6IFRyYW5zYWN0aW9uU3RhdHVzZXMsXHJcbiAgdHJhbnNhY3Rpb25zQ29sc1R5cGVzOiBUcmFuc2FjdGlvbnNDb2xzVHlwZXMsXHJcbik6IFNjcmFwZWRUcmFuc2FjdGlvbiB7XHJcbiAgY29uc3QgdGRzID0gdHhuUm93LmlubmVyVGRzO1xyXG4gIGNvbnN0IGl0ZW0gPSB7XHJcbiAgICBzdGF0dXM6IHRyYW5zYWN0aW9uU3RhdHVzLFxyXG4gICAgZGF0ZTogZ2V0VHJhbnNhY3Rpb25EYXRlKHRkcywgdHJhbnNhY3Rpb25TdGF0dXMsIHRyYW5zYWN0aW9uc0NvbHNUeXBlcyksXHJcbiAgICBkZXNjcmlwdGlvbjogZ2V0VHJhbnNhY3Rpb25EZXNjcmlwdGlvbih0ZHMsIHRyYW5zYWN0aW9uU3RhdHVzLCB0cmFuc2FjdGlvbnNDb2xzVHlwZXMpLFxyXG4gICAgcmVmZXJlbmNlOiBnZXRUcmFuc2FjdGlvblJlZmVyZW5jZSh0ZHMsIHRyYW5zYWN0aW9uc0NvbHNUeXBlcyksXHJcbiAgICBkZWJpdDogZ2V0VHJhbnNhY3Rpb25EZWJpdCh0ZHMsIHRyYW5zYWN0aW9uc0NvbHNUeXBlcyksXHJcbiAgICBjcmVkaXQ6IGdldFRyYW5zYWN0aW9uQ3JlZGl0KHRkcywgdHJhbnNhY3Rpb25zQ29sc1R5cGVzKSxcclxuICB9O1xyXG5cclxuICByZXR1cm4gaXRlbTtcclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gZ2V0VHJhbnNhY3Rpb25zQ29sc1R5cGVDbGFzc2VzKFxyXG4gIHBhZ2U6IFBhZ2UgfCBGcmFtZSxcclxuICB0YWJsZUxvY2F0b3I6IHN0cmluZyxcclxuKTogUHJvbWlzZTxUcmFuc2FjdGlvbnNDb2xzVHlwZXM+IHtcclxuICBjb25zdCByZXN1bHQ6IFRyYW5zYWN0aW9uc0NvbHNUeXBlcyA9IHt9O1xyXG4gIGNvbnN0IHR5cGVDbGFzc2VzT2JqcyA9IGF3YWl0IHBhZ2VFdmFsQWxsKHBhZ2UsIGAke3RhYmxlTG9jYXRvcn0gdGJvZHkgdHI6Zmlyc3Qtb2YtdHlwZSB0ZGAsIG51bGwsIHRkcyA9PiB7XHJcbiAgICByZXR1cm4gdGRzLm1hcCgodGQsIGluZGV4KSA9PiAoe1xyXG4gICAgICBjb2xDbGFzczogdGQuZ2V0QXR0cmlidXRlKCdjbGFzcycpLFxyXG4gICAgICBpbmRleCxcclxuICAgIH0pKTtcclxuICB9KTtcclxuXHJcbiAgZm9yIChjb25zdCB0eXBlQ2xhc3NPYmogb2YgdHlwZUNsYXNzZXNPYmpzKSB7XHJcbiAgICBpZiAodHlwZUNsYXNzT2JqLmNvbENsYXNzKSB7XHJcbiAgICAgIHJlc3VsdFt0eXBlQ2xhc3NPYmouY29sQ2xhc3NdID0gdHlwZUNsYXNzT2JqLmluZGV4O1xyXG4gICAgfVxyXG4gIH1cclxuICByZXR1cm4gcmVzdWx0O1xyXG59XHJcblxyXG5mdW5jdGlvbiBleHRyYWN0VHJhbnNhY3Rpb24oXHJcbiAgdHhuczogU2NyYXBlZFRyYW5zYWN0aW9uW10sXHJcbiAgdHJhbnNhY3Rpb25TdGF0dXM6IFRyYW5zYWN0aW9uU3RhdHVzZXMsXHJcbiAgdHhuUm93OiBUcmFuc2FjdGlvbnNUcixcclxuICB0cmFuc2FjdGlvbnNDb2xzVHlwZXM6IFRyYW5zYWN0aW9uc0NvbHNUeXBlcyxcclxuKSB7XHJcbiAgY29uc3QgdHhuID0gZXh0cmFjdFRyYW5zYWN0aW9uRGV0YWlscyh0eG5Sb3csIHRyYW5zYWN0aW9uU3RhdHVzLCB0cmFuc2FjdGlvbnNDb2xzVHlwZXMpO1xyXG4gIGlmICh0eG4uZGF0ZSAhPT0gJycpIHtcclxuICAgIHR4bnMucHVzaCh0eG4pO1xyXG4gIH1cclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gZXh0cmFjdFRyYW5zYWN0aW9ucyhwYWdlOiBQYWdlIHwgRnJhbWUsIHRhYmxlTG9jYXRvcjogc3RyaW5nLCB0cmFuc2FjdGlvblN0YXR1czogVHJhbnNhY3Rpb25TdGF0dXNlcykge1xyXG4gIGNvbnN0IHR4bnM6IFNjcmFwZWRUcmFuc2FjdGlvbltdID0gW107XHJcbiAgY29uc3QgdHJhbnNhY3Rpb25zQ29sc1R5cGVzID0gYXdhaXQgZ2V0VHJhbnNhY3Rpb25zQ29sc1R5cGVDbGFzc2VzKHBhZ2UsIHRhYmxlTG9jYXRvcik7XHJcblxyXG4gIGNvbnN0IHRyYW5zYWN0aW9uc1Jvd3MgPSBhd2FpdCBwYWdlRXZhbEFsbDxUcmFuc2FjdGlvbnNUcltdPihwYWdlLCBgJHt0YWJsZUxvY2F0b3J9IHRib2R5IHRyYCwgW10sIHRycyA9PiB7XHJcbiAgICByZXR1cm4gdHJzLm1hcCh0ciA9PiAoe1xyXG4gICAgICBpbm5lclRkczogQXJyYXkuZnJvbSh0ci5nZXRFbGVtZW50c0J5VGFnTmFtZSgndGQnKSkubWFwKHRkID0+IHRkLmlubmVyVGV4dCksXHJcbiAgICB9KSk7XHJcbiAgfSk7XHJcblxyXG4gIGZvciAoY29uc3QgdHhuUm93IG9mIHRyYW5zYWN0aW9uc1Jvd3MpIHtcclxuICAgIGV4dHJhY3RUcmFuc2FjdGlvbih0eG5zLCB0cmFuc2FjdGlvblN0YXR1cywgdHhuUm93LCB0cmFuc2FjdGlvbnNDb2xzVHlwZXMpO1xyXG4gIH1cclxuICByZXR1cm4gdHhucztcclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gaXNOb1RyYW5zYWN0aW9uSW5EYXRlUmFuZ2VFcnJvcihwYWdlOiBQYWdlIHwgRnJhbWUpIHtcclxuICBjb25zdCBoYXNFcnJvckluZm9FbGVtZW50ID0gYXdhaXQgZWxlbWVudFByZXNlbnRPblBhZ2UocGFnZSwgYC4ke0VSUk9SX01FU1NBR0VfQ0xBU1N9YCk7XHJcbiAgaWYgKGhhc0Vycm9ySW5mb0VsZW1lbnQpIHtcclxuICAgIGNvbnN0IGVycm9yVGV4dCA9IGF3YWl0IHBhZ2UuJGV2YWwoYC4ke0VSUk9SX01FU1NBR0VfQ0xBU1N9YCwgZXJyb3JFbGVtZW50ID0+IHtcclxuICAgICAgcmV0dXJuIChlcnJvckVsZW1lbnQgYXMgSFRNTEVsZW1lbnQpLmlubmVyVGV4dDtcclxuICAgIH0pO1xyXG4gICAgcmV0dXJuIGVycm9yVGV4dC50cmltKCkgPT09IE5PX1RSQU5TQUNUSU9OX0lOX0RBVEVfUkFOR0VfVEVYVDtcclxuICB9XHJcbiAgcmV0dXJuIGZhbHNlO1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBzZWFyY2hCeURhdGVzKHBhZ2U6IFBhZ2UgfCBGcmFtZSwgc3RhcnREYXRlOiBNb21lbnQpIHtcclxuICBhd2FpdCBjbGlja0J1dHRvbihwYWdlLCAnYSN0YWJIZWFkZXI0Jyk7XHJcbiAgYXdhaXQgd2FpdFVudGlsRWxlbWVudEZvdW5kKHBhZ2UsICdkaXYjZmliaV9kYXRlcycpO1xyXG4gIGF3YWl0IGZpbGxJbnB1dChwYWdlLCAnaW5wdXQjZnJvbURhdGUnLCBzdGFydERhdGUuZm9ybWF0KERBVEVfRk9STUFUKSk7XHJcbiAgYXdhaXQgY2xpY2tCdXR0b24ocGFnZSwgYGJ1dHRvbltjbGFzcyo9JHtDTE9TRV9TRUFSQ0hfQllfREFURVNfQlVUVE9OX0NMQVNTfV1gKTtcclxuICBhd2FpdCBjbGlja0J1dHRvbihwYWdlLCBgaW5wdXRbdmFsdWU9JHtTSE9XX1NFQVJDSF9CWV9EQVRFU19CVVRUT05fVkFMVUV9XWApO1xyXG4gIGF3YWl0IHdhaXRGb3JOYXZpZ2F0aW9uKHBhZ2UpO1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBnZXRBY2NvdW50TnVtYmVyKHBhZ2U6IFBhZ2UgfCBGcmFtZSk6IFByb21pc2U8c3RyaW5nPiB7XHJcbiAgLy8gV2FpdCB1bnRpbCB0aGUgYWNjb3VudCBudW1iZXIgZWxlbWVudCBpcyBwcmVzZW50IGluIHRoZSBET01cclxuICBhd2FpdCB3YWl0VW50aWxFbGVtZW50Rm91bmQocGFnZSwgQUNDT1VOVFNfTlVNQkVSLCB0cnVlLCBFTEVNRU5UX1JFTkRFUl9USU1FT1VUX01TKTtcclxuXHJcbiAgY29uc3Qgc2VsZWN0ZWRTbmlmQWNjb3VudCA9IGF3YWl0IHBhZ2UuJGV2YWwoQUNDT1VOVFNfTlVNQkVSLCBvcHRpb24gPT4ge1xyXG4gICAgcmV0dXJuIChvcHRpb24gYXMgSFRNTEVsZW1lbnQpLmlubmVyVGV4dDtcclxuICB9KTtcclxuXHJcbiAgcmV0dXJuIHNlbGVjdGVkU25pZkFjY291bnQucmVwbGFjZSgnLycsICdfJykudHJpbSgpO1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBjaGVja0lmSGFzTmV4dFBhZ2UocGFnZTogUGFnZSB8IEZyYW1lKSB7XHJcbiAgcmV0dXJuIGVsZW1lbnRQcmVzZW50T25QYWdlKHBhZ2UsIE5FWFRfUEFHRV9MSU5LKTtcclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gbmF2aWdhdGVUb05leHRQYWdlKHBhZ2U6IFBhZ2UgfCBGcmFtZSkge1xyXG4gIGF3YWl0IGNsaWNrQnV0dG9uKHBhZ2UsIE5FWFRfUEFHRV9MSU5LKTtcclxuICBhd2FpdCB3YWl0Rm9yTmF2aWdhdGlvbihwYWdlKTtcclxufVxyXG5cclxuLyogQ291bGRuJ3QgcmVwcm9kdWNlIHNjZW5hcmlvIHdpdGggbXVsdGlwbGUgcGFnZXMgb2YgcGVuZGluZyB0cmFuc2FjdGlvbnMgLSBTaG91bGQgc3VwcG9ydCBpZiBleGlzdHMgc3VjaCBjYXNlLlxyXG4gICBuZWVkVG9QYWdpbmF0ZSBpcyBmYWxzZSBpZiBzY3JhcGluZyBwZW5kaW5nIHRyYW5zYWN0aW9ucyAqL1xyXG5hc3luYyBmdW5jdGlvbiBzY3JhcGVUcmFuc2FjdGlvbnMoXHJcbiAgcGFnZTogUGFnZSB8IEZyYW1lLFxyXG4gIHRhYmxlTG9jYXRvcjogc3RyaW5nLFxyXG4gIHRyYW5zYWN0aW9uU3RhdHVzOiBUcmFuc2FjdGlvblN0YXR1c2VzLFxyXG4gIG5lZWRUb1BhZ2luYXRlOiBib29sZWFuLFxyXG4pIHtcclxuICBjb25zdCB0eG5zID0gW107XHJcbiAgbGV0IGhhc05leHRQYWdlID0gZmFsc2U7XHJcblxyXG4gIGRvIHtcclxuICAgIGNvbnN0IGN1cnJlbnRQYWdlVHhucyA9IGF3YWl0IGV4dHJhY3RUcmFuc2FjdGlvbnMocGFnZSwgdGFibGVMb2NhdG9yLCB0cmFuc2FjdGlvblN0YXR1cyk7XHJcbiAgICB0eG5zLnB1c2goLi4uY3VycmVudFBhZ2VUeG5zKTtcclxuICAgIGlmIChuZWVkVG9QYWdpbmF0ZSkge1xyXG4gICAgICBoYXNOZXh0UGFnZSA9IGF3YWl0IGNoZWNrSWZIYXNOZXh0UGFnZShwYWdlKTtcclxuICAgICAgaWYgKGhhc05leHRQYWdlKSB7XHJcbiAgICAgICAgYXdhaXQgbmF2aWdhdGVUb05leHRQYWdlKHBhZ2UpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfSB3aGlsZSAoaGFzTmV4dFBhZ2UpO1xyXG5cclxuICByZXR1cm4gY29udmVydFRyYW5zYWN0aW9ucyh0eG5zKTtcclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gZ2V0QWNjb3VudFRyYW5zYWN0aW9ucyhwYWdlOiBQYWdlIHwgRnJhbWUpIHtcclxuICBhd2FpdCBQcm9taXNlLnJhY2UoW1xyXG4gICAgd2FpdFVudGlsRWxlbWVudEZvdW5kKHBhZ2UsIFwiZGl2W2lkKj0nZGl2VGFibGUnXVwiLCBmYWxzZSksXHJcbiAgICB3YWl0VW50aWxFbGVtZW50Rm91bmQocGFnZSwgYC4ke0VSUk9SX01FU1NBR0VfQ0xBU1N9YCwgZmFsc2UpLFxyXG4gIF0pO1xyXG5cclxuICBjb25zdCBub1RyYW5zYWN0aW9uSW5SYW5nZUVycm9yID0gYXdhaXQgaXNOb1RyYW5zYWN0aW9uSW5EYXRlUmFuZ2VFcnJvcihwYWdlKTtcclxuICBpZiAobm9UcmFuc2FjdGlvbkluUmFuZ2VFcnJvcikge1xyXG4gICAgcmV0dXJuIFtdO1xyXG4gIH1cclxuXHJcbiAgY29uc3QgcGVuZGluZ1R4bnMgPSBhd2FpdCBzY3JhcGVUcmFuc2FjdGlvbnMocGFnZSwgUEVORElOR19UUkFOU0FDVElPTlNfVEFCTEUsIFRyYW5zYWN0aW9uU3RhdHVzZXMuUGVuZGluZywgZmFsc2UpO1xyXG4gIGNvbnN0IGNvbXBsZXRlZFR4bnMgPSBhd2FpdCBzY3JhcGVUcmFuc2FjdGlvbnMoXHJcbiAgICBwYWdlLFxyXG4gICAgQ09NUExFVEVEX1RSQU5TQUNUSU9OU19UQUJMRSxcclxuICAgIFRyYW5zYWN0aW9uU3RhdHVzZXMuQ29tcGxldGVkLFxyXG4gICAgdHJ1ZSxcclxuICApO1xyXG4gIGNvbnN0IHR4bnMgPSBbLi4ucGVuZGluZ1R4bnMsIC4uLmNvbXBsZXRlZFR4bnNdO1xyXG4gIHJldHVybiB0eG5zO1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBnZXRDdXJyZW50QmFsYW5jZShwYWdlOiBQYWdlIHwgRnJhbWUpOiBQcm9taXNlPG51bWJlcj4ge1xyXG4gIC8vIFdhaXQgZm9yIHRoZSBiYWxhbmNlIGVsZW1lbnQgdG8gYXBwZWFyIGFuZCBiZSB2aXNpYmxlXHJcbiAgYXdhaXQgd2FpdFVudGlsRWxlbWVudEZvdW5kKHBhZ2UsIENVUlJFTlRfQkFMQU5DRSwgdHJ1ZSwgRUxFTUVOVF9SRU5ERVJfVElNRU9VVF9NUyk7XHJcblxyXG4gIC8vIEV4dHJhY3QgdGV4dCBjb250ZW50XHJcbiAgY29uc3QgYmFsYW5jZVN0ciA9IGF3YWl0IHBhZ2UuJGV2YWwoQ1VSUkVOVF9CQUxBTkNFLCBlbCA9PiB7XHJcbiAgICByZXR1cm4gKGVsIGFzIEhUTUxFbGVtZW50KS5pbm5lclRleHQ7XHJcbiAgfSk7XHJcblxyXG4gIHJldHVybiBnZXRBbW91bnREYXRhKGJhbGFuY2VTdHIpO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gd2FpdEZvclBvc3RMb2dpbihwYWdlOiBQYWdlKSB7XHJcbiAgcmV0dXJuIFByb21pc2UucmFjZShbXHJcbiAgICB3YWl0VW50aWxFbGVtZW50Rm91bmQocGFnZSwgJyNjYXJkLWhlYWRlcicsIGZhbHNlKSwgLy8gTmV3IFVJXHJcbiAgICB3YWl0VW50aWxFbGVtZW50Rm91bmQocGFnZSwgJyNhY2NvdW50X251bScsIHRydWUpLCAvLyBOZXcgVUlcclxuICAgIHdhaXRVbnRpbEVsZW1lbnRGb3VuZChwYWdlLCAnI21hdGFmTG9nb3V0TGluaycsIHRydWUpLCAvLyBPbGQgVUlcclxuICAgIHdhaXRVbnRpbEVsZW1lbnRGb3VuZChwYWdlLCAnI3ZhbGlkYXRpb25Nc2cnLCB0cnVlKSwgLy8gT2xkIFVJXHJcbiAgXSk7XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGZldGNoQWNjb3VudERhdGEocGFnZTogUGFnZSB8IEZyYW1lLCBzdGFydERhdGU6IE1vbWVudCkge1xyXG4gIGNvbnN0IGFjY291bnROdW1iZXIgPSBhd2FpdCBnZXRBY2NvdW50TnVtYmVyKHBhZ2UpO1xyXG4gIGNvbnN0IGJhbGFuY2UgPSBhd2FpdCBnZXRDdXJyZW50QmFsYW5jZShwYWdlKTtcclxuICBhd2FpdCBzZWFyY2hCeURhdGVzKHBhZ2UsIHN0YXJ0RGF0ZSk7XHJcbiAgY29uc3QgdHhucyA9IGF3YWl0IGdldEFjY291bnRUcmFuc2FjdGlvbnMocGFnZSk7XHJcblxyXG4gIHJldHVybiB7XHJcbiAgICBhY2NvdW50TnVtYmVyLFxyXG4gICAgdHhucyxcclxuICAgIGJhbGFuY2UsXHJcbiAgfTtcclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gZ2V0QWNjb3VudElkc09sZFVJKHBhZ2U6IFBhZ2UpOiBQcm9taXNlPHN0cmluZ1tdPiB7XHJcbiAgcmV0dXJuIHBhZ2UuZXZhbHVhdGUoKCkgPT4ge1xyXG4gICAgY29uc3Qgc2VsZWN0RWxlbWVudCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhY2NvdW50X251bV9zZWxlY3QnKTtcclxuICAgIGNvbnN0IG9wdGlvbnMgPSBzZWxlY3RFbGVtZW50ID8gc2VsZWN0RWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKCdvcHRpb24nKSA6IFtdO1xyXG4gICAgaWYgKCFvcHRpb25zKSByZXR1cm4gW107XHJcbiAgICByZXR1cm4gQXJyYXkuZnJvbShvcHRpb25zLCBvcHRpb24gPT4gb3B0aW9uLnZhbHVlKTtcclxuICB9KTtcclxufVxyXG5cclxuLyoqXHJcbiAqIEVuc3VyZXMgdGhlIGFjY291bnQgZHJvcGRvd24gaXMgb3BlbiwgdGhlbiByZXR1cm5zIHRoZSBhdmFpbGFibGUgYWNjb3VudCBsYWJlbHMuXHJcbiAqXHJcbiAqIFRoaXMgbWV0aG9kOlxyXG4gKiAtIENoZWNrcyBpZiB0aGUgZHJvcGRvd24gaXMgYWxyZWFkeSBvcGVuLlxyXG4gKiAtIElmIG5vdCBvcGVuLCBjbGlja3MgdGhlIGFjY291bnQgc2VsZWN0b3IgdG8gb3BlbiBpdC5cclxuICogLSBXYWl0cyBmb3IgdGhlIGRyb3Bkb3duIHRvIHJlbmRlci5cclxuICogLSBFeHRyYWN0cyBhbmQgcmV0dXJucyB0aGUgbGlzdCBvZiBhdmFpbGFibGUgYWNjb3VudCBsYWJlbHMuXHJcbiAqXHJcbiAqIEdyYWNlZnVsIGhhbmRsaW5nOlxyXG4gKiAtIElmIGFueSBlcnJvciBvY2N1cnMgKGUuZy4sIHNlbGVjdG9ycyBub3QgZm91bmQsIHRpbWluZyBpc3N1ZXMsIFVJIHZlcnNpb24gY2hhbmdlcyksXHJcbiAqICAgdGhlIGZ1bmN0aW9uIHJldHVybnMgYW4gZW1wdHkgbGlzdC5cclxuICpcclxuICogQHBhcmFtIHBhZ2UgUHVwcGV0ZWVyIFBhZ2Ugb2JqZWN0LlxyXG4gKiBAcmV0dXJucyBBbiBhcnJheSBvZiBhdmFpbGFibGUgYWNjb3VudCBsYWJlbHMgKGUuZy4sIFtcIjEyNyB8IFhYWFgxXCIsIFwiMTI3IHwgWFhYWDJcIl0pLFxyXG4gKiAgICAgICAgICBvciBhbiBlbXB0eSBhcnJheSBpZiBzb21ldGhpbmcgZ29lcyB3cm9uZy5cclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjbGlja0FjY291bnRTZWxlY3RvckdldEFjY291bnRJZHMocGFnZTogUGFnZSk6IFByb21pc2U8c3RyaW5nW10+IHtcclxuICB0cnkge1xyXG4gICAgY29uc3QgYWNjb3VudFNlbGVjdG9yID0gJ2Rpdi5jdXJyZW50LWFjY291bnQnOyAvLyBEaXJlY3Qgc2VsZWN0b3IgdG8gY2xpY2thYmxlIGVsZW1lbnRcclxuICAgIGNvbnN0IGRyb3Bkb3duUGFuZWxTZWxlY3RvciA9ICdkaXYubWF0LW1kYy1hdXRvY29tcGxldGUtcGFuZWwuYWNjb3VudC1zZWxlY3QtZGQnOyAvLyBUaGUgZHJvcGRvd24gbGlzdCBib3hcclxuICAgIGNvbnN0IG9wdGlvblNlbGVjdG9yID0gJ21hdC1vcHRpb24gLm1kYy1saXN0LWl0ZW1fX3ByaW1hcnktdGV4dCc7IC8vIEFjY291bnQgb3B0aW9uIGxhYmVsc1xyXG5cclxuICAgIC8vIENoZWNrIGlmIGRyb3Bkb3duIGlzIGFscmVhZHkgb3BlblxyXG4gICAgY29uc3QgZHJvcGRvd25WaXNpYmxlID0gYXdhaXQgcGFnZVxyXG4gICAgICAuJGV2YWwoZHJvcGRvd25QYW5lbFNlbGVjdG9yLCBlbCA9PiB7XHJcbiAgICAgICAgcmV0dXJuIGVsICYmIHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKGVsKS5kaXNwbGF5ICE9PSAnbm9uZScgJiYgZWwub2Zmc2V0UGFyZW50ICE9PSBudWxsO1xyXG4gICAgICB9KVxyXG4gICAgICAuY2F0Y2goKCkgPT4gZmFsc2UpOyAvLyBjYXRjaCBpZiBkcm9wZG93biBpcyBub3QgaW4gdGhlIERPTSB5ZXRcclxuXHJcbiAgICBpZiAoIWRyb3Bkb3duVmlzaWJsZSkge1xyXG4gICAgICBhd2FpdCB3YWl0VW50aWxFbGVtZW50Rm91bmQocGFnZSwgYWNjb3VudFNlbGVjdG9yLCB0cnVlLCBFTEVNRU5UX1JFTkRFUl9USU1FT1VUX01TKTtcclxuXHJcbiAgICAgIC8vIENsaWNrIHRoZSBhY2NvdW50IHNlbGVjdG9yIHRvIG9wZW4gdGhlIGRyb3Bkb3duXHJcbiAgICAgIGF3YWl0IGNsaWNrQnV0dG9uKHBhZ2UsIGFjY291bnRTZWxlY3Rvcik7XHJcblxyXG4gICAgICAvLyBXYWl0IGZvciB0aGUgZHJvcGRvd24gdG8gb3BlblxyXG4gICAgICBhd2FpdCB3YWl0VW50aWxFbGVtZW50Rm91bmQocGFnZSwgZHJvcGRvd25QYW5lbFNlbGVjdG9yLCB0cnVlLCBFTEVNRU5UX1JFTkRFUl9USU1FT1VUX01TKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBFeHRyYWN0IGFjY291bnQgbGFiZWxzIGZyb20gdGhlIGRyb3Bkb3duIG9wdGlvbnNcclxuICAgIGNvbnN0IGFjY291bnRMYWJlbHMgPSBhd2FpdCBwYWdlLiQkZXZhbChvcHRpb25TZWxlY3Rvciwgb3B0aW9ucyA9PiB7XHJcbiAgICAgIHJldHVybiBvcHRpb25zLm1hcChvcHRpb24gPT4gb3B0aW9uLnRleHRDb250ZW50Py50cmltKCkgfHwgJycpLmZpbHRlcihsYWJlbCA9PiBsYWJlbCAhPT0gJycpO1xyXG4gICAgfSk7XHJcblxyXG4gICAgcmV0dXJuIGFjY291bnRMYWJlbHM7XHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIHJldHVybiBbXTsgLy8gR3JhY2VmdWwgZmFsbGJhY2tcclxuICB9XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGdldEFjY291bnRJZHNCb3RoVUlzKHBhZ2U6IFBhZ2UpOiBQcm9taXNlPHN0cmluZ1tdPiB7XHJcbiAgbGV0IGFjY291bnRzSWRzOiBzdHJpbmdbXSA9IGF3YWl0IGNsaWNrQWNjb3VudFNlbGVjdG9yR2V0QWNjb3VudElkcyhwYWdlKTtcclxuICBpZiAoYWNjb3VudHNJZHMubGVuZ3RoID09PSAwKSB7XHJcbiAgICBhY2NvdW50c0lkcyA9IGF3YWl0IGdldEFjY291bnRJZHNPbGRVSShwYWdlKTtcclxuICB9XHJcbiAgcmV0dXJuIGFjY291bnRzSWRzO1xyXG59XHJcblxyXG4vKipcclxuICogU2VsZWN0cyBhbiBhY2NvdW50IGZyb20gdGhlIGRyb3Bkb3duIGJhc2VkIG9uIHRoZSBwcm92aWRlZCBhY2NvdW50IGxhYmVsLlxyXG4gKlxyXG4gKiBUaGlzIG1ldGhvZDpcclxuICogLSBDbGlja3MgdGhlIGFjY291bnQgc2VsZWN0b3IgYnV0dG9uIHRvIG9wZW4gdGhlIGRyb3Bkb3duLlxyXG4gKiAtIFJldHJpZXZlcyB0aGUgbGlzdCBvZiBhdmFpbGFibGUgYWNjb3VudCBsYWJlbHMuXHJcbiAqIC0gQ2hlY2tzIGlmIHRoZSBwcm92aWRlZCBhY2NvdW50IGxhYmVsIGV4aXN0cyBpbiB0aGUgbGlzdC5cclxuICogLSBGaW5kcyBhbmQgY2xpY2tzIHRoZSBtYXRjaGluZyBhY2NvdW50IG9wdGlvbiBpZiBmb3VuZC5cclxuICpcclxuICogQHBhcmFtIHBhZ2UgUHVwcGV0ZWVyIFBhZ2Ugb2JqZWN0LlxyXG4gKiBAcGFyYW0gYWNjb3VudExhYmVsIFRoZSB0ZXh0IG9mIHRoZSBhY2NvdW50IHRvIHNlbGVjdCAoZS5nLiwgXCIxMjcgfCBYWFhYWFwiKS5cclxuICogQHJldHVybnMgVHJ1ZSBpZiB0aGUgYWNjb3VudCBvcHRpb24gd2FzIGZvdW5kIGFuZCBjbGlja2VkOyBmYWxzZSBvdGhlcndpc2UuXHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2VsZWN0QWNjb3VudEZyb21Ecm9wZG93bihwYWdlOiBQYWdlLCBhY2NvdW50TGFiZWw6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xyXG4gIC8vIENhbGwgY2xpY2tBY2NvdW50U2VsZWN0b3IgdG8gZ2V0IHRoZSBhdmFpbGFibGUgYWNjb3VudHMgYW5kIG9wZW4gdGhlIGRyb3Bkb3duXHJcbiAgY29uc3QgYXZhaWxhYmxlQWNjb3VudHMgPSBhd2FpdCBjbGlja0FjY291bnRTZWxlY3RvckdldEFjY291bnRJZHMocGFnZSk7XHJcblxyXG4gIC8vIENoZWNrIGlmIHRoZSBhY2NvdW50IGxhYmVsIGV4aXN0cyBpbiB0aGUgYXZhaWxhYmxlIGFjY291bnRzXHJcbiAgaWYgKCFhdmFpbGFibGVBY2NvdW50cy5pbmNsdWRlcyhhY2NvdW50TGFiZWwpKSB7XHJcbiAgICByZXR1cm4gZmFsc2U7XHJcbiAgfVxyXG5cclxuICAvLyBXYWl0IGZvciB0aGUgZHJvcGRvd24gb3B0aW9ucyB0byBiZSByZW5kZXJlZFxyXG4gIGNvbnN0IG9wdGlvblNlbGVjdG9yID0gJ21hdC1vcHRpb24gLm1kYy1saXN0LWl0ZW1fX3ByaW1hcnktdGV4dCc7XHJcbiAgYXdhaXQgd2FpdFVudGlsRWxlbWVudEZvdW5kKHBhZ2UsIG9wdGlvblNlbGVjdG9yLCB0cnVlLCBFTEVNRU5UX1JFTkRFUl9USU1FT1VUX01TKTtcclxuXHJcbiAgLy8gUXVlcnkgYWxsIG1hdGNoaW5nIG9wdGlvbnNcclxuICBjb25zdCBhY2NvdW50T3B0aW9ucyA9IGF3YWl0IHBhZ2UuJCQob3B0aW9uU2VsZWN0b3IpO1xyXG5cclxuICAvLyBGaW5kIGFuZCBjbGljayB0aGUgb3B0aW9uIG1hdGNoaW5nIHRoZSBhY2NvdW50TGFiZWxcclxuICBmb3IgKGNvbnN0IG9wdGlvbiBvZiBhY2NvdW50T3B0aW9ucykge1xyXG4gICAgY29uc3QgdGV4dCA9IGF3YWl0IHBhZ2UuZXZhbHVhdGUoZWwgPT4gZWwudGV4dENvbnRlbnQ/LnRyaW0oKSwgb3B0aW9uKTtcclxuXHJcbiAgICBpZiAodGV4dCA9PT0gYWNjb3VudExhYmVsKSB7XHJcbiAgICAgIGNvbnN0IG9wdGlvbkhhbmRsZSA9IGF3YWl0IG9wdGlvbi5ldmFsdWF0ZUhhbmRsZShlbCA9PiBlbCBhcyBIVE1MRWxlbWVudCk7XHJcbiAgICAgIGF3YWl0IHBhZ2UuZXZhbHVhdGUoKGVsOiBIVE1MRWxlbWVudCkgPT4gZWwuY2xpY2soKSwgb3B0aW9uSGFuZGxlKTtcclxuICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICByZXR1cm4gZmFsc2U7XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGdldFRyYW5zYWN0aW9uc0ZyYW1lKHBhZ2U6IFBhZ2UpOiBQcm9taXNlPEZyYW1lIHwgbnVsbD4ge1xyXG4gIC8vIFRyeSBhIGZldyB0aW1lcyB0byBmaW5kIHRoZSBpZnJhbWUsIGFzIGl0IG1pZ2h0IG5vdCBiZSBpbW1lZGlhdGVseSBhdmFpbGFibGVcclxuICBmb3IgKGxldCBhdHRlbXB0ID0gMDsgYXR0ZW1wdCA8IDM7IGF0dGVtcHQrKykge1xyXG4gICAgYXdhaXQgc2xlZXAoMjAwMCk7XHJcbiAgICBjb25zdCBmcmFtZXMgPSBwYWdlLmZyYW1lcygpO1xyXG4gICAgY29uc3QgdGFyZ2V0RnJhbWUgPSBmcmFtZXMuZmluZChmID0+IGYubmFtZSgpID09PSBJRlJBTUVfTkFNRSk7XHJcblxyXG4gICAgaWYgKHRhcmdldEZyYW1lKSB7XHJcbiAgICAgIHJldHVybiB0YXJnZXRGcmFtZTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHJldHVybiBudWxsO1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBzZWxlY3RBY2NvdW50Qm90aFVJcyhwYWdlOiBQYWdlLCBhY2NvdW50SWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gIGNvbnN0IGFjY291bnRTZWxlY3RlZCA9IGF3YWl0IHNlbGVjdEFjY291bnRGcm9tRHJvcGRvd24ocGFnZSwgYWNjb3VudElkKTtcclxuICBpZiAoIWFjY291bnRTZWxlY3RlZCkge1xyXG4gICAgLy8gT2xkIFVJIGZvcm1hdFxyXG4gICAgYXdhaXQgcGFnZS5zZWxlY3QoJyNhY2NvdW50X251bV9zZWxlY3QnLCBhY2NvdW50SWQpO1xyXG4gICAgYXdhaXQgd2FpdFVudGlsRWxlbWVudEZvdW5kKHBhZ2UsICcjYWNjb3VudF9udW1fc2VsZWN0JywgdHJ1ZSk7XHJcbiAgfVxyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBmZXRjaEFjY291bnREYXRhQm90aFVJcyhwYWdlOiBQYWdlLCBzdGFydERhdGU6IE1vbWVudCkge1xyXG4gIC8vIFRyeSB0byBnZXQgdGhlIGlmcmFtZSBmb3IgdGhlIG5ldyBVSVxyXG4gIGNvbnN0IGZyYW1lID0gYXdhaXQgZ2V0VHJhbnNhY3Rpb25zRnJhbWUocGFnZSk7XHJcblxyXG4gIC8vIFVzZSB0aGUgZnJhbWUgaWYgYXZhaWxhYmxlIChuZXcgVUkpLCBvdGhlcndpc2UgdXNlIHRoZSBwYWdlIGRpcmVjdGx5IChvbGQgVUkpXHJcbiAgY29uc3QgdGFyZ2V0UGFnZSA9IGZyYW1lIHx8IHBhZ2U7XHJcbiAgcmV0dXJuIGZldGNoQWNjb3VudERhdGEodGFyZ2V0UGFnZSwgc3RhcnREYXRlKTtcclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gZmV0Y2hBY2NvdW50cyhwYWdlOiBQYWdlLCBzdGFydERhdGU6IE1vbWVudCk6IFByb21pc2U8VHJhbnNhY3Rpb25zQWNjb3VudFtdPiB7XHJcbiAgY29uc3QgYWNjb3VudHNJZHMgPSBhd2FpdCBnZXRBY2NvdW50SWRzQm90aFVJcyhwYWdlKTtcclxuXHJcbiAgaWYgKGFjY291bnRzSWRzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgLy8gSW4gY2FzZSBhY2NvdW50c0lkcyBjb3VsZCBubyBiZSBwYXJzZWQganVzdCByZXR1cm4gdGhlIHRyYW5zYWN0aW9ucyBvZiB0aGUgY3VycmVudGx5IHNlbGVjdGVkIGFjY291bnRcclxuICAgIGNvbnN0IGFjY291bnREYXRhID0gYXdhaXQgZmV0Y2hBY2NvdW50RGF0YUJvdGhVSXMocGFnZSwgc3RhcnREYXRlKTtcclxuICAgIHJldHVybiBbYWNjb3VudERhdGFdO1xyXG4gIH1cclxuXHJcbiAgY29uc3QgYWNjb3VudHM6IFRyYW5zYWN0aW9uc0FjY291bnRbXSA9IFtdO1xyXG4gIGZvciAoY29uc3QgYWNjb3VudElkIG9mIGFjY291bnRzSWRzKSB7XHJcbiAgICBhd2FpdCBzZWxlY3RBY2NvdW50Qm90aFVJcyhwYWdlLCBhY2NvdW50SWQpO1xyXG4gICAgY29uc3QgYWNjb3VudERhdGEgPSBhd2FpdCBmZXRjaEFjY291bnREYXRhQm90aFVJcyhwYWdlLCBzdGFydERhdGUpO1xyXG4gICAgYWNjb3VudHMucHVzaChhY2NvdW50RGF0YSk7XHJcbiAgfVxyXG5cclxuICByZXR1cm4gYWNjb3VudHM7XHJcbn1cclxuXHJcbnR5cGUgU2NyYXBlclNwZWNpZmljQ3JlZGVudGlhbHMgPSB7IHVzZXJuYW1lOiBzdHJpbmc7IHBhc3N3b3JkOiBzdHJpbmcgfTtcclxuXHJcbmNsYXNzIEJlaW5sZXVtaUdyb3VwQmFzZVNjcmFwZXIgZXh0ZW5kcyBCYXNlU2NyYXBlcldpdGhCcm93c2VyPFNjcmFwZXJTcGVjaWZpY0NyZWRlbnRpYWxzPiB7XHJcbiAgQkFTRV9VUkwgPSAnJztcclxuXHJcbiAgTE9HSU5fVVJMID0gJyc7XHJcblxyXG4gIFRSQU5TQUNUSU9OU19VUkwgPSAnJztcclxuXHJcbiAgZ2V0TG9naW5PcHRpb25zKGNyZWRlbnRpYWxzOiBTY3JhcGVyU3BlY2lmaWNDcmVkZW50aWFscykge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgbG9naW5Vcmw6IGAke3RoaXMuTE9HSU5fVVJMfWAsXHJcbiAgICAgIGZpZWxkczogY3JlYXRlTG9naW5GaWVsZHMoY3JlZGVudGlhbHMpLFxyXG4gICAgICBzdWJtaXRCdXR0b25TZWxlY3RvcjogJyNjb250aW51ZUJ0bicsXHJcbiAgICAgIHBvc3RBY3Rpb246IGFzeW5jICgpID0+IHdhaXRGb3JQb3N0TG9naW4odGhpcy5wYWdlKSxcclxuICAgICAgcG9zc2libGVSZXN1bHRzOiBnZXRQb3NzaWJsZUxvZ2luUmVzdWx0cygpLFxyXG4gICAgICAvLyBIQUNLOiBGb3Igc29tZSByZWFzb24sIHRob3VnaCB0aGUgbG9naW4gYnV0dG9uICgjY29udGludWVCdG4pIGlzIHByZXNlbnQgYW5kIHZpc2libGUsIHRoZSBjbGljayBhY3Rpb24gZG9lcyBub3QgcGVyZm9ybS5cclxuICAgICAgLy8gQWRkaW5nIHRoaXMgZGVsYXkgZml4ZXMgdGhlIGlzc3VlLlxyXG4gICAgICBwcmVBY3Rpb246IGFzeW5jICgpID0+IHtcclxuICAgICAgICBhd2FpdCBzbGVlcCgxMDAwKTtcclxuICAgICAgfSxcclxuICAgIH07XHJcbiAgfVxyXG5cclxuICBhc3luYyBmZXRjaERhdGEoKSB7XHJcbiAgICBjb25zdCBkZWZhdWx0U3RhcnRNb21lbnQgPSBtb21lbnQoKS5zdWJ0cmFjdCgxLCAneWVhcnMnKS5hZGQoMSwgJ2RheScpO1xyXG4gICAgY29uc3Qgc3RhcnRNb21lbnRMaW1pdCA9IG1vbWVudCh7IHllYXI6IDE2MDAgfSk7XHJcbiAgICBjb25zdCBzdGFydERhdGUgPSB0aGlzLm9wdGlvbnMuc3RhcnREYXRlIHx8IGRlZmF1bHRTdGFydE1vbWVudC50b0RhdGUoKTtcclxuICAgIGNvbnN0IHN0YXJ0TW9tZW50ID0gbW9tZW50Lm1heChzdGFydE1vbWVudExpbWl0LCBtb21lbnQoc3RhcnREYXRlKSk7XHJcblxyXG4gICAgYXdhaXQgdGhpcy5uYXZpZ2F0ZVRvKHRoaXMuVFJBTlNBQ1RJT05TX1VSTCk7XHJcblxyXG4gICAgY29uc3QgYWNjb3VudHMgPSBhd2FpdCBmZXRjaEFjY291bnRzKHRoaXMucGFnZSwgc3RhcnRNb21lbnQpO1xyXG5cclxuICAgIHJldHVybiB7XHJcbiAgICAgIHN1Y2Nlc3M6IHRydWUsXHJcbiAgICAgIGFjY291bnRzLFxyXG4gICAgfTtcclxuICB9XHJcbn1cclxuXHJcbmV4cG9ydCBkZWZhdWx0IEJlaW5sZXVtaUdyb3VwQmFzZVNjcmFwZXI7XHJcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7QUFBQSxJQUFBQSxPQUFBLEdBQUFDLHNCQUFBLENBQUFDLE9BQUE7QUFFQSxJQUFBQyxVQUFBLEdBQUFELE9BQUE7QUFDQSxJQUFBRSxxQkFBQSxHQUFBRixPQUFBO0FBT0EsSUFBQUcsV0FBQSxHQUFBSCxPQUFBO0FBQ0EsSUFBQUksUUFBQSxHQUFBSixPQUFBO0FBQ0EsSUFBQUssYUFBQSxHQUFBTCxPQUFBO0FBQ0EsSUFBQU0sdUJBQUEsR0FBQU4sT0FBQTtBQUE4RyxTQUFBRCx1QkFBQVEsQ0FBQSxXQUFBQSxDQUFBLElBQUFBLENBQUEsQ0FBQUMsVUFBQSxHQUFBRCxDQUFBLEtBQUFFLE9BQUEsRUFBQUYsQ0FBQTtBQUU5RyxNQUFNRyxXQUFXLEdBQUcsWUFBWTtBQUNoQyxNQUFNQyxpQ0FBaUMsR0FBRyw4QkFBOEI7QUFDeEUsTUFBTUMsMkJBQTJCLEdBQUcsWUFBWTtBQUNoRCxNQUFNQyx5QkFBeUIsR0FBRyxZQUFZO0FBQzlDLE1BQU1DLGtDQUFrQyxHQUFHLHVCQUF1QjtBQUNsRSxNQUFNQyxnQ0FBZ0MsR0FBRyxxQkFBcUI7QUFDOUQsTUFBTUMsc0JBQXNCLEdBQUcsU0FBUztBQUN4QyxNQUFNQyxrQkFBa0IsR0FBRyxPQUFPO0FBQ2xDLE1BQU1DLG1CQUFtQixHQUFHLFFBQVE7QUFDcEMsTUFBTUMsbUJBQW1CLEdBQUcsU0FBUztBQUNyQyxNQUFNQyxlQUFlLEdBQUcsK0JBQStCO0FBQ3ZELE1BQU1DLGtDQUFrQyxHQUFH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