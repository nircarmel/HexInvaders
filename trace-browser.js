import puppeteer from 'puppeteer';

(async () => {
    try {
        const browser = await puppeteer.launch({ headless: "new" });
        const page = await browser.newPage();

        // Listen to console logs
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));

        // Listen to page errors
        page.on('pageerror', error => console.error('PAGE ERROR:', error.message));

        // Listen to failed requests
        page.on('requestfailed', request => console.error(`REQUEST FAILED: ${request.url()} - ${request.failure().errorText}`));

        // Open the local file directly
        const fileUrl = `file:///${process.cwd().replace(/\\/g, '/')}/index.html`;
        console.log("Navigating to:", fileUrl);

        await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 5000 });

        // Verify class lists organically in the browser
        const configClass = await page.$eval('#config-modal', el => el.className);
        const menuClass = await page.$eval('#main-menu', el => el.className);

        console.log("Browser DOM Extraction:");
        console.log("config-modal CSS classes:", configClass);
        console.log("main-menu CSS classes:", menuClass);

        await browser.close();
        console.log("Puppeteer diagnostics successfully complete.");
    } catch (e) {
        console.error("Puppeteer Automation Error:", e);
    }
})();
