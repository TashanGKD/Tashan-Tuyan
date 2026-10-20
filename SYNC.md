# Preview integration

## 2026-10-20 — Isolated Tashan deployment

- [x] Preview Web: `VITE_TUYAN_PREVIEW_ORIGIN` pins API/auth/account navigation
  to this preview's exact HTTPS origin; CSP blocks requests to production APIs.
- [x] Preview Gateway/Core: `TUYAN_PREVIEW_ORIGIN` permits only the configured
  account and TokenDance callback origin. Production defaults remain intact.
- [x] Deployment: document's existing `deploy-subdomain.sh`, own Docker image,
  `/data` named volume, independent Mongo replica set, random persistent secrets
  and independent private OSS. No production data migration.
- [ ] Runtime verification: record actual deployment and acceptance evidence.
- [ ] External integrations: email delivery, Watcha SSO, gVisor plot execution,
  foreign-provider routing and real model generation need separate validation.
- [x] Mini Program / production: no changes.
