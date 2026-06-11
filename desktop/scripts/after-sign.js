const { execSync } = require('child_process')

exports.default = async function afterSign(context) {
  // 只在 macOS 上执行 ad-hoc 签名
  if (process.platform !== 'darwin') return

  const appPath = context.appOutDir + '/' + context.packager.appInfo.productFilename + '.app'

  console.log('[after-sign] Ad-hoc signing:', appPath)

  try {
    // 签名 .app bundle
    execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' })

    // 验证签名
    execSync(`codesign --verify --deep --strict "${appPath}"`, { stdio: 'inherit' })

    console.log('[after-sign] Ad-hoc signing successful')
  } catch (err) {
    console.error('[after-sign] Ad-hoc signing failed:', err.message)
    throw err
  }
}
