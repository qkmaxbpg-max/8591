/* Auth Bridge - Runs on the proxy management app page
   Listens for auth token from the app and stores it in chrome.storage
   so the extension popup can use it to import orders to Supabase */

window.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'PROXY_AUTH') {
    chrome.storage.local.set({
      supabase_token: event.data.token,
      supabase_user_id: event.data.userId
    }, function() {
      console.log('[8591匯入] 已同步登入資訊到擴充套件');
    });
  }
});
