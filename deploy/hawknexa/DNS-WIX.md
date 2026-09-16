# Wix DNS for HawkNexa (fynals.com)

Point these subdomains to your VPS IP: **187.53.141.109**

In Wix: **Domains → fynals.com → Manage DNS Records** (or DNS Settings).

| Type | Host / Name | Value | TTL |
|------|-------------|-------|-----|
| A | `hawknexa` | `187.53.141.109` | 1 hour (or default) |
| A | `hawknexabackend` | `187.53.141.109` | 1 hour (or default) |

Result:

- Portal: `https://hawknexa.fynals.com`
- API: `https://hawknexabackend.fynals.com/api/v1`

## Verify DNS (after 5–30 minutes)

```bash
nslookup hawknexa.fynals.com
nslookup hawknexabackend.fynals.com
```

Both should return `187.53.141.109`.

## After DNS propagates

On the VPS, Caddy will request Let's Encrypt certificates automatically when you reload:

```bash
cd /opt/apps/hawknexa/deploy
docker compose -f docker-compose.prod.yml up -d --force-recreate caddy
```

## Notes

- Remove conflicting Wix "Connect to site" records for the same hostnames if they exist.
- If Wix does not allow A records on subdomains, you may need to use Wix's "Connect external host" or transfer DNS to Cloudflare (optional).
