const PRELOAD_LOG_MARKER = '// 2.3.x patch: electron-log is initialized by dist/main.js';
const LANGUAGE_SERVER_MARKER =
  '// 2.3.x patch: proxy is owned by proxy-runner.js on port 50999';

function stripPreloadLogInitialization(source) {
  if (source.includes(PRELOAD_LOG_MARKER)) return source;
  const replaced = source.replace(
    /^[ \t]*log\.initialize\(\{\s*preload:\s*true\s*\}\);[ \t]*$/m,
    PRELOAD_LOG_MARKER,
  );
  if (replaced === source) {
    throw new Error(
      'Unable to strip electron-log preload initialization: expected call was not found.',
    );
  }
  return replaced;
}

function removeLanguageServerProxyStartup(source) {
  if (source.includes(LANGUAGE_SERVER_MARKER)) return source;

  const start = source.indexOf('        let proxyPort;');
  const endMarker = "        const apiServerUrl = proxyPort ? `http://localhost:${proxyPort}` : 'https://generativelanguage.googleapis.com';";
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0 || !source.slice(start, end).includes('proxy_1.startProxy')) {
    throw new Error(
      'Unable to remove language-server proxy startup: expected startProxy block was not found.',
    );
  }

  const replacement = `        ${LANGUAGE_SERVER_MARKER}\n        const proxyPort = 50999;\n`;
  return source.slice(0, start) + replacement + source.slice(end);
}

module.exports = { stripPreloadLogInitialization, removeLanguageServerProxyStartup };
