// Run a command with WIKI_KIT=1 (the component gallery on), on any OS: node scripts/with-kit.mjs astro dev
import { spawnSync } from "node:child_process";

const [cmd, ...args] = process.argv.slice(2);
const r = spawnSync(cmd, args, { stdio: "inherit", shell: true, env: { ...process.env, WIKI_KIT: "1" } });
process.exit(r.status ?? 1);
