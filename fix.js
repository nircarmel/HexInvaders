const fs = require('fs');
let css = fs.readFileSync('css/style.css', 'utf8');
let goodCode = css.split('.dim-label:has(input[type="radio"]:checked) {')[0];
fs.writeFileSync('css/style.css', goodCode + '.dim-label:has(input[type="radio"]:checked) {\n    color: white;\n    font-weight: bold;\n    border-style: solid;\n}\n\n.btn-primary.btn-red {\n    background: #ef4444;\n    border-color: rgba(239, 68, 68, 0.5);\n}\n.btn-primary.btn-red:hover {\n    background: #b91c1c;\n    box-shadow: 0 0 15px rgba(239, 68, 68, 0.6);\n}\n');
