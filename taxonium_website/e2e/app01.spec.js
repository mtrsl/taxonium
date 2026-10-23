import { test, expect } from '@playwright/test';
import { gzipSync } from 'node:zlib';

const file = (name, content) => ({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(content) });
const tree = file('tree.nwk', '(A:1,B:2);');
const metadata = file('meta.csv', 'name,group,Lat,Long\nA,one,51,0\nB,two,52,1\n');
const dot = file('points.dot', 'graph { A [x=1,y=2]; B [pos="3,4"]; }');
const jsonl = file('tree.jsonl', [
  { mutations: [], total_nodes: 3, config: { title: 'JSONL fixture' } },
  { node_id: 0, parent_id: 0, name: 'root', is_tip: false, x_dist: 0, y: 1, num_tips: 2, mutations: [] },
  { node_id: 1, parent_id: 0, name: 'A', is_tip: true, x_dist: 1, y: 0, num_tips: 1, mutations: [] },
  { node_id: 2, parent_id: 0, name: 'B', is_tip: true, x_dist: 1, y: 2, num_tips: 1, mutations: [] },
].map(value => JSON.stringify(value)).join('\n') + '\n');
const nextstrain = file('tree.json', JSON.stringify({version: 'v2', meta: { title: 'Nextstrain fixture', colorings: [] }, tree: { name: 'root', node_attrs: { div: 0 }, children: [{ name: 'A', node_attrs: { div: 1 } }, { name: 'B', node_attrs: { div: 2 } }] }}));
const nexus = file('tree.nex', '#NEXUS\nBegin trees;\nTree tree1 = (A:1,B:2);\nEnd;');
const choose = (page, files) => page.locator('input[type=file]').setInputFiles(files);
const open = async page => { await page.getByRole('button', { name: 'Open dataset', exact: true }).click(); await expect(page.getByRole('tab', { name: 'Metadata table', exact: true })).toBeVisible({ timeout: 60000 }); await expect(page.getByRole('progressbar')).toHaveCount(0, { timeout: 60000 }); await page.getByRole('tab', { name: 'Metadata table', exact: true }).click(); await expect(page.locator('body')).toContainText('2 samples'); };

test.beforeEach(async ({ page }) => {
  page.on('pageerror', error => { throw error; });
  await page.goto('/');
});

test('legacy URLs stay local, file staging is accessible and invalid batches can be corrected', async ({ page }) => {
  const remote = [];
  page.on('request', request => { if (new URL(request.url()).hostname === 'example.invalid') remote.push(request.url()); });
  await page.goto('/sars-cov-2/public?backend=https://example.invalid&sid=123&treeUrl=https://example.invalid/tree.nwk&metaUrl=https://example.invalid/meta.csv&embeddingUrl=https://example.invalid/embed.dot&treeLayout=rotated&bottomView=embedding');
  await expect(page.getByRole('heading', { name: 'Open a local dataset' })).toBeVisible();
  await expect(page).not.toHaveURL(/backend=|treeUrl=|metaUrl=|embeddingUrl=|sid=/);
  await expect(page).toHaveURL(/treeLayout=rotated/);
  await expect(page.getByText('Select a tree', {exact: true})).toHaveCount(0);
  await page.getByRole('button', {name: 'Choose files', exact: true}).focus();
  const picker = page.waitForEvent('filechooser');
  await page.keyboard.press('Enter');
  await (await picker).setFiles([file('tree.data', '(A:1,B:2);'), metadata, dot]);
  await expect(page.getByRole('button', {name: 'Open dataset', exact: true})).toBeDisabled();
  await page.getByRole('combobox', {name: 'File type for tree.data'}).selectOption('nwk');
  await choose(page, [tree]);
  await expect(page.getByRole('alert')).toContainText('only one tree');
  await page.getByRole('button', {name: 'Remove tree.nwk', exact: true}).click();
  await open(page);
  await expect(page.getByRole('combobox', {name: 'Tree layout', exact: true})).toHaveValue('rotated');
  expect(remote).toEqual([]);
});

test('a dropped JSONL and DOT batch waits for Open and supports replacement', async ({ page }) => {
  const data = await page.evaluateHandle(files => {
    const transfer = new DataTransfer();
    for (const file of files) transfer.items.add(new File([new Uint8Array(file.bytes)], file.name));
    return transfer;
  }, [jsonl, dot].map(file => ({name: file.name, bytes: [...file.buffer]})));
  await page.locator('main').dispatchEvent('drop', {dataTransfer: data});
  await expect(page.getByText('Selected files', {exact: true})).toBeVisible();
  await expect(page.getByRole('tab', {name: 'Metadata table', exact: true})).toHaveCount(0);
  await open(page);
  await expect(page.getByRole('tab', {name: 'Embedding', exact: true})).toBeEnabled();
  await page.getByRole('tab', {name: 'Embedding', exact: true}).click();
  await page.getByRole('button', {name: 'Open another dataset', exact: true}).click();
  await expect(page.getByText('Selected files', {exact: true})).toHaveCount(0);
  await choose(page, [tree, metadata]);
  await open(page);
  await expect(page.getByRole('tab', {name: 'Embedding', exact: true})).toBeDisabled();
});

for (const [name, files] of [['Newick', [tree, metadata, dot]], ['Nexus', [nexus, metadata, dot]], ['Nextstrain', [nextstrain, dot]], ['gzip JSONL', [{...jsonl, name:'tree.jsonl.gz', buffer:gzipSync(jsonl.buffer)}, dot]], ['gzip Newick', [tree, metadata, dot].map(input => ({...input, name:input.name+'.gz', buffer:gzipSync(input.buffer)}))]]) {
  test(`opens ${name} with attachments`, async ({page}) => {
    await choose(page, files);
    await open(page);
    await expect(page.getByRole('tab', {name: 'Embedding', exact: true})).toBeEnabled();
  });
}

test('malformed inputs report errors, retry and return to files without redirecting', async ({page}) => {
  await choose(page, [file('legacy.pb', 'bad')]);
  await expect(page.getByRole('alert')).toContainText('protobuf files are not supported');
  await page.getByRole('button', {name:'Remove legacy.pb'}).click();
  for (const input of [file('bad.jsonl', '{broken\n{}\n'), file('bad.json', '{broken'), file('bad.nwk.gz', 'not gzip')]) {
    await choose(page, [input]);
    await page.getByRole('button', {name:'Open dataset', exact:true}).click();
    await expect(page.getByRole('button', {name:'Retry', exact:true})).toBeVisible();
    await page.getByRole('button', {name:'Retry', exact:true}).click();
    await expect(page.getByRole('button', {name:'Retry', exact:true})).toBeVisible();
    await page.getByRole('button', {name:'Return to files', exact:true}).click();
    await page.getByRole('button', {name:`Remove ${input.name}`}).click();
  }
  await choose(page, [tree]); await open(page);
});

test('file read failures recover, cancelling prevents late loads and narrow staging fits', async ({page}) => {
  await page.setViewportSize({width:390, height:700});
  await page.evaluate(() => {
    window.originalReader = window.FileReader;
    window.FileReader = class extends window.originalReader {
      readAsArrayBuffer() { setTimeout(() => this.dispatchEvent(new ProgressEvent('error')), 20); }
    };
  });
  await choose(page, [tree]);
  await page.getByRole('button', {name:'Open dataset', exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Unable to read tree.nwk');
  await page.evaluate(() => { window.FileReader = class extends window.originalReader { readAsArrayBuffer(file) { setTimeout(() => super.readAsArrayBuffer(file), 250); } }; });
  await page.getByRole('button', {name:'Retry', exact:true}).click();
  await page.getByRole('button', {name:'Return to files', exact:true}).click();
  await page.waitForTimeout(350);
  await expect(page.getByRole('button', {name:'Open dataset', exact:true})).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => { window.FileReader = window.originalReader; });
  await open(page);
});
