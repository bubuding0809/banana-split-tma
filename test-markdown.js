const BOT_TOKEN = "8007524617:AAH7wQ-53FKL6DYnd1hUFIZOpnrBs1lKpKc";

function escapeMarkdownV2(text) {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

const USAGE_GUIDE = `*Track Personal Expenses*: Send me a direct message\\! For example:
\`\`\`
15 USD Lunch
\`\`\`
\`\`\`
30000 JPY Japanese whiskey
\`\`\` \\(Currency\\)
\`\`\`
12 Grab ride yesterday
\`\`\` \\(Simple Date\\)
\`\`\`
500 dinner last saturday
\`\`\` \\(Relative Date\\)
\`\`\`
200 beer, 2 days ago
\`\`\` \\(Complex Date via comma\\)

*Commands:*
\\- \`/list\`: See your history
\\- \`/stats\`: See your spending summary

*Group Expenses:*
1\\. *Add me to a group chat*: Click the "Add to group" button below or go to your group chat and add me as a member\\.
2\\. *Start the bot*: Use the \`/start@{bot_username}\` command in the group chat to kick things off\\.
3\\. *Get your friends to join*: Have them open the mini\\-app in the group chat to split expenses\\.

🚀 Happy tracking and splitting\\! 🍌🍌🍌`;

const usageGuide = USAGE_GUIDE.replace(
  "{bot_username}",
  () => escapeMarkdownV2("Banana_Splitz_Bot") // with underscores!
);

const START_MESSAGE_PRIVATE = `Welcome to Banana Splitz, {first_name}\\! 🎉

Say goodbye to awkward bill\\-splitting and hello to hassle\\-free group expenses\\! 

How to use me?
{usage_guide}`;

const messageText = START_MESSAGE_PRIVATE.replace("{first_name}", () =>
  escapeMarkdownV2("John")
).replace("{usage_guide}", () => usageGuide);

const deepLinkUrl = `https://t.me/Banana_Splitz_Bot?startgroup=true`;
const keyboard = {
  inline_keyboard: [[{ text: "➕ Add to Group", url: deepLinkUrl }]],
};

async function test() {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: 12345678,
      text: messageText,
      parse_mode: "MarkdownV2",
      reply_markup: keyboard,
    }),
  });
  const data = await res.json();
  console.log(data);
}

test();
