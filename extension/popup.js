/* 8591 Order Import - Popup Script */
var scannedOrders = [];

var SUPABASE_URL = 'https://hpajiexvcmkidbgreaqy.supabase.co';
var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwYWppZXh2Y21raWRiZ3JlYXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMTY2NTQsImV4cCI6MjA5NDU5MjY1NH0.ZIxx-cJRHxLAv-TlPpjvFGBndzs-GE9ptZENh81AQQQ';

function fmtN(n) { return Number(n || 0).toLocaleString('zh-TW', { maximumFractionDigits: 0 }) }

// Check if we're on 8591
chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
  var tab = tabs[0];
  if (!tab || !tab.url || tab.url.indexOf('8591.com.tw') < 0) {
    document.getElementById('statusBar').textContent = '請先打開 8591 賣家後台頁面';
    document.getElementById('statusBar').className = 'status err';
    document.getElementById('btnScan').disabled = true;
  }
});

// Scan current page
document.getElementById('btnScan').addEventListener('click', function() {
  document.getElementById('statusBar').textContent = '掃描中...';
  document.getElementById('statusBar').className = 'status info';

  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    chrome.tabs.sendMessage(tabs[0].id, { action: 'scan' }, function(response) {
      if (chrome.runtime.lastError) {
        document.getElementById('statusBar').textContent = '掃描失敗：請重新整理 8591 頁面後再試';
        document.getElementById('statusBar').className = 'status err';
        return;
      }
      if (response && response.orders && response.orders.length > 0) {
        scannedOrders = response.orders;
        showResults();
      } else {
        document.getElementById('statusBar').textContent = '此頁面沒有找到訂單資料。請切到賣家後台的訂單/交易頁面。';
        document.getElementById('statusBar').className = 'status err';
      }
    });
  });
});

// Scan all pages (placeholder)
document.getElementById('btnScanAll').addEventListener('click', function() {
  document.getElementById('statusBar').textContent = '多頁掃描功能開發中...';
  document.getElementById('statusBar').className = 'status info';
});

function showResults() {
  document.getElementById('statusBar').textContent = '掃描完成！';
  document.getElementById('statusBar').className = 'status ok';
  document.getElementById('scanSection').style.display = 'none';
  document.getElementById('resultSection').style.display = '';
  document.getElementById('orderCount').textContent = scannedOrders.length + ' 筆';

  var total = 0;
  var listHtml = '';
  scannedOrders.forEach(function(o, i) {
    total += o.unit_price || 0;
    listHtml += '<div class="order-item">' +
      '<div class="name">' + esc(o.platform || '') + ' ' + esc(o.version || '') + '</div>' +
      '<div class="meta">' + (o.order_date || '') + ' · ' + (o.buyer || '買家未知') + '</div>' +
      '<div class="price">NT$' + fmtN(o.unit_price) + '</div>' +
      '</div>';
  });
  document.getElementById('totalAmount').textContent = 'NT$' + fmtN(total);
  document.getElementById('orderList').innerHTML = listHtml;
}

// Import to Supabase
document.getElementById('btnImport').addEventListener('click', function() {
  if (scannedOrders.length === 0) return;
  document.getElementById('btnImport').disabled = true;
  document.getElementById('btnImport').textContent = '匯入中...';

  // Get session from storage
  chrome.storage.local.get(['supabase_token', 'supabase_user_id'], function(data) {
    if (!data.supabase_token || !data.supabase_user_id) {
      // No stored session - open app for login
      document.getElementById('statusBar').textContent = '請先登入代儲管理系統，然後重試';
      document.getElementById('statusBar').className = 'status err';
      document.getElementById('btnImport').disabled = false;
      document.getElementById('btnImport').textContent = '📥 匯入到代儲管理系統';
      // Open app
      chrome.tabs.create({ url: 'https://qkmaxbpg-max.github.io/8591/' });
      return;
    }
    doImport(data.supabase_token, data.supabase_user_id);
  });
});

function doImport(token, userId) {
  var PLATFORM_FEE = 0.03;
  var rows = scannedOrders.map(function(o) {
    var d = o.order_date || new Date().toISOString().slice(0, 10);
    return {
      user_id: userId,
      order_date: d,
      order_no: d.replace(/-/g, '') + '-' + String(Math.floor(Math.random() * 100)).padStart(2, '0'),
      channel: '8591',
      status: '已完成',
      platform: o.platform || '',
      version: o.version || '',
      duration: o.duration || '',
      qty: o.qty || 1,
      unit_price: o.unit_price || 0,
      unit_cost: o.unit_cost || 0,
      fee_type: '百分比',
      fee_value: PLATFORM_FEE,
      commission_type: '百分比',
      commission_value: 0,
      notes: '從 8591 匯入' + (o.buyer ? ' | 買家: ' + o.buyer : '')
    };
  });

  fetch(SUPABASE_URL + '/rest/v1/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON,
      'Authorization': 'Bearer ' + token,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(rows)
  }).then(function(res) {
    if (res.ok) {
      document.getElementById('statusBar').textContent = '成功匯入 ' + rows.length + ' 筆訂單！';
      document.getElementById('statusBar').className = 'status ok';
      document.getElementById('btnImport').textContent = '✅ 匯入完成';
    } else {
      return res.json().then(function(err) {
        throw new Error(err.message || '匯入失敗');
      });
    }
  }).catch(function(err) {
    document.getElementById('statusBar').textContent = '匯入失敗：' + err.message;
    document.getElementById('statusBar').className = 'status err';
    document.getElementById('btnImport').disabled = false;
    document.getElementById('btnImport').textContent = '📥 匯入到代儲管理系統';
  });
}

// Clear
document.getElementById('btnClear').addEventListener('click', function() {
  scannedOrders = [];
  document.getElementById('resultSection').style.display = 'none';
  document.getElementById('scanSection').style.display = '';
  document.getElementById('statusBar').textContent = '等待掃描 8591 頁面...';
  document.getElementById('statusBar').className = 'status info';
});

function esc(s) {
  if (!s) return '';
  var d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
