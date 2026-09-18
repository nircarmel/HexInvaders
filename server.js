const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 8080;

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif'
};

const server = http.createServer((request, response) => {
    // Strip query parameters naturally using the base URL
    let urlString = request.url;
    if (urlString.includes('?')) {
        urlString = urlString.split('?')[0];
    }

    let filePath = '.' + urlString;
    if (filePath === './') {
        filePath = './index.html';
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                response.writeHead(404, { 'Content-Type': 'text/plain' });
                response.end('404 Not Found', 'utf-8');
            } else {
                response.writeHead(500);
                response.end('Server Error: ' + error.code + '\n');
            }
        } else {
            response.writeHead(200, { 'Content-Type': contentType });
            response.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n=================================================`);
    console.log(`     Hex-Invaders Server Started!        `);
    console.log(`=================================================\n`);
    console.log(`Open either of these generic links safely in your browser:\n`);
    console.log(`--> [For this Laptop]:     http://localhost:${PORT}`);

    const interfaces = os.networkInterfaces();
    for (let k in interfaces) {
        for (let k2 in interfaces[k]) {
            const address = interfaces[k][k2];
            if (address.family === 'IPv4' && !address.internal) {
                console.log(`--> [For ANY Wi-Fi device]: http://${address.address}:${PORT}`);
            }
        }
    }
    console.log(`\nLeave this terminal open while you play!`);
});
