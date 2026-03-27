const fs = require("fs");
let code = fs.readFileSync("apps/bot/src/features/user.ts", "utf8");

code = code.replace(
  /chatId: BigInt\(groupIdStr\)/,
  "chatId: Number(groupIdStr)"
);
code = code.replace(
  /userId: BigInt\(user\.user_id\)/,
  "userId: Number(user.user_id)"
);

fs.writeFileSync("apps/bot/src/features/user.ts", code);
