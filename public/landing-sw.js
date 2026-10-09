// Capture landing entries before an older SPA can replace their URL.
const landingEntry = (href) => {
  const url = new URL(href);
  return url.origin === self.location.origin &&
    ['maislouvor.com', 'www.maislouvor.com'].includes(url.hostname) &&
    (url.pathname === '/' || /^\/conheca(?:\/|$)/.test(url.pathname) || /^\/baixar(?:\/|$)/.test(url.pathname));
};
const initialLandingClients = self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  .then((windows) => new Map(windows.filter((client) => landingEntry(client.url))
    .map((client) => [client.id, client.url])));

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const initial = await initialLandingClients;
    await self.clients.claim();
    const windows = await self.clients.matchAll({ type: 'window' });
    windows.forEach((client) => {
      const target = initial.get(client.id) || (landingEntry(client.url) ? client.url : null);
      if (target) {
        // Navigation may depend on activation, so do not await it here.
        client.navigate(target).catch(() => {});
      }
    });
  })());
});
