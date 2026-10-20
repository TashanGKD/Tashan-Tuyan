# Preview integration

## 2026-10-20 — Isolated Tashan deployment

- [x] Preview Web: `VITE_TUYAN_PREVIEW_ORIGIN` pins API/auth/account navigation
  to this preview's exact HTTPS origin; CSP blocks requests to production APIs.
- [x] Preview Gateway/Core: `TUYAN_PREVIEW_ORIGIN` permits only the configured
  account and TokenDance callback origin. Production defaults remain intact.
- [x] Deployment: document's existing `deploy-subdomain.sh`, own Docker image,
  `/data` named volume, independent Mongo replica set, random persistent secrets
  and independent private OSS. No production data migration.
- [x] Deployment validation: Gateway uses Core's `/paperbanana-api` path;
  a real read-only business request gates deployment success. This container
  pins its allocated port to loopback so restarts preserve Nginx connectivity.
- [x] Preview signup explains the email/password flow without email delivery.
- [x] Runtime verification: deployment `68efcd0`, HTTPS/business readiness,
  independent account/attachment isolation, image update and explicit restart
  persistence passed. See `deploy/tashan/ACCEPTANCE.md`.
- [x] Real PNG generation: user authorized TokenDance in the independent account;
  Qwen3.8 Flash + Seedream 5.0 lite produced a downloadable PNG. Result and
  completed history survived page reload. Text spelling remains a visual-quality
  issue; this does not establish SVG/all-model acceptance. See acceptance record.
- [ ] External integrations remain disabled/unverified: email delivery, Watcha
  SSO, gVisor plot execution and additional foreign-provider routing.
- [x] Mini Program / production: no changes.
