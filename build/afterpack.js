/* ================================================================
   afterpack.js — electron-builder hook
   Menyuntik ikon + version info ke KINOSTRA.exe TANPA wine
   (resedit/pe-library — editor PE murni JavaScript)
   ================================================================ */
const fs = require('fs');
const path = require('path');
const resedit = require('resedit');

exports.default = async function afterPack(context) {
  const { appOutDir, packager, electronPlatformName } = context;
  if (electronPlatformName !== 'win32') return;

  const exeName = `${packager.appInfo.productFilename}.exe`;
  const exePath = path.join(appOutDir, exeName);
  if (!fs.existsSync(exePath)) {
    console.warn('[afterpack] exe tidak ditemukan:', exePath);
    return;
  }
  console.log('[afterpack] Menyuntik ikon & versi ke', exeName, '…');

  const iconPath = path.join(__dirname, 'icon.ico');
  if (!fs.existsSync(iconPath)) { console.warn('[afterpack] icon.ico hilang'); return; }

  const exe = resedit.NtExecutable.from(fs.readFileSync(exePath));
  const res = resedit.NtExecutableResource.from(exe);

  /* --- ikon: hapus group lama, pasang dari icon.ico --- */
  const iconFile = resedit.Data.IconFile.from(fs.readFileSync(iconPath));
  resedit.Resource.IconGroupEntry.replaceIconsForResource(
    res.entries,
    1,        // id group ikon
    1033,     // lang
    iconFile.icons.map(i => i.data)
  );

  /* --- version info --- */
  const vi = resedit.Resource.VersionInfo.createEmpty();
  vi.setFileVersion({ major: 2, minor: 8, patch: 0, build: 0 });
  vi.setProductVersion({ major: 2, minor: 8, patch: 0, build: 0 });
  vi.setStringValues({ lang: 1033, id: 1033 }, {
    CompanyName: 'KINOSTRA',
    FileDescription: 'KINOSTRA — Suite Video Otonom (Desktop Offline)',
    FileVersion: '2.9.0.0',
    InternalName: 'KINOSTRA',
    LegalCopyright: 'MIT License',
    OriginalFilename: exeName,
    ProductName: 'KINOSTRA',
    ProductVersion: '2.9.0.0'
  });
  vi.outputToResourceEntries(res.entries);

  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
  console.log('[afterpack] Ikon + versi tersuntik sukses.');
};
