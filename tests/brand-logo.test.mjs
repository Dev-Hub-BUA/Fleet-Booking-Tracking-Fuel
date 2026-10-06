import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'file:///D:/CIRA/Fleet-Booking-Tracking-Fuel/node_modules/playwright/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectDir = path.resolve(__dirname, '..');

const REQUIRED_ASSETS = [
  { file: 'img/cira-logo.png', minSize: 10000 },
  { file: 'img/cira-logo-white.png', minSize: 10000 },
  { file: 'img/cira-emblem.svg', minSize: 1000 },
  { file: 'img/cira-emblem-gold.svg', minSize: 1000 },
  { file: 'img/cira-emblem-white.svg', minSize: 1000 },
  { file: 'img/favicon.svg', minSize: 500 },
  { file: 'img/favicon-32x32.png', minSize: 500 },
  { file: 'img/apple-touch-icon.png', minSize: 1000 }
];

const PORTAL_PAGES = [
  'admin-drivers.html',
  'admin-fleet.html',
  'admin-kpi.html',
  'audit.html',
  'booking-detail.html',
  'booking-new.html',
  'booking-track.html',
  'bookings.html',
  'dispatch-map.html',
  'dispatch-queue.html',
  'dispatch-timeline.html',
  'driver-close.html',
  'driver-run.html',
  'driver-shift.html',
  'driver-trip.html',
  'help.html',
  'home.html',
  'incident.html',
  'notifications.html',
  'policies.html',
  'vehicles.html'
];

const ALL_HTML_PAGES = [
  ...PORTAL_PAGES,
  'login.html',
  'index.html',
  '403.html'
];

test('Brand Asset Files Integrity', async (t) => {
  for (const asset of REQUIRED_ASSETS) {
    await t.test(`asset exists and has sufficient size: ${asset.file}`, () => {
      const fullPath = path.join(projectDir, asset.file);
      assert.ok(fs.existsSync(fullPath), `Expected ${asset.file} to exist`);
      const stat = fs.statSync(fullPath);
      assert.ok(stat.size >= asset.minSize, `Expected ${asset.file} size >= ${asset.minSize}, got ${stat.size}`);
    });
  }

  await t.test('SVG emblems contain correct color fills', () => {
    const burgundySvg = fs.readFileSync(path.join(projectDir, 'img/cira-emblem.svg'), 'utf8');
    const goldSvg = fs.readFileSync(path.join(projectDir, 'img/cira-emblem-gold.svg'), 'utf8');
    const whiteSvg = fs.readFileSync(path.join(projectDir, 'img/cira-emblem-white.svg'), 'utf8');

    assert.ok(burgundySvg.includes('#703845'), 'Burgundy emblem must contain #703845');
    assert.ok(goldSvg.includes('#CE9F51'), 'Gold emblem must contain #CE9F51');
    assert.ok(whiteSvg.includes('#FFFFFF'), 'White emblem must contain #FFFFFF');
  });
});

test('Favicon Standardization Across All HTML Pages', async (t) => {
  for (const pageName of ALL_HTML_PAGES) {
    await t.test(`${pageName} uses official CIRA favicons and no data URI placeholders`, () => {
      const content = fs.readFileSync(path.join(projectDir, pageName), 'utf8');
      assert.ok(!content.includes('data:image/svg+xml'), `${pageName} must not contain old data URI placeholder`);
      assert.ok(content.includes('img/favicon-32x32.png'), `${pageName} must link to img/favicon-32x32.png`);
      assert.ok(content.includes('img/apple-touch-icon.png'), `${pageName} must link to img/apple-touch-icon.png`);
      assert.ok(content.includes('img/favicon.svg'), `${pageName} must link to img/favicon.svg`);
    });
  }
});

test('Master Header Logo Integration on All Portal Pages', async (t) => {
  for (const pageName of PORTAL_PAGES) {
    await t.test(`${pageName} header uses official CIRA logo image`, () => {
      const content = fs.readFileSync(path.join(projectDir, pageName), 'utf8');
      assert.ok(content.includes('img/cira-logo.png'), `${pageName} must reference img/cira-logo.png in header`);
      assert.ok(content.includes('brand-logo-img'), `${pageName} must have .brand-logo-img class`);
      assert.ok(!content.includes('<span class="logo-badge"'), `${pageName} must not contain old header .logo-badge placeholder`);
    });
  }
});

test('Master Footer Logo Integration on All Portal Pages', async (t) => {
  for (const pageName of PORTAL_PAGES) {
    await t.test(`${pageName} footer uses official white CIRA logo image`, () => {
      const content = fs.readFileSync(path.join(projectDir, pageName), 'utf8');
      assert.ok(content.includes('img/cira-logo-white.png'), `${pageName} must reference img/cira-logo-white.png in footer`);
      assert.ok(content.includes('footer-brand'), `${pageName} must have .footer-brand container`);
      assert.ok(!content.includes('<div class="logo-badge"'), `${pageName} must not contain old footer .logo-badge placeholder`);
    });
  }
});

test('Special Pages Brand Logo Integration', async (t) => {
  await t.test('login.html contains official white logo in hero', () => {
    const content = fs.readFileSync(path.join(projectDir, 'login.html'), 'utf8');
    assert.ok(content.includes('img/cira-logo-white.png'), 'login.html must include white logo');
    assert.ok(!content.includes('font-size: 16px; color: var(--cira-burgundy);">CIRA</div>'), 'login.html must not have old badge');
  });

  await t.test('index.html contains official logo in redirect screen', () => {
    const content = fs.readFileSync(path.join(projectDir, 'index.html'), 'utf8');
    assert.ok(content.includes('img/cira-logo.png'), 'index.html must include cira-logo.png');
  });

  await t.test('403.html contains official logo in access denied card', () => {
    const content = fs.readFileSync(path.join(projectDir, '403.html'), 'utf8');
    assert.ok(content.includes('img/cira-logo.png'), '403.html must include cira-logo.png');
  });
});

test('Playwright Browser In-Depth Layout & Image Loading Verification', async (t) => {
  const browser = await chromium.launch({ channel: 'chrome' });

  await t.test('login.html logo renders and loads natural image dimensions', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`file:///${projectDir.replace(/\\/g, '/')}/login.html`);

    const img = page.locator('img[src*="cira-logo-white.png"]');
    await img.waitFor({ state: 'visible' });

    const isLoaded = await img.evaluate((el) => el.complete && el.naturalWidth > 0 && el.naturalHeight > 0);
    assert.ok(isLoaded, 'cira-logo-white.png must be completely loaded with natural dimensions > 0');

    const naturalWidth = await img.evaluate((el) => el.naturalWidth);
    const naturalHeight = await img.evaluate((el) => el.naturalHeight);
    assert.equal(naturalWidth, 1440);
    assert.equal(naturalHeight, 328);

    await page.close();
  });

  await t.test('home.html header logo renders properly at 1440px and 360px without layout overflow', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`file:///${projectDir.replace(/\\/g, '/')}/login.html`);
    await page.evaluate(() => {
      sessionStorage.setItem('cira_auth_user', JSON.stringify({
        id: 'usr_ops_01',
        name: 'Demo Ops Manager',
        email: 'demo.ops@example.com',
        role: 'dispatcher',
        department: 'Logistics Central Command',
        site_id: 'cira_hq'
      }));
    });

    await page.goto(`file:///${projectDir.replace(/\\/g, '/')}/home.html`);
    const headerImg = page.locator('.app-header img[src*="cira-logo.png"]');
    await headerImg.waitFor({ state: 'visible' });

    const isHeaderLoaded = await headerImg.evaluate((el) => el.complete && el.naturalWidth === 1440);
    assert.ok(isHeaderLoaded, 'Header cira-logo.png must be loaded with natural width 1440');

    // Check footer logo
    const footerImg = page.locator('.app-footer img[src*="cira-logo-white.png"]');
    const isFooterLoaded = await footerImg.evaluate((el) => el.complete && el.naturalWidth === 1440);
    assert.ok(isFooterLoaded, 'Footer cira-logo-white.png must be loaded with natural width 1440');

    // Test 360px viewport
    await page.setViewportSize({ width: 360, height: 740 });
    await page.waitForTimeout(200);

    const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(hasHorizontalScroll, false, '360px mobile view must not have horizontal scroll/overflow');

    await page.close();
  });

  await browser.close();
});
