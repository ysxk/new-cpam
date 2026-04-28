import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const filePath = resolve(import.meta.dirname ?? ".", "../dist/index.html");
const content = readFileSync(filePath, "utf-8");
const hash = createHash("sha256").update(content).digest("hex");

console.log(`sha256:${hash}`);
