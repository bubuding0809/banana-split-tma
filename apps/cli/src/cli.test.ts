import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";

describe("CLI Help System", () => {
  it("should output concise global help", () => {
    const output = execSync("node dist/cli.js --help").toString();
    const parsed = JSON.parse(output);

    expect(parsed.name).toBe("banana");
    expect(parsed.agent_instructions).toBeDefined();
    expect(parsed.commands).toBeDefined();
    expect(parsed.commands.length).toBeGreaterThan(0);

    // Global help should not have detailed options for commands
    const createExpenseCmd = parsed.commands.find(
      (c: any) => c.name === "create-expense"
    );
    expect(createExpenseCmd.options).toBeUndefined();
  });

  it("should output detailed command-specific help", () => {
    const output = execSync(
      "node dist/cli.js create-expense --help"
    ).toString();
    const parsed = JSON.parse(output);

    expect(parsed.command).toBe("create-expense");
    expect(parsed.agentGuidance).toBeDefined();
    expect(parsed.examples).toBeDefined();
    expect(parsed.options).toBeDefined();

    // Check for required flags
    const amountOpt = parsed.options.find((o: any) => o.name === "--amount");
    expect(amountOpt.required).toBe(true);
  });

  it("should support 'help <command>' syntax", () => {
    const output = execSync("node dist/cli.js help create-expense").toString();
    const parsed = JSON.parse(output);

    expect(parsed.command).toBe("create-expense");
    expect(parsed.options).toBeDefined();
  });
});
