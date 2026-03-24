export const BotMessages = {
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

  START_MESSAGE_EXISTING: `Welcome back to Banana Splitz, {first_name}\\! 🌟 We're thrilled to see you again, here is how to use me\\.
{usage_guide}`,

  START_MESSAGE_GROUP_REGISTER: `🎉 You are all set!

Learn more about me using /help

or

◀︎ Return to the app by swiping back`,

  START_LOADER_MESSAGE: `⏳ Starting the bot...`,

  SUCCESS_OPERATION_CANCELLED: `Current operation cancelled.`,
  ERROR_USER_CHECK_FAILED: `⚠️ Something went wrong checking user, please try again.`,
  ERROR_USER_CREATE_FAILED: `⚠️ Something went wrong creating user, please try again.`,
};
