const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createRendererServer } = require("../rendererServer.cjs");

test("renderer server serves only local assets and supports client-side routes", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bigtree-renderer-"));
  const outside = `${root}-secret.txt`;
  await fs.mkdir(path.join(root, "assets"));
  await fs.writeFile(path.join(root, "index.html"), "<!doctype html><title>BigTree</title>");
  await fs.writeFile(path.join(root, "assets", "app.js"), "window.ready = true;");
  await fs.writeFile(outside, "private data");
  const renderer = createRendererServer({ rendererRoot: root });
  const baseUrl = await renderer.listen();
  t.after(async () => {
    await renderer.close();
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { force: true });
  });

  assert.equal(new URL(baseUrl).hostname, "127.0.0.1");
  const page = await fetch(baseUrl);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /BigTree/);
  assert.match(page.headers.get("content-security-policy"), /worker-src 'self' blob:/);
  assert.equal(page.headers.get("x-content-type-options"), "nosniff");

  const route = await fetch(new URL("metadata", baseUrl));
  assert.equal(route.status, 200);
  assert.match(await route.text(), /BigTree/);

  const asset = await fetch(new URL("assets/app.js", baseUrl));
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("content-type"), /javascript/);
  assert.equal(await asset.text(), "window.ready = true;");

  const missingAsset = await fetch(new URL("assets/missing.js", baseUrl));
  assert.equal(missingAsset.status, 404);

  const traversal = await fetch(`${baseUrl}%2e%2e%2f${path.basename(outside)}`);
  assert.notEqual(traversal.status, 200);
  assert.doesNotMatch(await traversal.text(), /private data/);

  const unsupported = await fetch(baseUrl, { method: "POST" });
  assert.equal(unsupported.status, 405);
  assert.equal(unsupported.headers.get("allow"), "GET, HEAD");

  const head = await fetch(baseUrl, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
});
