/**
 * Regression guards for the passive-attachment policy applied before and after `allure generate`.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  neutralizeAttachments,
  neutralizeReportAttachments,
} from '../../src/allure/attachment-policy.js';

const ACTIVE_EXTENSIONS = ['.html', '.htm', '.xhtml', '.svg', '.xml', '.js', '.mjs'];

describe('Attachment policy', () => {
  let resultsDir: string;

  beforeEach(() => {
    resultsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-policy-test-'));
  });

  afterEach(() => {
    fs.rmSync(resultsDir, { recursive: true, force: true });
  });

  const writeJson = (name: string, data: object) =>
    fs.writeFileSync(path.join(resultsDir, name), JSON.stringify(data));
  const readJson = (name: string) =>
    JSON.parse(fs.readFileSync(path.join(resultsDir, name), 'utf8'));

  it('regression guard: extensionless attachment declared text/html is published as plain text', () => {
    writeJson('case-result.json', {
      uuid: 'case',
      attachments: [{ name: 'page', source: 'page-attachment', type: 'text/html' }],
    });
    fs.writeFileSync(path.join(resultsDir, 'page-attachment'), '<p>markup</p>');

    neutralizeAttachments(resultsDir);

    const [attachment] = readJson('case-result.json').attachments;
    expect(attachment).toEqual({ name: 'page', source: 'page-attachment.txt', type: 'text/plain' });
    expect(fs.readFileSync(path.join(resultsDir, 'page-attachment.txt'), 'utf8')).toBe(
      '<p>markup</p>'
    );
    expect(fs.existsSync(path.join(resultsDir, 'page-attachment'))).toBe(false);
  });

  it('regression guard: extensionless attachment without a declared type cannot be sniffed into an active type', () => {
    writeJson('case-result.json', {
      uuid: 'case',
      attachments: [{ name: 'blob', source: 'blob-attachment' }],
    });
    fs.writeFileSync(
      path.join(resultsDir, 'blob-attachment'),
      '<svg xmlns="http://www.w3.org/2000/svg"/>'
    );

    neutralizeAttachments(resultsDir);

    const [attachment] = readJson('case-result.json').attachments;
    expect(attachment).toEqual({ name: 'blob', source: 'blob-attachment.txt', type: 'text/plain' });
  });

  it('regression guard: HTML padded past 64 KB is neutralised regardless of content', () => {
    const padded = `${' '.repeat(70 * 1024)}<p>late markup</p>`;
    writeJson('case-result.json', {
      uuid: 'case',
      attachments: [{ name: 'padded', source: 'padded.html', type: 'text/html' }],
    });
    fs.writeFileSync(path.join(resultsDir, 'padded.html'), padded);

    neutralizeAttachments(resultsDir);

    const [attachment] = readJson('case-result.json').attachments;
    expect(attachment).toEqual({ name: 'padded', source: 'padded.html.txt', type: 'text/plain' });
    expect(fs.readFileSync(path.join(resultsDir, 'padded.html.txt'), 'utf8')).toBe(padded);
  });

  it('regression guard: SVG attachments are neutralised in steps, fixtures, and globals', () => {
    writeJson('case-result.json', {
      uuid: 'case',
      steps: [{ steps: [{ attachments: [{ source: 'chart.svg', type: 'image/svg+xml' }] }] }],
    });
    writeJson('fixture-container.json', {
      befores: [{ attachments: [{ source: 'before.xml', type: 'application/xml' }] }],
      afters: [{ steps: [{ attachments: [{ source: 'after.js', type: 'text/javascript' }] }] }],
    });
    writeJson('run-globals.json', {
      attachments: [{ name: 'global', source: 'global.xhtml', type: 'application/xhtml+xml' }],
    });
    for (const name of ['chart.svg', 'before.xml', 'after.js', 'global.xhtml']) {
      fs.writeFileSync(path.join(resultsDir, name), 'payload');
    }

    neutralizeAttachments(resultsDir);

    expect(readJson('case-result.json').steps[0].steps[0].attachments[0]).toEqual({
      source: 'chart.svg.txt',
      type: 'text/plain',
    });
    const container = readJson('fixture-container.json');
    expect(container.befores[0].attachments[0]).toEqual({
      source: 'before.xml.txt',
      type: 'application/xml',
    });
    expect(container.afters[0].steps[0].attachments[0]).toEqual({
      source: 'after.js.txt',
      type: 'text/javascript',
    });
    expect(readJson('run-globals.json').attachments[0]).toEqual({
      name: 'global',
      source: 'global.xhtml.txt',
      type: 'text/plain',
    });
    const remaining = fs.readdirSync(resultsDir);
    for (const name of remaining) {
      if (name.endsWith('.json')) continue;
      expect(ACTIVE_EXTENSIONS).not.toContain(path.extname(name));
    }
  });

  it('rewrites an active declared type on a passive file extension', () => {
    writeJson('case-result.json', {
      uuid: 'case',
      attachments: [{ source: 'shot.png', type: 'text/html; charset=utf-8' }],
    });
    fs.writeFileSync(path.join(resultsDir, 'shot.png'), 'png');

    neutralizeAttachments(resultsDir);

    expect(readJson('case-result.json').attachments[0]).toEqual({
      source: 'shot.png',
      type: 'text/plain',
    });
  });

  it('leaves legitimate png, txt, json, and video attachments untouched', () => {
    const result = {
      uuid: 'case',
      attachments: [
        { name: 'screenshot', source: 'a-attachment.png', type: 'image/png' },
        { name: 'log', source: 'b-attachment.txt', type: 'text/plain' },
        { name: 'payload', source: 'c-attachment.json', type: 'application/json' },
        { name: 'video', source: 'd-attachment.webm', type: 'video/webm' },
        { name: 'recording', source: 'e-attachment.mp4', type: 'video/mp4' },
        {
          name: 'trace',
          source: 'f-attachment.zip',
          type: 'application/vnd.allure.playwright-trace',
        },
        {
          name: 'diff',
          source: 'g-attachment.imagediff',
          type: 'application/vnd.allure.image.diff',
        },
        { name: 'untyped', source: 'h-attachment.txt' },
      ],
    };
    writeJson('case-result.json', result);
    const before = fs.readFileSync(path.join(resultsDir, 'case-result.json'), 'utf8');
    for (const { source } of result.attachments) {
      fs.writeFileSync(path.join(resultsDir, source), `content ${source}`);
    }

    neutralizeAttachments(resultsDir);

    expect(fs.readFileSync(path.join(resultsDir, 'case-result.json'), 'utf8')).toBe(before);
    for (const { source } of result.attachments) {
      expect(fs.readFileSync(path.join(resultsDir, source), 'utf8')).toBe(`content ${source}`);
    }
  });

  it('gives an extensionless passive attachment the extension of its declared type', () => {
    writeJson('case-result.json', {
      uuid: 'case',
      attachments: [{ source: 'shot-attachment', type: 'image/png' }],
    });
    fs.writeFileSync(path.join(resultsDir, 'shot-attachment'), 'png');

    neutralizeAttachments(resultsDir);

    expect(readJson('case-result.json').attachments[0]).toEqual({
      source: 'shot-attachment.png',
      type: 'image/png',
    });
    expect(fs.existsSync(path.join(resultsDir, 'shot-attachment.png'))).toBe(true);
  });

  it('renames a source referenced with conflicting types once, as plain text', () => {
    writeJson('a-result.json', {
      uuid: 'a',
      attachments: [{ source: 'shared-attachment', type: 'image/png' }],
    });
    writeJson('b-result.json', {
      uuid: 'b',
      attachments: [{ source: 'shared-attachment', type: 'text/html' }],
    });
    fs.writeFileSync(path.join(resultsDir, 'shared-attachment'), 'shared');

    neutralizeAttachments(resultsDir);

    expect(readJson('a-result.json').attachments[0].source).toBe('shared-attachment.txt');
    expect(readJson('b-result.json').attachments[0]).toEqual({
      source: 'shared-attachment.txt',
      type: 'text/plain',
    });
    expect(fs.readFileSync(path.join(resultsDir, 'shared-attachment.txt'), 'utf8')).toBe('shared');
  });

  it('refuses to overwrite an existing file when renaming', () => {
    writeJson('case-result.json', {
      uuid: 'case',
      attachments: [{ source: 'page.html', type: 'text/html' }],
    });
    fs.writeFileSync(path.join(resultsDir, 'page.html'), 'new');
    fs.writeFileSync(path.join(resultsDir, 'page.html.txt'), 'existing');

    expect(() => neutralizeAttachments(resultsDir)).toThrow('already exists');
    expect(fs.readFileSync(path.join(resultsDir, 'page.html.txt'), 'utf8')).toBe('existing');
  });

  it('does not touch files outside the results directory for unsafe source names', () => {
    const outside = path.join(
      path.dirname(resultsDir),
      `${path.basename(resultsDir)}-outside.html`
    );
    fs.writeFileSync(outside, 'outside');
    writeJson('case-result.json', {
      uuid: 'case',
      attachments: [{ source: `../${path.basename(outside)}`, type: 'text/html' }],
    });

    try {
      neutralizeAttachments(resultsDir);
      expect(fs.readFileSync(outside, 'utf8')).toBe('outside');
      expect(readJson('case-result.json').attachments[0].type).toBe('text/plain');
    } finally {
      fs.rmSync(outside, { force: true });
    }
  });

  it('regression guard: generated report attachments with an active extension are withheld', () => {
    const attachments = path.join(resultsDir, 'report', 'data', 'attachments');
    const pluginAttachments = path.join(resultsDir, 'report', 'awesome', 'data', 'attachments');
    fs.mkdirSync(attachments, { recursive: true });
    fs.mkdirSync(pluginAttachments, { recursive: true });
    fs.writeFileSync(path.join(attachments, 'a.html'), '<p>embedded</p>');
    fs.writeFileSync(path.join(pluginAttachments, 'b.svg'), '<svg/>');
    fs.writeFileSync(path.join(attachments, 'c.png'), 'png');
    fs.writeFileSync(path.join(resultsDir, 'report', 'index.html'), '<html></html>');

    const withheld = neutralizeReportAttachments(path.join(resultsDir, 'report'));

    expect(withheld).toBe(2);
    expect(fs.readFileSync(path.join(attachments, 'a.html'), 'utf8')).not.toContain('<');
    expect(fs.readFileSync(path.join(pluginAttachments, 'b.svg'), 'utf8')).not.toContain('<');
    expect(fs.readFileSync(path.join(attachments, 'c.png'), 'utf8')).toBe('png');
    expect(fs.readFileSync(path.join(resultsDir, 'report', 'index.html'), 'utf8')).toBe(
      '<html></html>'
    );
  });
});
