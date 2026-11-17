const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function browser() {
  const storage = new Map();
  const nodes = new Map();
  const links = ['dashboard', 'profiles', 'prefix', 'addloan', 'transactions', 'reports', 'closeinactive', 'executives'].map(p => ({dataset: {p}, style: {}, classList: {toggle() {}}}));
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, {style: {}, classList: {add() {}, remove() {}, toggle() {}}, addEventListener() {}});
    return nodes.get(selector);
  };
  const context = vm.createContext({
    console, Headers, setTimeout() {},
    document: {getElementById: id => node('#' + id), querySelector: node, querySelectorAll: () => links, addEventListener() {}},
    localStorage: {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key)},
    window: {location: {replace(url) {this.redirect = url;}}}
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'script.js'), 'utf8'), context);
  context.loadDatabase = context.bootstrapDatabase;
  context.bootstrapDatabase = async () => true;
  context.render = () => {context.rendered = true;};
  return {context, links, node};
}

for (const role of ['Admin', 'ADMIN', ' admin ', 'Admin   ']) {
  test('admin menu accepts role ' + JSON.stringify(role), () => {
    const {context, links, node} = browser();
    context.setSession({id: 1, name: 'admin', role});
    context.applyRolePermissions();
    assert.equal(context.isAdminUser(), true);
    assert.ok(links.every(link => link.style.display === ''));
    assert.match(node('header .admin').innerHTML, /^AD /);
  });
}

test('an executive named admin does not gain admin menus', () => {
  const {context, links} = browser();
  context.setSession({id: 1, name: 'admin', username: 'admin', role: 'Executive'});
  context.applyRolePermissions();
  assert.equal(context.isAdminUser(), false);
  for (const link of links) {
    assert.equal(link.style.display, ['prefix', 'reports', 'closeinactive', 'executives'].includes(link.dataset.p) ? 'none' : '');
  }
});

for (const [cached, current] of [['Executive', 'Admin   '], ['Admin', 'Executive']]) {
  test('portal replaces cached ' + cached + ' with database role ' + current, async () => {
    const {context, links} = browser();
    context.setSession({id: 7, username: 'account', role: cached});
    context.fetch = async (url, init) => {
      assert.equal(url, '/api/me');
      assert.equal(init.cache, 'no-store');
      assert.equal(init.headers.get('x-executive-id'), '7');
      return {ok: true, status: 200, json: async () => ({user: {id: 7, name: 'Current account', role: current}})};
    };
    await context.initApp();
    assert.equal(context.getSession().role, current.trim());
    assert.equal(context.getSession().username, 'account');
    assert.equal(links.find(link => link.dataset.p === 'executives').style.display, current.trim() === 'Admin' ? '' : 'none');
    assert.equal(context.rendered, true);
  });
}

test('inactive or deleted account clears the session and returns to login', async () => {
  const {context} = browser();
  context.setSession({id: 7, role: 'Admin'});
  context.fetch = async () => ({status: 401});
  await context.initApp();
  assert.equal(context.getSession(), null);
  assert.equal(context.window.location.redirect, '/login');
  assert.equal(context.rendered, undefined);
});

test('failed verification shows an error without rendering from a stale role', async () => {
  const {context, node} = browser();
  context.setSession({id: 7, role: 'Admin'});
  context.fetch = async () => ({ok: false, status: 500, json: async () => ({error: 'Unable to verify your account.'})});
  await context.initApp();
  assert.match(node('#app').innerHTML, /Unable to verify/);
  assert.equal(typeof node('#retryPortal').onclick, 'function');
  assert.equal(context.rendered, undefined);
});

function server(row) {
  const routes = new Map();
  const middleware = [];
  const app = {use(...args) {middleware.push(args);}, listen() {}};
  for (const method of ['get', 'post', 'put', 'delete']) app[method] = (url, handler) => routes.set(method + ' ' + url, handler);
  const express = Object.assign(() => app, {json() {}, static() {}});
  const sql = {Int: 'Int', NVarChar: () => 'NVarChar'};
  const context = vm.createContext({
    console, __dirname, process: {env: {DB_AUTH: 'sql'}},
    require: name => name === 'express' ? express : name === 'dotenv' ? {config() {}} : name === 'mssql' ? sql : require(name)
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8'), context);
  context.getPool = async () => ({request: () => ({input() {return this;}, query: async () => ({recordset: row ? [row] : []})})});
  return {context, handler: routes.get('get /api/me'), apiFallback: middleware.find(args => args[0] === '/api')[1], bootstrap: routes.get('get /api/bootstrap')};
}

test('session endpoint reads and normalizes the current database role', async () => {
  const {context, handler} = server({executive_id: 7, full_name: 'Admin', status: 'Active ', role: 'Admin   '});
  const res = {set(key, value) {assert.equal(key, 'Cache-Control'); assert.equal(value, 'no-store');}, json(body) {this.body = body;}};
  await handler({headers: {'x-executive-id': '7'}}, res);
  assert.equal(res.body.user.role, 'Admin');
  assert.equal(context.isAdmin(res.body.user), true);
  assert.equal(context.isAdmin({role: ' ADMIN '}), true);
  assert.equal(context.isAdmin({role: 'Executive', name: 'admin'}), false);
});

for (const row of [null, {executive_id: 7, status: 'Inactive', role: 'Admin'}]) {
  test('session endpoint rejects missing or inactive database account: ' + JSON.stringify(row), async () => {
    const {handler} = server(row);
    const res = {set() {}, status(code) {this.code = code; return this;}, json(body) {this.body = body;}};
    await handler({headers: {'x-executive-id': '7'}}, res);
    assert.equal(res.code, 401);
    assert.equal(res.body.ok, false);
  });
}

for (const status of [200, 404]) {
  test('older server without /api/me can still load data: ' + status, async () => {
    const {context} = browser();
    context.setSession({id: 7, username: 'account', role: 'Admin'});
    context.fetch = async () => ({ok: status === 200, status, headers: new Headers({'content-type': 'text/html'}), json: async () => {throw new Error('HTML is not JSON');}});
    let loaded = false;
    context.bootstrapDatabase = async () => {loaded = true; return true;};
    await context.initApp();
    assert.equal(loaded, true);
    assert.equal(context.rendered, true);
    assert.equal(context.getSession().role, 'Admin');
  });
}

test('failed data loading shows retry and never renders empty dashboard totals', async () => {
  const {context, node} = browser();
  context.setSession({id: 7, role: 'Admin'});
  context.refreshSession = async () => true;
  context.bootstrapDatabase = async () => {throw new Error('SQL connection unavailable');};
  await context.initApp();
  assert.equal(context.rendered, undefined);
  assert.match(node('#app').innerHTML, /SQL connection unavailable/);
  context.bootstrapDatabase = async () => true;
  await node('#retryPortal').onclick();
  assert.equal(context.rendered, true);
});

for (const status of [200, 500]) {
  test('bootstrap rejects HTML responses instead of showing empty data: ' + status, async () => {
    const {context} = browser();
    context.setSession({id: 7, role: 'Admin'});
    context.fetch = async () => ({ok: status === 200, status, headers: new Headers({'content-type': 'text/html'})});
    await assert.rejects(context.loadDatabase(), /web page instead of account data/);
  });
}

test('bootstrap preserves API failure details', async () => {
  const {context} = browser();
  context.setSession({id: 7, role: 'Admin'});
  context.fetch = async () => ({ok: false, status: 500, headers: new Headers({'content-type': 'application/json'}), json: async () => ({error: 'SQL Server connection failed'})});
  await assert.rejects(context.loadDatabase(), /SQL Server connection failed/);
});

test('bootstrap rejects expired sessions instead of rendering an empty dashboard', async () => {
  const {context} = browser();
  context.setSession({id: 7, role: 'Admin'});
  context.fetch = async () => ({ok: false, status: 401});
  assert.equal(await context.loadDatabase(), false);
  assert.equal(context.getSession(), null);
  assert.equal(context.window.location.redirect, '/login');
});

test('unknown API routes return JSON 404 instead of the HTML portal', () => {
  const {apiFallback} = server(null);
  const res = {status(code) {this.code = code; return this;}, json(body) {this.body = body;}};
  apiFallback({}, res);
  assert.equal(res.code, 404);
  assert.equal(res.body.ok, false);
  assert.match(res.body.error, /API endpoint not found/);
});

test('API data requests bypass cached responses on page reload', async () => {
  const {context} = browser();
  context.fetch = async (url, options) => {
    assert.equal(url, '/api/profiles');
    assert.equal(options.cache, 'no-store');
  };
  await context.apiFetch('/api/profiles');
});

test('missing legacy tables do not produce SELECT errors or hide core data', async () => {
  const {context, bootstrap} = server(null);
  const queries = [];
  context.ensureDatabaseSchema = async () => {};
  context.requireUser = async () => ({id: 7, role: 'Admin'});
  context.getPool = async () => ({request: () => ({query: async query => {
    queries.push(query);
    if (query.includes('OBJECT_ID')) return {recordset: [{tableId: null}]};
    if (query.includes('dbo.profiles')) return {recordset: [{profile_id: 42, name: 'Existing customer'}]};
    return {recordset: []};
  }})});
  const res = {json(body) {this.body = body;}, status(code) {this.code = code; return this;}};
  await bootstrap({}, res);
  assert.equal(res.code, undefined);
  assert.equal(res.body.gf_profiles[0].profile_id, 42);
  assert.equal(res.body.la_prefix.length, 0);
  assert.equal(res.body.la_add_loans.length, 0);
  assert.equal(res.body.la_customers.length, 0);
  assert.equal(Object.keys(res.body.la_wallet).length, 0);
  assert.ok(!queries.some(query => /SELECT \* FROM dbo\.(customers|loan_applications|rejected_loans|merged_loans|executive_wallet|payment_history)/.test(query)));
});

test('required table errors produce a failed API response instead of empty data', async () => {
  const {context, bootstrap} = server(null);
  context.ensureDatabaseSchema = async () => {};
  context.requireUser = async () => ({id: 7, role: 'Admin'});
  context.getPool = async () => ({request: () => ({query: async () => {throw new Error('Invalid object name');}})});
  const res = {json(body) {this.body = body;}, status(code) {this.code = code; return this;}};
  await bootstrap({}, res);
  assert.equal(res.code, 500);
  assert.match(res.body.error, /Unable to load prefix_loans/);
});
