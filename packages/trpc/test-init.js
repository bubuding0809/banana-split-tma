import { parse } from "@telegram-apps/init-data-node";
console.log(
  parse(
    "query_id=AAHdF6IQAAAAAN0XohD...&user=%7B%22id%22%3A279058397%2C%22first_name%22%3A%22Vladislav%22%2C%22last_name%22%3A%22Keleshev%22%2C%22username%22%3A%22vkeleshev%22%2C%22language_code%22%3A%22en%22%7D&auth_date=1622810100&hash=c501b71e775f74ce10e377dea85a7ea24ecd640b223ea86dfe453e0eaed2e2b2&chat_instance=123&chat_type=group&start_param=testing&signature=123"
  )
);
