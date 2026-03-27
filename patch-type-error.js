const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "packages", "trpc", "src", "trpc.ts");
let code = fs.readFileSync(file, "utf8");

code = code.replace(
  "let parsedInitData: ReturnType<typeof parseInitData> | null = null;",
  "let parsedInitData: any | null = null;"
);

fs.writeFileSync(file, code);
