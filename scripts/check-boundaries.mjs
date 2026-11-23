#!/usr/bin/env node
/**
 * NFR-030 — Package Boundary Enforcement Linter
 * Verifies directed acyclic dependencies across packages/* and apps/*.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const rules = {
  "@uoai/shared-types": [],
  "@uoai/api-protocol": ["@uoai/shared-types"],
  "@uoai/model-registry": ["@uoai/shared-types", "@uoai/api-protocol"],
  "@uoai/model-storage": ["@uoai/shared-types", "@uoai/model-registry"],
  "@uoai/model-adapters": ["@uoai/shared-types", "@uoai/model-registry"],
  "@uoai/inference-core": [
    "@uoai/shared-types",
    "@uoai/api-protocol",
    "@uoai/model-adapters",
    "@uoai/model-storage",
    "@uoai/model-registry"
  ],
  "@uoai/browser-bridge": ["@uoai/shared-types", "@uoai/api-protocol"],
  "@uoai/sdk": ["@uoai/shared-types", "@uoai/api-protocol", "@uoai/browser-bridge"],
  "@uoai/ui": ["@uoai/shared-types", "@uoai/api-protocol"],
  "@uoai/web": [
    "@uoai/shared-types",
    "@uoai/api-protocol",
    "@uoai/model-registry",
    "@uoai/browser-bridge",
    "@uoai/sdk",
    "@uoai/ui"
  ],
  "@uoai/extension": [
    "@uoai/shared-types",
    "@uoai/api-protocol",
    "@uoai/model-registry",
    "@uoai/model-storage",
    "@uoai/model-adapters",
    "@uoai/inference-core",
    "@uoai/browser-bridge",
    "@uoai/ui"
  ],
  "@uoai/demo": ["@uoai/sdk", "@uoai/shared-types", "@uoai/api-protocol"]
};

const workspaceDirs = [
  ...fs.readdirSync(path.join(root, "packages")).map((d) => path.join(root, "packages", d)),
  ...fs.readdirSync(path.join(root, "apps")).map((d) => path.join(root, "apps", d))
];

const violations = [];

for (const dir of workspaceDirs) {
  const pkgPath = path.join(dir, "package.json");
  if (!fs.existsSync(pkgPath)) continue;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  const allowed = new Set(rules[pkg.name] ?? []);
  const deps = {
    ...(pkg.dependencies ?? {}),
    ...(pkg.peerDependencies ?? {})
  };
  for (const dep of Object.keys(deps)) {
    if (dep.startsWith("@uoai/") && !allowed.has(dep)) {
      violations.push(`${pkg.name} has forbidden dependency on ${dep}`);
    }
  }

  // Also scan source files for forbidden @uoai/* imports
  const srcDir = path.join(dir, "src");
  if (fs.existsSync(srcDir)) {
    const walk = (d) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx|js|mjs)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
          const text = fs.readFileSync(full, "utf-8");
          const matches = text.matchAll(/from\s+["'](@uoai\/[a-z0-9-]+)(?:\/[^"']*)?["']/g);
          for (const m of matches) {
            if (!allowed.has(m[1]) && m[1] !== pkg.name) {
              violations.push(
                `${pkg.name} (${path.relative(root, full)}) imports forbidden package ${m[1]}`
              );
            }
          }
        }
      }
    };
    walk(srcDir);
  }
}

if (violations.length > 0) {
  console.error("Boundary check FAILED:\n" + violations.map((v) => `  - ${v}`).join("\n"));
  process.exit(1);
}
console.log(`Boundary check PASSED across ${workspaceDirs.length} workspaces (0 violations).`);
