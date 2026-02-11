#!/usr/bin/env node
const { chromium } = require('playwright');

const BASE = 'http://localhost:3456';
const pagesToTest = process.argv.slice(2);

if (pagesToTest.length === 0) {
    console.log('Usage: node test-links.js /council /meetings ...');
    process.exit(1);
}

async function testLinksOnPage(browser, pagePath) {
    const page = await browser.newPage();
    const fullUrl = BASE + pagePath;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing all links on: ${fullUrl}`);
    console.log('='.repeat(60));

    await page.goto(fullUrl, { waitUntil: 'networkidle' });

    // Collect all links
    const links = await page.locator('a[href]').all();
    const linkData = [];
    for (const link of links) {
        const href = await link.getAttribute('href');
        const text = (await link.textContent()).trim().substring(0, 60);
        const visible = await link.isVisible();
        linkData.push({ href, text, visible });
    }

    // Deduplicate
    const seen = new Set();
    const uniqueLinks = linkData.filter(l => {
        if (seen.has(l.href)) return false;
        seen.add(l.href);
        return true;
    });

    console.log(`Found ${linkData.length} links (${uniqueLinks.length} unique)\n`);

    let passed = 0, failed = 0, skipped = 0;

    for (const entry of uniqueLinks) {
        const href = entry.href;

        // Skip anchors, javascript, mailto, external
        if (!href || href === '#' || href === '#main-content') {
            skipped++;
            continue;
        }
        if (href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
            console.log(`  SKIP  ${href}`);
            skipped++;
            continue;
        }
        if (href.startsWith('http') && !href.startsWith(BASE)) {
            console.log(`  EXT   ${href.substring(0, 80)} (${entry.text})`);
            skipped++;
            continue;
        }

        // Build full URL
        let testUrl;
        if (href.startsWith('http')) {
            testUrl = href;
        } else if (href.startsWith('/')) {
            testUrl = BASE + href;
        } else {
            testUrl = BASE + '/' + href;
        }

        try {
            const testPage = await browser.newPage();
            const resp = await testPage.goto(testUrl, { waitUntil: 'networkidle', timeout: 15000 });
            const status = resp.status();
            const bodyText = await testPage.textContent('body');
            const bodyLen = bodyText.length;
            const hasError = bodyText.includes('Not Found') || bodyText.includes('404 |');

            if (status === 200 && bodyLen > 200 && !hasError) {
                console.log(`  PASS  ${href} (${entry.text})`);
                passed++;
            } else if (hasError) {
                console.log(`  FAIL  ${href} -> shows 404 error (${entry.text})`);
                failed++;
            } else if (bodyLen <= 200) {
                console.log(`  FAIL  ${href} -> page too short (${bodyLen} chars) (${entry.text})`);
                failed++;
            } else {
                console.log(`  FAIL  ${href} -> HTTP ${status} (${entry.text})`);
                failed++;
            }
            await testPage.close();
        } catch (err) {
            console.log(`  FAIL  ${href} -> ${err.message.split('\n')[0]} (${entry.text})`);
            failed++;
        }
    }

    console.log(`\nResults for ${pagePath}: ${passed} passed, ${failed} failed, ${skipped} skipped`);
    await page.close();
    return { passed, failed, skipped };
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    let totalPassed = 0, totalFailed = 0;

    for (const pagePath of pagesToTest) {
        const result = await testLinksOnPage(browser, pagePath);
        totalPassed += result.passed;
        totalFailed += result.failed;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`TOTAL: ${totalPassed} passed, ${totalFailed} failed`);
    console.log('='.repeat(60));

    await browser.close();
    process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
