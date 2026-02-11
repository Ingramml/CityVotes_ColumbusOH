#!/usr/bin/env node
const { chromium } = require('playwright');
const BASE = 'http://localhost:3456';

let passed = 0, failed = 0;
const failures = [];

async function test(name, fn) {
    try {
        await fn();
        passed++;
        console.log(`  PASS  ${name}`);
    } catch (err) {
        failed++;
        const msg = err.message.split('\n')[0];
        failures.push({ name, error: msg });
        console.log(`  FAIL  ${name}: ${msg}`);
    }
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    console.log('\n=== Testing link clicks ===\n');

    // HOME -> COUNCIL (nav)
    await test('Home -> Council nav click', async () => {
        await page.goto(BASE, { waitUntil: 'networkidle' });
        await page.click('a[href="/council"]');
        await page.waitForLoadState('networkidle');
        if (!page.url().includes('council')) throw new Error('URL: ' + page.url());
        await page.waitForTimeout(1000);
        const visible = await page.locator('.card:visible').count();
        if (visible < 10) throw new Error('Expected 10+ cards, got ' + visible);
    });

    // COUNCIL -> MEMBER DETAIL (card click)
    await test('Council -> Member detail (click View Profile)', async () => {
        await page.goto(BASE + '/council', { waitUntil: 'networkidle' });
        const link = page.locator('a[href*="council-member?id="]').first();
        await link.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);
        const url = page.url();
        if (!url.includes('id=')) throw new Error('URL missing id param: ' + url);
        // Check visible headings for member name
        const h1 = await page.locator('h1:visible, h2:visible').first().textContent();
        if (!h1 || h1.length < 3) throw new Error('No member name heading');
    });

    // HOME -> MEETINGS (nav)
    await test('Home -> Meetings nav click', async () => {
        await page.goto(BASE, { waitUntil: 'networkidle' });
        await page.click('a[href="/meetings"]');
        await page.waitForLoadState('networkidle');
        if (!page.url().includes('meetings')) throw new Error('URL: ' + page.url());
    });

    // MEETINGS -> MEETING DETAIL (click row)
    await test('Meetings -> Meeting detail click', async () => {
        await page.goto(BASE + '/meetings', { waitUntil: 'networkidle' });
        const link = page.locator('a[href*="meeting-detail?id="]').first();
        if (await link.count() === 0) throw new Error('No meeting detail links found');
        await link.click();
        await page.waitForLoadState('networkidle');
        const url = page.url();
        if (!url.includes('id=')) throw new Error('URL missing id: ' + url);
    });

    // HOME -> VOTES (nav)
    await test('Home -> Votes nav click', async () => {
        await page.goto(BASE, { waitUntil: 'networkidle' });
        await page.click('a[href="/votes"]');
        await page.waitForLoadState('networkidle');
        if (!page.url().includes('votes')) throw new Error('URL: ' + page.url());
    });

    // VOTES -> VOTE DETAIL (click row)
    await test('Votes -> Vote detail click', async () => {
        await page.goto(BASE + '/votes', { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);
        const link = page.locator('a[href*="vote-detail?id="]').first();
        if (await link.count() === 0) throw new Error('No vote detail links found');
        await link.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);
        const url = page.url();
        if (!url.includes('id=')) throw new Error('URL missing id: ' + url);
    });

    // HOME -> SEARCH
    await test('Home -> Agenda Search nav click', async () => {
        await page.goto(BASE, { waitUntil: 'networkidle' });
        await page.click('a[href="/agenda-search"]');
        await page.waitForLoadState('networkidle');
        if (!page.url().includes('agenda-search')) throw new Error('URL: ' + page.url());
    });

    // HOME -> ABOUT
    await test('Home -> About nav click', async () => {
        await page.goto(BASE, { waitUntil: 'networkidle' });
        await page.click('a[href="/about"]');
        await page.waitForLoadState('networkidle');
        if (!page.url().includes('about')) throw new Error('URL: ' + page.url());
    });

    // Test all 13 member detail pages load with visible member name
    for (let id = 1; id <= 13; id++) {
        await test(`Council member ?id=${id} loads with name`, async () => {
            await page.goto(BASE + `/council-member?id=${id}`, { waitUntil: 'networkidle' });
            await page.waitForTimeout(2000);
            // Check for visible member heading (not hidden error text)
            const heading = page.locator('h1:visible, h2:visible').first();
            const text = await heading.textContent();
            if (!text || text.length < 3 || text.includes('Loading')) {
                throw new Error('No member name loaded, got: ' + (text || 'empty'));
            }
        });
    }

    // Summary
    console.log(`\n${'='.repeat(50)}`);
    console.log(`RESULTS: ${passed} passed, ${failed} failed`);
    console.log('='.repeat(50));
    if (failures.length > 0) {
        console.log('\nFAILURES:');
        failures.forEach(f => console.log(`  ${f.name}: ${f.error}`));
    }

    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
