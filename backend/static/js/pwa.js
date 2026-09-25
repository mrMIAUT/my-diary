
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js?v=57', {scope:'/'});
      reg.update();
      setTimeout(autoRegisterPhoneNotifications,300);
      setTimeout(handleNotificationDeepLink,450);
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.info('Є ПЛАН: service worker updated');
      });
    } catch (e) {
      console.warn('PWA service worker registration failed', e);
    }
  });
}
