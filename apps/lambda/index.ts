import app from "./api";
import serverless from 'serverless-http';

// Create handler for AWS Lambda
export const handler = serverless(app);


