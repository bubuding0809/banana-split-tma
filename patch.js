const fs = require("fs");
const path =
  "apps/web/src/components/features/Chat/MultiCurrencyBalanceModal.tsx";
let content = fs.readFileSync(path, "utf8");

// Replace title logic
content = content.replace(
  'const title = isDebtor ? "Send Reminders?" : `Settle Debts?`;',
  'const title = "Settle Debts?";'
);

// Replace mainButton text logic
content = content.replace(
  'text: isDebtor ? "Send Reminders ✅" : "Settle All ✅",',
  'text: "Settle All ✅",'
);

fs.writeFileSync(path, content);
