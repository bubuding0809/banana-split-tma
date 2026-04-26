export const BotMessages = {
  ADD_MEMBER_SELECT_BUTTON: "👤 Select user(s)",
  ADD_MEMBER_CANCEL_BUTTON: "❌ Cancel",
  ADD_MEMBER_START_MESSAGE:
    "👥 Tap below to pick people to add to *{group_title}*\\.\n" +
    "You can choose up to 10 at once\\.",
  ADD_MEMBER_ACK: "Got it ✓",
  ADD_MEMBER_CANCELLED:
    "❌ Cancelled\\. You can start a new add from the app anytime\\.",
  ADD_MEMBER_NOT_A_MEMBER:
    "❌ You can only add members to groups you're a member of.",
  ADD_MEMBER_GROUP_SUMMARY:
    "✅ *Newly added* by {adder_mention}\n{member_list}",
  STATS_CHOOSE_PERIOD: "📊 Choose a period for statistics:",
  STATS_CANCELLED: "❌ Statistics cancelled\\.",
  ERROR_STATS_FAILED: "❌ Failed to generate statistics\\.",
  STATS_EMPTY: "No expenses recorded yet\\.",
  STATS_NO_EXPENSES_FOR_PERIOD: "No expenses recorded for *{period_name}*\\.",
  USAGE_GUIDE: `*Track Personal Expenses*: Send me a direct message\\! For example:
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

🚀 Happy tracking and splitting\\! 🍌🍌🍌`,

  HELP_MESSAGE: `Forgot how to use the bot? 🤣

Here's a quick guide to get you started:
{usage_guide}`,

  START_MESSAGE_PRIVATE: `Welcome to Banana Splitz, {first_name}\\! 🎉

Say goodbye to awkward bill\\-splitting and hello to hassle\\-free group expenses\\! 

How to use me?
{usage_guide}`,

  ERROR_INVALID_EXPENSE_FORMAT: `❌ *I didn't quite get that*

If you're trying to record an expense, please use this format:
\`15 USD Lunch\`

To talk to my AI agent or ask questions, use:
\`/ask <your message>\``,

  START_MESSAGE_EXISTING: `Welcome back to Banana Splitz, {first_name}\\! 🌟 We're thrilled to see you again, here is how to use me\\.
{usage_guide}`,

  START_MESSAGE_GROUP: `Let's split expenses together\\!

*👇 Everyone, open the app to get started*
`,

  START_MESSAGE_GROUP_REGISTER: `🎉 You are all set!

Learn more about me using /help

or

◀︎ Return to the app by swiping back`,

  START_LOADER_MESSAGE: `⏳ Starting the bot...`,

  SUCCESS_OPERATION_CANCELLED: `Current operation cancelled.`,
  ERROR_USER_CHECK_FAILED: `⚠️ Something went wrong checking user, please try again.`,
  ERROR_USER_CREATE_FAILED: `⚠️ Something went wrong creating user, please try again.`,

  PIN_MESSAGE: "🤑 Split your expense leh 🤑",
  PIN_MANUAL_INSTRUCTION:
    "📌 Pin this for quick access, or make me admin and run /pin@{bot_username} again to pin automatically",

  ERROR_TOPIC_ONLY: "⚠️ This command can only be used in a topic.",
  SUCCESS_TOPIC_SET:
    "✅ Topic set successfully! I will now use this topic for all messages.",
  ERROR_TOPIC_SET_FAILED: "⚠️ Failed to set topic. Please try again later.",

  ERROR_SUMMARY_GROUP_ONLY:
    "⚠️ The 'summary' command can only be used in group chats.",
  SUMMARY_IN_PROGRESS: "⏳ Generating summary ...",
  SUMMARY_NO_MESSAGE: "💬 {reason}",
  ERROR_SUMMARY_FAILED:
    "⚠️ Failed to generate summary. Please try again later.",

  ERROR_CHASE_PRIVATE_ONLY:
    "⚠️ The 'chase' command is only available in your private chat with the bot",
  CHASE_CHOOSE_USER_BUTTON: "Choose user",
  CHASE_SELECT_USER: "Select user",
  CHASE_REMINDER: "🤬💩REMINDER: FUCKING PAY BACK {from_username} LEH",
  SUCCESS_CHASE_SENT: "✅ Successfully reminded {username} to pay up!",

  LIST_CHOOSE_PERIOD: "Choose a period",
  LIST_CANCELLED: "Cancelled\\.",
  LIST_EMPTY:
    "No expenses recorded yet\\. Send a message like `12.50 Lunch` to get started\\!",
  LIST_NO_EXPENSES_FOR_PERIOD: "No expenses found for *{period_name}*\\.",
  ERROR_LIST_FAILED: "⚠️ Failed to fetch expenses. Please try again.",

  BALANCE_HEADER: "*Current Balances*:",
  BALANCE_USER_TEMPLATE:
    "🔵 *{user_mention}* • [🧾𝔹𝕣𝕖𝕒𝕜𝕕𝕠𝕨𝕟🧾]({deep_link_url})\\n> Owes Bubu $10\\n> Owes Shawnn $20\\n",

  EXPENSE_CREATED:
    "🧾 Expense Recorded\n\n> 📝 • {description}\n{category_line}> 📅 • {date_label}\n\nTotal: {currency} {amount}",
  EXPENSE_PARSE_HINT:
    "💡 To log a personal expense, send a message like:\n" +
    "  `12.50 Lunch`\n" +
    "  `Grab ride 8.90`\n" +
    "  `Coffee 5`\n" +
    "  `15 Dinner yesterday`\n" +
    "  `500 dinner last saturday`\n" +
    "  `25.50 Movie tickets, 2 days ago`",
  ERROR_EXPENSE_CREATE_FAILED: "⚠️ Failed to record expense. Please try again.",
  ERROR_EXPENSE_NOT_REGISTERED:
    "⚠️ You need to /start the bot first before logging expenses.",
  EXPENSE_DELETED: "🗑 *Expense deleted\\.*",
  ERROR_EXPENSE_DELETE_FAILED:
    "⚠️ Failed to delete expense. It may have already been removed.",
};

export const GROUP_JOIN_MESSAGE =
  "🎉 Hello friends, I am here to help your split your expenses!";
export const MIGRATION_MESSAGE_GROUP = `
🔄 *Group Upgraded\\!*

This group has been upgraded to a supergroup\\. The old app button no longer works\\.

*👇 Use this button to access Banana Splitz*
`;
export const GROUP_INSTRUCTION = `
To use me:
1\\. Use /pin to get a persistent button for the app\\.
2\\. Pin that message to the top of the chat\\.
`;
