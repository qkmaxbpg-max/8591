/* 8591 Order Import - Content Script
   Scans 8591 seller backend order pages.
   Each order block structure:
     買家：No.XXXXXXX   商品編號：sXXXXXXXXXX   下單時間：YYYY-MM-DD HH:MM:SS
     [代儲] product title   xQTY   $PRICE   STATUS
     Category/Type
     品項：item details
*/

chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (msg.action === 'scan') {
    var orders = scanPage();
    sendResponse({ orders: orders });
  }
  return true;
});

function scanPage() {
  // Get the full page text and split into order blocks
  // Each block starts with "買家：No."
  var body = document.body.innerText;
  var blocks = body.split(/(?=買家：No\.)/);
  var orders = [];

  blocks.forEach(function(block) {
    if (block.indexOf('買家：No.') !== 0) return;
    var o = parseOrderBlock(block);
    if (o) orders.push(o);
  });

  // Fallback: try DOM-based approach
  if (orders.length === 0) {
    orders = scanDOM();
  }

  return orders;
}

function parseOrderBlock(block) {
  var lines = block.split('\n').map(function(l) { return l.trim() }).filter(function(l) { return l.length > 0 });

  // 1. Extract date: 下單時間：YYYY-MM-DD HH:MM:SS
  var dateMatch = block.match(/下單時間[：:]\s*(\d{4}-\d{2}-\d{2})/);
  var orderDate = dateMatch ? dateMatch[1] : '';

  // 2. Extract buyer: 買家：No.XXXXXXX
  var buyerMatch = block.match(/買家[：:]\s*No\.(\d+)/);
  var buyer = buyerMatch ? 'No.' + buyerMatch[1] : '';

  // 3. Extract price: $NNN (the selling price, usually colored/highlighted)
  var priceMatch = block.match(/\$\s*([\d,]+)/);
  var price = priceMatch ? parseInt(priceMatch[1].replace(/,/g, '')) : 0;

  // 4. Extract quantity: xN
  var qtyMatch = block.match(/x(\d+)/);
  var qty = qtyMatch ? parseInt(qtyMatch[1]) : 1;

  // 5. Extract category: "Discord Nitro/其他", "YouTube Premium/其他" etc.
  //    Pattern: ProductName/SubCategory on its own line
  var platform = '', version = '';
  var catMatch = block.match(/^([A-Za-z\s一-鿿]+(?:Premium|Nitro|Basic|Standard|Family|Plus|Pro)?[A-Za-z\s]*)\/([一-鿿\w]+)/m);
  if (catMatch) {
    platform = catMatch[1].trim();
  }

  // 6. Extract item details: 品項：details
  var itemMatch = block.match(/品項[：:]\s*(.+)/);
  if (itemMatch) {
    version = itemMatch[1].trim()
      .replace(/^[◆☆★●○▶►▪▸\s]+/, '') // remove leading symbols
      .replace(/\*\d+$/, '')            // remove trailing *1, *2
      .replace(/x\s*\d+$/, '')          // remove trailing x1, x2
      .trim();
  }

  // 7. Extract status
  var status = '已完成';
  if (block.indexOf('已完成') >= 0) status = '已完成';
  else if (block.indexOf('交易中') >= 0 || block.indexOf('處理中') >= 0) status = '處理中';
  else if (block.indexOf('已取消') >= 0) status = '已取消';
  else if (block.indexOf('已退款') >= 0) status = '已退款';

  // Must have at least price or platform
  if (!price && !platform) return null;

  return {
    order_date: orderDate,
    platform: platform || '未分類',
    version: version,
    duration: '',
    qty: qty,
    unit_price: price,
    unit_cost: 0,
    buyer: buyer,
    status: status
  };
}

/* DOM-based fallback: try finding order elements by structure */
function scanDOM() {
  var orders = [];

  // Try common 8591 container patterns
  var containers = document.querySelectorAll(
    '[class*="order"], [class*="trade"], [class*="record"], ' +
    '[class*="list-item"], [class*="dataList"], ' +
    'table tbody tr, .item-box, .order-box'
  );

  containers.forEach(function(el) {
    var text = el.innerText || '';
    if (text.indexOf('買家') < 0 && text.indexOf('下單時間') < 0) return;
    var o = parseOrderBlock(text);
    if (o) orders.push(o);
  });

  return orders;
}

/* Floating button on 8591 seller pages */
(function() {
  // Show on any 8591 page that might contain orders
  if (document.body.innerText.indexOf('買家：No.') >= 0 ||
      window.location.href.indexOf('dashboard') >= 0 ||
      window.location.href.indexOf('trade') >= 0 ||
      window.location.href.indexOf('order') >= 0 ||
      window.location.href.indexOf('record') >= 0) {
    addFloatingButton();
  }

  // Also watch for dynamic content loading (SPA)
  var observer = new MutationObserver(function() {
    if (document.body.innerText.indexOf('買家：No.') >= 0 && !document.getElementById('proxy-import-btn')) {
      addFloatingButton();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();

function addFloatingButton() {
  if (document.getElementById('proxy-import-btn')) return;
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
    // Store scanned orders for popup
    chrome.storage.local.set({ scannedOrders: orders });
    showNotice('找到 ' + orders.length + ' 筆訂單！點擊右上角擴充圖示查看', 'ok');
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
  setTimeout(function() { div.remove() }, 3500);
}
