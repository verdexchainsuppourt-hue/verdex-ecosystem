const fs = require('fs');
const path = require('path');
const asar = require('./node_modules/@electron/asar');

const root = path.resolve('.');
const extractDir = path.resolve('temp_asar_extract');
const asarPath = path.join(root, 'dist', 'win-unpacked', 'resources', 'app.asar');
const tempAsarPath = `${asarPath}.new`;

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
      fs.copyFileSync(srcPath, destPath);
    }
  }
};

const filesToCopy = ['auth.html', 'main.js', 'preload.js', 'splash.html'];
for (const fileName of filesToCopy) {
  const srcPath = path.join(root, fileName);
  const destPath = path.join(extractDir, fileName);
  fs.copyFileSync(srcPath, destPath);
}

copyRecursive(path.join(root, 'ui'), path.join(extractDir, 'ui'));
copyRecursive(path.join(root, 'node_modules'), path.join(extractDir, 'node_modules'));
const depPath = path.join(root, 'node_modules', 'systeminformation');
if (fs.existsSync(depPath)) {
  copyRecursive(depPath, path.join(extractDir, 'node_modules', 'systeminformation'));
}

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

async function main() {
  if (fs.existsSync(tempAsarPath)) {
    await retry(() => fs.unlinkSync(tempAsarPath), 5, 400);
  }

  console.log('Repacking app.asar from updated source files...');
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
