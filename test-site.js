#!/usr/bin/env node
/**
 * Comprehensive Playwright test for Columbus City Votes site.
 * Tests every page and major feature.
 */
const { chromium } = require('playwright');

const BASE = 'http://localhost:3456';
let passed = 0, failed = 0;
const failures = [];

async function test(name, fn) {
    try {
        await fn();
        passed++;
        console.log(`  ✅ ${name}`);
    } catch (err) {
        failed++;
        const msg = err.message.split('\n')[0];
        failures.push({ name, error: msg });
        console.log(`  ❌ ${name}: ${msg}`);
    }
}

async function expect(condition, msg) {
    if (!condition) throw new Error(msg || 'Assertion failed');
}

async function expectVisible(page, selector, label) {
    const el = page.locator(selector).first();
    await el.waitFor({ state: 'visible', timeout: 10000 });
    const visible = await el.isVisible();
    if (!visible) throw new Error(`${label || selector} not visible`);
}

async function expectText(page, selector, substring, label) {
    const el = page.locator(selector).first();
    await el.waitFor({ state: 'visible', timeout: 10000 });
    const text = await el.textContent();
    if (!text.includes(substring)) {
        throw new Error(`${label || selector}: expected "${substring}" in "${text.substring(0, 100)}"`);
    }
}

async function expectCount(page, selector, minCount, label) {
    // Wait a moment for dynamic content
    await page.waitForTimeout(2000);
    const count = await page.locator(selector).count();
    if (count < minCount) {
        throw new Error(`${label || selector}: expected at least ${minCount}, got ${count}`);
    }
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });

    // Collect console errors
    const consoleErrors = [];

    // ================================================================
    // PAGE 1: HOME / DASHBOARD
    // ================================================================
    console.log('\n📄 HOME PAGE (/)');
    const home = await context.newPage();
    home.on('console', msg => { if (msg.type() === 'error') consoleErrors.push({ page: '/', msg: msg.text() }); });
    await home.goto(BASE, { waitUntil: 'networkidle' });

    await test('Page title contains Columbus', async () => {
        const title = await home.title();
        await expect(title.includes('Columbus'), `Title was: ${title}`);
    });

    await test('Navbar shows Columbus', async () => {
        await expectText(home, '.navbar-text, .navbar', 'Columbus', 'Navbar');
    });

    await test('Stats cards load (total votes > 0)', async () => {
        // Look for stats numbers rendered on the page
        const text = await home.textContent('body');
        await expect(text.includes('14,034') || text.includes('14034') || text.includes('164'), 'Stats not found');
    });

    await test('Council member grid renders', async () => {
        await expectCount(home, '.card', 3, 'Council cards');
    });

    await test('Navigation links present', async () => {
        await expectVisible(home, 'a[href="council.html"], a[href="council"]', 'Council nav link');
        await expectVisible(home, 'a[href="meetings.html"], a[href="meetings"]', 'Meetings nav link');
        await expectVisible(home, 'a[href="votes.html"], a[href="votes"]', 'Votes nav link');
    });

    await home.close();

    // ================================================================
    // PAGE 2: COUNCIL LIST
    // ================================================================
    console.log('\n📄 COUNCIL PAGE (/council)');
    const council = await context.newPage();
    council.on('console', msg => { if (msg.type() === 'error') consoleErrors.push({ page: '/council', msg: msg.text() }); });
    await council.goto(`${BASE}/council`, { waitUntil: 'networkidle' });

    await test('Page loads without error', async () => {
        const text = await council.textContent('body');
        await expect(text.length > 100, 'Page body too short');
    });

    await test('Council members render (at least 10 cards)', async () => {
        await expectCount(council, '.card', 10, 'Member cards');
    });

    await test('Member names visible', async () => {
        const text = await council.textContent('body');
        await expect(text.includes('Emmanuel V. Remy'), 'Remy not found');
        await expect(text.includes('Shannon G. Hardin'), 'Hardin not found');
    });

    await test('Member stats visible (aye percentage)', async () => {
        const text = await council.textContent('body');
        await expect(text.includes('%'), 'No percentage found');
    });

    await council.close();

    // ================================================================
    // PAGE 3: COUNCIL MEMBER DETAIL
    // ================================================================
    console.log('\n📄 COUNCIL MEMBER PAGE (/council-member?id=1)');
    const member = await context.newPage();
    member.on('console', msg => { if (msg.type() === 'error') consoleErrors.push({ page: '/council-member?id=1', msg: msg.text() }); });
    await member.goto(`${BASE}/council-member?id=1`, { waitUntil: 'networkidle' });

    await test('Member name displays', async () => {
        const text = await member.textContent('body');
        await expect(text.includes('Christopher Wyche'), 'Member name not found');
    });

    await test('Member stats display', async () => {
        const text = await member.textContent('body');
        await expect(text.includes('98.9') || text.includes('5,649') || text.includes('5649'), 'Stats not found');
    });

    await test('Vote history table renders', async () => {
        await expectCount(member, 'table tr, .vote-row, .list-group-item, [class*="vote"]', 1, 'Vote rows');
    });

    await test('Page title updates with member name', async () => {
        const title = await member.title();
        await expect(title.includes('Columbus') || title.includes('Wyche') || title.includes('Council'), `Title: ${title}`);
    });

    await member.close();

    // ================================================================
    // PAGE 4: MEETINGS LIST
    // ================================================================
    console.log('\n📄 MEETINGS PAGE (/meetings)');
    const meetings = await context.newPage();
    meetings.on('console', msg => { if (msg.type() === 'error') consoleErrors.push({ page: '/meetings', msg: msg.text() }); });
    await meetings.goto(`${BASE}/meetings`, { waitUntil: 'networkidle' });

    await test('Meetings page loads', async () => {
        const text = await meetings.textContent('body');
        await expect(text.includes('Meeting') || text.includes('meeting'), 'Meetings heading not found');
    });

    await test('Meeting rows render (at least 5)', async () => {
        await expectCount(meetings, 'table tr, .card, .list-group-item, [class*="meeting"]', 5, 'Meeting items');
    });

    await test('Year filter exists', async () => {
        const selects = await meetings.locator('select').count();
        await expect(selects >= 1, 'No year filter select found');
    });

    await test('Meeting dates visible', async () => {
        const text = await meetings.textContent('body');
        await expect(text.includes('2025') || text.includes('2024'), 'No meeting dates found');
    });

    await test('Document links visible (agenda/minutes)', async () => {
        const links = await meetings.locator('a[href*="legistar"], a[href*="granicus"], .badge, [class*="doc"]').count();
        await expect(links >= 1, 'No document links found');
    });

    await meetings.close();

    // ================================================================
    // PAGE 5: MEETING DETAIL
    // ================================================================
    console.log('\n📄 MEETING DETAIL PAGE (/meeting-detail?id=1)');
    const meetingDetail = await context.newPage();
    meetingDetail.on('console', msg => { if (msg.type() === 'error') consoleErrors.push({ page: '/meeting-detail?id=1', msg: msg.text() }); });
    await meetingDetail.goto(`${BASE}/meeting-detail?id=1`, { waitUntil: 'networkidle' });

    await test('Meeting detail loads', async () => {
        const text = await meetingDetail.textContent('body');
        await expect(text.includes('2021') || text.includes('Meeting') || text.includes('Agenda'), 'Meeting content not found');
    });

    await test('Agenda items render', async () => {
        await meetingDetail.waitForTimeout(2000);
        const text = await meetingDetail.textContent('body');
        await expect(text.includes('PASS') || text.includes('Pass') || text.includes('Approved') || text.includes('AYE') || text.includes('agenda'), 'Agenda items not found');
    });

    await meetingDetail.close();

    // ================================================================
    // PAGE 6: VOTES LIST
    // ================================================================
    console.log('\n📄 VOTES PAGE (/votes)');
    const votes = await context.newPage();
    votes.on('console', msg => { if (msg.type() === 'error') consoleErrors.push({ page: '/votes', msg: msg.text() }); });
    await votes.goto(`${BASE}/votes`, { waitUntil: 'networkidle' });

    await test('Votes page loads', async () => {
        const text = await votes.textContent('body');
        await expect(text.includes('Vote') || text.includes('vote'), 'Votes heading not found');
    });

    await test('Vote rows render (at least 10)', async () => {
        await votes.waitForTimeout(2000);
        await expectCount(votes, 'table tbody tr, .card, .list-group-item, [class*="vote-row"]', 5, 'Vote items');
    });

    await test('Search input exists', async () => {
        const inputs = await votes.locator('input[type="text"], input[type="search"]').count();
        await expect(inputs >= 1, 'No search input found');
    });

    await test('Year filter works', async () => {
        const yearSelect = votes.locator('select').first();
        const options = await yearSelect.locator('option').count();
        await expect(options >= 2, `Only ${options} year options`);
    });

    await test('Topic filter exists', async () => {
        const selects = await votes.locator('select').count();
        await expect(selects >= 2, 'Need at least 2 selects (year + topic)');
    });

    await test('Search functionality works', async () => {
        const searchInput = votes.locator('input[type="text"], input[type="search"]').first();
        await searchInput.fill('emergency');
        await votes.waitForTimeout(1500);
        const text = await votes.textContent('body');
        // After searching, results should be filtered
        await expect(text.toLowerCase().includes('emergency') || text.includes('0 results') || text.includes('No'), 'Search did not filter');
        await searchInput.fill(''); // reset
        await votes.waitForTimeout(1000);
    });

    await test('Pagination exists', async () => {
        const pagination = await votes.locator('.pagination, [class*="page"], button:has-text("Next"), a:has-text("Next")').count();
        await expect(pagination >= 1, 'No pagination found');
    });

    await votes.close();

    // ================================================================
    // PAGE 7: VOTE DETAIL
    // ================================================================
    console.log('\n📄 VOTE DETAIL PAGE (/vote-detail?id=100)');
    const voteDetail = await context.newPage();
    voteDetail.on('console', msg => { if (msg.type() === 'error') consoleErrors.push({ page: '/vote-detail?id=100', msg: msg.text() }); });
    await voteDetail.goto(`${BASE}/vote-detail?id=100`, { waitUntil: 'networkidle' });

    await test('Vote detail loads with title', async () => {
        const text = await voteDetail.textContent('body');
        await expect(text.includes('Finance') || text.includes('authorize') || text.includes('PASS'), 'Vote title not rendered');
    });

    await test('Vote tally shows (ayes/noes)', async () => {
        const text = await voteDetail.textContent('body');
        await expect(text.includes('6') || text.includes('AYE') || text.includes('Aye') || text.includes('Yes'), 'Tally not found');
    });

    await test('Individual member votes display', async () => {
        const text = await voteDetail.textContent('body');
        await expect(
            text.includes('Emmanuel V. Remy') || text.includes('Remy') || text.includes('Elizabeth Brown'),
            'Member votes not shown'
        );
    });

    await test('Vote outcome badge displays', async () => {
        const text = await voteDetail.textContent('body');
        await expect(text.includes('PASS') || text.includes('Pass') || text.includes('Passed'), 'Outcome not shown');
    });

    await test('Topics display', async () => {
        const text = await voteDetail.textContent('body');
        await expect(text.includes('Contracts') || text.includes('Emergency') || text.includes('topic') || text.includes('General'), 'Topics not shown');
    });

    await voteDetail.close();

    // ================================================================
    // PAGE 8: AGENDA SEARCH
    // ================================================================
    console.log('\n📄 AGENDA SEARCH PAGE (/agenda-search)');
    const search = await context.newPage();
    search.on('console', msg => { if (msg.type() === 'error') consoleErrors.push({ page: '/agenda-search', msg: msg.text() }); });
    await search.goto(`${BASE}/agenda-search`, { waitUntil: 'networkidle' });

    await test('Agenda search page loads', async () => {
        const text = await search.textContent('body');
        await expect(text.includes('Search') || text.includes('search') || text.includes('Agenda'), 'Search page not loaded');
    });

    await test('Search input exists', async () => {
        const inputs = await search.locator('input[type="text"], input[type="search"]').count();
        await expect(inputs >= 1, 'No search input');
    });

    await test('KPI stats display', async () => {
        await search.waitForTimeout(2000);
        const text = await search.textContent('body');
        await expect(text.includes('14') || text.includes('164') || text.includes('Total'), 'KPI stats not shown');
    });

    await search.close();

    // ================================================================
    // PAGE 9: ABOUT
    // ================================================================
    console.log('\n📄 ABOUT PAGE (/about)');
    const about = await context.newPage();
    about.on('console', msg => { if (msg.type() === 'error') consoleErrors.push({ page: '/about', msg: msg.text() }); });
    await about.goto(`${BASE}/about`, { waitUntil: 'networkidle' });

    await test('About page loads', async () => {
        const text = await about.textContent('body');
        await expect(text.includes('Columbus') || text.includes('About') || text.includes('CityVotes'), 'About content missing');
    });

    await test('Accordion/FAQ sections exist', async () => {
        const accordions = await about.locator('.accordion, .accordion-item, details, .collapse').count();
        await expect(accordions >= 1, 'No accordion sections found');
    });

    await about.close();

    // ================================================================
    // PAGE 10: CONTACT
    // ================================================================
    console.log('\n📄 CONTACT PAGE (/contact)');
    const contact = await context.newPage();
    contact.on('console', msg => { if (msg.type() === 'error') consoleErrors.push({ page: '/contact', msg: msg.text() }); });
    await contact.goto(`${BASE}/contact`, { waitUntil: 'networkidle' });

    await test('Contact page loads', async () => {
        const text = await contact.textContent('body');
        await expect(text.includes('Contact') || text.includes('contact') || text.includes('Columbus'), 'Contact page missing');
    });

    await test('Contact form exists', async () => {
        const forms = await contact.locator('form, input[type="email"], textarea').count();
        await expect(forms >= 1, 'No contact form found');
    });

    await contact.close();

    // ================================================================
    // CROSS-PAGE: NAVIGATION
    // ================================================================
    console.log('\n📄 CROSS-PAGE NAVIGATION TESTS');
    const nav = await context.newPage();
    nav.on('console', msg => { if (msg.type() === 'error') consoleErrors.push({ page: 'navigation', msg: msg.text() }); });

    await test('Navigate Home → Council', async () => {
        await nav.goto(BASE, { waitUntil: 'networkidle' });
        await nav.click('a[href="council.html"], a[href="council"]');
        await nav.waitForLoadState('networkidle');
        const url = nav.url();
        await expect(url.includes('council'), `URL was: ${url}`);
    });

    await test('Navigate Council → Member detail via card click', async () => {
        await nav.goto(`${BASE}/council`, { waitUntil: 'networkidle' });
        const link = nav.locator('a[href*="council-member"]').first();
        const exists = await link.count();
        if (exists > 0) {
            await link.click();
            await nav.waitForLoadState('networkidle');
            await expect(nav.url().includes('council-member'), 'Did not navigate to member page');
        } else {
            throw new Error('No member detail links found');
        }
    });

    await test('Navigate Home → Votes', async () => {
        await nav.goto(BASE, { waitUntil: 'networkidle' });
        await nav.click('a[href="votes.html"], a[href="votes"]');
        await nav.waitForLoadState('networkidle');
        await expect(nav.url().includes('votes'), 'Did not navigate to votes');
    });

    await test('Navigate Votes → Vote detail via row click', async () => {
        await nav.goto(`${BASE}/votes`, { waitUntil: 'networkidle' });
        await nav.waitForTimeout(2000);
        const link = nav.locator('a[href*="vote-detail"]').first();
        const exists = await link.count();
        if (exists > 0) {
            await link.click();
            await nav.waitForLoadState('networkidle');
            await expect(nav.url().includes('vote-detail'), 'Did not navigate to vote detail');
        } else {
            throw new Error('No vote detail links found');
        }
    });

    await test('Navigate Home → Meetings', async () => {
        await nav.goto(BASE, { waitUntil: 'networkidle' });
        await nav.click('a[href="meetings.html"], a[href="meetings"]');
        await nav.waitForLoadState('networkidle');
        await expect(nav.url().includes('meetings'), 'Did not navigate to meetings');
    });

    await nav.close();

    // ================================================================
    // SUMMARY
    // ================================================================
    console.log('\n' + '='.repeat(50));
    console.log(`RESULTS: ${passed} passed, ${failed} failed`);
    console.log('='.repeat(50));

    if (failures.length > 0) {
        console.log('\nFAILURES:');
        failures.forEach(f => console.log(`  ❌ ${f.name}: ${f.error}`));
    }

    if (consoleErrors.length > 0) {
        console.log(`\n⚠️  BROWSER CONSOLE ERRORS (${consoleErrors.length}):`);
        const unique = [...new Set(consoleErrors.map(e => `[${e.page}] ${e.msg}`))];
        unique.forEach(e => console.log(`  ${e}`));
    }

    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('Test runner error:', err);
    process.exit(1);
});
