import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { loadGatewayConfig } from '../../apps/auth-gateway/src/config.js';
const origin = 'https://tashan-tuyan-codex-test.tashan.chat';

test('preview browser API and account links never fall back to a production origin', async () => {
  const source = readFileSync(new URL('../../apps/web/src/lib/runtimePolicy.js', import.meta.url), 'utf8')
    .replace('import.meta.env?.VITE_TUYAN_PREVIEW_ORIGIN', JSON.stringify(origin));
  const policy = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  assert.equal(policy.officialApiBase(origin), origin);
  assert.equal(policy.officialApiBase('https://tuyansci.cn'), origin);
  assert.equal(policy.accountPageUrl('reset-password.html', origin), `${origin}/account/reset-password.html`);
  assert.equal(policy.validateApiBase(origin, false), origin);
  for (const value of ['https://api.paperbanana.asia', 'https://tuyansci.cn', 'https://neighbor.tashan.chat', `${origin}.evil.example`]) {
    assert.throws(() => policy.validateApiBase(value, true), /isolated/);
  }
});

test('gateway accepts the exact preview callbacks and rejects production and neighboring sites', () => {
  const env = {
    NODE_ENV: 'production', AUTH_BASE_URL: origin, TUYAN_PREVIEW_ORIGIN: origin,
    AUTH_VERIFICATION_CALLBACK_URL: `${origin}/account/email-verified.html`,
    AUTH_PASSWORD_RESET_URL: `${origin}/account/reset-password.html`,
    BETTER_AUTH_SECRET: 'fixture-auth-secret-32-characters-minimum',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/test', PAPERBANANA_API_URL: 'http://127.0.0.1:3000',
    PAPERBANANA_GATEWAY_TOKEN: 'fixture-gateway', PAPERBANANA_GUEST_COOKIE_SECRET: 'fixture-guest-secret-32-characters-minimum',
    ADMIN_USER_IDS: 'test-admin', FRONTEND_ORIGINS: origin,
  };
  const config = loadGatewayConfig(env);
  assert.equal(config.authEmail.resetPasswordUrl, env.AUTH_PASSWORD_RESET_URL);
  assert.ok(!config.frontendOrigins.includes('https://tuyansci.cn'));
  for (const value of ['https://tuyansci.cn', 'https://neighbor.tashan.chat', 'http://tashan-tuyan-codex-test.tashan.chat']) {
    assert.throws(() => loadGatewayConfig({ ...env, AUTH_PASSWORD_RESET_URL: value }), /exact preview|https/);
  }
});

test('TokenDance callback stays on the preview and rejects a different branch', () => {
  const script = `
    import assert from 'node:assert/strict';
    import {createTokenDanceService} from './src/tokendance-service.ts';
    import {memoryDb} from '../../test-support/memory-db.mjs';
    const origin=${JSON.stringify(origin)};
    const service=createTokenDanceService({db:memoryDb(),secret:Buffer.alloc(32,13).toString('base64'),previewOrigin:origin,callbackUrl:origin+'/'});
    const result=await service.handle({action:'tokenDanceAuthorize',platform:'web',callbackOrigin:origin},'preview-user');
    const callback=new URL(new URL(result.authorizationUrl).searchParams.get('callback_url'));
    assert.equal(callback.origin,origin);
    for(const bad of ['https://tuyansci.cn','https://another.tashan.chat']) await assert.rejects(service.handle({action:'tokenDanceAuthorize',platform:'web',callbackOrigin:bad},'preview-user'));
    assert.throws(()=>createTokenDanceService({db:memoryDb(),previewOrigin:origin,callbackUrl:'https://www.paperbanana.asia/'}));
  `;
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
    cwd: new URL('../../apps/paperbanana-api/', import.meta.url), encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
});
