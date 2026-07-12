function normalizeIp(value) {
  if (!value) return "";
  let ip = String(value).trim().toLowerCase();
  if (ip.startsWith("::ffff:")) ip = ip.slice("::ffff:".length);
  return ip.replace(/^\[|\]$/g, "");
}

function ipv4ToNumber(ip) {
  const parts = normalizeIp(ip).split(".");
  if (parts.length !== 4) return null;
  let out = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const octet = Number(part);
    if (octet < 0 || octet > 255) return null;
    out = (out << 8) + octet;
  }
  return out >>> 0;
}

function ipv4InCidr(ip, cidr) {
  const [range, prefixRaw] = String(cidr).trim().split("/");
  const ipNum = ipv4ToNumber(ip);
  const rangeNum = ipv4ToNumber(range);
  const prefix = Number(prefixRaw);
  if (
    ipNum === null ||
    rangeNum === null ||
    !Number.isInteger(prefix) ||
    prefix < 0 ||
    prefix > 32
  ) {
    return false;
  }
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipNum & mask) === (rangeNum & mask);
}

export function isTrustedApiPeer(request) {
  const realIp = request.headers.get("x-9r-real-ip");
  if (!realIp) return false;
  const cidrs = (process.env.TRUSTED_API_CIDRS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return cidrs.some((cidr) => ipv4InCidr(realIp, cidr));
}

export function shouldEnforceApiKey(settings, request) {
  return Boolean(settings?.requireApiKey) && !isTrustedApiPeer(request);
}
