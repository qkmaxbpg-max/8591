/* Local-only advertising history prototype. Not a production database schema. */
function adShiftDate(value, days) {
  var d = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(d.getTime())) throw new Error('日期格式不正確');
  d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0,10);
}
function adPeriods(c) {
  if (Array.isArray(c.preview_periods)) return c.preview_periods;
  if (!c.active && !c.end_date) return []; // Unknown pause date: never invent it.
  return [{start:c.start_date,end:c.end_date || null,rate:Number(c.daily_cost) || 0}];
}
function adNeedsReview(c) { return !Array.isArray(c.preview_periods) && !c.active && !c.end_date; }
function adActualOn(platform, date) {
  return ads.some(function(a) { return (a.ad_platform || '其他') === (platform || '其他') && a.ad_date === date; });
}
function adPeriodCost(c, start, end) {
  var total = 0, cap = end < today() ? end : today();
  adPeriods(c).forEach(function(p) {
    var from = p.start > start ? p.start : start;
    var to = p.end && p.end < cap ? p.end : cap;
    if (!from || from > to) return;
    for (var date = from; date <= to; date = adShiftDate(date,1)) {
      if (!adActualOn(c.platform,date)) total += Number(p.rate) || 0;
    }
  });
  return Math.round(total * 100) / 100;
}
function calcAdConfigCostRange(start, end) { return adConfigs.reduce(function(sum,c) { return sum + adPeriodCost(c,start,end); },0); }
function adMonthEnd(ym) { var parts=ym.split('-'); return new Date(Date.UTC(Number(parts[0]),Number(parts[1]),0)).toISOString().slice(0,10); }
function calcAdConfigCost(ym) { return calcAdConfigCostRange(ym+'-01',adMonthEnd(ym)); }
function adSpendCovered() { return false; } // Actual records are never silently discarded.
function monthAds(ym) {
  return calcAdConfigCost(ym) + ads.filter(function(a) { return (a.ad_date || '').slice(0,7) === ym && a.ad_date <= today(); }).reduce(function(sum,a) { return sum + (Number(a.amount) || 0); },0);
}
function adConfigDaysInMonth(c, ym) {
  var days = 0;
  adPeriods(c).forEach(function(p) {
    var start = p.start > ym+'-01' ? p.start : ym+'-01';
    var end = p.end && p.end < today() ? p.end : today();
    if (end > adMonthEnd(ym)) end = adMonthEnd(ym);
    if (start && start <= end) days += Math.round((Date.parse(end+'T00:00:00Z') - Date.parse(start+'T00:00:00Z')) / 86400000)+1;
  });
  return days;
}
function adConfigStatus(c) {
  if (adNeedsReview(c)) return {label:'待補暫停日期',cls:'badge inactive'};
  if (!c.active) return {label:'已暫停',cls:'badge inactive'};
  var periods = adPeriods(c), latest = periods[periods.length-1];
  if (latest && latest.start > today()) return {label:'排程中',cls:'badge inactive'};
  if (latest && latest.end && latest.end < today()) return {label:'已結束',cls:'badge inactive'};
  return {label:'投放中',cls:'badge active'};
}
function adPause(c, date) {
  if (adNeedsReview(c)) throw new Error('請先補上原暫停日期');
  var next = JSON.parse(JSON.stringify(c));
  next.preview_periods = adPeriods(c).map(function(p) { return {start:p.start,end:p.start > date ? adShiftDate(p.start,-1) : !p.end || p.end > date ? date : p.end,rate:p.rate}; });
  next.active=false; return next;
}
function adResume(c, date) {
  if (adNeedsReview(c)) throw new Error('請先編輯補上原暫停日期，再恢復');
  var next=JSON.parse(JSON.stringify(c)), periods=adPeriods(c).map(function(p) {return Object.assign({},p);});
  var last=periods[periods.length-1], start=date;
  if (last && last.end && last.end >= start) start=adShiftDate(last.end,1);
  if (c.end_date && c.end_date < start) throw new Error('原定結束日期已過，請新增廣告設定');
  periods.push({start:start,end:c.end_date || null,rate:Number(c.daily_cost)});
  next.preview_periods=periods;next.active=true;return next;
}
async function toggleAdConfig(id) {
  if (!isDemo&&(typeof window==='undefined'||!window.operationsDatabaseEnabled)) return toast('廣告資料庫尚未就緒','err');
  var idx=adConfigs.findIndex(function(c){return String(c.id)===String(id);}); if(idx<0)return;
  try {
    var original=adConfigs[idx];var changed=original.active ? adPause(original,today()) : adResume(original,today());
    if(!isDemo){await operationsSaveAd(changed,original);return;}
    adConfigs[idx]=changed;
    demoSave();renderAll();toast(adConfigs[idx].active?'已建立新投放期間；同一天不重複計費':'已暫停，今天計費，明天起不再累計','ok');
  } catch(e) {toast(e.message,'err');}
}
async function saveAdConfig() {
  if (!isDemo&&(typeof window==='undefined'||!window.operationsDatabaseEnabled)) return toast('廣告資料庫尚未就緒','err');
  var inst=cdropInstances.adc_platformDrop;
  var platform=(inst ? inst.state.text : $('adc_platform').value).trim();
  var rate=Number($('adc_daily').value), start=dpGetVal('adc_start'), end=$('adc_noend').checked?null:dpGetVal('adc_end');
  if(!platform || !$('adc_daily').value.trim() || !Number.isFinite(rate) || rate<=0)return toast('請填寫平台與大於零的每日金額','err');
  if(!start || (!$('adc_noend').checked && !end) || (end && end<start))return toast('請確認開始與結束日期','err');
  var id=$('adc_id').value, old=adConfigs.find(function(c){return String(c.id)===String(id);}), next;
  if(id && !old)return toast('找不到原廣告設定','err');
  if(old) {
    if(platform!==old.platform || start!==old.start_date)return toast('為保留歷史，平台與原開始日不可修改；請另建設定','err');
    if(end && end<today() && end!==old.end_date && !adNeedsReview(old))return toast('不回溯修改已發生期間；請保留日期並暫停，或另行核對歷史紀錄','err');
    next=JSON.parse(JSON.stringify(old));
    var periods=adPeriods(old).map(function(p){return Object.assign({},p);});
    if(adNeedsReview(old)) {
      if(!end || end>today())return toast('舊暫停資料請填入實際暫停日期（不可晚於今天）','err');
      if(rate!==Number(old.daily_cost))return toast('補暫停日期時請保留原每日金額','err');
      periods=[{start:start,end:end,rate:rate}];
    } else if(old.active) {
      var last=periods[periods.length-1];
      if(last && last.end && last.end<today())return toast('此設定已結束；請新增廣告設定','err');
      if(last) {
        if(rate!==Number(old.daily_cost) && last.start<today()) {
          last.end=adShiftDate(today(),-1);periods.push({start:today(),end:end,rate:rate});
        } else {last.rate=rate;last.end=end;}
      }
    }
    next.preview_periods=periods;next.daily_cost=rate;next.end_date=end;next.notes=$('adc_notes').value.trim();
    adConfigs[adConfigs.indexOf(old)]=next;
  } else {
    next={id:isDemo?'ad-preview-'+Date.now()+'-'+Math.random().toString(16).slice(2):crypto.randomUUID(),platform:platform,daily_cost:rate,start_date:start,end_date:end,notes:$('adc_notes').value.trim(),active:true,store_id:storeId,preview_periods:[{start:start,end:end,rate:rate}]};
    adConfigs.unshift(next);
  }
  if(!isDemo){try{await operationsSaveAd(next,old);}catch(e){if(old)adConfigs[adConfigs.indexOf(next)]=old;else adConfigs=adConfigs.filter(function(c){return c.id!==next.id;});toast(e.message,'err');}return;}
  demoSave();closeModal();renderAll();toast('已儲存，歷史費率與暫停狀態保留','ok');
}
function renderAds() {
  var all=mpIsAll('mpExp'),year=mpIsYear('mpExp'),ym=mpGetYM('mpExp'),yy=mpGetYear('mpExp');
  var start=all?'0001-01-01':year?yy+'-01-01':ym+'-01',end=all?today():year?yy+'-12-31':adMonthEnd(ym);
  var estimate=calcAdConfigCostRange(start,end), actual=ads.filter(function(a){return a.ad_date>=start && a.ad_date<=end && a.ad_date<=today();}).reduce(function(sum,a){return sum+(Number(a.amount)||0);},0);
  var unknown=adConfigs.filter(adNeedsReview).length;
  $('expStatCards').innerHTML=statCard('已登記費用＋其餘日期估算','NT$'+fmtN(actual+estimate),unknown?'有 '+unknown+' 筆待核對，合計不完整':'非平台帳單核對結果','red')+statCard('已登記單筆費用','NT$'+fmtN(actual),'同平台同日以單筆費用取代按日估算')+statCard('其餘日期估算','NT$'+fmtN(estimate),'依各投放期間與當時費率');
  var h='<p class="hint">暫停當天計費，次日起停止；同日恢復則從次日續算。改價自今天生效，先前費率保留。單筆費用視為該平台當日實際合計，取代該日所有按日估算；若不是完整日費用，請先核對再登記。廣告估算與實際付款分開登記。</p>';
  adConfigs.forEach(function(c){
    var status=adConfigStatus(c),periods=adPeriods(c);
    h+='<div class="card"><div class="card-head"><h3>'+esc(c.platform)+'</h3><span class="'+status.cls+'">'+status.label+'</span></div><div style="padding:16px"><p>目前每日 NT$'+fmtN(c.daily_cost)+' · 本期估算 NT$'+fmtN(adPeriodCost(c,start,end))+'</p>';
    if(adNeedsReview(c))h+='<p class="hint text-red">缺少暫停日期，本筆暫不列入估算。請編輯補日期；未核對前總額不完整。</p>';
    h+='<div class="table-scroll"><table><thead><tr><th>開始</th><th>結束（含當日）</th><th class="text-right">當時每日金額</th></tr></thead><tbody>';
    periods.forEach(function(p){if(p.end && p.end<p.start)return;h+='<tr><td>'+esc(p.start)+'</td><td>'+esc(p.end||'持續投放')+'</td><td class="text-right">NT$'+fmtN(p.rate)+'</td></tr>';});
    h+='</tbody></table></div><p class="order-detail-note">'+esc(c.notes||'')+'</p><div class="act-group"><button class="btn sm ghost" data-action="toggleAdConfig" data-id="'+productAttr(c.id)+'">'+(c.active?'暫停':'恢復')+'</button><button class="btn sm ghost" data-action="editAdConfig" data-id="'+productAttr(c.id)+'">編輯</button></div></div></div>';
  });
  if(!adConfigs.length)h+='<div class="empty">尚無廣告設定，請新增虛構廣告試用。</div>';
  $('adConfigList').innerHTML=h;
  var rows=ads.filter(function(a){return a.ad_date>=start && a.ad_date<=end;});
  $('adSpendList').innerHTML=rows.length?'<h4>已登記單筆費用</h4><div class="table-scroll"><table><thead><tr><th>日期</th><th>平台</th><th class="text-right">金額</th></tr></thead><tbody>'+rows.map(function(a){return '<tr><td>'+esc(a.ad_date)+'</td><td>'+esc(a.ad_platform||'其他')+'</td><td class="text-right">NT$'+fmtN(a.amount)+'</td></tr>';}).join('')+'</tbody></table></div>':'';
}
