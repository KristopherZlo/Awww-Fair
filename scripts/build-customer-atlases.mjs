import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
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

function buildAtlas(size, inputDir, outputFile) {
  const files = customers.map((id) => join(inputDir, `${id}.png`));
  runMagick([
    "montage",
    ...files,
    "-background",
    "none",
    "-tile",
    "4x4",
    "-geometry",
    `${size}x${size}+0+0`,
    "-strip",
    outputFile
  ]);
}

function identify(file) {
  const result = spawnSync("magick", ["identify", "-format", "%wx%h %b", file], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`identify failed for ${file}`);
  }
  return `${basename(file)} ${result.stdout}`;
}

ensureSourceCopies();
resizeCustomers(256, customerDir256);
resizeCustomers(128, customerDir128);

const atlas128 = join(publicAssets, "customer-atlas-128.png");
const atlas256 = join(publicAssets, "customer-atlas-256.png");
const legacyAtlas = join(publicAssets, "customer-atlas.png");

buildAtlas(128, customerDir128, atlas128);
buildAtlas(256, customerDir256, atlas256);
copyFileSync(atlas256, legacyAtlas);

console.log(identify(atlas128));
console.log(identify(atlas256));
console.log(identify(legacyAtlas));
