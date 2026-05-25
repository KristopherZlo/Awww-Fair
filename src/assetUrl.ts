export function appAssetUrl(name: string, base = import.meta.env.BASE_URL): string {
  const assetName = name.replace(/^\/+/, "");
  const assetBase = base === "." || base === "./" ? "" : base || "/";
  const normalizedBase = assetBase ? (assetBase.endsWith("/") ? assetBase : `${assetBase}/`) : "";

  return `${normalizedBase}assets/${assetName}`;
}
