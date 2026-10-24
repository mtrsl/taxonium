const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://tiles.openfreemap.org",
  "connect-src 'self' https://tiles.openfreemap.org https://*.openfreemap.org",
  "worker-src 'self' blob:",
  "child-src blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

function resolveRequestPath(root, rawPathname) {
  let pathname;
  try {
    pathname = decodeURIComponent(rawPathname);
  } catch {
    return { error: 400 };
  }
  if (pathname.includes("\\") || pathname.includes("\0")) return { error: 400 };

  const resolvedRoot = path.resolve(root);
  let candidate = path.resolve(resolvedRoot, `.${pathname}`);
  const relative = path.relative(resolvedRoot, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return { error: 403 };
  if (pathname.endsWith("/")) candidate = path.join(candidate, "index.html");
  return { candidate };
}

function createRendererServer({ rendererRoot, host = "127.0.0.1", port = 0 }) {
  const root = path.resolve(rendererRoot);
  const indexPath = path.join(root, "index.html");

  const server = http.createServer(async (request, response) => {
    const headers = {
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": CONTENT_SECURITY_POLICY,
    };
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { ...headers, Allow: "GET, HEAD" }).end();
      return;
    }

    const pathname = request.url.split("?", 1)[0];
    if (!pathname.startsWith("/")) {
      response.writeHead(400, headers).end();
      return;
    }
    const { candidate, error } = resolveRequestPath(root, pathname);
    if (error) {
      response.writeHead(error, headers).end();
      return;
    }

    let filePath = candidate;
    let stats;
    try {
      stats = await fs.promises.stat(filePath);
      if (!stats.isFile()) throw new Error("Not a file");
    } catch {
      if (path.extname(pathname)) {
        response.writeHead(404, headers).end();
        return;
      }
      filePath = indexPath;
      try {
        stats = await fs.promises.stat(filePath);
        if (!stats.isFile()) throw new Error("Missing renderer entry point");
      } catch {
        response.writeHead(503, headers).end("BigTree renderer is not built.");
        return;
      }
    }

    const type = CONTENT_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    response.writeHead(200, { ...headers, "Content-Length": stats.size, "Content-Type": type });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    fs.createReadStream(filePath).on("error", () => response.destroy()).pipe(response);
  });

  return {
    server,
    listen: () => new Promise((resolve, reject) => {
      const onError = error => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        const address = server.address();
        resolve(`http://${host}:${address.port}/`);
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port, host);
    }),
    close: () => new Promise((resolve, reject) => {
      if (!server.listening) return resolve();
      server.close(error => error ? reject(error) : resolve());
    }),
  };
}

module.exports = { CONTENT_SECURITY_POLICY, createRendererServer, resolveRequestPath };
