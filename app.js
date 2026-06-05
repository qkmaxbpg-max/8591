/* 代儲管理系統 */
var SUPABASE_URL='https://hpajiexvcmkidbgreaqy.supabase.co';
var SUPABASE_ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwYWppZXh2Y21raWRiZ3JlYXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMTY2NTQsImV4cCI6MjA5NDU5MjY1NH0.ZIxx-cJRHxLAv-TlPpjvFGBndzs-GE9ptZENh81AQQQ';
var sb = null, userId = null, isDemo = false;
var products = [], agents = [], customers = [], orders = [];

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
  enterApp('本機模式');
}
function enterApp(label) {
  $('loginPage').style.display = 'none';
  $('app').style.display = '';
  $('userLabel').textContent = label;
  loadAll();
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
}

function loadAll() {
  if (isDemo) { renderAll(); return }
  Promise.all([
    sb.from('products').select('*').eq('user_id', userId).order('sort_order'),
    sb.from('agents').select('*').eq('user_id', userId).order('created_at'),
    sb.from('customers').select('*').eq('user_id', userId).order('created_at'),
    sb.from('orders').select('*').eq('user_id', userId).order('order_date', { ascending: false })
  ]).then(function(res) {
    products = res[0].data || [];
    agents = res[1].data || [];
    customers = res[2].data || [];
    orders = res[3].data || [];
    renderAll();
  });
}

function renderAll() {
  renderDashboard();
  renderProducts();
  renderOrders();
  renderAgents();
  renderCustomers();
}

/* ──── Tab switching ──── */
function switchTab(name) {
  var tabs = document.querySelectorAll('.tab');
  var contents = document.querySelectorAll('.tab-content');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].classList.toggle('active', tabs[i].getAttribute('data-tab') === name);
  }
  for (var i = 0; i < contents.length; i++) {
    contents[i].classList.toggle('active', contents[i].id === 'tab-' + name);
  }
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
function calcFee(price, feeType, feeVal) {
  return feeType === '百分比' ? price * feeVal : feeVal;
}
function calcCommission(gross, commType, commVal) {
  return commType === '百分比' ? gross * commVal : commVal;
}
function genOrderNo() {
  var d = today().replace(/-/g, '');
  var todayOrders = orders.filter(function(o) { return (o.order_no || '').indexOf(d) === 0 });
  var seq = todayOrders.length + 1;
  return d + '-' + (seq < 10 ? '0' + seq : seq);
}

/* ──── Dashboard ──── */
function renderDashboard() {
  var period = $('dashPeriod').value;
  var ym = today().slice(0, 7);
  var filtered = orders.filter(function(o) {
    if (period === 'month') return (o.order_date || '').slice(0, 7) === ym;
    return true;
  });
  var completed = filtered.filter(function(o) { return o.status === '已完成' });

  var totalRevenue = 0, totalCost = 0, totalFee = 0, totalComm = 0;
  completed.forEach(function(o) {
    var q = o.qty || 1;
    totalRevenue += q * (o.unit_price || 0);
    totalCost += q * (o.unit_cost || 0);
    var fee = calcFee(o.unit_price || 0, o.fee_type, o.fee_value || 0) * q;
    totalFee += fee;
    var gross = q * (o.unit_price || 0) - q * (o.unit_cost || 0) - fee;
    totalComm += calcCommission(gross, o.commission_type, o.commission_value || 0);
  });
  var profit = totalRevenue - totalCost - totalFee - totalComm;
  var margin = totalRevenue > 0 ? profit / totalRevenue : 0;

  $('statCards').innerHTML =
    statCard('訂單數', completed.length, '', 'blue') +
    statCard('總營收', 'NT$' + fmtN(totalRevenue), '') +
    statCard('總成本', 'NT$' + fmtN(totalCost + totalFee), '含手續費') +
    statCard('淨利潤', 'NT$' + fmtN(profit), '利潤率 ' + fmtP(margin), profit >= 0 ? 'green' : 'red');

  // Platform chart
  var platMap = {};
  completed.forEach(function(o) {
    var p = o.platform || '未分類';
    if (!platMap[p]) platMap[p] = { revenue: 0, profit: 0, count: 0 };
    var q = o.qty || 1;
    var rev = q * (o.unit_price || 0);
    var cost = q * (o.unit_cost || 0);
    var fee = calcFee(o.unit_price || 0, o.fee_type, o.fee_value || 0) * q;
    var gross = rev - cost - fee;
    var comm = calcCommission(gross, o.commission_type, o.commission_value || 0);
    platMap[p].revenue += rev;
    platMap[p].profit += gross - comm;
    platMap[p].count++;
  });
  var platKeys = Object.keys(platMap).sort(function(a, b) { return platMap[b].profit - platMap[a].profit });
  var maxProfit = 1;
  platKeys.forEach(function(k) { maxProfit = Math.max(maxProfit, Math.abs(platMap[k].profit)) });

  var chartHtml = '';
  if (platKeys.length === 0) {
    chartHtml = '<div class="empty"><div class="icon">📊</div><p>尚無已完成訂單</p></div>';
  } else {
    platKeys.forEach(function(k) {
      var d = platMap[k];
      var pct = Math.abs(d.profit) / maxProfit * 100;
      var cls = d.profit >= 0 ? 'pos' : 'neg';
      chartHtml += '<div class="chart-bar-group">' +
        '<div class="chart-label"><span>' + k + ' (' + d.count + '單)</span><span>NT$' + fmtN(d.profit) + '</span></div>' +
        '<div class="chart-track"><div class="chart-fill ' + cls + '" style="width:' + Math.max(pct, 8) + '%"></div></div></div>';
    });
  }
  $('platformChart').innerHTML = chartHtml;

  // Recent orders
  var recent = orders.slice(0, 8);
  if (recent.length === 0) {
    $('recentOrders').innerHTML = '<div class="empty"><div class="icon">📋</div><p>尚無訂單</p></div>';
  } else {
    var h = '<table><tr><th>日期</th><th>編號</th><th>商品</th><th>數量</th><th>狀態</th><th class="text-right">利潤</th></tr>';
    recent.forEach(function(o) {
      var q = o.qty || 1;
      var rev = q * (o.unit_price || 0), cost = q * (o.unit_cost || 0);
      var fee = calcFee(o.unit_price || 0, o.fee_type, o.fee_value || 0) * q;
      var gross = rev - cost - fee;
      var comm = calcCommission(gross, o.commission_type, o.commission_value || 0);
      var pr = gross - comm;
      h += '<tr><td>' + (o.order_date || '').slice(5) + '</td><td>' + (o.order_no || '') + '</td>' +
        '<td>' + (o.platform || '') + ' ' + (o.version || '') + '</td>' +
        '<td class="text-center">' + q + '</td>' +
        '<td>' + statusBadge(o.status) + '</td>' +
        '<td class="text-right ' + (pr >= 0 ? 'text-green' : 'text-red') + '">NT$' + fmtN(pr) + '</td></tr>';
    });
    h += '</table>';
    $('recentOrders').innerHTML = h;
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

/* ──── Products ──── */
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
  var h = '<table><tr><th>平台/商品</th><th>版本</th><th>期間</th><th class="text-right">成本</th><th class="text-right">售價</th><th class="text-right">手續費</th><th class="text-right">淨利</th><th class="text-right">利潤率</th><th>狀態</th><th>操作</th></tr>';
  list.forEach(function(p) {
    var fee = calcFee(p.price, p.fee_type, p.fee_value);
    var profit = p.price - p.cost - fee;
    var margin = p.price > 0 ? profit / p.price : 0;
    var profitCls = profit >= 0 ? 'text-green' : 'text-red';
    h += '<tr><td>' + esc(p.platform) + '</td><td>' + esc(p.version) + '</td><td>' + esc(p.duration) + '</td>' +
      '<td class="text-right">' + fmtN(p.cost) + '</td>' +
      '<td class="text-right">' + fmtN(p.price) + '</td>' +
      '<td class="text-right">' + fmtN(fee) + '</td>' +
      '<td class="text-right ' + profitCls + '">' + fmtN(profit) + '</td>' +
      '<td class="text-right ' + profitCls + '">' + fmtP(margin) + '</td>' +
      '<td>' + (p.status === '啟用' ? '<span class="badge active">啟用</span>' : '<span class="badge inactive">停用</span>') + '</td>' +
      '<td><div class="act-group">' +
        '<button class="act-btn edit" onclick="editProduct(\'' + p.id + '\')">編輯</button>' +
        '<button class="act-btn del" onclick="deleteProduct(\'' + p.id + '\')">刪除</button>' +
      '</div></td></tr>';
  });
  h += '</table>';
  $('productList').innerHTML = h;
  updatePlatformList();
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
  $('pm_feeType').value = item ? item.fee_type : '百分比';
  $('pm_feeVal').value = item ? item.fee_value : '0.03';
  $('pm_status').value = item ? item.status : '啟用';
  $('pm_reqInfo').value = item ? (item.required_info || '') : '';
  $('pm_notes').value = item ? (item.notes || '') : '';
  updateProdPreview();
  $('pm_cost').oninput = $('pm_price').oninput = $('pm_feeVal').oninput = $('pm_feeType').onchange = updateProdPreview;
  openModal('productModal');
}
function updateProdPreview() {
  var cost = Number($('pm_cost').value) || 0;
  var price = Number($('pm_price').value) || 0;
  var fee = calcFee(price, $('pm_feeType').value, Number($('pm_feeVal').value) || 0);
  var profit = price - cost - fee;
  var margin = price > 0 ? profit / price : 0;
  var cls = profit >= 0 ? 'text-green' : 'text-red';
  $('prodPreview').innerHTML =
    '<div class="row"><span class="lbl">手續費</span><span class="val">NT$' + fmtN(fee) + '</span></div>' +
    '<div class="row"><span class="lbl">淨利潤</span><span class="val ' + cls + ' highlight">NT$' + fmtN(profit) + '</span></div>' +
    '<div class="row"><span class="lbl">利潤率</span><span class="val ' + cls + '">' + fmtP(margin) + '</span></div>';
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
    fee_type: $('pm_feeType').value,
    fee_value: Number($('pm_feeVal').value) || 0,
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
  var period = $('orderPeriodFilter').value;
  var ym = today().slice(0, 7);
  var list = orders.filter(function(o) {
    if (status && o.status !== status) return false;
    if (period === 'month' && (o.order_date || '').slice(0, 7) !== ym) return false;
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
  var h = '<table><tr><th>日期</th><th>編號</th><th>出單人</th><th>客戶</th><th>商品</th><th>數量</th><th class="text-right">售價</th><th class="text-right">成本</th><th class="text-right">利潤</th><th>狀態</th><th>到期</th><th>操作</th></tr>';
  list.forEach(function(o) {
    var q2 = o.qty || 1;
    var rev = q2 * (o.unit_price || 0), cost = q2 * (o.unit_cost || 0);
    var fee = calcFee(o.unit_price || 0, o.fee_type, o.fee_value || 0) * q2;
    var gross = rev - cost - fee;
    var comm = calcCommission(gross, o.commission_type, o.commission_value || 0);
    var profit = gross - comm;
    var profitCls = profit >= 0 ? 'text-green' : 'text-red';
    var expiry = o.expiry_date || '';
    var expiryWarn = '';
    if (expiry && o.status === '已完成') {
      var diff = (new Date(expiry) - new Date()) / 86400000;
      if (diff < 0) expiryWarn = ' text-red';
      else if (diff < 7) expiryWarn = ' text-yellow';
    }
    h += '<tr><td>' + (o.order_date || '') + '</td><td>' + esc(o.order_no) + '</td>' +
      '<td>' + esc(getAgentName(o.agent_id)) + '</td>' +
      '<td>' + esc(getCustomerName(o.customer_id)) + '</td>' +
      '<td>' + esc(o.platform) + ' ' + esc(o.version) + '</td>' +
      '<td class="text-center">' + q2 + '</td>' +
      '<td class="text-right">' + fmtN(rev) + '</td>' +
      '<td class="text-right">' + fmtN(cost) + '</td>' +
      '<td class="text-right ' + profitCls + '">' + fmtN(profit) + '</td>' +
      '<td>' + statusBadge(o.status) + '</td>' +
      '<td class="' + expiryWarn + '">' + (expiry ? expiry.slice(5) : '') + '</td>' +
      '<td><div class="act-group">' +
        '<button class="act-btn edit" onclick="editOrder(\'' + o.id + '\')">編輯</button>' +
        '<button class="act-btn del" onclick="deleteOrder(\'' + o.id + '\')">刪除</button>' +
      '</div></td></tr>';
  });
  h += '</table>';
  $('orderList').innerHTML = h;
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
function openOrderModal(item) {
  $('orderModalTitle').textContent = item ? '編輯訂單' : '新增訂單';
  $('om_id').value = item ? item.id : '';
  $('om_date').value = item ? item.order_date : today();
  $('om_orderNo').value = item ? item.order_no : genOrderNo();

  // Agent dropdown
  var agHtml = '<option value="">（自己）</option>';
  agents.forEach(function(a) {
    var sel = item && item.agent_id === a.id ? ' selected' : '';
    agHtml += '<option value="' + a.id + '"' + sel + '>' + esc(a.name) + '</option>';
  });
  $('om_agent').innerHTML = agHtml;

  // Customer dropdown
  var cuHtml = '<option value="">（無）</option>';
  customers.forEach(function(c) {
    var sel = item && item.customer_id === c.id ? ' selected' : '';
    cuHtml += '<option value="' + c.id + '"' + sel + '>' + esc(c.name) + '</option>';
  });
  $('om_customer').innerHTML = cuHtml;

  // Product dropdown
  var prHtml = '<option value="">— 選擇商品 —</option>';
  products.filter(function(p) { return p.status === '啟用' }).forEach(function(p) {
    var sel = item && item.product_id === p.id ? ' selected' : '';
    prHtml += '<option value="' + p.id + '"' + sel + '>' + esc(p.platform) + ' ' + esc(p.version) + ' ' + esc(p.duration) + ' | NT$' + fmtN(p.price) + '</option>';
  });
  $('om_product').innerHTML = prHtml;

  $('om_qty').value = item ? item.qty : 1;
  $('om_unitPrice').value = item ? item.unit_price : '';
  $('om_unitCost').value = item ? item.unit_cost : '';
  $('om_status').value = item ? item.status : '處理中';
  $('om_expiry').value = item ? (item.expiry_date || '') : '';
  $('om_notes').value = item ? (item.notes || '') : '';

  if (item && item.product_id) calcOrderPreview();
  else $('orderPreview').innerHTML = '';

  openModal('orderModal');
}
function onProductSelect() {
  var pid = $('om_product').value;
  var p = products.filter(function(x) { return x.id === pid })[0];
  if (p) {
    $('om_unitPrice').value = p.price;
    $('om_unitCost').value = p.cost;
    // Auto-calc expiry
    var dur = p.duration || '';
    var months = parseInt(dur) || 0;
    if (months > 0) {
      var d = new Date($('om_date').value || today());
      d.setMonth(d.getMonth() + months);
      $('om_expiry').value = d.toISOString().slice(0, 10);
    }
    calcOrderPreview();
  }
}
function calcOrderPreview() {
  var qty = Number($('om_qty').value) || 1;
  var price = Number($('om_unitPrice').value) || 0;
  var cost = Number($('om_unitCost').value) || 0;
  var pid = $('om_product').value;
  var p = products.filter(function(x) { return x.id === pid })[0];
  var feeType = p ? p.fee_type : '百分比';
  var feeVal = p ? p.fee_value : 0;
  var fee = calcFee(price, feeType, feeVal) * qty;
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
    '<div class="row"><span class="lbl">手續費</span><span class="val">NT$' + fmtN(fee) + '</span></div>' +
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

  var obj = {
    order_date: $('om_date').value,
    order_no: $('om_orderNo').value,
    agent_id: agId,
    customer_id: $('om_customer').value || null,
    status: $('om_status').value,
    product_id: pid || null,
    platform: p ? p.platform : '',
    version: p ? p.version : '',
    duration: p ? p.duration : '',
    qty: Number($('om_qty').value) || 1,
    unit_price: Number($('om_unitPrice').value) || 0,
    unit_cost: Number($('om_unitCost').value) || 0,
    fee_type: p ? p.fee_type : '百分比',
    fee_value: p ? p.fee_value : 0,
    commission_type: ag ? ag.commission_type : '百分比',
    commission_value: ag ? ag.commission_value : 0,
    expiry_date: $('om_expiry').value || null,
    notes: $('om_notes').value.trim()
  };
  if (!obj.platform && !pid) return toast('請選擇商品', 'err');

  var id = $('om_id').value;
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
    agOrders.forEach(function(o) {
      var q = o.qty || 1;
      var rev = q * (o.unit_price || 0), cost = q * (o.unit_cost || 0);
      var fee = calcFee(o.unit_price || 0, o.fee_type, o.fee_value || 0) * q;
      var gross = rev - cost - fee;
      totalProfit += gross - calcCommission(gross, o.commission_type, o.commission_value || 0);
    });
    h += '<tr><td>' + esc(a.name) + '</td>' +
      '<td>' + a.commission_type + '</td>' +
      '<td>' + (a.commission_type === '百分比' ? fmtP(a.commission_value) : 'NT$' + fmtN(a.commission_value)) + '</td>' +
      '<td class="text-center">' + agOrders.length + '</td>' +
      '<td class="text-right ' + (totalProfit >= 0 ? 'text-green' : 'text-red') + '">NT$' + fmtN(totalProfit) + '</td>' +
      '<td>' + esc(a.notes || '') + '</td>' +
      '<td><div class="act-group">' +
        '<button class="act-btn edit" onclick="editAgent(\'' + a.id + '\')">編輯</button>' +
        '<button class="act-btn del" onclick="deleteAgent(\'' + a.id + '\')">刪除</button>' +
      '</div></td></tr>';
  });
  h += '</table>';
  $('agentList').innerHTML = h;
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
        '<button class="act-btn edit" onclick="editCustomer(\'' + c.id + '\')">編輯</button>' +
        '<button class="act-btn del" onclick="deleteCustomer(\'' + c.id + '\')">刪除</button>' +
      '</div></td></tr>';
  });
  h += '</table>';
  $('customerList').innerHTML = h;
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

/* ──── Utils ──── */
function esc(s) {
  if (!s) return '';
  var d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
