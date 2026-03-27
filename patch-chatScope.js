const fs = require("fs");
const path = require("path");

const file = path.join(
  __dirname,
  "packages",
  "trpc",
  "src",
  "middleware",
  "chatScope.ts"
);
let code = fs.readFileSync(file, "utf8");

code = code.replace(
  "user?: { id: bigint | number; [key: string]: any } | null;",
  "user?: { id: bigint | number; [key: string]: any } | null;\n  parsedInitData?: any | null;"
);

fs.writeFileSync(file, code);
