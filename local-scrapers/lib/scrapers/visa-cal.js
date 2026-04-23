"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _moment = _interopRequireDefault(require("moment"));
var _debug = require("../helpers/debug");
var _elementsInteractions = require("../helpers/elements-interactions");
var _fetch = require("../helpers/fetch");
var _navigation = require("../helpers/navigation");
var _storage = require("../helpers/storage");
var _transactions = require("../helpers/transactions");
var _waiting = require("../helpers/waiting");
var _transactions2 = require("../transactions");
var _baseScraperWithBrowser = require("./base-scraper-with-browser");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const apiHeaders = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
  Origin: 'https://www.cal-online.co.il',
  Referer: 'https://www.cal-online.co.il/',
  'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
  'Sec-Fetch-Site': 'same-site',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Dest': 'empty'
};
const LOGIN_URL = 'https://www.cal-online.co.il/';
const TRANSACTIONS_REQUEST_ENDPOINT = 'https://api.cal-online.co.il/Transactions/api/transactionsDetails/getCardTransactionsDetails';
const PENDING_TRANSACTIONS_REQUEST_ENDPOINT = 'https://api.cal-online.co.il/Transactions/api/approvals/getClearanceRequests';
const SSO_AUTHORIZATION_REQUEST_ENDPOINT = 'https://connect.cal-online.co.il/col-rest/calconnect/authentication/SSO';
const InvalidPasswordMessage = 'שם המשתמש או הסיסמה שהוזנו שגויים';
const debug = (0, _debug.getDebug)('visa-cal');
var TrnTypeCode = /*#__PURE__*/function (TrnTypeCode) {
  TrnTypeCode["regular"] = "5";
  TrnTypeCode["credit"] = "6";
  TrnTypeCode["installments"] = "8";
  TrnTypeCode["standingOrder"] = "9";
  return TrnTypeCode;
}(TrnTypeCode || {});
function isAuthModule(result) {
  return Boolean(result?.auth?.calConnectToken && String(result.auth.calConnectToken).trim());
}
function authModuleOrUndefined(result) {
  return isAuthModule(result) ? result : undefined;
}
function isPending(transaction) {
  return transaction.debCrdDate === undefined; // an arbitrary field that only appears in a completed transaction
}
function isCardTransactionDetails(result) {
  return result.result !== undefined;
}
function isCardPendingTransactionDetails(result) {
  return result.result !== undefined;
}
async function getLoginFrame(page) {
  let frame = null;
  debug('wait until login frame found');
  await (0, _waiting.waitUntil)(() => {
    frame = page.frames().find(f => f.url().includes('connect')) || null;
    return Promise.resolve(!!frame);
  }, 'wait for iframe with login form', 10000, 1000);
  if (!frame) {
    debug('failed to find login frame for 10 seconds');
    throw new Error('failed to extract login iframe');
  }
  return frame;
}
async function hasInvalidPasswordError(page) {
  const frame = await getLoginFrame(page);
  const errorFound = await (0, _elementsInteractions.elementPresentOnPage)(frame, 'div.general-error > div');
  const errorMessage = errorFound ? await (0, _elementsInteractions.pageEval)(frame, 'div.general-error > div', '', item => {
    return item.innerText;
  }) : '';
  return errorMessage === InvalidPasswordMessage;
}
async function hasChangePasswordForm(page) {
  const frame = await getLoginFrame(page);
  const errorFound = await (0, _elementsInteractions.elementPresentOnPage)(frame, '.change-password-subtitle');
  return errorFound;
}
function getPossibleLoginResults() {
  debug('return possible login results');
  const urls = {
    [_baseScraperWithBrowser.LoginResults.Success]: [/dashboard/i],
    [_baseScraperWithBrowser.LoginResults.InvalidPassword]: [async options => {
      const page = options?.page;
      if (!page) {
        return false;
      }
      return hasInvalidPasswordError(page);
    }],
    // [LoginResults.AccountBlocked]: [], // TODO add when reaching this scenario
    [_baseScraperWithBrowser.LoginResults.ChangePassword]: [async options => {
      const page = options?.page;
      if (!page) {
        return false;
      }
      return hasChangePasswordForm(page);
    }]
  };
  return urls;
}
function createLoginFields(credentials) {
  debug('create login fields for username and password');
  return [{
    selector: '[formcontrolname="userName"]',
    value: credentials.username
  }, {
    selector: '[formcontrolname="password"]',
    value: credentials.password
  }];
}
function convertParsedDataToTransactions(data, pendingData) {
  const pendingTransactions = pendingData?.result ? pendingData.result.cardsList.flatMap(card => card.authDetalisList) : [];
  const bankAccounts = data.flatMap(monthData => monthData.result.bankAccounts);
  const regularDebitDays = bankAccounts.flatMap(accounts => accounts.debitDates);
  const immediateDebitDays = bankAccounts.flatMap(accounts => accounts.immidiateDebits.debitDays);
  const completedTransactions = [...regularDebitDays, ...immediateDebitDays].flatMap(debitDate => debitDate.transactions);
  const all = [...pendingTransactions, ...completedTransactions];
  return all.map(transaction => {
    const numOfPayments = isPending(transaction) ? transaction.numberOfPayments : transaction.numOfPayments;
    const installments = numOfPayments ? {
      number: isPending(transaction) ? 1 : transaction.curPaymentNum,
      total: numOfPayments
    } : undefined;
    const date = (0, _moment.default)(transaction.trnPurchaseDate);
    const chargedAmount = (isPending(transaction) ? transaction.trnAmt : transaction.amtBeforeConvAndIndex) * -1;
    const originalAmount = transaction.trnAmt * (transaction.trnTypeCode === TrnTypeCode.credit ? 1 : -1);
    const result = {
      identifier: !isPending(transaction) ? transaction.trnIntId : undefined,
      type: [TrnTypeCode.regular, TrnTypeCode.standingOrder].includes(transaction.trnTypeCode) ? _transactions2.TransactionTypes.Normal : _transactions2.TransactionTypes.Installments,
      status: isPending(transaction) ? _transactions2.TransactionStatuses.Pending : _transactions2.TransactionStatuses.Completed,
      date: installments ? date.add(installments.number - 1, 'month').toISOString() : date.toISOString(),
      processedDate: isPending(transaction) ? date.toISOString() : new Date(transaction.debCrdDate).toISOString(),
      originalAmount,
      originalCurrency: transaction.trnCurrencySymbol,
      chargedAmount,
      chargedCurrency: !isPending(transaction) ? transaction.debCrdCurrencySymbol : undefined,
      description: transaction.merchantName,
      memo: transaction.transTypeCommentDetails.toString(),
      category: transaction.branchCodeDesc
    };
    if (installments) {
      result.installments = installments;
    }
    return result;
  });
}
class VisaCalScraper extends _baseScraperWithBrowser.BaseScraperWithBrowser {
  authorization = undefined;
  openLoginPopup = async () => {
    debug('open login popup, wait until login button available');
    await (0, _elementsInteractions.waitUntilElementFound)(this.page, '#ccLoginDesktopBtn', true);
    debug('click on the login button');
    await (0, _elementsInteractions.clickButton)(this.page, '#ccLoginDesktopBtn');
    debug('get the frame that holds the login');
    const frame = await getLoginFrame(this.page);
    debug('wait until the password login tab header is available');
    await (0, _elementsInteractions.waitUntilElementFound)(frame, '#regular-login');
    debug('navigate to the password login tab');
    await (0, _elementsInteractions.clickButton)(frame, '#regular-login');
    debug('wait until the password login tab is active');
    await (0, _elementsInteractions.waitUntilElementFound)(frame, 'regular-login');
    return frame;
  };
  async getCards() {
    const initData = await (0, _waiting.waitUntil)(() => (0, _storage.getFromSessionStorage)(this.page, 'init'), 'get init data in session storage', 10000, 1000);
    if (!initData) {
      throw new Error("could not find 'init' data in session storage");
    }
    return initData?.result.cards.map(({
      cardUniqueId,
      last4Digits
    }) => ({
      cardUniqueId,
      last4Digits
    }));
  }
  async getAuthorizationHeader() {
    if (!this.authorization) {
      debug('fetching authorization header');
      const authModule = await (0, _waiting.waitUntil)(async () => authModuleOrUndefined(await (0, _storage.getFromSessionStorage)(this.page, 'auth-module')), 'get authorization header with valid token in session storage', 10_000, 50);
      return `CALAuthScheme ${authModule.auth.calConnectToken}`;
    }
    return this.authorization;
  }
  async getXSiteId() {
    /*
      I don't know if the constant below will change in the feature.
      If so, use the next code:
        return this.page.evaluate(() => new Ut().xSiteId);
        To get the classname search for 'xSiteId' in the page source
      class Ut {
        constructor(_e, on, yn) {
            this.store = _e,
            this.config = on,
            this.eventBusService = yn,
            this.xSiteId = "09031987-273E-2311-906C-8AF85B17C8D9",
    */
    return Promise.resolve('09031987-273E-2311-906C-8AF85B17C8D9');
  }
  getLoginOptions(credentials) {
    this.authRequestPromise = this.page.waitForRequest(SSO_AUTHORIZATION_REQUEST_ENDPOINT, {
      timeout: 10_000
    }).catch(e => {
      debug('error while waiting for the token request', e);
      return undefined;
    });
    return {
      loginUrl: `${LOGIN_URL}`,
      fields: createLoginFields(credentials),
      submitButtonSelector: 'button[type="submit"]',
      possibleResults: getPossibleLoginResults(),
      checkReadiness: async () => (0, _elementsInteractions.waitUntilElementFound)(this.page, '#ccLoginDesktopBtn'),
      preAction: this.openLoginPopup,
      postAction: async () => {
        try {
          await (0, _navigation.waitForNavigation)(this.page);
          const currentUrl = await (0, _navigation.getCurrentUrl)(this.page);
          if (currentUrl.endsWith('site-tutorial')) {
            await (0, _elementsInteractions.clickButton)(this.page, 'button.btn-close');
          }
          const request = await this.authRequestPromise;
          this.authorization = String(request?.headers().authorization || '').trim();
        } catch (e) {
          const currentUrl = await (0, _navigation.getCurrentUrl)(this.page);
          if (currentUrl.endsWith('dashboard')) return;
          const requiresChangePassword = await hasChangePasswordForm(this.page);
          if (requiresChangePassword) return;
          throw e;
        }
      },
      userAgent: apiHeaders['User-Agent']
    };
  }
  async fetchData() {
    const defaultStartMoment = (0, _moment.default)().subtract(1, 'years').subtract(6, 'months').add(1, 'day');
    const startDate = this.options.startDate || defaultStartMoment.toDate();
    const startMoment = _moment.default.max(defaultStartMoment, (0, _moment.default)(startDate));
    debug(`fetch transactions starting ${startMoment.format()}`);
    const [cards, xSiteId, Authorization] = await Promise.all([this.getCards(), this.getXSiteId(), this.getAuthorizationHeader()]);
    const futureMonthsToScrape = this.options.futureMonthsToScrape ?? 1;
    const accounts = await Promise.all(cards.map(async card => {
      const finalMonthToFetchMoment = (0, _moment.default)().add(futureMonthsToScrape, 'month');
      const months = finalMonthToFetchMoment.diff(startMoment, 'months');
      const allMonthsData = [];
      debug(`fetch pending transactions for card ${card.cardUniqueId}`);
      let pendingData = await (0, _fetch.fetchPost)(PENDING_TRANSACTIONS_REQUEST_ENDPOINT, {
        cardUniqueIDArray: [card.cardUniqueId]
      }, {
        Authorization,
        'X-Site-Id': xSiteId,
        'Content-Type': 'application/json',
        ...apiHeaders
      });
      debug(`fetch completed transactions for card ${card.cardUniqueId}`);
      for (let i = 0; i <= months; i += 1) {
        const month = finalMonthToFetchMoment.clone().subtract(i, 'months');
        const monthData = await (0, _fetch.fetchPost)(TRANSACTIONS_REQUEST_ENDPOINT, {
          cardUniqueId: card.cardUniqueId,
          month: month.format('M'),
          year: month.format('YYYY')
        }, {
          Authorization,
          'X-Site-Id': xSiteId,
          'Content-Type': 'application/json',
          ...apiHeaders
        });
        if (monthData?.statusCode !== 1) throw new Error(`failed to fetch transactions for card ${card.last4Digits}. Message: ${monthData?.title || ''}`);
        if (!isCardTransactionDetails(monthData)) {
          throw new Error('monthData is not of type CardTransactionDetails');
        }
        allMonthsData.push(monthData);
      }
      if (pendingData?.statusCode !== 1 && pendingData?.statusCode !== 96) {
        debug(`failed to fetch pending transactions for card ${card.last4Digits}. Message: ${pendingData?.title || ''}`);
        pendingData = null;
      } else if (!isCardPendingTransactionDetails(pendingData)) {
        debug('pendingData is not of type CardTransactionDetails');
        pendingData = null;
      }
      const transactions = convertParsedDataToTransactions(allMonthsData, pendingData);
      debug('filter out old transactions');
      const txns = this.options.outputData?.enableTransactionsFilterByDate ?? true ? (0, _transactions.filterOldTransactions)(transactions, (0, _moment.default)(startDate), this.options.combineInstallments || false) : transactions;
      return {
        txns,
        accountNumber: card.last4Digits
      };
    }));
    debug('return the scraped accounts');
    debug(JSON.stringify(accounts, null, 2));
    return {
      success: true,
      accounts
    };
  }
}
var _default = exports.default = VisaCalScraper;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbW9tZW50IiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsInJlcXVpcmUiLCJfZGVidWciLCJfZWxlbWVudHNJbnRlcmFjdGlvbnMiLCJfZmV0Y2giLCJfbmF2aWdhdGlvbiIsIl9zdG9yYWdlIiwiX3RyYW5zYWN0aW9ucyIsIl93YWl0aW5nIiwiX3RyYW5zYWN0aW9uczIiLCJfYmFzZVNjcmFwZXJXaXRoQnJvd3NlciIsImUiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsImFwaUhlYWRlcnMiLCJPcmlnaW4iLCJSZWZlcmVyIiwiTE9HSU5fVVJMIiwiVFJBTlNBQ1RJT05TX1JFUVVFU1RfRU5EUE9JTlQiLCJQRU5ESU5HX1RSQU5TQUNUSU9OU19SRVFVRVNUX0VORFBPSU5UIiwiU1NPX0FVVEhPUklaQVRJT05fUkVRVUVTVF9FTkRQT0lOVCIsIkludmFsaWRQYXNzd29yZE1lc3NhZ2UiLCJkZWJ1ZyIsImdldERlYnVnIiwiVHJuVHlwZUNvZGUiLCJpc0F1dGhNb2R1bGUiLCJyZXN1bHQiLCJCb29sZWFuIiwiYXV0aCIsImNhbENvbm5lY3RUb2tlbiIsIlN0cmluZyIsInRyaW0iLCJhdXRoTW9kdWxlT3JVbmRlZmluZWQiLCJ1bmRlZmluZWQiLCJpc1BlbmRpbmciLCJ0cmFuc2FjdGlvbiIsImRlYkNyZERhdGUiLCJpc0NhcmRUcmFuc2FjdGlvbkRldGFpbHMiLCJpc0NhcmRQZW5kaW5nVHJhbnNhY3Rpb25EZXRhaWxzIiwiZ2V0TG9naW5GcmFtZSIsInBhZ2UiLCJmcmFtZSIsIndhaXRVbnRpbCIsImZyYW1lcyIsImZpbmQiLCJmIiwidXJsIiwiaW5jbHVkZXMiLCJQcm9taXNlIiwicmVzb2x2ZSIsIkVycm9yIiwiaGFzSW52YWxpZFBhc3N3b3JkRXJyb3IiLCJlcnJvckZvdW5kIiwiZWxlbWVudFByZXNlbnRPblBhZ2UiLCJlcnJvck1lc3NhZ2UiLCJwYWdlRXZhbCIsIml0ZW0iLCJpbm5lclRleHQiLCJoYXNDaGFuZ2VQYXNzd29yZEZvcm0iLCJnZXRQb3NzaWJsZUxvZ2luUmVzdWx0cyIsInVybHMiLCJMb2dpblJlc3VsdHMiLCJTdWNjZXNzIiwiSW52YWxpZFBhc3N3b3JkIiwib3B0aW9ucyIsIkNoYW5nZVBhc3N3b3JkIiwiY3JlYXRlTG9naW5GaWVsZHMiLCJjcmVkZW50aWFscyIsInNlbGVjdG9yIiwidmFsdWUiLCJ1c2VybmFtZSIsInBhc3N3b3JkIiwiY29udmVydFBhcnNlZERhdGFUb1RyYW5zYWN0aW9ucyIsImRhdGEiLCJwZW5kaW5nRGF0YSIsInBlbmRpbmdUcmFuc2FjdGlvbnMiLCJjYXJkc0xpc3QiLCJmbGF0TWFwIiwiY2FyZCIsImF1dGhEZXRhbGlzTGlzdCIsImJhbmtBY2NvdW50cyIsIm1vbnRoRGF0YSIsInJlZ3VsYXJEZWJpdERheXMiLCJhY2NvdW50cyIsImRlYml0RGF0ZXMiLCJpbW1lZGlhdGVEZWJpdERheXMiLCJpbW1pZGlhdGVEZWJpdHMiLCJkZWJpdERheXMiLCJjb21wbGV0ZWRUcmFuc2FjdGlvbnMiLCJkZWJpdERhdGUiLCJ0cmFuc2FjdGlvbnMiLCJhbGwiLCJtYXAiLCJudW1PZlBheW1lbnRzIiwibnVtYmVyT2ZQYXltZW50cyIsImluc3RhbGxtZW50cyIsIm51bWJlciIsImN1clBheW1lbnROdW0iLCJ0b3RhbCIsImRhdGUiLCJtb21lbnQiLCJ0cm5QdXJjaGFzZURhdGUiLCJjaGFyZ2VkQW1vdW50IiwidHJuQW10IiwiYW10QmVmb3JlQ29udkFuZEluZGV4Iiwib3JpZ2luYWxBbW91bnQiLCJ0cm5UeXBlQ29kZSIsImNyZWRpdCIsImlkZW50aWZpZXIiLCJ0cm5JbnRJZCIsInR5cGUiLCJyZWd1bGFyIiwic3RhbmRpbmdPcmRlciIsIlRyYW5zYWN0aW9uVHlwZXMiLCJOb3JtYWwiLCJJbnN0YWxsbWVudHMiLCJzdGF0dXMiLCJUcmFuc2FjdGlvblN0YXR1c2VzIiwiUGVuZGluZyIsIkNvbXBsZXRlZCIsImFkZCIsInRvSVNPU3RyaW5nIiwicHJvY2Vzc2VkRGF0ZSIsIkRhdGUiLCJvcmlnaW5hbEN1cnJlbmN5IiwidHJuQ3VycmVuY3lTeW1ib2wiLCJjaGFyZ2VkQ3VycmVuY3kiLCJkZWJDcmRDdXJyZW5jeVN5bWJvbCIsImRlc2NyaXB0aW9uIiwibWVyY2hhbnROYW1lIiwibWVtbyIsInRyYW5zVHlwZUNvbW1lbnREZXRhaWxzIiwidG9TdHJpbmciLCJjYXRlZ29yeSIsImJyYW5jaENvZGVEZXNjIiwiVmlzYUNhbFNjcmFwZXIiLCJCYXNlU2NyYXBlcldpdGhCcm93c2VyIiwiYXV0aG9yaXphdGlvbiIsIm9wZW5Mb2dpblBvcHVwIiwid2FpdFVudGlsRWxlbWVudEZvdW5kIiwiY2xpY2tCdXR0b24iLCJnZXRDYXJkcyIsImluaXREYXRhIiwiZ2V0RnJvbVNlc3Npb25TdG9yYWdlIiwiY2FyZHMiLCJjYXJkVW5pcXVlSWQiLCJsYXN0NERpZ2l0cyIsImdldEF1dGhvcml6YXRpb25IZWFkZXIiLCJhdXRoTW9kdWxlIiwiZ2V0WFNpdGVJZCIsImdldExvZ2luT3B0aW9ucyIsImF1dGhSZXF1ZXN0UHJvbWlzZSIsIndhaXRGb3JSZXF1ZXN0IiwidGltZW91dCIsImNhdGNoIiwibG9naW5VcmwiLCJmaWVsZHMiLCJzdWJtaXRCdXR0b25TZWxlY3RvciIsInBvc3NpYmxlUmVzdWx0cyIsImNoZWNrUmVhZGluZXNzIiwicHJlQWN0aW9uIiwicG9zdEFjdGlvbiIsIndhaXRGb3JOYXZpZ2F0aW9uIiwiY3VycmVudFVybCIsImdldEN1cnJlbnRVcmwiLCJlbmRzV2l0aCIsInJlcXVlc3QiLCJoZWFkZXJzIiwicmVxdWlyZXNDaGFuZ2VQYXNzd29yZCIsInVzZXJBZ2VudCIsImZldGNoRGF0YSIsImRlZmF1bHRTdGFydE1vbWVudCIsInN1YnRyYWN0Iiwic3RhcnREYXRlIiwidG9EYXRlIiwic3RhcnRNb21lbnQiLCJtYXgiLCJmb3JtYXQiLCJ4U2l0ZUlkIiwiQXV0aG9yaXphdGlvbiIsImZ1dHVyZU1vbnRoc1RvU2NyYXBlIiwiZmluYWxNb250aFRvRmV0Y2hNb21lbnQiLCJtb250aHMiLCJkaWZmIiwiYWxsTW9udGhzRGF0YSIsImZldGNoUG9zdCIsImNhcmRVbmlxdWVJREFycmF5IiwiaSIsIm1vbnRoIiwiY2xvbmUiLCJ5ZWFyIiwic3RhdHVzQ29kZSIsInRpdGxlIiwicHVzaCIsInR4bnMiLCJvdXRwdXREYXRhIiwiZW5hYmxlVHJhbnNhY3Rpb25zRmlsdGVyQnlEYXRlIiwiZmlsdGVyT2xkVHJhbnNhY3Rpb25zIiwiY29tYmluZUluc3RhbGxtZW50cyIsImFjY291bnROdW1iZXIiLCJKU09OIiwic3RyaW5naWZ5Iiwic3VjY2VzcyIsIl9kZWZhdWx0IiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9zY3JhcGVycy92aXNhLWNhbC50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgbW9tZW50IGZyb20gJ21vbWVudCc7XHJcbmltcG9ydCB7IHR5cGUgSFRUUFJlcXVlc3QsIHR5cGUgRnJhbWUsIHR5cGUgUGFnZSB9IGZyb20gJ3B1cHBldGVlcic7XHJcbmltcG9ydCB7IGdldERlYnVnIH0gZnJvbSAnLi4vaGVscGVycy9kZWJ1Zyc7XHJcbmltcG9ydCB7IGNsaWNrQnV0dG9uLCBlbGVtZW50UHJlc2VudE9uUGFnZSwgcGFnZUV2YWwsIHdhaXRVbnRpbEVsZW1lbnRGb3VuZCB9IGZyb20gJy4uL2hlbHBlcnMvZWxlbWVudHMtaW50ZXJhY3Rpb25zJztcclxuaW1wb3J0IHsgZmV0Y2hQb3N0IH0gZnJvbSAnLi4vaGVscGVycy9mZXRjaCc7XHJcbmltcG9ydCB7IGdldEN1cnJlbnRVcmwsIHdhaXRGb3JOYXZpZ2F0aW9uIH0gZnJvbSAnLi4vaGVscGVycy9uYXZpZ2F0aW9uJztcclxuaW1wb3J0IHsgZ2V0RnJvbVNlc3Npb25TdG9yYWdlIH0gZnJvbSAnLi4vaGVscGVycy9zdG9yYWdlJztcclxuaW1wb3J0IHsgZmlsdGVyT2xkVHJhbnNhY3Rpb25zIH0gZnJvbSAnLi4vaGVscGVycy90cmFuc2FjdGlvbnMnO1xyXG5pbXBvcnQgeyB3YWl0VW50aWwgfSBmcm9tICcuLi9oZWxwZXJzL3dhaXRpbmcnO1xyXG5pbXBvcnQgeyBUcmFuc2FjdGlvblN0YXR1c2VzLCBUcmFuc2FjdGlvblR5cGVzLCB0eXBlIFRyYW5zYWN0aW9uLCB0eXBlIFRyYW5zYWN0aW9uc0FjY291bnQgfSBmcm9tICcuLi90cmFuc2FjdGlvbnMnO1xyXG5pbXBvcnQgeyBCYXNlU2NyYXBlcldpdGhCcm93c2VyLCBMb2dpblJlc3VsdHMsIHR5cGUgTG9naW5PcHRpb25zIH0gZnJvbSAnLi9iYXNlLXNjcmFwZXItd2l0aC1icm93c2VyJztcclxuaW1wb3J0IHsgdHlwZSBTY3JhcGVyU2NyYXBpbmdSZXN1bHQgfSBmcm9tICcuL2ludGVyZmFjZSc7XHJcblxyXG5jb25zdCBhcGlIZWFkZXJzID0ge1xyXG4gICdVc2VyLUFnZW50JzpcclxuICAgICdNb3ppbGxhLzUuMCAoTWFjaW50b3NoOyBJbnRlbCBNYWMgT1MgWCAxMF8xNV83KSBBcHBsZVdlYktpdC81MzcuMzYgKEtIVE1MLCBsaWtlIEdlY2tvKSBDaHJvbWUvMTQyLjAuMC4wIFNhZmFyaS81MzcuMzYnLFxyXG4gIE9yaWdpbjogJ2h0dHBzOi8vd3d3LmNhbC1vbmxpbmUuY28uaWwnLFxyXG4gIFJlZmVyZXI6ICdodHRwczovL3d3dy5jYWwtb25saW5lLmNvLmlsLycsXHJcbiAgJ0FjY2VwdC1MYW5ndWFnZSc6ICdoZS1JTCxoZTtxPTAuOSxlbi1VUztxPTAuOCxlbjtxPTAuNycsXHJcbiAgJ1NlYy1GZXRjaC1TaXRlJzogJ3NhbWUtc2l0ZScsXHJcbiAgJ1NlYy1GZXRjaC1Nb2RlJzogJ2NvcnMnLFxyXG4gICdTZWMtRmV0Y2gtRGVzdCc6ICdlbXB0eScsXHJcbn07XHJcbmNvbnN0IExPR0lOX1VSTCA9ICdodHRwczovL3d3dy5jYWwtb25saW5lLmNvLmlsLyc7XHJcbmNvbnN0IFRSQU5TQUNUSU9OU19SRVFVRVNUX0VORFBPSU5UID1cclxuICAnaHR0cHM6Ly9hcGkuY2FsLW9ubGluZS5jby5pbC9UcmFuc2FjdGlvbnMvYXBpL3RyYW5zYWN0aW9uc0RldGFpbHMvZ2V0Q2FyZFRyYW5zYWN0aW9uc0RldGFpbHMnO1xyXG5jb25zdCBQRU5ESU5HX1RSQU5TQUNUSU9OU19SRVFVRVNUX0VORFBPSU5UID1cclxuICAnaHR0cHM6Ly9hcGkuY2FsLW9ubGluZS5jby5pbC9UcmFuc2FjdGlvbnMvYXBpL2FwcHJvdmFscy9nZXRDbGVhcmFuY2VSZXF1ZXN0cyc7XHJcbmNvbnN0IFNTT19BVVRIT1JJWkFUSU9OX1JFUVVFU1RfRU5EUE9JTlQgPSAnaHR0cHM6Ly9jb25uZWN0LmNhbC1vbmxpbmUuY28uaWwvY29sLXJlc3QvY2FsY29ubmVjdC9hdXRoZW50aWNhdGlvbi9TU08nO1xyXG5cclxuY29uc3QgSW52YWxpZFBhc3N3b3JkTWVzc2FnZSA9ICfXqdedINeU157Xqdeq157XqSDXkNeVINeU16HXmdeh157XlCDXqdeU15XXlteg15Ug16nXkteV15nXmdedJztcclxuXHJcbmNvbnN0IGRlYnVnID0gZ2V0RGVidWcoJ3Zpc2EtY2FsJyk7XHJcblxyXG5lbnVtIFRyblR5cGVDb2RlIHtcclxuICByZWd1bGFyID0gJzUnLFxyXG4gIGNyZWRpdCA9ICc2JyxcclxuICBpbnN0YWxsbWVudHMgPSAnOCcsXHJcbiAgc3RhbmRpbmdPcmRlciA9ICc5JyxcclxufVxyXG5cclxuaW50ZXJmYWNlIFNjcmFwZWRUcmFuc2FjdGlvbiB7XHJcbiAgYW10QmVmb3JlQ29udkFuZEluZGV4OiBudW1iZXI7XHJcbiAgYnJhbmNoQ29kZURlc2M6IHN0cmluZztcclxuICBjYXNoQWNjTWFuYWdlck5hbWU6IG51bGw7XHJcbiAgY2FzaEFjY291bnRNYW5hZ2VyOiBudWxsO1xyXG4gIGNhc2hBY2NvdW50VHJuQW10OiBudW1iZXI7XHJcbiAgY2hhcmdlRXh0ZXJuYWxUb0NhcmRDb21tZW50OiBzdHJpbmc7XHJcbiAgY29tbWVudHM6IFtdO1xyXG4gIGN1clBheW1lbnROdW06IG51bWJlcjtcclxuICBkZWJDcmRDdXJyZW5jeVN5bWJvbDogQ3VycmVuY3lTeW1ib2w7XHJcbiAgZGViQ3JkRGF0ZTogc3RyaW5nO1xyXG4gIGRlYml0U3ByZWFkSW5kOiBib29sZWFuO1xyXG4gIGRpc2NvdW50QW1vdW50OiB1bmtub3duO1xyXG4gIGRpc2NvdW50UmVhc29uOiB1bmtub3duO1xyXG4gIGltbWVkaWF0ZUNvbW1lbnRzOiBbXTtcclxuICBpc0ltbWVkaWF0ZUNvbW1lbnRJbmQ6IGJvb2xlYW47XHJcbiAgaXNJbW1lZGlhdGVISEtJbmQ6IGJvb2xlYW47XHJcbiAgaXNNYXJnYXJpdGE6IGJvb2xlYW47XHJcbiAgaXNTcHJlYWRQYXltZW5zdEFicm9hZDogYm9vbGVhbjtcclxuICBsaW5rZWRDb21tZW50czogW107XHJcbiAgbWVyY2hhbnRBZGRyZXNzOiBzdHJpbmc7XHJcbiAgbWVyY2hhbnROYW1lOiBzdHJpbmc7XHJcbiAgbWVyY2hhbnRQaG9uZU5vOiBzdHJpbmc7XHJcbiAgbnVtT2ZQYXltZW50czogbnVtYmVyO1xyXG4gIG9uR29pbmdUcmFuc2FjdGlvbnNDb21tZW50OiBzdHJpbmc7XHJcbiAgcmVmdW5kSW5kOiBib29sZWFuO1xyXG4gIHJvdW5kaW5nQW1vdW50OiB1bmtub3duO1xyXG4gIHJvdW5kaW5nUmVhc29uOiB1bmtub3duO1xyXG4gIHRva2VuSW5kOiAwO1xyXG4gIHRva2VuTnVtYmVyUGFydDQ6ICcnO1xyXG4gIHRyYW5zQ2FyZFByZXNlbnRJbmQ6IGJvb2xlYW47XHJcbiAgdHJhbnNUeXBlQ29tbWVudERldGFpbHM6IFtdO1xyXG4gIHRybkFtdDogbnVtYmVyO1xyXG4gIHRybkN1cnJlbmN5U3ltYm9sOiBDdXJyZW5jeVN5bWJvbDtcclxuICB0cm5FeGFjV2F5OiBudW1iZXI7XHJcbiAgdHJuSW50SWQ6IHN0cmluZztcclxuICB0cm5OdW1hcmV0b3I6IG51bWJlcjtcclxuICB0cm5QdXJjaGFzZURhdGU6IHN0cmluZztcclxuICB0cm5UeXBlOiBzdHJpbmc7XHJcbiAgdHJuVHlwZUNvZGU6IFRyblR5cGVDb2RlO1xyXG4gIHdhbGxldFByb3ZpZGVyQ29kZTogMDtcclxuICB3YWxsZXRQcm92aWRlckRlc2M6ICcnO1xyXG4gIGVhcmx5UGF5bWVudEluZDogYm9vbGVhbjtcclxufVxyXG5pbnRlcmZhY2UgU2NyYXBlZFBlbmRpbmdUcmFuc2FjdGlvbiB7XHJcbiAgbWVyY2hhbnRJRDogc3RyaW5nO1xyXG4gIG1lcmNoYW50TmFtZTogc3RyaW5nO1xyXG4gIHRyblB1cmNoYXNlRGF0ZTogc3RyaW5nO1xyXG4gIHdhbGxldFRyYW5JbmQ6IG51bWJlcjtcclxuICB0cmFuc2FjdGlvbnNPcmlnaW46IG51bWJlcjtcclxuICB0cm5BbXQ6IG51bWJlcjtcclxuICB0cGFBcHByb3ZhbEFtb3VudDogdW5rbm93bjtcclxuICB0cm5DdXJyZW5jeVN5bWJvbDogQ3VycmVuY3lTeW1ib2w7XHJcbiAgdHJuVHlwZUNvZGU6IFRyblR5cGVDb2RlO1xyXG4gIHRyblR5cGU6IHN0cmluZztcclxuICBicmFuY2hDb2RlRGVzYzogc3RyaW5nO1xyXG4gIHRyYW5zQ2FyZFByZXNlbnRJbmQ6IGJvb2xlYW47XHJcbiAgajVJbmRpY2F0b3I6IHN0cmluZztcclxuICBudW1iZXJPZlBheW1lbnRzOiBudW1iZXI7XHJcbiAgZmlyc3RQYXltZW50QW1vdW50OiBudW1iZXI7XHJcbiAgdHJhbnNUeXBlQ29tbWVudERldGFpbHM6IFtdO1xyXG59XHJcbmludGVyZmFjZSBJbml0UmVzcG9uc2Uge1xyXG4gIHJlc3VsdDoge1xyXG4gICAgY2FyZHM6IHtcclxuICAgICAgY2FyZFVuaXF1ZUlkOiBzdHJpbmc7XHJcbiAgICAgIGxhc3Q0RGlnaXRzOiBzdHJpbmc7XHJcbiAgICAgIFtrZXk6IHN0cmluZ106IHVua25vd247XHJcbiAgICB9W107XHJcbiAgfTtcclxufVxyXG50eXBlIEN1cnJlbmN5U3ltYm9sID0gc3RyaW5nO1xyXG5pbnRlcmZhY2UgQ2FyZFRyYW5zYWN0aW9uRGV0YWlsc0Vycm9yIHtcclxuICB0aXRsZTogc3RyaW5nO1xyXG4gIHN0YXR1c0NvZGU6IG51bWJlcjtcclxufVxyXG5pbnRlcmZhY2UgQ2FyZFRyYW5zYWN0aW9uRGV0YWlscyBleHRlbmRzIENhcmRUcmFuc2FjdGlvbkRldGFpbHNFcnJvciB7XHJcbiAgcmVzdWx0OiB7XHJcbiAgICBiYW5rQWNjb3VudHM6IHtcclxuICAgICAgYmFua0FjY291bnROdW06IHN0cmluZztcclxuICAgICAgYmFua05hbWU6IHN0cmluZztcclxuICAgICAgY2hvaWNlRXh0ZXJuYWxUcmFuc2FjdGlvbnM6IGFueTtcclxuICAgICAgY3VycmVudEJhbmtBY2NvdW50SW5kOiBib29sZWFuO1xyXG4gICAgICBkZWJpdERhdGVzOiB7XHJcbiAgICAgICAgYmFza2V0QW1vdW50Q29tbWVudDogdW5rbm93bjtcclxuICAgICAgICBjaG9pY2VISEtEZWJpdDogbnVtYmVyO1xyXG4gICAgICAgIGRhdGU6IHN0cmluZztcclxuICAgICAgICBkZWJpdFJlYXNvbjogdW5rbm93bjtcclxuICAgICAgICBmaXhEZWJpdEFtb3VudDogbnVtYmVyO1xyXG4gICAgICAgIGZyb21QdXJjaGFzZURhdGU6IHN0cmluZztcclxuICAgICAgICBpc0Nob2ljZVJlcGFpbWVudDogYm9vbGVhbjtcclxuICAgICAgICB0b1B1cmNoYXNlRGF0ZTogc3RyaW5nO1xyXG4gICAgICAgIHRvdGFsQmFza2V0QW1vdW50OiBudW1iZXI7XHJcbiAgICAgICAgdG90YWxEZWJpdHM6IHtcclxuICAgICAgICAgIGN1cnJlbmN5U3ltYm9sOiBDdXJyZW5jeVN5bWJvbDtcclxuICAgICAgICAgIGFtb3VudDogbnVtYmVyO1xyXG4gICAgICAgIH1bXTtcclxuICAgICAgICB0cmFuc2FjdGlvbnM6IFNjcmFwZWRUcmFuc2FjdGlvbltdO1xyXG4gICAgICB9W107XHJcbiAgICAgIGltbWlkaWF0ZURlYml0czogeyB0b3RhbERlYml0czogW107IGRlYml0RGF5czogW10gfTtcclxuICAgIH1bXTtcclxuICAgIGJsb2NrZWRDYXJkSW5kOiBib29sZWFuO1xyXG4gIH07XHJcbiAgc3RhdHVzQ29kZTogMTtcclxuICBzdGF0dXNEZXNjcmlwdGlvbjogc3RyaW5nO1xyXG4gIHN0YXR1c1RpdGxlOiBzdHJpbmc7XHJcbn1cclxuaW50ZXJmYWNlIENhcmRQZW5kaW5nVHJhbnNhY3Rpb25EZXRhaWxzIGV4dGVuZHMgQ2FyZFRyYW5zYWN0aW9uRGV0YWlsc0Vycm9yIHtcclxuICByZXN1bHQ6IHtcclxuICAgIGNhcmRzTGlzdDoge1xyXG4gICAgICBjYXJkVW5pcXVlSUQ6IHN0cmluZztcclxuICAgICAgYXV0aERldGFsaXNMaXN0OiBTY3JhcGVkUGVuZGluZ1RyYW5zYWN0aW9uW107XHJcbiAgICB9W107XHJcbiAgfTtcclxuICBzdGF0dXNDb2RlOiAxO1xyXG4gIHN0YXR1c0Rlc2NyaXB0aW9uOiBzdHJpbmc7XHJcbiAgc3RhdHVzVGl0bGU6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIEF1dGhNb2R1bGUge1xyXG4gIGF1dGg6IHtcclxuICAgIGNhbENvbm5lY3RUb2tlbjogc3RyaW5nIHwgbnVsbDtcclxuICB9O1xyXG59XHJcblxyXG5mdW5jdGlvbiBpc0F1dGhNb2R1bGUocmVzdWx0OiBhbnkpOiByZXN1bHQgaXMgQXV0aE1vZHVsZSB7XHJcbiAgcmV0dXJuIEJvb2xlYW4ocmVzdWx0Py5hdXRoPy5jYWxDb25uZWN0VG9rZW4gJiYgU3RyaW5nKHJlc3VsdC5hdXRoLmNhbENvbm5lY3RUb2tlbikudHJpbSgpKTtcclxufVxyXG5cclxuZnVuY3Rpb24gYXV0aE1vZHVsZU9yVW5kZWZpbmVkKHJlc3VsdDogYW55KTogQXV0aE1vZHVsZSB8IHVuZGVmaW5lZCB7XHJcbiAgcmV0dXJuIGlzQXV0aE1vZHVsZShyZXN1bHQpID8gcmVzdWx0IDogdW5kZWZpbmVkO1xyXG59XHJcblxyXG5mdW5jdGlvbiBpc1BlbmRpbmcoXHJcbiAgdHJhbnNhY3Rpb246IFNjcmFwZWRUcmFuc2FjdGlvbiB8IFNjcmFwZWRQZW5kaW5nVHJhbnNhY3Rpb24sXHJcbik6IHRyYW5zYWN0aW9uIGlzIFNjcmFwZWRQZW5kaW5nVHJhbnNhY3Rpb24ge1xyXG4gIHJldHVybiAodHJhbnNhY3Rpb24gYXMgU2NyYXBlZFRyYW5zYWN0aW9uKS5kZWJDcmREYXRlID09PSB1bmRlZmluZWQ7IC8vIGFuIGFyYml0cmFyeSBmaWVsZCB0aGF0IG9ubHkgYXBwZWFycyBpbiBhIGNvbXBsZXRlZCB0cmFuc2FjdGlvblxyXG59XHJcblxyXG5mdW5jdGlvbiBpc0NhcmRUcmFuc2FjdGlvbkRldGFpbHMoXHJcbiAgcmVzdWx0OiBDYXJkVHJhbnNhY3Rpb25EZXRhaWxzIHwgQ2FyZFRyYW5zYWN0aW9uRGV0YWlsc0Vycm9yLFxyXG4pOiByZXN1bHQgaXMgQ2FyZFRyYW5zYWN0aW9uRGV0YWlscyB7XHJcbiAgcmV0dXJuIChyZXN1bHQgYXMgQ2FyZFRyYW5zYWN0aW9uRGV0YWlscykucmVzdWx0ICE9PSB1bmRlZmluZWQ7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGlzQ2FyZFBlbmRpbmdUcmFuc2FjdGlvbkRldGFpbHMoXHJcbiAgcmVzdWx0OiBDYXJkUGVuZGluZ1RyYW5zYWN0aW9uRGV0YWlscyB8IENhcmRUcmFuc2FjdGlvbkRldGFpbHNFcnJvcixcclxuKTogcmVzdWx0IGlzIENhcmRQZW5kaW5nVHJhbnNhY3Rpb25EZXRhaWxzIHtcclxuICByZXR1cm4gKHJlc3VsdCBhcyBDYXJkUGVuZGluZ1RyYW5zYWN0aW9uRGV0YWlscykucmVzdWx0ICE9PSB1bmRlZmluZWQ7XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGdldExvZ2luRnJhbWUocGFnZTogUGFnZSkge1xyXG4gIGxldCBmcmFtZTogRnJhbWUgfCBudWxsID0gbnVsbDtcclxuICBkZWJ1Zygnd2FpdCB1bnRpbCBsb2dpbiBmcmFtZSBmb3VuZCcpO1xyXG4gIGF3YWl0IHdhaXRVbnRpbChcclxuICAgICgpID0+IHtcclxuICAgICAgZnJhbWUgPSBwYWdlLmZyYW1lcygpLmZpbmQoZiA9PiBmLnVybCgpLmluY2x1ZGVzKCdjb25uZWN0JykpIHx8IG51bGw7XHJcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoISFmcmFtZSk7XHJcbiAgICB9LFxyXG4gICAgJ3dhaXQgZm9yIGlmcmFtZSB3aXRoIGxvZ2luIGZvcm0nLFxyXG4gICAgMTAwMDAsXHJcbiAgICAxMDAwLFxyXG4gICk7XHJcblxyXG4gIGlmICghZnJhbWUpIHtcclxuICAgIGRlYnVnKCdmYWlsZWQgdG8gZmluZCBsb2dpbiBmcmFtZSBmb3IgMTAgc2Vjb25kcycpO1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKCdmYWlsZWQgdG8gZXh0cmFjdCBsb2dpbiBpZnJhbWUnKTtcclxuICB9XHJcblxyXG4gIHJldHVybiBmcmFtZTtcclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gaGFzSW52YWxpZFBhc3N3b3JkRXJyb3IocGFnZTogUGFnZSkge1xyXG4gIGNvbnN0IGZyYW1lID0gYXdhaXQgZ2V0TG9naW5GcmFtZShwYWdlKTtcclxuICBjb25zdCBlcnJvckZvdW5kID0gYXdhaXQgZWxlbWVudFByZXNlbnRPblBhZ2UoZnJhbWUsICdkaXYuZ2VuZXJhbC1lcnJvciA+IGRpdicpO1xyXG4gIGNvbnN0IGVycm9yTWVzc2FnZSA9IGVycm9yRm91bmRcclxuICAgID8gYXdhaXQgcGFnZUV2YWwoZnJhbWUsICdkaXYuZ2VuZXJhbC1lcnJvciA+IGRpdicsICcnLCBpdGVtID0+IHtcclxuICAgICAgICByZXR1cm4gKGl0ZW0gYXMgSFRNTERpdkVsZW1lbnQpLmlubmVyVGV4dDtcclxuICAgICAgfSlcclxuICAgIDogJyc7XHJcbiAgcmV0dXJuIGVycm9yTWVzc2FnZSA9PT0gSW52YWxpZFBhc3N3b3JkTWVzc2FnZTtcclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gaGFzQ2hhbmdlUGFzc3dvcmRGb3JtKHBhZ2U6IFBhZ2UpIHtcclxuICBjb25zdCBmcmFtZSA9IGF3YWl0IGdldExvZ2luRnJhbWUocGFnZSk7XHJcbiAgY29uc3QgZXJyb3JGb3VuZCA9IGF3YWl0IGVsZW1lbnRQcmVzZW50T25QYWdlKGZyYW1lLCAnLmNoYW5nZS1wYXNzd29yZC1zdWJ0aXRsZScpO1xyXG4gIHJldHVybiBlcnJvckZvdW5kO1xyXG59XHJcblxyXG5mdW5jdGlvbiBnZXRQb3NzaWJsZUxvZ2luUmVzdWx0cygpIHtcclxuICBkZWJ1ZygncmV0dXJuIHBvc3NpYmxlIGxvZ2luIHJlc3VsdHMnKTtcclxuICBjb25zdCB1cmxzOiBMb2dpbk9wdGlvbnNbJ3Bvc3NpYmxlUmVzdWx0cyddID0ge1xyXG4gICAgW0xvZ2luUmVzdWx0cy5TdWNjZXNzXTogWy9kYXNoYm9hcmQvaV0sXHJcbiAgICBbTG9naW5SZXN1bHRzLkludmFsaWRQYXNzd29yZF06IFtcclxuICAgICAgYXN5bmMgKG9wdGlvbnM/OiB7IHBhZ2U/OiBQYWdlIH0pID0+IHtcclxuICAgICAgICBjb25zdCBwYWdlID0gb3B0aW9ucz8ucGFnZTtcclxuICAgICAgICBpZiAoIXBhZ2UpIHtcclxuICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGhhc0ludmFsaWRQYXNzd29yZEVycm9yKHBhZ2UpO1xyXG4gICAgICB9LFxyXG4gICAgXSxcclxuICAgIC8vIFtMb2dpblJlc3VsdHMuQWNjb3VudEJsb2NrZWRdOiBbXSwgLy8gVE9ETyBhZGQgd2hlbiByZWFjaGluZyB0aGlzIHNjZW5hcmlvXHJcbiAgICBbTG9naW5SZXN1bHRzLkNoYW5nZVBhc3N3b3JkXTogW1xyXG4gICAgICBhc3luYyAob3B0aW9ucz86IHsgcGFnZT86IFBhZ2UgfSkgPT4ge1xyXG4gICAgICAgIGNvbnN0IHBhZ2UgPSBvcHRpb25zPy5wYWdlO1xyXG4gICAgICAgIGlmICghcGFnZSkge1xyXG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gaGFzQ2hhbmdlUGFzc3dvcmRGb3JtKHBhZ2UpO1xyXG4gICAgICB9LFxyXG4gICAgXSxcclxuICB9O1xyXG4gIHJldHVybiB1cmxzO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjcmVhdGVMb2dpbkZpZWxkcyhjcmVkZW50aWFsczogU2NyYXBlclNwZWNpZmljQ3JlZGVudGlhbHMpIHtcclxuICBkZWJ1ZygnY3JlYXRlIGxvZ2luIGZpZWxkcyBmb3IgdXNlcm5hbWUgYW5kIHBhc3N3b3JkJyk7XHJcbiAgcmV0dXJuIFtcclxuICAgIHsgc2VsZWN0b3I6ICdbZm9ybWNvbnRyb2xuYW1lPVwidXNlck5hbWVcIl0nLCB2YWx1ZTogY3JlZGVudGlhbHMudXNlcm5hbWUgfSxcclxuICAgIHsgc2VsZWN0b3I6ICdbZm9ybWNvbnRyb2xuYW1lPVwicGFzc3dvcmRcIl0nLCB2YWx1ZTogY3JlZGVudGlhbHMucGFzc3dvcmQgfSxcclxuICBdO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjb252ZXJ0UGFyc2VkRGF0YVRvVHJhbnNhY3Rpb25zKFxyXG4gIGRhdGE6IENhcmRUcmFuc2FjdGlvbkRldGFpbHNbXSxcclxuICBwZW5kaW5nRGF0YT86IENhcmRQZW5kaW5nVHJhbnNhY3Rpb25EZXRhaWxzIHwgbnVsbCxcclxuKTogVHJhbnNhY3Rpb25bXSB7XHJcbiAgY29uc3QgcGVuZGluZ1RyYW5zYWN0aW9ucyA9IHBlbmRpbmdEYXRhPy5yZXN1bHRcclxuICAgID8gcGVuZGluZ0RhdGEucmVzdWx0LmNhcmRzTGlzdC5mbGF0TWFwKGNhcmQgPT4gY2FyZC5hdXRoRGV0YWxpc0xpc3QpXHJcbiAgICA6IFtdO1xyXG5cclxuICBjb25zdCBiYW5rQWNjb3VudHMgPSBkYXRhLmZsYXRNYXAobW9udGhEYXRhID0+IG1vbnRoRGF0YS5yZXN1bHQuYmFua0FjY291bnRzKTtcclxuICBjb25zdCByZWd1bGFyRGViaXREYXlzID0gYmFua0FjY291bnRzLmZsYXRNYXAoYWNjb3VudHMgPT4gYWNjb3VudHMuZGViaXREYXRlcyk7XHJcbiAgY29uc3QgaW1tZWRpYXRlRGViaXREYXlzID0gYmFua0FjY291bnRzLmZsYXRNYXAoYWNjb3VudHMgPT4gYWNjb3VudHMuaW1taWRpYXRlRGViaXRzLmRlYml0RGF5cyk7XHJcbiAgY29uc3QgY29tcGxldGVkVHJhbnNhY3Rpb25zID0gWy4uLnJlZ3VsYXJEZWJpdERheXMsIC4uLmltbWVkaWF0ZURlYml0RGF5c10uZmxhdE1hcChcclxuICAgIGRlYml0RGF0ZSA9PiBkZWJpdERhdGUudHJhbnNhY3Rpb25zLFxyXG4gICk7XHJcblxyXG4gIGNvbnN0IGFsbDogKFNjcmFwZWRUcmFuc2FjdGlvbiB8IFNjcmFwZWRQZW5kaW5nVHJhbnNhY3Rpb24pW10gPSBbLi4ucGVuZGluZ1RyYW5zYWN0aW9ucywgLi4uY29tcGxldGVkVHJhbnNhY3Rpb25zXTtcclxuXHJcbiAgcmV0dXJuIGFsbC5tYXAodHJhbnNhY3Rpb24gPT4ge1xyXG4gICAgY29uc3QgbnVtT2ZQYXltZW50cyA9IGlzUGVuZGluZyh0cmFuc2FjdGlvbikgPyB0cmFuc2FjdGlvbi5udW1iZXJPZlBheW1lbnRzIDogdHJhbnNhY3Rpb24ubnVtT2ZQYXltZW50cztcclxuICAgIGNvbnN0IGluc3RhbGxtZW50cyA9IG51bU9mUGF5bWVudHNcclxuICAgICAgPyB7XHJcbiAgICAgICAgICBudW1iZXI6IGlzUGVuZGluZyh0cmFuc2FjdGlvbikgPyAxIDogdHJhbnNhY3Rpb24uY3VyUGF5bWVudE51bSxcclxuICAgICAgICAgIHRvdGFsOiBudW1PZlBheW1lbnRzLFxyXG4gICAgICAgIH1cclxuICAgICAgOiB1bmRlZmluZWQ7XHJcblxyXG4gICAgY29uc3QgZGF0ZSA9IG1vbWVudCh0cmFuc2FjdGlvbi50cm5QdXJjaGFzZURhdGUpO1xyXG5cclxuICAgIGNvbnN0IGNoYXJnZWRBbW91bnQgPSAoaXNQZW5kaW5nKHRyYW5zYWN0aW9uKSA/IHRyYW5zYWN0aW9uLnRybkFtdCA6IHRyYW5zYWN0aW9uLmFtdEJlZm9yZUNvbnZBbmRJbmRleCkgKiAtMTtcclxuICAgIGNvbnN0IG9yaWdpbmFsQW1vdW50ID0gdHJhbnNhY3Rpb24udHJuQW10ICogKHRyYW5zYWN0aW9uLnRyblR5cGVDb2RlID09PSBUcm5UeXBlQ29kZS5jcmVkaXQgPyAxIDogLTEpO1xyXG5cclxuICAgIGNvbnN0IHJlc3VsdDogVHJhbnNhY3Rpb24gPSB7XHJcbiAgICAgIGlkZW50aWZpZXI6ICFpc1BlbmRpbmcodHJhbnNhY3Rpb24pID8gdHJhbnNhY3Rpb24udHJuSW50SWQgOiB1bmRlZmluZWQsXHJcbiAgICAgIHR5cGU6IFtUcm5UeXBlQ29kZS5yZWd1bGFyLCBUcm5UeXBlQ29kZS5zdGFuZGluZ09yZGVyXS5pbmNsdWRlcyh0cmFuc2FjdGlvbi50cm5UeXBlQ29kZSlcclxuICAgICAgICA/IFRyYW5zYWN0aW9uVHlwZXMuTm9ybWFsXHJcbiAgICAgICAgOiBUcmFuc2FjdGlvblR5cGVzLkluc3RhbGxtZW50cyxcclxuICAgICAgc3RhdHVzOiBpc1BlbmRpbmcodHJhbnNhY3Rpb24pID8gVHJhbnNhY3Rpb25TdGF0dXNlcy5QZW5kaW5nIDogVHJhbnNhY3Rpb25TdGF0dXNlcy5Db21wbGV0ZWQsXHJcbiAgICAgIGRhdGU6IGluc3RhbGxtZW50cyA/IGRhdGUuYWRkKGluc3RhbGxtZW50cy5udW1iZXIgLSAxLCAnbW9udGgnKS50b0lTT1N0cmluZygpIDogZGF0ZS50b0lTT1N0cmluZygpLFxyXG4gICAgICBwcm9jZXNzZWREYXRlOiBpc1BlbmRpbmcodHJhbnNhY3Rpb24pID8gZGF0ZS50b0lTT1N0cmluZygpIDogbmV3IERhdGUodHJhbnNhY3Rpb24uZGViQ3JkRGF0ZSkudG9JU09TdHJpbmcoKSxcclxuICAgICAgb3JpZ2luYWxBbW91bnQsXHJcbiAgICAgIG9yaWdpbmFsQ3VycmVuY3k6IHRyYW5zYWN0aW9uLnRybkN1cnJlbmN5U3ltYm9sLFxyXG4gICAgICBjaGFyZ2VkQW1vdW50LFxyXG4gICAgICBjaGFyZ2VkQ3VycmVuY3k6ICFpc1BlbmRpbmcodHJhbnNhY3Rpb24pID8gdHJhbnNhY3Rpb24uZGViQ3JkQ3VycmVuY3lTeW1ib2wgOiB1bmRlZmluZWQsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiB0cmFuc2FjdGlvbi5tZXJjaGFudE5hbWUsXHJcbiAgICAgIG1lbW86IHRyYW5zYWN0aW9uLnRyYW5zVHlwZUNvbW1lbnREZXRhaWxzLnRvU3RyaW5nKCksXHJcbiAgICAgIGNhdGVnb3J5OiB0cmFuc2FjdGlvbi5icmFuY2hDb2RlRGVzYyxcclxuICAgIH07XHJcblxyXG4gICAgaWYgKGluc3RhbGxtZW50cykge1xyXG4gICAgICByZXN1bHQuaW5zdGFsbG1lbnRzID0gaW5zdGFsbG1lbnRzO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiByZXN1bHQ7XHJcbiAgfSk7XHJcbn1cclxuXHJcbnR5cGUgU2NyYXBlclNwZWNpZmljQ3JlZGVudGlhbHMgPSB7IHVzZXJuYW1lOiBzdHJpbmc7IHBhc3N3b3JkOiBzdHJpbmcgfTtcclxuXHJcbmNsYXNzIFZpc2FDYWxTY3JhcGVyIGV4dGVuZHMgQmFzZVNjcmFwZXJXaXRoQnJvd3NlcjxTY3JhcGVyU3BlY2lmaWNDcmVkZW50aWFscz4ge1xyXG4gIHByaXZhdGUgYXV0aG9yaXphdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xyXG5cclxuICBwcml2YXRlIGF1dGhSZXF1ZXN0UHJvbWlzZTogUHJvbWlzZTxIVFRQUmVxdWVzdCB8IHVuZGVmaW5lZD4gfCB1bmRlZmluZWQ7XHJcblxyXG4gIG9wZW5Mb2dpblBvcHVwID0gYXN5bmMgKCkgPT4ge1xyXG4gICAgZGVidWcoJ29wZW4gbG9naW4gcG9wdXAsIHdhaXQgdW50aWwgbG9naW4gYnV0dG9uIGF2YWlsYWJsZScpO1xyXG4gICAgYXdhaXQgd2FpdFVudGlsRWxlbWVudEZvdW5kKHRoaXMucGFnZSwgJyNjY0xvZ2luRGVza3RvcEJ0bicsIHRydWUpO1xyXG4gICAgZGVidWcoJ2NsaWNrIG9uIHRoZSBsb2dpbiBidXR0b24nKTtcclxuICAgIGF3YWl0IGNsaWNrQnV0dG9uKHRoaXMucGFnZSwgJyNjY0xvZ2luRGVza3RvcEJ0bicpO1xyXG4gICAgZGVidWcoJ2dldCB0aGUgZnJhbWUgdGhhdCBob2xkcyB0aGUgbG9naW4nKTtcclxuICAgIGNvbnN0IGZyYW1lID0gYXdhaXQgZ2V0TG9naW5GcmFtZSh0aGlzLnBhZ2UpO1xyXG4gICAgZGVidWcoJ3dhaXQgdW50aWwgdGhlIHBhc3N3b3JkIGxvZ2luIHRhYiBoZWFkZXIgaXMgYXZhaWxhYmxlJyk7XHJcbiAgICBhd2FpdCB3YWl0VW50aWxFbGVtZW50Rm91bmQoZnJhbWUsICcjcmVndWxhci1sb2dpbicpO1xyXG4gICAgZGVidWcoJ25hdmlnYXRlIHRvIHRoZSBwYXNzd29yZCBsb2dpbiB0YWInKTtcclxuICAgIGF3YWl0IGNsaWNrQnV0dG9uKGZyYW1lLCAnI3JlZ3VsYXItbG9naW4nKTtcclxuICAgIGRlYnVnKCd3YWl0IHVudGlsIHRoZSBwYXNzd29yZCBsb2dpbiB0YWIgaXMgYWN0aXZlJyk7XHJcbiAgICBhd2FpdCB3YWl0VW50aWxFbGVtZW50Rm91bmQoZnJhbWUsICdyZWd1bGFyLWxvZ2luJyk7XHJcblxyXG4gICAgcmV0dXJuIGZyYW1lO1xyXG4gIH07XHJcblxyXG4gIGFzeW5jIGdldENhcmRzKCkge1xyXG4gICAgY29uc3QgaW5pdERhdGEgPSBhd2FpdCB3YWl0VW50aWwoXHJcbiAgICAgICgpID0+IGdldEZyb21TZXNzaW9uU3RvcmFnZTxJbml0UmVzcG9uc2U+KHRoaXMucGFnZSwgJ2luaXQnKSxcclxuICAgICAgJ2dldCBpbml0IGRhdGEgaW4gc2Vzc2lvbiBzdG9yYWdlJyxcclxuICAgICAgMTAwMDAsXHJcbiAgICAgIDEwMDAsXHJcbiAgICApO1xyXG4gICAgaWYgKCFpbml0RGF0YSkge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJjb3VsZCBub3QgZmluZCAnaW5pdCcgZGF0YSBpbiBzZXNzaW9uIHN0b3JhZ2VcIik7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gaW5pdERhdGE/LnJlc3VsdC5jYXJkcy5tYXAoKHsgY2FyZFVuaXF1ZUlkLCBsYXN0NERpZ2l0cyB9KSA9PiAoeyBjYXJkVW5pcXVlSWQsIGxhc3Q0RGlnaXRzIH0pKTtcclxuICB9XHJcblxyXG4gIGFzeW5jIGdldEF1dGhvcml6YXRpb25IZWFkZXIoKSB7XHJcbiAgICBpZiAoIXRoaXMuYXV0aG9yaXphdGlvbikge1xyXG4gICAgICBkZWJ1ZygnZmV0Y2hpbmcgYXV0aG9yaXphdGlvbiBoZWFkZXInKTtcclxuICAgICAgY29uc3QgYXV0aE1vZHVsZSA9IGF3YWl0IHdhaXRVbnRpbChcclxuICAgICAgICBhc3luYyAoKSA9PiBhdXRoTW9kdWxlT3JVbmRlZmluZWQoYXdhaXQgZ2V0RnJvbVNlc3Npb25TdG9yYWdlPEF1dGhNb2R1bGU+KHRoaXMucGFnZSwgJ2F1dGgtbW9kdWxlJykpLFxyXG4gICAgICAgICdnZXQgYXV0aG9yaXphdGlvbiBoZWFkZXIgd2l0aCB2YWxpZCB0b2tlbiBpbiBzZXNzaW9uIHN0b3JhZ2UnLFxyXG4gICAgICAgIDEwXzAwMCxcclxuICAgICAgICA1MCxcclxuICAgICAgKTtcclxuICAgICAgcmV0dXJuIGBDQUxBdXRoU2NoZW1lICR7YXV0aE1vZHVsZS5hdXRoLmNhbENvbm5lY3RUb2tlbn1gO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHRoaXMuYXV0aG9yaXphdGlvbjtcclxuICB9XHJcblxyXG4gIGFzeW5jIGdldFhTaXRlSWQoKSB7XHJcbiAgICAvKlxyXG4gICAgICBJIGRvbid0IGtub3cgaWYgdGhlIGNvbnN0YW50IGJlbG93IHdpbGwgY2hhbmdlIGluIHRoZSBmZWF0dXJlLlxyXG4gICAgICBJZiBzbywgdXNlIHRoZSBuZXh0IGNvZGU6XHJcblxyXG4gICAgICByZXR1cm4gdGhpcy5wYWdlLmV2YWx1YXRlKCgpID0+IG5ldyBVdCgpLnhTaXRlSWQpO1xyXG5cclxuICAgICAgVG8gZ2V0IHRoZSBjbGFzc25hbWUgc2VhcmNoIGZvciAneFNpdGVJZCcgaW4gdGhlIHBhZ2Ugc291cmNlXHJcbiAgICAgIGNsYXNzIFV0IHtcclxuICAgICAgICBjb25zdHJ1Y3RvcihfZSwgb24sIHluKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc3RvcmUgPSBfZSxcclxuICAgICAgICAgICAgdGhpcy5jb25maWcgPSBvbixcclxuICAgICAgICAgICAgdGhpcy5ldmVudEJ1c1NlcnZpY2UgPSB5bixcclxuICAgICAgICAgICAgdGhpcy54U2l0ZUlkID0gXCIwOTAzMTk4Ny0yNzNFLTIzMTEtOTA2Qy04QUY4NUIxN0M4RDlcIixcclxuICAgICovXHJcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCcwOTAzMTk4Ny0yNzNFLTIzMTEtOTA2Qy04QUY4NUIxN0M4RDknKTtcclxuICB9XHJcblxyXG4gIGdldExvZ2luT3B0aW9ucyhjcmVkZW50aWFsczogU2NyYXBlclNwZWNpZmljQ3JlZGVudGlhbHMpOiBMb2dpbk9wdGlvbnMge1xyXG4gICAgdGhpcy5hdXRoUmVxdWVzdFByb21pc2UgPSB0aGlzLnBhZ2VcclxuICAgICAgLndhaXRGb3JSZXF1ZXN0KFNTT19BVVRIT1JJWkFUSU9OX1JFUVVFU1RfRU5EUE9JTlQsIHsgdGltZW91dDogMTBfMDAwIH0pXHJcbiAgICAgIC5jYXRjaChlID0+IHtcclxuICAgICAgICBkZWJ1ZygnZXJyb3Igd2hpbGUgd2FpdGluZyBmb3IgdGhlIHRva2VuIHJlcXVlc3QnLCBlKTtcclxuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xyXG4gICAgICB9KTtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIGxvZ2luVXJsOiBgJHtMT0dJTl9VUkx9YCxcclxuICAgICAgZmllbGRzOiBjcmVhdGVMb2dpbkZpZWxkcyhjcmVkZW50aWFscyksXHJcbiAgICAgIHN1Ym1pdEJ1dHRvblNlbGVjdG9yOiAnYnV0dG9uW3R5cGU9XCJzdWJtaXRcIl0nLFxyXG4gICAgICBwb3NzaWJsZVJlc3VsdHM6IGdldFBvc3NpYmxlTG9naW5SZXN1bHRzKCksXHJcbiAgICAgIGNoZWNrUmVhZGluZXNzOiBhc3luYyAoKSA9PiB3YWl0VW50aWxFbGVtZW50Rm91bmQodGhpcy5wYWdlLCAnI2NjTG9naW5EZXNrdG9wQnRuJyksXHJcbiAgICAgIHByZUFjdGlvbjogdGhpcy5vcGVuTG9naW5Qb3B1cCxcclxuICAgICAgcG9zdEFjdGlvbjogYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICBhd2FpdCB3YWl0Rm9yTmF2aWdhdGlvbih0aGlzLnBhZ2UpO1xyXG4gICAgICAgICAgY29uc3QgY3VycmVudFVybCA9IGF3YWl0IGdldEN1cnJlbnRVcmwodGhpcy5wYWdlKTtcclxuICAgICAgICAgIGlmIChjdXJyZW50VXJsLmVuZHNXaXRoKCdzaXRlLXR1dG9yaWFsJykpIHtcclxuICAgICAgICAgICAgYXdhaXQgY2xpY2tCdXR0b24odGhpcy5wYWdlLCAnYnV0dG9uLmJ0bi1jbG9zZScpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgY29uc3QgcmVxdWVzdCA9IGF3YWl0IHRoaXMuYXV0aFJlcXVlc3RQcm9taXNlO1xyXG4gICAgICAgICAgdGhpcy5hdXRob3JpemF0aW9uID0gU3RyaW5nKHJlcXVlc3Q/LmhlYWRlcnMoKS5hdXRob3JpemF0aW9uIHx8ICcnKS50cmltKCk7XHJcbiAgICAgICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgICAgY29uc3QgY3VycmVudFVybCA9IGF3YWl0IGdldEN1cnJlbnRVcmwodGhpcy5wYWdlKTtcclxuICAgICAgICAgIGlmIChjdXJyZW50VXJsLmVuZHNXaXRoKCdkYXNoYm9hcmQnKSkgcmV0dXJuO1xyXG4gICAgICAgICAgY29uc3QgcmVxdWlyZXNDaGFuZ2VQYXNzd29yZCA9IGF3YWl0IGhhc0NoYW5nZVBhc3N3b3JkRm9ybSh0aGlzLnBhZ2UpO1xyXG4gICAgICAgICAgaWYgKHJlcXVpcmVzQ2hhbmdlUGFzc3dvcmQpIHJldHVybjtcclxuICAgICAgICAgIHRocm93IGU7XHJcbiAgICAgICAgfVxyXG4gICAgICB9LFxyXG4gICAgICB1c2VyQWdlbnQ6IGFwaUhlYWRlcnNbJ1VzZXItQWdlbnQnXSxcclxuICAgIH07XHJcbiAgfVxyXG5cclxuICBhc3luYyBmZXRjaERhdGEoKTogUHJvbWlzZTxTY3JhcGVyU2NyYXBpbmdSZXN1bHQ+IHtcclxuICAgIGNvbnN0IGRlZmF1bHRTdGFydE1vbWVudCA9IG1vbWVudCgpLnN1YnRyYWN0KDEsICd5ZWFycycpLnN1YnRyYWN0KDYsICdtb250aHMnKS5hZGQoMSwgJ2RheScpO1xyXG4gICAgY29uc3Qgc3RhcnREYXRlID0gdGhpcy5vcHRpb25zLnN0YXJ0RGF0ZSB8fCBkZWZhdWx0U3RhcnRNb21lbnQudG9EYXRlKCk7XHJcbiAgICBjb25zdCBzdGFydE1vbWVudCA9IG1vbWVudC5tYXgoZGVmYXVsdFN0YXJ0TW9tZW50LCBtb21lbnQoc3RhcnREYXRlKSk7XHJcbiAgICBkZWJ1ZyhgZmV0Y2ggdHJhbnNhY3Rpb25zIHN0YXJ0aW5nICR7c3RhcnRNb21lbnQuZm9ybWF0KCl9YCk7XHJcblxyXG4gICAgY29uc3QgW2NhcmRzLCB4U2l0ZUlkLCBBdXRob3JpemF0aW9uXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcclxuICAgICAgdGhpcy5nZXRDYXJkcygpLFxyXG4gICAgICB0aGlzLmdldFhTaXRlSWQoKSxcclxuICAgICAgdGhpcy5nZXRBdXRob3JpemF0aW9uSGVhZGVyKCksXHJcbiAgICBdKTtcclxuXHJcbiAgICBjb25zdCBmdXR1cmVNb250aHNUb1NjcmFwZSA9IHRoaXMub3B0aW9ucy5mdXR1cmVNb250aHNUb1NjcmFwZSA/PyAxO1xyXG5cclxuICAgIGNvbnN0IGFjY291bnRzID0gYXdhaXQgUHJvbWlzZS5hbGwoXHJcbiAgICAgIGNhcmRzLm1hcChhc3luYyBjYXJkID0+IHtcclxuICAgICAgICBjb25zdCBmaW5hbE1vbnRoVG9GZXRjaE1vbWVudCA9IG1vbWVudCgpLmFkZChmdXR1cmVNb250aHNUb1NjcmFwZSwgJ21vbnRoJyk7XHJcbiAgICAgICAgY29uc3QgbW9udGhzID0gZmluYWxNb250aFRvRmV0Y2hNb21lbnQuZGlmZihzdGFydE1vbWVudCwgJ21vbnRocycpO1xyXG5cclxuICAgICAgICBjb25zdCBhbGxNb250aHNEYXRhOiBDYXJkVHJhbnNhY3Rpb25EZXRhaWxzW10gPSBbXTtcclxuXHJcbiAgICAgICAgZGVidWcoYGZldGNoIHBlbmRpbmcgdHJhbnNhY3Rpb25zIGZvciBjYXJkICR7Y2FyZC5jYXJkVW5pcXVlSWR9YCk7XHJcbiAgICAgICAgbGV0IHBlbmRpbmdEYXRhID0gYXdhaXQgZmV0Y2hQb3N0KFxyXG4gICAgICAgICAgUEVORElOR19UUkFOU0FDVElPTlNfUkVRVUVTVF9FTkRQT0lOVCxcclxuICAgICAgICAgIHsgY2FyZFVuaXF1ZUlEQXJyYXk6IFtjYXJkLmNhcmRVbmlxdWVJZF0gfSxcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgQXV0aG9yaXphdGlvbixcclxuICAgICAgICAgICAgJ1gtU2l0ZS1JZCc6IHhTaXRlSWQsXHJcbiAgICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXHJcbiAgICAgICAgICAgIC4uLmFwaUhlYWRlcnMsXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIGRlYnVnKGBmZXRjaCBjb21wbGV0ZWQgdHJhbnNhY3Rpb25zIGZvciBjYXJkICR7Y2FyZC5jYXJkVW5pcXVlSWR9YCk7XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPD0gbW9udGhzOyBpICs9IDEpIHtcclxuICAgICAgICAgIGNvbnN0IG1vbnRoID0gZmluYWxNb250aFRvRmV0Y2hNb21lbnQuY2xvbmUoKS5zdWJ0cmFjdChpLCAnbW9udGhzJyk7XHJcbiAgICAgICAgICBjb25zdCBtb250aERhdGEgPSBhd2FpdCBmZXRjaFBvc3QoXHJcbiAgICAgICAgICAgIFRSQU5TQUNUSU9OU19SRVFVRVNUX0VORFBPSU5ULFxyXG4gICAgICAgICAgICB7IGNhcmRVbmlxdWVJZDogY2FyZC5jYXJkVW5pcXVlSWQsIG1vbnRoOiBtb250aC5mb3JtYXQoJ00nKSwgeWVhcjogbW9udGguZm9ybWF0KCdZWVlZJykgfSxcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgIEF1dGhvcml6YXRpb24sXHJcbiAgICAgICAgICAgICAgJ1gtU2l0ZS1JZCc6IHhTaXRlSWQsXHJcbiAgICAgICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcclxuICAgICAgICAgICAgICAuLi5hcGlIZWFkZXJzLFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICBpZiAobW9udGhEYXRhPy5zdGF0dXNDb2RlICE9PSAxKVxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXHJcbiAgICAgICAgICAgICAgYGZhaWxlZCB0byBmZXRjaCB0cmFuc2FjdGlvbnMgZm9yIGNhcmQgJHtjYXJkLmxhc3Q0RGlnaXRzfS4gTWVzc2FnZTogJHttb250aERhdGE/LnRpdGxlIHx8ICcnfWAsXHJcbiAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgaWYgKCFpc0NhcmRUcmFuc2FjdGlvbkRldGFpbHMobW9udGhEYXRhKSkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ21vbnRoRGF0YSBpcyBub3Qgb2YgdHlwZSBDYXJkVHJhbnNhY3Rpb25EZXRhaWxzJyk7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgYWxsTW9udGhzRGF0YS5wdXNoKG1vbnRoRGF0YSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAocGVuZGluZ0RhdGE/LnN0YXR1c0NvZGUgIT09IDEgJiYgcGVuZGluZ0RhdGE/LnN0YXR1c0NvZGUgIT09IDk2KSB7XHJcbiAgICAgICAgICBkZWJ1ZyhcclxuICAgICAgICAgICAgYGZhaWxlZCB0byBmZXRjaCBwZW5kaW5nIHRyYW5zYWN0aW9ucyBmb3IgY2FyZCAke2NhcmQubGFzdDREaWdpdHN9LiBNZXNzYWdlOiAke3BlbmRpbmdEYXRhPy50aXRsZSB8fCAnJ31gLFxyXG4gICAgICAgICAgKTtcclxuICAgICAgICAgIHBlbmRpbmdEYXRhID0gbnVsbDtcclxuICAgICAgICB9IGVsc2UgaWYgKCFpc0NhcmRQZW5kaW5nVHJhbnNhY3Rpb25EZXRhaWxzKHBlbmRpbmdEYXRhKSkge1xyXG4gICAgICAgICAgZGVidWcoJ3BlbmRpbmdEYXRhIGlzIG5vdCBvZiB0eXBlIENhcmRUcmFuc2FjdGlvbkRldGFpbHMnKTtcclxuICAgICAgICAgIHBlbmRpbmdEYXRhID0gbnVsbDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IHRyYW5zYWN0aW9ucyA9IGNvbnZlcnRQYXJzZWREYXRhVG9UcmFuc2FjdGlvbnMoYWxsTW9udGhzRGF0YSwgcGVuZGluZ0RhdGEpO1xyXG5cclxuICAgICAgICBkZWJ1ZygnZmlsdGVyIG91dCBvbGQgdHJhbnNhY3Rpb25zJyk7XHJcbiAgICAgICAgY29uc3QgdHhucyA9XHJcbiAgICAgICAgICAodGhpcy5vcHRpb25zLm91dHB1dERhdGE/LmVuYWJsZVRyYW5zYWN0aW9uc0ZpbHRlckJ5RGF0ZSA/PyB0cnVlKVxyXG4gICAgICAgICAgICA/IGZpbHRlck9sZFRyYW5zYWN0aW9ucyh0cmFuc2FjdGlvbnMsIG1vbWVudChzdGFydERhdGUpLCB0aGlzLm9wdGlvbnMuY29tYmluZUluc3RhbGxtZW50cyB8fCBmYWxzZSlcclxuICAgICAgICAgICAgOiB0cmFuc2FjdGlvbnM7XHJcblxyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICB0eG5zLFxyXG4gICAgICAgICAgYWNjb3VudE51bWJlcjogY2FyZC5sYXN0NERpZ2l0cyxcclxuICAgICAgICB9IGFzIFRyYW5zYWN0aW9uc0FjY291bnQ7XHJcbiAgICAgIH0pLFxyXG4gICAgKTtcclxuXHJcbiAgICBkZWJ1ZygncmV0dXJuIHRoZSBzY3JhcGVkIGFjY291bnRzJyk7XHJcblxyXG4gICAgZGVidWcoSlNPTi5zdHJpbmdpZnkoYWNjb3VudHMsIG51bGwsIDIpKTtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIHN1Y2Nlc3M6IHRydWUsXHJcbiAgICAgIGFjY291bnRzLFxyXG4gICAgfTtcclxuICB9XHJcbn1cclxuXHJcbmV4cG9ydCBkZWZhdWx0IFZpc2FDYWxTY3JhcGVyO1xyXG4iXSwibWFwcGlu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