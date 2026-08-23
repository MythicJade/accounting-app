import { randomBytes } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const outputDir = path.resolve(process.argv[2] || '');
const javaHome = process.env.JAVA_HOME;
if (!process.argv[2] || !javaHome) {
  throw new Error('Usage: JAVA_HOME=<jdk> node scripts/create-release-keystore.mjs <output-directory>');
}

const keystorePath = path.join(outputDir, '我的记账-v2.1.1-release-key.jks');
const credentialsPath = path.join(outputDir, '我的记账-v2.1.1-签名信息.txt');
const keytool = path.join(javaHome, 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool');

await mkdir(outputDir, { recursive: true });
try {
  await access(keystorePath);
  throw new Error(`Keystore already exists: ${keystorePath}`);
} catch (error) {
  if (error.message.startsWith('Keystore already exists:')) throw error;
}

const password = randomBytes(24).toString('base64url');
const alias = 'accounting-release';
const result = spawnSync(keytool, [
  '-genkeypair',
  '-v',
  '-keystore', keystorePath,
  '-storepass:env', 'ACCOUNTING_KEYSTORE_PASSWORD',
  '-keypass:env', 'ACCOUNTING_KEYSTORE_PASSWORD',
  '-alias', alias,
  '-keyalg', 'RSA',
  '-keysize', '4096',
  '-validity', '10000',
  '-dname', 'CN=MythicJade Accounting, OU=Personal, O=MythicJade, L=Local, ST=Local, C=CN'
], {
  encoding: 'utf8',
  env: { ...process.env, ACCOUNTING_KEYSTORE_PASSWORD: password }
});

if (result.status !== 0) {
  throw new Error(`keytool failed: ${result.stderr || result.stdout}`);
}

await writeFile(credentialsPath, [
  '我的记账 Android 正式签名信息',
  '================================',
  `密钥文件：${path.basename(keystorePath)}`,
  `别名：${alias}`,
  `密钥库密码：${password}`,
  `密钥密码：${password}`,
  '',
  '重要：以后发布可覆盖安装的新版本时，必须使用同一个密钥文件、别名和密码。',
  '请把本文件与 .jks 密钥文件一起备份到安全位置，不要上传到公开仓库。',
  ''
].join('\r\n'), 'utf8');

console.log(JSON.stringify({ keystorePath, credentialsPath, alias }));
