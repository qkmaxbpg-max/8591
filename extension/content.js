/* 8591 Order Import - Content Script
   Runs on 8591.com.tw pages to scrape order data.

   NOTE: The selectors below are best-guess patterns.
   After the user provides a screenshot of their seller backend,
   the selectors should be fine-tuned to match the actual DOM.
*/

// Listen for scan requests from popup
chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (msg.action === 'scan') {
    var orders = scanPage();
    sendResponse({ orders: orders });
  }
  return true; // keep channel open for async
});

function scanPage() {
  var orders = [];

  // Strategy 1: Try to find table rows (most seller backends use tables)
  var tables = document.querySelectorAll('table');
  tables.forEach(function(table) {
    var rows = table.querySelectorAll('tbody tr, tr');
    rows.forEach(function(tr) {
      var cells = tr.querySelectorAll('td');
      if (cells.length < 3) return; // skip header or tiny rows
      var order = parseTableRow(cells);
      if (order) orders.push(order);
    });
  });

  // Strategy 2: Try common card/list layouts
  if (orders.length === 0) {
    var items = document.querySelectorAll('[class*="order"], [class*="trade"], [class*="record"], [class*="item-list"]');
    items.forEach(function(el) {
      var order = parseCardItem(el);
      if (order) orders.push(order);
    });
  }

  // Strategy 3: Look for specific 8591 patterns
  if (orders.length === 0) {
    // 8591 trade list items
    var listItems = document.querySelectorAll('.trade-list .item, .order-list .item, .dataList .item, li[class*="item"]');
    listItems.forEach(function(el) {
      var order = parseCardItem(el);
      if (order) orders.push(order);
    });
  }

  return orders;
}

function parseTableRow(cells) {
  // Try to extract order data from table cells
  var texts = [];
  for (var i = 0; i < cells.length; i++) {
    texts.push(cells[i].textContent.trim());
  }
  var combined = texts.join(' ');

  // Must contain some price-like text (NT$ or numbers)
  var priceMatch = combined.match(/(?:NT\$?\s*|元\s*)([\d,]+)/);
  if (!priceMatch && !combined.match(/\d{3,}/)) return null;

  // Try to find date
  var dateMatch = combined.match(/(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/);

  // Try to find product name (look for known keywords)
  var platform = '';
  var knownPlatforms = ['YouTube', 'Netflix', 'Spotify', 'Discord', 'Nintendo', 'PlayStation', 'Xbox',
    'Steam', 'Apple', 'Google Play', 'Premium', 'Nitro', 'Game Pass', 'EA Play'];
  knownPlatforms.forEach(function(kw) {
    if (combined.toLowerCase().indexOf(kw.toLowerCase()) >= 0) platform = kw;
  });
  if (!platform) {
    // Use the longest text cell as product name
    var longest = '';
    texts.forEach(function(t) {
      if (t.length > longest.length && t.length < 100 && !/^\d+$/.test(t)) longest = t;
    });
    platform = longest;
  }

  var price = 0;
  if (priceMatch) {
    price = parseInt(priceMatch[1].replace(/,/g, '')) || 0;
  } else {
    // find largest number
    var nums = combined.match(/[\d,]+/g) || [];
    nums.forEach(function(n) {
      var v = parseInt(n.replace(/,/g, '')) || 0;
      if (v > price && v < 100000) price = v;
    });
  }

  if (!platform && !price) return null;

  return {
    order_date: dateMatch ? dateMatch[1].replace(/\//g, '-') : '',
    platform: platform.slice(0, 50),
    version: '',
    duration: '',
    qty: 1,
    unit_price: price,
    unit_cost: 0,
    buyer: ''
  };
}

function parseCardItem(el) {
  var text = el.textContent.trim();
  if (text.length < 5 || text.length > 2000) return null;

  var priceMatch = text.match(/(?:NT\$?\s*|金額[：:]\s*|售價[：:]\s*)([\d,]+)/);
  var dateMatch = text.match(/(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/);
  var buyerMatch = text.match(/買家[：:]\s*(\S+)/);

  if (!priceMatch) return null;

  // Extract product name
  var nameEl = el.querySelector('[class*="name"], [class*="title"], h3, h4, .item-name, .prod-name');
  var platform = nameEl ? nameEl.textContent.trim() : '';
  if (!platform) {
    // Take first meaningful line
    var lines = text.split('\n').map(function(l) { return l.trim() }).filter(function(l) { return l.length > 2 && l.length < 80 });
    platform = lines[0] || '';
  }

  return {
    order_date: dateMatch ? dateMatch[1].replace(/\//g, '-') : '',
    platform: platform.slice(0, 50),
    version: '',
    duration: '',
    qty: 1,
    unit_price: parseInt(priceMatch[1].replace(/,/g, '')) || 0,
    unit_cost: 0,
    buyer: buyerMatch ? buyerMatch[1] : ''
  };
}

// Add floating import button on 8591 pages
(function() {
  // Only show on pages that might have orders
  var path = window.location.pathname;
  if (path.indexOf('dashboard') >= 0 || path.indexOf('trade') >= 0 ||
      path.indexOf('order') >= 0 || path.indexOf('sell') >= 0 ||
      path.indexOf('record') >= 0 || path.indexOf('history') >= 0) {
    addFloatingButton();
  }
})();

function addFloatingButton() {
  var btn = document.createElement('div');
  btn.id = 'proxy-import-btn';
  btn.innerHTML = '📦 匯入訂單';
  btn.title = '掃描此頁面的訂單，匯入到代儲管理系統';
  document.body.appendChild(btn);

  btn.addEventListener('click', function() {
    var orders = scanPage();
    if (orders.length === 0) {
      showNotice('此頁面沒有找到訂單資料', 'err');
      return;
    }
    showNotice('找到 ' + orders.length + ' 筆訂單！請點擊擴充套件圖示匯入', 'ok');
    // Store for popup to use
    chrome.storage.local.set({ scannedOrders: orders });
  });
}

function showNotice(msg, type) {
  var existing = document.getElementById('proxy-notice');
  if (existing) existing.remove();

  var div = document.createElement('div');
  div.id = 'proxy-notice';
  div.className = 'proxy-notice ' + type;
  div.textContent = msg;
  document.body.appendChild(div);
  setTimeout(function() { div.remove() }, 3000);
}
