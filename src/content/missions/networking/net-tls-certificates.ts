import type { MissionInput } from "@/content/schema";

const ROOT = "C = US, O = Lumen Logistics, CN = Lumen Internal Root CA 2024";
const ISSUING = "C = US, O = Lumen Logistics, CN = Lumen Issuing CA 01";

const reportsSClient = `$ date -u
Thu Nov  5 14:02:11 UTC 2026
$ openssl s_client -connect reports.lumen.internal:443 -servername reports.lumen.internal -verify_hostname reports.lumen.internal </dev/null
CONNECTED(00000003)
depth=2 ${ROOT}
verify return:1
depth=1 ${ISSUING}
verify return:1
depth=0 CN = reports.lumen.internal
verify error:num=10:certificate has expired
notAfter=Nov  3 23:59:59 2026 GMT
verify return:1
depth=0 CN = reports.lumen.internal
notAfter=Nov  3 23:59:59 2026 GMT
verify return:1
---
Certificate chain
 0 s:CN = reports.lumen.internal
   i:${ISSUING}
   a:PKEY: rsaEncryption, 2048 (bit); sigalg: RSA-SHA256
   v:NotBefore: Nov  4 00:00:00 2025 GMT; NotAfter: Nov  3 23:59:59 2026 GMT
 1 s:${ISSUING}
   i:${ROOT}
   a:PKEY: rsaEncryption, 4096 (bit); sigalg: RSA-SHA256
   v:NotBefore: Jan 15 00:00:00 2024 GMT; NotAfter: Jan 14 23:59:59 2029 GMT
---
Server certificate
subject=CN = reports.lumen.internal
issuer=${ISSUING}
---
No client certificate CA names sent
Peer signing digest: SHA256
Peer signature type: RSA-PSS
Server Temp Key: X25519, 253 bits
---
SSL handshake has read 3104 bytes and written 412 bytes
Verification error: certificate has expired
---
New, TLSv1.3, Cipher is TLS_AES_256_GCM_SHA384
Server public key is 2048 bit
Verify return code: 10 (certificate has expired)
---
`;

const apiSClient = `$ openssl s_client -connect api.lumen.internal:8443 -servername api.lumen.internal -verify_hostname api.lumen.internal </dev/null
CONNECTED(00000003)
depth=2 ${ROOT}
verify return:1
depth=1 ${ISSUING}
verify return:1
depth=0 CN = tracking-api.lumen.internal
verify error:num=62:hostname mismatch
verify return:1
---
Certificate chain
 0 s:CN = tracking-api.lumen.internal
   i:${ISSUING}
   a:PKEY: id-ecPublicKey, 256 (bit); sigalg: RSA-SHA256
   v:NotBefore: Aug 20 00:00:00 2026 GMT; NotAfter: Aug 19 23:59:59 2027 GMT
 1 s:${ISSUING}
   i:${ROOT}
   a:PKEY: rsaEncryption, 4096 (bit); sigalg: RSA-SHA256
   v:NotBefore: Jan 15 00:00:00 2024 GMT; NotAfter: Jan 14 23:59:59 2029 GMT
---
SSL handshake has read 2690 bytes and written 405 bytes
Verification error: hostname mismatch
---
New, TLSv1.3, Cipher is TLS_AES_128_GCM_SHA256
Verify return code: 62 (hostname mismatch)
---

$ openssl s_client -connect api.lumen.internal:8443 -servername api.lumen.internal </dev/null 2>/dev/null | openssl x509 -noout -subject -ext subjectAltName
subject=CN = tracking-api.lumen.internal
X509v3 Subject Alternative Name:
    DNS:tracking-api.lumen.internal, DNS:api-01.lumen.internal

$ dig +short api.lumen.internal
10.20.1.20
$ dig +short tracking-api.lumen.internal
10.20.1.20
`;

const portalSClient = `$ openssl s_client -connect portal.lumen.internal:443 -servername portal.lumen.internal -verify_hostname portal.lumen.internal </dev/null
CONNECTED(00000003)
depth=0 CN = portal.lumen.internal
verify error:num=20:unable to get local issuer certificate
verify return:1
depth=0 CN = portal.lumen.internal
verify error:num=21:unable to verify the first certificate
verify return:1
---
Certificate chain
 0 s:CN = portal.lumen.internal
   i:${ISSUING}
   a:PKEY: rsaEncryption, 2048 (bit); sigalg: RSA-SHA256
   v:NotBefore: Oct 28 00:00:00 2026 GMT; NotAfter: Oct 27 23:59:59 2027 GMT
---
SSL handshake has read 1688 bytes and written 409 bytes
Verification error: unable to verify the first certificate
---
New, TLSv1.3, Cipher is TLS_AES_256_GCM_SHA384
Verify return code: 21 (unable to verify the first certificate)
---

# nginx on web-01 (portal vhost), deployed 2026-10-28:
    ssl_certificate      /etc/ssl/portal/portal.lumen.internal.crt;   # leaf only
    ssl_certificate_key  /etc/ssl/portal/portal.lumen.internal.key;

# Files the PKI team delivered:
    portal.lumen.internal.crt          (leaf)
    portal.lumen.internal.chain.crt    (Lumen Issuing CA 01)
    portal.lumen.internal.fullchain.crt (leaf + Lumen Issuing CA 01)
`;

const clientReports = `# Collected by Aiko, Priya and Marco - 2026-11-05

[1] Finance (browser, reports.lumen.internal)
    "Your connection is not private"  NET::ERR_CERT_DATE_INVALID

[2] Marco - carrier-sync job on batch-02 (Python requests) calling the tracking API
    requests.exceptions.SSLError: HTTPSConnectionPool(host='api.lumen.internal', port=8443):
      Max retries exceeded with url: /v1/track/LX1042 (Caused by SSLError(SSLCertVerificationError(1,
      "[SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: Hostname mismatch, certificate is
      not valid for 'api.lumen.internal'. (_ssl.c:1006)")))
    Marco's proposed fix: requests.get(url, verify=False)

[3] Customer portal (portal.lumen.internal)
    Browsers: fine (padlock shown).
    curl from ops-ws:
      curl: (60) SSL certificate problem: unable to get local issuer certificate
    Support's uptime checker (curl-based): "DOWN" since Oct 28.

Trust store on ops-ws and batch-02:
    /usr/local/share/ca-certificates/lumen-root-2024.crt   (Lumen Internal Root CA 2024)
    -> installed via update-ca-certificates; Lumen Issuing CA 01 is NOT in the trust store (by design).
`;

export const netTlsCertificates: MissionInput = {
  slug: "net-tls-certificates",
  version: 1,
  track: "networking",
  tier: "advanced",
  order: 3,
  title: "Three padlock problems, three different causes",
  summary:
    "Three internal HTTPS services fail certificate verification in three different ways. Read openssl s_client evidence, tell expiry, hostname mismatch and missing intermediate apart, and pick each fix.",
  minutes: 35,
  assessmentTypes: ["interpret-output", "investigate-logs", "explain-root-cause", "order-steps"],
  skills: ["net.tls"],
  appliesSkills: ["net.http", "net.dns"],
  prerequisites: ["net-http-maintenance-503"],
  brief: {
    from: "Sam Ortiz, Engineering manager",
    channel: "#incidents",
    body: `It's been a bad TLS week. Three complaints landed on my desk this morning (collected in \`client-reports.txt\`):

1. Finance gets a browser warning on **reports.lumen.internal**.
2. Marco's carrier-sync job fails against **api.lumen.internal:8443**, and he wants to ship \`verify=False\` "for now".
3. The **customer portal** works in browsers, but support's uptime checker says it's down.

Priya captured \`openssl s_client\` output for each service. I don't want three tickets that all say "TLS broken" — I need to know which problem is which, who has to fix it, and whether Marco's workaround is acceptable.`,
  },
  objectives: [
    "Explain what a certificate proves: a CA vouches that a public key belongs to a name, for a period of time",
    "Follow a chain of trust from a leaf certificate through an intermediate to a trusted root",
    "Read `openssl s_client` output to identify expiry, hostname mismatch and incomplete-chain failures",
    "Choose the right fix for each failure and explain why disabling verification is not one",
  ],
  concept: {
    title: "What a TLS client checks before it trusts a server",
    body: `During the TLS handshake the server sends its **certificate** (the *leaf*) and usually one or more **intermediate** CA certificates. The client accepts the connection only if all of these hold:

1. **Chain of trust** — each certificate is signed by the next one up, ending at a **root CA** that is already in the client's trust store. Roots are never sent by the server; the client must already have them. If the server forgets the intermediate, many clients can't build the chain (*unable to get local issuer certificate*).
2. **Validity period** — the current time is between \`NotBefore\` and \`NotAfter\` for every certificate (*certificate has expired*).
3. **Name** — the hostname the client connected to appears in the leaf's **Subject Alternative Name** (SAN) list. The CN is ignored by modern clients (*hostname mismatch*).

\`openssl s_client\` shows the result per depth (0 = leaf, 1 = intermediate, 2 = root) and a final \`Verify return code\`:

\`\`\`
openssl s_client -connect host:443 -servername host -verify_hostname host </dev/null
\`\`\`

Encryption alone isn't the point: without verification you could be talking, encrypted, to anyone. That's why \`curl -k\` or \`verify=False\` don't fix a certificate problem — they switch off the check that detects impostors.`,
  },
  workedExample: {
    title: "Worked example: the internal Git server after a re-key",
    body: `\`git push\` to \`git.lumen.test\` fails with *server certificate verification failed*.

**1. Look at what the server presents:**
\`\`\`
$ openssl s_client -connect git.lumen.test:443 -servername git.lumen.test -verify_hostname git.lumen.test </dev/null
depth=2 CN = Lumen Test Root CA
verify return:1
depth=1 CN = Lumen Test Issuing CA
verify return:1
depth=0 CN = git.lumen.test
verify return:1
...
Verify return code: 0 (ok)
\`\`\`
From the ops workstation, everything verifies: chain complete, dates fine, name matches.

**2. Compare with the failing CI runner:** its trust store (\`/etc/ssl/certs\`) was built from an old image and lacks *Lumen Test Root CA*. The server is fine; the **client** doesn't trust the root.

**3. Fix in the right place:** install the root on the runner image (\`update-ca-certificates\`) rather than setting \`GIT_SSL_NO_VERIFY\`.

Reading the depth lines first tells you *which* certificate failed and therefore *who* must act: the server owner (leaf, chain), the PKI team (issuing), or the client owner (trust store).`,
  },
  simulationNote:
    "This is an evidence investigation: the lab simulator does not perform TLS handshakes, so the s_client captures and client errors are provided as files. All hosts, CAs and certificates are fictional.",
  workspace: {
    kind: "evidence",
    files: [
      { path: "client-reports.txt", content: clientReports, language: "text" },
      { path: "s_client-reports.txt", content: reportsSClient, language: "text" },
      { path: "s_client-api.txt", content: apiSClient, language: "text" },
      { path: "s_client-portal.txt", content: portalSClient, language: "text" },
    ],
  },
  successCriteria: [
    "Each of the three services is matched to its actual certificate failure",
    "The expiry date and the missing SAN name are read correctly from the evidence",
    "The chain-of-trust checks are put in order",
    "The explanation rejects verify=False and names the correct fix for each problem",
  ],
  hints: [
    "In each s_client file, find the `verify error:num=...` lines and the `depth=` they belong to. Depth 0 is the server's own certificate.",
    "reports: compare `NotAfter` with the `date -u` at the top of the file. api: compare the hostname the client used with the `Subject Alternative Name` list.",
    "portal: count the certificates in the `Certificate chain` section. Which certificate does the client need to get from depth 0 to the root in its trust store, and who should send it?",
    "Fixes: reports → renew and deploy a new leaf; api → reissue with `DNS:api.lumen.internal` in the SAN (or have clients use a listed name); portal → configure nginx with the full chain file. None of them involve disabling verification.",
  ],
  questions: [
    {
      id: "classify-reports",
      kind: "mcq",
      prompt: "What is wrong with reports.lumen.internal's TLS setup?",
      options: [
        "The root CA isn't trusted by the client",
        "The leaf certificate expired on 3 November 2026; the chain and name are fine",
        "The hostname isn't in the certificate",
        "The server doesn't send its intermediate certificate",
      ],
      answer: 1,
      explanation:
        "Depth 2 and depth 1 verify; depth 0 fails with `num=10:certificate has expired` and `notAfter=Nov  3 23:59:59 2026 GMT`, two days before the capture. The server owner must renew and deploy a new certificate.",
    },
    {
      id: "expiry-date",
      kind: "short",
      prompt: "On what date (UTC) did the reports.lumen.internal certificate stop being valid? Answer as YYYY-MM-DD.",
      accept: ["2026-11-03", "2026-11-04"],
      acceptPatterns: ["^2026-11-0[34]$", "^(nov(ember)?\\s+3(rd)?,?\\s+2026|3\\s+nov(ember)?\\s+2026)$"],
      placeholder: "YYYY-MM-DD",
      explanation: "NotAfter is Nov 3 23:59:59 2026 GMT — valid through the end of 3 November, invalid from 4 November 00:00 UTC.",
    },
    {
      id: "classify-api",
      kind: "mcq",
      prompt: "Why does Marco's job fail against `https://api.lumen.internal:8443/`, and what is the right fix?",
      options: [
        "The certificate is expired; renew it",
        "api.lumen.internal is not in the certificate's SAN list (only tracking-api and api-01 are); reissue the certificate with DNS:api.lumen.internal, or call a name that is listed",
        "The chain is incomplete; add the intermediate",
        "TLS 1.3 isn't supported by Python; set verify=False",
      ],
      answer: 1,
      explanation:
        "The chain verifies and the dates are current. `num=62:hostname mismatch`: the SAN contains tracking-api.lumen.internal and api-01.lumen.internal, but the client connected to api.lumen.internal. Both names resolve to the same IP, which is why the mismatch went unnoticed.",
    },
    {
      id: "order-chain-checks",
      kind: "order",
      prompt: "Order what happens when a client verifies a server certificate during the TLS handshake.",
      items: [
        "Server sends its leaf certificate and any intermediate certificates",
        "Client checks the leaf's signature using the intermediate CA's public key",
        "Client checks the intermediate's signature against a root CA already in its trust store",
        "Client checks the validity dates and that the hostname appears in the leaf's SAN list",
        "Handshake completes and encrypted HTTP requests begin",
      ],
      explanation:
        "The client builds the chain from what the server sent up to a root it already trusts, then checks dates and the name, and only then sends application data. Real implementations interleave some checks, but every one must pass before HTTP starts.",
    },
    {
      id: "explain-portal-and-verify-false",
      kind: "explain",
      prompt: "For Sam: explain why the portal works in browsers but fails in curl, what the fix is, and why Marco's `verify=False` is not acceptable.",
      concepts: [
        { label: "Portal server sends only the leaf; intermediate missing from the chain", anyOf: ["intermediate", "chain", "leaf only", "only the leaf", "issuing ca", "full chain", "fullchain", "incomplete"] },
        { label: "Fix: configure nginx with the full chain", anyOf: ["fullchain", "full chain", "chain file", "ssl_certificate", "send the intermediate", "include the intermediate", "add the intermediate"] },
        { label: "verify=False disables authentication: impostors / man-in-the-middle", anyOf: ["man-in-the-middle", "man in the middle", "mitm", "impostor", "imposter", "anyone", "authenticat", "disables verification", "turns off verification", "no verification", "intercept", "spoof"] },
        { label: "Browsers fill in/cached the intermediate", anyOf: ["browser", "cached", "cache", "aia", "fetch", "fill in", "fills in"] },
      ],
      minConcepts: 3,
      explanation:
        "Browsers often patch an incomplete chain by fetching or caching intermediates; curl and most libraries don't. Verification is what makes TLS authenticate the server.",
      modelAnswer:
        "The portal's nginx is configured with the leaf certificate only, so the server never sends the Lumen Issuing CA 01 intermediate; the chain is incomplete. Browsers often fill in the intermediate from a cache or by fetching it via AIA, but curl and the uptime checker only have the root and can't build the chain. The fix is to point ssl_certificate at the fullchain file (leaf plus intermediate) and reload nginx. Marco's verify=False is not acceptable because it disables verification entirely: the job would accept any certificate, so anyone able to intercept the traffic could impersonate the API (a man-in-the-middle). His real fix is reissuing the API certificate with api.lumen.internal in the SAN.",
    },
  ],
  debrief: {
    solution: `| Service | Evidence | Cause | Owner and fix |
| --- | --- | --- | --- |
| reports.lumen.internal | depth=0 \`num=10: certificate has expired\`, NotAfter Nov 3 2026 | Leaf expired | Server owner: renew, deploy, reload nginx; add expiry monitoring |
| api.lumen.internal:8443 | depth=0 \`num=62: hostname mismatch\`; SAN = tracking-api, api-01 | Name not in SAN | PKI/API owner: reissue with \`DNS:api.lumen.internal\` (or clients use a listed name) |
| portal.lumen.internal | only depth 0 in chain; \`num=20\`/\`num=21\` | Intermediate not sent | Web-01 owner: \`ssl_certificate\` → fullchain file |

All three chains end at the same trusted root, so no client trust stores need changing. \`verify=False\` would "fix" the API symptom by removing authentication — the traffic would still be encrypted, but to whoever answers.`,
    commonMistakes: [
      "Calling every verification failure \"expired certificate\" without reading which depth failed and with which error number.",
      "Adding the intermediate CA to every client's trust store instead of fixing the server to send the full chain.",
      "Trusting the CN instead of the SAN list when checking names; modern clients ignore the CN.",
      "Using `curl -k` / `verify=False` as a temporary fix that quietly becomes permanent.",
    ],
    realWorld:
      "Expired certificates remain one of the most common causes of outages, which is why ACME automation (Let's Encrypt, internal step-ca) and expiry monitoring (Blackbox exporter `probe_ssl_earliest_cert_expiry`) are standard. Incomplete chains are classic \"works in Chrome, fails in curl/Java/Python\" bugs. For internal services, an internal CA with short-lived certificates and SANs generated from service discovery prevents the hostname mismatch class entirely.",
  },
  review: [
    {
      id: "net-tls-error-meaning",
      skill: "net.tls",
      variants: [
        {
          id: "net-tls-error-meaning-a",
          kind: "mcq",
          prompt: "`openssl s_client` reports `verify error:num=62:hostname mismatch` at depth 0. What do you check?",
          options: ["The certificate's NotAfter date", "Whether the hostname you used is in the leaf's Subject Alternative Name list", "Whether the root CA is installed", "The server's cipher list"],
          answer: 1,
          explanation: "Error 62 means the name doesn't match any SAN entry of the leaf certificate.",
        },
        {
          id: "net-tls-error-meaning-b",
          kind: "mcq",
          prompt: "curl says `unable to get local issuer certificate` while browsers show a padlock. What's the most likely cause?",
          options: ["The certificate expired", "The server isn't sending its intermediate certificate", "DNS returns the wrong IP", "The server uses TLS 1.3"],
          answer: 1,
          explanation: "Browsers often fetch or cache missing intermediates; curl doesn't, so it can't build the chain to a trusted root.",
        },
        {
          id: "net-tls-error-meaning-c",
          kind: "mcq",
          prompt: "`Verify return code: 10 (certificate has expired)` appears for depth 1, not depth 0. Who must act?",
          options: ["The client's user", "The CA/PKI team: the intermediate CA certificate expired (the server must then serve a renewed chain)", "Nobody; depth 1 doesn't matter", "The DNS team"],
          answer: 1,
          explanation: "Depth 1 is the intermediate. Every certificate in the chain must be within its validity period.",
        },
      ],
    },
    {
      id: "net-tls-verify-off",
      skill: "net.tls",
      variants: [
        {
          id: "net-tls-verify-off-a",
          kind: "mcq",
          prompt: "What does `curl -k` (or `verify=False`) actually change?",
          options: [
            "It turns off encryption",
            "It keeps encryption but skips checking who the server is, so an impostor's certificate would be accepted",
            "It uses a different CA",
            "It only skips the expiry check",
          ],
          answer: 1,
          explanation: "The connection is still encrypted, but authentication — the part that stops man-in-the-middle attacks — is gone.",
        },
        {
          id: "net-tls-verify-off-b",
          kind: "mcq",
          prompt: "Which component is *never* sent by the server during a normal TLS handshake?",
          options: ["The leaf certificate", "The intermediate certificate", "The root CA certificate the client must already trust", "The server's public key"],
          answer: 2,
          explanation: "Trust comes from roots the client already has; a root sent by the server proves nothing.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "A new internal service `labels.lumen.internal` is moved behind a load balancer reachable as `labels-lb.lumen.internal`. After the move, clients using the old name work, but the new health check against `https://labels-lb.lumen.internal/healthz` fails with `certificate verify failed: Hostname mismatch`. The certificate's SAN is `DNS:labels.lumen.internal`.",
    question: {
      id: "transfer-lb-san",
      kind: "mcq",
      prompt: "What is the right fix?",
      options: [
        "Disable verification in the health check",
        "Reissue the certificate with both DNS:labels.lumen.internal and DNS:labels-lb.lumen.internal (or point the check at labels.lumen.internal)",
        "Add the root CA to the load balancer",
        "Renew the certificate with a later expiry",
      ],
      answer: 1,
      explanation: "The name the client uses must be in the SAN list. Either add the new name or use one that's already listed.",
    },
  },
  refresher: {
    body: `A certificate says "this public key belongs to **these names**, from **this date** to **that date**", signed by a CA. A client trusts it only if the **chain** leads to a root it already trusts, the **dates** are current, and the **hostname** is in the SAN list.

\`openssl s_client -connect host:443 -servername host -verify_hostname host\` shows which certificate (depth) failed and why. Fix the certificate or the server's chain; don't turn off verification.`,
    practice: {
      id: "refresher-depth-zero",
      kind: "mcq",
      prompt: "In `openssl s_client` output, what is `depth=0`?",
      options: ["The root CA", "The intermediate CA", "The server's own (leaf) certificate", "The client certificate"],
      answer: 2,
      explanation: "Depth 0 is the leaf the server presents; higher depths walk up the chain towards the root.",
    },
  },
};
