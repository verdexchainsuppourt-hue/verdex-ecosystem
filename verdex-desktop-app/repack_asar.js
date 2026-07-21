const fs = require('fs');
const path = require('path');

const root = path.resolve('.');
const extractDir = path.resolve('temp_asar_extract');
const asarPath = path.join(root, 'dist', 'win-unpacked', 'resources', 'app.asar');
const tempAsarPath = `${asarPath}.new`;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const retry = async (action, attempts, delay) => {
  for (let i = 0; i < attempts; i += 1) {
    try {
      return action();
    } catch (err) {
      if (i === attempts - 1) throw err;
      await wait(delay);
    }
  }
};

function obfuscateJS(code) {
  // 1. Strip comments safely
  let clean = code.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1');
  
  // 2. Hide string literals using charCode arrays to prevent simple text search extraction (excl. require() and object keys)
  clean = clean.replace(/(require\s*\(\s*['"][^'"]+['"]\s*\))|(['"])((?:[^\\]|\\.)*?)\2(\s*:)?/g, (match, req, quote, content, colon) => {
    if (req) return req;
    if (colon) return match;
    if (!content || content.length < 5 || content.includes('\\')) return match;
    const charCodes = [];
    for (let i = 0; i < content.length; i++) {
      charCodes.push(content.charCodeAt(i));
    }
    return `String.fromCharCode(${charCodes.join(',')})`;
  });

  return clean;
}

function obfuscateHTML(html) {
  return html.replace(/<script>([\s\S]*?)<\/script>/gi, (match, js) => {
    return `<script>\n${obfuscateJS(js)}\n</script>`;
  });
}

async function main() {
  const asar = await import('@electron/asar');

  if (fs.existsSync(extractDir)) {
    fs.rmSync(extractDir, { recursive: true, force: true });
  }

  asar.extractAll(asarPath, extractDir);

  const copyRecursive = (srcDir, destDir) => {
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
      const srcPath = path.join(srcDir, entry.name);
      const destPath = path.join(destDir, entry.name);
      if (entry.isDirectory()) {
        copyRecursive(srcPath, destPath);
      } else {
        if (entry.name.endsWith('.js') && !srcPath.includes('node_modules') && !srcPath.includes('ui\\lib')) {
          let content = fs.readFileSync(srcPath, 'utf8');
          content = obfuscateJS(content);
          fs.writeFileSync(destPath, content, 'utf8');
        } else if (entry.name.endsWith('.html') && !srcPath.includes('node_modules')) {
          let content = fs.readFileSync(srcPath, 'utf8');
          content = obfuscateHTML(content);
          fs.writeFileSync(destPath, content, 'utf8');
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    }
  };

  const filesToCopy = ['auth.html', 'main.js', 'preload.js', 'splash.html'];
  for (const fileName of filesToCopy) {
    const srcPath = path.join(root, fileName);
    const destPath = path.join(extractDir, fileName);
    let content = fs.readFileSync(srcPath, 'utf8');
    if (fileName.endsWith('.js')) {
      content = obfuscateJS(content);
    } else if (fileName.endsWith('.html')) {
      content = obfuscateHTML(content);
    }
    fs.writeFileSync(destPath, content, 'utf8');
  }

  copyRecursive(path.join(root, 'ui'), path.join(extractDir, 'ui'));
  copyRecursive(path.join(root, 'node_modules'), path.join(extractDir, 'node_modules'));
  const depPath = path.join(root, 'node_modules', 'systeminformation');
  if (fs.existsSync(depPath)) {
    copyRecursive(depPath, path.join(extractDir, 'node_modules', 'systeminformation'));
  }

  if (fs.existsSync(tempAsarPath)) {
    await retry(() => fs.unlinkSync(tempAsarPath), 5, 400);
  }

  console.log('Repacking app.asar with obfuscated files for reverse engineering protection...');
  await asar.createPackage(extractDir, tempAsarPath);

  if (fs.existsSync(asarPath)) {
    await retry(() => fs.unlinkSync(asarPath), 8, 500);
  }

  await retry(() => fs.renameSync(tempAsarPath, asarPath), 8, 500);
  console.log('Repacked app.asar successfully:', asarPath);
}

main().catch((err) => {
  console.error('Failed to repack app.asar:', err);
  process.exit(1);
});
