import { readFileSync, writeFileSync, mkdirSync, existsSync, chownSync, chmodSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const { MongoClient } = createRequire('/opt/core/package.json')('mongodb');
const origin = process.env.TUYAN_PREVIEW_ORIGIN;
if (!/^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.tashan\.chat$/.test(origin || '')) throw new Error('Invalid preview origin');
const external = JSON.parse(readFileSync('/data/external.json', 'utf8'));
if (!/^tuyan-preview-/.test(external.bucket || '') || !/^oss-cn-[a-z0-9-]+$/.test(external.region || '') ||
    !external.accessKeyId || !external.accessKeySecret) throw new Error('Dedicated preview OSS configuration is required');
const secret = () => randomBytes(48).toString('base64url');
mkdirSync('/data/mongodb', { recursive: true });
chownSync('/data/mongodb', 999, 999);
if (!existsSync('/data/runtime.json')) {
  writeFileSync('/data/runtime.json', JSON.stringify({
    origin, mongoRoot: secret(), mongoAuth: secret(), mongoCore: secret(),
    auth: secret(), gateway: secret(), guest: secret(), admin: secret(), upload: secret(),
    tokenDance: randomBytes(32).toString('base64'), replica: randomBytes(384).toString('base64'),
  }), { mode: 0o600, flag: 'wx' });
}
const state = JSON.parse(readFileSync('/data/runtime.json', 'utf8'));
if (state.origin !== origin) throw new Error('Persistent volume belongs to a different preview origin');
writeFileSync('/data/mongo-keyfile', state.replica, { mode: 0o400 });
chownSync('/data/mongo-keyfile', 999, 999);
chmodSync('/data/mongo-keyfile', 0o400);
const children = [];
let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  // Stop HTTP and application processes before MongoDB.
  for (const child of [...children].reverse()) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 25000).unref();
  Promise.all(children.map(child => new Promise(resolve => {
    if (child.exitCode !== null) resolve();
    else child.once('exit', resolve);
  }))).then(() => process.exit(code));
}
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => shutdown());
function run(name, command, args, options = {}) {
  const child = spawn(command, args, { stdio: 'inherit', ...options });
  children.push(child);
  child.on('error', () => { console.error(`${name} could not start`); shutdown(1); });
  child.on('exit', code => {
    if (!stopping) { console.error(`${name} exited (${code})`); shutdown(1); }
  });
  return child;
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
run('mongodb', 'mongod', ['--bind_ip', '127.0.0.1', '--port', '27017', '--dbpath', '/data/mongodb',
  '--auth', '--replSet', 'rs0', '--keyFile', '/data/mongo-keyfile', '--wiredTigerCacheSizeGB', '0.35'],
  { uid: 999, gid: 999 });
const uri = (user, password, db) => `mongodb://${user}:${encodeURIComponent(password)}@127.0.0.1:27017/${db}?authSource=${db}&replicaSet=rs0&directConnection=true`;
const rootUri = uri('preview_root', state.mongoRoot, 'admin');
try {
  let admin;
  for (let i = 0; i < 90; i++) {
    const candidate = new MongoClient(rootUri, { serverSelectionTimeoutMS: 1000 });
    try { await candidate.connect(); admin = candidate; break; }
    catch {
      await candidate.close();
      const bootstrap = new MongoClient('mongodb://127.0.0.1:27017/?directConnection=true', { serverSelectionTimeoutMS: 1000 });
      try {
        await bootstrap.connect();
        try { await bootstrap.db('admin').command({ replSetInitiate: { _id: 'rs0', members: [{ _id: 0, host: '127.0.0.1:27017' }] } }); } catch {}
        if ((await bootstrap.db('admin').command({ hello: 1 })).isWritablePrimary) {
          await bootstrap.db('admin').command({ createUser: 'preview_root', pwd: state.mongoRoot, roles: ['root'] });
        }
      } catch {} finally { await bootstrap.close(); }
      await delay(1000);
    }
  }
  if (!admin) throw new Error('Preview database bootstrap failed');
  for (const [db, user, password] of [
    ['tuyan_preview_auth', 'preview_auth', state.mongoAuth],
    ['tuyan_preview_core', 'preview_core', state.mongoCore],
  ]) {
    const found = await admin.db(db).command({ usersInfo: user });
    if (!found.users.length) await admin.db(db).command({ createUser: user, pwd: password, roles: [{ role: 'readWrite', db }] });
  }
  await admin.close();
  const common = { PATH: process.env.PATH, NODE_ENV: 'production', TZ: 'Asia/Shanghai',
    TUYAN_PREVIEW_ORIGIN: origin, PAPERBANANA_GATEWAY_TOKEN: state.gateway };
  run('core', 'node', ['dist/server.cjs'], { cwd: '/opt/core', uid: 1001, gid: 1001, env: {
    ...common, HOME: '/home/preview', HOST: '127.0.0.1', PORT: '3000',
    NODE_OPTIONS: '--max-old-space-size=1024', PAPERBANANA_SINGLE_REPLICA: 'true',
    MONGODB_URI: uri('preview_core', state.mongoCore, 'tuyan_preview_core'), MONGODB_BUSINESS_DB: 'tuyan_preview_core',
    OSS_REGION: external.region, OSS_ACCESS_KEY_ID: external.accessKeyId, OSS_ACCESS_KEY_SECRET: external.accessKeySecret,
    PAPERBANANA_BUCKET: external.bucket, OSS_INTERNAL_ENDPOINT: `https://${external.region}-internal.aliyuncs.com`,
    OSS_PUBLIC_ENDPOINT: `https://${external.region}.aliyuncs.com`, PAPERBANANA_OSS_SERVER_ENDPOINT_MODE: 'public',
    PAPERBANANA_PROVIDER_EGRESS_MODE: 'disabled', PAPERBANANA_PROVIDER_DIRECT_HOSTS: 'tokendance.space,ark.cn-beijing.volces.com,api.fireworks.ai',
    REFERENCE_UPLOAD_TOKEN_SECRET: state.upload,
    PAPERBANANA_BENCH_API_ENABLED: 'false', TOKENDANCE_ENCRYPTION_KEY: state.tokenDance, TOKENDANCE_CALLBACK_URL: `${origin}/`,
  } });
  run('gateway', 'node', ['src/server.js'], { cwd: '/opt/gateway/apps/auth-gateway', uid: 1001, gid: 1001, env: {
    ...common, HOME: '/home/preview', HOST: '127.0.0.1', PORT: '3005', NODE_OPTIONS: '--max-old-space-size=384',
    PAPERBANANA_API_URL: 'http://127.0.0.1:3000/paperbanana-api', AUTH_BASE_URL: origin, FRONTEND_ORIGINS: origin,
    BETTER_AUTH_SECRET: state.auth, PAPERBANANA_GUEST_COOKIE_SECRET: state.guest,
    ADMIN_USER_IDS: `unassigned-preview-${state.admin}`, COOKIE_DOMAIN: '', COOKIE_SAME_SITE: 'lax',
    MONGODB_URI: uri('preview_auth', state.mongoAuth, 'tuyan_preview_auth'), MONGODB_DB: 'tuyan_preview_auth',
    AUTH_EMAIL_DELIVERY_ENABLED: 'false', AUTH_REQUIRE_EMAIL_VERIFICATION: 'false', WATCHA_OAUTH_ENABLED: 'false',
    AUTH_VERIFICATION_CALLBACK_URL: `${origin}/account/email-verified.html`,
    AUTH_PASSWORD_RESET_URL: `${origin}/account/reset-password.html`,
    PAPERBANANA_BUCKET: external.bucket, OSS_PUBLIC_ENDPOINT: `https://${external.region}.aliyuncs.com`,
  } });
  let nginx = readFileSync('/opt/preview/nginx.conf', 'utf8');
  nginx = nginx.replaceAll('__PREVIEW_HOST__', new URL(origin).hostname)
    .replaceAll('__OSS_ORIGIN__', `https://${external.bucket}.${external.region}.aliyuncs.com`);
  writeFileSync('/tmp/preview-nginx.conf', nginx, { mode: 0o644 });
  run('nginx', 'nginx', ['-c', '/tmp/preview-nginx.conf', '-g', 'daemon off;']);
} catch (error) {
  // Error values may contain connection URIs, so only emit an operation label.
  console.error('Preview startup failed; check database and dedicated OSS configuration.');
  shutdown(1);
}
