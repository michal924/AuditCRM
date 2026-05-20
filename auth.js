// ============================================================
// MSAL Authentication
// ============================================================

const MSAL_CONFIG = {
  auth: {
    clientId: "4f387d2a-b650-4ebc-b2c2-7bfa29dee540",
    authority: "https://login.microsoftonline.com/logisticfit.onmicrosoft.com",
    redirectUri: window.location.origin + window.location.pathname,
  },
  cache: {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: true,
  },
};

const SCOPES       = ["https://logisticfit.sharepoint.com/.default"];
const GRAPH_SCOPES = ["Calendars.ReadWrite"];

const msalInstance = new msal.PublicClientApplication(MSAL_CONFIG);

async function initAuth() {
  await msalInstance.initialize();
  const result = await msalInstance.handleRedirectPromise();
  if (result) return result.account;
  const accounts = msalInstance.getAllAccounts();
  return accounts.length > 0 ? accounts[0] : null;
}

async function login() {
  await msalInstance.loginRedirect({ scopes: SCOPES });
}

async function logout() {
  await msalInstance.logoutRedirect();
}

async function getToken() {
  const accounts = msalInstance.getAllAccounts();
  if (!accounts.length) throw new Error("Nie zalogowano");
  try {
    const result = await msalInstance.acquireTokenSilent({
      scopes: SCOPES,
      account: accounts[0],
    });
    return result.accessToken;
  } catch {
    await msalInstance.acquireTokenRedirect({ scopes: SCOPES });
  }
}

async function getGraphToken() {
  const accounts = msalInstance.getAllAccounts();
  if (!accounts.length) throw new Error("Nie zalogowano");
  try {
    const result = await msalInstance.acquireTokenSilent({
      scopes: GRAPH_SCOPES,
      account: accounts[0],
    });
    return result.accessToken;
  } catch {
    await msalInstance.acquireTokenRedirect({ scopes: GRAPH_SCOPES });
  }
}
