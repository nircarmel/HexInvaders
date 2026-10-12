import fs from 'fs';
import { JSDOM } from 'jsdom';

const html = fs.readFileSync('index.html', 'utf8');
const dom = new JSDOM(html, { runScripts: "dangerously" });

// Assign globals so the script doesn't throw ReferenceErrors
global.window = dom.window;
global.document = dom.window.document;
global.URLSearchParams = dom.window.URLSearchParams;

try {
    const script = fs.readFileSync('js/bundle.js', 'utf8');
    dom.window.eval(script);

    // Simulate DOMContentLoaded explicitly if not fired automatically
    const event = new dom.window.Event('DOMContentLoaded');
    dom.window.document.dispatchEvent(event);

    console.log("Execution successful!");

    console.log("configModal class list: ", dom.window.document.getElementById('config-modal').className);
    console.log("mainMenu class list: ", dom.window.document.getElementById('main-menu').className);
} catch (e) {
    console.error("DOM Execution Error:", e);
}
