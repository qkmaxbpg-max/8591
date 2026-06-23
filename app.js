/* 代儲管理系統 */
var SUPABASE_URL='https://hpajiexvcmkidbgreaqy.supabase.co';
var SUPABASE_ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwYWppZXh2Y21raWRiZ3JlYXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMTY2NTQsImV4cCI6MjA5NDU5MjY1NH0.ZIxx-cJRHxLAv-TlPpjvFGBndzs-GE9ptZENh81AQQQ';
var PLATFORM_FEE = 0.03; // 8591 fixed 3%
var SHOPEE_FEE = 0.10; // 蝦皮預設 10%
var sb = null, userId = null, isDemo = false;
var products = [], agents = [], customers = [], orders = [], ads = [], adConfigs = [], serviceAccounts = [];
var renewExpiryBase = '';

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
  adConfigs = JSON.parse(localStorage.getItem('proxy-demo-adconfigs') || '[]');
  enterApp('本機模式');
}
function enterApp(label) {
  $('loginPage').style.display = 'none';
  $('app').style.display = '';
  mpInit('mpDash', renderDashboard);
  mpInit('mpOrders', renderOrders);
  mpInit('mpExp', renderAds);
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
  localStorage.setItem('proxy-demo-adconfigs', JSON.stringify(adConfigs));
  localStorage.setItem('proxy-demo-svcaccounts', JSON.stringify(serviceAccounts));
}

function loadAll() {
  if (isDemo) { renderAll(); return }
  Promise.all([
    sb.from('products').select('*').eq('user_id', userId).order('sort_order'),
    sb.from('agents').select('*').eq('user_id', userId).order('created_at'),
    sb.from('customers').select('*').eq('user_id', userId).order('created_at'),
    sb.from('orders').select('*').eq('user_id', userId).order('order_date', { ascending: false }),
    sb.from('ad_spends').select('*').eq('user_id', userId).order('ad_date', { ascending: false }),
    sb.from('service_accounts').select('*').eq('user_id', userId).order('created_at')
  ]).then(function(res) {
    res.forEach(function(r, i) {
      if (r && r.error) console.warn('Table load error [' + i + ']:', r.error.message);
    });
    products = res[0].data || [];
    agents = res[1].data || [];
    customers = res[2].data || [];
    orders = res[3].data || [];
    ads = res[4].data || [];
    serviceAccounts = (res[5] && res[5].data) || [];
    renderAll();
    // ad_configs loaded separately — re-render ads tab when ready
    sb.from('ad_configs').select('*').eq('user_id', userId).order('created_at', { ascending: false }).then(function(r2) {
      if (r2 && r2.data) { adConfigs = r2.data; renderAds(); renderDashboard(); }
    }).catch(function() { adConfigs = []; });
  }).catch(function(err) {
    console.error('loadAll failed:', err);
    toast('載入失敗，請重新整理', 'err');
  });
}

function renderAll() {
  var sh = $('stickyHeader');
  if (sh) document.documentElement.style.setProperty('--sticky-top', sh.offsetHeight + 'px');
  renderDashboard();
  renderProducts();
  renderOrders();
  renderAgents();
  renderCustomers();
  renderAds();
  renderSubscriptions();
  checkExpiryNotifications();
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
  if (channel === '8591') return unitPrice * PLATFORM_FEE;
  if (channel === '蝦皮') return unitPrice * SHOPEE_FEE;
  return 0;
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
  var max = 0;
  orders.forEach(function(o) {
    var m = (o.order_no || '').match(/^MWJ-(\d+)$/);
    if (m) { var n = Number(m[1]); if (n > max) max = n; }
  });
  var seq = max + 1;
  return 'MWJ-' + String(seq).padStart(5, '0');
}
function monthAds(ym) {
  var oldTotal = ads.filter(function(a) { return (a.ad_date || '').slice(0, 7) === ym })
    .reduce(function(s, a) { return s + (a.amount || 0) }, 0);
  return oldTotal + calcAdConfigCost(ym);
}
function calcAdConfigCost(ym) {
  var t = today();
  var mStart = ym + '-01';
  var parts = ym.split('-'); var y = Number(parts[0]); var m = Number(parts[1]);
  var mEndDate = new Date(y, m, 0);
  var mEnd = ym + '-' + (mEndDate.getDate() < 10 ? '0' : '') + mEndDate.getDate();
  if (mEnd > t) mEnd = t;
  if (mStart > t) return 0;
  var total = 0;
  adConfigs.forEach(function(c) {
    if (!c.active) return;
    var s = c.start_date || '';
    var e = c.end_date || '9999-12-31';
    if (e > t) e = t;
    if (e < mStart || s > mEnd) return;
    var effStart = s > mStart ? s : mStart;
    var effEnd = e < mEnd ? e : mEnd;
    var d1 = new Date(effStart); var d2 = new Date(effEnd);
    var days = Math.round((d2 - d1) / 86400000) + 1;
    if (days > 0) total += days * (c.daily_cost || 0);
  });
  return total;
}
function calcAdConfigCostRange(startDate, endDate) {
  var total = 0;
  adConfigs.forEach(function(c) {
    if (!c.active) return;
    var s = c.start_date || '';
    var e = c.end_date || '9999-12-31';
    if (e < startDate || s > endDate) return;
    var effStart = s > startDate ? s : startDate;
    var effEnd = e < endDate ? e : endDate;
    var d1 = new Date(effStart); var d2 = new Date(effEnd);
    var days = Math.round((d2 - d1) / 86400000) + 1;
    if (days > 0) total += days * (c.daily_cost || 0);
  });
  return total;
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
  var h = '<div class="dp-panel">' +
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
  // Close all open date pickers on outside click (but not when clicking inside a panel)
  if (!e.target.closest('.dp-panel')) {
    Object.keys(dpState).forEach(function(id) {
      if (dpState[id].open) { dpState[id].open = false; dpRender(id) }
    });
  }
});

/* ──── Dashboard ──── */
function renderDashboard() {
  try { _renderDashboard() } catch(e) { console.error('renderDashboard error:', e); toast('總覽載入失敗：' + e.message, 'err') }
}
function _renderDashboard() {
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
    ? ads.reduce(function(s, a) { return s + (a.amount || 0) }, 0) + adConfigs.filter(function(c){return c.active}).reduce(function(s,c){ var t=today(),sd=c.start_date||t,ed=c.end_date||t; if(ed>t)ed=t; if(sd>t)return s; return s+Math.max(0,Math.round((new Date(ed)-new Date(sd))/86400000)+1)*(c.daily_cost||0) },0)
    : isYear
      ? ads.filter(function(a) { return (a.ad_date || '').slice(0, 4) === yy }).reduce(function(s, a) { return s + (a.amount || 0) }, 0) + (function(){ var t=0; for(var mi=1;mi<=12;mi++){var mm=mi<10?'0'+mi:''+mi; t+=calcAdConfigCost(yy+'-'+mm)} return t })()
      : monthAds(ym);
  var netProfit = orderProf - adTotal;
  var margin = totalRev > 0 ? netProfit / totalRev : 0;

  var td = today();
  var todayCompleted = orders.filter(function(o) { return o.status === '已完成' && o.order_date === td });
  var todayRev = 0, todayProf = 0;
  todayCompleted.forEach(function(o) { var p = orderProfit(o); todayRev += p.rev; todayProf += p.profit });

  $('statCards').innerHTML =
    statCard('本日淨利', 'NT$' + fmtN(todayProf), todayCompleted.length + ' 筆訂單', todayProf >= 0 ? 'green' : 'red') +
    statCard('訂單數', completed.length, '', '') +
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
  var ch8591 = { rev: 0, prof: 0, cnt: 0 }, chShopee = { rev: 0, prof: 0, cnt: 0 }, chPersonal = { rev: 0, prof: 0, cnt: 0 };
  completed.forEach(function(o) {
    var p = orderProfit(o);
    var t = o.channel === '蝦皮' ? chShopee : o.channel === '個人' ? chPersonal : ch8591;
    t.rev += p.rev; t.prof += p.profit; t.cnt++;
  });
  var chRows = [
    { badge: 'pending', name: '8591', d: ch8591 },
    { badge: '', name: '蝦皮', d: chShopee, style: 'background:var(--orange);color:#fff' },
    { badge: 'ok', name: '個人', d: chPersonal }
  ];
  var chHtml = '<table><tr><th>管道</th><th class="text-right">訂單數</th><th class="text-right">營收</th><th class="text-right">利潤</th><th class="text-right">利潤率</th></tr>';
  chRows.forEach(function(r) {
    chHtml += '<tr><td><span class="badge ' + r.badge + '"' + (r.style ? ' style="' + r.style + '"' : '') + '>' + r.name + '</span></td><td class="text-right">' + r.d.cnt + '</td><td class="text-right">NT$' + fmtN(r.d.rev) + '</td><td class="text-right ' + (r.d.prof >= 0 ? 'text-green' : 'text-red') + '">NT$' + fmtN(r.d.prof) + '</td><td class="text-right">' + fmtP(r.d.rev > 0 ? r.d.prof / r.d.rev : 0) + '</td></tr>';
  });
  $('channelStats').innerHTML = chHtml + '</table>';

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

  // Dashboard expiry section
  renderDashboardExpiry();
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
  if (ch === '個人') return '<span class="badge ok">個人</span>';
  if (ch === '蝦皮') return '<span class="badge" style="background:var(--orange);color:#fff">蝦皮</span>';
  return '<span class="badge pending">8591</span>';
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
    var items = groups[plat].slice().sort(function(a, b) {
      if (a.version !== b.version) {
        var na = parseInt(a.version) || 0, nb = parseInt(b.version) || 0;
        if (na && nb) return na - nb;
        return a.version < b.version ? -1 : 1;
      }
      return (parseInt(a.duration) || 0) - (parseInt(b.duration) || 0);
    });
    var isOpen = expandedPlatforms[plat] !== false;
    var activeCount = items.filter(function(p) { return p.status === '啟用' }).length;
    html += '<div class="prod-group card">' +
      '<div class="prod-group-head" onclick="togglePlatform(\'' + esc(plat) + '\')">' +
        '<span class="prod-arrow">' + (isOpen ? '▼' : '▶') + '</span>' +
        '<span class="prod-plat-name">' + esc(plat) + '</span>' +
        '<span class="prod-count">' + activeCount + '/' + items.length + ' 啟用</span>' +
      '</div>';
    if (isOpen) {
      html += '<table class="prod-table"><thead><tr><th>版本</th><th>期間</th><th class="text-right">成本</th><th class="text-right">8591售價</th><th class="text-right">8591淨利</th><th class="text-right">蝦皮售價</th><th class="text-right">蝦皮淨利</th><th>狀態</th><th>資料</th><th>操作</th></tr></thead><tbody>';
      items.forEach(function(p) {
        var fee8591 = p.price * PLATFORM_FEE;
        var prof8591 = p.price - p.cost - fee8591;
        var sp = p.shopee_price || 0;
        var feeShopee = sp * SHOPEE_FEE;
        var profShopee = sp > 0 ? sp - p.cost - feeShopee : 0;
        html += '<tr><td>' + esc(p.version) + '</td><td>' + esc(p.duration) + '</td>' +
          '<td class="text-right">' + fmtN(p.cost) + '</td>' +
          '<td class="text-right">' + fmtN(p.price) + '</td>' +
          '<td class="text-right ' + (prof8591 >= 0 ? 'text-green' : 'text-red') + '">' + fmtN(prof8591) + '</td>' +
          '<td class="text-right">' + (sp > 0 ? fmtN(sp) : '-') + '</td>' +
          '<td class="text-right ' + (profShopee >= 0 ? 'text-green' : 'text-red') + '">' + (sp > 0 ? fmtN(profShopee) : '-') + '</td>' +
          '<td>' + (p.status === '啟用' ? '<span class="badge active">啟用</span>' : '<span class="badge inactive">停用</span>') + '</td>' +
          '<td class="text-sm">' + esc(p.required_info || '') + '</td>' +
          '<td><div class="act-group">' +
            '<button class="act-btn edit" data-action="editProduct" data-id="' + p.id + '">編輯</button>' +
            '<button class="act-btn del" data-action="deleteProduct" data-id="' + p.id + '">刪除</button>' +
          '</div></td></tr>';
      });
      html += '</tbody></table>';
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
  $('pm_shopeePrice').value = item ? (item.shopee_price || '') : '';
  $('pm_status').value = item ? item.status : '啟用';
  $('pm_reqInfo').value = item ? (item.required_info || '') : '';
  $('pm_notes').value = item ? (item.notes || '') : '';
  updateProdPreview();
  $('pm_cost').oninput = $('pm_price').oninput = $('pm_shopeePrice').oninput = updateProdPreview;
  openModal('productModal');
}
function updateProdPreview() {
  var cost = Number($('pm_cost').value) || 0;
  var price = Number($('pm_price').value) || 0;
  var sp = Number($('pm_shopeePrice').value) || 0;
  var fee8591 = price * PLATFORM_FEE;
  var prof8591 = price - cost - fee8591;
  var feeShopee = sp * SHOPEE_FEE;
  var profShopee = sp - cost - feeShopee;
  var h = '<div class="row"><span class="lbl">8591 淨利</span><span class="val ' + (prof8591 >= 0 ? 'text-green' : 'text-red') + '">NT$' + fmtN(prof8591) + '（手續費 ' + (PLATFORM_FEE * 100) + '% = NT$' + fmtN(fee8591) + '）</span></div>';
  if (sp > 0) h += '<div class="row"><span class="lbl">蝦皮 淨利</span><span class="val ' + (profShopee >= 0 ? 'text-green' : 'text-red') + '">NT$' + fmtN(profShopee) + '（手續費 ' + (SHOPEE_FEE * 100) + '% = NT$' + fmtN(feeShopee) + '）</span></div>';
  h += '<div class="row"><span class="lbl">個人 淨利</span><span class="val text-green highlight">NT$' + fmtN(price - cost) + '</span></div>';
  $('prodPreview').innerHTML = h;
}
function editProduct(id) {
  var item = products.filter(function(p) { return String(p.id) === String(id) })[0];
  if (item) openProductModal(item);
  else toast('找不到此商品', 'err');
}
function saveProduct() {
  var obj = {
    platform: $('pm_platform').value.trim(),
    version: $('pm_version').value.trim(),
    duration: $('pm_duration').value.trim(),
    cost: Number($('pm_cost').value) || 0,
    price: Number($('pm_price').value) || 0,
    shopee_price: Number($('pm_shopeePrice').value) || 0,
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
      var idx = products.findIndex(function(p) { return String(p.id) === String(id) });
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
      products = products.filter(function(p) { return String(p.id) !== String(id) });
      demoSave(); renderAll(); toast('已刪除', 'ok');
    } else {
      sb.from('products').delete().eq('id', id).then(function(res) {
        if (res.error) return toast(res.error.message, 'err');
        loadAll(); toast('已刪除', 'ok');
      });
    }
  });
}

/* ──── Custom Dropdown Component ──── */
var cdropInstances = {};
function cdropInit(id, opts) {
  opts = opts || {};
  var state = { items: opts.items || [], value: opts.value || '', text: '', open: false };
  var sel = state.items.filter(function(it) { return String(it.value) === String(state.value) })[0];
  state.text = sel ? sel.label : '';
  cdropInstances[id] = { state: state, opts: opts };
  // Build initial DOM: input is static, panel is separate
  var el = $(id); if (!el) return;
  el.innerHTML = '<div class="cdrop">' +
    '<input class="cdrop-input" type="text" placeholder="' + esc(opts.placeholder || '選擇...') + '" data-cdrop-input="' + id + '" autocomplete="off" value="' + esc(state.text) + '">' +
    '<span class="cdrop-arrow" data-cdrop-toggle="' + id + '">▼</span>' +
    '<div class="cdrop-panel" data-cdrop-panel="' + id + '"></div></div>';
}
function cdropRenderPanel(id) {
  var inst = cdropInstances[id]; if (!inst) return;
  var s = inst.state, o = inst.opts;
  var panel = document.querySelector('[data-cdrop-panel="' + id + '"]');
  if (!panel) return;
  var selItem = s.value ? s.items.filter(function(it) { return String(it.value) === String(s.value) })[0] : null;
  var isSelectedLabel = selItem && s.text === selItem.label;
  var q = isSelectedLabel ? '' : s.text.toLowerCase();
  var filtered = q ? s.items.filter(function(it) {
    return (it.label + (it.sub || '')).toLowerCase().indexOf(q) >= 0;
  }) : s.items;
  var h = '';
  if (filtered.length === 0 && !o.allowCreate) {
    h = '<div class="cdrop-empty">找不到符合的選項</div>';
  }
  filtered.forEach(function(it) {
    var sel = String(it.value) === String(s.value) ? ' selected' : '';
    h += '<div class="cdrop-item' + sel + '" data-cdrop-pick="' + id + '" data-value="' + esc(String(it.value)) + '">';
    if (it.icon !== undefined) h += '<div class="cdrop-icon' + (it.iconCls ? ' ' + it.iconCls : '') + '">' + esc(it.icon) + '</div>';
    h += '<div class="cdrop-label"><div class="main">' + esc(it.label) + '</div>';
    if (it.sub) h += '<div class="sub">' + esc(it.sub) + '</div>';
    h += '</div>';
    if (it.tag) h += '<span class="cdrop-tag' + (it.tagCls ? ' ' + it.tagCls : '') + '">' + esc(it.tag) + '</span>';
    h += '</div>';
  });
  if (o.allowCreate && q && !s.items.some(function(it) { return it.label.toLowerCase() === q; })) {
    h += '<div class="cdrop-create" data-cdrop-create="' + id + '" data-name="' + esc(s.text) + '">＋ 新增「' + esc(s.text) + '」</div>';
  }
  panel.innerHTML = h;
}
function cdropOpen(id) {
  var inst = cdropInstances[id]; if (!inst) return;
  inst.state.open = true;
  var wrap = document.querySelector('[data-cdrop-input="' + id + '"]');
  if (wrap) wrap.closest('.cdrop').classList.add('open');
  cdropRenderPanel(id);
}
function cdropClose(id) {
  var inst = cdropInstances[id]; if (!inst) return;
  inst.state.open = false;
  var wrap = document.querySelector('[data-cdrop-input="' + id + '"]');
  if (wrap) wrap.closest('.cdrop').classList.remove('open');
}
function cdropSetValue(id, val) {
  var inst = cdropInstances[id]; if (!inst) return;
  inst.state.value = val;
  var sel = inst.state.items.filter(function(it) { return String(it.value) === String(val) })[0];
  inst.state.text = sel ? sel.label : '';
  var inp = document.querySelector('[data-cdrop-input="' + id + '"]');
  if (inp) inp.value = inst.state.text;
}

// Prevent panel clicks from stealing focus (fixes slow-device race condition)
document.addEventListener('mousedown', function(e) {
  if (e.target.closest('.cdrop-panel') || e.target.closest('.cdrop-arrow')) e.preventDefault();
});
// Typing — only update panel, never touch input
document.addEventListener('input', function(e) {
  var inp = e.target.closest('[data-cdrop-input]');
  if (!inp) return;
  var id = inp.getAttribute('data-cdrop-input');
  var inst = cdropInstances[id]; if (!inst) return;
  inst.state.text = inp.value;
  inst.state.value = '';
  if (!inst.state.open) cdropOpen(id);
  else cdropRenderPanel(id);
});
// Focus — open panel and select text so user can type to filter
document.addEventListener('focusin', function(e) {
  var inp = e.target.closest('[data-cdrop-input]');
  if (!inp) return;
  var id = inp.getAttribute('data-cdrop-input');
  var inst = cdropInstances[id]; if (!inst || inst.state.open) return;
  cdropOpen(id);
  if (inp.value) inp.select();
});
// Blur — close panel when focus leaves cdrop
document.addEventListener('focusout', function(e) {
  var inp = e.target.closest('[data-cdrop-input]');
  if (!inp) return;
  var id = inp.getAttribute('data-cdrop-input');
  var inst = cdropInstances[id]; if (!inst || !inst.state.open) return;
  setTimeout(function() {
    var active = document.activeElement;
    var panel = document.querySelector('[data-cdrop-panel="' + id + '"]');
    if (active && (active === inp || (panel && panel.contains(active)))) return;
    cdropClose(id);
  }, 80);
});
// Click delegation
document.addEventListener('click', function(e) {
  var tog = e.target.closest('[data-cdrop-toggle]');
  if (tog) {
    var id = tog.getAttribute('data-cdrop-toggle');
    var inst = cdropInstances[id]; if (!inst) return;
    if (inst.state.open) cdropClose(id);
    else { cdropOpen(id); var inp = document.querySelector('[data-cdrop-input="' + id + '"]'); if (inp) inp.focus(); }
    e.stopPropagation();
    return;
  }
  var pick = e.target.closest('[data-cdrop-pick]');
  if (pick) {
    var id = pick.getAttribute('data-cdrop-pick');
    var val = pick.getAttribute('data-value');
    var inst = cdropInstances[id]; if (!inst) return;
    var selItem = inst.state.items.filter(function(it) { return String(it.value) === val })[0];
    inst.state.value = val;
    inst.state.text = selItem ? selItem.label : '';
    var inp = document.querySelector('[data-cdrop-input="' + id + '"]');
    if (inp) inp.value = inst.state.text;
    cdropClose(id);
    if (inst.opts.onSelect) inst.opts.onSelect(val);
    return;
  }
  var cr = e.target.closest('[data-cdrop-create]');
  if (cr) {
    var id = cr.getAttribute('data-cdrop-create');
    var name = cr.getAttribute('data-name');
    var inst = cdropInstances[id]; if (!inst) return;
    cdropClose(id);
    if (inst.opts.onCreate) inst.opts.onCreate(name);
    return;
  }
  if (e.target.closest('.cdrop-panel') || e.target.closest('[data-cdrop-input]')) return;
  Object.keys(cdropInstances).forEach(function(cid) {
    if (cdropInstances[cid].state.open) cdropClose(cid);
  });
});

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
  list.sort(function(a, b) { return (b.order_no || '').localeCompare(a.order_no || '') });
  if (list.length === 0) {
    $('orderList').innerHTML = '<div class="empty"><div class="icon">📋</div><p>尚無訂單</p></div>';
    return;
  }
  var h = '<table style="min-width:1100px"><tr><th>編號</th><th>日期</th><th>管道</th><th>出單人</th><th>客戶</th><th>商品</th><th>數量</th><th class="text-right">售價</th><th class="text-right">成本</th><th class="text-right">手續費</th><th class="text-right">利潤</th><th>狀態</th><th>到期</th><th class="sticky-col">操作</th></tr>';
  list.forEach(function(o) {
    var p = orderProfit(o);
    var expiry = o.expiry_date || '';
    var expiryWarn = '';
    if (expiry && o.status === '已完成') {
      var diff = (new Date(expiry) - new Date()) / 86400000;
      if (diff < 0) expiryWarn = ' text-red';
      else if (diff < 7) expiryWarn = ' text-yellow';
    }
    h += '<tr><td style="font-size:.8rem;white-space:nowrap">' + esc(o.order_no || '') + '</td>' +
      '<td>' + (o.order_date || '') + '</td>' +
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
      '<td class="sticky-col"><div class="act-group">' +
        '<button class="act-btn edit" data-action="editOrder" data-id="' + o.id + '">編輯</button>' +
        '<button class="act-btn del" data-action="deleteOrder" data-id="' + o.id + '">刪除</button>' +
      '</div></td></tr>';
  });
  $('orderList').innerHTML = h + '</table>';
}
function getAgentName(id) {
  if (!id) return '';
  var a = agents.filter(function(x) { return String(x.id) === String(id) })[0];
  return a ? a.name : '';
}
function getCustomerName(id) {
  if (!id) return '';
  var c = customers.filter(function(x) { return String(x.id) === String(id) })[0];
  return c ? c.name : '';
}
function onChannelChange(skipPrice) {
  var ch = $('om_channel').value;
  var isPersonal = ch === '個人';
  $('om_manualGroup').style.display = isPersonal ? '' : 'none';
  $('om_productGroup').style.display = '';
  if (isPersonal) renderPersonalSelect();
  if (!skipPrice) {
    var pid = $('om_product').value;
    var p = pid ? products.filter(function(x) { return String(x.id) === String(pid) })[0] : null;
    if (p) {
      var usePrice = ((ch === '蝦皮' || ch === '個人') && p.shopee_price) ? p.shopee_price : p.price;
      $('om_unitPrice').value = usePrice;
    }
  }
  calcOrderPreview();
}
function renderPersonalSelect(selected) {
  var presets = getPersonalPresets();
  var sel = selected || $('om_manualName').value || '';
  var prItems = presets.map(function(p) {
    return { value: p, label: p, icon: p.charAt(0), iconCls: 'accent' };
  });
  cdropInit('om_personalDrop', {
    items: prItems, placeholder: '搜尋或選擇商品...', value: sel,
    allowCreate: true,
    onCreate: function(name) {
      addPersonalPreset(name);
      $('om_manualName').value = name;
      $('om_product').value = '';
      var newItems = cdropInstances['om_personalDrop'].state.items.slice();
      newItems.push({ value: name, label: name, icon: name.charAt(0), iconCls: 'accent' });
      cdropInstances['om_personalDrop'].state.items = newItems;
      cdropInstances['om_personalDrop'].state.value = name;
      cdropInstances['om_personalDrop'].state.open = false;
      cdropRenderPanel('om_personalDrop');
      calcOrderPreview();
    },
    onSelect: function(v) {
      $('om_manualName').value = v;
      $('om_product').value = '';
      calcOrderPreview();
    }
  });
}
function onPersonalSelect() {
  calcOrderPreview();
  calcOrderPreview();
}
function openOrderModal(item) {
  renewExpiryBase = '';
  $('orderModalTitle').textContent = item ? '編輯訂單' : '新增訂單';
  $('om_id').value = item ? item.id : '';
  dpInit('om_date', { value: item ? item.order_date : today() });
  $('om_channel').value = item ? (item.channel || '8591') : '8591';

  // Agent custom dropdown
  var selfAgent = agents.filter(function(a) { return a.name === '自己' })[0];
  var defaultAgentId = selfAgent ? String(selfAgent.id) : '';
  var agItems = [];
  agents.forEach(function(a) {
    var agOrds = orders.filter(function(o) { return String(o.agent_id) === String(a.id) }).length;
    agItems.push({ value: String(a.id), label: a.name, icon: a.name.charAt(0), iconCls: 'accent', sub: a.notes || '', tag: agOrds > 0 ? agOrds + '筆' : '', tagCls: 'green' });
  });
  var editAgentVal = item ? String(item.agent_id || '') : defaultAgentId;
  cdropInit('om_agentDrop', {
    items: agItems, placeholder: '選擇出單人', value: editAgentVal,
    onSelect: function(v) { $('om_agent').value = v; calcOrderPreview(); }
  });
  $('om_agent').value = editAgentVal;

  // Customer custom dropdown
  var cuItems = [];
  customers.slice().sort(function(a, b) {
    var aO = orders.filter(function(o) { return String(o.customer_id) === String(a.id) }).length;
    var bO = orders.filter(function(o) { return String(o.customer_id) === String(b.id) }).length;
    return bO - aO;
  }).forEach(function(c) {
    var cnt = orders.filter(function(o) { return String(o.customer_id) === String(c.id) }).length;
    cuItems.push({ value: String(c.id), label: c.name, icon: c.name.charAt(0), iconCls: 'accent', sub: c.contact || c.platform || '', tag: cnt > 0 ? cnt + '筆' : '' });
  });
  cdropInit('om_customerDrop', {
    items: cuItems, placeholder: '選擇或搜尋客戶', value: item ? String(item.customer_id || '') : '',
    allowCreate: true,
    onCreate: function(name) {
      // Auto-create customer inline
      resolveCustomer(name, function(newId) {
        if (newId) {
          $('om_customer').value = newId;
          // Re-init dropdown with updated customers
          var newItems = cdropInstances['om_customerDrop'].state.items.slice();
          newItems.unshift({ value: String(newId), label: name, icon: name.charAt(0), iconCls: 'accent', sub: '自動建立', tag: '' });
          cdropInstances['om_customerDrop'].state.items = newItems;
          cdropInstances['om_customerDrop'].state.value = String(newId);
          cdropInstances['om_customerDrop'].state.open = false;
          cdropRenderPanel('om_customerDrop');
        }
      });
    },
    onSelect: function(v) { $('om_customer').value = v; }
  });
  $('om_customer').value = item ? (item.customer_id || '') : '';

  // Product custom dropdown
  var prItems = [];
  products.filter(function(p) { return p.status === '啟用' }).slice().sort(function(a, b) {
    if (a.platform !== b.platform) return a.platform < b.platform ? -1 : 1;
    if (a.version !== b.version) {
      var na = parseInt(a.version) || 0, nb = parseInt(b.version) || 0;
      if (na && nb) return na - nb;
      return a.version < b.version ? -1 : 1;
    }
    return (parseInt(a.duration) || 0) - (parseInt(b.duration) || 0);
  }).forEach(function(p) {
    var showPrice = p.price;
    prItems.push({ value: String(p.id), label: p.version + ' ' + p.duration, icon: (p.platform || '').charAt(0), iconCls: 'accent', sub: p.platform, tag: 'NT$' + fmtN(showPrice) });
  });
  cdropInit('om_productDrop', {
    items: prItems, placeholder: '搜尋或選擇商品...', value: item ? String(item.product_id || '') : '',
    onSelect: function(v) { $('om_product').value = v; onProductSelect(); }
  });
  $('om_product').value = item ? (item.product_id || '') : '';

  $('om_qty').value = item ? item.qty : 1;
  $('om_unitPrice').value = item ? item.unit_price : '';
  $('om_unitCost').value = item ? item.unit_cost : '';
  $('om_status').value = item ? item.status : '已完成';
  dpInit('om_expiry', { value: item ? (item.expiry_date || '') : '', allowEmpty: true });
  $('om_accountInfo').value = item ? (item.account_info || '') : '';
  $('om_notes').value = item ? (item.notes || '') : '';
  $('om_manualName').value = item ? (item.platform || '') : '';
  $('om_svcAcct').value = item ? (item.service_account_id || '') : '';
  $('om_seat').value = item ? (item.seat_number || '') : '';
  $('om_seatGroup').style.display = 'none';

  // Set personal select when editing a personal-channel order
  if (item && (item.channel || '8591') === '個人' && !item.product_id) {
    renderPersonalSelect(item.platform || '');
  }

  onChannelChange(!!item);
  // Show seat selection if editing order with service account, or product has accounts
  if (item && item.product_id) {
    var ep = products.filter(function(x) { return String(x.id) === String(item.product_id) })[0];
    if (ep) {
      var eAccts = serviceAccounts.filter(function(a) { return a.platform === ep.platform && a.status === '啟用' });
      if (eAccts.length > 0) {
        $('om_seatGroup').style.display = '';
        initSvcAcctDrop(eAccts);
      }
    }
  }
  if (item) calcOrderPreview();
  else $('orderPreview').innerHTML = '';

  openModal('orderModal');
}
function onProductSelect() {
  var pid = $('om_product').value;
  var p = products.filter(function(x) { return String(x.id) === String(pid) })[0];
  if (p) {
    var ch = $('om_channel').value;
    var usePrice = ((ch === '蝦皮' || ch === '個人') && p.shopee_price) ? p.shopee_price : p.price;
    $('om_unitPrice').value = usePrice;
    $('om_unitCost').value = p.cost;
    var dur = p.duration || '';
    var months = parseInt(dur) || 0;
    if (months > 0) {
      var base = renewExpiryBase || dpGetVal('om_date') || today();
      var d = new Date(base);
      d.setMonth(d.getMonth() + months);
      dpSetVal('om_expiry', d.toISOString().slice(0, 10));
    }
    calcOrderPreview();
    // Seat management: show account/seat if platform has service accounts
    var accts = serviceAccounts.filter(function(a) { return a.platform === p.platform && a.status === '啟用' });
    if (accts.length > 0) {
      $('om_seatGroup').style.display = '';
      initSvcAcctDrop(accts);
    } else {
      $('om_seatGroup').style.display = 'none';
      $('om_svcAcct').value = '';
      $('om_seat').value = '';
    }
  }
}

function initSvcAcctDrop(accts) {
  var items = accts.map(function(a) {
    var seats = getSeatStatus(a.id);
    var empty = seats.filter(function(s) { return s.status === 'empty' || s.status === 'expired' }).length;
    return { value: String(a.id), label: a.email, icon: '📧', sub: empty + '/' + a.max_seats + ' 可用', tag: '', tagCls: empty > 0 ? 'green' : 'red' };
  });
  cdropInit('om_svcAcctDrop', {
    items: items, placeholder: '選擇帳號', value: $('om_svcAcct').value || '',
    onSelect: function(v) { $('om_svcAcct').value = v; initSeatDrop(v); }
  });
  // Auto-select if only one account
  if (items.length === 1 && !$('om_svcAcct').value) {
    $('om_svcAcct').value = items[0].value;
    cdropInstances['om_svcAcctDrop'].state.value = items[0].value;
    cdropRenderPanel('om_svcAcctDrop');
    initSeatDrop(items[0].value);
  } else if ($('om_svcAcct').value) {
    initSeatDrop($('om_svcAcct').value);
  }
}

function initSeatDrop(accountId) {
  var seats = getSeatStatus(accountId);
  var editingId = $('om_id').value;
  var items = seats.map(function(s) {
    var lbl = '使用者' + s.seat;
    if (s.status === 'occupied') {
      var isCurrentOrder = editingId && s.order && String(s.order.id) === String(editingId);
      var canRenew = !s.renewal && !isCurrentOrder;
      return { value: String(s.seat), label: lbl, sub: s.customer + '（到期 ' + s.expiry + '）', tag: canRenew ? '可續約' : s.renewal ? '已排續約' : '已佔用', tagCls: 'green', disabled: !isCurrentOrder && !canRenew };
    } else if (s.status === 'expired') {
      return { value: String(s.seat), label: lbl, sub: s.customer + '（已過期）', tag: '待處理', tagCls: 'yellow' };
    }
    return { value: String(s.seat), label: lbl, sub: '', tag: '空位', tagCls: '' };
  });
  cdropInit('om_seatDrop', {
    items: items.filter(function(it) { return !it.disabled }),
    placeholder: '選擇座位', value: $('om_seat').value || '',
    onSelect: function(v) { $('om_seat').value = v; }
  });
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
  var ag = agents.filter(function(x) { return String(x.id) === String(agId) })[0];
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
  var item = orders.filter(function(o) { return String(o.id) === String(id) })[0];
  if (item) {
    try { openOrderModal(item); }
    catch(e) { toast('開啟編輯失敗：' + e.message, 'err'); console.error('editOrder error:', e) }
  }
  else toast('找不到此訂單 (id=' + id + ', 共' + orders.length + '筆)', 'err');
}
function resolveCustomer(name, callback) {
  // Find existing customer by name, or auto-create a new one
  if (!name) return callback(null);
  var existing = customers.filter(function(c) { return c.name === name })[0];
  if (existing) return callback(existing.id);

  // Auto-create new customer
  if (isDemo) {
    var nc = { id: 'd' + Date.now(), name: name, contact: '', platform: '', notes: '自動建立' };
    customers.push(nc);
    demoSave();
    toast('已自動新增客戶「' + name + '」', 'ok');
    return callback(nc.id);
  }

  sb.from('customers').insert({ user_id: userId, name: name, contact: '', platform: '', notes: '自動建立' })
    .select().then(function(res) {
      if (res.error) { toast('建立客戶失敗：' + res.error.message, 'err'); return callback(null); }
      var nc = res.data[0];
      customers.push(nc);
      toast('已自動新增客戶「' + name + '」', 'ok');
      callback(nc.id);
    });
}

function saveOrder() {
  var pid = $('om_product').value;
  var p = products.filter(function(x) { return String(x.id) === String(pid) })[0];
  var agId = $('om_agent').value || null;
  var ag = agents.filter(function(x) { return String(x.id) === String(agId) })[0];
  var ch = $('om_channel').value;
  var personalInst = cdropInstances['om_personalDrop'];
  var manualName = $('om_manualName').value.trim() || (personalInst ? (personalInst.state.value || personalInst.state.text || '').trim() : '');
  var custId = $('om_customer').value || null;
  // If customer dropdown has free text but no ID, resolve by name
  var custInst = cdropInstances['om_customerDrop'];
  var custFreeText = custInst ? custInst.state.text.trim() : '';
  if (!custId && custFreeText) {
    // Try match by name first
    var match = customers.filter(function(c) { return c.name === custFreeText })[0];
    if (match) { custId = match.id; }
  }

  var obj = {
    order_date: dpGetVal('om_date'),
    order_no: genOrderNo(),
    agent_id: agId,
    customer_id: custId,
    channel: ch,
    status: $('om_status').value,
    product_id: pid || null,
    platform: p ? p.platform : manualName,
    version: p ? p.version : '',
    duration: p ? p.duration : '',
    qty: Number($('om_qty').value) || 1,
    unit_price: Number($('om_unitPrice').value) || 0,
    unit_cost: Number($('om_unitCost').value) || 0,
    fee_type: '百分比',
    fee_value: ch === '8591' ? PLATFORM_FEE : ch === '蝦皮' ? SHOPEE_FEE : 0,
    commission_type: ag ? ag.commission_type : '百分比',
    commission_value: ag ? ag.commission_value : 0,
    expiry_date: dpGetVal('om_expiry') || null,
    account_info: $('om_accountInfo').value.trim(),
    notes: $('om_notes').value.trim(),
    service_account_id: $('om_svcAcct').value || null,
    seat_number: $('om_seat').value ? Number($('om_seat').value) : null
  };
  if (!obj.platform) return toast('請選擇商品或輸入商品名稱', 'err');

  var id = $('om_id').value;
  if (id) obj.order_no = orders.filter(function(o) { return String(o.id) === String(id) })[0].order_no;

  // If still no custId but has free text, auto-create customer then save
  if (!custId && custFreeText) {
    resolveCustomer(custFreeText, function(newId) {
      obj.customer_id = newId;
      _doSaveOrder(obj, id);
    });
  } else {
    _doSaveOrder(obj, id);
  }
}

function _doSaveOrder(obj, id) {
  if (isDemo) {
    if (id) {
      var idx = orders.findIndex(function(o) { return String(o.id) === String(id) });
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
      if (res.error) {
        // If account_info column doesn't exist yet, retry without it
        if (res.error.message && res.error.message.indexOf('account_info') >= 0) {
          var obj2 = Object.assign({}, obj); delete obj2.account_info;
          var req2 = id ? sb.from('orders').update(obj2).eq('id', id) : sb.from('orders').insert(obj2);
          req2.then(function(r2) {
            if (r2.error) return toast(r2.error.message, 'err');
            closeModal(); loadAll(); toast('訂單已儲存（請新增 account_info 欄位）', 'ok');
          });
          return;
        }
        return toast(res.error.message, 'err');
      }
      closeModal(); loadAll(); toast('訂單已儲存', 'ok');
    });
  }
}
function deleteOrder(id) {
  confirmAction('確定要刪除此訂單？', function() {
    if (isDemo) {
      orders = orders.filter(function(o) { return String(o.id) !== String(id) });
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
  var h = '';
  agents.forEach(function(a) {
    var agOrders = orders.filter(function(o) { return String(o.agent_id) === String(a.id) && o.status === '已完成' });
    var totalProfit = 0, totalComm = 0;
    agOrders.forEach(function(o) {
      var p = orderProfit(o);
      totalProfit += p.profit;
      totalComm += p.comm;
    });
    agOrders.sort(function(a, b) { return (b.order_date || '').localeCompare(a.order_date || '') });
    var commLabel = a.commission_type === '百分比' ? fmtP(a.commission_value) : 'NT$' + fmtN(a.commission_value);
    h += '<div class="card agent-card" style="margin-bottom:8px;padding:14px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer" data-action="toggleAgentDetail" data-id="' + a.id + '">' +
        '<div style="display:flex;align-items:center;gap:10px">' +
          '<span class="prod-arrow" data-agent-arrow="' + a.id + '">▶</span>' +
          '<strong>' + esc(a.name) + '</strong>' +
          '<span class="badge blue">' + commLabel + '</span>' +
          '<span class="text-sm">' + agOrders.length + ' 單</span>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:12px">' +
          '<span class="text-sm">利潤 <b class="' + (totalProfit >= 0 ? 'text-green' : 'text-red') + '">NT$' + fmtN(totalProfit) + '</b></span>' +
          '<span class="text-sm">抽成 <b class="text-red">NT$' + fmtN(totalComm) + '</b></span>' +
          '<div class="act-group">' +
            '<button class="act-btn edit" data-action="editAgent" data-id="' + a.id + '">編輯</button>' +
            '<button class="act-btn del" data-action="deleteAgent" data-id="' + a.id + '">刪除</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="agent-detail" data-agent-detail="' + a.id + '" style="display:none;margin-top:10px">';
    if (agOrders.length === 0) {
      h += '<div class="text-sm" style="color:var(--fg3);padding:8px 0">尚無已完成訂單</div>';
    } else {
      h += '<table><tr><th>日期</th><th class="text-right">利潤</th><th class="text-right">抽成金額</th></tr>';
      agOrders.forEach(function(o) {
        var p = orderProfit(o);
        h += '<tr><td>' + (o.order_date || '') + '</td>' +
          '<td class="text-right ' + (p.profit >= 0 ? 'text-green' : 'text-red') + '">NT$' + fmtN(p.profit) + '</td>' +
          '<td class="text-right text-red">NT$' + fmtN(p.comm) + '</td></tr>';
      });
      h += '<tr style="border-top:2px solid var(--bg4);font-weight:700"><td>合計</td>' +
        '<td class="text-right ' + (totalProfit >= 0 ? 'text-green' : 'text-red') + '">NT$' + fmtN(totalProfit) + '</td>' +
        '<td class="text-right text-red">NT$' + fmtN(totalComm) + '</td></tr>';
      h += '</table>';
    }
    h += '</div></div>';
  });
  $('agentList').innerHTML = h;
}
function toggleAgentDetail(id) {
  var detail = document.querySelector('[data-agent-detail="' + id + '"]');
  var arrow = document.querySelector('[data-agent-arrow="' + id + '"]');
  if (!detail) return;
  var open = detail.style.display !== 'none';
  detail.style.display = open ? 'none' : '';
  if (arrow) arrow.textContent = open ? '▶' : '▼';
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
  var item = agents.filter(function(a) { return String(a.id) === String(id) })[0];
  if (item) openAgentModal(item);
  else toast('找不到此出單人', 'err');
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
      var idx = agents.findIndex(function(a) { return String(a.id) === String(id) });
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
      agents = agents.filter(function(a) { return String(a.id) !== String(id) });
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
  // Calculate order stats for each customer
  list.forEach(function(c) {
    var custOrders = orders.filter(function(o) { return String(o.customer_id) === String(c.id) });
    c._orderCount = custOrders.length;
    c._totalSpend = 0;
    custOrders.forEach(function(o) { c._totalSpend += (o.qty || 1) * (o.unit_price || 0) });
  });
  // Sort by order count desc, then total spend desc
  list.sort(function(a, b) { return b._orderCount - a._orderCount || b._totalSpend - a._totalSpend });
  if (list.length === 0) {
    $('customerList').innerHTML = '<div class="empty"><div class="icon">🧑‍💼</div><p>尚無客戶，點擊上方新增</p></div>';
    return;
  }
  var h = '<table><tr><th>名稱</th><th>聯絡方式</th><th>來源平台</th><th>訂單數</th><th class="text-right">消費總額</th><th>備註</th><th>操作</th></tr>';
  list.forEach(function(c) {
    var custOrders = c._orderCount;
    var total = c._totalSpend;
    h += '<tr><td>' + esc(c.name) + '</td><td>' + esc(c.contact || '') + '</td><td>' + esc(c.platform || '') + '</td>' +
      '<td class="text-center">' + custOrders + '</td>' +
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
  var item = customers.filter(function(c) { return String(c.id) === String(id) })[0];
  if (item) openCustomerModal(item);
  else toast('找不到此客戶', 'err');
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
      var idx = customers.findIndex(function(c) { return String(c.id) === String(id) });
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
      customers = customers.filter(function(c) { return String(c.id) !== String(id) });
      demoSave(); renderAll(); toast('已刪除', 'ok');
    } else {
      sb.from('customers').delete().eq('id', id).then(function(res) {
        if (res.error) return toast(res.error.message, 'err');
        loadAll(); toast('已刪除', 'ok');
      });
    }
  });
}

/* ──── Ads (Config-based) ──── */
function adConfigStatus(c) {
  if (!c.active) return { label: '已暫停', cls: 'badge grey' };
  var t = today();
  if (c.start_date > t) return { label: '未開始', cls: 'badge blue' };
  if (c.end_date && c.end_date < t) return { label: '已結束', cls: 'badge grey' };
  return { label: '投放中', cls: 'badge green' };
}
function adConfigDaysInMonth(c, ym) {
  var t = today();
  var mStart = ym + '-01';
  var parts = ym.split('-'); var y = Number(parts[0]); var m = Number(parts[1]);
  var mEndDate = new Date(y, m, 0);
  var mEnd = ym + '-' + (mEndDate.getDate() < 10 ? '0' : '') + mEndDate.getDate();
  if (mEnd > t) mEnd = t;
  if (mStart > t) return 0;
  var s = c.start_date || '';
  var e = c.end_date || '9999-12-31';
  if (e > t) e = t;
  if (e < mStart || s > mEnd) return 0;
  var effStart = s > mStart ? s : mStart;
  var effEnd = e < mEnd ? e : mEnd;
  var d1 = new Date(effStart); var d2 = new Date(effEnd);
  return Math.max(0, Math.round((d2 - d1) / 86400000) + 1);
}
function renderAds() {
  var ym = mpGetYM('mpExp');
  var isAll = mpIsAll('mpExp');
  var isYear = mpIsYear('mpExp');
  var yy = mpGetYear('mpExp');

  // Calculate costs from configs
  var platMap = {};
  var total = 0;
  adConfigs.forEach(function(c) {
    if (!c.active) return;
    var cost = 0;
    if (isAll) {
      var t = today();
      var s = c.start_date || t;
      var e = c.end_date || t;
      if (e > t) e = t;
      if (s > t) return;
      var d1 = new Date(s); var d2 = new Date(e);
      cost = Math.max(0, Math.round((d2 - d1) / 86400000) + 1) * (c.daily_cost || 0);
    } else if (isYear) {
      for (var mi = 1; mi <= 12; mi++) {
        var mm = mi < 10 ? '0' + mi : '' + mi;
        cost += adConfigDaysInMonth(c, yy + '-' + mm) * (c.daily_cost || 0);
      }
    } else {
      cost = adConfigDaysInMonth(c, ym) * (c.daily_cost || 0);
    }
    if (cost > 0) {
      var p = c.platform || '其他';
      if (!platMap[p]) platMap[p] = 0;
      platMap[p] += cost;
      total += cost;
    }
  });
  // Add old ad_spends records
  ads.forEach(function(a) {
    var d = a.ad_date || '';
    var match = isAll || (isYear ? d.slice(0, 4) === yy : d.slice(0, 7) === ym);
    if (match) {
      var p = a.ad_platform || '其他';
      if (!platMap[p]) platMap[p] = 0;
      platMap[p] += a.amount || 0;
      total += a.amount || 0;
    }
  });

  var statHtml = statCard('總廣告費', 'NT$' + fmtN(total), '', 'red');
  Object.keys(platMap).sort(function(a, b) { return platMap[b] - platMap[a] }).forEach(function(p) {
    statHtml += statCard(p, 'NT$' + fmtN(platMap[p]), fmtP(total > 0 ? platMap[p] / total : 0));
  });
  $('expStatCards').innerHTML = statHtml;

  // Render config cards
  if (adConfigs.length === 0) {
    $('adConfigList').innerHTML = '<div class="empty"><div class="icon">📢</div><p>尚無廣告設定</p><p class="text-sm">新增設定後，系統會自動計算每月廣告費</p></div>';
    return;
  }
  var h = '';
  adConfigs.forEach(function(c) {
    var st = adConfigStatus(c);
    var endTxt = c.end_date || '持續投放';
    var days = isAll ? '' : (isYear ? '' : adConfigDaysInMonth(c, ym) + ' 天');
    var mCost = isAll ? '' : (isYear ? '' : 'NT$' + fmtN(adConfigDaysInMonth(c, ym) * (c.daily_cost || 0)));
    h += '<div class="card" style="margin-bottom:8px;padding:14px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
        '<div style="display:flex;align-items:center;gap:8px"><strong>' + esc(c.platform || '') + '</strong><span class="' + st.cls + '">' + st.label + '</span></div>' +
        '<div class="act-group">' +
          (c.active
            ? '<button class="act-btn" data-action="toggleAdConfig" data-id="' + c.id + '">暫停</button>'
            : '<button class="act-btn edit" data-action="toggleAdConfig" data-id="' + c.id + '">恢復</button>') +
          '<button class="act-btn edit" data-action="editAdConfig" data-id="' + c.id + '">編輯</button>' +
          '<button class="act-btn del" data-action="deleteAdConfig" data-id="' + c.id + '">刪除</button>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:16px;flex-wrap:wrap;font-size:.85rem;color:var(--fg2)">' +
        '<span>每日 <b class="text-red">NT$' + fmtN(c.daily_cost || 0) + '</b></span>' +
        '<span>' + (c.start_date || '') + ' → ' + endTxt + '</span>' +
        (days ? '<span>本月 ' + days + ' / ' + mCost + '</span>' : '') +
        (c.notes ? '<span>📝 ' + esc(c.notes) + '</span>' : '') +
      '</div>' +
    '</div>';
  });
  $('adConfigList').innerHTML = h;
}
function toggleAdcEnd() {
  var chk = $('adc_noend');
  var wrap = $('adc_end');
  if (chk.checked) {
    wrap.style.opacity = '0.4';
    wrap.style.pointerEvents = 'none';
  } else {
    wrap.style.opacity = '1';
    wrap.style.pointerEvents = '';
  }
}
function openAdConfigModal(item) {
  $('adConfigModalTitle').textContent = item ? '編輯廣告設定' : '新增廣告設定';
  $('adc_id').value = item ? item.id : '';
  var platItems = ['8591','Dcard','Facebook','Instagram','蝦皮','Google'].map(function(p) {
    return { value: p, label: p };
  });
  cdropInit('adc_platformDrop', {
    items: platItems,
    value: item ? (item.platform || '') : '',
    placeholder: '搜尋或選擇平台...',
    onSelect: function(v) { $('adc_platform').value = v; }
  });
  if (item && item.platform) {
    $('adc_platform').value = item.platform;
    cdropSetValue('adc_platformDrop', item.platform);
  }
  $('adc_daily').value = item ? item.daily_cost : '';
  dpInit('adc_start', { value: item ? item.start_date : today() });
  var noEnd = item ? !item.end_date : false;
  $('adc_noend').checked = noEnd;
  dpInit('adc_end', { value: item && item.end_date ? item.end_date : '' });
  toggleAdcEnd();
  $('adc_notes').value = item ? (item.notes || '') : '';
  openModal('adConfigModal');
}
function editAdConfig(id) {
  var item = adConfigs.filter(function(c) { return String(c.id) === String(id) })[0];
  if (item) openAdConfigModal(item);
  else toast('找不到此設定', 'err');
}
function saveAdConfig() {
  var noEnd = $('adc_noend').checked;
  var obj = {
    platform: ($('adc_platform').value || (cdropInstances['adc_platformDrop'] ? cdropInstances['adc_platformDrop'].state.text : '')).trim(),
    daily_cost: Number($('adc_daily').value) || 0,
    start_date: dpGetVal('adc_start'),
    end_date: noEnd ? null : (dpGetVal('adc_end') || null),
    notes: $('adc_notes').value.trim(),
    active: true
  };
  if (!obj.platform) return toast('請填寫廣告平台', 'err');
  if (!obj.daily_cost) return toast('請填寫每日金額', 'err');
  if (!obj.start_date) return toast('請選擇開始日期', 'err');
  var id = $('adc_id').value;
  if (isDemo) {
    if (id) {
      var idx = adConfigs.findIndex(function(c) { return String(c.id) === String(id) });
      if (idx >= 0) { obj.active = adConfigs[idx].active; Object.assign(adConfigs[idx], obj); }
    } else {
      obj.id = 'd' + Date.now();
      adConfigs.unshift(obj);
    }
    demoSave(); closeModal(); renderAll(); toast('廣告設定已儲存', 'ok');
  } else {
    obj.user_id = userId;
    var req = id
      ? sb.from('ad_configs').update(obj).eq('id', id)
      : sb.from('ad_configs').insert(obj);
    req.then(function(res) {
      if (res.error) return toast('儲存失敗：' + res.error.message, 'err');
      closeModal(); loadAll(); toast('廣告設定已儲存', 'ok');
    });
  }
}
function toggleAdConfig(id) {
  var item = adConfigs.filter(function(c) { return String(c.id) === String(id) })[0];
  if (!item) return;
  var newActive = !item.active;
  if (isDemo) {
    item.active = newActive;
    demoSave(); renderAll(); toast(newActive ? '已恢復投放' : '已暫停', 'ok');
  } else {
    sb.from('ad_configs').update({ active: newActive }).eq('id', id).then(function(res) {
      if (res.error) return toast(res.error.message, 'err');
      loadAll(); toast(newActive ? '已恢復投放' : '已暫停', 'ok');
    });
  }
}
function deleteAdConfig(id) {
  confirmAction('確定要刪除此廣告設定？', function() {
    if (isDemo) {
      adConfigs = adConfigs.filter(function(c) { return String(c.id) !== String(id) });
      demoSave(); renderAll(); toast('已刪除', 'ok');
    } else {
      sb.from('ad_configs').delete().eq('id', id).then(function(res) {
        if (res.error) return toast(res.error.message, 'err');
        loadAll(); toast('已刪除', 'ok');
      });
    }
  });
}

/* ──── Refresh ──── */
function doRefresh() {
  // Hard reload: bypass all caches, get latest HTML/JS/CSS
  location.reload(true);
}

/* ──── Filter Tags ──── */
function setFilter(el, selectId) {
  // Update hidden select value
  var val = el.getAttribute('data-value');
  var sel = $(selectId);
  if (sel) {
    sel.value = val;
    // For selects that need the option to exist
    if (!sel.querySelector('option[value="' + val + '"]')) {
      sel.innerHTML = '<option value="' + val + '"></option>';
    }
    sel.value = val;
  }
  // Toggle active state within same filter group
  var filterType = el.getAttribute('data-filter');
  var container = el.parentElement;
  var siblings = container.querySelectorAll('.filter-tag' + (filterType ? '[data-filter="' + filterType + '"]' : ''));
  // If no data-filter attr, toggle all tags in container that share same selectId onclick
  if (!filterType) {
    siblings = container.querySelectorAll('.filter-tag[onclick*="' + selectId + '"]');
  }
  for (var i = 0; i < siblings.length; i++) siblings[i].classList.remove('active');
  el.classList.add('active');
  // Trigger render
  if (selectId === 'orderChannelFilter' || selectId === 'orderStatusFilter') renderOrders();
  else if (selectId === 'subsFilter') renderSubscriptions();
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
    case 'editAdConfig': editAdConfig(id); break;
    case 'deleteAdConfig': deleteAdConfig(id); break;
    case 'toggleAdConfig': toggleAdConfig(id); break;
    case 'toggleAgentDetail': toggleAgentDetail(id); break;
  }
});

/* ──── Service Accounts (Seat Management) ──── */
function getSeatStatus(accountId) {
  var acct = serviceAccounts.filter(function(a) { return String(a.id) === String(accountId) })[0];
  if (!acct) return [];
  var td = today();
  var seats = [];
  for (var i = 1; i <= acct.max_seats; i++) {
    var seatOrders = orders.filter(function(o) {
      return String(o.service_account_id) === String(accountId) && o.seat_number === i && o.status === '已完成' && o.expiry_date;
    }).sort(function(a, b) { return (a.order_date || '').localeCompare(b.order_date || '') });
    // Find current active order (order_date <= today AND expiry >= today)
    var current = null, renewal = null;
    seatOrders.forEach(function(o) {
      if (o.order_date <= td && o.expiry_date >= td) current = o;
      if (o.order_date > td) renewal = o;
    });
    // Fallback: if no current, find the most recently expired
    var lastExpired = null;
    if (!current) {
      var expired = seatOrders.filter(function(o) { return o.expiry_date < td });
      if (expired.length) lastExpired = expired[expired.length - 1];
    }
    var ref = current || lastExpired;
    if (current) {
      seats.push({ seat: i, status: 'occupied', order: current, customer: getCustomerName(current.customer_id), expiry: current.expiry_date, days_left: Math.ceil((new Date(current.expiry_date) - new Date(td)) / 86400000), renewal: renewal });
    } else if (lastExpired) {
      seats.push({ seat: i, status: renewal ? 'occupied' : 'expired', order: lastExpired, customer: getCustomerName(lastExpired.customer_id), expiry: lastExpired.expiry_date, days_left: Math.ceil((new Date(lastExpired.expiry_date) - new Date(td)) / 86400000), renewal: renewal });
    } else {
      seats.push({ seat: i, status: 'empty', order: null, customer: '', expiry: '', days_left: 0, renewal: null });
    }
  }
  return seats;
}

function renderAccountManager() {
  var el = $('svcAccountList');
  if (!el) return;
  if (serviceAccounts.length === 0) {
    el.innerHTML = '<div class="empty" style="padding:16px"><p>尚未新增帳號</p></div>';
    return;
  }
  var h = '<table class="acct-table"><tr><th>平台</th><th>Email</th><th>座位</th><th>狀態</th><th>操作</th></tr>';
  serviceAccounts.forEach(function(a) {
    var seats = getSeatStatus(a.id);
    var empty = seats.filter(function(s) { return s.status === 'empty' }).length;
    var expired = seats.filter(function(s) { return s.status === 'expired' }).length;
    h += '<tr><td>' + esc(a.platform) + '</td><td>' + esc(a.email) + '</td>' +
      '<td>' + empty + '/' + a.max_seats + ' 空位' + (expired > 0 ? ' <span class="text-yellow">' + expired + ' 待處理</span>' : '') + '</td>' +
      '<td>' + (a.status === '啟用' ? '<span class="text-green">啟用</span>' : '<span class="text-grey">停用</span>') + '</td>' +
      '<td><button class="btn sm ghost" onclick="openSvcAccountModal(getSvcAccount(\'' + a.id + '\'))">編輯</button>' +
      '<button class="btn sm ghost text-red" onclick="deleteSvcAccount(\'' + a.id + '\')">刪除</button></td></tr>';
  });
  h += '</table>';
  el.innerHTML = h;
}

function getSvcAccount(id) {
  return serviceAccounts.filter(function(a) { return String(a.id) === String(id) })[0] || null;
}

function openSvcAccountModal(item) {
  $('svcAcctModalTitle').textContent = item ? '編輯帳號' : '新增帳號';
  $('sa_id').value = item ? item.id : '';
  // Platform dropdown from existing product platforms
  var plats = [];
  products.forEach(function(p) {
    if (p.platform && plats.indexOf(p.platform) < 0) plats.push(p.platform);
  });
  var platOpts = '<option value="">選擇平台</option>';
  plats.sort().forEach(function(p) { platOpts += '<option value="' + esc(p) + '"' + (item && item.platform === p ? ' selected' : '') + '>' + esc(p) + '</option>' });
  $('sa_platform').innerHTML = platOpts;
  $('sa_email').value = item ? item.email : '';
  $('sa_maxSeats').value = item ? item.max_seats : 5;
  $('sa_notes').value = item ? (item.notes || '') : '';
  $('sa_status').value = item ? item.status : '啟用';
  openModal('svcAccountModal');
}

function saveSvcAccount() {
  var plat = $('sa_platform').value;
  var email = $('sa_email').value.trim();
  if (!plat) return toast('請選擇平台', 'err');
  if (!email) return toast('請輸入 Email', 'err');
  var obj = {
    platform: plat,
    email: email,
    max_seats: Number($('sa_maxSeats').value) || 5,
    notes: $('sa_notes').value.trim(),
    status: $('sa_status').value
  };
  var id = $('sa_id').value;
  if (isDemo) {
    if (id) {
      var idx = serviceAccounts.findIndex(function(a) { return String(a.id) === String(id) });
      if (idx >= 0) Object.assign(serviceAccounts[idx], obj);
    } else {
      obj.id = 'd' + Date.now();
      serviceAccounts.push(obj);
    }
    demoSave(); closeModal(); renderAccountManager(); toast('帳號已儲存', 'ok');
  } else {
    obj.user_id = userId;
    var req = id
      ? sb.from('service_accounts').update(obj).eq('id', id)
      : sb.from('service_accounts').insert(obj);
    req.then(function(res) {
      if (res.error) return toast(res.error.message, 'err');
      closeModal(); loadAll(); toast('帳號已儲存', 'ok');
    });
  }
}

function renewSeat(accountId, seatNum, oldOrderId) {
  var oldOrder = orders.filter(function(o) { return String(o.id) === String(oldOrderId) })[0];
  var presetCustId = oldOrder ? (oldOrder.customer_id || '') : '';
  openOrderModal(null);
  if (oldOrder) {
    var expiryBase = oldOrder.expiry_date || today();
    renewExpiryBase = expiryBase;
    dpSetVal('om_date', today());
    if (oldOrder.product_id) {
      $('om_product').value = oldOrder.product_id;
      cdropInstances['om_productDrop'].state.value = String(oldOrder.product_id);
      var pi = cdropInstances['om_productDrop'].state.items.filter(function(it) { return String(it.value) === String(oldOrder.product_id) })[0];
      if (pi) {
        cdropInstances['om_productDrop'].state.text = pi.label;
        var pinp = document.querySelector('[data-cdrop-input="om_productDrop"]');
        if (pinp) pinp.value = pi.label;
      }
      cdropRenderPanel('om_productDrop');
      var prod = products.filter(function(x) { return String(x.id) === String(oldOrder.product_id) })[0];
      if (prod) {
        var ch = $('om_channel').value;
        var usePrice = ((ch === '蝦皮' || ch === '個人') && prod.shopee_price) ? prod.shopee_price : prod.price;
        $('om_unitPrice').value = usePrice;
        $('om_unitCost').value = prod.cost;
        var months = parseInt(prod.duration) || 0;
        if (months > 0) {
          var d = new Date(expiryBase);
          d.setMonth(d.getMonth() + months);
          dpSetVal('om_expiry', d.toISOString().slice(0, 10));
        }
        calcOrderPreview();
      }
    }
    if (presetCustId) {
      $('om_customer').value = presetCustId;
      if (cdropInstances['om_customerDrop']) {
        cdropInstances['om_customerDrop'].state.value = String(presetCustId);
        var ci = cdropInstances['om_customerDrop'].state.items.filter(function(it) { return String(it.value) === String(presetCustId) })[0];
        if (ci) {
          cdropInstances['om_customerDrop'].state.text = ci.label;
          var inp = document.querySelector('[data-cdrop-input="om_customerDrop"]');
          if (inp) inp.value = ci.label;
        }
        cdropRenderPanel('om_customerDrop');
      }
    }
    $('om_svcAcct').value = accountId;
    $('om_seat').value = seatNum;
    var accts = serviceAccounts.filter(function(a) { return String(a.id) === String(accountId) });
    if (accts.length > 0) {
      $('om_seatGroup').style.display = '';
      initSvcAcctDrop(accts);
    }
  }
}

function renewOrder(oldOrderId) {
  var oldOrder = orders.filter(function(o) { return String(o.id) === String(oldOrderId) })[0];
  if (!oldOrder) return;
  var expiryBase = oldOrder.expiry_date || today();
  var presetCustId = oldOrder.customer_id || '';
  var presetChannel = oldOrder.channel || '8591';
  openOrderModal(null);
  renewExpiryBase = expiryBase;
  // Order date = today (payment day), expiry = from previous expiry date
  dpSetVal('om_date', today());
  $('om_channel').value = presetChannel;
  onChannelChange();
  if (oldOrder.product_id) {
    $('om_product').value = oldOrder.product_id;
    cdropInstances['om_productDrop'].state.value = String(oldOrder.product_id);
    var pi = cdropInstances['om_productDrop'].state.items.filter(function(it) { return String(it.value) === String(oldOrder.product_id) })[0];
    if (pi) {
      cdropInstances['om_productDrop'].state.text = pi.label;
      var pinp = document.querySelector('[data-cdrop-input="om_productDrop"]');
      if (pinp) pinp.value = pi.label;
    }
    cdropRenderPanel('om_productDrop');
    var prod = products.filter(function(x) { return String(x.id) === String(oldOrder.product_id) })[0];
    if (prod) {
      var ch = $('om_channel').value;
      var usePrice = ((ch === '蝦皮' || ch === '個人') && prod.shopee_price) ? prod.shopee_price : prod.price;
      $('om_unitPrice').value = usePrice;
      $('om_unitCost').value = prod.cost;
      var months = parseInt(prod.duration) || 0;
      if (months > 0) {
        var d = new Date(expiryBase);
        d.setMonth(d.getMonth() + months);
        dpSetVal('om_expiry', d.toISOString().slice(0, 10));
      }
      var accts = serviceAccounts.filter(function(a) { return a.platform === prod.platform && a.status === '啟用' });
      if (accts.length > 0) {
        $('om_seatGroup').style.display = '';
        initSvcAcctDrop(accts);
      }
    }
  }
  if (presetCustId) {
    $('om_customer').value = presetCustId;
    if (cdropInstances['om_customerDrop']) {
      cdropInstances['om_customerDrop'].state.value = String(presetCustId);
      var ci = cdropInstances['om_customerDrop'].state.items.filter(function(it) { return String(it.value) === String(presetCustId) })[0];
      if (ci) {
        cdropInstances['om_customerDrop'].state.text = ci.label;
        var inp = document.querySelector('[data-cdrop-input="om_customerDrop"]');
        if (inp) inp.value = ci.label;
      }
      cdropRenderPanel('om_customerDrop');
    }
  }
  if (oldOrder.account_info) $('om_accountInfo').value = oldOrder.account_info;
  calcOrderPreview();
}

function deleteSvcAccount(id) {
  var hasOrders = orders.some(function(o) { return String(o.service_account_id) === String(id) });
  if (hasOrders) return toast('此帳號已有關聯訂單，無法刪除', 'err');
  confirmAction('確定要刪除此帳號？', function() {
    if (isDemo) {
      serviceAccounts = serviceAccounts.filter(function(a) { return String(a.id) !== String(id) });
      demoSave(); renderAccountManager(); toast('已刪除', 'ok');
    } else {
      sb.from('service_accounts').delete().eq('id', id).then(function(res) {
        if (res.error) return toast(res.error.message, 'err');
        loadAll(); toast('已刪除', 'ok');
      });
    }
  });
}

/* ──── Settings ──── */
function openSettings() {
  var mode = localStorage.getItem('proxy-ocr-mode') || 'free';
  $('set_ocrMode').value = mode;
  $('set_apiKey').value = localStorage.getItem('proxy-api-key') || '';
  $('apiKeyGroup').style.display = mode === 'ai' ? '' : 'none';
  $('set_ocrMode').onchange = function() {
    $('apiKeyGroup').style.display = this.value === 'ai' ? '' : 'none';
  };
  renderAccountManager();
  openModal('settingsModal');
}
function saveSettings() {
  var mode = $('set_ocrMode').value;
  localStorage.setItem('proxy-ocr-mode', mode);
  var key = $('set_apiKey').value.trim();
  if (key) localStorage.setItem('proxy-api-key', key);
  else localStorage.removeItem('proxy-api-key');
  closeModal();
  toast('設定已儲存', 'ok');
}

/* ──── Subscription Management ──── */
function getSubscriptions() {
  return orders.filter(function(o) {
    return o.expiry_date && o.status === '已完成';
  }).map(function(o) {
    var now = new Date(); now.setHours(0,0,0,0);
    var exp = new Date(o.expiry_date); exp.setHours(0,0,0,0);
    var diff = Math.ceil((exp - now) / 86400000);
    var dur = o.duration || '';
    var durMonths = parseInt(dur) || 0;
    var startDate = o.order_date || '';
    if (durMonths > 0 && o.expiry_date) {
      var sd = new Date(o.expiry_date);
      sd.setMonth(sd.getMonth() - durMonths);
      startDate = sd.toISOString().slice(0, 10);
    }
    return {
      id: o.id,
      platform: o.platform || '',
      version: o.version || '',
      duration: dur,
      buyer: o.notes ? (o.notes.match(/買家(No\.\d+)/)||[])[1] || '' : '',
      customer: getCustomerName(o.customer_id),
      customer_id: o.customer_id || '',
      product_id: o.product_id || '',
      channel: o.channel || '8591',
      order_date: o.order_date || '',
      start_date: startDate,
      expiry_date: o.expiry_date,
      days_left: diff,
      unit_price: o.unit_price || 0,
      qty: o.qty || 1,
      account_info: o.account_info || '',
      notes: o.notes || '',
      service_account_id: o.service_account_id || null,
      seat_number: o.seat_number || null
    };
  }).sort(function(a, b) { return a.days_left - b.days_left; });
}

function renderSubscriptions() {
  var subs = getSubscriptions();
  var filter = $('subsFilter') ? $('subsFilter').value : 'active';
  var q = ($('subsSearch') ? $('subsSearch').value : '').toLowerCase();

  var filtered = subs.filter(function(s) {
    if (filter === 'active') return s.days_left >= 0;
    if (filter === 'expiring') return s.days_left >= 0 && s.days_left <= 7;
    if (filter === 'expired') return s.days_left < 0;
    return true;
  });

  if (q) {
    filtered = filtered.filter(function(s) {
      return (s.platform + s.version + s.buyer + s.customer + s.account_info + s.notes).toLowerCase().indexOf(q) >= 0;
    });
  }

  // Summary stats
  var totalActive = subs.filter(function(s) { return s.days_left >= 0; }).length;
  var urgent = subs.filter(function(s) { return s.days_left >= 0 && s.days_left <= 2; }).length;
  var warning = subs.filter(function(s) { return s.days_left > 2 && s.days_left <= 7; }).length;
  var expired = subs.filter(function(s) { return s.days_left < 0; }).length;

  if ($('subsSummary')) {
    $('subsSummary').innerHTML =
      '<div class="subs-stat safe"><div class="ss-val">' + totalActive + '</div><div class="ss-label">進行中</div></div>' +
      '<div class="subs-stat urgent"><div class="ss-val">' + urgent + '</div><div class="ss-label">2天內到期</div></div>' +
      '<div class="subs-stat warning"><div class="ss-val">' + warning + '</div><div class="ss-label">7天內到期</div></div>' +
      '<div class="subs-stat"><div class="ss-val">' + expired + '</div><div class="ss-label">已過期</div></div>';
  }

  if (filtered.length === 0) {
    $('subsList').innerHTML = '<div class="empty"><div class="icon">📅</div><p>沒有符合條件的訂閱</p></div>';
    if ($('subsNav')) $('subsNav').innerHTML = '';
    return;
  }

  // Group by platform
  var groups = {};
  filtered.forEach(function(s) {
    var key = s.platform || '未分類';
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  });

  // Sort groups: platforms with most urgent items first
  var groupKeys = Object.keys(groups).sort(function(a, b) {
    var minA = groups[a].reduce(function(m, s) { return Math.min(m, s.days_left); }, 9999);
    var minB = groups[b].reduce(function(m, s) { return Math.min(m, s.days_left); }, 9999);
    return minA - minB;
  });

  // Platform quick nav
  if ($('subsNav')) {
    var navHtml = '';
    groupKeys.forEach(function(plat) {
      var cnt = groups[plat].length;
      var urgCnt = groups[plat].filter(function(s) { return s.days_left >= 0 && s.days_left <= 2; }).length;
      var cls = urgCnt > 0 ? ' urgent' : '';
      navHtml += '<button class="subs-nav-chip' + cls + '" onclick="document.getElementById(\'subsGrp_' + encodeURIComponent(plat) + '\').scrollIntoView({behavior:\'smooth\',block:\'start\'})">' +
        esc(plat) + ' <span class="subs-nav-cnt">' + cnt + '</span>' +
        '</button>';
    });
    $('subsNav').innerHTML = navHtml;
  }

  var html = '';

  // Platforms that have service accounts — render as seat grid
  var seatPlatforms = {};
  serviceAccounts.forEach(function(a) { if (a.status === '啟用') seatPlatforms[a.platform] = true; });

  groupKeys.forEach(function(plat) {
    var items = groups[plat];
    var grpId = 'subsGrp_' + encodeURIComponent(plat);

    // If this platform has service accounts, render seat grid
    if (seatPlatforms[plat]) {
      var platAccts = serviceAccounts.filter(function(a) { return a.platform === plat && a.status === '啟用' });
      platAccts.forEach(function(acct) {
        var seats = getSeatStatus(acct.id);
        var emptyCount = seats.filter(function(s) { return s.status === 'empty' }).length;
        var expiredCount = seats.filter(function(s) { return s.status === 'expired' }).length;
        var occupiedCount = seats.filter(function(s) { return s.status === 'occupied' }).length;
        var cardId = grpId; grpId = '';
        html += '<div class="acct-card"' + (cardId ? ' id="' + cardId + '"' : '') + '>' +
          '<div class="acct-card-head" onclick="this.parentElement.classList.toggle(\'collapsed\')">' +
            '<div><div class="acct-card-title">' + esc(acct.email) + '</div>' +
            '<div class="acct-card-sub">' + esc(plat) + ' · ' + occupiedCount + '/' + acct.max_seats + ' 使用中' +
            (expiredCount > 0 ? ' · <span class="text-yellow">' + expiredCount + ' 待處理</span>' : '') +
            (emptyCount > 0 ? ' · <span class="text-green">' + emptyCount + ' 空位</span>' : '') +
            '</div></div>' +
            '<span class="subs-group-arrow">▼</span>' +
          '</div>' +
          '<div class="acct-card-body"><div class="seat-grid">';
        seats.forEach(function(s) {
          var cls = s.status;
          html += '<div class="seat-row ' + cls + '">' +
            '<div class="seat-num">使用者' + s.seat + '</div>' +
            '<div class="seat-info">';
          if (s.status === 'occupied') {
            html += '<div class="seat-customer">' + esc(s.customer) + '</div>' +
              '<div class="seat-expiry">' + s.expiry + ' · <span class="' + (s.days_left <= 2 ? 'text-red' : s.days_left <= 7 ? 'text-yellow' : 'text-green') + '">' + s.days_left + ' 天後到期</span></div>';
            if (s.renewal) {
              html += '<div class="seat-expiry" style="margin-top:2px"><span class="seat-badge green">已排續約</span> ' + s.renewal.order_date + ' → ' + s.renewal.expiry_date + '</div>';
            }
          } else if (s.status === 'expired') {
            html += '<div class="seat-customer">' + esc(s.customer) + '</div>' +
              '<div class="seat-expiry"><span class="text-red">' + Math.abs(s.days_left) + ' 天前到期</span></div>';
          } else {
            html += '<div class="seat-customer" style="color:var(--fg3)">空位</div>';
          }
          html += '</div><div class="seat-actions">';
          if (s.status === 'occupied') {
            html += '<button class="btn sm ghost" data-action="editOrder" data-id="' + s.order.id + '">編輯</button>';
            if (!s.renewal) {
              html += '<button class="btn sm primary" onclick="renewSeat(\'' + acct.id + '\',' + s.seat + ',\'' + s.order.id + '\')">續約</button>';
            }
          } else if (s.status === 'expired') {
            html += '<button class="btn sm primary" onclick="renewSeat(\'' + acct.id + '\',' + s.seat + ',\'' + (s.order ? s.order.id : '') + '\')">續約</button>';
          }
          html += '</div></div>';
        });
        html += '</div></div></div>';
      });
      // Also render non-account subscriptions for this platform (legacy orders without service_account_id)
      var legacyItems = items.filter(function(s) { return !s.service_account_id; });
      if (legacyItems.length > 0) {
        renderSubGroup(legacyItems, plat + '（未綁定帳號）');
      }
      return;
    }

    renderSubGroup(items, plat, grpId);
  });

  function renderSubCard(s) {
    var cls = s.days_left < 0 ? 'expired' : s.days_left <= 2 ? 'urgent' : s.days_left <= 7 ? 'warning' : '';
    var daysCls = s.days_left < 0 ? 'text-grey' : s.days_left <= 2 ? 'text-red' : s.days_left <= 7 ? 'text-yellow' : 'text-green';
    var who = s.customer || s.buyer || '';
    return '<div class="sub-card ' + cls + '">' +
      '<div class="sub-countdown"><div class="days ' + daysCls + '">' + (s.days_left < 0 ? Math.abs(s.days_left) : s.days_left) + '</div>' +
      '<div class="days-label">' + (s.days_left < 0 ? '天前到期' : s.days_left === 0 ? '今天到期' : '天後到期') + '</div></div>' +
      '<div class="sub-info">' +
        '<div class="sub-product">' + esc(s.version || s.platform) + (s.duration ? ' <span style="color:var(--fg2);font-weight:400">(' + esc(s.duration) + ')</span>' : '') + '</div>' +
        (who ? '<div class="sub-buyer">👤 ' + esc(who) + '</div>' : '') +
        (s.account_info ? '<div class="sub-account">🔑 ' + esc(s.account_info) + '</div>' : '') +
        '<div class="sub-dates">📅 ' + s.start_date + ' → ' + s.expiry_date + '</div>' +
        (s.notes ? '<div class="sub-notes">📝 ' + esc(s.notes) + '</div>' : '') +
      '</div>' +
      '<div class="sub-actions">' +
        '<button class="btn sm ghost" data-action="editOrder" data-id="' + s.id + '">編輯</button>' +
        '<button class="btn sm primary" onclick="renewOrder(\'' + s.id + '\')">續約</button>' +
      '</div>' +
    '</div>';
  }

  function renderSubGroup(items, plat, grpId) {
    var urgentCount = items.filter(function(s) { return s.days_left >= 0 && s.days_left <= 2; }).length;
    var activeCount = items.filter(function(s) { return s.days_left >= 0; }).length;
    var headerCls = urgentCount > 0 ? 'text-red' : '';

    html += '<div class="subs-group"' + (grpId ? ' id="' + grpId + '"' : '') + '>' +
      '<div class="subs-group-head" onclick="this.parentElement.classList.toggle(\'collapsed\')">' +
        '<span class="subs-group-arrow">▼</span>' +
        '<span class="subs-group-name">' + esc(plat) + '</span>' +
        '<span class="subs-group-count">' + activeCount + ' 筆' +
        (urgentCount > 0 ? ' <span class="' + headerCls + '">（' + urgentCount + ' 筆即將到期）</span>' : '') +
        '</span>' +
      '</div>' +
      '<div class="subs-group-body">';

    var merged = {};
    var soloItems = [];
    items.forEach(function(s) {
      var key = (s.customer_id || '') + '||' + (s.platform || '') + '||' + (s.version || '');
      if (s.customer_id) {
        if (!merged[key]) merged[key] = [];
        merged[key].push(s);
      } else {
        soloItems.push(s);
      }
    });

    Object.keys(merged).forEach(function(key) {
      var group = merged[key].sort(function(a, b) { return a.days_left - b.days_left; });
      if (group.length === 1) {
        soloItems.push(group[0]);
        return;
      }
      var latest = group[0];
      var who = latest.customer || latest.buyer || '';
      var latestCls = latest.days_left < 0 ? 'expired' : latest.days_left <= 2 ? 'urgent' : latest.days_left <= 7 ? 'warning' : '';
      var latestDaysCls = latest.days_left < 0 ? 'text-grey' : latest.days_left <= 2 ? 'text-red' : latest.days_left <= 7 ? 'text-yellow' : 'text-green';
      html += '<div class="sub-card merged ' + latestCls + '">' +
        '<div class="sub-countdown"><div class="days ' + latestDaysCls + '">' + (latest.days_left < 0 ? Math.abs(latest.days_left) : latest.days_left) + '</div>' +
        '<div class="days-label">' + (latest.days_left < 0 ? '天前到期' : latest.days_left === 0 ? '今天到期' : '天後到期') + '</div></div>' +
        '<div class="sub-info">' +
          '<div class="sub-product">' + esc(latest.version || latest.platform) + (latest.duration ? ' <span style="color:var(--fg2);font-weight:400">(' + esc(latest.duration) + ')</span>' : '') +
          ' <span class="sub-merge-badge">' + group.length + ' 筆訂單</span></div>' +
          (who ? '<div class="sub-buyer">👤 ' + esc(who) + '</div>' : '') +
          (latest.account_info ? '<div class="sub-account">🔑 ' + esc(latest.account_info) + '</div>' : '') +
          '<div class="sub-timeline">';
      group.forEach(function(s, i) {
        var sCls = s.days_left < 0 ? 'past' : i === 0 ? 'current' : 'future';
        html += '<div class="sub-tl-item ' + sCls + '">' +
          '<span class="sub-tl-dot"></span>' +
          '<span class="sub-tl-range">' + s.start_date + ' → ' + s.expiry_date + '</span>' +
          '<button class="btn sm ghost" data-action="editOrder" data-id="' + s.id + '" style="padding:2px 6px;font-size:12px">編輯</button>' +
        '</div>';
      });
      html += '</div></div>' +
        '<div class="sub-actions">' +
          '<button class="btn sm primary" onclick="renewOrder(\'' + latest.id + '\')">續約</button>' +
        '</div>' +
      '</div>';
    });

    soloItems.sort(function(a, b) { return a.days_left - b.days_left; });
    soloItems.forEach(function(s) { html += renderSubCard(s); });

    html += '</div></div>';
  }

  $('subsList').innerHTML = html;
}

function renderDashboardExpiry() {
  var subs = getSubscriptions().filter(function(s) { return s.days_left >= 0 && s.days_left <= 7; });

  if (!$('dashExpiry')) return;

  if (subs.length === 0) {
    $('dashExpiryCard').style.display = 'none';
    return;
  }
  $('dashExpiryCard').style.display = '';

  var html = '';
  subs.slice(0, 5).forEach(function(s) {
    var daysCls = s.days_left <= 2 ? 'text-red' : 'text-yellow';
    var daysText = s.days_left === 0 ? '今天' : s.days_left + '天';
    var who = s.customer || s.buyer || '';
    html += '<div class="dash-expiry-item">' +
      '<div class="de-days ' + daysCls + '">' + daysText + '</div>' +
      '<div class="de-info">' +
        '<div class="de-product">' + esc(s.platform) + (s.version ? ' ' + esc(s.version) : '') + '</div>' +
        (who ? '<div class="de-buyer">👤 ' + esc(who) + '</div>' : '') +
      '</div>' +
      '<div class="de-expiry">' + s.expiry_date + '</div>' +
    '</div>';
  });
  if (subs.length > 5) {
    html += '<div style="text-align:center;padding:8px;color:var(--fg2);font-size:.8rem">還有 ' + (subs.length - 5) + ' 筆即將到期...</div>';
  }
  $('dashExpiry').innerHTML = html;
}

function checkExpiryNotifications() {
  var subs = getSubscriptions().filter(function(s) { return s.days_left >= 0 && s.days_left <= 2; });

  // Show/hide alert bar
  var bar = $('expiryAlertBar');
  if (!bar) return;

  if (subs.length === 0) {
    bar.style.display = 'none';
    return;
  }

  var names = subs.slice(0, 3).map(function(s) {
    var who = s.customer || s.buyer || '';
    return esc(s.platform) + (who ? '(' + esc(who) + ')' : '');
  }).join('、');
  if (subs.length > 3) names += ' 等';

  bar.style.display = 'flex';
  bar.innerHTML = '<span class="alert-icon">⚠️</span>' +
    '<span class="alert-text"><strong>' + subs.length + ' 筆訂閱即將到期：</strong>' + names + '</span>' +
    '<button class="alert-btn" onclick="switchTab(\'subs\')">查看</button>' +
    '<button class="alert-dismiss" onclick="this.parentElement.style.display=\'none\'">&times;</button>';

  // Browser notification (once per session)
  if (window._expiryNotified) return;
  window._expiryNotified = true;

  if ('Notification' in window) {
    if (Notification.permission === 'granted') {
      sendExpiryNotification(subs);
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(function(p) {
        if (p === 'granted') sendExpiryNotification(subs);
      });
    }
  }
}

function sendExpiryNotification(subs) {
  var body = subs.map(function(s) {
    var who = s.customer || s.buyer || '';
    var d = s.days_left === 0 ? '今天到期' : s.days_left + '天後到期';
    return s.platform + (who ? '(' + who + ')' : '') + ' — ' + d;
  }).join('\n');

  try {
    new Notification('⚠️ 訂閱即將到期', {
      body: body,
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">⏰</text></svg>',
      tag: 'expiry-alert'
    });
  } catch(e) { console.warn('Notification error:', e); }
}

/* ──── OCR Screenshot Import ──── */
var ocrParsedOrders = [];
var ocrImageBase64 = '';

function openImportModal() {
  resetImport();
  openModal('importModal');
}

function switchImportTab(tab) {
  var tabs = document.querySelectorAll('.import-tab');
  var contents = document.querySelectorAll('.import-tab-content');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].classList.toggle('active', tabs[i].textContent.indexOf(tab === 'paste' ? '貼上' : '截圖') >= 0);
  }
  $('importTab-paste').classList.toggle('active', tab === 'paste');
  $('importTab-screenshot').classList.toggle('active', tab === 'screenshot');
}

function resetImport() {
  ocrParsedOrders = [];
  ocrImageBase64 = '';
  $('ocrPlaceholder').style.display = '';
  $('ocrPreviewImg').style.display = 'none';
  $('ocrStatus').style.display = 'none';
  $('ocrResults').style.display = 'none';
  $('btnOcrImport').style.display = 'none';
  $('btnOcrRetry').style.display = 'none';
  $('ocrFile').value = '';
  $('pasteArea').value = '';
  switchImportTab('paste');
}

function parsePastedText() {
  var text = $('pasteArea').value.trim();
  if (!text) return toast('請先貼上 8591 訂單文字', 'err');
  ocrParsedOrders = parseOcrText(text);
  if (ocrParsedOrders.length === 0) {
    toast('沒有解析到訂單資料，請確認貼上的內容包含訂單', 'err');
    return;
  }
  showOcrResults();
}

// Click to upload
document.addEventListener('click', function(e) {
  if (e.target.closest('#ocrPlaceholder')) {
    $('ocrFile').click();
  }
});

// Paste image (Ctrl+V)
document.addEventListener('paste', function(e) {
  // Only handle when import modal is open
  if (!$('importModal').classList.contains('show')) return;
  var items = (e.clipboardData || {}).items || [];
  for (var i = 0; i < items.length; i++) {
    if (items[i].type.indexOf('image') >= 0) {
      e.preventDefault();
      var file = items[i].getAsFile();
      if (file) {
        switchImportTab('screenshot');
        handleOcrFile(file);
      }
      return;
    }
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

    var mode = localStorage.getItem('proxy-ocr-mode') || 'free';
    if (mode === 'ai' && localStorage.getItem('proxy-api-key')) {
      callClaudeVision(ocrImageBase64, mediaType);
    } else {
      callTesseractOCR(file);
    }
  };
  reader.readAsDataURL(file);
}

/* ──── Free OCR: Tesseract.js ──── */
function callTesseractOCR(file) {
  Tesseract.recognize(file, 'chi_tra+eng', {
    logger: function(m) {
      if (m.status === 'recognizing text' && m.progress) {
        var pct = Math.round(m.progress * 100);
        $('ocrStatus').querySelector('span').textContent = '辨識中... ' + pct + '%';
      }
    }
  }).then(function(result) {
    var text = result.data.text;
    console.log('===== OCR 原始文字 =====');
    console.log(text);
    console.log('========================');
    ocrParsedOrders = parseOcrText(text);
    if (ocrParsedOrders.length === 0) {
      $('ocrStatus').style.display = 'none';
      toast('沒有辨識到訂單資料，請確認截圖清晰', 'err');
      return;
    }
    showOcrResults();
  }).catch(function(err) {
    $('ocrStatus').style.display = 'none';
    toast('辨識失敗：' + err.message, 'err');
  });
}

/* Parse OCR text into order objects
   8591 format per order block:
   Line 1: 買家：No.XXXXXXX   商品編號：sXXXXXX   下單時間：YYYY-MM-DD HH:MM:SS
   Line 2: [代儲] ...title...最低$160起...   x1   $320   已完成   查看訂單
   Line 3: Discord Nitro/其他
   Line 4: 品項：◆ 加成3個月 - 2次*1
*/
function parseOcrText(text) {
  console.log('===== parseOcrText input =====\n' + text + '\n==============================');

  var orders = [];
  // Try multiple split strategies — OCR may mangle "買家" characters
  var strategies = [
    { name: '買家', re: /(?=買\s*家)/ },
    { name: 'No.', re: /(?=No\.\s*\d{4,})/i },
    { name: 'datetime', re: /(?=\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\s+\d{1,2}:\d{2})/ },
    { name: '商品編號', re: /(?=商品[編编]號)/ }
  ];

  for (var si = 0; si < strategies.length; si++) {
    var blocks = text.split(strategies[si].re);
    var parsed = [];
    blocks.forEach(function(block) {
      if (block.trim().length < 5) return;
      var o = parseOcrBlock(block);
      if (o) parsed.push(o);
    });
    console.log('Split by ' + strategies[si].name + ': ' + blocks.length + ' blocks → ' + parsed.length + ' orders');
    if (parsed.length > orders.length) orders = parsed;
    if (orders.length >= 2) break;  // good enough
  }

  // Last resort: whole text as one block
  if (orders.length === 0) {
    var o = parseOcrBlock(text);
    if (o) orders.push(o);
  }

  // Dedup by buyer+date+price
  var seen = {};
  orders = orders.filter(function(o) {
    var key = o.buyer + '|' + o.order_date + '|' + o.unit_price;
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });

  console.log('Total orders: ' + orders.length);
  return orders;
}

function parseOcrBlock(block) {
  // Remove all zero-width and invisible unicode chars
  block = block.replace(/[​-‍﻿]/g, '');

  // 1. Date
  var dateMatch = block.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  var orderDate = '';
  if (dateMatch) {
    var mm = dateMatch[2].length < 2 ? '0' + dateMatch[2] : dateMatch[2];
    var dd = dateMatch[3].length < 2 ? '0' + dateMatch[3] : dateMatch[3];
    orderDate = dateMatch[1] + '-' + mm + '-' + dd;
  }

  // 2. Quantity
  var qtyMatch = block.match(/x\s*(\d+)/i);
  var qty = qtyMatch ? parseInt(qtyMatch[1]) : 1;

  // 3. Selling price — multiple strategies
  var price = 0;

  // Strategy A: find $NNN near "x1" (allow up to 30 chars gap, including newlines)
  var xPriceMatch = block.match(/x\s*\d+[\s\S]{0,30}?\$\s*([\d,]+)/i);
  if (xPriceMatch) {
    price = parseInt(xPriceMatch[1].replace(/,/g, '')) || 0;
  }

  // Strategy B: find $NNN on same line as "完成"
  if (!price) {
    var lines = block.split(/[\n\r]+/);
    for (var li = 0; li < lines.length; li++) {
      if (/完成|處理中/.test(lines[li])) {
        var lpm = lines[li].match(/\$\s*([\d,]+)/);
        if (lpm) { price = parseInt(lpm[1].replace(/,/g, '')) || 0; break; }
      }
    }
  }

  // Strategy C: find all $NNN, exclude title prices, take first non-title
  if (!price) {
    var allPrices = [];
    var priceRe = /\$\s*([\d,]+)/g;
    var pm;
    while ((pm = priceRe.exec(block)) !== null) {
      var val = parseInt(pm[1].replace(/,/g, '')) || 0;
      if (!val) continue;
      // Title price: has 起 within 10 chars after, or 最低 within 15 chars before
      // Also check with spaces (OCR: "起" might be "起 " or " 起")
      var after = block.substring(pm.index + pm[0].length, pm.index + pm[0].length + 10);
      var before = block.substring(Math.max(0, pm.index - 15), pm.index);
      // Check line containing this price for title indicators
      var lineStart = block.lastIndexOf('\n', pm.index) + 1;
      var lineEnd = block.indexOf('\n', pm.index); if (lineEnd < 0) lineEnd = block.length;
      var priceLine = block.substring(lineStart, lineEnd);
      var isTitle = /起/.test(after) || /最低/.test(before) || /代儲|貓玩|最低/.test(priceLine);
      allPrices.push({ val: val, isTitle: isTitle });
    }
    var real = allPrices.filter(function(p) { return !p.isTitle; });
    if (real.length > 0) price = real[0].val;
    else if (allPrices.length > 1) price = allPrices[allPrices.length - 1].val;
    else if (allPrices.length === 1) price = allPrices[0].val;
  }

  // 4. Buyer
  var buyerMatch = block.match(/No\.?\s*(\d{4,})/);
  var buyer = buyerMatch ? 'No.' + buyerMatch[1] : '';

  // 5. Platform
  var platform = '';
  var blines = block.split(/[\n\r]+/);
  for (var li = 0; li < blines.length; li++) {
    var cm = blines[li].match(/^\s*([A-Za-z][A-Za-z\s]*(?:Nitro|Premium|Music|Plus|Pro|Basic|Standard|Family|Pass)?)\s*[\/／]/);
    if (cm) { platform = cm[1].trim(); break; }
  }
  if (!platform) {
    var kp = ['Discord Nitro','YouTube Premium','YouTube Music','Netflix',
      'Spotify Premium','Spotify','Nintendo','PlayStation Plus','PlayStation',
      'Xbox Game Pass','EA Play','Apple Music','Apple TV','Google One',
      'Canva Pro','Canva','ChatGPT Plus','ChatGPT','Claude Pro','Adobe',
      'Microsoft 365','Office 365','Disney+','Disney','HBO','Crunchyroll','Steam'];
    var bl = block.toLowerCase();
    for (var i = 0; i < kp.length; i++) {
      if (bl.indexOf(kp[i].toLowerCase()) >= 0) { platform = kp[i]; break; }
    }
  }

  // 6. 品項 — extract then clean up OCR noise
  var version = '';
  var itemPatterns = [
    /品\s*項\s*[：:﹕]\s*(.+)/,
    /品[項项頂]\s*[：:﹕]?\s*(.+)/,
    /晶\s*項\s*[：:﹕]?\s*(.+)/,
    /品.\s*[：:﹕]\s*(.+)/
  ];
  for (var pi = 0; pi < itemPatterns.length; pi++) {
    var im = block.match(itemPatterns[pi]);
    if (im) {
      version = im[1].trim()
        .replace(/^[◆☆★●○▶►▪▸※\-\s]+/, '')
        // Remove trailing UI text — handle OCR spaces between chars: 自 助 退 款, 評 價 etc.
        .replace(/\s*[評自查已]\s*[價助看評]\s*[買退訂]\s*[家款單].*$/g, '')
        .replace(/\s*自\s*助\s*退\s*款.*$/g, '')
        .replace(/\s*評\s*價\s*買\s*家.*$/g, '')
        .replace(/\s*已\s*評\s*價.*$/g, '')
        .replace(/\s*查\s*看\s*訂\s*單.*$/g, '')
        .trim();
      if (version) break;
    }
  }

  // 7. Status
  var status = '已完成';
  if (block.indexOf('處理中') >= 0 || block.indexOf('交易中') >= 0) status = '處理中';
  else if (block.indexOf('已取消') >= 0) status = '已取消';
  else if (block.indexOf('已退款') >= 0) status = '已退款';

  if (!price) return null;

  var result = {
    order_date: orderDate, platform: platform || '未分類', version: version,
    qty: qty, unit_price: price, buyer: buyer, status: status
  };
  console.log('Parsed:', JSON.stringify(result));
  return result;
}

/* ──── AI OCR: Claude Vision (optional, paid) ──── */
function callClaudeVision(base64, mediaType) {
  var apiKey = localStorage.getItem('proxy-api-key');
  if (!apiKey) { toast('請先設定 API Key', 'err'); return }

  $('ocrStatus').querySelector('span').textContent = 'AI 辨識中，請稍候...';

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
  /*  Match OCR 品項 text to product database.
      Examples:
        品項 "加成3個月 - 2次*1" → product version="兩次加成", duration="3個月"
        品項 "贈禮版/ 30天*2" → product version="贈禮版", duration="1個月"
        品項 "登入版/ 1個月*1" → product version="登入版", duration="1個月"
      Strategy: normalize the OCR text, extract keywords, score each product.
  */
  if (!version && !platform) return 0;

  // Normalize OCR text: remove spaces between CJK chars that OCR added
  var ocrText = (version || '').replace(/\s+/g, '');
  var ocrLower = ocrText.toLowerCase();
  var platLower = (platform || '').toLowerCase();

  var bestMatch = null, bestScore = 0;

  products.forEach(function(p) {
    if (p.status !== '啟用') return;
    var score = 0;
    var pPlat = (p.platform || '').toLowerCase();
    var pVer = (p.version || '').replace(/\s+/g, '');
    var pDur = (p.duration || '').replace(/\s+/g, '');

    // Platform must match first
    if (platLower && pPlat && (platLower.indexOf(pPlat) >= 0 || pPlat.indexOf(platLower) >= 0)) {
      score += 1;
    } else if (platLower && pPlat) {
      return; // platform doesn't match, skip
    }

    if (!ocrLower) {
      if (score > bestScore) { bestScore = score; bestMatch = p; }
      return;
    }

    // Direct version match: "贈禮版" in "贈禮版/30天*2"
    if (pVer && ocrLower.indexOf(pVer.toLowerCase()) >= 0) {
      score += 20;
    }

    // Keyword-based matching for complex names
    // "兩次加成" ↔ "加成3個月-2次*1": check "加成" AND "2次"/"兩次"
    if (pVer) {
      var pvl = pVer.toLowerCase();
      // Check if product version keywords appear in OCR text
      if (pvl.indexOf('加成') >= 0 && ocrLower.indexOf('加成') >= 0) score += 10;
      if (pvl.indexOf('兩次') >= 0 && /[2兩]\s*次/.test(ocrText)) score += 10;
      if (pvl.indexOf('贈禮') >= 0 && ocrLower.indexOf('贈禮') >= 0) score += 15;
      if (pvl.indexOf('登入') >= 0 && ocrLower.indexOf('登入') >= 0) score += 15;
      if (pvl.indexOf('免登') >= 0 && ocrLower.indexOf('免登') >= 0) score += 15;
    }

    // Duration matching: "3個月" in "加成3個月"
    if (pDur && ocrLower.indexOf(pDur.toLowerCase()) >= 0) {
      score += 5;
    }
    // Also check "30天" ≈ "1個月"
    if (pDur === '1個月' && /30\s*天/.test(ocrText)) score += 5;
    if (pDur === '12個月' && /365\s*天|12\s*個\s*月/.test(ocrText)) score += 5;
    if (pDur === '3個月' && /90\s*天|3\s*個\s*月/.test(ocrText)) score += 5;

    if (score > bestScore) { bestScore = score; bestMatch = p; }
  });

  console.log('matchProductCost:', version, '→', bestMatch ? bestMatch.version + ' cost=' + bestMatch.cost : 'no match', 'score=' + bestScore);
  return bestMatch ? bestMatch.cost : 0;
}

function importOcrOrders() {
  if (ocrParsedOrders.length === 0) return;
  $('btnOcrImport').disabled = true;
  $('btnOcrImport').textContent = '匯入中...';

  var ocrBase = 0;
  orders.forEach(function(o) { var m = (o.order_no || '').match(/^MWJ-(\d+)$/); if (m) { var n = Number(m[1]); if (n > ocrBase) ocrBase = n; } });
  var rows = ocrParsedOrders.map(function(o, i) {
    var d = o.order_date || today();
    var costInput = $('ocrCost' + i);
    var cost = costInput ? Number(costInput.value) || 0 : 0;
    ocrBase++;
    return {
      user_id: userId,
      order_date: d,
      order_no: 'MWJ-' + String(ocrBase).padStart(5, '0'),
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
