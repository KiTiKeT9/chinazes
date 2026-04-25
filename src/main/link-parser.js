// Parse vless:// and vmess:// share links into an Xray outbound object.
// Returns { outbound, meta } on success or throws.

function base64DecodeUtf8(str) {
  // Add padding
  const padded = str + '==='.slice(0, (4 - (str.length % 4)) % 4);
  // Support URL-safe base64 too
  const normalized = padded.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function parseVmess(link) {
  const body = link.replace(/^vmess:\/\//, '').trim();
  let decoded;
  try {
    decoded = JSON.parse(base64DecodeUtf8(body));
  } catch (e) {
    throw new Error('Invalid VMess link: malformed base64/JSON');
  }

  const {
    add: address,
    port,
    id,
    aid = 0,
    net = 'tcp',
    type = 'none',
    host = '',
    path = '',
    tls = '',
    sni = '',
    ps = 'VMess',
    scy = 'auto',
  } = decoded;

  if (!address || !port || !id) {
    throw new Error('VMess link is missing address/port/id');
  }

  const streamSettings = buildStreamSettings({
    network: net,
    security: tls ? 'tls' : 'none',
    sni: sni || host || address,
    host,
    path,
    headerType: type,
  });

  return {
    meta: { protocol: 'vmess', name: ps, address, port: Number(port), network: net, security: tls ? 'tls' : 'none' },
    outbound: {
      tag: 'proxy',
      protocol: 'vmess',
      settings: {
        vnext: [
          {
            address,
            port: Number(port),
            users: [
              {
                id,
                alterId: Number(aid) || 0,
                security: scy || 'auto',
              },
            ],
          },
        ],
      },
      streamSettings,
    },
  };
}

function parseVless(link) {
  const url = new URL(link);
  const id = decodeURIComponent(url.username);
  const address = url.hostname;
  const port = Number(url.port);
  if (!id || !address || !port) {
    throw new Error('VLESS link is missing uuid/address/port');
  }

  const params = url.searchParams;
  const type = params.get('type') || 'tcp';
  const security = params.get('security') || 'none';
  const sni = params.get('sni') || params.get('host') || address;
  const path = params.get('path') || '';
  const host = params.get('host') || '';
  const headerType = params.get('headerType') || 'none';
  const flow = params.get('flow') || '';
  const pbk = params.get('pbk') || '';
  const sid = params.get('sid') || '';
  const fp = params.get('fp') || '';
  const alpn = params.get('alpn') || '';
  const name = decodeURIComponent(url.hash.replace(/^#/, '')) || 'VLESS';

  const streamSettings = buildStreamSettings({
    network: type,
    security,
    sni,
    host,
    path,
    headerType,
    pbk,
    sid,
    fp,
    alpn,
  });

  return {
    meta: { protocol: 'vless', name, address, port, network: type, security },
    outbound: {
      tag: 'proxy',
      protocol: 'vless',
      settings: {
        vnext: [
          {
            address,
            port,
            users: [
              {
                id,
                encryption: 'none',
                flow: flow || '',
              },
            ],
          },
        ],
      },
      streamSettings,
    },
  };
}

function buildStreamSettings({
  network,
  security,
  sni,
  host,
  path,
  headerType,
  pbk,
  sid,
  fp,
  alpn,
}) {
  const ss = { network, security };

  if (security === 'tls') {
    ss.tlsSettings = {
      serverName: sni || '',
      allowInsecure: false,
    };
    if (fp) ss.tlsSettings.fingerprint = fp;
    if (alpn) ss.tlsSettings.alpn = alpn.split(',').map((s) => s.trim()).filter(Boolean);
  } else if (security === 'reality') {
    ss.realitySettings = {
      serverName: sni || '',
      fingerprint: fp || 'chrome',
      publicKey: pbk || '',
      shortId: sid || '',
      spiderX: '',
    };
  }

  switch (network) {
    case 'ws':
      ss.wsSettings = {
        path: path || '/',
        headers: host ? { Host: host } : {},
      };
      break;
    case 'grpc':
      ss.grpcSettings = {
        serviceName: path || '',
      };
      break;
    case 'h2':
    case 'http':
      ss.httpSettings = {
        path: path || '/',
        host: host ? host.split(',').map((h) => h.trim()) : [],
      };
      break;
    case 'tcp':
    default:
      if (headerType === 'http') {
        ss.tcpSettings = {
          header: {
            type: 'http',
            request: {
              path: path ? [path] : ['/'],
              headers: host ? { Host: host.split(',').map((h) => h.trim()) } : {},
            },
          },
        };
      }
      break;
  }

  return ss;
}

// ---------- Trojan ----------

function parseTrojan(link) {
  const url = new URL(link);
  const password = decodeURIComponent(url.username);
  const address = url.hostname;
  const port = Number(url.port);
  if (!password || !address || !port) {
    throw new Error('Trojan link is missing password/address/port');
  }
  const p = url.searchParams;
  const type = p.get('type') || 'tcp';
  const security = p.get('security') || 'tls';
  const sni = p.get('sni') || p.get('host') || address;
  const path = p.get('path') || '';
  const host = p.get('host') || '';
  const headerType = p.get('headerType') || 'none';
  const fp = p.get('fp') || '';
  const alpn = p.get('alpn') || '';
  const name = decodeURIComponent(url.hash.replace(/^#/, '')) || 'Trojan';

  return {
    meta: { protocol: 'trojan', name, address, port },
    outbound: {
      tag: 'proxy',
      protocol: 'trojan',
      settings: { servers: [{ address, port, password }] },
      streamSettings: buildStreamSettings({
        network: type, security, sni, host, path, headerType, fp, alpn,
      }),
    },
  };
}

// ---------- Shadowsocks ----------

function parseShadowsocks(link) {
  // ss://method:password@host:port#name   OR   ss://base64(method:password)@host:port#name
  // OR fully base64: ss://base64(method:password@host:port)
  let rest = link.replace(/^ss:\/\//, '');
  const hashIdx = rest.indexOf('#');
  let name = 'Shadowsocks';
  if (hashIdx !== -1) {
    name = decodeURIComponent(rest.slice(hashIdx + 1));
    rest = rest.slice(0, hashIdx);
  }

  let method, password, address, port;
  const atIdx = rest.indexOf('@');
  try {
    if (atIdx === -1) {
      const decoded = base64DecodeUtf8(rest);
      const m = decoded.match(/^([^:]+):(.+)@([^:]+):(\d+)$/);
      if (!m) throw new Error('bad');
      [, method, password, address, port] = m;
    } else {
      const creds = rest.slice(0, atIdx);
      const tail = rest.slice(atIdx + 1);
      let decodedCreds = creds;
      if (!creds.includes(':')) decodedCreds = base64DecodeUtf8(creds);
      const [m, ...pwParts] = decodedCreds.split(':');
      method = m;
      password = pwParts.join(':');
      const tailUrl = new URL('http://' + tail);
      address = tailUrl.hostname;
      port = tailUrl.port;
    }
  } catch {
    throw new Error('Invalid Shadowsocks link');
  }

  if (!method || !password || !address || !port) {
    throw new Error('Shadowsocks link is missing fields');
  }
  return {
    meta: { protocol: 'ss', name, address, port: Number(port) },
    outbound: {
      tag: 'proxy',
      protocol: 'shadowsocks',
      settings: {
        servers: [{ address, port: Number(port), method, password }],
      },
    },
  };
}

// ---------- Hysteria2 ----------

function parseHysteria2(link) {
  // hysteria2://password@host:port/?sni=...&insecure=0#name   (also hy2://)
  const normalized = link.replace(/^hy2:\/\//, 'hysteria2://');
  const url = new URL(normalized);
  const password = decodeURIComponent(url.username) || decodeURIComponent(url.password);
  const address = url.hostname;
  const port = Number(url.port);
  if (!password || !address || !port) {
    throw new Error('Hysteria2 link is missing password/address/port');
  }
  const sni = url.searchParams.get('sni') || address;
  const insecure = url.searchParams.get('insecure') === '1';
  const name = decodeURIComponent(url.hash.replace(/^#/, '')) || 'Hysteria2';

  return {
    meta: { protocol: 'hysteria2', name, address, port },
    outbound: {
      tag: 'proxy',
      protocol: 'hysteria2',
      settings: {
        servers: [{ address, port, password }],
      },
      streamSettings: {
        network: 'udp',
        security: 'tls',
        tlsSettings: { serverName: sni, allowInsecure: insecure },
      },
    },
  };
}

// ---------- Dispatcher ----------

function parseShareLink(link) {
  const trimmed = (link || '').trim();
  if (!trimmed) throw new Error('Empty link');
  if (trimmed.startsWith('vmess://'))     return parseVmess(trimmed);
  if (trimmed.startsWith('vless://'))     return parseVless(trimmed);
  if (trimmed.startsWith('trojan://'))    return parseTrojan(trimmed);
  if (trimmed.startsWith('ss://'))        return parseShadowsocks(trimmed);
  if (trimmed.startsWith('hysteria2://') || trimmed.startsWith('hy2://')) {
    return parseHysteria2(trimmed);
  }
  throw new Error('Unsupported link format. Use vless/vmess/trojan/ss/hysteria2://');
}

// ---------- Subscription fetcher ----------

// Build a list of mirror URLs for a given subscription URL.
// GitHub raw is often blocked/throttled in some regions; jsdelivr CDN and
// statically.io usually work as fallbacks.
function buildMirrors(url) {
  const mirrors = [url];
  // raw.githubusercontent.com/<user>/<repo>/<branch>/<path>
  const m = url.match(/^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/);
  if (m) {
    const [, user, repo, branch, file] = m;
    mirrors.push(`https://cdn.jsdelivr.net/gh/${user}/${repo}@${branch}/${file}`);
    mirrors.push(`https://cdn.statically.io/gh/${user}/${repo}/${branch}/${file}`);
    mirrors.push(`https://raw.fastgit.org/${user}/${repo}/${branch}/${file}`);
  }
  return mirrors;
}

async function fetchSubscription(url) {
  // Accepts a https?:// URL; follows redirects; body may be:
  //   - base64(plain text list of share links, one per line)
  //   - plain text list of share links
  //   - single share link
  //
  // Many panels check User-Agent; mimic v2rayN which is whitelisted widely.
  // Tries primary URL plus mirrors (jsdelivr/statically/fastgit) on failure.
  const urls = buildMirrors(url);
  let res = null;
  let lastErr = null;
  for (const u of urls) {
    try {
      const r = await fetch(u, {
        headers: {
          'User-Agent': 'v2rayN/6.31',
          'Accept': 'text/plain, */*',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(15_000),
      });
      if (r.ok) { res = r; break; }
      lastErr = new Error(`HTTP ${r.status} ${r.statusText}`);
    } catch (e) {
      lastErr = e;
    }
  }
  if (!res) {
    throw new Error(
      `Cannot reach subscription URL (tried ${urls.length} mirrors).\n` +
      `Last error: ${lastErr?.message || 'unknown'}\n` +
      `Tip: if the URL is like "https://server.example.com/" with no path — it is probably the VPN server itself, not a subscription. You need the raw vless://... link from your provider.`
    );
  }
  const body = (await res.text()).trim();

  let text = body;
  if (!/^(vless|vmess|trojan|ss|hysteria2|hy2):\/\//m.test(body)) {
    // Try base64
    try {
      text = base64DecodeUtf8(body.replace(/\s+/g, ''));
    } catch {
      /* keep original */
    }
  }

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => /^(vless|vmess|trojan|ss|hysteria2|hy2):\/\//.test(l));

  if (lines.length === 0) {
    throw new Error('No supported servers found in subscription');
  }

  const servers = [];
  for (const line of lines) {
    try {
      const parsed = parseShareLink(line);
      servers.push({ link: line, meta: parsed.meta });
    } catch (e) {
      // skip broken entries silently
    }
  }
  if (servers.length === 0) {
    throw new Error('Subscription has only unsupported/malformed entries');
  }
  return servers;
}

function isSubscriptionUrl(str) {
  const s = (str || '').trim();
  return /^https?:\/\//i.test(s);
}

module.exports = {
  parseShareLink,
  fetchSubscription,
  isSubscriptionUrl,
};
