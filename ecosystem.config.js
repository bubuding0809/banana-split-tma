module.exports = {
  apps: [
    {
      name: "banana-split-dev",
      script: "pnpm",
      args: "dev:tunnel",
      cwd: "/home/team_aidmi_ai/code/personal/banana-split-tma",
      env: {
        NODE_ENV: "development",
      },
      log_date_format: "YYYY-MM-DD HH:mm Z"
    }
  ]
};
