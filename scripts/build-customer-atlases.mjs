import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicAssets = join(root, "public", "assets");
const publicCustomerDir = join(publicAssets, "customers");
const sourceCustomerDir = join(root, "source-assets", "customers");
const customerDir128 = join(publicAssets, "customers-128");
const customerDir256 = publicCustomerDir;

const customers = [
  "child",
  "student",
  "tourist",
  "grandma",
  "office_worker",
  "athlete",
  "family",
  "gourmet",
  "driver",
  "blogger",
  "schoolkid",
  "sweet_tooth",
  "farmer",
  "rich",
  "rushing",
  "vacationer"
];

function runMagick(args) {
  const result = spawnSync("magick", args, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`magick ${args.join(" ")} failed`);
  }
}

function ensureSourceCopies() {
  mkdirSync(sourceCustomerDir, { recursive: true });
  const existingSources = existsSync(sourceCustomerDir) ? readdirSync(sourceCustomerDir).filter((file) => file.endsWith(".png")) : [];
  if (existingSources.length >= customers.length) {
    return;
  }

  for (const id of customers) {
    const source = join(publicCustomerDir, `${id}.png`);
    const backup = join(sourceCustomerDir, `${id}.png`);
    if (!existsSync(backup)) {
      copyFileSync(source, backup);
    }
  }
}

function resizeCustomers(size, outputDir) {
  mkdirSync(outputDir, { recursive: true });
  for (const id of customers) {
    runMagick([
      join(sourceCustomerDir, `${id}.png`),
      "-colorspace",
      "sRGB",
      "-filter",
      "Lanczos",
      "-define",
      "filter:blur=1.05",
      "-resize",
      `${size}x${size}!`,
      "-strip",
      join(outputDir, `${id}.png`)
    ]);
  }
}

ensureSourceCopies();
resizeCustomers(256, customerDir256);
resizeCustomers(128, customerDir128);
