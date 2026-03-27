const fs = require("fs");
const path = require("path");

const trpcPath = path.join(__dirname, "packages", "trpc", "src", "trpc.ts");
let code = fs.readFileSync(trpcPath, "utf8");

// Add parsedInitData to the variables
code = code.replace(
  "let chatId: bigint | null = null;",
  "let chatId: bigint | null = null;\n  let parsedInitData: ReturnType<typeof parseInitData> | null = null;"
);

// Populate parsedInitData
code = code.replace(
  "validateInitData(parts[1], botToken);\n              user = parseInitData(parts[1]).user ?? null;",
  "validateInitData(parts[1], botToken);\n              parsedInitData = parseInitData(parts[1]);\n              user = parsedInitData.user ?? null;"
);

code = code.replace(
  "validateInitData(initData, botToken);\n\n      user = parseInitData(initData).user ?? null;",
  "validateInitData(initData, botToken);\n\n      parsedInitData = parseInitData(initData);\n      user = parsedInitData.user ?? null;"
);

// Add to session
code = code.replace(
  "chatId,\n      },",
  "chatId,\n        parsedInitData,\n      },"
);

fs.writeFileSync(trpcPath, code);
