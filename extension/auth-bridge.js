/* Auth Bridge - Runs on the proxy management app page
   Listens for auth token from the app and stores it in chrome.storage
   so the extension popup can use it to import orders to Supabase */

window.addEventListener('message', function(event) {
  if (event.source !== window || event.origin !== 'https://qkmaxbpg-max.github.io') return;
  var data = event.data;
  if (!data || data.type !== 'PROXY_AUTH') return;
  if (typeof data.token !== 'string' || data.token.length > 8192 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(data.token)) return;
  if (typeof data.userId !== 'string' || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(data.userId)) return;
  chrome.storage.local.set({supabase_token: data.token, supabase_user_id: data.userId});
});
