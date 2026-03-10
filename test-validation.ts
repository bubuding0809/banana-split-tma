import { validate } from "@telegram-apps/init-data-node";
try {
  validate(
    "user=%7B%22id%22%3A259941064%2C%22first_name%22%3A%22Ruoqian%22%2C%22last_name%22%3A%22Ding%22%2C%22username%22%3A%22bubuding0809%22%2C%22language_code%22%3A%22en%22%2C%22is_premium%22%3Atrue%2C%22allows_write_to_pm%22%3Atrue%2C%22photo_url%22%3A%22https%3A%5C%2F%5C%2Ft.me%5C%2Fi%5C%2Fuserpic%5C%2F320%5C%2FzXFYvVWY9zSiz55otm8gnoqWhBi7XjK6JuxeB1bFtDk.svg%22%7D&chat_instance=-1230913039364498940&chat_type=private&start_param=eyJjaGF0X2lkIjogLTEwMDIzNzE4NDI1MjMsICJjaGF0X3R5cGUiOiAic3VwZXJncm91cCJ9&auth_date=1773122248&signature=Gd83DFMT8oKGKZl1ifTUZsRd4JOznUHeN82zMVb5VUDXSfi-brxonxwnsmmEUp55rLQLDi1Gu_jt_UgCDVoTCg&hash=383f2283612f962d87fefa953cac62d51ab997e8c04e43549329e73de78b10a9",
    "8007524617:AAH7wQ-53FKL6DYnd1hUFIZOpnrBs1lKpKc"
  );
  console.log("Validation success");
} catch (e) {
  console.error("Validation failed", e);
}
