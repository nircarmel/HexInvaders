const fs = require('fs');
let css = fs.readFileSync('css/style.css', 'utf8');
css += `\n.history-prominent {
    position: fixed !important;
    top: 20px !important;
    left: 50% !important;
    transform: translateX(-50%) !important;
    background: rgba(100, 100, 100, 0.85) !important;
    padding: 10px 20px !important;
    font-size: 1.5rem !important;
    z-index: 1000 !important;
}
.history-prominent button {
    font-size: 1.2rem !important;
    padding: 10px 20px !important;
}\n`;

fs.writeFileSync('css/style.css', css);
