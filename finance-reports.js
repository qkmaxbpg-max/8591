/* Management estimates, not statutory financial statements or tax reports. */
var financeReportMetric='all';
function financeReportPeriod(type){var end=today();$('financeReportStart').value=type==='year'?end.slice(0,4)+'-01-01':end.slice(0,7)+'-01';$('financeReportEnd').value=end;financeReportMetric='all';renderFinanceReports();}
function reportDays(start,end){return Math.round((Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000)+1;}
function reportSpread(amount,from,to,start,end){
  if(!from||!to||to<from)return null;
  var total=reportDays(from,to);if(!Number.isFinite(total)||total<=0)return null;
  function cumulative(date){if(date<from)return 0;if(date>=to)return amount;return Math.round(amount*reportDays(from,date)/total);}
  return cumulative(end)-cumulative(adShiftDate(start,-1));
}
function reportOrderPortion(amount,order,start,end){
  if(order.duration==='單次'||order.duration==='永久')return order.duration==='單次'?(ledgerInRange(order.order_date,start,end)?amount:0):null;
  return reportSpread(amount,order.start_date||order.order_date,order.expiry_date,start,end);
}
function financeOrderRefunds(state,order,asOf){return ledgerRows(state,'afterSales').filter(function(c){return c.action==='refund'&&c.order_id===String(order.id)&&c.date<=asOf;});}
function financeOrderRevenue(state,order,start,end){
  var gross=Math.round((order.qty||1)*(order.unit_price||0)*100),from=order.start_date||order.order_date;
  function cumulative(date){
    var cases=financeOrderRefunds(state,order,date),total=cases.reduce(function(s,c){return s+c.amount;},0);
    if(cases.some(function(c){return c.service_end&&c.service_end<=date;}))return gross-total;
    if(date<from)return 0;
    var earned=reportOrderPortion(gross,order,from,date);if(earned===null)return null;
    for(var c of cases){var reduction=reportOrderPortion(c.amount,order,from,date);if(reduction===null)return null;earned-=reduction;}
    return earned;
  }
  var a=cumulative(end),b=cumulative(adShiftDate(start,-1));return a===null||b===null?null:a-b;
}
function financeOrderCost(state,amount,order,start,end){
  var from=order.start_date||order.order_date;
  function cumulative(date){if(financeOrderRefunds(state,order,date).some(function(c){return c.service_end;}))return amount;if(date<from)return 0;return reportOrderPortion(amount,order,from,date);}
  var a=cumulative(end),b=cumulative(adShiftDate(start,-1));return a===null||b===null?null:a-b;
}
function financeOrderSupplier(state,order,start,end){
  var names=Array.from(new Set(state.purchases.filter(function(p){return !p.opening&&(p.order_id===String(order.id)||(p.mode==='shared'&&p.service_account_id&&p.service_account_id===String(order.service_account_id)&&p.service_start<=end&&p.service_end>=start));}).map(function(p){return p.supplier_name||'';}).filter(Boolean)));
  return names.length===1?names[0]:'';
}
function financeBuildReport(state,start,end){
  procurementValidateDate(start);procurementValidateDate(end);if(end<start||reportDays(start,end)>3660)throw new Error('日期區間不可顛倒或超過十年');if(end>today())throw new Error('此報表只看已發生期間，結束日期不可晚於今天');
  var originStart=start,financialStart=typeof financeStartDate==='function'?financeStartDate(state):'';
  if(financialStart&&end<financialStart)return {rows:[],warnings:['財務尚未起算：'+financialStart],revenue:0,cost:0,fee:0,expense:0,commission:0,compensation:0,net:0,cashIn:0,cashOut:0,refundPending:0,not_started:true};
  if(financialStart&&start<financialStart)start=financialStart;
  var rows=[],warnings=[],eligible=orders.filter(function(o){return ['已完成','已退款'].includes(o.status);});
  if(start!==originStart)warnings.push('本報表從財務起算日 '+start+' 開始計算，舊訂單保留');
  function push(type,date,title,amount,extra){if(amount)rows.push(Object.assign({type:type,date:date,title:title,amount:amount},extra||{}));}
  var shared=state.purchases.filter(function(p){return p.mode==='shared'&&!p.opening;});
  eligible.forEach(function(o){
    var gross=Math.round((o.qty||1)*(o.unit_price||0)*100),income=financeOrderRevenue(state,o,start,end),title=(o.order_no||'')+' · '+(o.platform||''),supplier=financeOrderSupplier(state,o,start,end);
    if(income===null){if(ledgerInRange(o.order_date,start,end))warnings.push(title+' 缺少可分攤期間，收入待確認');}
    else push('income',o.order_date,title,income,{order_id:String(o.id),platform:o.platform,channel:o.channel||'8591',supplier:supplier});
    var linked=state.purchases.filter(function(p){return p.order_id===String(o.id)&&!p.opening;});
    if(!linked.length){
      var isShared=!!o.service_account_id||state.defaults.some(function(d){return d.product_id===String(o.product_id)&&d.mode==='shared';});
      if(isShared){if(!shared.some(function(p){return String(p.service_account_id)===String(o.service_account_id);})&&income)warnings.push(title+' 共用月費尚未登記，成本未完整');}
      else {var estimate=financeOrderCost(state,Math.round((o.qty||1)*(o.unit_cost||0)*100),o,start,end);if(estimate)push('cost',o.order_date,title+'（沿用訂單成本，待實際採購）',estimate,{estimated:true,platform:o.platform,channel:o.channel||'8591',supplier:supplier});}
    }
    if(ledgerInRange(o.order_date,start,end)){
      var feeRate=o.fee_value!==null&&o.fee_value!==undefined&&o.fee_value!==''&&Number.isFinite(Number(o.fee_value))?Number(o.fee_value):null;
      if(feeRate===null){warnings.push(title+' 缺交易手續費快照，暫未列費用');return;}
      var fee=o.fee_type==='固定金額'?Math.round(feeRate*(o.qty||1)*100):Math.round(gross*feeRate);
      push('fee',o.order_date,title+' 手續費',fee,{channel:o.channel||'8591',platform:o.platform,supplier:supplier});
      var commission=typeof calcCommission==='function'?Math.round(calcCommission((gross-Math.round((o.qty||1)*(o.unit_cost||0)*100)-fee)/100,o.commission_type||'百分比',Number(o.commission_value)||0)*100):0;
      push('commission',o.order_date,title+' 出單人抽成',Math.max(0,commission),{platform:o.platform,channel:o.channel||'8591',supplier:supplier});
    }
  });
  state.purchases.filter(function(p){return !p.opening;}).forEach(function(p){
    var order=orders.find(function(o){return String(o.id)===p.order_id;});
    var cost=p.mode==='shared'?reportSpread(p.amount,p.service_start,p.service_end,start,end):order?financeOrderCost(state,p.amount,order,start,end):(ledgerInRange(p.date,start,end)?p.amount:0);
    if(cost===null){warnings.push('採購 '+p.title+' 期間不明，成本待確認');return;}
    var account=typeof serviceAccounts!=='undefined'&&serviceAccounts.find(function(a){return String(a.id)===String(p.service_account_id);});
    push('cost',p.date,p.title+(p.mode==='shared'?'（共用帳號整體成本，含空置）':''),cost,{supplier:p.supplier_name,platform:order?order.platform:account?account.platform:'未對應商品',channel:order?order.channel||'8591':''});
  });
  ledgerRows(state,'platformMonths').forEach(function(m){
    var monthEnd=adMonthEnd(m.month);if(start<=m.month+'-01'&&end>=monthEnd){
      var estimated=rows.filter(function(r){return r.type==='fee'&&r.channel===m.platform&&r.date.slice(0,7)===m.month;}).reduce(function(sum,r){return sum+r.amount;},0);
      push('fee',monthEnd,m.platform+' 月結實際費用差額',m.fees-estimated,{channel:m.platform});
    }
    if(ledgerInRange(monthEnd,start,end)&&m.difference)warnings.push(m.platform+' '+m.month+' 撥款尚有差異未核對');
    if(ledgerInRange(monthEnd,start,end)&&m.refunds)warnings.push(m.platform+' '+m.month+' 平台退款認列需確認，未重複計銀行退付');
  });
  ledgerRows(state,'cashEntries').filter(function(e){return ledgerInRange(e.date,start,end);}).forEach(function(e){if(e.kind==='expense')push('expense',e.date,e.note,e.amount);if(e.kind==='compensation')push('compensation',e.date,e.note,e.amount);});
  ledgerRows(state,'supplierCredits').filter(function(c){return c.kind==='compensation'&&ledgerInRange(c.date,start,end);}).forEach(function(c){push('compensation',c.date,c.note+'（廠商貨款餘額，非現金）',c.amount);});
  var refundCases=ledgerRows(state,'afterSales').filter(function(c){return c.action==='refund'&&ledgerInRange(c.date,start,end);});
  if(refundCases.length)warnings.push('本期退款案件已調整服務收入；仍提供服務的退款按原期間折讓，填寫終止日則於案件日結清剩餘收入與個別成本。實際退付另列金流，不重複扣損益');
  var sum=function(type){return rows.filter(function(r){return r.type===type;}).reduce(function(s,r){return s+r.amount;},0);};
  var revenue=sum('income'),cost=sum('cost'),fee=sum('fee'),expense=sum('expense'),commission=sum('commission'),compensation=sum('compensation');
  var cashIn=0,cashOut=0;
  state.payments.filter(function(p){return ledgerInRange(p.date,start,end)&&state.accounts.some(function(a){return a.id===p.account_id&&a.kind==='bank';});}).forEach(function(p){cashOut+=p.amount;});
  ledgerRows(state,'cashEntries').filter(function(e){return ledgerInRange(e.date,start,end)&&state.accounts.some(function(a){return a.id===e.account_id&&a.kind==='bank';});}).forEach(function(e){if(['receipt','compensation','capital_in'].includes(e.kind))cashIn+=e.amount;else cashOut+=e.amount;});
  ledgerRows(state,'transfers').filter(function(t){return t.kind==='card_repayment'&&ledgerInRange(t.date,start,end);}).forEach(function(t){cashOut+=t.amount;});
  return {rows:rows,warnings:Array.from(new Set(warnings)),revenue:revenue,cost:cost,fee:fee,expense:expense,commission:commission,compensation:compensation,net:revenue-cost-fee-expense-commission+compensation,cashIn:cashIn,cashOut:cashOut,refundPending:refundCases.filter(function(c){return !c.paid_at;}).reduce(function(s,c){return s+c.amount;},0)};
}
function reportMetric(type){financeReportMetric=type;renderFinanceReports();}
function financeRiskSummary(state,asOf){
  var active=orders.filter(function(o){return o.status==='已完成'&&(o.start_date||o.order_date)<=asOf&&o.expiry_date>=asOf&&!financeOrderRefunds(state,o,asOf).some(function(c){return c.service_end;});}),deferred=0;
  active.forEach(function(o){var gross=Math.round((o.qty||1)*(o.unit_price||0)*100),refund=financeOrderRefunds(state,o,asOf).reduce(function(s,c){return s+c.amount;},0),earned=financeOrderRevenue(state,o,o.start_date||o.order_date,asOf);if(earned!==null)deferred+=Math.max(0,gross-refund-earned);});
  var due=function(days){return active.filter(function(o){return o.expiry_date<=adShiftDate(asOf,days);}).length;};
  return '<h3 class="finance-section">訂閱與服務風險</h3><p class="hint">截至 '+esc(asOf)+'；未履約售價按期間估算，不等於應退款，也不是可自由動用的獲利。換帳號與補天數仍保留在售後案件中。</p><div class="stat-cards">'+statCard('有效服務',String(active.length),'已完成且仍在服務期間')+statCard('30 天內到期',String(due(30)),'包含今天到期')+statCard('90 天內到期',String(due(90)),'包含 30 天內')+statCard('尚未履約售價估算','NT$'+fmtN(deferred/100),'已扣登記退款；不以此自動決定退款金額')+'</div>';
}
function financeCsvCell(value){if(typeof value==='number')return String(value);var text=String(value==null?'':value);if(/^[\s]*[=+\-@\t\r]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';}
function financeRanking(report){
  var grouped={};report.rows.forEach(function(row){if(!['income','cost','fee','commission'].includes(row.type))return;var key=row.platform||'未分攤至商品';if(!grouped[key])grouped[key]={revenue:0,cost:0,fees:0};if(row.type==='income')grouped[key].revenue+=row.amount;else if(row.type==='cost')grouped[key].cost+=row.amount;else grouped[key].fees+=row.amount;});
  var productsTable='<h3>商品貢獻試算</h3><p class="hint">收入已依售後案件調整，再扣成本、已分派手續費與抽成；未扣共通及未分攤費用，不是商品最終淨利。</p><div class="table-scroll"><table><thead><tr><th>商品</th><th class="text-right">收入</th><th class="text-right">成本</th><th class="text-right">貢獻試算</th></tr></thead><tbody>'+Object.keys(grouped).sort(function(a,b){return (grouped[b].revenue-grouped[b].cost-grouped[b].fees)-(grouped[a].revenue-grouped[a].cost-grouped[a].fees);}).map(function(name){var row=grouped[name];return '<tr><td>'+esc(name)+'</td><td class="text-right">'+fmtN(row.revenue/100)+'</td><td class="text-right">'+fmtN(row.cost/100)+'</td><td class="text-right">'+fmtN((row.revenue-row.cost-row.fees)/100)+'</td></tr>';}).join('')+'</tbody></table></div>';
  var suppliers={};report.rows.filter(function(r){return r.type==='cost'&&r.supplier;}).forEach(function(r){suppliers[r.supplier]=(suppliers[r.supplier]||0)+r.amount;});
  function contribution(field,title,unknown){var map={};report.rows.filter(function(r){return ['income','cost','fee','commission'].includes(r.type);}).forEach(function(r){var key=r[field]||unknown;if(!map[key])map[key]={income:0,cost:0,fees:0};if(r.type==='income')map[key].income+=r.amount;else if(r.type==='cost')map[key].cost+=r.amount;else map[key].fees+=r.amount;});return '<h3 class="finance-section">'+title+'</h3><div class="table-scroll"><table><thead><tr><th>'+title.replace('貢獻比較','')+'</th><th class="text-right">服務收入</th><th class="text-right">成本</th><th class="text-right">費用／抽成</th><th class="text-right">貢獻試算</th></tr></thead><tbody>'+Object.keys(map).sort(function(a,b){return (map[b].income-map[b].cost-map[b].fees)-(map[a].income-map[a].cost-map[a].fees);}).map(function(name){var r=map[name];return '<tr><td>'+esc(name)+'</td><td class="text-right">'+fmtN(r.income/100)+'</td><td class="text-right">'+fmtN(r.cost/100)+'</td><td class="text-right">'+fmtN(r.fees/100)+'</td><td class="text-right">'+fmtN((r.income-r.cost-r.fees)/100)+'</td></tr>';}).join('')+'</tbody></table></div>';}
  return productsTable+'<p class="hint finance-section">下列比較尚未扣共同營業費用。貨源依已登記採購歸屬，不用目前商品預設倒推舊訂單；無法歸屬與共用月費的跨管道成本另列，避免假裝精準。</p>'+contribution('channel','銷售管道貢獻比較','未分攤管道成本／費用')+contribution('supplier','貨源貢獻比較','未對應貨源');
}
function exportFinanceReport(){
  try{var start=$('financeReportStart').value,end=$('financeReportEnd').value,report=financeBuildReport(procurementState,start,end);
    var table=[['營運管理試算，非正式財報',start,end],['類型','日期','摘要','台幣金額']].concat(report.rows.map(function(r){return [r.type,r.date,r.title,r.amount/100];}),[['試算結果',report.net/100],['銀行實收',report.cashIn/100],['銀行實付',report.cashOut/100]],report.warnings.map(function(w){return ['待確認',w];}));
    var blob=new Blob(['\uFEFF'+table.map(function(row){return row.map(financeCsvCell).join(',');}).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='財務管理試算-'+start+'-'+end+'.csv';link.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);
  }catch(e){toast(e.message,'err');}
}
function exportFinanceBackup(){
  if(procurementState.invalid)return toast('資料異常，請先保留瀏覽器原始儲存資料','err');
  var fields=['id','order_no','order_date','start_date','expiry_date','platform','version','duration','qty','unit_price','unit_cost','product_id','channel','status','fee_type','fee_value','commission_type','commission_value','service_account_id'];
  var references=orders.map(function(order){var row={};fields.forEach(function(key){if(order[key]!==undefined)row[key]=order[key];});return row;});
  var blob=new Blob([JSON.stringify({notice:'財務資料匯出，含報表所需訂單快照；非完整網站或資料庫備份，請保存在私人位置',exported_at:new Date().toISOString(),report_model:'management-inclusive-day-v1',procurement:procurementState,order_references:references},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='財務資料匯出-'+today()+'.json';link.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);
}
function renderFinanceReports(){
  if(!$('financeReportStats')||procurementState.invalid)return;
  if(typeof window!=='undefined'&&window.financeDatabaseEnabled&&!financeStartDate(procurementState)){
    $('financeReportStats').innerHTML='<article class="card"><h3>先設定這套帳的起算日</h3><p class="hint">舊訂單會保留；不把過去未記錄的收付款猜成銀行餘額。設定起算日及各帳戶期初後，即可開始記帳。</p><button class="btn primary" onclick="openFinanceStart()">設定財務起算日</button></article>';
    ['financeCashStats','financeReportDetails','financeTrend','financeRankings','financeReportWarnings'].forEach(function(id){$(id).innerHTML='';});return;
  }
  if(!$('financeReportStart').value)$('financeReportStart').value=today().slice(0,7)+'-01';if(!$('financeReportEnd').value)$('financeReportEnd').value=today();
  try{var start=$('financeReportStart').value,end=$('financeReportEnd').value,report=financeBuildReport(procurementState,start,end),labels={income:'服務收入分攤',cost:'商品成本',fee:'手續費',commission:'出單人抽成',expense:'營業費用',compensation:'供應商補償'};
    if(report.not_started){$('financeReportStats').innerHTML='<p class="hint">'+esc(report.warnings[0])+'</p>';['financeCashStats','financeReportDetails','financeTrend','financeRankings'].forEach(function(id){$(id).innerHTML='';});$('financeReportWarnings').textContent=report.warnings[0];return;}
    $('financeReportStats').innerHTML=[['income',report.revenue],['cost',report.cost],['expense',report.expense],['fee',report.fee],['compensation',report.compensation]].map(function(item){return '<button class="finance-metric" onclick="reportMetric(\''+item[0]+'\')"><span>'+labels[item[0]]+'</span><strong>NT$'+fmtN(item[1]/100)+'</strong><small>點擊查看明細</small></button>';}).join('')+'<button class="finance-metric" onclick="reportMetric(\'all\')"><span>經營損益試算</span><strong class="'+(report.net<0?'text-red':'text-green')+'">NT$'+fmtN(report.net/100)+'</strong><small>'+(report.warnings.length?'有待確認資料，非定案':'管理分攤假設，非正式認列')+'</small></button>';
    $('financeReportWarnings').innerHTML='<p class="hint">長期服務按起迄日（含迄日）分攤，單次按交付日；永久或缺期間資料不猜認列。共用月費只計一次，包含空置成本。沒有採購的普通訂單暫沿用原訂單成本；不重複加採購成本。費用與手續費按發生日／整月核定額列計，尚非正式會計認列。</p>'+report.warnings.map(function(w){return '<p class="hint text-yellow">'+esc(w)+'</p>';}).join('');
    $('financeCashStats').innerHTML=statCard('銀行實際流入','NT$'+fmtN(report.cashIn/100),'含業主投入，與營業收入分開')+statCard('銀行實際流出','NT$'+fmtN(report.cashOut/100),'含採購、費用、退款、提領與實繳卡費')+statCard('銀行淨流量','NT$'+fmtN((report.cashIn-report.cashOut)/100),'銀行間轉帳不重複計入')+statCard('本期案件待退款','NT$'+fmtN(report.refundPending/100),'僅所選日期建立的退款案件');
    if(!['cashEntries','payments','purchases','transfers','platformMonths'].some(function(k){return ledgerRows(procurementState,k).length;})) $('financeCashStats').innerHTML=statCard('實際收付款','尚未建立','尚未登記金流資料，不能判斷帳戶餘額或未付款')+'<p class="hint">請先設定帳戶期初，再從日常記帳登記交易；商品與訂單資料不等於銀行收付款紀錄。</p>';
    $('financeReportDetails').innerHTML='<h3>'+esc(financeReportMetric==='all'?'全部試算明細':labels[financeReportMetric])+'</h3><div class="table-scroll"><table><thead><tr><th>來源日期</th><th>類型</th><th>摘要</th><th class="text-right">本區間分攤金額</th></tr></thead><tbody>'+report.rows.filter(function(r){return financeReportMetric==='all'||r.type===financeReportMetric;}).map(function(r){return '<tr><td>'+esc(r.date)+'</td><td>'+esc(labels[r.type])+'</td><td>'+esc(r.title)+'</td><td class="text-right">'+fmtN(r.amount/100)+'</td></tr>';}).join('')+'</tbody></table></div>';
    $('financeRankings').innerHTML=financeRanking(report)+financeRiskSummary(procurementState,end);
    var trend=[];for(var i=5;i>=0;i--){var d=new Date(end+'T00:00:00Z');d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-i);var month=d.toISOString().slice(0,7),r=financeBuildReport(procurementState,month+'-01',adMonthEnd(month)<today()?adMonthEnd(month):today());trend.push({month:month,income:r.revenue,net:r.net});}
    var max=Math.max(1,...trend.map(function(r){return Math.max(r.income,Math.abs(r.net));}));
    $('financeTrend').innerHTML='<h3>最近六個月趨勢（管理試算）</h3><div class="finance-trend">'+trend.map(function(r){return '<div><strong>'+esc(r.month)+'</strong><div class="finance-bar" style="width:'+Math.max(1,Math.round(r.income/max*100))+'%"></div><small>收入 '+fmtN(r.income/100)+' · 損益 '+fmtN(r.net/100)+'</small></div>';}).join('')+'</div>';
  }catch(e){$('financeReportWarnings').textContent=e.message;$('financeReportStats').innerHTML='';$('financeCashStats').innerHTML='';$('financeReportDetails').innerHTML='';$('financeTrend').innerHTML='';$('financeRankings').innerHTML='';}
}
