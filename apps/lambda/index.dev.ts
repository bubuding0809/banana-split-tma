import app from "./api";

const PORT = process.env.PORT || 8081;

app.listen(PORT, () => {
  console.info("NODE_ENV:", process.env.NODE_ENV);
  console.info(`🚀 Server running on http://localhost:${PORT}`);
});
