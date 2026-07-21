const asar=require('./node_modules/@electron/asar');
const fs=require('fs');
const path=require('path');
const ada=path.resolve('dist/win-unpacked/resources/app.asar');
const outdir=path.resolve('temp_asar_extract');
if (fs.existsSync(outdir)) fs.rmSync(outdir,{recursive:true,force:true});
asar.extractAll(ada,outdir);
const auth=fs.readFileSync(path.join(outdir,'auth.html'),'utf8');
const ui=fs.readFileSync(path.join(outdir,'ui','index.html'),'utf8');
console.log('auth-icon', auth.includes('auth-icon'));
console.log('btnMinimizeTray', auth.includes('btnMinimizeTray'));
console.log('net-visual', ui.includes('class="net-visual"'));
console.log('sb-globe-wrap', ui.includes('sb-globe-wrap'));

