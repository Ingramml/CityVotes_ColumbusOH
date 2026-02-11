const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('http://localhost:3456/council-member?id=3', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // Check for all selects
    const selects = await page.locator('select').all();
    console.log('Total selects found:', selects.length);
    for (const s of selects) {
        const id = await s.getAttribute('id');
        const optCount = await s.locator('option').count();
        const visible = await s.isVisible();
        const firstOpts = [];
        const opts = await s.locator('option').all();
        for (let i = 0; i < Math.min(5, opts.length); i++) {
            firstOpts.push(await opts[i].textContent());
        }
        console.log('  Select id=' + id + ', options=' + optCount + ', visible=' + visible);
        console.log('    First options:', firstOpts);
    }

    // Check topic filter specifically
    const topicFilter = page.locator('#voteTopicFilter');
    const exists = await topicFilter.count();
    console.log('\nvoteTopicFilter exists:', exists > 0);
    if (exists > 0) {
        const options = await topicFilter.locator('option').count();
        console.log('voteTopicFilter options:', options);
        const visible = await topicFilter.isVisible();
        console.log('voteTopicFilter visible:', visible);
        if (options <= 1) {
            console.log('PROBLEM: Topic filter has no options populated!');
        }
    }

    await browser.close();
})();
