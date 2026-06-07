/* 代儲管理系統 */
var SUPABASE_URL='https://hpajiexvcmkidbgreaqy.supabase.co';
var SUPABASE_ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwYWppZXh2Y21raWRiZ3JlYXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMTY2NTQsImV4cCI6MjA5NDU5MjY1NH0.ZIxx-cJRHxLAv-TlPpjvFGBndzs-GE9ptZENh81AQQQ';
var PLATFORM_FEE = 0.03; // 8591 fixed 3%
var sb = null, userId = null, isDemo = false;
var products = [], agents = [], customers = [], orders = [], ads = [];

/* 個人管道預設商品 */
var PERSONAL_PRESETS_DEFAULT = ['原神','崩鐵','鳴潮','絕區零','傳說','抖音','代付'];
function getPersonalPresets() {
  var custom = JSON.parse(localStorage.getItem('proxy-personal-presets') || '[]');
  var all = PERSONAL_PRESETS_DEFAULT.concat(custom);
  // dedupe
  var seen = {}, out = [];
  all.forEach(function(x) { if (!seen[x]) { seen[x] = 1; out.push(x) } });
  return out;
}
function addPersonalPreset(name) {
  if (!name) return;
  var custom = JSON.parse(localStorage.getItem('proxy-personal-presets') || '[]');
  if (PERSONAL_PRESETS_DEFAULT.indexOf(name) >= 0 || custom.indexOf(name) >= 0) return;
  custom.push(name);
  localStorage.setItem('proxy-personal-presets', JSON.stringify(custom));
}
function removePersonalPreset(name) {
  var custom = JSON.parse(localStorage.getItem('proxy-personal-presets') || '[]');
  custom = custom.filter(function(x) { return x !== name });
  localStorage.setItem('proxy-personal-presets', JSON.stringify(custom));
}

function $(id) { return document.getElementById(id) }
function fmtN(n) { return Number(n || 0).toLocaleString('zh-TW', { maximumFractionDigits: 0 }) }
function fmtP(n) { return (Number(n || 0) * 100).toFixed(1) + '%' }
function today() { return new Date().toISOString().slice(0, 10) }

/* Toast */
function toast(msg, type) {
  var t = $('toast'); t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(t._t);
  t._t = setTimeout(function() { t.className = 'toast' }, 2500);
}

/* Theme */
function toggleTheme() {
  var cur = document.documentElement.getAttribute('data-theme');
  var next = cur === 'light' ? '' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('proxy-theme', next);
}
(function() {
  var s = localStorage.getItem('proxy-theme');
  if (s) document.documentElement.setAttribute('data-theme', s);
})();

/* ──── Auth ──── */
function initSb() {
  if (!sb) sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  return sb;
}
function doLogin() {
  var email = $('loginEmail').value.trim(), pw = $('loginPw').value;
  if (!email || !pw) return toast('請填寫 Email 和密碼', 'err');
  initSb();
  sb.auth.signInWithPassword({ email: email, password: pw }).then(function(res) {
    if (res.error) return toast(res.error.message, 'err');
    userId = res.data.user.id;
    enterApp(email);
  });
}
function doSignup() {
  var email = $('loginEmail').value.trim(), pw = $('loginPw').value;
  if (!email || !pw) return toast('請填寫 Email 和密碼', 'err');
  initSb();
  sb.auth.signUp({ email: email, password: pw }).then(function(res) {
    if (res.error) return toast(res.error.message, 'err');
    toast('註冊成功，請登入', 'ok');
  });
}
function doLogout() {
  if (sb) sb.auth.signOut();
  userId = null; isDemo = false;
  $('app').style.display = 'none';
  $('loginPage').style.display = '';
}
function enterDemo() {
  isDemo = true; userId = 'demo';
  products = JSON.parse(localStorage.getItem('proxy-demo-products') || '[]');
  agents = JSON.parse(localStorage.getItem('proxy-demo-agents') || '[]');
  customers = JSON.parse(localStorage.getItem('proxy-demo-customers') || '[]');
  orders = JSON.parse(localStorage.getItem('proxy-demo-orders') || '[]');
  ads = JSON.parse(localStorage.getItem('proxy-demo-ads') || '[]');
  enterApp('本機模式');
}
function enterApp(label) {
  $('loginPage').style.display = 'none';
  $('app').style.display = '';
  $('userLabel').textContent = label;
  mpInit('mpDash', renderDashboard);
  mpInit('mpOrders', renderOrders);
  mpInit('mpAds', renderAds);
  loadAll();
  // Share auth token with Chrome extension (if installed)
  shareTokenWithExtension();
}
function shareTokenWithExtension() {
  if (isDemo || !sb) return;
  sb.auth.getSession().then(function(res) {
    if (res.data && res.data.session) {
      window.postMessage({
        type: 'PROXY_AUTH',
        token: res.data.session.access_token,
        userId: res.data.session.user.id
      }, '*');
    }
  });
}
function autoLogin() {
  initSb();
  sb.auth.getSession().then(function(res) {
    if (res.data && res.data.session) {
      userId = res.data.session.user.id;
      enterApp(res.data.session.user.email);
    }
  });
}
autoLogin();

/* ──── Data ──── */
function demoSave() {
  if (!isDemo) return;
  localStorage.setItem('proxy-demo-products', JSON.stringify(products));
  localStorage.setItem('proxy-demo-agents', JSON.stringify(agents));
  localStorage.setItem('proxy-demo-customers', JSON.stringify(customers));
  localStorage.setItem('proxy-demo-orders', JSON.stringify(orders));
  localStorage.setItem('proxy-demo-ads', JSON.stringify(ads));
}

function loadAll() {
  if (isDemo) { renderAll(); return }
  Promise.all([
    sb.from('products').select('*').eq('user_id', userId).order('sort_order'),
    sb.from('agents').select('*').eq('user_id', userId).order('created_at'),
    sb.from('customers').select('*').eq('user_id', userId).order('created_at'),
    sb.from('orders').select('*').eq('user_id', userId).order('order_date', { ascending: false }),
    sb.from('ad_spends').select('*').eq('user_id', userId).order('ad_date', { ascending: false })
  ]).then(function(res) {
    products = res[0].data || [];
    agents = res[1].data || [];
    customers = res[2].data || [];
    orders = res[3].data || [];
    ads = res[4].data || [];
    renderAll();
  });
}

function renderAll() {
  renderDashboard();
  renderProducts();
  renderOrders();
  renderAgents();
  renderCustomers();
  renderAds();
}

/* ──── Tab switching ──── */
function switchTab(name) {
  var tabs = document.querySelectorAll('.tab');
  var contents = document.querySelectorAll('.tab-content');
  for (var i = 0; i < tabs.length; i++)
    tabs[i].classList.toggle('active', tabs[i].getAttribute('data-tab') === name);
  for (var i = 0; i < contents.length; i++)
    contents[i].classList.toggle('active', contents[i].id === 'tab-' + name);
}

/* ──── Modal ──── */
function openModal(id) {
  $('modalBg').classList.add('show');
  $(id).classList.add('show');
}
function closeModal() {
  $('modalBg').classList.remove('show');
  var modals = document.querySelectorAll('.modal');
  for (var i = 0; i < modals.length; i++) modals[i].classList.remove('show');
}
function confirmAction(msg, cb) {
  $('confirmMsg').textContent = msg;
  $('confirmBtn').onclick = function() { closeModal(); cb() };
  openModal('confirmModal');
}

/* ──── Calc helpers ──── */
function channelFee(channel, unitPrice) {
  return channel === '8591' ? unitPrice * PLATFORM_FEE : 0;
}
function calcCommission(gross, commType, commVal) {
  return commType === '百分比' ? gross * commVal : commVal;
}
function orderProfit(o) {
  var q = o.qty || 1;
  var rev = q * (o.unit_price || 0), cost = q * (o.unit_cost || 0);
  var fee = channelFee(o.channel, o.unit_price || 0) * q;
  var gross = rev - cost - fee;
  var comm = calcCommission(gross, o.commission_type || '百分比', o.commission_value || 0);
  return { rev: rev, cost: cost, fee: fee, gross: gross, comm: comm, profit: gross - comm };
}
function genOrderNo() {
  var d = today().replace(/-/g, '');
  var todayOrders = orders.filter(function(o) { return (o.order_no || '').indexOf(d) === 0 });
  var seq = todayOrders.length + 1;
  return d + '-' + (seq < 10 ? '0' + seq : seq);
}
function monthAds(ym) {
  return ads.filter(function(a) { return (a.ad_date || '').slice(0, 7) === ym })
    .reduce(function(s, a) { return s + (a.amount || 0) }, 0);
}

/* ──── Month Picker Component ──── */
var mpState = {};
var MON_NAMES = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
function mpInit(id, onChange) {
  var d = new Date();
  mpState[id] = { year: d.getFullYear(), mon: d.getMonth(), all: false, mode: 'month', open: false, onChange: onChange };
  mpRender(id);
}
function mpRender(id) {
  var s = mpState[id], el = $(id);
  if (!el) return;
  var label = s.all ? '全部期間' : s.mode === 'year' ? s.year + '年' : s.year + '/' + (s.mon + 1 < 10 ? '0' : '') + (s.mon + 1);
  var curY = new Date().getFullYear(), curM = new Date().getMonth();
  var html = '<button class="mp-arrow" onclick="mpShift(\'' + id + '\',-1)">‹</button>' +
    '<span class="mp-label" onclick="mpToggle(\'' + id + '\')">' + label +
    (s.open ? mpDropdown(id, curY, curM) : '') + '</span>' +
    '<button class="mp-arrow" onclick="mpShift(\'' + id + '\',1)">›</button>' +
    '<button class="btn sm ' + (s.all ? 'primary' : 'ghost') + ' mp-all" onclick="mpSetAll(\'' + id + '\')">全部</button>';
  el.innerHTML = html;
}
function mpDropdown(id, curY, curM) {
  var s = mpState[id];
  var yearCls = s.mode === 'year' && !s.all ? ' active' : '';
  var h = '<div class="mp-dropdown" onclick="event.stopPropagation()">' +
    '<div class="mp-year-row"><button class="mp-year-btn" onclick="mpShiftYear(\'' + id + '\',-1)">‹</button>' +
    '<button class="mp-year-pick' + yearCls + '" onclick="mpPickYear(\'' + id + '\')">' + s.year + '年</button>' +
    '<button class="mp-year-btn" onclick="mpShiftYear(\'' + id + '\',1)">›</button></div>' +
    '<div class="mp-grid">';
  for (var i = 0; i < 12; i++) {
    var cls = '';
    if (!s.all && s.mode !== 'year' && s.mon === i) cls = ' active';
    else if (s.year === curY && i === curM) cls = ' current';
    h += '<button class="' + cls + '" onclick="mpPick(\'' + id + '\',' + i + ')">' + MON_NAMES[i] + '</button>';
  }
  h += '</div></div>';
  return h;
}
function mpToggle(id) { mpState[id].open = !mpState[id].open; mpRender(id) }
function mpShift(id, dir) {
  var s = mpState[id]; s.all = false; s.open = false;
  if (s.mode === 'year') {
    s.year += dir;
  } else {
    s.mon += dir;
    if (s.mon < 0) { s.mon = 11; s.year-- }
    if (s.mon > 11) { s.mon = 0; s.year++ }
  }
  mpRender(id); s.onChange();
}
function mpShiftYear(id, dir) {
  mpState[id].year += dir; mpRender(id);
}
function mpPick(id, mon) {
  var s = mpState[id]; s.mon = mon; s.all = false; s.mode = 'month'; s.open = false;
  mpRender(id); s.onChange();
}
function mpPickYear(id) {
  var s = mpState[id]; s.all = false; s.mode = 'year'; s.open = false;
  mpRender(id); s.onChange();
}
function mpSetAll(id) {
  var s = mpState[id]; s.all = !s.all; s.open = false;
  mpRender(id); s.onChange();
}
function mpGetYM(id) {
  var s = mpState[id];
  return s.year + '-' + (s.mon + 1 < 10 ? '0' : '') + (s.mon + 1);
}
function mpIsAll(id) { return mpState[id] && mpState[id].all }
function mpIsYear(id) { return mpState[id] && mpState[id].mode === 'year' }
function mpGetYear(id) { return String(mpState[id].year) }

// Close dropdown on outside click
document.addEventListener('click', function(e) {
  if (!e.target.closest('.mp-label')) {
    var changed = false;
    Object.keys(mpState).forEach(function(id) {
      if (mpState[id].open) { mpState[id].open = false; changed = true; mpRender(id) }
    });
  }
});

/* ──── Date Picker Component ──── */
var dpState = {};
var WDAY = ['日','一','二','三','四','五','六'];
function dpInit(id, opts) {
  opts = opts || {};
  dpState[id] = { value: opts.value || '', open: false, viewYear: 0, viewMonth: 0, allowEmpty: !!opts.allowEmpty, onChange: opts.onChange || function(){} };
  var s = dpState[id];
  if (s.value) { var p = s.value.split('-'); s.viewYear = +p[0]; s.viewMonth = +p[1] - 1 }
  else { var d = new Date(); s.viewYear = d.getFullYear(); s.viewMonth = d.getMonth() }
  dpRender(id);
}
function dpRender(id) {
  var el = $(id), s = dpState[id]; if (!el) return;
  var display = s.value || '選擇日期';
  var clearBtn = s.value && s.allowEmpty ? ' <span class="dp-clear" data-dp-clear="' + id + '">✕</span>' : '';
  var h = '<div class="dp-display' + (s.open ? ' focus' : '') + '" data-dp-toggle="' + id + '">' +
    '<span>' + display + '</span><span class="dp-icon">📅' + clearBtn + '</span></div>';
  if (s.open) h += dpPanel(id);
  el.innerHTML = h;
}
function dpPanel(id) {
  var s = dpState[id];
  var y = s.viewYear, m = s.viewMonth;
  var todayStr = today();
  var h = '<div class="dp-panel" onclick="event.stopPropagation()">' +
    '<div class="dp-head"><button data-dp-shift="' + id + ',-1">‹</button>' +
    '<span>' + y + '/' + (m + 1 < 10 ? '0' : '') + (m + 1) + '</span>' +
    '<button data-dp-shift="' + id + ',1">›</button></div>' +
    '<div class="dp-weekdays">';
  for (var w = 0; w < 7; w++) h += '<span>' + WDAY[w] + '</span>';
  h += '</div><div class="dp-days">';
  var first = new Date(y, m, 1), startDay = first.getDay();
  var daysInMonth = new Date(y, m + 1, 0).getDate();
  var prevDays = new Date(y, m, 0).getDate();
  // Previous month padding
  for (var i = startDay - 1; i >= 0; i--) {
    var pd = prevDays - i;
    var pym = m === 0 ? (y - 1) + '-12' : y + '-' + (m < 10 ? '0' : '') + m;
    h += '<button class="other" data-dp-pick="' + id + ',' + pym + '-' + (pd < 10 ? '0' : '') + pd + '">' + pd + '</button>';
  }
  // Current month
  for (var d = 1; d <= daysInMonth; d++) {
    var ds = y + '-' + (m + 1 < 10 ? '0' : '') + (m + 1) + '-' + (d < 10 ? '0' : '') + d;
    var cls = '';
    if (ds === s.value) cls = ' selected';
    else if (ds === todayStr) cls = ' today';
    h += '<button class="' + cls + '" data-dp-pick="' + id + ',' + ds + '">' + d + '</button>';
  }
  // Next month padding
  var totalCells = startDay + daysInMonth;
  var remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (var i = 1; i <= remaining; i++) {
    var nm = m + 2; var ny = y; if (nm > 12) { nm = 1; ny++ }
    var nds = ny + '-' + (nm < 10 ? '0' : '') + nm + '-' + (i < 10 ? '0' : '') + i;
    h += '<button class="other" data-dp-pick="' + id + ',' + nds + '">' + i + '</button>';
  }
  h += '</div></div>';
  return h;
}
function dpGetVal(id) { return dpState[id] ? dpState[id].value : '' }
function dpSetVal(id, val) {
  if (!dpState[id]) return;
  dpState[id].value = val || '';
  if (val) { var p = val.split('-'); dpState[id].viewYear = +p[0]; dpState[id].viewMonth = +p[1] - 1 }
  dpRender(id);
}

// Date picker event delegation
document.addEventListener('click', function(e) {
  var tog = e.target.closest('[data-dp-toggle]');
  if (tog) {
    var id = tog.getAttribute('data-dp-toggle');
    dpState[id].open = !dpState[id].open;
    dpRender(id);
    e.stopPropagation();
    return;
  }
  var clr = e.target.closest('[data-dp-clear]');
  if (clr) {
    var id = clr.getAttribute('data-dp-clear');
    dpState[id].value = '';
    dpState[id].open = false;
    dpRender(id);
    dpState[id].onChange(id, '');
    e.stopPropagation();
    return;
  }
  var shift = e.target.closest('[data-dp-shift]');
  if (shift) {
    var parts = shift.getAttribute('data-dp-shift').split(',');
    var id = parts[0], dir = +parts[1];
    dpState[id].viewMonth += dir;
    if (dpState[id].viewMonth < 0) { dpState[id].viewMonth = 11; dpState[id].viewYear-- }
    if (dpState[id].viewMonth > 11) { dpState[id].viewMonth = 0; dpState[id].viewYear++ }
    dpRender(id);
    return;
  }
  var pick = e.target.closest('[data-dp-pick]');
  if (pick) {
    var parts = pick.getAttribute('data-dp-pick').split(',');
    var id = parts[0], val = parts[1];
    dpState[id].value = val;
    dpState[id].open = false;
    var p = val.split('-'); dpState[id].viewYear = +p[0]; dpState[id].viewMonth = +p[1] - 1;
    dpRender(id);
    dpState[id].onChange(id, val);
    return;
  }
  // Close all open date pickers on outside click
  Object.keys(dpState).forEach(function(id) {
    if (dpState[id].open) { dpState[id].open = false; dpRender(id) }
  });
});

/* ──── Dashboard ──── */
function renderDashboard() {
  var ym = mpGetYM('mpDash');
  var isAll = mpIsAll('mpDash');
  var isYear = mpIsYear('mpDash');
  var yy = mpGetYear('mpDash');
  var filtered = orders.filter(function(o) {
    if (isAll) return true;
    var d = o.order_date || '';
    if (isYear) return d.slice(0, 4) === yy;
    return d.slice(0, 7) === ym;
  });
  var completed = filtered.filter(function(o) { return o.status === '已完成' });

  var totalRev = 0, totalCost = 0, totalFee = 0, totalComm = 0;
  completed.forEach(function(o) {
    var p = orderProfit(o);
    totalRev += p.rev; totalCost += p.cost; totalFee += p.fee; totalComm += p.comm;
  });
  var orderProf = totalRev - totalCost - totalFee - totalComm;

  var adTotal = isAll
    ? ads.reduce(function(s, a) { return s + (a.amount || 0) }, 0)
    : isYear
      ? ads.filter(function(a) { return (a.ad_date || '').slice(0, 4) === yy }).reduce(function(s, a) { return s + (a.amount || 0) }, 0)
      : monthAds(ym);
  var netProfit = orderProf - adTotal;
  var margin = totalRev > 0 ? netProfit / totalRev : 0;

  $('statCards').innerHTML =
    statCard('訂單數', completed.length, '', 'blue') +
    statCard('總營收', 'NT$' + fmtN(totalRev), '') +
    statCard('訂單利潤', 'NT$' + fmtN(orderProf), '含手續費+抽成', orderProf >= 0 ? 'green' : 'red') +
    statCard('廣告費', 'NT$' + fmtN(adTotal), '', adTotal > 0 ? 'red' : '') +
    statCard('淨利潤', 'NT$' + fmtN(netProfit), '利潤率 ' + fmtP(margin), netProfit >= 0 ? 'green' : 'red');

  // Platform chart
  var platMap = {};
  completed.forEach(function(o) {
    var pl = o.platform || '未分類';
    if (!platMap[pl]) platMap[pl] = { profit: 0, count: 0 };
    var p = orderProfit(o);
    platMap[pl].profit += p.profit;
    platMap[pl].count++;
  });
  var platKeys = Object.keys(platMap).sort(function(a, b) { return platMap[b].profit - platMap[a].profit });
  var maxP = 1;
  platKeys.forEach(function(k) { maxP = Math.max(maxP, Math.abs(platMap[k].profit)) });
  var chartHtml = '';
  if (platKeys.length === 0) {
    chartHtml = '<div class="empty"><div class="icon">📊</div><p>尚無已完成訂單</p></div>';
  } else {
    platKeys.forEach(function(k) {
      var d = platMap[k];
      var pct = Math.abs(d.profit) / maxP * 100;
      chartHtml += '<div class="chart-bar-group"><div class="chart-label"><span>' + k + ' (' + d.count + '單)</span><span>NT$' + fmtN(d.profit) + '</span></div>' +
        '<div class="chart-track"><div class="chart-fill ' + (d.profit >= 0 ? 'pos' : 'neg') + '" style="width:' + Math.max(pct, 8) + '%"></div></div></div>';
    });
  }
  $('platformChart').innerHTML = chartHtml;

  // Channel comparison
  var ch8591 = { rev: 0, prof: 0, cnt: 0 }, chPersonal = { rev: 0, prof: 0, cnt: 0 };
  completed.forEach(function(o) {
    var p = orderProfit(o);
    var t = o.channel === '個人' ? chPersonal : ch8591;
    t.rev += p.rev; t.prof += p.profit; t.cnt++;
  });
  $('channelStats').innerHTML = '<table><tr><th>管道</th><th class="text-right">訂單數</th><th class="text-right">營收</th><th class="text-right">利潤</th><th class="text-right">利潤率</th></tr>' +
    '<tr><td><span class="badge pending">8591</span></td><td class="text-right">' + ch8591.cnt + '</td><td class="text-right">NT$' + fmtN(ch8591.rev) + '</td><td class="text-right text-green">NT$' + fmtN(ch8591.prof) + '</td><td class="text-right">' + fmtP(ch8591.rev > 0 ? ch8591.prof / ch8591.rev : 0) + '</td></tr>' +
    '<tr><td><span class="badge ok">個人</span></td><td class="text-right">' + chPersonal.cnt + '</td><td class="text-right">NT$' + fmtN(chPersonal.rev) + '</td><td class="text-right text-green">NT$' + fmtN(chPersonal.prof) + '</td><td class="text-right">' + fmtP(chPersonal.rev > 0 ? chPersonal.prof / chPersonal.rev : 0) + '</td></tr>' +
    '</table>';

  // Recent orders (filtered by period)
  var recent = filtered.slice(0, 8);
  if (recent.length === 0) {
    $('recentOrders').innerHTML = '<div class="empty"><div class="icon">📋</div><p>尚無訂單</p></div>';
  } else {
    var h = '<table><tr><th>日期</th><th>管道</th><th>商品</th><th>數量</th><th>狀態</th><th class="text-right">利潤</th></tr>';
    recent.forEach(function(o) {
      var p = orderProfit(o);
      h += '<tr><td>' + (o.order_date || '').slice(5) + '</td>' +
        '<td>' + channelBadge(o.channel) + '</td>' +
        '<td>' + esc(o.platform || '') + ' ' + esc(o.version || '') + '</td>' +
        '<td class="text-center">' + (o.qty || 1) + '</td>' +
        '<td>' + statusBadge(o.status) + '</td>' +
        '<td class="text-right ' + (p.profit >= 0 ? 'text-green' : 'text-red') + '">NT$' + fmtN(p.profit) + '</td></tr>';
    });
    $('recentOrders').innerHTML = h + '</table>';
  }
}
function statCard(label, value, sub, cls) {
  return '<div class="stat-card ' + (cls || '') + '"><div class="label">' + label + '</div><div class="value">' + value + '</div>' +
    (sub ? '<div class="sub-val">' + sub + '</div>' : '') + '</div>';
}
function statusBadge(s) {
  var cls = s === '已完成' ? 'ok' : s === '處理中' ? 'pending' : s === '已退款' ? 'refund' : 'cancel';
  return '<span class="badge ' + cls + '">' + s + '</span>';
}
function channelBadge(ch) {
  return ch === '個人' ? '<span class="badge ok">個人</span>' : '<span class="badge pending">8591</span>';
}

/* ──── Products (grouped view) ──── */
var expandedPlatforms = {};
function renderProducts() {
  var q = ($('prodSearch').value || '').toLowerCase();
  var list = products.filter(function(p) {
    if (!q) return true;
    return (p.platform + p.version + p.duration + p.notes).toLowerCase().indexOf(q) >= 0;
  });
  if (list.length === 0) {
    $('productList').innerHTML = '<div class="empty"><div class="icon">📦</div><p>尚無商品，點擊上方新增</p></div>';
    return;
  }
  // Group by platform
  var groups = {};
  list.forEach(function(p) {
    var key = p.platform || '未分類';
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  });
  var html = '';
  Object.keys(groups).sort().forEach(function(plat) {
    var items = groups[plat];
    var isOpen = expandedPlatforms[plat] !== false;
    var activeCount = items.filter(function(p) { return p.status === '啟用' }).length;
    html += '<div class="prod-group card">' +
      '<div class="prod-group-head" onclick="togglePlatform(\'' + esc(plat) + '\')">' +
        '<span class="prod-arrow">' + (isOpen ? '▼' : '▶') + '</span>' +
        '<span class="prod-plat-name">' + esc(plat) + '</span>' +
        '<span class="prod-count">' + activeCount + '/' + items.length + ' 啟用</span>' +
      '</div>';
    if (isOpen) {
      html += '<table class="prod-table"><tr><th>版本</th><th>期間</th><th class="text-right">成本</th><th class="text-right">售價</th><th class="text-right">8591淨利</th><th class="text-right">個人淨利</th><th>狀態</th><th>資料</th><th>操作</th></tr>';
      items.forEach(function(p) {
        var fee8591 = p.price * PLATFORM_FEE;
        var prof8591 = p.price - p.cost - fee8591;
        var profPersonal = p.price - p.cost;
        html += '<tr><td>' + esc(p.version) + '</td><td>' + esc(p.duration) + '</td>' +
          '<td class="text-right">' + fmtN(p.cost) + '</td>' +
          '<td class="text-right">' + fmtN(p.price) + '</td>' +
          '<td class="text-right ' + (prof8591 >= 0 ? 'text-green' : 'text-red') + '">' + fmtN(prof8591) + '</td>' +
          '<td class="text-right text-green">' + fmtN(profPersonal) + '</td>' +
          '<td>' + (p.status === '啟用' ? '<span class="badge active">啟用</span>' : '<span class="badge inactive">停用</span>') + '</td>' +
          '<td class="text-sm">' + esc(p.required_info || '') + '</td>' +
          '<td><div class="act-group">' +
            '<button class="act-btn edit" data-action="editProduct" data-id="' + p.id + '">編輯</button>' +
            '<button class="act-btn del" data-action="deleteProduct" data-id="' + p.id + '">刪除</button>' +
          '</div></td></tr>';
      });
      html += '</table>';
    }
    html += '</div>';
  });
  $('productList').innerHTML = html;
  updatePlatformList();
}
function togglePlatform(plat) {
  expandedPlatforms[plat] = expandedPlatforms[plat] === false ? true : false;
  renderProducts();
}
function updatePlatformList() {
  var set = {};
  products.forEach(function(p) { set[p.platform] = 1 });
  var h = '';
  Object.keys(set).forEach(function(k) { h += '<option value="' + esc(k) + '">' });
  $('platformList').innerHTML = h;
}
function openProductModal(item) {
  $('prodModalTitle').textContent = item ? '編輯商品' : '新增商品';
  $('pm_id').value = item ? item.id : '';
  $('pm_platform').value = item ? item.platform : '';
  $('pm_version').value = item ? item.version : '';
  $('pm_duration').value = item ? item.duration : '';
  $('pm_cost').value = item ? item.cost : '';
  $('pm_price').value = item ? item.price : '';
  $('pm_status').value = item ? item.status : '啟用';
  $('pm_reqInfo').value = item ? (item.required_info || '') : '';
  $('pm_notes').value = item ? (item.notes || '') : '';
  updateProdPreview();
  $('pm_cost').oninput = $('pm_price').oninput = updateProdPreview;
  openModal('productModal');
}
function updateProdPreview() {
  var cost = Number($('pm_cost').value) || 0;
  var price = Number($('pm_price').value) || 0;
  var fee8591 = price * PLATFORM_FEE;
  var prof8591 = price - cost - fee8591;
  var profPersonal = price - cost;
  $('prodPreview').innerHTML =
    '<div class="row"><span class="lbl">8591 淨利</span><span class="val ' + (prof8591 >= 0 ? 'text-green' : 'text-red') + '">NT$' + fmtN(prof8591) + '（手續費 NT$' + fmtN(fee8591) + '）</span></div>' +
    '<div class="row"><span class="lbl">個人 淨利</span><span class="val text-green highlight">NT$' + fmtN(profPersonal) + '</span></div>';
}
function editProduct(id) {
  var item = products.filter(function(p) { return p.id === id })[0];
  if (item) openProductModal(item);
}
function saveProduct() {
  var obj = {
    platform: $('pm_platform').value.trim(),
    version: $('pm_version').value.trim(),
    duration: $('pm_duration').value.trim(),
    cost: Number($('pm_cost').value) || 0,
    price: Number($('pm_price').value) || 0,
    fee_type: '百分比',
    fee_value: PLATFORM_FEE,
    status: $('pm_status').value,
    required_info: $('pm_reqInfo').value.trim(),
    notes: $('pm_notes').value.trim()
  };
  if (!obj.platform) return toast('請填寫平台/商品名稱', 'err');
  var id = $('pm_id').value;
  if (isDemo) {
    if (id) {
      var idx = products.findIndex(function(p) { return p.id === id });
      if (idx >= 0) Object.assign(products[idx], obj);
    } else {
      obj.id = 'd' + Date.now();
      obj.sort_order = products.length;
      products.push(obj);
    }
    demoSave(); closeModal(); renderAll(); toast('商品已儲存', 'ok');
  } else {
    obj.user_id = userId;
    var req = id
      ? sb.from('products').update(obj).eq('id', id)
      : sb.from('products').insert(obj);
    req.then(function(res) {
      if (res.error) return toast(res.error.message, 'err');
      closeModal(); loadAll(); toast('商品已儲存', 'ok');
    });
  }
}
function deleteProduct(id) {
  confirmAction('確定要刪除此商品？', function() {
    if (isDemo) {
      products = products.filter(function(p) { return p.id !== id });
      demoSave(); renderAll(); toast('已刪除', 'ok');
    } else {
      sb.from('products').delete().eq('id', id).then(function(res) {
        if (res.error) return toast(res.error.message, 'err');
        loadAll(); toast('已刪除', 'ok');
      });
    }
  });
}

/* ──── Orders ──── */
function renderOrders() {
  var q = ($('orderSearch').value || '').toLowerCase();
  var status = $('orderStatusFilter').value;
  var channel = $('orderChannelFilter').value;
  var ym = mpGetYM('mpOrders');
  var isAll = mpIsAll('mpOrders');
  var isYear = mpIsYear('mpOrders');
  var yy = mpGetYear('mpOrders');
  var list = orders.filter(function(o) {
    if (status && o.status !== status) return false;
    if (channel && (o.channel || '8591') !== channel) return false;
    if (!isAll) {
      var d = o.order_date || '';
      if (isYear ? d.slice(0, 4) !== yy : d.slice(0, 7) !== ym) return false;
    }
    if (q) {
      var s = (o.order_no + o.platform + o.version + o.notes + getAgentName(o.agent_id) + getCustomerName(o.customer_id)).toLowerCase();
      if (s.indexOf(q) < 0) return false;
    }
    return true;
  });
  if (list.length === 0) {
    $('orderList').innerHTML = '<div class="empty"><div class="icon">📋</div><p>尚無訂單</p></div>';
    return;
  }
  var h = '<table><tr><th>日期</th><th>管道</th><th>出單人</th><th>客戶</th><th>商品</th><th>數量</th><th class="text-right">售價</th><th class="text-right">成本</th><th class="text-right">手續費</th><th class="text-right">利潤</th><th>狀態</th><th>到期</th><th>操作</th></tr>';
  list.forEach(function(o) {
    var p = orderProfit(o);
    var expiry = o.expiry_date || '';
    var expiryWarn = '';
    if (expiry && o.status === '已完成') {
      var diff = (new Date(expiry) - new Date()) / 86400000;
      if (diff < 0) expiryWarn = ' text-red';
      else if (diff < 7) expiryWarn = ' text-yellow';
    }
    h += '<tr><td>' + (o.order_date || '') + '</td>' +
      '<td>' + channelBadge(o.channel) + '</td>' +
      '<td>' + esc(getAgentName(o.agent_id)) + '</td>' +
      '<td>' + esc(getCustomerName(o.customer_id)) + '</td>' +
      '<td>' + esc(o.platform) + ' ' + esc(o.version || '') + '</td>' +
      '<td class="text-center">' + (o.qty || 1) + '</td>' +
      '<td class="text-right">' + fmtN(p.rev) + '</td>' +
      '<td class="text-right">' + fmtN(p.cost) + '</td>' +
      '<td class="text-right">' + fmtN(p.fee) + '</td>' +
      '<td class="text-right ' + (p.profit >= 0 ? 'text-green' : 'text-red') + '">' + fmtN(p.profit) + '</td>' +
      '<td>' + statusBadge(o.status) + '</td>' +
      '<td class="' + expiryWarn + '">' + (expiry ? expiry.slice(5) : '') + '</td>' +
      '<td><div class="act-group">' +
        '<button class="act-btn edit" data-action="editOrder" data-id="' + o.id + '">編輯</button>' +
        '<button class="act-btn del" data-action="deleteOrder" data-id="' + o.id + '">刪除</button>' +
      '</div></td></tr>';
  });
  $('orderList').innerHTML = h + '</table>';
}
function getAgentName(id) {
  if (!id) return '';
  var a = agents.filter(function(x) { return x.id === id })[0];
  return a ? a.name : '';
}
function getCustomerName(id) {
  if (!id) return '';
  var c = customers.filter(function(x) { return x.id === id })[0];
  return c ? c.name : '';
}
function onChannelChange() {
  var ch = $('om_channel').value;
  var isPersonal = ch === '個人';
  $('om_manualGroup').style.display = isPersonal ? '' : 'none';
  $('om_productGroup').style.display = '';
  if (isPersonal) renderPersonalSelect();
  calcOrderPreview();
}
function renderPersonalSelect(selected) {
  var presets = getPersonalPresets();
  var sel = selected || $('om_personalSelect').value || '';
  var h = '<option value="">— 選擇商品 —</option>';
  presets.forEach(function(p) {
    h += '<option value="' + esc(p) + '"' + (sel === p ? ' selected' : '') + '>' + esc(p) + '</option>';
  });
  h += '<option value="__custom__"' + (sel === '__custom__' ? ' selected' : '') + '>其他（自訂）</option>';
  $('om_personalSelect').innerHTML = h;
  $('om_customNameGroup').style.display = sel === '__custom__' ? '' : 'none';
}
function onPersonalSelect() {
  var val = $('om_personalSelect').value;
  $('om_customNameGroup').style.display = val === '__custom__' ? '' : 'none';
  if (val && val !== '__custom__') {
    $('om_manualName').value = val;
    $('om_product').value = '';
  } else if (val === '__custom__') {
    $('om_manualName').value = '';
  }
  calcOrderPreview();
}
function openOrderModal(item) {
  $('orderModalTitle').textContent = item ? '編輯訂單' : '新增訂單';
  $('om_id').value = item ? item.id : '';
  dpInit('om_date', { value: item ? item.order_date : today() });
  $('om_channel').value = item ? (item.channel || '8591') : '8591';

  var agHtml = '<option value="">（自己）</option>';
  agents.forEach(function(a) {
    var sel = item && item.agent_id === a.id ? ' selected' : '';
    agHtml += '<option value="' + a.id + '"' + sel + '>' + esc(a.name) + '</option>';
  });
  $('om_agent').innerHTML = agHtml;

  var cuHtml = '<option value="">（無）</option>';
  customers.forEach(function(c) {
    var sel = item && item.customer_id === c.id ? ' selected' : '';
    cuHtml += '<option value="' + c.id + '"' + sel + '>' + esc(c.name) + '</option>';
  });
  $('om_customer').innerHTML = cuHtml;

  // Product dropdown grouped by platform
  var prHtml = '<option value="">— 選擇商品 —</option>';
  var grouped = {};
  products.filter(function(p) { return p.status === '啟用' }).forEach(function(p) {
    if (!grouped[p.platform]) grouped[p.platform] = [];
    grouped[p.platform].push(p);
  });
  Object.keys(grouped).sort().forEach(function(plat) {
    prHtml += '<optgroup label="' + esc(plat) + '">';
    grouped[plat].forEach(function(p) {
      var sel = item && item.product_id === p.id ? ' selected' : '';
      prHtml += '<option value="' + p.id + '"' + sel + '>' + esc(p.version) + ' ' + esc(p.duration) + ' | NT$' + fmtN(p.price) + '</option>';
    });
    prHtml += '</optgroup>';
  });
  $('om_product').innerHTML = prHtml;

  $('om_qty').value = item ? item.qty : 1;
  $('om_unitPrice').value = item ? item.unit_price : '';
  $('om_unitCost').value = item ? item.unit_cost : '';
  $('om_status').value = item ? item.status : '已完成';
  dpInit('om_expiry', { value: item ? (item.expiry_date || '') : '', allowEmpty: true });
  $('om_notes').value = item ? (item.notes || '') : '';
  $('om_manualName').value = item ? (item.platform || '') : '';

  // Set personal select when editing a personal-channel order
  if (item && (item.channel || '8591') === '個人' && !pid) {
    var presets = getPersonalPresets();
    var editName = item.platform || '';
    if (presets.indexOf(editName) >= 0) {
      renderPersonalSelect(editName);
    } else {
      renderPersonalSelect('__custom__');
    }
  }

  onChannelChange();
  if (item) calcOrderPreview();
  else $('orderPreview').innerHTML = '';

  openModal('orderModal');
}
function onProductSelect() {
  var pid = $('om_product').value;
  var p = products.filter(function(x) { return x.id === pid })[0];
  if (p) {
    $('om_unitPrice').value = p.price;
    $('om_unitCost').value = p.cost;
    var dur = p.duration || '';
    var months = parseInt(dur) || 0;
    if (months > 0) {
      var d = new Date(dpGetVal('om_date') || today());
      d.setMonth(d.getMonth() + months);
      dpSetVal('om_expiry', d.toISOString().slice(0, 10));
    }
    calcOrderPreview();
  }
}
function calcOrderPreview() {
  var qty = Number($('om_qty').value) || 1;
  var price = Number($('om_unitPrice').value) || 0;
  var cost = Number($('om_unitCost').value) || 0;
  var ch = $('om_channel').value;
  var fee = channelFee(ch, price) * qty;
  var totalRev = price * qty;
  var totalCost = cost * qty;
  var gross = totalRev - totalCost - fee;

  var agId = $('om_agent').value;
  var ag = agents.filter(function(x) { return x.id === agId })[0];
  var commType = ag ? ag.commission_type : '百分比';
  var commVal = ag ? ag.commission_value : 0;
  var comm = calcCommission(gross, commType, commVal);
  var profit = gross - comm;
  var cls = profit >= 0 ? 'text-green' : 'text-red';

  $('orderPreview').innerHTML =
    '<div class="row"><span class="lbl">總售價</span><span class="val">NT$' + fmtN(totalRev) + '</span></div>' +
    '<div class="row"><span class="lbl">總成本</span><span class="val">NT$' + fmtN(totalCost) + '</span></div>' +
    (fee > 0 ? '<div class="row"><span class="lbl">8591 手續費 (3%)</span><span class="val">-NT$' + fmtN(fee) + '</span></div>' : '') +
    '<div class="row"><span class="lbl">毛利</span><span class="val">NT$' + fmtN(gross) + '</span></div>' +
    (comm > 0 ? '<div class="row"><span class="lbl">出單人抽成 (' + esc(ag ? ag.name : '') + ')</span><span class="val">-NT$' + fmtN(comm) + '</span></div>' : '') +
    '<div class="row"><span class="lbl">最終利潤</span><span class="val ' + cls + ' highlight">NT$' + fmtN(profit) + '</span></div>';
}
function editOrder(id) {
  var item = orders.filter(function(o) { return o.id === id })[0];
  if (item) openOrderModal(item);
}
function saveOrder() {
  var pid = $('om_product').value;
  var p = products.filter(function(x) { return x.id === pid })[0];
  var agId = $('om_agent').value || null;
  var ag = agents.filter(function(x) { return x.id === agId })[0];
  var ch = $('om_channel').value;
  var manualName = $('om_manualName').value.trim();

  var obj = {
    order_date: dpGetVal('om_date'),
    order_no: genOrderNo(),
    agent_id: agId,
    customer_id: $('om_customer').value || null,
    channel: ch,
    status: $('om_status').value,
    product_id: pid || null,
    platform: p ? p.platform : (ch === '個人' && $('om_personalSelect').value && $('om_personalSelect').value !== '__custom__' ? $('om_personalSelect').value : manualName),
    version: p ? p.version : '',
    duration: p ? p.duration : '',
    qty: Number($('om_qty').value) || 1,
    unit_price: Number($('om_unitPrice').value) || 0,
    unit_cost: Number($('om_unitCost').value) || 0,
    fee_type: '百分比',
    fee_value: ch === '8591' ? PLATFORM_FEE : 0,
    commission_type: ag ? ag.commission_type : '百分比',
    commission_value: ag ? ag.commission_value : 0,
    expiry_date: dpGetVal('om_expiry') || null,
    notes: $('om_notes').value.trim()
  };
  if (!obj.platform) return toast('請選擇商品或輸入商品名稱', 'err');
  // Auto-remember custom personal channel product names
  if (ch === '個人' && $('om_personalSelect').value === '__custom__' && manualName) addPersonalPreset(manualName);

  var id = $('om_id').value;
  if (id) obj.order_no = orders.filter(function(o) { return o.id === id })[0].order_no;

  if (isDemo) {
    if (id) {
      var idx = orders.findIndex(function(o) { return o.id === id });
      if (idx >= 0) Object.assign(orders[idx], obj);
    } else {
      obj.id = 'd' + Date.now();
      orders.unshift(obj);
    }
    demoSave(); closeModal(); renderAll(); toast('訂單已儲存', 'ok');
  } else {
    obj.user_id = userId;
    var req = id
      ? sb.from('orders').update(obj).eq('id', id)
      : sb.from('orders').insert(obj);
    req.then(function(res) {
      if (res.error) return toast(res.error.message, 'err');
      closeModal(); loadAll(); toast('訂單已儲存', 'ok');
    });
  }
}
function deleteOrder(id) {
  confirmAction('確定要刪除此訂單？', function() {
    if (isDemo) {
      orders = orders.filter(function(o) { return o.id !== id });
      demoSave(); renderAll(); toast('已刪除', 'ok');
    } else {
      sb.from('orders').delete().eq('id', id).then(function(res) {
        if (res.error) return toast(res.error.message, 'err');
        loadAll(); toast('已刪除', 'ok');
      });
    }
  });
}

/* ──── Agents ──── */
function renderAgents() {
  if (agents.length === 0) {
    $('agentList').innerHTML = '<div class="empty"><div class="icon">👥</div><p>尚無出單人，點擊上方新增</p></div>';
    return;
  }
  var h = '<table><tr><th>名稱</th><th>抽成方式</th><th>抽成數值</th><th>訂單數</th><th class="text-right">總利潤貢獻</th><th>備註</th><th>操作</th></tr>';
  agents.forEach(function(a) {
    var agOrders = orders.filter(function(o) { return o.agent_id === a.id && o.status === '已完成' });
    var totalProfit = 0;
    agOrders.forEach(function(o) { totalProfit += orderProfit(o).profit });
    h += '<tr><td>' + esc(a.name) + '</td>' +
      '<td>' + a.commission_type + '</td>' +
      '<td>' + (a.commission_type === '百分比' ? fmtP(a.commission_value) : 'NT$' + fmtN(a.commission_value)) + '</td>' +
      '<td class="text-center">' + agOrders.length + '</td>' +
      '<td class="text-right ' + (totalProfit >= 0 ? 'text-green' : 'text-red') + '">NT$' + fmtN(totalProfit) + '</td>' +
      '<td>' + esc(a.notes || '') + '</td>' +
      '<td><div class="act-group">' +
        '<button class="act-btn edit" data-action="editAgent" data-id="' + a.id + '">編輯</button>' +
        '<button class="act-btn del" data-action="deleteAgent" data-id="' + a.id + '">刪除</button>' +
      '</div></td></tr>';
  });
  $('agentList').innerHTML = h + '</table>';
}
function openAgentModal(item) {
  $('agentModalTitle').textContent = item ? '編輯出單人' : '新增出單人';
  $('am_id').value = item ? item.id : '';
  $('am_name').value = item ? item.name : '';
  $('am_commType').value = item ? item.commission_type : '百分比';
  $('am_commVal').value = item ? item.commission_value : '';
  $('am_notes').value = item ? (item.notes || '') : '';
  openModal('agentModal');
}
function editAgent(id) {
  var item = agents.filter(function(a) { return a.id === id })[0];
  if (item) openAgentModal(item);
}
function saveAgent() {
  var obj = {
    name: $('am_name').value.trim(),
    commission_type: $('am_commType').value,
    commission_value: Number($('am_commVal').value) || 0,
    notes: $('am_notes').value.trim()
  };
  if (!obj.name) return toast('請填寫名稱', 'err');
  var id = $('am_id').value;
  if (isDemo) {
    if (id) {
      var idx = agents.findIndex(function(a) { return a.id === id });
      if (idx >= 0) Object.assign(agents[idx], obj);
    } else {
      obj.id = 'd' + Date.now();
      agents.push(obj);
    }
    demoSave(); closeModal(); renderAll(); toast('出單人已儲存', 'ok');
  } else {
    obj.user_id = userId;
    var req = id
      ? sb.from('agents').update(obj).eq('id', id)
      : sb.from('agents').insert(obj);
    req.then(function(res) {
      if (res.error) return toast(res.error.message, 'err');
      closeModal(); loadAll(); toast('出單人已儲存', 'ok');
    });
  }
}
function deleteAgent(id) {
  confirmAction('確定要刪除此出單人？', function() {
    if (isDemo) {
      agents = agents.filter(function(a) { return a.id !== id });
      demoSave(); renderAll(); toast('已刪除', 'ok');
    } else {
      sb.from('agents').delete().eq('id', id).then(function(res) {
        if (res.error) return toast(res.error.message, 'err');
        loadAll(); toast('已刪除', 'ok');
      });
    }
  });
}

/* ──── Customers ──── */
function renderCustomers() {
  var q = ($('custSearch').value || '').toLowerCase();
  var list = customers.filter(function(c) {
    if (!q) return true;
    return (c.name + c.contact + c.platform + c.notes).toLowerCase().indexOf(q) >= 0;
  });
  if (list.length === 0) {
    $('customerList').innerHTML = '<div class="empty"><div class="icon">🧑‍💼</div><p>尚無客戶，點擊上方新增</p></div>';
    return;
  }
  var h = '<table><tr><th>名稱</th><th>聯絡方式</th><th>來源平台</th><th>訂單數</th><th class="text-right">消費總額</th><th>備註</th><th>操作</th></tr>';
  list.forEach(function(c) {
    var custOrders = orders.filter(function(o) { return o.customer_id === c.id });
    var total = 0;
    custOrders.forEach(function(o) { total += (o.qty || 1) * (o.unit_price || 0) });
    h += '<tr><td>' + esc(c.name) + '</td><td>' + esc(c.contact || '') + '</td><td>' + esc(c.platform || '') + '</td>' +
      '<td class="text-center">' + custOrders.length + '</td>' +
      '<td class="text-right">NT$' + fmtN(total) + '</td>' +
      '<td>' + esc(c.notes || '') + '</td>' +
      '<td><div class="act-group">' +
        '<button class="act-btn edit" data-action="editCustomer" data-id="' + c.id + '">編輯</button>' +
        '<button class="act-btn del" data-action="deleteCustomer" data-id="' + c.id + '">刪除</button>' +
      '</div></td></tr>';
  });
  $('customerList').innerHTML = h + '</table>';
}
function openCustomerModal(item) {
  $('custModalTitle').textContent = item ? '編輯客戶' : '新增客戶';
  $('cm_id').value = item ? item.id : '';
  $('cm_name').value = item ? item.name : '';
  $('cm_contact').value = item ? (item.contact || '') : '';
  $('cm_platform').value = item ? (item.platform || '') : '';
  $('cm_notes').value = item ? (item.notes || '') : '';
  openModal('customerModal');
}
function editCustomer(id) {
  var item = customers.filter(function(c) { return c.id === id })[0];
  if (item) openCustomerModal(item);
}
function saveCustomer() {
  var obj = {
    name: $('cm_name').value.trim(),
    contact: $('cm_contact').value.trim(),
    platform: $('cm_platform').value.trim(),
    notes: $('cm_notes').value.trim()
  };
  if (!obj.name) return toast('請填寫名稱', 'err');
  var id = $('cm_id').value;
  if (isDemo) {
    if (id) {
      var idx = customers.findIndex(function(c) { return c.id === id });
      if (idx >= 0) Object.assign(customers[idx], obj);
    } else {
      obj.id = 'd' + Date.now();
      customers.push(obj);
    }
    demoSave(); closeModal(); renderAll(); toast('客戶已儲存', 'ok');
  } else {
    obj.user_id = userId;
    var req = id
      ? sb.from('customers').update(obj).eq('id', id)
      : sb.from('customers').insert(obj);
    req.then(function(res) {
      if (res.error) return toast(res.error.message, 'err');
      closeModal(); loadAll(); toast('客戶已儲存', 'ok');
    });
  }
}
function deleteCustomer(id) {
  confirmAction('確定要刪除此客戶？', function() {
    if (isDemo) {
      customers = customers.filter(function(c) { return c.id !== id });
      demoSave(); renderAll(); toast('已刪除', 'ok');
    } else {
      sb.from('customers').delete().eq('id', id).then(function(res) {
        if (res.error) return toast(res.error.message, 'err');
        loadAll(); toast('已刪除', 'ok');
      });
    }
  });
}

/* ──── Ads ──── */
function renderAds() {
  var ym = mpGetYM('mpAds');
  var isAll = mpIsAll('mpAds');
  var isYear = mpIsYear('mpAds');
  var yy = mpGetYear('mpAds');
  var list = ads.filter(function(a) {
    if (isAll) return true;
    var d = a.ad_date || '';
    if (isYear) return d.slice(0, 4) === yy;
    return d.slice(0, 7) === ym;
  });

  // Stats by platform
  var platMap = {};
  var total = 0;
  list.forEach(function(a) {
    var p = a.ad_platform || '其他';
    if (!platMap[p]) platMap[p] = 0;
    platMap[p] += a.amount || 0;
    total += a.amount || 0;
  });
  var statHtml = statCard('總廣告費', 'NT$' + fmtN(total), list.length + ' 筆', 'red');
  Object.keys(platMap).sort(function(a, b) { return platMap[b] - platMap[a] }).forEach(function(p) {
    statHtml += statCard(p, 'NT$' + fmtN(platMap[p]), fmtP(total > 0 ? platMap[p] / total : 0));
  });
  $('adStatCards').innerHTML = statHtml;

  if (list.length === 0) {
    $('adList').innerHTML = '<div class="empty"><div class="icon">📢</div><p>尚無廣告記錄</p></div>';
    return;
  }
  var h = '<table><tr><th>日期</th><th>廣告平台</th><th class="text-right">金額</th><th>備註</th><th>操作</th></tr>';
  list.forEach(function(a) {
    h += '<tr><td>' + (a.ad_date || '') + '</td><td>' + esc(a.ad_platform || '') + '</td>' +
      '<td class="text-right text-red">NT$' + fmtN(a.amount) + '</td>' +
      '<td>' + esc(a.notes || '') + '</td>' +
      '<td><div class="act-group">' +
        '<button class="act-btn edit" data-action="editAd" data-id="' + a.id + '">編輯</button>' +
        '<button class="act-btn del" data-action="deleteAd" data-id="' + a.id + '">刪除</button>' +
      '</div></td></tr>';
  });
  $('adList').innerHTML = h + '</table>';
}
function openAdModal(item) {
  $('adModalTitle').textContent = item ? '編輯廣告支出' : '新增廣告支出';
  $('ad_id').value = item ? item.id : '';
  dpInit('ad_date', { value: item ? item.ad_date : today() });
  $('ad_amount').value = item ? item.amount : '';
  $('ad_platform').value = item ? (item.ad_platform || '') : '8591';
  $('ad_notes').value = item ? (item.notes || '') : '';
  openModal('adModal');
}
function editAd(id) {
  var item = ads.filter(function(a) { return a.id === id })[0];
  if (item) openAdModal(item);
}
function saveAd() {
  var obj = {
    ad_date: dpGetVal('ad_date'),
    amount: Number($('ad_amount').value) || 0,
    ad_platform: $('ad_platform').value.trim(),
    notes: $('ad_notes').value.trim()
  };
  if (!obj.amount) return toast('請填寫金額', 'err');
  var id = $('ad_id').value;
  if (isDemo) {
    if (id) {
      var idx = ads.findIndex(function(a) { return a.id === id });
      if (idx >= 0) Object.assign(ads[idx], obj);
    } else {
      obj.id = 'd' + Date.now();
      ads.unshift(obj);
    }
    demoSave(); closeModal(); renderAll(); toast('廣告記錄已儲存', 'ok');
  } else {
    obj.user_id = userId;
    var req = id
      ? sb.from('ad_spends').update(obj).eq('id', id)
      : sb.from('ad_spends').insert(obj);
    req.then(function(res) {
      if (res.error) return toast(res.error.message, 'err');
      closeModal(); loadAll(); toast('廣告記錄已儲存', 'ok');
    });
  }
}
function deleteAd(id) {
  confirmAction('確定要刪除此廣告記錄？', function() {
    if (isDemo) {
      ads = ads.filter(function(a) { return a.id !== id });
      demoSave(); renderAll(); toast('已刪除', 'ok');
    } else {
      sb.from('ad_spends').delete().eq('id', id).then(function(res) {
        if (res.error) return toast(res.error.message, 'err');
        loadAll(); toast('已刪除', 'ok');
      });
    }
  });
}

/* ──── Refresh ──── */
function doRefresh() {
  if (isDemo) { loadAll(); toast('已重新整理', 'ok'); return }
  loadAll();
  toast('已重新整理', 'ok');
}

/* ──── Global Event Delegation ──── */
document.addEventListener('click', function(e) {
  var btn = e.target.closest('[data-action]');
  if (!btn) return;
  var action = btn.getAttribute('data-action');
  var id = btn.getAttribute('data-id');
  switch (action) {
    case 'editProduct': editProduct(id); break;
    case 'deleteProduct': deleteProduct(id); break;
    case 'editOrder': editOrder(id); break;
    case 'deleteOrder': deleteOrder(id); break;
    case 'editAgent': editAgent(id); break;
    case 'deleteAgent': deleteAgent(id); break;
    case 'editCustomer': editCustomer(id); break;
    case 'deleteCustomer': deleteCustomer(id); break;
    case 'editAd': editAd(id); break;
    case 'deleteAd': deleteAd(id); break;
  }
});

/* ──── Settings ──── */
function openSettings() {
  $('set_apiKey').value = localStorage.getItem('proxy-api-key') || '';
  openModal('settingsModal');
}
function saveSettings() {
  var key = $('set_apiKey').value.trim();
  if (key) localStorage.setItem('proxy-api-key', key);
  else localStorage.removeItem('proxy-api-key');
  closeModal();
  toast('設定已儲存', 'ok');
}

/* ──── OCR Screenshot Import ──── */
var ocrParsedOrders = [];
var ocrImageBase64 = '';

function openOcrModal() {
  var key = localStorage.getItem('proxy-api-key');
  if (!key) {
    toast('請先到設定（⚙）填入 Anthropic API Key', 'err');
    openSettings();
    return;
  }
  resetOcr();
  openModal('ocrModal');
}

function resetOcr() {
  ocrParsedOrders = [];
  ocrImageBase64 = '';
  $('ocrPlaceholder').style.display = '';
  $('ocrPreviewImg').style.display = 'none';
  $('ocrStatus').style.display = 'none';
  $('ocrResults').style.display = 'none';
  $('btnOcrImport').style.display = 'none';
  $('btnOcrRetry').style.display = 'none';
  $('ocrFile').value = '';
}

// Click to upload
document.addEventListener('click', function(e) {
  if (e.target.closest('#ocrPlaceholder')) {
    $('ocrFile').click();
  }
});

// Drag & drop
document.addEventListener('dragover', function(e) {
  var area = e.target.closest('#ocrUploadArea');
  if (area) { e.preventDefault(); area.classList.add('dragover') }
});
document.addEventListener('dragleave', function(e) {
  var area = e.target.closest('#ocrUploadArea');
  if (area) area.classList.remove('dragover');
});
document.addEventListener('drop', function(e) {
  var area = e.target.closest('#ocrUploadArea');
  if (!area) return;
  e.preventDefault();
  area.classList.remove('dragover');
  var file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) handleOcrFile(file);
});

function onOcrFileSelect(e) {
  var file = e.target.files[0];
  if (file) handleOcrFile(file);
}

function handleOcrFile(file) {
  var reader = new FileReader();
  reader.onload = function(e) {
    var dataUrl = e.target.result;
    ocrImageBase64 = dataUrl.split(',')[1];
    var mediaType = file.type || 'image/png';

    // Show preview
    $('ocrPreviewImg').src = dataUrl;
    $('ocrPreviewImg').style.display = '';
    $('ocrPlaceholder').style.display = 'none';
    $('ocrStatus').style.display = 'flex';
    $('btnOcrRetry').style.display = '';

    // Call Claude API
    callClaudeVision(ocrImageBase64, mediaType);
  };
  reader.readAsDataURL(file);
}

function callClaudeVision(base64, mediaType) {
  var apiKey = localStorage.getItem('proxy-api-key');
  if (!apiKey) { toast('請先設定 API Key', 'err'); return }

  var prompt = '你是一個 8591 訂單資料擷取工具。請分析這張截圖中的所有訂單資料。\n\n' +
    '每筆訂單請擷取以下欄位：\n' +
    '- order_date: 下單時間（格式 YYYY-MM-DD）\n' +
    '- platform: 商品平台（如 Discord Nitro, YouTube Premium, Netflix 等）\n' +
    '- version: 品項詳情（如「加成3個月」「贈禮版/30天」等）\n' +
    '- qty: 數量（數字）\n' +
    '- unit_price: 售價（數字，不含$符號）\n' +
    '- buyer: 買家編號\n' +
    '- status: 狀態（已完成/處理中/已取消/已退款）\n\n' +
    '請直接回傳 JSON 陣列格式，不要加任何說明文字，格式如下：\n' +
    '[{"order_date":"2026-06-07","platform":"Discord Nitro","version":"加成3個月 - 2次","qty":1,"unit_price":320,"buyer":"No.3492787","status":"已完成"}]';

  fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: prompt }
        ]
      }]
    })
  })
  .then(function(res) {
    if (!res.ok) {
      return res.json().then(function(err) {
        throw new Error(err.error ? err.error.message : 'API 錯誤 ' + res.status);
      });
    }
    return res.json();
  })
  .then(function(data) {
    var text = data.content[0].text.trim();
    // Extract JSON from response (might be wrapped in code blocks)
    var jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('無法解析回應');
    ocrParsedOrders = JSON.parse(jsonMatch[0]);
    showOcrResults();
  })
  .catch(function(err) {
    $('ocrStatus').style.display = 'none';
    toast('辨識失敗：' + err.message, 'err');
  });
}

function showOcrResults() {
  $('ocrStatus').style.display = 'none';
  $('ocrResults').style.display = '';
  $('btnOcrImport').style.display = '';

  var total = 0, count = ocrParsedOrders.length;
  var html = '';
  ocrParsedOrders.forEach(function(o, i) {
    var price = Number(o.unit_price) || 0;
    var qty = Number(o.qty) || 1;
    total += price * qty;

    // Try to match product cost from existing products
    var matchedCost = matchProductCost(o.platform, o.version);

    html += '<div class="ocr-order-card">' +
      '<div class="ocr-row"><span class="ocr-label">商品</span><span class="ocr-val">' + esc(o.platform) + '</span></div>' +
      '<div class="ocr-row"><span class="ocr-label">品項</span><span class="ocr-val">' + esc(o.version || '') + '</span></div>' +
      '<div class="ocr-row"><span class="ocr-label">日期</span><span class="ocr-val">' + esc(o.order_date || '') + '</span></div>' +
      '<div class="ocr-row"><span class="ocr-label">售價</span><span class="ocr-price">$' + fmtN(price) + (qty > 1 ? ' x' + qty : '') + '</span></div>' +
      '<div class="ocr-row"><span class="ocr-label">成本</span><input class="ocr-cost-input" id="ocrCost' + i + '" type="number" min="0" value="' + (matchedCost || '') + '" placeholder="輸入成本"></div>' +
      '<div class="ocr-row"><span class="ocr-label">買家</span><span class="ocr-val" style="color:var(--fg2)">' + esc(o.buyer || '') + '</span></div>' +
      '</div>';
  });
  $('ocrOrderList').innerHTML = html;
  $('ocrSummary').innerHTML =
    '<div class="sum-item"><div class="sum-label">訂單數</div><div class="sum-val">' + count + ' 筆</div></div>' +
    '<div class="sum-item"><div class="sum-label">總售價</div><div class="sum-val">NT$' + fmtN(total) + '</div></div>';
}

function matchProductCost(platform, version) {
  // Try to find matching product in database for auto-fill cost
  var match = null;
  products.forEach(function(p) {
    if (!match && p.status === '啟用') {
      var pName = (p.platform || '').toLowerCase();
      var oName = (platform || '').toLowerCase();
      if (oName.indexOf(pName) >= 0 || pName.indexOf(oName) >= 0) {
        // Platform matches, check version if possible
        if (version && p.version) {
          var pVer = p.version.toLowerCase();
          var oVer = version.toLowerCase();
          if (oVer.indexOf(pVer) >= 0 || pVer.indexOf(oVer) >= 0) {
            match = p;
          }
        }
        if (!match) match = p; // fallback to platform-only match
      }
    }
  });
  return match ? match.cost : 0;
}

function importOcrOrders() {
  if (ocrParsedOrders.length === 0) return;
  $('btnOcrImport').disabled = true;
  $('btnOcrImport').textContent = '匯入中...';

  var rows = ocrParsedOrders.map(function(o, i) {
    var d = o.order_date || today();
    var costInput = $('ocrCost' + i);
    var cost = costInput ? Number(costInput.value) || 0 : 0;
    return {
      user_id: userId,
      order_date: d,
      order_no: d.replace(/-/g, '') + '-' + String(i + 1).padStart(2, '0'),
      channel: '8591',
      status: o.status || '已完成',
      platform: o.platform || '',
      version: o.version || '',
      duration: '',
      qty: Number(o.qty) || 1,
      unit_price: Number(o.unit_price) || 0,
      unit_cost: cost,
      fee_type: '百分比',
      fee_value: PLATFORM_FEE,
      commission_type: '百分比',
      commission_value: 0,
      notes: '截圖匯入' + (o.buyer ? ' | 買家' + o.buyer : '')
    };
  });

  if (isDemo) {
    rows.forEach(function(r) { r.id = 'd' + Date.now() + Math.random(); orders.unshift(r) });
    demoSave(); closeModal(); renderAll();
    toast('成功匯入 ' + rows.length + ' 筆訂單', 'ok');
    return;
  }

  sb.from('orders').insert(rows).then(function(res) {
    if (res.error) {
      toast('匯入失敗：' + res.error.message, 'err');
      $('btnOcrImport').disabled = false;
      $('btnOcrImport').textContent = '匯入全部';
      return;
    }
    closeModal(); loadAll();
    toast('成功匯入 ' + rows.length + ' 筆訂單！', 'ok');
  });
}

/* ──── Utils ──── */
function esc(s) {
  if (!s) return '';
  var d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
