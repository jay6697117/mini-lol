#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";

const roots = ["assets/maps", "assets/sprites"];
const force = process.argv.includes("--force");
const pngs = [];

const walk = (dir) => {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.isFile() && extname(path).toLowerCase() === ".png" && path.split(/[\\/]/).includes("final")) pngs.push(path);
  }
};

for (const root of roots) walk(root);

const targets = pngs.map((source) => ({ source, output: source.replace(/\.png$/i, ".webp") }));
const pending = targets.filter(({ output }) => force || !existsSync(output));
const totalBytes = pngs.reduce((sum, path) => sum + statSync(path).size, 0);
const largest = [...pngs]
  .sort((a, b) => statSync(b).size - statSync(a).size)
  .slice(0, 10)
  .map((path) => `${(statSync(path).size / 1024 / 1024).toFixed(2)} MB  ${path}`);

console.log(`Runtime PNG assets: ${pngs.length}, ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
console.log("Largest runtime PNG assets:\n" + largest.join("\n"));

if (pending.length === 0) {
  console.log("All runtime WebP mirrors exist.");
  process.exit(0);
}

const cwebp = spawnSync("cwebp", ["-version"], { encoding: "utf8" });
if (cwebp.error || cwebp.status !== 0) {
  console.error(`Missing ${pending.length} WebP mirrors, and cwebp is not available.`);
  console.error("Install cwebp locally or commit generated .webp files before deploying.");
  process.exit(1);
}

let converted = 0;
for (const { source, output } of pending) {
  const result = spawnSync("cwebp", ["-quiet", "-lossless", "-z", "9", source, "-o", output], { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    console.error(`Failed to convert ${source}`);
    if (result.stderr) console.error(result.stderr);
    process.exit(result.status || 1);
  }
  converted += 1;
}

const outputBytes = targets.reduce((sum, { output }) => sum + (existsSync(output) ? statSync(output).size : 0), 0);
console.log(`Converted ${converted} runtime PNG assets to lossless WebP.`);
console.log(`Runtime WebP mirrors: ${(outputBytes / 1024 / 1024).toFixed(2)} MB`);
console.log(`Output directory example: ${relative(process.cwd(), dirname(targets[0]?.output ?? "assets"))}`);
