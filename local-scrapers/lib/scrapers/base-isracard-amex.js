"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _lodash = _interopRequireDefault(require("lodash"));
var _moment = _interopRequireDefault(require("moment"));
var _constants = require("../constants");
var _definitions = require("../definitions");
var _browser = require("../helpers/browser");
var _dates = _interopRequireDefault(require("../helpers/dates"));
var _debug = require("../helpers/debug");
var _fetch = require("../helpers/fetch");
var _transactions = require("../helpers/transactions");
var _waiting = require("../helpers/waiting");
var _transactions2 = require("../transactions");
var _baseScraperWithBrowser = require("./base-scraper-with-browser");
var _errors = require("./errors");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const RATE_LIMIT = {
  SLEEP_BETWEEN: 2500,
  // Sweet spot: 2.5s base delay (randomized up to 3s)
  TRANSACTIONS_BATCH_SIZE: 10
};
const COUNTRY_CODE = '212';
const ID_TYPE = '1';
const INSTALLMENTS_KEYWORD = 'תשלום';
const DATE_FORMAT = 'DD/MM/YYYY';
const debug = (0, _debug.getDebug)('base-isracard-amex');
function getAccountsUrl(servicesUrl, monthMoment) {
  const billingDate = monthMoment.format('YYYY-MM-DD');
  const url = new URL(servicesUrl);
  url.searchParams.set('reqName', 'DashboardMonth');
  url.searchParams.set('actionCode', '0');
  url.searchParams.set('billingDate', billingDate);
  url.searchParams.set('format', 'Json');
  return url.toString();
}
async function fetchAccounts(page, servicesUrl, monthMoment) {
  const startTime = performance.now();
  const dataUrl = getAccountsUrl(servicesUrl, monthMoment);
  debug(`fetching accounts for ${monthMoment.format('YYYY-MM')} from ${dataUrl}`);
  await (0, _waiting.randomDelay)(RATE_LIMIT.SLEEP_BETWEEN, RATE_LIMIT.SLEEP_BETWEEN + 500);
  const dataResult = await (0, _fetch.fetchGetWithinPage)(page, dataUrl);
  debug(`Fetch for ${monthMoment.format('YYYY-MM')} completed in ${performance.now() - startTime}ms`);
  if (dataResult && _lodash.default.get(dataResult, 'Header.Status') === '1' && dataResult.DashboardMonthBean) {
    const {
      cardsCharges
    } = dataResult.DashboardMonthBean;
    if (cardsCharges) {
      return cardsCharges.map(cardCharge => {
        return {
          index: parseInt(cardCharge.cardIndex, 10),
          accountNumber: cardCharge.cardNumber,
          processedDate: (0, _moment.default)(cardCharge.billingDate, DATE_FORMAT).toISOString()
        };
      });
    }
  }
  return [];
}
function getTransactionsUrl(servicesUrl, monthMoment) {
  const month = monthMoment.month() + 1;
  const year = monthMoment.year();
  const monthStr = month < 10 ? `0${month}` : month.toString();
  const url = new URL(servicesUrl);
  url.searchParams.set('reqName', 'CardsTransactionsList');
  url.searchParams.set('month', monthStr);
  url.searchParams.set('year', `${year}`);
  url.searchParams.set('requiredDate', 'N');
  return url.toString();
}
function convertCurrency(currencyStr) {
  if (currencyStr === _constants.SHEKEL_CURRENCY_KEYWORD || currencyStr === _constants.ALT_SHEKEL_CURRENCY) {
    return _constants.SHEKEL_CURRENCY;
  }
  return currencyStr;
}
function getInstallmentsInfo(txn) {
  if (!txn.moreInfo || !txn.moreInfo.includes(INSTALLMENTS_KEYWORD)) {
    return undefined;
  }
  const matches = txn.moreInfo.match(/\d+/g);
  if (!matches || matches.length < 2) {
    return undefined;
  }
  return {
    number: parseInt(matches[0], 10),
    total: parseInt(matches[1], 10)
  };
}
function getTransactionType(txn) {
  return getInstallmentsInfo(txn) ? _transactions2.TransactionTypes.Installments : _transactions2.TransactionTypes.Normal;
}
function convertTransactions(txns, processedDate) {
  const filteredTxns = txns.filter(txn => txn.dealSumType !== '1' && txn.voucherNumberRatz !== '000000000' && txn.voucherNumberRatzOutbound !== '000000000');
  return filteredTxns.map(txn => {
    const isOutbound = txn.dealSumOutbound;
    const txnDateStr = isOutbound ? txn.fullPurchaseDateOutbound : txn.fullPurchaseDate;
    const txnMoment = (0, _moment.default)(txnDateStr, DATE_FORMAT);
    const currentProcessedDate = txn.fullPaymentDate ? (0, _moment.default)(txn.fullPaymentDate, DATE_FORMAT).toISOString() : processedDate;
    const result = {
      type: getTransactionType(txn),
      identifier: parseInt(isOutbound ? txn.voucherNumberRatzOutbound : txn.voucherNumberRatz, 10),
      date: txnMoment.toISOString(),
      processedDate: currentProcessedDate,
      originalAmount: isOutbound ? -txn.dealSumOutbound : -txn.dealSum,
      originalCurrency: convertCurrency(txn.currentPaymentCurrency ?? txn.currencyId),
      chargedAmount: isOutbound ? -txn.paymentSumOutbound : -txn.paymentSum,
      chargedCurrency: convertCurrency(txn.currencyId),
      description: isOutbound ? txn.fullSupplierNameOutbound : txn.fullSupplierNameHeb,
      memo: txn.moreInfo || '',
      installments: getInstallmentsInfo(txn) || undefined,
      status: _transactions2.TransactionStatuses.Completed
    };
    return result;
  });
}
async function fetchTransactions(page, options, companyServiceOptions, startMoment, monthMoment) {
  const startTime = performance.now();
  const accounts = await fetchAccounts(page, companyServiceOptions.servicesUrl, monthMoment);
  const dataUrl = getTransactionsUrl(companyServiceOptions.servicesUrl, monthMoment);
  debug(`fetching transactions for ${monthMoment.format('YYYY-MM')} from ${dataUrl}`);
  await (0, _waiting.randomDelay)(RATE_LIMIT.SLEEP_BETWEEN, RATE_LIMIT.SLEEP_BETWEEN + 500);
  const dataResult = await (0, _fetch.fetchGetWithinPage)(page, dataUrl);
  debug(`Fetch for ${monthMoment.format('YYYY-MM')} completed in ${performance.now() - startTime}ms`);
  if (dataResult && _lodash.default.get(dataResult, 'Header.Status') === '1' && dataResult.CardsTransactionsListBean) {
    const accountTxns = {};
    accounts.forEach(account => {
      const txnGroups = _lodash.default.get(dataResult, `CardsTransactionsListBean.Index${account.index}.CurrentCardTransactions`);
      if (txnGroups) {
        let allTxns = [];
        txnGroups.forEach(txnGroup => {
          if (txnGroup.txnIsrael) {
            const txns = convertTransactions(txnGroup.txnIsrael, account.processedDate);
            allTxns.push(...txns);
          }
          if (txnGroup.txnAbroad) {
            const txns = convertTransactions(txnGroup.txnAbroad, account.processedDate);
            allTxns.push(...txns);
          }
        });
        if (!options.combineInstallments) {
          allTxns = (0, _transactions.fixInstallments)(allTxns);
        }
        if (options.outputData?.enableTransactionsFilterByDate ?? true) {
          allTxns = (0, _transactions.filterOldTransactions)(allTxns, startMoment, options.combineInstallments || false);
        }
        accountTxns[account.accountNumber] = {
          accountNumber: account.accountNumber,
          index: account.index,
          txns: allTxns
        };
      }
    });
    return accountTxns;
  }
  return {};
}
async function getExtraScrapTransaction(page, options, month, accountIndex, transaction) {
  const url = new URL(options.servicesUrl);
  url.searchParams.set('reqName', 'PirteyIska_204');
  url.searchParams.set('CardIndex', accountIndex.toString());
  url.searchParams.set('shovarRatz', transaction.identifier.toString());
  url.searchParams.set('moedChiuv', month.format('MMYYYY'));
  debug(`fetching extra scrap for transaction ${transaction.identifier} for month ${month.format('YYYY-MM')}`);
  const data = await (0, _fetch.fetchGetWithinPage)(page, url.toString());
  if (!data) {
    return transaction;
  }
  const rawCategory = _lodash.default.get(data, 'PirteyIska_204Bean.sector') ?? '';
  return {
    ...transaction,
    category: rawCategory.trim()
  };
}
async function getExtraScrapAccount(page, options, accountMap, month) {
  const accounts = [];
  for (const account of Object.values(accountMap)) {
    debug(`get extra scrap for ${account.accountNumber} with ${account.txns.length} transactions`, month.format('YYYY-MM'));
    const txns = [];
    for (const txnsChunk of _lodash.default.chunk(account.txns, RATE_LIMIT.TRANSACTIONS_BATCH_SIZE)) {
      debug(`processing chunk of ${txnsChunk.length} transactions for account ${account.accountNumber}`);
      const updatedTxns = await Promise.all(txnsChunk.map(t => getExtraScrapTransaction(page, options, month, account.index, t)));
      await (0, _waiting.sleep)(RATE_LIMIT.SLEEP_BETWEEN);
      txns.push(...updatedTxns);
    }
    accounts.push({
      ...account,
      txns
    });
  }
  return accounts.reduce((m, x) => ({
    ...m,
    [x.accountNumber]: x
  }), {});
}
async function getAdditionalTransactionInformation(scraperOptions, accountsWithIndex, page, options, allMonths) {
  if (!scraperOptions.additionalTransactionInformation || scraperOptions.optInFeatures?.includes('isracard-amex:skipAdditionalTransactionInformation')) {
    return accountsWithIndex;
  }
  return (0, _waiting.runSerial)(accountsWithIndex.map((a, i) => () => getExtraScrapAccount(page, options, a, allMonths[i])));
}
async function fetchAllTransactions(page, options, companyServiceOptions, startMoment) {
  const fetchStartTime = performance.now();
  const futureMonthsToScrape = options.futureMonthsToScrape ?? 1;
  const allMonths = (0, _dates.default)(startMoment, futureMonthsToScrape);
  debug(`Fetching transactions for ${allMonths.length} months`);
  const results = await (0, _waiting.runSerial)(allMonths.map(monthMoment => () => {
    return fetchTransactions(page, options, companyServiceOptions, startMoment, monthMoment);
  }));
  const finalResult = await getAdditionalTransactionInformation(options, results, page, companyServiceOptions, allMonths);
  const combinedTxns = {};
  finalResult.forEach(result => {
    Object.keys(result).forEach(accountNumber => {
      let txnsForAccount = combinedTxns[accountNumber];
      if (!txnsForAccount) {
        txnsForAccount = [];
        combinedTxns[accountNumber] = txnsForAccount;
      }
      const toBeAddedTxns = result[accountNumber].txns;
      combinedTxns[accountNumber].push(...toBeAddedTxns);
    });
  });
  const accounts = Object.keys(combinedTxns).map(accountNumber => {
    return {
      accountNumber,
      txns: combinedTxns[accountNumber]
    };
  });
  debug(`fetchAllTransactions completed in ${performance.now() - fetchStartTime}ms`);
  return {
    success: true,
    accounts
  };
}
class IsracardAmexBaseScraper extends _baseScraperWithBrowser.BaseScraperWithBrowser {
  constructor(options, baseUrl, companyCode) {
    super(options);
    this.baseUrl = baseUrl;
    this.companyCode = companyCode;
    this.servicesUrl = `${baseUrl}/services/ProxyRequestHandler.ashx`;
  }
  async login(credentials) {
    const loginStartTime = performance.now();
    await this.page.setRequestInterception(true);
    this.page.on('request', request => {
      if (request.url().includes('detector-dom.min.js')) {
        debug('force abort for request do download detector-dom.min.js resource');
        void request.abort(undefined, _browser.interceptionPriorities.abort);
      } else {
        void request.continue(undefined, _browser.interceptionPriorities.continue);
      }
    });
    await (0, _browser.maskHeadlessUserAgent)(this.page);
    await this.navigateTo(`${this.baseUrl}/personalarea/Login`);
    this.emitProgress(_definitions.ScraperProgressTypes.LoggingIn);
    const validateUrl = `${this.servicesUrl}?reqName=ValidateIdData`;
    const validateRequest = {
      id: credentials.id,
      cardSuffix: credentials.card6Digits,
      countryCode: COUNTRY_CODE,
      idType: ID_TYPE,
      checkLevel: '1',
      companyCode: this.companyCode
    };
    debug('logging in with validate request');
    const validateResult = await (0, _fetch.fetchPostWithinPage)(this.page, validateUrl, validateRequest);
    if (!validateResult || !validateResult.Header || validateResult.Header.Status !== '1' || !validateResult.ValidateIdDataBean) {
      throw new Error('unknown error during login');
    }
    const validateReturnCode = validateResult.ValidateIdDataBean.returnCode;
    debug(`user validate with return code '${validateReturnCode}'`);
    if (validateReturnCode === '1') {
      const {
        userName
      } = validateResult.ValidateIdDataBean;
      const loginUrl = `${this.servicesUrl}?reqName=performLogonI`;
      const request = {
        KodMishtamesh: userName,
        MisparZihuy: credentials.id,
        Sisma: credentials.password,
        cardSuffix: credentials.card6Digits,
        countryCode: COUNTRY_CODE,
        idType: ID_TYPE
      };
      debug('user login started');
      const loginResult = await (0, _fetch.fetchPostWithinPage)(this.page, loginUrl, request);
      debug(`user login with status '${loginResult?.status}'`, loginResult);
      if (loginResult && loginResult.status === '1') {
        this.emitProgress(_definitions.ScraperProgressTypes.LoginSuccess);
        debug(`Login completed in ${performance.now() - loginStartTime}ms`);
        return {
          success: true
        };
      }
      if (loginResult && loginResult.status === '3') {
        this.emitProgress(_definitions.ScraperProgressTypes.ChangePassword);
        return {
          success: false,
          errorType: _errors.ScraperErrorTypes.ChangePassword
        };
      }
      this.emitProgress(_definitions.ScraperProgressTypes.LoginFailed);
      return {
        success: false,
        errorType: _errors.ScraperErrorTypes.InvalidPassword
      };
    }
    if (validateReturnCode === '4') {
      this.emitProgress(_definitions.ScraperProgressTypes.ChangePassword);
      return {
        success: false,
        errorType: _errors.ScraperErrorTypes.ChangePassword
      };
    }
    this.emitProgress(_definitions.ScraperProgressTypes.LoginFailed);
    return {
      success: false,
      errorType: _errors.ScraperErrorTypes.InvalidPassword
    };
  }
  async fetchData() {
    const defaultStartMoment = (0, _moment.default)().subtract(1, 'years');
    const startDate = this.options.startDate || defaultStartMoment.toDate();
    const startMoment = _moment.default.max(defaultStartMoment, (0, _moment.default)(startDate));
    return fetchAllTransactions(this.page, this.options, {
      servicesUrl: this.servicesUrl,
      companyCode: this.companyCode
    }, startMoment);
  }
}
var _default = exports.default = IsracardAmexBaseScraper;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbG9kYXNoIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsInJlcXVpcmUiLCJfbW9tZW50IiwiX2NvbnN0YW50cyIsIl9kZWZpbml0aW9ucyIsIl9icm93c2VyIiwiX2RhdGVzIiwiX2RlYnVnIiwiX2ZldGNoIiwiX3RyYW5zYWN0aW9ucyIsIl93YWl0aW5nIiwiX3RyYW5zYWN0aW9uczIiLCJfYmFzZVNjcmFwZXJXaXRoQnJvd3NlciIsIl9lcnJvcnMiLCJlIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJSQVRFX0xJTUlUIiwiU0xFRVBfQkVUV0VFTiIsIlRSQU5TQUNUSU9OU19CQVRDSF9TSVpFIiwiQ09VTlRSWV9DT0RFIiwiSURfVFlQRSIsIklOU1RBTExNRU5UU19LRVlXT1JEIiwiREFURV9GT1JNQVQiLCJkZWJ1ZyIsImdldERlYnVnIiwiZ2V0QWNjb3VudHNVcmwiLCJzZXJ2aWNlc1VybCIsIm1vbnRoTW9tZW50IiwiYmlsbGluZ0RhdGUiLCJmb3JtYXQiLCJ1cmwiLCJVUkwiLCJzZWFyY2hQYXJhbXMiLCJzZXQiLCJ0b1N0cmluZyIsImZldGNoQWNjb3VudHMiLCJwYWdlIiwic3RhcnRUaW1lIiwicGVyZm9ybWFuY2UiLCJub3ciLCJkYXRhVXJsIiwicmFuZG9tRGVsYXkiLCJkYXRhUmVzdWx0IiwiZmV0Y2hHZXRXaXRoaW5QYWdlIiwiXyIsImdldCIsIkRhc2hib2FyZE1vbnRoQmVhbiIsImNhcmRzQ2hhcmdlcyIsIm1hcCIsImNhcmRDaGFyZ2UiLCJpbmRleCIsInBhcnNlSW50IiwiY2FyZEluZGV4IiwiYWNjb3VudE51bWJlciIsImNhcmROdW1iZXIiLCJwcm9jZXNzZWREYXRlIiwibW9tZW50IiwidG9JU09TdHJpbmciLCJnZXRUcmFuc2FjdGlvbnNVcmwiLCJtb250aCIsInllYXIiLCJtb250aFN0ciIsImNvbnZlcnRDdXJyZW5jeSIsImN1cnJlbmN5U3RyIiwiU0hFS0VMX0NVUlJFTkNZX0tFWVdPUkQiLCJBTFRfU0hFS0VMX0NVUlJFTkNZIiwiU0hFS0VMX0NVUlJFTkNZIiwiZ2V0SW5zdGFsbG1lbnRzSW5mbyIsInR4biIsIm1vcmVJbmZvIiwiaW5jbHVkZXMiLCJ1bmRlZmluZWQiLCJtYXRjaGVzIiwibWF0Y2giLCJsZW5ndGgiLCJudW1iZXIiLCJ0b3RhbCIsImdldFRyYW5zYWN0aW9uVHlwZSIsIlRyYW5zYWN0aW9uVHlwZXMiLCJJbnN0YWxsbWVudHMiLCJOb3JtYWwiLCJjb252ZXJ0VHJhbnNhY3Rpb25zIiwidHhucyIsImZpbHRlcmVkVHhucyIsImZpbHRlciIsImRlYWxTdW1UeXBlIiwidm91Y2hlck51bWJlclJhdHoiLCJ2b3VjaGVyTnVtYmVyUmF0ek91dGJvdW5kIiwiaXNPdXRib3VuZCIsImRlYWxTdW1PdXRib3VuZCIsInR4bkRhdGVTdHIiLCJmdWxsUHVyY2hhc2VEYXRlT3V0Ym91bmQiLCJmdWxsUHVyY2hhc2VEYXRlIiwidHhuTW9tZW50IiwiY3VycmVudFByb2Nlc3NlZERhdGUiLCJmdWxsUGF5bWVudERhdGUiLCJyZXN1bHQiLCJ0eXBlIiwiaWRlbnRpZmllciIsImRhdGUiLCJvcmlnaW5hbEFtb3VudCIsImRlYWxTdW0iLCJvcmlnaW5hbEN1cnJlbmN5IiwiY3VycmVudFBheW1lbnRDdXJyZW5jeSIsImN1cnJlbmN5SWQiLCJjaGFyZ2VkQW1vdW50IiwicGF5bWVudFN1bU91dGJvdW5kIiwicGF5bWVudFN1bSIsImNoYXJnZWRDdXJyZW5jeSIsImRlc2NyaXB0aW9uIiwiZnVsbFN1cHBsaWVyTmFtZU91dGJvdW5kIiwiZnVsbFN1cHBsaWVyTmFtZUhlYiIsIm1lbW8iLCJpbnN0YWxsbWVudHMiLCJzdGF0dXMiLCJUcmFuc2FjdGlvblN0YXR1c2VzIiwiQ29tcGxldGVkIiwiZmV0Y2hUcmFuc2FjdGlvbnMiLCJvcHRpb25zIiwiY29tcGFueVNlcnZpY2VPcHRpb25zIiwic3RhcnRNb21lbnQiLCJhY2NvdW50cyIsIkNhcmRzVHJhbnNhY3Rpb25zTGlzdEJlYW4iLCJhY2NvdW50VHhucyIsImZvckVhY2giLCJhY2NvdW50IiwidHhuR3JvdXBzIiwiYWxsVHhucyIsInR4bkdyb3VwIiwidHhuSXNyYWVsIiwicHVzaCIsInR4bkFicm9hZCIsImNvbWJpbmVJbnN0YWxsbWVudHMiLCJmaXhJbnN0YWxsbWVudHMiLCJvdXRwdXREYXRhIiwiZW5hYmxlVHJhbnNhY3Rpb25zRmlsdGVyQnlEYXRlIiwiZmlsdGVyT2xkVHJhbnNhY3Rpb25zIiwiZ2V0RXh0cmFTY3JhcFRyYW5zYWN0aW9uIiwiYWNjb3VudEluZGV4IiwidHJhbnNhY3Rpb24iLCJkYXRhIiwicmF3Q2F0ZWdvcnkiLCJjYXRlZ29yeSIsInRyaW0iLCJnZXRFeHRyYVNjcmFwQWNjb3VudCIsImFjY291bnRNYXAiLCJPYmplY3QiLCJ2YWx1ZXMiLCJ0eG5zQ2h1bmsiLCJjaHVuayIsInVwZGF0ZWRUeG5zIiwiUHJvbWlzZSIsImFsbCIsInQiLCJzbGVlcCIsInJlZHVjZSIsIm0iLCJ4IiwiZ2V0QWRkaXRpb25hbFRyYW5zYWN0aW9uSW5mb3JtYXRpb24iLCJzY3JhcGVyT3B0aW9ucyIsImFjY291bnRzV2l0aEluZGV4IiwiYWxsTW9udGhzIiwiYWRkaXRpb25hbFRyYW5zYWN0aW9uSW5mb3JtYXRpb24iLCJvcHRJbkZlYXR1cmVzIiwicnVuU2VyaWFsIiwiYSIsImkiLCJmZXRjaEFsbFRyYW5zYWN0aW9ucyIsImZldGNoU3RhcnRUaW1lIiwiZnV0dXJlTW9udGhzVG9TY3JhcGUiLCJnZXRBbGxNb250aE1vbWVudHMiLCJyZXN1bHRzIiwiZmluYWxSZXN1bHQiLCJjb21iaW5lZFR4bnMiLCJrZXlzIiwidHhuc0ZvckFjY291bnQiLCJ0b0JlQWRkZWRUeG5zIiwic3VjY2VzcyIsIklzcmFjYXJkQW1leEJhc2VTY3JhcGVyIiwiQmFzZVNjcmFwZXJXaXRoQnJvd3NlciIsImNvbnN0cnVjdG9yIiwiYmFzZVVybCIsImNvbXBhbnlDb2RlIiwibG9naW4iLCJjcmVkZW50aWFscyIsImxvZ2luU3RhcnRUaW1lIiwic2V0UmVxdWVzdEludGVyY2VwdGlvbiIsIm9uIiwicmVxdWVzdCIsImFib3J0IiwiaW50ZXJjZXB0aW9uUHJpb3JpdGllcyIsImNvbnRpbnVlIiwibWFza0hlYWRsZXNzVXNlckFnZW50IiwibmF2aWdhdGVUbyIsImVtaXRQcm9ncmVzcyIsIlNjcmFwZXJQcm9ncmVzc1R5cGVzIiwiTG9nZ2luZ0luIiwidmFsaWRhdGVVcmwiLCJ2YWxpZGF0ZVJlcXVlc3QiLCJpZCIsImNhcmRTdWZmaXgiLCJjYXJkNkRpZ2l0cyIsImNvdW50cnlDb2RlIiwiaWRUeXBlIiwiY2hlY2tMZXZlbCIsInZhbGlkYXRlUmVzdWx0IiwiZmV0Y2hQb3N0V2l0aGluUGFnZSIsIkhlYWRlciIsIlN0YXR1cyIsIlZhbGlkYXRlSWREYXRhQmVhbiIsIkVycm9yIiwidmFsaWRhdGVSZXR1cm5Db2RlIiwicmV0dXJuQ29kZSIsInVzZXJOYW1lIiwibG9naW5VcmwiLCJLb2RNaXNodGFtZXNoIiwiTWlzcGFyWmlodXkiLCJTaXNtYSIsInBhc3N3b3JkIiwibG9naW5SZXN1bHQiLCJMb2dpblN1Y2Nlc3MiLCJDaGFuZ2VQYXNzd29yZCIsImVycm9yVHlwZSIsIlNjcmFwZXJFcnJvclR5cGVzIiwiTG9naW5GYWlsZWQiLCJJbnZhbGlkUGFzc3dvcmQiLCJmZXRjaERhdGEiLCJkZWZhdWx0U3RhcnRNb21lbnQiLCJzdWJ0cmFjdCIsInN0YXJ0RGF0ZSIsInRvRGF0ZSIsIm1heCIsIl9kZWZhdWx0IiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9zY3JhcGVycy9iYXNlLWlzcmFjYXJkLWFtZXgudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcclxuaW1wb3J0IG1vbWVudCwgeyB0eXBlIE1vbWVudCB9IGZyb20gJ21vbWVudCc7XHJcbmltcG9ydCB7IHR5cGUgUGFnZSB9IGZyb20gJ3B1cHBldGVlcic7XHJcbmltcG9ydCB7IEFMVF9TSEVLRUxfQ1VSUkVOQ1ksIFNIRUtFTF9DVVJSRU5DWSwgU0hFS0VMX0NVUlJFTkNZX0tFWVdPUkQgfSBmcm9tICcuLi9jb25zdGFudHMnO1xyXG5pbXBvcnQgeyBTY3JhcGVyUHJvZ3Jlc3NUeXBlcyB9IGZyb20gJy4uL2RlZmluaXRpb25zJztcclxuaW1wb3J0IHsgaW50ZXJjZXB0aW9uUHJpb3JpdGllcywgbWFza0hlYWRsZXNzVXNlckFnZW50IH0gZnJvbSAnLi4vaGVscGVycy9icm93c2VyJztcclxuaW1wb3J0IGdldEFsbE1vbnRoTW9tZW50cyBmcm9tICcuLi9oZWxwZXJzL2RhdGVzJztcclxuaW1wb3J0IHsgZ2V0RGVidWcgfSBmcm9tICcuLi9oZWxwZXJzL2RlYnVnJztcclxuaW1wb3J0IHsgZmV0Y2hHZXRXaXRoaW5QYWdlLCBmZXRjaFBvc3RXaXRoaW5QYWdlIH0gZnJvbSAnLi4vaGVscGVycy9mZXRjaCc7XHJcbmltcG9ydCB7IGZpbHRlck9sZFRyYW5zYWN0aW9ucywgZml4SW5zdGFsbG1lbnRzIH0gZnJvbSAnLi4vaGVscGVycy90cmFuc2FjdGlvbnMnO1xyXG5pbXBvcnQgeyByYW5kb21EZWxheSwgcnVuU2VyaWFsLCBzbGVlcCB9IGZyb20gJy4uL2hlbHBlcnMvd2FpdGluZyc7XHJcbmltcG9ydCB7XHJcbiAgVHJhbnNhY3Rpb25TdGF0dXNlcyxcclxuICBUcmFuc2FjdGlvblR5cGVzLFxyXG4gIHR5cGUgVHJhbnNhY3Rpb24sXHJcbiAgdHlwZSBUcmFuc2FjdGlvbkluc3RhbGxtZW50cyxcclxuICB0eXBlIFRyYW5zYWN0aW9uc0FjY291bnQsXHJcbn0gZnJvbSAnLi4vdHJhbnNhY3Rpb25zJztcclxuaW1wb3J0IHsgQmFzZVNjcmFwZXJXaXRoQnJvd3NlciB9IGZyb20gJy4vYmFzZS1zY3JhcGVyLXdpdGgtYnJvd3Nlcic7XHJcbmltcG9ydCB7IFNjcmFwZXJFcnJvclR5cGVzIH0gZnJvbSAnLi9lcnJvcnMnO1xyXG5pbXBvcnQgeyB0eXBlIFNjcmFwZXJPcHRpb25zLCB0eXBlIFNjcmFwZXJTY3JhcGluZ1Jlc3VsdCB9IGZyb20gJy4vaW50ZXJmYWNlJztcclxuXHJcbmNvbnN0IFJBVEVfTElNSVQgPSB7XHJcbiAgU0xFRVBfQkVUV0VFTjogMjUwMCwgLy8gU3dlZXQgc3BvdDogMi41cyBiYXNlIGRlbGF5IChyYW5kb21pemVkIHVwIHRvIDNzKVxyXG4gIFRSQU5TQUNUSU9OU19CQVRDSF9TSVpFOiAxMCxcclxufSBhcyBjb25zdDtcclxuXHJcbmNvbnN0IENPVU5UUllfQ09ERSA9ICcyMTInO1xyXG5jb25zdCBJRF9UWVBFID0gJzEnO1xyXG5jb25zdCBJTlNUQUxMTUVOVFNfS0VZV09SRCA9ICfXqtep15zXldedJztcclxuXHJcbmNvbnN0IERBVEVfRk9STUFUID0gJ0REL01NL1lZWVknO1xyXG5cclxuY29uc3QgZGVidWcgPSBnZXREZWJ1ZygnYmFzZS1pc3JhY2FyZC1hbWV4Jyk7XHJcblxyXG50eXBlIENvbXBhbnlTZXJ2aWNlT3B0aW9ucyA9IHtcclxuICBzZXJ2aWNlc1VybDogc3RyaW5nO1xyXG4gIGNvbXBhbnlDb2RlOiBzdHJpbmc7XHJcbn07XHJcblxyXG50eXBlIFNjcmFwZWRBY2NvdW50c1dpdGhJbmRleCA9IFJlY29yZDxzdHJpbmcsIFRyYW5zYWN0aW9uc0FjY291bnQgJiB7IGluZGV4OiBudW1iZXIgfT47XHJcblxyXG5pbnRlcmZhY2UgU2NyYXBlZFRyYW5zYWN0aW9uIHtcclxuICBkZWFsU3VtVHlwZTogc3RyaW5nO1xyXG4gIHZvdWNoZXJOdW1iZXJSYXR6T3V0Ym91bmQ6IHN0cmluZztcclxuICB2b3VjaGVyTnVtYmVyUmF0ejogc3RyaW5nO1xyXG4gIG1vcmVJbmZvPzogc3RyaW5nO1xyXG4gIGRlYWxTdW1PdXRib3VuZDogYm9vbGVhbjtcclxuICBjdXJyZW5jeUlkOiBzdHJpbmc7XHJcbiAgY3VycmVudFBheW1lbnRDdXJyZW5jeTogc3RyaW5nO1xyXG4gIGRlYWxTdW06IG51bWJlcjtcclxuICBmdWxsUGF5bWVudERhdGU/OiBzdHJpbmc7XHJcbiAgZnVsbFB1cmNoYXNlRGF0ZT86IHN0cmluZztcclxuICBmdWxsUHVyY2hhc2VEYXRlT3V0Ym91bmQ/OiBzdHJpbmc7XHJcbiAgZnVsbFN1cHBsaWVyTmFtZUhlYjogc3RyaW5nO1xyXG4gIGZ1bGxTdXBwbGllck5hbWVPdXRib3VuZDogc3RyaW5nO1xyXG4gIHBheW1lbnRTdW06IG51bWJlcjtcclxuICBwYXltZW50U3VtT3V0Ym91bmQ6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIFNjcmFwZWRBY2NvdW50IHtcclxuICBpbmRleDogbnVtYmVyO1xyXG4gIGFjY291bnROdW1iZXI6IHN0cmluZztcclxuICBwcm9jZXNzZWREYXRlOiBzdHJpbmc7XHJcbn1cclxuXHJcbmludGVyZmFjZSBTY3JhcGVkTG9naW5WYWxpZGF0aW9uIHtcclxuICBIZWFkZXI6IHtcclxuICAgIFN0YXR1czogc3RyaW5nO1xyXG4gIH07XHJcbiAgVmFsaWRhdGVJZERhdGFCZWFuPzoge1xyXG4gICAgdXNlck5hbWU/OiBzdHJpbmc7XHJcbiAgICByZXR1cm5Db2RlOiBzdHJpbmc7XHJcbiAgfTtcclxufVxyXG5cclxuaW50ZXJmYWNlIFNjcmFwZWRBY2NvdW50c1dpdGhpblBhZ2VSZXNwb25zZSB7XHJcbiAgSGVhZGVyOiB7XHJcbiAgICBTdGF0dXM6IHN0cmluZztcclxuICB9O1xyXG4gIERhc2hib2FyZE1vbnRoQmVhbj86IHtcclxuICAgIGNhcmRzQ2hhcmdlczoge1xyXG4gICAgICBjYXJkSW5kZXg6IHN0cmluZztcclxuICAgICAgY2FyZE51bWJlcjogc3RyaW5nO1xyXG4gICAgICBiaWxsaW5nRGF0ZTogc3RyaW5nO1xyXG4gICAgfVtdO1xyXG4gIH07XHJcbn1cclxuXHJcbmludGVyZmFjZSBTY3JhcGVkQ3VycmVudENhcmRUcmFuc2FjdGlvbnMge1xyXG4gIHR4bklzcmFlbD86IFNjcmFwZWRUcmFuc2FjdGlvbltdO1xyXG4gIHR4bkFicm9hZD86IFNjcmFwZWRUcmFuc2FjdGlvbltdO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgU2NyYXBlZFRyYW5zYWN0aW9uRGF0YSB7XHJcbiAgSGVhZGVyPzoge1xyXG4gICAgU3RhdHVzOiBzdHJpbmc7XHJcbiAgfTtcclxuICBQaXJ0ZXlJc2thXzIwNEJlYW4/OiB7XHJcbiAgICBzZWN0b3I6IHN0cmluZztcclxuICB9O1xyXG5cclxuICBDYXJkc1RyYW5zYWN0aW9uc0xpc3RCZWFuPzogUmVjb3JkPFxyXG4gICAgc3RyaW5nLFxyXG4gICAge1xyXG4gICAgICBDdXJyZW50Q2FyZFRyYW5zYWN0aW9uczogU2NyYXBlZEN1cnJlbnRDYXJkVHJhbnNhY3Rpb25zW107XHJcbiAgICB9XHJcbiAgPjtcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0QWNjb3VudHNVcmwoc2VydmljZXNVcmw6IHN0cmluZywgbW9udGhNb21lbnQ6IE1vbWVudCkge1xyXG4gIGNvbnN0IGJpbGxpbmdEYXRlID0gbW9udGhNb21lbnQuZm9ybWF0KCdZWVlZLU1NLUREJyk7XHJcbiAgY29uc3QgdXJsID0gbmV3IFVSTChzZXJ2aWNlc1VybCk7XHJcbiAgdXJsLnNlYXJjaFBhcmFtcy5zZXQoJ3JlcU5hbWUnLCAnRGFzaGJvYXJkTW9udGgnKTtcclxuICB1cmwuc2VhcmNoUGFyYW1zLnNldCgnYWN0aW9uQ29kZScsICcwJyk7XHJcbiAgdXJsLnNlYXJjaFBhcmFtcy5zZXQoJ2JpbGxpbmdEYXRlJywgYmlsbGluZ0RhdGUpO1xyXG4gIHVybC5zZWFyY2hQYXJhbXMuc2V0KCdmb3JtYXQnLCAnSnNvbicpO1xyXG4gIHJldHVybiB1cmwudG9TdHJpbmcoKTtcclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gZmV0Y2hBY2NvdW50cyhwYWdlOiBQYWdlLCBzZXJ2aWNlc1VybDogc3RyaW5nLCBtb250aE1vbWVudDogTW9tZW50KTogUHJvbWlzZTxTY3JhcGVkQWNjb3VudFtdPiB7XHJcbiAgY29uc3Qgc3RhcnRUaW1lID0gcGVyZm9ybWFuY2Uubm93KCk7XHJcbiAgY29uc3QgZGF0YVVybCA9IGdldEFjY291bnRzVXJsKHNlcnZpY2VzVXJsLCBtb250aE1vbWVudCk7XHJcblxyXG4gIGRlYnVnKGBmZXRjaGluZyBhY2NvdW50cyBmb3IgJHttb250aE1vbWVudC5mb3JtYXQoJ1lZWVktTU0nKX0gZnJvbSAke2RhdGFVcmx9YCk7XHJcbiAgYXdhaXQgcmFuZG9tRGVsYXkoUkFURV9MSU1JVC5TTEVFUF9CRVRXRUVOLCBSQVRFX0xJTUlULlNMRUVQX0JFVFdFRU4gKyA1MDApO1xyXG4gIGNvbnN0IGRhdGFSZXN1bHQgPSBhd2FpdCBmZXRjaEdldFdpdGhpblBhZ2U8U2NyYXBlZEFjY291bnRzV2l0aGluUGFnZVJlc3BvbnNlPihwYWdlLCBkYXRhVXJsKTtcclxuICBkZWJ1ZyhgRmV0Y2ggZm9yICR7bW9udGhNb21lbnQuZm9ybWF0KCdZWVlZLU1NJyl9IGNvbXBsZXRlZCBpbiAke3BlcmZvcm1hbmNlLm5vdygpIC0gc3RhcnRUaW1lfW1zYCk7XHJcblxyXG4gIGlmIChkYXRhUmVzdWx0ICYmIF8uZ2V0KGRhdGFSZXN1bHQsICdIZWFkZXIuU3RhdHVzJykgPT09ICcxJyAmJiBkYXRhUmVzdWx0LkRhc2hib2FyZE1vbnRoQmVhbikge1xyXG4gICAgY29uc3QgeyBjYXJkc0NoYXJnZXMgfSA9IGRhdGFSZXN1bHQuRGFzaGJvYXJkTW9udGhCZWFuO1xyXG4gICAgaWYgKGNhcmRzQ2hhcmdlcykge1xyXG4gICAgICByZXR1cm4gY2FyZHNDaGFyZ2VzLm1hcChjYXJkQ2hhcmdlID0+IHtcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgaW5kZXg6IHBhcnNlSW50KGNhcmRDaGFyZ2UuY2FyZEluZGV4LCAxMCksXHJcbiAgICAgICAgICBhY2NvdW50TnVtYmVyOiBjYXJkQ2hhcmdlLmNhcmROdW1iZXIsXHJcbiAgICAgICAgICBwcm9jZXNzZWREYXRlOiBtb21lbnQoY2FyZENoYXJnZS5iaWxsaW5nRGF0ZSwgREFURV9GT1JNQVQpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgfTtcclxuICAgICAgfSk7XHJcbiAgICB9XHJcbiAgfVxyXG4gIHJldHVybiBbXTtcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0VHJhbnNhY3Rpb25zVXJsKHNlcnZpY2VzVXJsOiBzdHJpbmcsIG1vbnRoTW9tZW50OiBNb21lbnQpIHtcclxuICBjb25zdCBtb250aCA9IG1vbnRoTW9tZW50Lm1vbnRoKCkgKyAxO1xyXG4gIGNvbnN0IHllYXIgPSBtb250aE1vbWVudC55ZWFyKCk7XHJcbiAgY29uc3QgbW9udGhTdHIgPSBtb250aCA8IDEwID8gYDAke21vbnRofWAgOiBtb250aC50b1N0cmluZygpO1xyXG4gIGNvbnN0IHVybCA9IG5ldyBVUkwoc2VydmljZXNVcmwpO1xyXG4gIHVybC5zZWFyY2hQYXJhbXMuc2V0KCdyZXFOYW1lJywgJ0NhcmRzVHJhbnNhY3Rpb25zTGlzdCcpO1xyXG4gIHVybC5zZWFyY2hQYXJhbXMuc2V0KCdtb250aCcsIG1vbnRoU3RyKTtcclxuICB1cmwuc2VhcmNoUGFyYW1zLnNldCgneWVhcicsIGAke3llYXJ9YCk7XHJcbiAgdXJsLnNlYXJjaFBhcmFtcy5zZXQoJ3JlcXVpcmVkRGF0ZScsICdOJyk7XHJcbiAgcmV0dXJuIHVybC50b1N0cmluZygpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjb252ZXJ0Q3VycmVuY3koY3VycmVuY3lTdHI6IHN0cmluZykge1xyXG4gIGlmIChjdXJyZW5jeVN0ciA9PT0gU0hFS0VMX0NVUlJFTkNZX0tFWVdPUkQgfHwgY3VycmVuY3lTdHIgPT09IEFMVF9TSEVLRUxfQ1VSUkVOQ1kpIHtcclxuICAgIHJldHVybiBTSEVLRUxfQ1VSUkVOQ1k7XHJcbiAgfVxyXG4gIHJldHVybiBjdXJyZW5jeVN0cjtcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0SW5zdGFsbG1lbnRzSW5mbyh0eG46IFNjcmFwZWRUcmFuc2FjdGlvbik6IFRyYW5zYWN0aW9uSW5zdGFsbG1lbnRzIHwgdW5kZWZpbmVkIHtcclxuICBpZiAoIXR4bi5tb3JlSW5mbyB8fCAhdHhuLm1vcmVJbmZvLmluY2x1ZGVzKElOU1RBTExNRU5UU19LRVlXT1JEKSkge1xyXG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcclxuICB9XHJcbiAgY29uc3QgbWF0Y2hlcyA9IHR4bi5tb3JlSW5mby5tYXRjaCgvXFxkKy9nKTtcclxuICBpZiAoIW1hdGNoZXMgfHwgbWF0Y2hlcy5sZW5ndGggPCAyKSB7XHJcbiAgICByZXR1cm4gdW5kZWZpbmVkO1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIG51bWJlcjogcGFyc2VJbnQobWF0Y2hlc1swXSwgMTApLFxyXG4gICAgdG90YWw6IHBhcnNlSW50KG1hdGNoZXNbMV0sIDEwKSxcclxuICB9O1xyXG59XHJcblxyXG5mdW5jdGlvbiBnZXRUcmFuc2FjdGlvblR5cGUodHhuOiBTY3JhcGVkVHJhbnNhY3Rpb24pIHtcclxuICByZXR1cm4gZ2V0SW5zdGFsbG1lbnRzSW5mbyh0eG4pID8gVHJhbnNhY3Rpb25UeXBlcy5JbnN0YWxsbWVudHMgOiBUcmFuc2FjdGlvblR5cGVzLk5vcm1hbDtcclxufVxyXG5cclxuZnVuY3Rpb24gY29udmVydFRyYW5zYWN0aW9ucyh0eG5zOiBTY3JhcGVkVHJhbnNhY3Rpb25bXSwgcHJvY2Vzc2VkRGF0ZTogc3RyaW5nKTogVHJhbnNhY3Rpb25bXSB7XHJcbiAgY29uc3QgZmlsdGVyZWRUeG5zID0gdHhucy5maWx0ZXIoXHJcbiAgICB0eG4gPT5cclxuICAgICAgdHhuLmRlYWxTdW1UeXBlICE9PSAnMScgJiYgdHhuLnZvdWNoZXJOdW1iZXJSYXR6ICE9PSAnMDAwMDAwMDAwJyAmJiB0eG4udm91Y2hlck51bWJlclJhdHpPdXRib3VuZCAhPT0gJzAwMDAwMDAwMCcsXHJcbiAgKTtcclxuXHJcbiAgcmV0dXJuIGZpbHRlcmVkVHhucy5tYXAodHhuID0+IHtcclxuICAgIGNvbnN0IGlzT3V0Ym91bmQgPSB0eG4uZGVhbFN1bU91dGJvdW5kO1xyXG4gICAgY29uc3QgdHhuRGF0ZVN0ciA9IGlzT3V0Ym91bmQgPyB0eG4uZnVsbFB1cmNoYXNlRGF0ZU91dGJvdW5kIDogdHhuLmZ1bGxQdXJjaGFzZURhdGU7XHJcbiAgICBjb25zdCB0eG5Nb21lbnQgPSBtb21lbnQodHhuRGF0ZVN0ciwgREFURV9GT1JNQVQpO1xyXG5cclxuICAgIGNvbnN0IGN1cnJlbnRQcm9jZXNzZWREYXRlID0gdHhuLmZ1bGxQYXltZW50RGF0ZVxyXG4gICAgICA/IG1vbWVudCh0eG4uZnVsbFBheW1lbnREYXRlLCBEQVRFX0ZPUk1BVCkudG9JU09TdHJpbmcoKVxyXG4gICAgICA6IHByb2Nlc3NlZERhdGU7XHJcbiAgICBjb25zdCByZXN1bHQ6IFRyYW5zYWN0aW9uID0ge1xyXG4gICAgICB0eXBlOiBnZXRUcmFuc2FjdGlvblR5cGUodHhuKSxcclxuICAgICAgaWRlbnRpZmllcjogcGFyc2VJbnQoaXNPdXRib3VuZCA/IHR4bi52b3VjaGVyTnVtYmVyUmF0ek91dGJvdW5kIDogdHhuLnZvdWNoZXJOdW1iZXJSYXR6LCAxMCksXHJcbiAgICAgIGRhdGU6IHR4bk1vbWVudC50b0lTT1N0cmluZygpLFxyXG4gICAgICBwcm9jZXNzZWREYXRlOiBjdXJyZW50UHJvY2Vzc2VkRGF0ZSxcclxuICAgICAgb3JpZ2luYWxBbW91bnQ6IGlzT3V0Ym91bmQgPyAtdHhuLmRlYWxTdW1PdXRib3VuZCA6IC10eG4uZGVhbFN1bSxcclxuICAgICAgb3JpZ2luYWxDdXJyZW5jeTogY29udmVydEN1cnJlbmN5KHR4bi5jdXJyZW50UGF5bWVudEN1cnJlbmN5ID8/IHR4bi5jdXJyZW5jeUlkKSxcclxuICAgICAgY2hhcmdlZEFtb3VudDogaXNPdXRib3VuZCA/IC10eG4ucGF5bWVudFN1bU91dGJvdW5kIDogLXR4bi5wYXltZW50U3VtLFxyXG4gICAgICBjaGFyZ2VkQ3VycmVuY3k6IGNvbnZlcnRDdXJyZW5jeSh0eG4uY3VycmVuY3lJZCksXHJcbiAgICAgIGRlc2NyaXB0aW9uOiBpc091dGJvdW5kID8gdHhuLmZ1bGxTdXBwbGllck5hbWVPdXRib3VuZCA6IHR4bi5mdWxsU3VwcGxpZXJOYW1lSGViLFxyXG4gICAgICBtZW1vOiB0eG4ubW9yZUluZm8gfHwgJycsXHJcbiAgICAgIGluc3RhbGxtZW50czogZ2V0SW5zdGFsbG1lbnRzSW5mbyh0eG4pIHx8IHVuZGVmaW5lZCxcclxuICAgICAgc3RhdHVzOiBUcmFuc2FjdGlvblN0YXR1c2VzLkNvbXBsZXRlZCxcclxuICAgIH07XHJcblxyXG4gICAgcmV0dXJuIHJlc3VsdDtcclxuICB9KTtcclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gZmV0Y2hUcmFuc2FjdGlvbnMoXHJcbiAgcGFnZTogUGFnZSxcclxuICBvcHRpb25zOiBTY3JhcGVyT3B0aW9ucyxcclxuICBjb21wYW55U2VydmljZU9wdGlvbnM6IENvbXBhbnlTZXJ2aWNlT3B0aW9ucyxcclxuICBzdGFydE1vbWVudDogTW9tZW50LFxyXG4gIG1vbnRoTW9tZW50OiBNb21lbnQsXHJcbik6IFByb21pc2U8U2NyYXBlZEFjY291bnRzV2l0aEluZGV4PiB7XHJcbiAgY29uc3Qgc3RhcnRUaW1lID0gcGVyZm9ybWFuY2Uubm93KCk7XHJcbiAgY29uc3QgYWNjb3VudHMgPSBhd2FpdCBmZXRjaEFjY291bnRzKHBhZ2UsIGNvbXBhbnlTZXJ2aWNlT3B0aW9ucy5zZXJ2aWNlc1VybCwgbW9udGhNb21lbnQpO1xyXG4gIGNvbnN0IGRhdGFVcmwgPSBnZXRUcmFuc2FjdGlvbnNVcmwoY29tcGFueVNlcnZpY2VPcHRpb25zLnNlcnZpY2VzVXJsLCBtb250aE1vbWVudCk7XHJcblxyXG4gIGRlYnVnKGBmZXRjaGluZyB0cmFuc2FjdGlvbnMgZm9yICR7bW9udGhNb21lbnQuZm9ybWF0KCdZWVlZLU1NJyl9IGZyb20gJHtkYXRhVXJsfWApO1xyXG4gIGF3YWl0IHJhbmRvbURlbGF5KFJBVEVfTElNSVQuU0xFRVBfQkVUV0VFTiwgUkFURV9MSU1JVC5TTEVFUF9CRVRXRUVOICsgNTAwKTtcclxuICBjb25zdCBkYXRhUmVzdWx0ID0gYXdhaXQgZmV0Y2hHZXRXaXRoaW5QYWdlPFNjcmFwZWRUcmFuc2FjdGlvbkRhdGE+KHBhZ2UsIGRhdGFVcmwpO1xyXG4gIGRlYnVnKGBGZXRjaCBmb3IgJHttb250aE1vbWVudC5mb3JtYXQoJ1lZWVktTU0nKX0gY29tcGxldGVkIGluICR7cGVyZm9ybWFuY2Uubm93KCkgLSBzdGFydFRpbWV9bXNgKTtcclxuXHJcbiAgaWYgKGRhdGFSZXN1bHQgJiYgXy5nZXQoZGF0YVJlc3VsdCwgJ0hlYWRlci5TdGF0dXMnKSA9PT0gJzEnICYmIGRhdGFSZXN1bHQuQ2FyZHNUcmFuc2FjdGlvbnNMaXN0QmVhbikge1xyXG4gICAgY29uc3QgYWNjb3VudFR4bnM6IFNjcmFwZWRBY2NvdW50c1dpdGhJbmRleCA9IHt9O1xyXG4gICAgYWNjb3VudHMuZm9yRWFjaChhY2NvdW50ID0+IHtcclxuICAgICAgY29uc3QgdHhuR3JvdXBzOiBTY3JhcGVkQ3VycmVudENhcmRUcmFuc2FjdGlvbnNbXSB8IHVuZGVmaW5lZCA9IF8uZ2V0KFxyXG4gICAgICAgIGRhdGFSZXN1bHQsXHJcbiAgICAgICAgYENhcmRzVHJhbnNhY3Rpb25zTGlzdEJlYW4uSW5kZXgke2FjY291bnQuaW5kZXh9LkN1cnJlbnRDYXJkVHJhbnNhY3Rpb25zYCxcclxuICAgICAgKTtcclxuICAgICAgaWYgKHR4bkdyb3Vwcykge1xyXG4gICAgICAgIGxldCBhbGxUeG5zOiBUcmFuc2FjdGlvbltdID0gW107XHJcbiAgICAgICAgdHhuR3JvdXBzLmZvckVhY2godHhuR3JvdXAgPT4ge1xyXG4gICAgICAgICAgaWYgKHR4bkdyb3VwLnR4bklzcmFlbCkge1xyXG4gICAgICAgICAgICBjb25zdCB0eG5zID0gY29udmVydFRyYW5zYWN0aW9ucyh0eG5Hcm91cC50eG5Jc3JhZWwsIGFjY291bnQucHJvY2Vzc2VkRGF0ZSk7XHJcbiAgICAgICAgICAgIGFsbFR4bnMucHVzaCguLi50eG5zKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGlmICh0eG5Hcm91cC50eG5BYnJvYWQpIHtcclxuICAgICAgICAgICAgY29uc3QgdHhucyA9IGNvbnZlcnRUcmFuc2FjdGlvbnModHhuR3JvdXAudHhuQWJyb2FkLCBhY2NvdW50LnByb2Nlc3NlZERhdGUpO1xyXG4gICAgICAgICAgICBhbGxUeG5zLnB1c2goLi4udHhucyk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGlmICghb3B0aW9ucy5jb21iaW5lSW5zdGFsbG1lbnRzKSB7XHJcbiAgICAgICAgICBhbGxUeG5zID0gZml4SW5zdGFsbG1lbnRzKGFsbFR4bnMpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAob3B0aW9ucy5vdXRwdXREYXRhPy5lbmFibGVUcmFuc2FjdGlvbnNGaWx0ZXJCeURhdGUgPz8gdHJ1ZSkge1xyXG4gICAgICAgICAgYWxsVHhucyA9IGZpbHRlck9sZFRyYW5zYWN0aW9ucyhhbGxUeG5zLCBzdGFydE1vbWVudCwgb3B0aW9ucy5jb21iaW5lSW5zdGFsbG1lbnRzIHx8IGZhbHNlKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgYWNjb3VudFR4bnNbYWNjb3VudC5hY2NvdW50TnVtYmVyXSA9IHtcclxuICAgICAgICAgIGFjY291bnROdW1iZXI6IGFjY291bnQuYWNjb3VudE51bWJlcixcclxuICAgICAgICAgIGluZGV4OiBhY2NvdW50LmluZGV4LFxyXG4gICAgICAgICAgdHhuczogYWxsVHhucyxcclxuICAgICAgICB9O1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICAgIHJldHVybiBhY2NvdW50VHhucztcclxuICB9XHJcblxyXG4gIHJldHVybiB7fTtcclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gZ2V0RXh0cmFTY3JhcFRyYW5zYWN0aW9uKFxyXG4gIHBhZ2U6IFBhZ2UsXHJcbiAgb3B0aW9uczogQ29tcGFueVNlcnZpY2VPcHRpb25zLFxyXG4gIG1vbnRoOiBNb21lbnQsXHJcbiAgYWNjb3VudEluZGV4OiBudW1iZXIsXHJcbiAgdHJhbnNhY3Rpb246IFRyYW5zYWN0aW9uLFxyXG4pOiBQcm9taXNlPFRyYW5zYWN0aW9uPiB7XHJcbiAgY29uc3QgdXJsID0gbmV3IFVSTChvcHRpb25zLnNlcnZpY2VzVXJsKTtcclxuICB1cmwuc2VhcmNoUGFyYW1zLnNldCgncmVxTmFtZScsICdQaXJ0ZXlJc2thXzIwNCcpO1xyXG4gIHVybC5zZWFyY2hQYXJhbXMuc2V0KCdDYXJkSW5kZXgnLCBhY2NvdW50SW5kZXgudG9TdHJpbmcoKSk7XHJcbiAgdXJsLnNlYXJjaFBhcmFtcy5zZXQoJ3Nob3ZhclJhdHonLCB0cmFuc2FjdGlvbi5pZGVudGlmaWVyIS50b1N0cmluZygpKTtcclxuICB1cmwuc2VhcmNoUGFyYW1zLnNldCgnbW9lZENoaXV2JywgbW9udGguZm9ybWF0KCdNTVlZWVknKSk7XHJcblxyXG4gIGRlYnVnKGBmZXRjaGluZyBleHRyYSBzY3JhcCBmb3IgdHJhbnNhY3Rpb24gJHt0cmFuc2FjdGlvbi5pZGVudGlmaWVyfSBmb3IgbW9udGggJHttb250aC5mb3JtYXQoJ1lZWVktTU0nKX1gKTtcclxuICBjb25zdCBkYXRhID0gYXdhaXQgZmV0Y2hHZXRXaXRoaW5QYWdlPFNjcmFwZWRUcmFuc2FjdGlvbkRhdGE+KHBhZ2UsIHVybC50b1N0cmluZygpKTtcclxuICBpZiAoIWRhdGEpIHtcclxuICAgIHJldHVybiB0cmFuc2FjdGlvbjtcclxuICB9XHJcblxyXG4gIGNvbnN0IHJhd0NhdGVnb3J5ID0gXy5nZXQoZGF0YSwgJ1BpcnRleUlza2FfMjA0QmVhbi5zZWN0b3InKSA/PyAnJztcclxuICByZXR1cm4ge1xyXG4gICAgLi4udHJhbnNhY3Rpb24sXHJcbiAgICBjYXRlZ29yeTogcmF3Q2F0ZWdvcnkudHJpbSgpLFxyXG4gIH07XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGdldEV4dHJhU2NyYXBBY2NvdW50KFxyXG4gIHBhZ2U6IFBhZ2UsXHJcbiAgb3B0aW9uczogQ29tcGFueVNlcnZpY2VPcHRpb25zLFxyXG4gIGFjY291bnRNYXA6IFNjcmFwZWRBY2NvdW50c1dpdGhJbmRleCxcclxuICBtb250aDogbW9tZW50Lk1vbWVudCxcclxuKTogUHJvbWlzZTxTY3JhcGVkQWNjb3VudHNXaXRoSW5kZXg+IHtcclxuICBjb25zdCBhY2NvdW50czogU2NyYXBlZEFjY291bnRzV2l0aEluZGV4W3N0cmluZ11bXSA9IFtdO1xyXG4gIGZvciAoY29uc3QgYWNjb3VudCBvZiBPYmplY3QudmFsdWVzKGFjY291bnRNYXApKSB7XHJcbiAgICBkZWJ1ZyhcclxuICAgICAgYGdldCBleHRyYSBzY3JhcCBmb3IgJHthY2NvdW50LmFjY291bnROdW1iZXJ9IHdpdGggJHthY2NvdW50LnR4bnMubGVuZ3RofSB0cmFuc2FjdGlvbnNgLFxyXG4gICAgICBtb250aC5mb3JtYXQoJ1lZWVktTU0nKSxcclxuICAgICk7XHJcbiAgICBjb25zdCB0eG5zOiBUcmFuc2FjdGlvbltdID0gW107XHJcbiAgICBmb3IgKGNvbnN0IHR4bnNDaHVuayBvZiBfLmNodW5rKGFjY291bnQudHhucywgUkFURV9MSU1JVC5UUkFOU0FDVElPTlNfQkFUQ0hfU0laRSkpIHtcclxuICAgICAgZGVidWcoYHByb2Nlc3NpbmcgY2h1bmsgb2YgJHt0eG5zQ2h1bmsubGVuZ3RofSB0cmFuc2FjdGlvbnMgZm9yIGFjY291bnQgJHthY2NvdW50LmFjY291bnROdW1iZXJ9YCk7XHJcbiAgICAgIGNvbnN0IHVwZGF0ZWRUeG5zID0gYXdhaXQgUHJvbWlzZS5hbGwoXHJcbiAgICAgICAgdHhuc0NodW5rLm1hcCh0ID0+IGdldEV4dHJhU2NyYXBUcmFuc2FjdGlvbihwYWdlLCBvcHRpb25zLCBtb250aCwgYWNjb3VudC5pbmRleCwgdCkpLFxyXG4gICAgICApO1xyXG4gICAgICBhd2FpdCBzbGVlcChSQVRFX0xJTUlULlNMRUVQX0JFVFdFRU4pO1xyXG4gICAgICB0eG5zLnB1c2goLi4udXBkYXRlZFR4bnMpO1xyXG4gICAgfVxyXG4gICAgYWNjb3VudHMucHVzaCh7IC4uLmFjY291bnQsIHR4bnMgfSk7XHJcbiAgfVxyXG5cclxuICByZXR1cm4gYWNjb3VudHMucmVkdWNlKChtLCB4KSA9PiAoeyAuLi5tLCBbeC5hY2NvdW50TnVtYmVyXTogeCB9KSwge30pO1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBnZXRBZGRpdGlvbmFsVHJhbnNhY3Rpb25JbmZvcm1hdGlvbihcclxuICBzY3JhcGVyT3B0aW9uczogU2NyYXBlck9wdGlvbnMsXHJcbiAgYWNjb3VudHNXaXRoSW5kZXg6IFNjcmFwZWRBY2NvdW50c1dpdGhJbmRleFtdLFxyXG4gIHBhZ2U6IFBhZ2UsXHJcbiAgb3B0aW9uczogQ29tcGFueVNlcnZpY2VPcHRpb25zLFxyXG4gIGFsbE1vbnRoczogbW9tZW50Lk1vbWVudFtdLFxyXG4pOiBQcm9taXNlPFNjcmFwZWRBY2NvdW50c1dpdGhJbmRleFtdPiB7XHJcbiAgaWYgKFxyXG4gICAgIXNjcmFwZXJPcHRpb25zLmFkZGl0aW9uYWxUcmFuc2FjdGlvbkluZm9ybWF0aW9uIHx8XHJcbiAgICBzY3JhcGVyT3B0aW9ucy5vcHRJbkZlYXR1cmVzPy5pbmNsdWRlcygnaXNyYWNhcmQtYW1leDpza2lwQWRkaXRpb25hbFRyYW5zYWN0aW9uSW5mb3JtYXRpb24nKVxyXG4gICkge1xyXG4gICAgcmV0dXJuIGFjY291bnRzV2l0aEluZGV4O1xyXG4gIH1cclxuICByZXR1cm4gcnVuU2VyaWFsKGFjY291bnRzV2l0aEluZGV4Lm1hcCgoYSwgaSkgPT4gKCkgPT4gZ2V0RXh0cmFTY3JhcEFjY291bnQocGFnZSwgb3B0aW9ucywgYSwgYWxsTW9udGhzW2ldKSkpO1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBmZXRjaEFsbFRyYW5zYWN0aW9ucyhcclxuICBwYWdlOiBQYWdlLFxyXG4gIG9wdGlvbnM6IFNjcmFwZXJPcHRpb25zLFxyXG4gIGNvbXBhbnlTZXJ2aWNlT3B0aW9uczogQ29tcGFueVNlcnZpY2VPcHRpb25zLFxyXG4gIHN0YXJ0TW9tZW50OiBNb21lbnQsXHJcbikge1xyXG4gIGNvbnN0IGZldGNoU3RhcnRUaW1lID0gcGVyZm9ybWFuY2Uubm93KCk7XHJcbiAgY29uc3QgZnV0dXJlTW9udGhzVG9TY3JhcGUgPSBvcHRpb25zLmZ1dHVyZU1vbnRoc1RvU2NyYXBlID8/IDE7XHJcbiAgY29uc3QgYWxsTW9udGhzID0gZ2V0QWxsTW9udGhNb21lbnRzKHN0YXJ0TW9tZW50LCBmdXR1cmVNb250aHNUb1NjcmFwZSk7XHJcbiAgZGVidWcoYEZldGNoaW5nIHRyYW5zYWN0aW9ucyBmb3IgJHthbGxNb250aHMubGVuZ3RofSBtb250aHNgKTtcclxuXHJcbiAgY29uc3QgcmVzdWx0czogU2NyYXBlZEFjY291bnRzV2l0aEluZGV4W10gPSBhd2FpdCBydW5TZXJpYWwoXHJcbiAgICBhbGxNb250aHMubWFwKG1vbnRoTW9tZW50ID0+ICgpID0+IHtcclxuICAgICAgcmV0dXJuIGZldGNoVHJhbnNhY3Rpb25zKHBhZ2UsIG9wdGlvbnMsIGNvbXBhbnlTZXJ2aWNlT3B0aW9ucywgc3RhcnRNb21lbnQsIG1vbnRoTW9tZW50KTtcclxuICAgIH0pLFxyXG4gICk7XHJcblxyXG4gIGNvbnN0IGZpbmFsUmVzdWx0ID0gYXdhaXQgZ2V0QWRkaXRpb25hbFRyYW5zYWN0aW9uSW5mb3JtYXRpb24oXHJcbiAgICBvcHRpb25zLFxyXG4gICAgcmVzdWx0cyxcclxuICAgIHBhZ2UsXHJcbiAgICBjb21wYW55U2VydmljZU9wdGlvbnMsXHJcbiAgICBhbGxNb250aHMsXHJcbiAgKTtcclxuICBjb25zdCBjb21iaW5lZFR4bnM6IFJlY29yZDxzdHJpbmcsIFRyYW5zYWN0aW9uW10+ID0ge307XHJcblxyXG4gIGZpbmFsUmVzdWx0LmZvckVhY2gocmVzdWx0ID0+IHtcclxuICAgIE9iamVjdC5rZXlzKHJlc3VsdCkuZm9yRWFjaChhY2NvdW50TnVtYmVyID0+IHtcclxuICAgICAgbGV0IHR4bnNGb3JBY2NvdW50ID0gY29tYmluZWRUeG5zW2FjY291bnROdW1iZXJdO1xyXG4gICAgICBpZiAoIXR4bnNGb3JBY2NvdW50KSB7XHJcbiAgICAgICAgdHhuc0ZvckFjY291bnQgPSBbXTtcclxuICAgICAgICBjb21iaW5lZFR4bnNbYWNjb3VudE51bWJlcl0gPSB0eG5zRm9yQWNjb3VudDtcclxuICAgICAgfVxyXG4gICAgICBjb25zdCB0b0JlQWRkZWRUeG5zID0gcmVzdWx0W2FjY291bnROdW1iZXJdLnR4bnM7XHJcbiAgICAgIGNvbWJpbmVkVHhuc1thY2NvdW50TnVtYmVyXS5wdXNoKC4uLnRvQmVBZGRlZFR4bnMpO1xyXG4gICAgfSk7XHJcbiAgfSk7XHJcblxyXG4gIGNvbnN0IGFjY291bnRzID0gT2JqZWN0LmtleXMoY29tYmluZWRUeG5zKS5tYXAoYWNjb3VudE51bWJlciA9PiB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBhY2NvdW50TnVtYmVyLFxyXG4gICAgICB0eG5zOiBjb21iaW5lZFR4bnNbYWNjb3VudE51bWJlcl0sXHJcbiAgICB9O1xyXG4gIH0pO1xyXG5cclxuICBkZWJ1ZyhgZmV0Y2hBbGxUcmFuc2FjdGlvbnMgY29tcGxldGVkIGluICR7cGVyZm9ybWFuY2Uubm93KCkgLSBmZXRjaFN0YXJ0VGltZX1tc2ApO1xyXG5cclxuICByZXR1cm4ge1xyXG4gICAgc3VjY2VzczogdHJ1ZSxcclxuICAgIGFjY291bnRzLFxyXG4gIH07XHJcbn1cclxuXHJcbnR5cGUgU2NyYXBlclNwZWNpZmljQ3JlZGVudGlhbHMgPSB7IGlkOiBzdHJpbmc7IHBhc3N3b3JkOiBzdHJpbmc7IGNhcmQ2RGlnaXRzOiBzdHJpbmcgfTtcclxuY2xhc3MgSXNyYWNhcmRBbWV4QmFzZVNjcmFwZXIgZXh0ZW5kcyBCYXNlU2NyYXBlcldpdGhCcm93c2VyPFNjcmFwZXJTcGVjaWZpY0NyZWRlbnRpYWxzPiB7XHJcbiAgcHJpdmF0ZSBiYXNlVXJsOiBzdHJpbmc7XHJcblxyXG4gIHByaXZhdGUgY29tcGFueUNvZGU6IHN0cmluZztcclxuXHJcbiAgcHJpdmF0ZSBzZXJ2aWNlc1VybDogc3RyaW5nO1xyXG5cclxuICBjb25zdHJ1Y3RvcihvcHRpb25zOiBTY3JhcGVyT3B0aW9ucywgYmFzZVVybDogc3RyaW5nLCBjb21wYW55Q29kZTogc3RyaW5nKSB7XHJcbiAgICBzdXBlcihvcHRpb25zKTtcclxuXHJcbiAgICB0aGlzLmJhc2VVcmwgPSBiYXNlVXJsO1xyXG4gICAgdGhpcy5jb21wYW55Q29kZSA9IGNvbXBhbnlDb2RlO1xyXG4gICAgdGhpcy5zZXJ2aWNlc1VybCA9IGAke2Jhc2VVcmx9L3NlcnZpY2VzL1Byb3h5UmVxdWVzdEhhbmRsZXIuYXNoeGA7XHJcbiAgfVxyXG5cclxuICBhc3luYyBsb2dpbihjcmVkZW50aWFsczogU2NyYXBlclNwZWNpZmljQ3JlZGVudGlhbHMpOiBQcm9taXNlPFNjcmFwZXJTY3JhcGluZ1Jlc3VsdD4ge1xyXG4gICAgY29uc3QgbG9naW5TdGFydFRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTtcclxuICAgIGF3YWl0IHRoaXMucGFnZS5zZXRSZXF1ZXN0SW50ZXJjZXB0aW9uKHRydWUpO1xyXG4gICAgdGhpcy5wYWdlLm9uKCdyZXF1ZXN0JywgcmVxdWVzdCA9PiB7XHJcbiAgICAgIGlmIChyZXF1ZXN0LnVybCgpLmluY2x1ZGVzKCdkZXRlY3Rvci1kb20ubWluLmpzJykpIHtcclxuICAgICAgICBkZWJ1ZygnZm9yY2UgYWJvcnQgZm9yIHJlcXVlc3QgZG8gZG93bmxvYWQgZGV0ZWN0b3ItZG9tLm1pbi5qcyByZXNvdXJjZScpO1xyXG4gICAgICAgIHZvaWQgcmVxdWVzdC5hYm9ydCh1bmRlZmluZWQsIGludGVyY2VwdGlvblByaW9yaXRpZXMuYWJvcnQpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHZvaWQgcmVxdWVzdC5jb250aW51ZSh1bmRlZmluZWQsIGludGVyY2VwdGlvblByaW9yaXRpZXMuY29udGludWUpO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICBhd2FpdCBtYXNrSGVhZGxlc3NVc2VyQWdlbnQodGhpcy5wYWdlKTtcclxuXHJcbiAgICBhd2FpdCB0aGlzLm5hdmlnYXRlVG8oYCR7dGhpcy5iYXNlVXJsfS9wZXJzb25hbGFyZWEvTG9naW5gKTtcclxuXHJcbiAgICB0aGlzLmVtaXRQcm9ncmVzcyhTY3JhcGVyUHJvZ3Jlc3NUeXBlcy5Mb2dnaW5nSW4pO1xyXG5cclxuICAgIGNvbnN0IHZhbGlkYXRlVXJsID0gYCR7dGhpcy5zZXJ2aWNlc1VybH0/cmVxTmFtZT1WYWxpZGF0ZUlkRGF0YWA7XHJcbiAgICBjb25zdCB2YWxpZGF0ZVJlcXVlc3QgPSB7XHJcbiAgICAgIGlkOiBjcmVkZW50aWFscy5pZCxcclxuICAgICAgY2FyZFN1ZmZpeDogY3JlZGVudGlhbHMuY2FyZDZEaWdpdHMsXHJcbiAgICAgIGNvdW50cnlDb2RlOiBDT1VOVFJZX0NPREUsXHJcbiAgICAgIGlkVHlwZTogSURfVFlQRSxcclxuICAgICAgY2hlY2tMZXZlbDogJzEnLFxyXG4gICAgICBjb21wYW55Q29kZTogdGhpcy5jb21wYW55Q29kZSxcclxuICAgIH07XHJcbiAgICBkZWJ1ZygnbG9nZ2luZyBpbiB3aXRoIHZhbGlkYXRlIHJlcXVlc3QnKTtcclxuICAgIGNvbnN0IHZhbGlkYXRlUmVzdWx0ID0gYXdhaXQgZmV0Y2hQb3N0V2l0aGluUGFnZTxTY3JhcGVkTG9naW5WYWxpZGF0aW9uPih0aGlzLnBhZ2UsIHZhbGlkYXRlVXJsLCB2YWxpZGF0ZVJlcXVlc3QpO1xyXG4gICAgaWYgKFxyXG4gICAgICAhdmFsaWRhdGVSZXN1bHQgfHxcclxuICAgICAgIXZhbGlkYXRlUmVzdWx0LkhlYWRlciB8fFxyXG4gICAgICB2YWxpZGF0ZVJlc3VsdC5IZWFkZXIuU3RhdHVzICE9PSAnMScgfHxcclxuICAgICAgIXZhbGlkYXRlUmVzdWx0LlZhbGlkYXRlSWREYXRhQmVhblxyXG4gICAgKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcigndW5rbm93biBlcnJvciBkdXJpbmcgbG9naW4nKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCB2YWxpZGF0ZVJldHVybkNvZGUgPSB2YWxpZGF0ZVJlc3VsdC5WYWxpZGF0ZUlkRGF0YUJlYW4ucmV0dXJuQ29kZTtcclxuICAgIGRlYnVnKGB1c2VyIHZhbGlkYXRlIHdpdGggcmV0dXJuIGNvZGUgJyR7dmFsaWRhdGVSZXR1cm5Db2RlfSdgKTtcclxuICAgIGlmICh2YWxpZGF0ZVJldHVybkNvZGUgPT09ICcxJykge1xyXG4gICAgICBjb25zdCB7IHVzZXJOYW1lIH0gPSB2YWxpZGF0ZVJlc3VsdC5WYWxpZGF0ZUlkRGF0YUJlYW47XHJcblxyXG4gICAgICBjb25zdCBsb2dpblVybCA9IGAke3RoaXMuc2VydmljZXNVcmx9P3JlcU5hbWU9cGVyZm9ybUxvZ29uSWA7XHJcbiAgICAgIGNvbnN0IHJlcXVlc3QgPSB7XHJcbiAgICAgICAgS29kTWlzaHRhbWVzaDogdXNlck5hbWUsXHJcbiAgICAgICAgTWlzcGFyWmlodXk6IGNyZWRlbnRpYWxzLmlkLFxyXG4gICAgICAgIFNpc21hOiBjcmVkZW50aWFscy5wYXNzd29yZCxcclxuICAgICAgICBjYXJkU3VmZml4OiBjcmVkZW50aWFscy5jYXJkNkRpZ2l0cyxcclxuICAgICAgICBjb3VudHJ5Q29kZTogQ09VTlRSWV9DT0RFLFxyXG4gICAgICAgIGlkVHlwZTogSURfVFlQRSxcclxuICAgICAgfTtcclxuICAgICAgZGVidWcoJ3VzZXIgbG9naW4gc3RhcnRlZCcpO1xyXG4gICAgICBjb25zdCBsb2dpblJlc3VsdCA9IGF3YWl0IGZldGNoUG9zdFdpdGhpblBhZ2U8eyBzdGF0dXM6IHN0cmluZyB9Pih0aGlzLnBhZ2UsIGxvZ2luVXJsLCByZXF1ZXN0KTtcclxuICAgICAgZGVidWcoYHVzZXIgbG9naW4gd2l0aCBzdGF0dXMgJyR7bG9naW5SZXN1bHQ/LnN0YXR1c30nYCwgbG9naW5SZXN1bHQpO1xyXG5cclxuICAgICAgaWYgKGxvZ2luUmVzdWx0ICYmIGxvZ2luUmVzdWx0LnN0YXR1cyA9PT0gJzEnKSB7XHJcbiAgICAgICAgdGhpcy5lbWl0UHJvZ3Jlc3MoU2NyYXBlclByb2dyZXNzVHlwZXMuTG9naW5TdWNjZXNzKTtcclxuICAgICAgICBkZWJ1ZyhgTG9naW4gY29tcGxldGVkIGluICR7cGVyZm9ybWFuY2Uubm93KCkgLSBsb2dpblN0YXJ0VGltZX1tc2ApO1xyXG4gICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUgfTtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKGxvZ2luUmVzdWx0ICYmIGxvZ2luUmVzdWx0LnN0YXR1cyA9PT0gJzMnKSB7XHJcbiAgICAgICAgdGhpcy5lbWl0UHJvZ3Jlc3MoU2NyYXBlclByb2dyZXNzVHlwZXMuQ2hhbmdlUGFzc3dvcmQpO1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcclxuICAgICAgICAgIGVycm9yVHlwZTogU2NyYXBlckVycm9yVHlwZXMuQ2hhbmdlUGFzc3dvcmQsXHJcbiAgICAgICAgfTtcclxuICAgICAgfVxyXG5cclxuICAgICAgdGhpcy5lbWl0UHJvZ3Jlc3MoU2NyYXBlclByb2dyZXNzVHlwZXMuTG9naW5GYWlsZWQpO1xyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxyXG4gICAgICAgIGVycm9yVHlwZTogU2NyYXBlckVycm9yVHlwZXMuSW52YWxpZFBhc3N3b3JkLFxyXG4gICAgICB9O1xyXG4gICAgfVxyXG5cclxuICAgIGlmICh2YWxpZGF0ZVJldHVybkNvZGUgPT09ICc0Jykge1xyXG4gICAgICB0aGlzLmVtaXRQcm9ncmVzcyhTY3JhcGVyUHJvZ3Jlc3NUeXBlcy5DaGFuZ2VQYXNzd29yZCk7XHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgc3VjY2VzczogZmFsc2UsXHJcbiAgICAgICAgZXJyb3JUeXBlOiBTY3JhcGVyRXJyb3JUeXBlcy5DaGFuZ2VQYXNzd29yZCxcclxuICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICB0aGlzLmVtaXRQcm9ncmVzcyhTY3JhcGVyUHJvZ3Jlc3NUeXBlcy5Mb2dpbkZhaWxlZCk7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBzdWNjZXNzOiBmYWxzZSxcclxuICAgICAgZXJyb3JUeXBlOiBTY3JhcGVyRXJyb3JUeXBlcy5JbnZhbGlkUGFzc3dvcmQsXHJcbiAgICB9O1xyXG4gIH1cclxuXHJcbiAgYXN5bmMgZmV0Y2hEYXRhKCkge1xyXG4gICAgY29uc3QgZGVmYXVsdFN0YXJ0TW9tZW50ID0gbW9tZW50KCkuc3VidHJhY3QoMSwgJ3llYXJzJyk7XHJcbiAgICBjb25zdCBzdGFydERhdGUgPSB0aGlzLm9wdGlvbnMuc3RhcnREYXRlIHx8IGRlZmF1bHRTdGFydE1vbWVudC50b0RhdGUoKTtcclxuICAgIGNvbnN0IHN0YXJ0TW9tZW50ID0gbW9tZW50Lm1heChkZWZhdWx0U3RhcnRNb21lbnQsIG1vbWVudChzdGFydERhdGUpKTtcclxuXHJcbiAgICByZXR1cm4gZmV0Y2hBbGxUcmFuc2FjdGlvbnMoXHJcbiAgICAgIHRoaXMucGFnZSxcclxuICAgICAgdGhpcy5vcHRpb25zLFxyXG4gICAgICB7XHJcbiAgICAgICAgc2VydmljZXNVcmw6IHRoaXMuc2VydmljZXNVcmwsXHJcbiAgICAgICAgY29tcGFueUNvZGU6IHRoaXMuY29tcGFueUNvZGUsXHJcbiAgICAgIH0sXHJcbiAgICAgIHN0YXJ0TW9tZW50LFxyXG4gICAgKTtcclxuICB9XHJcbn1cclxuXHJcbmV4cG9ydCBkZWZhdWx0IElzcmFjYXJkQW1leEJhc2VTY3JhcGVyO1xyXG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBLElBQUFBLE9BQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFDLE9BQUEsR0FBQUYsc0JBQUEsQ0FBQUMsT0FBQTtBQUVBLElBQUFFLFVBQUEsR0FBQUYsT0FBQTtBQUNBLElBQUFHLFlBQUEsR0FBQUgsT0FBQTtBQUNBLElBQUFJLFFBQUEsR0FBQUosT0FBQTtBQUNBLElBQUFLLE1BQUEsR0FBQU4sc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFNLE1BQUEsR0FBQU4sT0FBQTtBQUNBLElBQUFPLE1BQUEsR0FBQVAsT0FBQTtBQUNBLElBQUFRLGFBQUEsR0FBQVIsT0FBQTtBQUNBLElBQUFTLFFBQUEsR0FBQVQsT0FBQTtBQUNBLElBQUFVLGNBQUEsR0FBQVYsT0FBQTtBQU9BLElBQUFXLHVCQUFBLEdBQUFY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