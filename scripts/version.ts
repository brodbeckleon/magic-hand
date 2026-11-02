// The app version lives in package.json (tauri.conf.json points there) and src-tauri/Cargo.toml.
//   pnpm version:set 0.2.0     sets both (and Cargo.lock)
//   pnpm version:check v0.2.0  fails unless both match the tag (release workflow)
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const pkgPath = join(root, "package.json");
const cargoPath = join(root, "src-tauri", "Cargo.toml");
const lockPath = join(root, "src-tauri", "Cargo.lock");
// The [package] version: the first top-level `version = "..."` line.
const CARGO_VERSION = /^version = "([^"]+)"$/m;
const LOCK_ENTRY = /(\[\[package\]\]\nname = "magic-hand"\nversion = ")([^"]+)(")/;

const read = (p: string) => readFileSync(p, "utf8");
const versions = () => ({ pkg: JSON.parse(read(pkgPath)).version as string, cargo: read(cargoPath).match(CARGO_VERSION)?.[1] });

const [cmd, arg] = process.argv.slice(2);
if (cmd === "set" && arg && /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(arg)) {
  const pkg = JSON.parse(read(pkgPath));
  pkg.version = arg;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  writeFileSync(cargoPath, read(cargoPath).replace(CARGO_VERSION, `version = "${arg}"`));
  writeFileSync(lockPath, read(lockPath).replace(LOCK_ENTRY, `$1${arg}$3`));
  console.log(`version ${arg}: package.json, Cargo.toml, Cargo.lock`);
} else if (cmd === "check" && arg) {
  const want = arg.replace(/^v/, "");
  const { pkg, cargo } = versions();
  if (pkg !== want || cargo !== want) {
    console.error(`tag ${arg} does not match the version (package.json ${pkg}, Cargo.toml ${cargo}); run pnpm version:set ${want}`);
    process.exit(1);
  }
  console.log(`version ${want} matches`);
} else {
  console.error("usage: version.ts set <x.y.z> | check <tag>");
  process.exit(2);
}
