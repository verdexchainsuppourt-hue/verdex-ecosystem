const fs = require('fs');
const path = require('path');
const asar = require('./node_modules/@electron/asar');

const asarPath = path.resolve('dist', 'win-unpacked', 'resources', 'app.asar');
const extractDir = path.resolve('temp_asar_check_extract');

if (fs.existsSync(extractDir)) {
  fs.rmSync(extractDir, { recursive: true, force: true });
}

asar.extractAll(asarPath, extractDir);

const authPath = path.join(extractDir, 'auth.html');
const uiPath = path.join(extractDir, 'ui', 'index.html');

const auth = fs.existsSync(authPath) ? fs.readFileSync(authPath, 'utf8') : '';
const ui = fs.existsSync(uiPath) ? fs.readFileSync(uiPath, 'utf8') : '';

console.log('auth exists', fs.existsSync(authPath));
console.log('ui exists', fs.existsSync(uiPath));
console.log('auth length', auth.length);
console.log('ui length', ui.length);
console.log('auth contains auth-icon', auth.includes('auth-icon'));
console.log('auth contains btnMinimizeTray', auth.includes('btnMinimizeTray'));
console.log('ui contains net-visual', ui.includes('class="net-visual"'));
console.log('ui contains sb-globe-wrap', ui.includes('sb-globe-wrap'));
console.log('auth file sha256', require('crypto').createHash('sha256').update(auth, 'utf8').digest('hex'));
console.log('ui file sha256', require('crypto').createHash('sha256').update(ui, 'utf8').digest('hex'));
