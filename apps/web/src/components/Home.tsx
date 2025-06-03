import { trpc } from "../utils/trpc";

const Home = () => {
  // const { data: users, status, error } = trpc.hello.users.useQuery();
  const { data: helloWorld } = trpc.hello.helloWorld.useQuery();
  const { data: workItems } = trpc.hello.workItems.useQuery();

  // if (status === "pending") {
  //   return <div>Loading...</div>;
  // }

  // if (status === "error") {
  //   return <div>Error: {error?.message}</div>;
  // }

  return (
    <div>
      <div>
        <h1>{helloWorld?.greeting}</h1>
      </div>
      <div>
        <h2>Work Items</h2>
        {workItems?.map((item) => (
          <div key={item.id}>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
          </div>
        ))}
      </div>
      {/* {users.map((user) => (
        <pre key={user.id}>{JSON.stringify(user, null, 2)}</pre>
      ))} */}
    </div>
  );
};

export default Home;
