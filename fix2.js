const fs = require('fs');
let css = fs.readFileSync('css/style.css', 'utf8');
css = css.replace('.team-panel {\r\n    background: var(--glass-bg);\r\n    padding: 0.75rem 1.5rem;\r\n    border-radius: 12px;\r\n    border: 1px solid;\r\n    backdrop-filter: blur(10px);\r\n    min-width: 200px;\r\n}',
    `.team-panel {
    background: var(--glass-bg);
    padding: 0.75rem 1.5rem;
    border-radius: 12px;
    border: 3px solid transparent;
    backdrop-filter: blur(10px);
    min-width: 200px;
    text-align: center;
}`);

css = css.replace('.team-panel.blue-team {\r\n    border-color: rgba(59, 130, 246, 0.3);\r\n}',
    `.team-panel.blue-team {
    border-color: rgba(59, 130, 246, 0.3);
}

.team-panel.blue-team.active-turn {
    border-color: #3b82f6;
    box-shadow: 0 0 15px rgba(59, 130, 246, 0.5);
}`);

css = css.replace('.team-panel.red-team {\r\n    border-color: rgba(239, 68, 68, 0.3);\r\n    text-align: right;\r\n}',
    `.team-panel.red-team {
    border-color: rgba(239, 68, 68, 0.3);
}

.team-panel.red-team.active-turn {
    border-color: #ef4444;
    box-shadow: 0 0 15px rgba(239, 68, 68, 0.5);
}`);

// If \r\n didn't match, try \n
css = css.replace('.team-panel {\n    background: var(--glass-bg);\n    padding: 0.75rem 1.5rem;\n    border-radius: 12px;\n    border: 1px solid;\n    backdrop-filter: blur(10px);\n    min-width: 200px;\n}',
    `.team-panel {
    background: var(--glass-bg);
    padding: 0.75rem 1.5rem;
    border-radius: 12px;
    border: 3px solid transparent;
    backdrop-filter: blur(10px);
    min-width: 200px;
    text-align: center;
}`);

css = css.replace('.team-panel.blue-team {\n    border-color: rgba(59, 130, 246, 0.3);\n}',
    `.team-panel.blue-team {
    border-color: rgba(59, 130, 246, 0.3);
}

.team-panel.blue-team.active-turn {
    border-color: #3b82f6;
    box-shadow: 0 0 15px rgba(59, 130, 246, 0.5);
}`);

css = css.replace('.team-panel.red-team {\n    border-color: rgba(239, 68, 68, 0.3);\n    text-align: right;\n}',
    `.team-panel.red-team {
    border-color: rgba(239, 68, 68, 0.3);
}

.team-panel.red-team.active-turn {
    border-color: #ef4444;
    box-shadow: 0 0 15px rgba(239, 68, 68, 0.5);
}`);

fs.writeFileSync('css/style.css', css);
