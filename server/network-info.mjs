import os from "node:os";

function isIpv4(details) {
  return details?.family === "IPv4" || details?.family === 4;
}

export function isLanAddress(details) {
  if (!details || !isIpv4(details) || details.internal) {
    return false;
  }

  const address = details.address;
  return typeof address === "string" && !address.startsWith("169.254.");
}

export function lanAddresses(networkInterfaces = os.networkInterfaces()) {
  const addresses = new Set();

  for (const entries of Object.values(networkInterfaces)) {
    for (const details of entries ?? []) {
      if (isLanAddress(details)) {
        addresses.add(details.address);
      }
    }
  }

  return [...addresses].sort((left, right) => left.localeCompare(right));
}

export function lanUrls(port, options = {}) {
  const protocol = options.protocol ?? "http";
  const path = options.path ? `/${String(options.path).replace(/^\/+/, "")}` : "";

  return lanAddresses(options.networkInterfaces).map((address) => `${protocol}://${address}:${port}${path}`);
}
