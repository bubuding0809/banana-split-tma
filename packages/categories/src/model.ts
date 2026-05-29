// Default Google model id used by both the bot's getAgentModel() and the
// inlined getModel() in @dko/trpc's category.suggest. Lives in @repo/categories
// (a no-cycle leaf) so any future bump propagates without the comment-as-spec
// drift that bit us when gemini-3.1-flash-lite-preview was retired.
export const DEFAULT_AGENT_MODEL = "gemini-3.1-flash-lite";
