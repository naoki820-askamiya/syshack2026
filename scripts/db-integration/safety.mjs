export function assertDisposableUrl(value, runId) {
  if (!/^[a-f0-9]{16}$/.test(runId ?? '')) throw new Error('Disposable run ID is required.');
  const url = new URL(value);
  if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1'
    || !/^\d+$/.test(url.port) || Number(url.port) < 1 || Number(url.port) > 65535
    || url.pathname !== `/kigen404_integration_${runId}`
    || url.username !== 'postgres' || !/^[a-f0-9]{32}$/.test(url.password)
    || url.search || url.hash) {
    throw new Error('Refusing a database outside the uniquely named loopback disposable run.');
  }
  return url;
}
